// U35 claim check, chunk K3: the message on "Assign" (and "Notify"): the predefined-message list, what
// is sent, the email, the task and discussion it opens (all three apps; OMP Internal Review; OPS "Assign Editor").
// Spec: docs/specs/U35-stage-participants.md — Rule 5 (179–201), Side effects "On a message sent from
// Assign or Notify" (308–330), register A3, A6, OMP1, OPS2.
//
// One scratch context per app. Users: mgr manager · se sectionEditor (assigned on every submission) ·
//   sea..sei sectionEditor (Assign targets) · nt1, nt2 sectionEditor (Notifications-tab axis) · au author
//   (submitter) · OJS/OMP: ce, ce2 copyeditor · le layoutEditor · ix indexer.
// Submissions (se assigned on each): S Submission stage (OPS: Production) · R Review round (OJS/OMP) ·
//   I Internal Review (OMP) · C Copyediting via accept (OJS/OMP) · P Production · T (template settings).
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U35/K3/k3.js
//   PHASES=seed,lists,prefs,send,review,ir,copy,prod,recv,tpl (default all; state in .reports/U35/ccK3/k3-state-<app>.json,
//   so a phase re-run reuses the seed)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'lists', 'prefs', 'send', 'review', 'ir', 'copy', 'prod', 'prod2', 'rdisc', 'recv', 'tpl'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

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

// Notices and toasts that vanish: a MutationObserver logs every added node matching a notice phrase.
const NOTICE_WATCH = () => {
    window.__k3n = [];
    const re = /stage assignment has been changed|added as a stage participant|Notification sent|Please ensure|required|not saved|error|Error|saved/i;
    const start = Date.now();
    const obs = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
            const el = n.nodeType === 1 ? n : n.parentElement;
            if (!el) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (!t || t.length > 400 || !re.test(t)) continue;
            const cls = el.className && typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 2).join('.') : '';
            window.__k3n.push({ms: Date.now() - start, at: Date.now(), text: t.replace(/\s+/g, ' ').slice(0, 200), el: `${el.tagName.toLowerCase()}.${cls}`});
        }
    });
    const go = () => obs.observe(document.documentElement, {childList: true, subtree: true});
    if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
};
const noticesSince = (page, t0) => page.evaluate((t) => (window.__k3n || []).filter((x) => x.at >= t).map((x) => ({text: x.text, el: x.el, afterPressMs: x.at - t})), t0).catch(() => []);
const nowIn = (page) => page.evaluate(() => Date.now()).catch(() => Date.now());

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const dialogTexts = (page) => page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        role: d.getAttribute('role'),
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 4000),
    }))).catch(() => []);

const panelRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
    if (!h) return {present: false};
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
    const items = box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((s) => s.trim()).filter(Boolean).join('/')) : [];
    return {present: true, items};
});
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
// The stage's notice box: every level-3 heading "Notification" (and the press's "Awaiting approval.") with the text after it.
const noticeRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    return [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis)
        .filter((h) => /Notification|Awaiting|Assign a/i.test(h.textContent))
        .map((h) => ({h: h.textContent.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : (h.parentElement ? h.parentElement.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null)}));
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const L = {
        se: isOMP ? 'Series editor' : isOPS ? 'Moderator' : 'Section editor',
        stageS: isOPS ? 'workflow_5' : 'workflow_1',
        discS: isOPS ? 'Discussion (Production)' : 'Discussion (Submission)',
        stageNameS: isOPS ? 'Production' : 'Submission',
    };

    // ---- seeding -------------------------------------------------------------------------------
    if (on('seed') && !sc.ctx) {
        const t = tag('u35k3');
        const U = (k, roles, g, f) => ({username: `${t}${k}`, roles, givenName: g, familyName: f});
        const users = [U('mgr', ['manager'], 'Mira', 'Manager'), U('au', ['author'], 'Ava', 'Author'),
            U('se', ['sectionEditor'], 'Sam', 'Section'),
            U('sea', ['sectionEditor'], 'Ann', 'Aeditor'), U('seb', ['sectionEditor'], 'Ben', 'Beditor'),
            U('sec', ['sectionEditor'], 'Cat', 'Ceditor'), U('sed', ['sectionEditor'], 'Dan', 'Deditor'),
            U('sef', ['sectionEditor'], 'Eve', 'Feditor'), U('seg', ['sectionEditor'], 'Gus', 'Geditor'),
            U('seh', ['sectionEditor'], 'Hal', 'Heditor'), U('sei', ['sectionEditor'], 'Ida', 'Ieditor'),
            U('nt1', ['sectionEditor'], 'Nora', 'Noenable'), U('nt2', ['sectionEditor'], 'Ned', 'Noemail')];
        if (!isOPS) {
            users.push(U('ce', ['copyeditor'], 'Cora', 'Copy'), U('ce2', ['copyeditor'], 'Cody', 'Copytwo'),
                U('le', ['layoutEditor'], 'Leo', 'Layout'), U('ix', ['indexer'], 'Ian', 'Indexer'));
        }
        const ctx = await app.api.createContext({tag: t, context: {name: `U35 K3 ${t}`, contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.ctx = ctx.path || t; sc.t = t;
        sc.u = Object.fromEntries(users.map((x) => [x.username.slice(t.length), {username: x.username, name: `${x.givenName} ${x.familyName}`}]));
        save();
        const P = [{username: `${t}se`, role: 'sectionEditor'}];
        const mk = async (key, title, decisionsList, extra) => {
            let lastErr = null;
            for (const decisions of decisionsList) {
                try {
                    const body = {tag: `${t}${key.toLowerCase()}`, context: sc.ctx, submitter: `${t}au`, title: `${title} ${t}`, participants: P, ...(extra || {})};
                    if (decisions.length) body.decisions = decisions;
                    const s = await app.api.createSubmission(body);
                    sc[key] = {id: s.submissionId, stage: s.stageId, rounds: s.reviewRounds, title: body.title};
                    save();
                    log(`[seed] ${key} #${s.submissionId} stage ${s.stageId} rounds ${JSON.stringify(s.reviewRounds)}`);
                    return;
                } catch (e) { lastErr = e; log(`[seed ${key} try ${JSON.stringify(decisions)}]`, String(e.message).slice(0, 300)); }
            }
            sc[`${key}err`] = String(lastErr && lastErr.message).slice(0, 600); save();
        };
        await mk('S', 'K3 message', [[]]);
        await mk('T', 'K3 templates', [[]]);
        if (isOPS) {
            await mk('P', 'K3 production', [[]]);
        } else {
            await mk('R', 'K3 review', [['sendExternalReview']]);
            if (isOMP) await mk('I', 'K3 internal', [['sendInternalReview']]);
            await mk('C', 'K3 copyediting', [['sendExternalReview', 'accept']]);
            await mk('P', 'K3 production', [['skipExternalReview', 'sendToProduction']]);
        }
        record('seed', sc);
    }
    if (!sc.ctx) { log('[k3] no context; run the seed phase'); return; }
    const t = sc.t;
    const u = sc.u;
    const ctxUrl = (p) => app.url(`/index.php/${sc.ctx}${p}`);
    const wfUrl = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
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
    const as = async (page, k) => { await signIn(page, u[k].username, {contextPath: sc.ctx}); await idle(page); };
    async function openWf(page, id, key, label) {
        await page.goto(wfUrl(id, key)); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const panel = await panelRead(page).catch((e) => ({error: String(e.message)}));
        const disc = await discussionsRead(page).catch(() => null);
        const notice = await noticeRead(page).catch(() => null);
        await snap(page, label, {panel, discussions: disc, notice});
        log(`[${label}]`, JSON.stringify(panel.items || panel), '| disc', JSON.stringify(disc && disc.rows), '| notice', JSON.stringify(notice));
        return {panel, disc, notice};
    }
    const moreBtn = (page, k) => wf(page).getByRole('button', {name: `${u[k].name} More Actions`, exact: true});

    async function msgId(win) { return win.locator('textarea[name="message"]').getAttribute('id').catch(() => null); }
    async function readMsg(page, win) {
        const id = await msgId(win);
        if (!id) return null;
        return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : document.getElementById(i).value), id).catch(() => null);
    }
    async function readMsgHtml(page, win) {
        const id = await msgId(win);
        if (!id) return null;
        return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : document.getElementById(i).value), id).catch(() => null);
    }
    // After a template choice: wait until the message box's text is the same across two reads (the body arrives by AJAX).
    async function settledMsg(page, win, before) {
        let last = null; let same = 0;
        for (let i = 0; i < 20; i++) {
            await sleep(300);
            const m = await readMsg(page, win);
            if (m === last && m !== before) { if (++same >= 2) return m; } else same = 0;
            last = m;
        }
        return last;
    }
    async function typeMessage(page, win, text) {
        const id = await msgId(win);
        if (!id) return {typed: false};
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 20000}).catch(() => {});
        const body = page.frameLocator(`#${id}_ifr`).locator('body');
        await body.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        if (text) await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, content: await readMsg(page, win)};
    }
    const readOptions = (win) => win.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected}))).catch(() => null);
    async function chooseTemplate(page, win, text) {
        const opts = await readOptions(win);
        const o = (opts || []).find((x) => x.text === text);
        if (!o) return {missing: text};
        const before = await readMsg(page, win);
        await win.locator('select[name="template"]').selectOption(o.value);
        await idle(page);
        return {chosen: text, message: await settledMsg(page, win, before)};
    }

    // "Assign": role, search, person; then the template/message moves; OK or Cancel.
    const assignWin = (page) => page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
    async function openAssign(page) {
        await page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true}).click();
        const win = assignWin(page);
        await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
        await win.locator('textarea[name="message"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
        await idle(page);
        return win;
    }
    async function pickPerson(page, win, role, k) {
        await win.locator('select[name="filterUserGroupId"]').selectOption({label: role});
        await idle(page);
        await win.getByRole('textbox', {name: 'Search User By Name'}).fill(u[k].username);
        await win.getByRole('button', {name: 'Search', exact: true}).click();
        await idle(page);
        await win.getByRole('row').filter({hasText: u[k].name}).locator('input[name="userId"]').check();
        await idle(page);
    }
    async function relandIfOpen(page, win) {
        if (await win.isVisible().catch(() => false)) {
            dialogAnswer = 'accept';
            const c = win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first();
            if (await c.count()) await c.click().catch(() => {}); else await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
            await win.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        }
        await page.goto(page.url()); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function assign(page, label, {role, k, template, message, clear}) {
        const win = await openAssign(page);
        await pickPerson(page, win, role, k);
        const out = {role, person: u[k].name, options: await readOptions(win)};
        if (template) out.template = await chooseTemplate(page, win, template);
        if (clear) out.cleared = await typeMessage(page, win, '');
        if (message !== undefined) out.typed = await typeMessage(page, win, message);
        out.messageAtOk = await readMsg(page, win);
        out.messageHtmlAtOk = flat(await readMsgHtml(page, win), 1500);
        await snap(page, `${label}-assign-filled`, {assign: out});
        const t0 = await nowIn(page);
        const resp = page.waitForResponse((r) => /saveParticipant|save-participant/i.test(r.url()), {timeout: 20000}).catch(() => null);
        await win.getByRole('button', {name: 'OK', exact: true}).click();
        const r = await resp;
        out.saveStatus = r ? r.status() : null;
        await win.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await sleep(1500); await idle(page);
        out.notices = await noticesSince(page, t0);
        out.windowStillOpen = await win.isVisible().catch(() => false);
        if (out.windowStillOpen) {
            out.windowText = flat(await win.innerText().catch(() => ''), 1500);
            await snap(page, `${label}-assign-still-open`, {assign: out});
            await relandIfOpen(page, win);
        }
        out.panel = await panelRead(page).catch(() => null);
        out.discussions = await discussionsRead(page).catch(() => null);
        out.notice = await noticeRead(page).catch(() => null);
        await snap(page, `${label}-assign-after`, {assign: out});
        log(`[${label} assign]`, JSON.stringify({status: out.saveStatus, still: out.windowStillOpen, tpl: out.template, msg: flat(out.messageAtOk, 120), notices: out.notices.map((x) => x.text), rows: out.panel && out.panel.items, disc: out.discussions && out.discussions.rows, notice: out.notice}));
        record(`${label}-assign`, out);
        return out;
    }
    // "Notify" on a row.
    const notifyWin = (page) => page.getByRole('dialog').filter({has: page.locator('form select[name="template"]')}).filter({hasNotText: 'Locate a User'}).last();
    async function openNotify(page, k) {
        await moreBtn(page, k).first().click();
        await page.locator('[role="menuitem"]').first().waitFor({timeout: 10000}).catch(() => {});
        const items = await menuItems(page);
        const it = page.getByRole('menuitem', {name: 'Notify', exact: true});
        if (!(await it.count())) { await moreBtn(page, k).first().click().catch(() => {}); return {items, win: null}; }
        await it.click();
        const win = notifyWin(page);
        await win.waitFor({timeout: 30000});
        await win.locator('textarea[name="message"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
        await idle(page);
        return {items, win};
    }
    async function notify(page, label, {k, template, message, clear}) {
        const {items, win} = await openNotify(page, k);
        if (!win) { record(`${label}-notify`, {notifyOffered: false, menu: items}); return {notifyOffered: false}; }
        const out = {menu: items, options: await readOptions(win)};
        if (template) out.template = await chooseTemplate(page, win, template);
        if (clear) out.cleared = await typeMessage(page, win, '');
        if (message !== undefined) out.typed = await typeMessage(page, win, message);
        out.messageAtNotify = await readMsg(page, win);
        await snap(page, `${label}-notify-filled`, {notify: out});
        const t0 = await nowIn(page);
        const resp = page.waitForResponse((r) => /sendNotification|send-notification/i.test(r.url()), {timeout: 15000}).catch(() => null);
        await win.locator('form').getByRole('button', {name: 'Notify', exact: true}).click();
        const r = await resp;
        out.sendStatus = r ? r.status() : null;
        if (r) out.sendAnswer = flat(await r.text().catch(() => ''), 300);
        await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(1500); await idle(page);
        out.notices = await noticesSince(page, t0);
        out.windowStillOpen = await win.isVisible().catch(() => false);
        if (out.windowStillOpen) {
            out.windowText = flat(await win.innerText().catch(() => ''), 1200);
            await snap(page, `${label}-notify-still-open`, {notify: out});
            dialogAnswer = 'accept';
            await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
            await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await relandIfOpen(page, win);
        }
        out.discussions = await discussionsRead(page).catch(() => null);
        out.notice = await noticeRead(page).catch(() => null);
        await snap(page, `${label}-notify-after`, {notify: out});
        log(`[${label} notify]`, JSON.stringify({status: out.sendStatus, still: out.windowStillOpen, tpl: out.template, notices: out.notices.map((x) => x.text), disc: out.discussions && out.discussions.rows, notice: out.notice}));
        record(`${label}-notify`, out);
        return out;
    }
    // The predefined-message list of a window as data: every option, the text each one puts in "Message",
    // the replace axis (text typed first, then a template; then the blank entry again).
    async function readList(page, win, label, {person, eachText = true} = {}) {
        const out = {optionsAtOpen: await readOptions(win), messageAtOpen: await readMsg(page, win)};
        if (person) { await pickPerson(page, win, person.role, person.k); out.optionsAfterPerson = await readOptions(win); }
        const lbl = await win.evaluate((d) => { const s = d.querySelector('select[name="template"]'); if (!s) return null; const l = (s.id && d.querySelector(`label[for="${s.id}"]`)) || s.closest('.section, fieldset'); return l ? l.innerText.trim().replace(/\s+/g, ' ').slice(0, 200) : null; }).catch(() => null);
        out.listLabel = lbl;
        await snap(page, `${label}-open`, {list: out});
        await loc(page, `predefined-message list (${label})`, win.locator('select[name="template"]'));
        out.texts = {};
        if (eachText) {
            for (const o of (out.optionsAtOpen || []).filter((x) => x.value)) {
                const c = await chooseTemplate(page, win, o.text);
                out.texts[o.text] = {text: flat(c.message, 1500), html: flat(await readMsgHtml(page, win), 400)};
            }
        }
        const named = (out.optionsAtOpen || []).filter((x) => x.value);
        if (named.length) {
            out.replace = {typed: await typeMessage(page, win, `K3 typed first ${t}`)};
            out.replace.afterTemplate = flat((await chooseTemplate(page, win, named[0].text)).message, 300);
            const before = await readMsg(page, win);
            await win.locator('select[name="template"]').selectOption('');
            await idle(page); await sleep(1500);
            out.replace.afterBlankAgain = flat(await readMsg(page, win), 300);
            out.replace.blankAgainChanged = out.replace.afterBlankAgain !== flat(before, 300);
        }
        await snap(page, `${label}-after-choices`, {list: out});
        log(`[${label} list]`, JSON.stringify((out.optionsAtOpen || []).map((o) => o.text)), '| texts', JSON.stringify(Object.fromEntries(Object.entries(out.texts).map(([a, b]) => [a, flat(b.text, 60)]))), '| replace', JSON.stringify(out.replace));
        record(`${label}-list`, out);
        return out;
    }
    async function listAssign(page, label, person) {
        const win = await openAssign(page);
        const out = await readList(page, win, `${label}-assignlist`, {person});
        // leave with something changed: the Cancel link
        const n0 = dialogsSeen.length;
        const c = win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first();
        await c.click().catch(() => {});
        await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        out.leave = {closed: !(await win.isVisible().catch(() => false)), browserDialogs: dialogsSeen.slice(n0)};
        record(`${label}-assignlist-leave`, out.leave);
        await relandIfOpen(page, win);
        return out;
    }
    async function listNotify(page, label, k, {eachText = false} = {}) {
        const {items, win} = await openNotify(page, k);
        if (!win) { record(`${label}-notifylist`, {notifyOffered: false, menu: items}); log(`[${label}] no Notify`, JSON.stringify(items)); return null; }
        const out = await readList(page, win, `${label}-notifylist`, {eachText});
        out.menu = items;
        await relandIfOpen(page, win);
        return out;
    }
    async function activityLog(page, label) {
        const btn = wf(page).getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.split('$(function')[0].trim().replace(/\s+/g, ' ')))).catch(() => []);
        const tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
        await snap(page, label, {rows, tabs});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 14)).slice(0, 2400));
        await relandIfOpen(page, dlg);
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
        const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 400))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows).slice(0, 1500));
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return rows;
    }
    async function openDiscussion(page, name, label, nth = 0) {
        const dlg = wf(page);
        const all = dlg.getByRole('button', {name: new RegExp(name)}).or(dlg.getByRole('link', {name: new RegExp(name)}));
        const cnt = await all.count();
        if (!cnt) { record(label, {absent: name}); return null; }
        await all.nth(Math.min(nth, cnt - 1)).click();
        await sleep(1500); await idle(page);
        const s = await snap(page, label, {dialogs: (await dialogTexts(page)).slice(1).map((x) => ({name: x.name, text: flat(x.text, 2500)}))});
        await relandIfOpen(page, topWin(page));
        return s;
    }
    async function mailRead(k, contains, ms = 12000) {
        try {
            const m = await app.mail.find({to: mailOf(k), contains, timeoutMs: ms});
            const f = await app.mail.fullMessage(m.ID);
            const text = f.Text || '';
            return {subject: f.Subject, from: f.From, to: (f.To || []).map((x) => x.Address), text: flat(text, 2500), unsubscribeInHtml: /unsubscribe/i.test(f.HTML || ''), footerLink: app.mail.extractLink(f.HTML || '', /unsubscribe/i), listUnsubscribe: f.ListUnsubscribe || null};
        } catch (e) { return {none: String(e.message).slice(0, 160)}; }
    }
    const mailCount = (k, contains) => app.mail.count({to: mailOf(k), contains}).catch(() => null);

    // ---- lists: the predefined-message list on every stage, per level ------------------------------
    if (on('lists')) await sect('lists', async () => {
        const {page, close} = await session();
        try {
            const stages = [['S', L.stageS, L.stageNameS]];
            if (!isOPS) stages.push(['R', roundKey(sc.R), 'Review'], ['C', 'workflow_4', 'Copyediting'], ['P', 'workflow_5', 'Production']);
            if (isOMP) stages.push(['I', roundKey(sc.I), 'InternalReview']);
            for (const who of ['mgr', 'se']) {
                await as(page, who);
                for (const [key, wk, nm] of stages) {
                    await sect(`lists ${who} ${nm}`, async () => {
                        await openWf(page, sc[key].id, wk, `l-${who}-${nm}`);
                        await listAssign(page, `l-${who}-${nm}`, who === 'mgr' && nm === L.stageNameS ? {role: L.se, k: 'sei'} : null);
                        if (who === 'mgr' && (nm === 'InternalReview' || nm === 'Review' || nm === L.stageNameS)) await listNotify(page, `l-${who}-${nm}`, 'au');
                    });
                }
                await signOut(page);
            }
            // the assistant level (OJS/OMP): a copyeditor's and a layout editor's Notify list (assigned first by the manager)
            if (!isOPS) {
                await as(page, 'mgr');
                await openWf(page, sc.C.id, 'workflow_4', 'l-mgr-C-pre');
                const cHas = (await panelRead(page)).items.some((i) => i.includes(u.ce2.name));
                if (!cHas) await assign(page, 'l-mgr-ce2-plain', {role: 'Copyeditor', k: 'ce2'});
                await signOut(page);
                await as(page, 'ce2');
                await openWf(page, sc.C.id, 'workflow_4', 'l-ce2-Copyediting');
                await listNotify(page, 'l-ce2-Copyediting', 'se', {eachText: true});
                const aBtn = await page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true}).count();
                record('l-ce2-assign-button', {assignButtons: aBtn});
                await signOut(page);
            }
        } finally { await close(); }
    });

    // ---- prefs: the Notifications-tab axis (nt1 "Enable…" off, nt2 "Do not send me an email…" on) ---------
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
    if (on('prefs')) await sect('prefs', async () => {
        const {page, close} = await session();
        try {
            for (const [k, which] of [['nt1', 0], ['nt2', 1]]) {
                await as(page, k);
                await page.goto(ctxUrl('/user/profile/notificationSettings')); await idle(page);
                const before = await readPrefs(page);
                const row = before.filter((b) => /Discussion added/.test(b.row));
                await snap(page, `p-${k}-before`, {row});
                const target = row[which];
                if (target) {
                    const box = page.locator(`#${target.id}`);
                    if (which === 0) await box.uncheck(); else await box.check();
                    const resp = page.waitForResponse((r) => r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
                    await page.locator('form#notificationSettingsForm').getByRole('button', {name: 'Save', exact: true}).click();
                    const r = await resp;
                    await idle(page);
                    await page.goto(ctxUrl('/user/profile/notificationSettings')); await idle(page);
                    const after = (await readPrefs(page)).filter((b) => /Discussion added/.test(b.row));
                    await snap(page, `p-${k}-after`, {row: after, status: r && r.status()});
                    log(`[prefs ${k}]`, JSON.stringify(row), '→', JSON.stringify(after));
                } else log(`[prefs ${k}] no Discussion added row`, JSON.stringify(before.slice(0, 6)));
                await signOut(page);
            }
        } finally { await close(); }
    });

    // ---- send: on S as the manager: td6 (Assign Editor), td4 and its control, 5b's empty end, A3 on Notify, td7 ----
    if (on('send')) await sect('send', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const first = await openWf(page, sc.S.id, L.stageS, 's-mgr');
            const has = (k) => ((first.panel && first.panel.items) || []).some((i) => i.includes(u[k].name));
            if (!has('sea')) await sect('s a', () => assign(page, 's-mgr-sea-assigneditor', {role: L.se, k: 'sea', template: 'Assign Editor'}));
            if (!has('seb')) await sect('s b', () => assign(page, 's-mgr-seb-disc', {role: L.se, k: 'seb', template: L.discS, message: `K3 disc assign ${t}`}));
            if (!has('sec')) await sect('s c', () => assign(page, 's-mgr-sec-blank', {role: L.se, k: 'sec', message: `K3 blank assign ${t}`}));
            if (!has('sed')) await sect('s d', () => assign(page, 's-mgr-sed-emptied', {role: L.se, k: 'sed', template: L.discS, clear: true}));
            if (!has('nt1')) await sect('s nt1', () => assign(page, 's-mgr-nt1-disc', {role: L.se, k: 'nt1', template: L.discS, message: `K3 nt1 ${t}`}));
            if (!has('nt2')) await sect('s nt2', () => assign(page, 's-mgr-nt2-disc', {role: L.se, k: 'nt2', template: L.discS, message: `K3 nt2 ${t}`}));
            await sect('s notify blank', () => notify(page, 's-mgr-au-blank', {k: 'au', message: `K3 blank notify ${t}`}));
            await sect('s notify disc', () => notify(page, 's-mgr-au-disc', {k: 'au', template: L.discS, message: `K3 disc notify ${t}`}));
            await openWf(page, sc.S.id, L.stageS, 's-mgr-after');
            await sect('s disc window', () => openDiscussion(page, 'Assign Editor', 's-mgr-disc-assigneditor'));
            await sect('s disc window 2', () => openDiscussion(page, L.discS.replace(/[()]/g, '.'), 's-mgr-disc-first'));
            await sect('s log', () => activityLog(page, 's-mgr-log'));
            await signOut(page);
            // the Section Editor level sends too (the sender is whoever is signed in)
            await as(page, 'se');
            const se1 = await openWf(page, sc.S.id, L.stageS, 's-se');
            if (!((se1.panel.items || []).some((i) => i.includes(u.sef.name)))) await sect('s se f', () => assign(page, 's-se-sef-disc', {role: L.se, k: 'sef', template: L.discS, message: `K3 from se ${t}`}));
            await signOut(page);
            const mails = {
                sea: await mailRead('sea', t),
                seb: await mailRead('seb', `K3 disc assign ${t}`),
                sed: await mailRead('sed', t, 4000),
                au: await mailRead('au', `K3 disc notify ${t}`),
                sef: await mailRead('sef', `K3 from se ${t}`),
                nt1: await mailRead('nt1', t, 6000),
                nt2: await mailRead('nt2', t, 6000),
            };
            mails.counts = {secBlankAfterControl: await mailCount('sec', t), auBlank: await mailCount('au', `K3 blank notify ${t}`), sedAny: await mailCount('sed', t), seaAny: await mailCount('sea', t), nt1: await mailCount('nt1', t), nt2: await mailCount('nt2', t)};
            record('s-mail', mails);
            log('[s mail]', JSON.stringify(Object.fromEntries(Object.entries(mails).map(([k, v]) => [k, v && (v.subject || v.none || v)]))));
        } finally { await close(); }
    });

    // ---- review (OJS/OMP): "Assign Editor" on the review round ---------------------------------------
    if (on('review') && !isOPS) await sect('review', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const f = await openWf(page, sc.R.id, roundKey(sc.R), 'r-mgr');
            if (!(f.panel.items || []).some((i) => i.includes(u.seg.name))) await assign(page, 'r-mgr-seg-assigneditor', {role: L.se, k: 'seg', template: 'Assign Editor'});
            await signOut(page);
            record('r-mail', {seg: await mailRead('seg', t)});
        } finally { await close(); }
    });

    // ---- ir (OMP): Internal Review — the lists, a Notify with a typed message ---------------------------
    if (on('ir') && isOMP) await sect('ir', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.I.id, roundKey(sc.I), 'i-mgr');
            await notify(page, 'i-mgr-au-hello', {k: 'au', message: `K3 IR hello ${t}`});
            await openWf(page, sc.I.id, roundKey(sc.I), 'i-mgr-after');
            const f = await openWf(page, sc.I.id, roundKey(sc.I), 'i-mgr-before-assign');
            if (!(f.panel.items || []).some((i) => i.includes(u.sei.name))) await assign(page, 'i-mgr-sei-typed', {role: L.se, k: 'sei', message: `K3 IR assign ${t}`});
            await openWf(page, sc.I.id, roundKey(sc.I), 'i-mgr-after-assign');
            await activityLog(page, 'i-mgr-log');
            await signOut(page);
            record('i-mail', {au: await mailCount('au', `K3 IR hello ${t}`), sei: await mailCount('sei', `K3 IR assign ${t}`)});
        } finally { await close(); }
    });

    // ---- copy (OJS/OMP): as the assigned Section Editor on C — the notice box across a plain assignment and a message ----
    if (on('copy') && !isOPS) await sect('copy', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'se');
            const f = await openWf(page, sc.C.id, 'workflow_4', 'c-se-before');
            const has = (k) => (f.panel.items || []).some((i) => i.includes(u[k].name));
            if (!has('ce')) await assign(page, 'c-se-ce-plain', {role: 'Copyeditor', k: 'ce'});
            await openWf(page, sc.C.id, 'workflow_4', 'c-se-after-plain');
            await notify(page, 'c-se-ce-request', {k: 'ce', template: 'Request Copyedit'});
            await openWf(page, sc.C.id, 'workflow_4', 'c-se-after-request');
            await activityLog(page, 'c-se-log');
            await signOut(page);
            record('c-mail', {ce: await mailRead('ce', t), ce2: await mailRead('ce2', t, 4000)});
        } finally { await close(); }
    });

    // ---- prod: as the assigned Section Editor on P — the notice box, "Ready for Production", "Index Requested",
    //      "Assign Editor" (OPS2: empty), "Galleys Complete" --------------------------------------------------------
    if (on('prod')) await sect('prod', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'se');
            const f = await openWf(page, sc.P.id, 'workflow_5', 'p-se-before');
            const has = (k) => (f.panel.items || []).some((i) => i.includes(u[k].name));
            if (!isOPS) {
                if (!has('le')) await assign(page, 'p-se-le-plain', {role: 'Layout Editor', k: 'le'});
                await openWf(page, sc.P.id, 'workflow_5', 'p-se-after-plain');
                await notify(page, 'p-se-le-ready', {k: 'le', template: 'Ready for Production'});
                await openWf(page, sc.P.id, 'workflow_5', 'p-se-after-ready');
                if (isOMP && !has('ix')) await assign(page, 'p-se-ix-index', {role: 'Indexer', k: 'ix', template: 'Index Requested'});
                if (!has('seh')) await assign(page, 'p-se-seh-assigneditor', {role: L.se, k: 'seh', template: 'Assign Editor'});
                await openWf(page, sc.P.id, 'workflow_5', 'p-se-after-seh');
                await notify(page, 'p-se-seh-galleys', {k: 'seh', template: 'Galleys Complete'});
            } else {
                // OPS2: "Assign Editor" chosen first on a fresh window, then over typed text, then over the discussion text
                await sect('ops2 window', async () => {
                    const win = await openAssign(page);
                    await pickPerson(page, win, L.se, 'sei');
                    const o = {atOpen: await readMsg(page, win)};
                    o.first = await chooseTemplate(page, win, 'Assign Editor');
                    o.firstNow = await readMsg(page, win);
                    await snap(page, 'p-se-ops2-first', {ops2: o});
                    o.typed = await typeMessage(page, win, `K3 before AE ${t}`);
                    await chooseTemplate(page, win, 'Assign Editor');
                    o.afterTyped = await readMsg(page, win);
                    await chooseTemplate(page, win, 'Discussion (Production)');
                    o.discNow = await readMsg(page, win);
                    await chooseTemplate(page, win, 'Assign Editor');
                    o.afterDisc = await readMsg(page, win);
                    await snap(page, 'p-se-ops2-after', {ops2: o});
                    record('p-se-ops2', o);
                    log('[ops2]', JSON.stringify(o));
                    await relandIfOpen(page, win);
                });
                if (!has('seh')) await assign(page, 'p-se-seh-assigneditor-typed', {role: L.se, k: 'seh', template: 'Assign Editor', message: `K3 ops assign editor ${t}`});
                if (!has('seg')) await assign(page, 'p-se-seg-assigneditor-left', {role: L.se, k: 'seg', template: 'Assign Editor'});
            }
            await openWf(page, sc.P.id, 'workflow_5', 'p-se-after');
            await activityLog(page, 'p-se-log');
            await signOut(page);
            record('p-mail', {le: isOPS ? null : await mailRead('le', t), ix: isOMP ? await mailRead('ix', t) : null, seh: await mailRead('seh', t), seg: isOPS ? await mailCount('seg', t) : null});
        } finally { await close(); }
    });

    // ---- prod2 (OJS): a request message through "Assign" itself — "Ready for Production" to the Indexer ----
    if (on('prod2') && isOJS) await sect('prod2', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'se');
            const f = await openWf(page, sc.P.id, 'workflow_5', 'p2-se-before');
            if (!(f.panel.items || []).some((i) => i.includes(u.ix.name))) await assign(page, 'p2-se-ix-ready', {role: 'Indexer', k: 'ix', template: 'Ready for Production'});
            await signOut(page);
            await as(page, 'ix');
            await tasksPanel(page, 'v-ix-tasks');
            await signOut(page);
            record('p2-mail', {ix: await mailRead('ix', t)});
        } finally { await close(); }
    });

    // ---- rdisc (OJS/OMP): "Discussion (Review)" from the review round's Notify: its subject ------------------
    if (on('rdisc') && !isOPS) await sect('rdisc', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.R.id, roundKey(sc.R), 'rd-mgr');
            await notify(page, 'rd-mgr-au-discreview', {k: 'au', template: 'Discussion (Review)', message: `K3 review disc ${t}`});
            await signOut(page);
            record('rd-mail', {au: await mailRead('au', `K3 review disc ${t}`)});
        } finally { await close(); }
    });

    // ---- recv: each recipient's Tasks panel -----------------------------------------------------------------
    if (on('recv')) await sect('recv', async () => {
        const {page, close} = await session();
        try {
            const who = ['sea', 'seb', 'sec', 'sed', 'sef', 'nt1', 'nt2', 'au', 'seh'];
            if (!isOPS) who.push('seg', 'ce', 'ce2', 'le');
            if (isOMP) who.push('ix', 'sei');
            const out = {};
            for (const k of who) {
                await sect(`recv ${k}`, async () => { await as(page, k); out[k] = await tasksPanel(page, `v-${k}-tasks`); await signOut(page); });
            }
            record('v-tasks', out);
        } finally { await close(); }
    });

    // ---- tpl: Settings › Workflow › "Tasks and Discussions" — the list follows the settings: a task-type template,
    //      one restricted to the Author role, one restricted to the Section Editor role --------------------------------
    async function addTemplate(page, label, {stage, name, body, task, restrictTo}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: /Tasks and Discussions/}).first();
        await tab.click(); await idle(page);
        await page.waitForFunction((s) => document.body.innerText.includes(s), stage, {timeout: 15000}).catch(() => {});
        const tabRead = await snap(page, `${label}-tab`);
        if ((tabRead.text && tabRead.text.main || '').includes(name)) return {exists: true};
        await page.getByRole('row', {name: new RegExp(`^${stage} Stage`)}).getByRole('button', {name: 'Add template'}).click();
        const win = topWin(page);
        await win.getByRole('textbox', {name: /^Name/}).first().waitFor({timeout: 20000});
        await idle(page); await sleep(500);
        await win.getByRole('textbox', {name: /^Name/}).first().fill(name);
        if (restrictTo) {
            await win.getByRole('radio', {name: 'Limit access to specific roles'}).check();
            await sleep(300);
            await win.getByRole('checkbox', {name: restrictTo, exact: true}).check();
        }
        if (task) {
            await win.getByRole('checkbox', {name: 'Enter task information'}).check();
            await sleep(300);
            const sel = win.locator('select').first();
            if (await sel.count()) await sel.selectOption({index: 1}).catch(() => {});
        }
        const fr = win.frameLocator('iframe').first();
        await fr.locator('body').click();
        await page.keyboard.type(body);
        await sleep(300);
        const form = await snap(page, `${label}-form`, {fields: await win.locator('input:visible, select:visible').evaluateAll((els) => els.map((e) => ({name: e.name, type: e.type, checked: e.checked, value: (e.value || '').slice(0, 80), label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim().slice(0, 100)})))});
        const resp = page.waitForResponse((r) => /editTaskTemplates/.test(r.url()) && r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
        await win.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await sleep(1000); await idle(page);
        const out = {status: r && r.status(), answer: r ? flat(await r.text().catch(() => ''), 300) : null, stillOpen: await win.isVisible().catch(() => false)};
        await snap(page, `${label}-saved`, {out});
        log(`[${label} template]`, JSON.stringify(out));
        return out;
    }
    if (on('tpl')) await sect('tpl', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const stage = isOPS ? 'Production' : 'Submission';
            const au = 'Author';
            sc.tpl = sc.tpl || {};
            sc.tpl.task = await sect('tpl task', () => addTemplate(page, 't-task', {stage, name: `K3 Task ${t}`, body: `K3 task body ${t}`, task: true}));
            sc.tpl.au = await sect('tpl au', () => addTemplate(page, 't-au', {stage, name: `K3 AuthorOnly ${t}`, body: `K3 author-only body ${t}`, restrictTo: au}));
            sc.tpl.se = await sect('tpl se', () => addTemplate(page, 't-se', {stage, name: `K3 EditorOnly ${t}`, body: `K3 editor-only body ${t}`, restrictTo: L.se}));
            sc.tpl.open = await sect('tpl open', () => addTemplate(page, 't-open', {stage, name: `K3 Open ${t}`, body: `K3 open body ${t}`}));
            save();
            const wk = isOPS ? 'workflow_5' : 'workflow_1';
            await openWf(page, sc.T.id, wk, 't-mgr-T');
            await listAssign(page, 't-mgr-T', {role: L.se, k: 'seh'});
            // the recipient check: an Author-only message to a Section Editor, an Editor-only message to the Author
            const f = await openWf(page, sc.T.id, wk, 't-mgr-T2');
            if (!(f.panel.items || []).some((i) => i.includes(u.seg.name))) await assign(page, 't-mgr-seg-authoronly', {role: L.se, k: 'seg', template: `K3 AuthorOnly ${t}`, message: `K3 AO to editor ${t}`});
            await notify(page, 't-mgr-au-editoronly', {k: 'au', template: `K3 EditorOnly ${t}`, message: `K3 EO to author ${t}`});
            await notify(page, 't-mgr-au-authoronly', {k: 'au', template: `K3 AuthorOnly ${t}`, message: `K3 AO to author ${t}`});
            await notify(page, 't-mgr-au-open', {k: 'au', template: `K3 Open ${t}`, message: `K3 OPEN to author ${t}`});
            await openWf(page, sc.T.id, wk, 't-mgr-T-after');
            await activityLog(page, 't-mgr-log');
            await signOut(page);
            await as(page, 'se');
            await openWf(page, sc.T.id, wk, 't-se-T');
            await listAssign(page, 't-se-T', null);
            await listNotify(page, 't-se-T', 'au');
            await signOut(page);
            record('t-mail', {segAO: await mailCount('seg', `K3 AO to editor ${t}`), auEO: await mailCount('au', `K3 EO to author ${t}`), auAO: await mailRead('au', `K3 AO to author ${t}`, 3000), auOpen: await mailRead('au', `K3 OPEN to author ${t}`)});
        } finally { await close(); }
    });
});
