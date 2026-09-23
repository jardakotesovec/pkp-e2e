// U35 claim check, chunk K2: the "Assign Participant" window (all three apps).
// Spec: docs/specs/U35-stage-participants.md — Fields "Assign Participant" table (72–88), Rules 3–4 (151–178),
// Rules 6–7 (202–226), Side effects "On Assign" (297–307), register A4 (534–540).
//
// Context M (one per app): mgr, mgr2 managers; ed editor, pe productionEditor (OJS/OMP); ge guestEditor (OJS);
//   se, se2 sectionEditor; dual (sectionEditor + funding; OPS sectionEditor + author); endd (same two roles, the
//   Section editor role ended on screen in phase "ended"); ce, fc, tr, ds, ix, ly, pr, mk one per assistant role and
//   translator (OJS/OMP); vol, cha (OMP); au submitter, au2 second author; m01..m22 translators (OPS authors) for the
//   twenty-row page; rv (externalReviewer + funding + translator), rvd (externalReviewer + funding, declines), rvo
//   (externalReviewer only), rvi (OMP internalReviewer + funding).
// Submissions in M:
//   A   Submission (OPS Production): nobody        → window, roles, boxes, Search, stale list, twenty rows, 86, td5, td2
//   A2  Submission: se, dual(as SE)                → exclusion, "Assignments", the Section Editor level
//   A3  Submission: se                             → "Assignments" (second active)
//   P   published: se                              → "Assignments" (not counted)
//   N   Submission: nobody                         → side effects: non-editor assign, then SE (td1), tasks, Needs editor
//   PR  Production (OJS/OMP)                       → role list on Production
//   Rv  External Review: rv accepted, rvd declined → Rule 7 (double-anonymous), Submission tab too
//   RvC Copyediting after a review by rv           → Rule 7 other end (not in a review stage)
//   Ri  (OMP) Internal Review: rvi                 → Rule 7 on Internal Review
// Context VA (OJS/OMP, review mode "anonymous"), VO (OJS/OMP, "open"): rv reviewing → Rule 7 by review type.
// Context R (roles): Section editor recommend-only + no metadata edit, Journal editor recommend-only, Guest editor
//   and Author metadata edit on (OPS: Author off) → Rule 4 starting ticks, other end.
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U35/K2/k2.js
//   PHASES=seed,win,cancel,msg,side,levels,ended,rev,roles (default all; state in .reports/U35/ccK2/k2-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'win', 'cancel', 'leave', 'msg', 'side', 'levels', 'ended', 'rev', 'roles', 'mgrlevel'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

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

// Page notices (toasts) vanish before screen() reads: watch every added node (K4's watcher).
const NOTICE_WATCH = () => {
    window.__k2n = [];
    const re = /stage assignment has been changed|added as a stage participant|Notification sent|Please ensure|required|not saved|must select|error|Error|anonymous review/i;
    const obs = new MutationObserver((muts) => {
        for (const m of muts) for (const n of m.addedNodes) {
            const el = n.nodeType === 1 ? n : n.parentElement;
            if (!el) continue;
            const t = (el.innerText || el.textContent || '').trim();
            if (!t || t.length > 600 || !re.test(t)) continue;
            const chain = [];
            let p = el;
            for (let i = 0; p && i < 5; i++, p = p.parentElement) chain.push(`${p.tagName.toLowerCase()}${p.id ? '#' + p.id : ''}${p.getAttribute && p.getAttribute('role') ? '[role=' + p.getAttribute('role') + ']' : ''}${p.className && typeof p.className === 'string' ? '.' + p.className.split(/\s+/).slice(0, 3).join('.') : ''}`);
            window.__k2n.push({at: Date.now(), text: t.replace(/\s+/g, ' ').slice(0, 300), chain});
        }
    });
    const go = () => obs.observe(document.documentElement, {childList: true, subtree: true});
    if (document.documentElement) go(); else document.addEventListener('DOMContentLoaded', go);
};
const noticesSince = (page, t0) => page.evaluate((t) => (window.__k2n || []).filter((x) => x.at >= t).map((x) => ({...x, afterPressMs: x.at - t})), t0).catch(() => []);
const nowIn = (page) => page.evaluate(() => Date.now()).catch(() => Date.now());

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const assignWin = (page) => page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();

// The Participants panel as data (K4's reader).
const panelRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.innerText.trim()));
    if (!h) return {present: false};
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
    const items = box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((s) => s.trim()).filter(Boolean).join(' / ')) : [];
    return {present: true, items};
});

// The "Assign Participant" window as data.
const winRead = (win) => win.evaluate((d) => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
    const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
    const sel = d.querySelector('select[name="filterUserGroupId"]');
    const box = (n) => {
        const i = d.querySelector(`input[name="${n}"]`);
        if (!i) return null;
        const sec = i.closest('.section, fieldset, [class*=Wrapper], [class*=Permit]');
        const lab = d.querySelector(`label[for="${i.id}"]`) || i.closest('label');
        return {visible: vis(i), checked: i.checked, disabled: i.disabled, label: txt(lab), section: sec ? txt(sec).slice(0, 400) : null, sectionClass: sec ? String(sec.className).slice(0, 120) : null};
    };
    const heads = [...d.querySelectorAll('h1,h2,h3,h4,legend,.pkp_controllers_grid .header h4, .header')].filter(vis).map((h) => txt(h)).filter(Boolean);
    const radios = [...d.querySelectorAll('input[name="userId"]')];
    const rows = radios.map((r) => ({value: r.value, checked: r.checked, text: txt(r.closest('tr')).slice(0, 160)}));
    const gridHeaders = [...d.querySelectorAll('#userSelectGridContainer th, [id^=component-grid-users-userselect] th')].map((t) => txt(t));
    const tmpl = d.querySelector('select[name="template"]');
    const ta = d.querySelector('textarea[name="message"]');
    const ed = ta && window.tinymce && window.tinymce.get(ta.id);
    const buttons = [...d.querySelectorAll('button, a.cancelButton, a[role=button], form a')].filter(vis).map((b) => ({tag: b.tagName.toLowerCase(), text: txt(b) || b.getAttribute('aria-label')})).filter((b) => b.text);
    const errors = [...d.querySelectorAll('.error, label.error, .pkp_form_error, [class*=rror], .pkpFormError')].filter(vis).map((e) => txt(e)).filter(Boolean);
    const labelEls = sel ? [...(sel.labels || [])].map((l) => txt(l)) : [];
    const selPrev = sel ? (() => { let p = sel; const seen = []; for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (p) seen.push(txt(p).slice(0, 120)); } return seen; })() : null;
    const locate = [...d.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Locate a User$/.test((e.textContent || '').trim()));
    const order = locate && sel ? (locate.compareDocumentPosition(sel) & Node.DOCUMENT_POSITION_FOLLOWING ? 'select after heading' : 'select before heading') : null;
    const boxAfterGrid = (() => { const g = d.querySelector('#userSelectGridContainer'); const b = d.querySelector('input[name="recommendOnly"]'); return g && b ? !!(g.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })();
    return {
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby')) ? txt(document.getElementById(d.getAttribute('aria-labelledby'))) : null),
        heads,
        locateHeading: locate ? {tag: locate.tagName.toLowerCase(), cls: String(locate.className).slice(0, 80)} : null,
        selectOrder: order,
        boxesAfterGrid: boxAfterGrid,
        select: sel ? {labels: labelEls, ariaLabel: sel.getAttribute('aria-label'), id: sel.id, options: [...sel.options].map((o) => o.text.trim()), selected: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text.trim() : null, selectedIndex: sel.selectedIndex, ancestors: selPrev && selPrev.slice(0, 2)} : null,
        searchBox: (() => { const i = d.querySelector('input[name="name"], input[id^=name]'); return i ? {name: i.name, placeholder: i.placeholder, value: i.value} : null; })(),
        gridHeaders,
        rows,
        rowCount: radios.length,
        gridText: txt(d.querySelector('#userSelectGridContainer')) ? txt(d.querySelector('#userSelectGridContainer')).slice(0, 600) : null,
        boxes: {recommendOnly: box('recommendOnly'), canChangeMetadata: box('canChangeMetadata')},
        template: tmpl ? {options: [...tmpl.options].map((o) => o.text.trim()), selected: tmpl.options[tmpl.selectedIndex] ? tmpl.options[tmpl.selectedIndex].text.trim() : null, labels: [...(tmpl.labels || [])].map((l) => txt(l))} : null,
        message: ta ? {labels: [...(ta.labels || [])].map((l) => txt(l)), rich: !!ed, content: ed ? ed.getContent() : ta.value} : null,
        buttons,
        errors,
        text: d.innerText.slice(0, 3000),
    };
});

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
        author: 'Author',
        funding: 'Funding coordinator',
        translator: 'Translator',
        manyRole: isOPS ? 'Author' : 'Translator',
        stageA: isOPS ? 'workflow_5' : 'workflow_1',
    };

    // ---- seeding --------------------------------------------------------------------------------------------
    if (on('seed') && !sc.M) {
        const t = tag('u35k2');
        sc.t = t;
        const U = (k, roles, g, f) => ({username: `${t}${k}`, roles, givenName: g, familyName: f});
        const users = [U('mgr', ['manager'], 'Mia', 'Manager'), U('mgr2', ['manager'], 'Max', 'Managertwo'),
            U('se', ['sectionEditor'], 'Sam', 'Section'), U('se2', ['sectionEditor'], 'Sue', 'Second'),
            U('au', ['author'], 'Ava', 'Author'), U('au2', ['author'], 'Abe', 'Authortwo')];
        if (isOPS) {
            users.push(U('dual', ['sectionEditor', 'author'], 'Dana', 'Dual'), U('endd', ['sectionEditor', 'author'], 'Eli', 'Ended'));
            for (let i = 1; i <= 22; i++) users.push(U(`m${String(i).padStart(2, '0')}`, ['author'], `Many${String(i).padStart(2, '0')}`, 'Person'));
        } else {
            users.push(U('ed', ['editor'], 'Eddie', 'Editor'), U('pe', ['productionEditor'], 'Pat', 'Production'),
                U('dual', ['sectionEditor', 'funding'], 'Dana', 'Dual'), U('endd', ['sectionEditor', 'funding'], 'Eli', 'Ended'),
                U('ce', ['copyeditor'], 'Cora', 'Copy'), U('fc', ['funding'], 'Fay', 'Funding'), U('tr', ['translator'], 'Tim', 'Translator'),
                U('ds', ['designer'], 'Dee', 'Designer'), U('ix', ['indexer'], 'Ian', 'Indexer'), U('ly', ['layoutEditor'], 'Lea', 'Layout'),
                U('pr', ['proofreader'], 'Pia', 'Proof'), U('mk', ['marketing'], 'Mo', 'Marketing'),
                U('rv', ['externalReviewer', 'funding', 'translator'], 'Rae', 'Reviewer'), U('rvd', ['externalReviewer', 'funding'], 'Dex', 'Decliner'),
                U('rvo', ['externalReviewer'], 'Ola', 'Onlyreviewer'));
            if (isOJS) users.push(U('ge', ['guestEditor'], 'Gil', 'Guest'));
            if (isOMP) users.push(U('vol', ['volumeEditor'], 'Val', 'Volume'), U('cha', ['chapterAuthor'], 'Chad', 'Chapter'), U('rvi', ['internalReviewer', 'funding'], 'Ira', 'Internal'));
            for (let i = 1; i <= 22; i++) users.push(U(`m${String(i).padStart(2, '0')}`, ['translator'], `Many${String(i).padStart(2, '0')}`, 'Person'));
        }
        const ctx = await app.api.createContext({tag: t, context: {name: `U35 K2 ${t}`, contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.M = {ctx: ctx.path || t};
        sc.u = Object.fromEntries(users.map((x) => [x.username.slice(t.length), {username: x.username, name: `${x.givenName} ${x.familyName}`}]));
        save();
        const P = (k, role, extra) => ({username: `${t}${k}`, role, ...(extra || {})});
        const mk = async (bag, key, ctxPath, submitter, title, decisionsList, participants, extra) => {
            let lastErr = null;
            for (const decisions of decisionsList) {
                try {
                    const body = {tag: `${ctxPath}${key.toLowerCase()}`.slice(0, 32), context: ctxPath, submitter, title: `${title} ${t}`, participants, ...(extra || {})};
                    if (decisions.length) body.decisions = decisions;
                    const s = await app.api.createSubmission(body);
                    bag[key] = {id: s.submissionId, stage: s.stageId, rounds: s.reviewRounds, title: body.title, decisions};
                    save();
                    log(`[seed] ${key} #${s.submissionId} stage ${s.stageId} rounds ${JSON.stringify(s.reviewRounds)}`);
                    return;
                } catch (e) { lastErr = e; log(`[seed ${key} try ${JSON.stringify(decisions)}]`, String(e.message).slice(0, 300)); }
            }
            bag[`${key}err`] = String(lastErr && lastErr.message).slice(0, 600); save();
        };
        const au = `${t}au`;
        await mk(sc.M, 'A', sc.M.ctx, au, 'K2 window', [[]], []);
        await mk(sc.M, 'A2', sc.M.ctx, au, 'K2 exclusion', [[]], [P('se', 'sectionEditor'), P('dual', 'sectionEditor')]);
        await mk(sc.M, 'A3', sc.M.ctx, au, 'K2 second', [[]], [P('se', 'sectionEditor')]);
        await mk(sc.M, 'P', sc.M.ctx, au, 'K2 published', [[]], [P('se', 'sectionEditor')], {published: true});
        await mk(sc.M, 'N', sc.M.ctx, au, 'K2 needs', [[]], []);
        if (!isOPS) {
            await mk(sc.M, 'PR', sc.M.ctx, au, 'K2 production', [['skipExternalReview', 'sendToProduction'], ['acceptAndSkipReview', 'sendToProduction'], ['skipReview', 'sendToProduction']], []);
            await mk(sc.M, 'Rv', sc.M.ctx, au, 'K2 review', [['sendExternalReview']], [], {reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'accepted'}, {username: `${t}rvd`, status: 'declined'}]}]});
            await mk(sc.M, 'RvC', sc.M.ctx, au, 'K2 reviewed', [['sendExternalReview', 'accept'], ['sendExternalReview', 'acceptFromReview']], [], {reviewRounds: [{reviewers: [{username: `${t}rv`, status: 'accepted'}]}]});
            if (isOMP) await mk(sc.M, 'Ri', sc.M.ctx, au, 'K2 internal', [['sendInternalReview']], [], {reviewRounds: [{reviewers: [{username: `${t}rvi`, status: 'accepted'}]}]});
            for (const [key, mode] of [['VA', 'anonymous'], ['VO', 'open']]) {
                const tv = `${t}${key.toLowerCase()}`.slice(0, 32);
                const vu = [U('mgr', ['manager'], 'Mia', 'Manager'), U('au', ['author'], 'Ava', 'Author'), U('rv', ['externalReviewer', 'funding'], 'Rae', 'Reviewer')].map((x) => ({...x, username: x.username.replace(t, tv)}));
                const c = await app.api.createContext({tag: tv, context: {name: `U35 K2 ${key} ${t}`, contactName: 'K2 Contact', contactEmail: `${tv}contact@mail.test`}, users: vu, review: {defaultReviewMode: mode}});
                sc[key] = {ctx: c.path || tv, t: tv, mode};
                save();
                await mk(sc[key], 'S', sc[key].ctx, `${tv}au`, `K2 ${key}`, [['sendExternalReview']], [], {reviewRounds: [{reviewers: [{username: `${tv}rv`, status: 'accepted'}]}]});
            }
        }
        // Context R: the roles' own settings changed (Rule 4 other end).
        {
            const tr = `${t}r`.slice(0, 32);
            const ru = [U('mgr', ['manager'], 'Mia', 'Manager'), U('se', ['sectionEditor'], 'Sam', 'Section'), U('au', ['author'], 'Ava', 'Author'), U('au2', ['author'], 'Abe', 'Authortwo')];
            if (!isOPS) ru.push(U('ed', ['editor'], 'Eddie', 'Editor'), U('fc', ['funding'], 'Fay', 'Funding'));
            if (isOJS) ru.push(U('ge', ['guestEditor'], 'Gil', 'Guest'));
            const roles = isOPS
                ? {sectionEditor: {recommendOnly: true, permitMetadataEdit: false}, author: {permitMetadataEdit: false}}
                : {sectionEditor: {recommendOnly: true, permitMetadataEdit: false}, editor: {recommendOnly: true}, author: {permitMetadataEdit: true}, funding: {permitMetadataEdit: true}, ...(isOJS ? {guestEditor: {permitMetadataEdit: true}} : {})};
            const c = await app.api.createContext({tag: tr, context: {name: `U35 K2 R ${t}`, contactName: 'K2 Contact', contactEmail: `${tr}contact@mail.test`}, users: ru.map((x) => ({...x, username: x.username.replace(t, tr)})), roles});
            sc.R = {ctx: c.path || tr, t: tr, roles};
            save();
            await mk(sc.R, 'S', sc.R.ctx, `${tr}au`, 'K2 R', [[]], []);
        }
        record('seed', sc);
    }
    if (!sc.M) { log('[k2] no context; run the seed phase'); return; }
    const t = sc.t;
    const u = sc.u;
    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key) => ctxUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (s) => (s.rounds && s.rounds[0] ? `workflow_${s.rounds[0].stageId}_${s.rounds[0].id}` : 'workflow_3');
    const mailOf = (username) => `${username}@mail.test`;

    // ---- browser helpers -------------------------------------------------------------------------------------
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
    async function openWf(page, ctx, id, key, label) {
        await page.goto(wfUrl(ctx, id, key)); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const panel = await panelRead(page).catch((e) => ({error: String(e.message)}));
        await snap(page, label, {panel});
        log(`[${label}]`, JSON.stringify(panel.items || panel));
        return panel;
    }
    async function openAssign(page) {
        const btn = page.locator('[data-cy="workflow-secondary-items"]').getByRole('button', {name: 'Assign', exact: true});
        await btn.click();
        const win = assignWin(page);
        await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
        await idle(page);
        await win.locator('input[name="userId"], #userSelectGridContainer .empty, #userSelectGridContainer tr').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        return win;
    }
    async function chooseRole(page, win, label) {
        await win.locator('select[name="filterUserGroupId"]').selectOption({label});
        await idle(page); await sleep(200);
    }
    async function search(page, win, name) {
        await win.getByRole('textbox', {name: 'Search User By Name'}).fill(name || '');
        const resp = page.waitForResponse((r) => /fetchGrid|fetch-grid/i.test(r.url()), {timeout: 15000}).catch(() => null);
        await win.getByRole('button', {name: 'Search', exact: true}).click();
        await resp; await idle(page); await sleep(300); await idle(page);
    }
    const radioOf = (win, k) => win.getByRole('row').filter({hasText: u[k] ? u[k].name : k}).locator('input[name="userId"]');
    async function pick(page, win, k) {
        const r = radioOf(win, k);
        if (!(await r.count())) return false;
        await r.first().check();
        await idle(page); await sleep(300);
        return true;
    }
    async function closeWin(page, win, how = 'cancel') {
        if (!(await win.isVisible().catch(() => false))) return;
        dialogAnswer = 'accept';
        if (how === 'cancel') await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
        else await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
        await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await idle(page);
    }
    async function pressOK(page, win) {
        const t0 = await nowIn(page);
        const resp = page.waitForResponse((r) => /saveParticipant|save-participant/i.test(r.url()), {timeout: 20000}).catch(() => null);
        await win.locator('form').getByRole('button', {name: 'OK', exact: true}).last().click();
        const r = await resp;
        const out = {saveStatus: r ? r.status() : null, saveUrl: r ? r.url().replace(/^.*index\.php/, '') : null};
        if (r) { const b = await r.text().catch(() => ''); out.saveAnswer = {status: (b.match(/"status":\s*(true|false)/) || [])[1], hasFormContent: /"content":\s*"</.test(b), event: (b.match(/"event":\s*\{[^}]*"name":\s*"([^"]+)"/) || [])[1] || null, len: b.length}; }
        await win.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
        await sleep(1500); await idle(page);
        out.windowStillOpen = await win.isVisible().catch(() => false);
        out.notices = await noticesSince(page, t0);
        return out;
    }
    async function relandIfStuck(page) {
        await page.goto(page.url()); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function typeMessage(page, win, text) {
        const ta = win.locator('textarea[name="message"]');
        const id = await ta.getAttribute('id').catch(() => null);
        if (!id) return {typed: false};
        await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 20000}).catch(() => {});
        await page.frameLocator(`#${id}_ifr`).locator('body').click();
        await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete');
        if (text) await page.keyboard.type(text);
        await sleep(300);
        return {typed: true, content: await page.evaluate((i) => window.tinymce.get(i).getContent(), id).catch(() => null)};
    }
    // The anonymous-review warning: a legacy confirmation modal over the window.
    async function reviewerWarning(page) {
        const m = page.locator('.pkp_modal:visible, [role="dialog"]:visible, [role="alertdialog"]:visible').filter({hasText: /assigned to conduct an anonymous review/i}).last();
        await m.waitFor({timeout: 4000}).catch(() => {});
        if (!(await m.count()) || !(await m.isVisible().catch(() => false))) return {shown: false};
        const data = await m.evaluate((d) => ({text: d.innerText.replace(/\s+/g, ' ').trim().slice(0, 800), buttons: [...d.querySelectorAll('button, a')].filter((b) => b.getClientRects().length).map((b) => b.innerText.trim() || b.getAttribute('aria-label')).filter(Boolean), cls: String(d.className).slice(0, 100), role: d.getAttribute('role')}));
        return {shown: true, loc: m, ...data};
    }
    async function activityLog(page, label) {
        const btn = wf(page).getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const headers = await dlg.locator('table thead th').allInnerTexts().catch(() => []);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, label, {headers, rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 6)).slice(0, 1400));
        await relandIfStuck(page);
        return {headers, rows};
    }
    async function tasksPanel(page, label) {
        const bell = page.getByRole('button', {name: /^Tasks/}).first();
        if (!(await bell.count())) { record(label, {absent: true}); return null; }
        const bellName = await bell.evaluate((b) => b.innerText.replace(/\s+/g, ' ').trim()).catch(() => null);
        await bell.click();
        const d = page.locator('[role="dialog"]:visible').last();
        await d.locator('.pkp_controllers_grid, table').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const rows = await d.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 300))).catch(() => []);
        await snap(page, label, {rows, bellName});
        const close = d.getByRole('button', {name: /^Close$/}).first();
        if (await close.count()) { await close.click(); await idle(page); }
        return {bellName, rows};
    }
    async function needsView(page, ctx, title, label) {
        await page.goto(ctxUrl(ctx, '/dashboard/editorial')); await idle(page);
        const link = page.locator('a[href*="dashboard/editorial"]').filter({has: page.getByText('Needs editor', {exact: true})}).first();
        const has = await link.count();
        let linkText = null;
        if (has) { linkText = flat(await link.innerText(), 60); await link.click(); await idle(page); }
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const s = await snap(page, label);
        const main = (s.text && s.text.main) || '';
        const out = {viewLink: has, linkText, listed: main.includes(title)};
        record(`${label}-summary`, out);
        log(`[${label}]`, JSON.stringify(out));
        return out;
    }
    // Every role on the list, each in a fresh window (the boxes keep state across role changes, see "carry"):
    // open "Assign", choose the role, Search, pick its first person, read the boxes, Cancel.
    async function rolesSweep(page, label, {skip = []} = {}) {
        let win = await openAssign(page);
        const opts = (await winRead(win)).select.options;
        await closeWin(page, win);
        const out = {};
        for (const o of opts) {
            win = await openAssign(page);
            await chooseRole(page, win, o);
            await search(page, win, '');
            const r = await winRead(win);
            const pickable = r.rows.filter((x) => !skip.some((k) => x.text.includes(u[k] ? u[k].name : k)));
            let boxes = null;
            let pickedName = null;
            if (pickable.length) {
                await win.locator(`input[name="userId"][value="${pickable[0].value}"]`).check();
                await idle(page); await sleep(300);
                boxes = (await winRead(win)).boxes;
                pickedName = pickable[0].text;
            }
            out[o] = {people: r.rows.map((x) => x.text), count: r.rowCount, picked: pickedName, boxes: boxes && {recommendOnly: boxes.recommendOnly && {visible: boxes.recommendOnly.visible, checked: boxes.recommendOnly.checked}, canChangeMetadata: boxes.canChangeMetadata && {visible: boxes.canChangeMetadata.visible, checked: boxes.canChangeMetadata.checked}}};
            await closeWin(page, win);
        }
        await snap(page, `${label}-roles-sweep`, {sweep: out});
        log(`[${label} sweep]`, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, `${v.count}p ro:${v.boxes && v.boxes.recommendOnly ? `${v.boxes.recommendOnly.visible ? 'V' : 'h'}${v.boxes.recommendOnly.checked ? 'x' : 'o'}` : '-'} md:${v.boxes && v.boxes.canChangeMetadata ? `${v.boxes.canChangeMetadata.visible ? 'V' : 'h'}${v.boxes.canChangeMetadata.checked ? 'x' : 'o'}` : '-'}`]))));
        return out;
    }
    // 4c carry-over: a ticked "Permissions", another role chosen, a person of that role picked, OK, read back.
    async function carryLeg(page, label, ctx, sub, roleX, kX, roleY, kY, nameY) {
        const r = {};
        const win = await openAssign(page);
        await chooseRole(page, win, roleX); await search(page, win, ''); await pick(page, win, kX);
        await win.locator('input[name="canChangeMetadata"]').check().catch(() => {});
        r.xBoxes = (await winRead(win)).boxes;
        await chooseRole(page, win, roleY);
        r.afterRoleChange = (await winRead(win)).boxes;
        await search(page, win, '');
        const radio = win.getByRole('row').filter({hasText: nameY}).locator('input[name="userId"]');
        await radio.first().check(); await idle(page); await sleep(300);
        r.yBoxes = (await winRead(win)).boxes;
        await snap(page, `${label}-carry-picked`, {r});
        r.ok = await pressOK(page, win);
        if (r.ok.windowStillOpen) { await closeWin(page, win); await relandIfStuck(page); }
        r.panel = (await panelRead(page)).items;
        const btn = wf(page).getByRole('button', {name: `${nameY} More Actions`, exact: true});
        if (await btn.count()) {
            await btn.first().click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click().catch(() => {});
            const ew = page.getByRole('dialog').filter({hasText: 'Edit Assignment'}).last();
            await ew.locator('form').getByRole('button', {name: 'OK', exact: true}).waitFor({timeout: 20000}).catch(() => {});
            await idle(page);
            r.savedBoxes = await ew.evaluate((d) => Object.fromEntries(['recommendOnly', 'canChangeMetadata'].map((n) => { const i = d.querySelector(`input[name="${n}"]`); return [n, i ? i.checked : 'absent']; }))).catch(() => null);
            await snap(page, `${label}-carry-readback`, {savedBoxes: r.savedBoxes});
            await ew.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
            await ew.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await idle(page);
        }
        const bx = (b) => b && `${b.visible ? 'V' : 'h'}${b.checked ? 'x' : 'o'}${b.disabled ? 'd' : ''}`;
        log(`[${label} carry]`, JSON.stringify({x: bx(r.xBoxes.canChangeMetadata), afterRole: bx(r.afterRoleChange.canChangeMetadata), y: bx(r.yBoxes.canChangeMetadata), status: r.ok.saveStatus, still: r.ok.windowStillOpen, panel: r.panel, saved: r.savedBoxes}));
        record(`${label}-carry`, r);
        return r;
    }
    const as = async (page, k, ctx = sc.M.ctx) => { await signIn(page, k === 'admin' ? 'admin' : (u[k] ? u[k].username : k), {contextPath: ctx}); await idle(page); };

    // ---- win: the window's shape, the role list, boxes, Search, the stale list, twenty rows (Journal Manager) -------
    if (on('win')) await sect('win', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const A = sc.M.A;
            await openWf(page, sc.M.ctx, A.id, L.stageA, 'win-A-panel');
            const win = await openAssign(page);
            const first = await winRead(win);
            await snap(page, 'win-open', {win: first});
            await loc(page, 'Assign Participant window', win);
            await loc(page, 'Assign Participant: role list', win.locator('select[name="filterUserGroupId"]'));
            await loc(page, 'Assign Participant: Search User By Name', win.getByRole('textbox', {name: 'Search User By Name'}));
            await loc(page, 'Assign Participant: Search', win.getByRole('button', {name: 'Search', exact: true}));
            await loc(page, 'Assign Participant: a person radio', win.locator('input[name="userId"]').first());
            await loc(page, 'Assign Participant: Cancel (link)', win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}));
            log('[win open]', JSON.stringify({name: first.name, heads: first.heads, order: first.selectOrder, select: first.select, rows: first.rows.map((r) => r.text), headers: first.gridHeaders, boxes: first.boxes, template: first.template, message: first.message && {labels: first.message.labels, rich: first.message.rich}, buttons: first.buttons, boxesAfterGrid: first.boxesAfterGrid}));
            // first role's people after an explicit Search, for comparison with the opening list
            const openingRows = first.rows.map((r) => r.value);
            await search(page, win, '');
            const firstSearched = await winRead(win);
            record('win-first-role-searched', {openingRows, searchedRows: firstSearched.rows});
            // Search By Name: a match and a non-match
            await chooseRole(page, win, L.se);
            await search(page, win, 'Sue');
            const sName = await winRead(win);
            await snap(page, 'win-search-sue', {rows: sName.rows});
            await search(page, win, 'Nobodyzz');
            const sNone = await winRead(win);
            await snap(page, 'win-search-none', {rows: sNone.rows, gridText: sNone.gridText});
            await search(page, win, '');
            const seAll = await winRead(win);
            log('[win search]', JSON.stringify({sue: sName.rows.map((r) => r.text), none: sNone.rowCount, noneText: sNone.gridText, seAll: seAll.rows.map((r) => r.text)}));
            // Boxes hidden before a pick; shown after; 4c: another role hides and unticks
            const before = (await winRead(win)).boxes;
            await pick(page, win, 'se2');
            const afterPick = (await winRead(win)).boxes;
            await snap(page, 'win-se2-picked', {boxes: afterPick});
            await win.locator('input[name="recommendOnly"]').check().catch(() => {});
            const tickedBoth = (await winRead(win)).boxes;
            const staleBefore = (await winRead(win)).rows.map((r) => r.value);
            await chooseRole(page, win, isOPS ? L.author : L.funding);
            const afterRole = await winRead(win);
            await snap(page, 'win-role-changed', {boxes: afterRole.boxes, rows: afterRole.rows});
            const staleSame = JSON.stringify(afterRole.rows.map((r) => r.value)) === JSON.stringify(staleBefore);
            log('[win boxes]', JSON.stringify({before, afterPick, tickedBoth, afterRole: afterRole.boxes, staleSame, staleRows: afterRole.rows.map((r) => r.text)}));
            // the stale list: pick a Section editor person while the role list says another role, then OK
            const radioChecked = afterRole.rows.find((r) => r.checked);
            await pick(page, win, 'se2');
            const stalePicked = await winRead(win);
            await snap(page, 'win-stale-picked', {boxes: stalePicked.boxes, rows: stalePicked.rows, select: stalePicked.select.selected});
            const staleOk = await pressOK(page, win);
            if (staleOk.windowStillOpen) { staleOk.after = await winRead(win); await snap(page, 'win-stale-ok-still-open', {staleOk}); await closeWin(page, win); }
            await relandIfStuck(page);
            const staleOkPanel = await panelRead(page);
            await snap(page, 'win-stale-ok-panel', {panel: staleOkPanel});
            record('win-stale', {radioStillCheckedAfterRoleChange: radioChecked ? radioChecked.text : null, staleSame, stalePickedBoxes: stalePicked.boxes, staleOk: {...staleOk, after: staleOk.after && {errors: staleOk.after.errors, text: flat(staleOk.after.text, 600)}}, panel: staleOkPanel});
            log('[win stale OK]', JSON.stringify({status: staleOk.saveStatus, ans: staleOk.saveAnswer, still: staleOk.windowStillOpen, notices: staleOk.notices.map((n) => n.text), errors: staleOk.after && staleOk.after.errors, panel: staleOkPanel.items}));
            // Twenty rows, then scroll for more
            const win2 = await openAssign(page);
            await chooseRole(page, win2, L.manyRole);
            await search(page, win2, '');
            const r20 = await winRead(win2);
            await snap(page, 'win-many-first', {rowCount: r20.rowCount});
            const paging = async () => flat(((await win2.innerText().catch(() => '')).match(/\d+ of \d+ items/) || [])[0], 40);
            const p20 = await paging();
            const scrollInfo = await win2.evaluate((d) => ({scrollableDivs: d.querySelectorAll('#userSelectGridContainer div.scrollable').length, loadMore: [...d.querySelectorAll('#userSelectGridContainer a, #userSelectGridContainer button')].filter((a) => /Load more/i.test(a.innerText)).map((a) => ({tag: a.tagName.toLowerCase(), cls: String(a.className).slice(0, 80)}))}));
            // a user's scroll: the wheel over the list, to the bottom of the window and past it
            await win2.locator('input[name="userId"]').nth(10).hover().catch(() => {});
            for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 600); await sleep(250); }
            await idle(page); await sleep(1200); await idle(page);
            const rWheel = await winRead(win2);
            const pWheel = await paging();
            await snap(page, 'win-many-wheeled', {rowCount: rWheel.rowCount, paging: pWheel, scrollInfo});
            // the "Load more" control
            const more = win2.getByRole('link', {name: /Load more/i}).or(win2.getByRole('button', {name: /Load more/i})).first();
            let rMore = rWheel;
            let pMore = pWheel;
            if (await more.count()) {
                await loc(page, 'Assign Participant: Load more', more);
                await more.click(); await idle(page); await sleep(800); await idle(page);
                rMore = await winRead(win2); pMore = await paging();
            }
            await snap(page, 'win-many-scrolled', {rowCount: rMore.rowCount, paging: pMore, scrollInfo});
            log('[win twenty]', JSON.stringify({first: r20.rowCount, p20, afterWheel: rWheel.rowCount, pWheel, afterLoadMore: rMore.rowCount, pMore, scrollInfo}));
            record('win-twenty', {first: r20.rowCount, p20, afterWheel: rWheel.rowCount, pWheel, afterLoadMore: rMore.rowCount, pMore, scrollInfo, lastRows: rMore.rows.slice(-4)});
            await closeWin(page, win2);
            // the list's role options on every stage this app has (Rule 3: no reviewer role, no manager role)
            const stageLists = {};
            const visits = isOPS ? [['A', L.stageA]] : [['A', 'workflow_1'], ['Rv', roundKey(sc.M.Rv || {})], ['RvC', 'workflow_4'], ['PR', 'workflow_5'], ...(isOMP && sc.M.Ri ? [['Ri', roundKey(sc.M.Ri)]] : [])];
            for (const [k, key] of visits) {
                if (!sc.M[k]) { stageLists[`${k}:${key}`] = 'not seeded'; continue; }
                await openWf(page, sc.M.ctx, sc.M[k].id, key, `win-stage-${k}`);
                const w = await openAssign(page);
                const r = await winRead(w);
                stageLists[`${k}:${key}`] = {options: r.select.options, selected: r.select.selected, openingRows: r.rows.map((x) => x.text.split(' ').slice(0, 2).join(' '))};
                await snap(page, `win-stage-${k}-assign`, {win: r});
                await closeWin(page, w);
            }
            record('win-stage-lists', stageLists);
            log('[win stage lists]', JSON.stringify(stageLists));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- cancel: 6b/A4 (OK with nobody chosen) and 6c/td2 (Cancel and Close, with and without a change) -------------
    if (on('cancel')) await sect('cancel', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const A = sc.M.A;
            const p0 = await openWf(page, sc.M.ctx, A.id, L.stageA, 'cancel-A-before');
            // 6b: OK with nobody chosen (the first role preselected)
            let win = await openAssign(page);
            const ok0 = await pressOK(page, win);
            if (ok0.windowStillOpen) ok0.after = await winRead(win);
            await snap(page, 'cancel-ok-nobody', {ok0: {...ok0, after: ok0.after && {errors: ok0.after.errors, rows: ok0.after.rowCount, select: ok0.after.select, text: flat(ok0.after.text, 800)}}});
            log('[td5 OK nobody]', JSON.stringify({status: ok0.saveStatus, ans: ok0.saveAnswer, still: ok0.windowStillOpen, notices: ok0.notices.map((n) => n.text), errors: ok0.after && ok0.after.errors, dialogs: dialogsSeen.slice(-2)}));
            // OK again from the redrawn form, with nobody still chosen, then after typing a message only
            if (ok0.windowStillOpen) {
                const ok1 = await pressOK(page, win);
                record('cancel-ok-nobody-twice', {status: ok1.saveStatus, still: ok1.windowStillOpen, notices: ok1.notices});
                await closeWin(page, win);
            }
            await relandIfStuck(page);
            const p1 = await panelRead(page);
            await snap(page, 'cancel-ok-nobody-panel', {panel: p1});
            record('cancel-td5', {ok0: {...ok0, after: ok0.after && {errors: ok0.after.errors, text: flat(ok0.after.text, 1200)}}, before: p0.items, after: p1.items});
            // 6c: four ways out
            const legs = [
                {name: 'cancel-nochange', change: false, how: 'cancel', answer: 'accept'},
                {name: 'cancel-picked', change: 'pick', how: 'cancel', answer: 'accept'},
                {name: 'close-nochange', change: false, how: 'close', answer: 'accept'},
                {name: 'close-picked-dismiss', change: 'pick', how: 'close', answer: 'dismiss'},
                {name: 'close-picked-accept', change: 'pick', how: 'close', answer: 'accept'},
                {name: 'close-role-accept', change: 'role', how: 'close', answer: 'accept'},
                {name: 'close-typed-accept', change: 'type', how: 'close', answer: 'accept'},
            ];
            const res = {};
            for (const leg of legs) {
                win = await openAssign(page);
                if (leg.change === 'pick') { await chooseRole(page, win, L.se); await search(page, win, ''); await pick(page, win, 'se2'); }
                if (leg.change === 'role') await chooseRole(page, win, L.se);
                if (leg.change === 'type') await typeMessage(page, win, 'Unsaved text');
                const n0 = dialogsSeen.length;
                dialogAnswer = leg.answer;
                if (leg.how === 'cancel') await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click();
                else await win.getByRole('button', {name: /^Close/}).first().click();
                await win.waitFor({state: 'detached', timeout: 6000}).catch(() => {});
                await sleep(800); await idle(page);
                const still = await win.isVisible().catch(() => false);
                const r = {browserDialogs: dialogsSeen.slice(n0), windowStillOpen: still};
                if (still) {
                    r.stillPicked = await win.locator('input[name="userId"]:checked').count();
                    await snap(page, `cancel-${leg.name}-still-open`, r);
                    dialogAnswer = 'accept';
                    await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
                    await win.waitFor({state: 'detached', timeout: 6000}).catch(() => {});
                    r.secondCloseDialogs = dialogsSeen.slice(n0 + r.browserDialogs.length);
                    await idle(page);
                }
                r.panel = (await panelRead(page)).items;
                await snap(page, `cancel-${leg.name}`, r);
                res[leg.name] = r;
                log(`[td2 ${leg.name}]`, JSON.stringify({dialogs: r.browserDialogs.map((d) => `${d.type}:${d.message}:${d.answer}`), still, rows: r.panel}));
            }
            dialogAnswer = 'accept';
            await relandIfStuck(page);
            const p2 = await panelRead(page);
            await snap(page, 'cancel-after-all', {panel: p2});
            record('cancel-td2', {legs: res, panelAfterReland: p2.items});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- leave: after the window is gone, does leaving the page ask (the browser's own leave-page box)? -----------------
    if (on('leave')) await sect('leave', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const A = sc.M.A;
            const legs = [
                {name: 'untouched-cancel', change: false, how: 'cancel'},
                {name: 'picked-cancel', change: true, how: 'cancel'},
                {name: 'picked-close', change: true, how: 'close'},
                {name: 'untouched-close', change: false, how: 'close'},
                {name: 'untouched-open', change: false, how: 'none'},
                {name: 'picked-open', change: true, how: 'none'},
                {name: 'picked-open-dismiss', change: true, how: 'none', answer: 'dismiss'},
            ];
            const res = {};
            for (const leg of legs) {
                await openWf(page, sc.M.ctx, A.id, L.stageA, `leave-${leg.name}-land`);
                const win = await openAssign(page);
                if (leg.change) { await chooseRole(page, win, L.se); await search(page, win, ''); await pick(page, win, 'se2'); }
                dialogAnswer = 'accept';
                const n0 = dialogsSeen.length;
                if (leg.how === 'cancel') await win.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click();
                else if (leg.how === 'close') await win.getByRole('button', {name: /^Close/}).first().click();
                if (leg.how !== 'none') { await win.waitFor({state: 'detached', timeout: 6000}).catch(() => {}); await idle(page); await sleep(500); }
                const atClose = dialogsSeen.slice(n0);
                const n1 = dialogsSeen.length;
                if (leg.answer) dialogAnswer = leg.answer;
                // leave the page: the dashboard link of the site, as a person would by address
                await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial'), {timeout: 15000}).catch((e) => res[`${leg.name}-gotoError`] = String(e.message).slice(0, 200));
                await idle(page); await sleep(500);
                dialogAnswer = 'accept';
                res[leg.name] = {atClose: atClose.map((d) => `${d.type}:${d.message}`), onLeave: dialogsSeen.slice(n1).map((d) => `${d.type}:${d.message}:${d.answer}`), landed: page.url().replace(/^.*index\.php/, ''), windowStillThere: await assignWin(page).isVisible().catch(() => false)};
                await snap(page, `leave-${leg.name}-left`, res[leg.name]);
                log(`[leave ${leg.name}]`, JSON.stringify(res[leg.name]));
            }
            record('leave', res);
            await signOut(page);
        } finally { await close(); }
    });

    // ---- msg: line 86 / 85 (Message only with a predefined message; choosing one replaces the text) --------------
    if (on('msg')) await sect('msg', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            const A = sc.M.A;
            await openWf(page, sc.M.ctx, A.id, L.stageA, 'msg-A-before');
            const kBlank = isOPS ? 'au2' : 'tr';
            const kTmpl = isOPS ? 'dual' : 'fc';
            const roleBlank = isOPS ? L.author : L.translator;
            const roleTmpl = isOPS ? L.author : L.funding;
            const mail0 = {blank: await app.mail.count({to: mailOf(u[kBlank].username)}).catch(() => null), tmpl: await app.mail.count({to: mailOf(u[kTmpl].username)}).catch(() => null)};
            // (a) list blank, message typed
            let win = await openAssign(page);
            await chooseRole(page, win, roleBlank); await search(page, win, ''); await pick(page, win, kBlank);
            const typed = await typeMessage(page, win, 'Hello from K2 blank');
            await snap(page, 'msg-blank-typed', {typed});
            const okA = await pressOK(page, win);
            if (okA.windowStillOpen) { okA.after = await winRead(win); await snap(page, 'msg-blank-still-open', {okA}); await closeWin(page, win); }
            await relandIfStuck(page);
            const panelA = await panelRead(page);
            await sleep(3000);
            const mailA = await app.mail.count({to: mailOf(u[kBlank].username)}).catch(() => null);
            record('msg-blank', {typed, ok: {...okA, after: okA.after && {errors: okA.after.errors, text: flat(okA.after.text, 600)}}, panel: panelA.items, mailBefore: mail0.blank, mailAfter: mailA});
            log('[86 blank+typed]', JSON.stringify({status: okA.saveStatus, still: okA.windowStillOpen, notices: okA.notices.map((n) => n.text), panel: panelA.items, mail: [mail0.blank, mailA]}));
            // (b) a predefined message chosen: it replaces typed text; then OK sends
            win = await openAssign(page);
            await chooseRole(page, win, roleTmpl); await search(page, win, ''); await pick(page, win, kTmpl);
            await typeMessage(page, win, 'Typed before choosing');
            const opts = await win.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const disc = opts.find((o) => /^Discussion/.test(o.text));
            let replaced = null;
            if (disc) {
                const tr = page.waitForResponse((r) => /fetchTemplateBody|fetch-template-body/i.test(r.url()), {timeout: 15000}).catch(() => null);
                await win.locator('select[name="template"]').selectOption(disc.value);
                await tr; await idle(page); await sleep(800);
                replaced = (await winRead(win)).message;
            }
            await snap(page, 'msg-template-chosen', {opts, replaced});
            const okB = await pressOK(page, win);
            if (okB.windowStillOpen) { okB.after = await winRead(win); await closeWin(page, win); }
            await relandIfStuck(page);
            const found = await app.mail.find({to: mailOf(u[kTmpl].username), timeoutMs: 15000}).then((m) => ({subject: m.Subject, snippet: flat(m.Snippet, 200)})).catch((e) => ({none: String(e.message).slice(0, 120)}));
            const panelB = await panelRead(page);
            await snap(page, 'msg-template-after', {panel: panelB});
            record('msg-template', {opts, replaced, ok: okB, mail: found, mailBefore: mail0.tmpl, panel: panelB.items});
            log('[85/86 template]', JSON.stringify({opts: opts.map((o) => o.text), replaced: replaced && flat(replaced.content, 120), status: okB.saveStatus, still: okB.windowStillOpen, notices: okB.notices.map((n) => n.text), mail: found}));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- side: 6a/td1 and Side effects "On Assign" -------------------------------------------------------------------
    if (on('side')) await sect('side', async () => {
        const N = sc.M.N;
        const {page, close} = await session();
        try {
            const out = {};
            for (const k of ['mgr2']) { await as(page, k); await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial')); await idle(page); out[`tasks-${k}-before`] = await tasksPanel(page, `side-tasks-${k}-before`); }
            await as(page, 'mgr');
            await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial')); await idle(page);
            out['tasks-mgr-before'] = await tasksPanel(page, 'side-tasks-mgr-before');
            out.needsBefore = await needsView(page, sc.M.ctx, N.title, 'side-needs-before');
            const mailSe0 = await app.mail.count({to: mailOf(u.se.username)}).catch(() => null);
            const nonEd = isOPS ? 'au2' : 'fc';
            const mailNon0 = await app.mail.count({to: mailOf(u[nonEd].username)}).catch(() => null);
            // non-editor first
            await openWf(page, sc.M.ctx, N.id, L.stageA, 'side-N-before');
            let win = await openAssign(page);
            await chooseRole(page, win, isOPS ? L.author : L.funding); await search(page, win, ''); await pick(page, win, nonEd);
            out.nonEditor = await pressOK(page, win);
            if (out.nonEditor.windowStillOpen) await closeWin(page, win);
            out.nonEditorPanel = (await panelRead(page)).items;
            await snap(page, 'side-N-after-noneditor', {panel: out.nonEditorPanel});
            out['tasks-mgr-after-noneditor'] = await tasksPanel(page, 'side-tasks-mgr-after-noneditor');
            out.needsAfterNonEditor = await needsView(page, sc.M.ctx, N.title, 'side-needs-after-noneditor');
            // td1: the Section editor, no message, "Permissions" unticked, "Assignment privileges" ticked
            await openWf(page, sc.M.ctx, N.id, L.stageA, 'side-N-before-se');
            win = await openAssign(page);
            await chooseRole(page, win, L.se); await search(page, win, ''); await pick(page, win, 'se');
            const boxes0 = (await winRead(win)).boxes;
            await win.locator('input[name="canChangeMetadata"]').uncheck().catch(() => {});
            await win.locator('input[name="recommendOnly"]').check().catch(() => {});
            const boxes1 = (await winRead(win)).boxes;
            await snap(page, 'side-td1-filled', {boxes0, boxes1});
            out.td1 = await pressOK(page, win);
            out.td1.boxes0 = boxes0; out.td1.boxes1 = boxes1;
            out.td1.panelAtOnce = (await panelRead(page)).items;
            await snap(page, 'side-td1-after', {td1: out.td1});
            await loc(page, 'page notices (toasts)', page.locator('div[role="status"].app__notifications'));
            log('[td1]', JSON.stringify({status: out.td1.saveStatus, ans: out.td1.saveAnswer, still: out.td1.windowStillOpen, notices: out.td1.notices.map((n) => `${n.afterPressMs}ms:${n.text}:${n.chain.slice(0, 2).join('<')}`), panel: out.td1.panelAtOnce}));
            // the saved boxes, read back through the row's "Edit"
            const btn = wf(page).getByRole('button', {name: `${u.se.name} More Actions`, exact: true});
            if (await btn.count()) {
                await btn.first().click();
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click().catch(() => {});
                const ew = page.getByRole('dialog').filter({hasText: 'Edit Assignment'}).last();
                await ew.locator('form').getByRole('button', {name: 'OK', exact: true}).waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                out.td1.savedBoxes = await ew.evaluate((d) => Object.fromEntries(['recommendOnly', 'canChangeMetadata'].map((n) => { const i = d.querySelector(`input[name="${n}"]`); return [n, i ? i.checked : 'absent']; }))).catch(() => null);
                await snap(page, 'side-td1-edit-readback', {savedBoxes: out.td1.savedBoxes});
                await ew.locator('form').getByRole('link', {name: /^\s*Cancel\s*$/}).first().click().catch(() => {});
                await ew.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
                await idle(page);
            }
            out.log = await activityLog(page, 'side-N-activity-log');
            await sleep(2500);
            out.mail = {se: [mailSe0, await app.mail.count({to: mailOf(u.se.username)}).catch(() => null)], nonEditor: [mailNon0, await app.mail.count({to: mailOf(u[nonEd].username)}).catch(() => null)]};
            await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial')); await idle(page);
            out['tasks-mgr-after-se'] = await tasksPanel(page, 'side-tasks-mgr-after-se');
            out.needsAfterSe = await needsView(page, sc.M.ctx, N.title, 'side-needs-after-se');
            await as(page, 'mgr2');
            await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial')); await idle(page);
            out['tasks-mgr2-after-se'] = await tasksPanel(page, 'side-tasks-mgr2-after-se');
            if (!isOPS) { await as(page, 'ed'); await page.goto(ctxUrl(sc.M.ctx, '/dashboard/editorial')); await idle(page); out['tasks-ed-after-se'] = await tasksPanel(page, 'side-tasks-ed-after-se'); }
            record('side', out);
            const tl = (x) => x && x.rows ? x.rows.filter((r) => r.includes(N.title) || /needs to be assigned/.test(r)).length : null;
            log('[side]', JSON.stringify({tasksMgr: [tl(out['tasks-mgr-before']), tl(out['tasks-mgr-after-noneditor']), tl(out['tasks-mgr-after-se'])], tasksMgr2: [tl(out['tasks-mgr2-before']), tl(out['tasks-mgr2-after-se'])], needs: [out.needsBefore.listed, out.needsAfterNonEditor.listed, out.needsAfterSe.listed], mail: out.mail, savedBoxes: out.td1.savedBoxes}));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- levels: the window as an assigned Section Editor and as the Site Administrator; exclusion; "Assignments" -----
    if (on('levels')) await sect('levels', async () => {
        const {page, close} = await session();
        try {
            const out = {};
            await as(page, 'se');
            await openWf(page, sc.M.ctx, sc.M.A2.id, L.stageA, 'lvl-se-A2-panel');
            let win = await openAssign(page);
            const r0 = await winRead(win);
            await snap(page, 'lvl-se-assign-open', {win: r0});
            await chooseRole(page, win, L.se); await search(page, win, '');
            const seList = await winRead(win);
            out.seExclusion = seList.rows.map((r) => r.text);
            await chooseRole(page, win, isOPS ? L.author : L.funding); await search(page, win, '');
            out.dualOtherRole = (await winRead(win)).rows.map((r) => r.text);
            await snap(page, 'lvl-se-dual-other-role', {rows: out.dualOtherRole});
            await chooseRole(page, win, L.se); await search(page, win, '');
            await pick(page, win, 'se2');
            out.seBoxes = (await winRead(win)).boxes;
            await snap(page, 'lvl-se-se2-picked', {boxes: out.seBoxes});
            out.seOK = await pressOK(page, win);
            if (out.seOK.windowStillOpen) { out.seOK.after = flat((await winRead(win)).text, 600); await closeWin(page, win); await relandIfStuck(page); }
            out.sePanel = (await panelRead(page)).items;
            await snap(page, 'lvl-se-after-ok', {seOK: out.seOK, panel: out.sePanel});
            log('[lvl se]', JSON.stringify({options: r0.select.options, excl: out.seExclusion, dual: out.dualOtherRole, boxes: out.seBoxes, status: out.seOK.saveStatus, still: out.seOK.windowStillOpen, notices: out.seOK.notices.map((n) => n.text), panel: out.sePanel}));
            // the Section Editor leaves with a change: close control
            win = await openAssign(page);
            await chooseRole(page, win, L.se); await search(page, win, '');
            const n0 = dialogsSeen.length;
            dialogAnswer = 'accept';
            await pick(page, win, 'se2').catch(() => {});
            await win.getByRole('button', {name: /^Close/}).first().click();
            await win.waitFor({state: 'detached', timeout: 6000}).catch(() => {});
            out.seCloseDialogs = dialogsSeen.slice(n0);
            out.seOptions = r0.select.options;
            // "Assignments": se is on A2, A3 (active) and P (published); se2 has just been added to A2
            await as(page, 'mgr');
            await openWf(page, sc.M.ctx, sc.M.A.id, L.stageA, 'lvl-mgr-A-panel');
            win = await openAssign(page);
            await chooseRole(page, win, L.se); await search(page, win, '');
            out.assignmentsColumn = (await winRead(win)).rows.map((r) => r.text);
            await snap(page, 'lvl-mgr-assignments-column', {rows: out.assignmentsColumn});
            await closeWin(page, win);
            log('[lvl assignments]', JSON.stringify(out.assignmentsColumn));
            // Site Administrator: the list and a pick
            await as(page, 'admin');
            await openWf(page, sc.M.ctx, sc.M.A.id, L.stageA, 'lvl-admin-A-panel');
            win = await openAssign(page);
            const ra = await winRead(win);
            await chooseRole(page, win, L.se); await search(page, win, ''); await pick(page, win, 'se2');
            out.admin = {options: ra.select.options, boxes: (await winRead(win)).boxes};
            await snap(page, 'lvl-admin-assign', {admin: out.admin});
            await closeWin(page, win);
            record('levels', out);
            log('[lvl admin]', JSON.stringify(out.admin));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- ended: a role ended on Users & Roles leaves the list -----------------------------------------------------
    if (on('ended')) await sect('ended', async () => {
        const {page, close} = await session();
        try {
            const out = {};
            await as(page, 'mgr');
            await openWf(page, sc.M.ctx, sc.M.A.id, L.stageA, 'ended-A-before');
            let win = await openAssign(page);
            await chooseRole(page, win, L.se); await search(page, win, 'Eli');
            out.before = (await winRead(win)).rows.map((r) => r.text);
            await snap(page, 'ended-list-before', {rows: out.before});
            await closeWin(page, win);
            // Settings › Users & Roles › Users: Eli Ended › Edit › the editor role's "Remove Role"
            await page.goto(ctxUrl(sc.M.ctx, '/management/settings/access')); await idle(page);
            const sb = page.getByRole('searchbox').or(page.getByRole('textbox', {name: /Search/i})).first();
            if (await sb.count()) { await sb.fill('Eli'); await sb.press('Enter'); await idle(page); await sleep(800); await idle(page); }
            const row = page.locator('tr').filter({hasText: u.endd.name}).first();
            await row.waitFor({timeout: 20000}).catch(() => {});
            await snap(page, 'ended-users-table');
            await row.locator('button').last().click();
            await idle(page);
            out.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
            await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
            const s = await snap(page, 'ended-user-edit');
            out.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
            const rr = page.locator('tr').filter({hasText: L.se}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
            if (await rr.count()) {
                await rr.getByRole('button', {name: /Remove Role/i}).click();
                await idle(page);
                const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
                await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
                out.removeDialog = flat(await dlg.innerText().catch(() => ''), 400);
                const resp = page.waitForResponse((r) => r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url()), {timeout: 15000}).catch(() => null);
                await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
                const r = await resp;
                out.removeResponse = r ? {status: r.status(), url: r.url().replace(/^.*\/index\.php/, '')} : 'no request';
                await idle(page); await sleep(1500);
                out.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
                out.pageTextAfter = flat((await screen(page)).text.main, 1500);
                await snap(page, 'ended-user-edit-after');
            }
            await openWf(page, sc.M.ctx, sc.M.A.id, L.stageA, 'ended-A-after');
            win = await openAssign(page);
            await chooseRole(page, win, L.se); await search(page, win, 'Eli');
            out.after = (await winRead(win)).rows.map((r) => r.text);
            await chooseRole(page, win, isOPS ? L.author : L.funding); await search(page, win, 'Eli');
            out.afterOtherRole = (await winRead(win)).rows.map((r) => r.text);
            await snap(page, 'ended-list-after', {after: out.after, afterOtherRole: out.afterOtherRole});
            await closeWin(page, win);
            record('ended', out);
            log('[ended]', JSON.stringify({before: out.before, roleRows: out.roleRows, removeDialog: out.removeDialog, resp: out.removeResponse, rowsAfter: out.roleRowsAfter, after: out.after, other: out.afterOtherRole}));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- rev: Rule 7, the anonymous-review warning -----------------------------------------------------------------
    if (on('rev') && !isOPS) await sect('rev', async () => {
        const {page, close} = await session();
        try {
            const out = {};
            const probeCase = async (label, ctx, sub, key, role, k, {assign = false} = {}) => {
                const r = {role, who: k};
                await openWf(page, ctx, sub.id, key, `rev-${label}-panel`);
                const win = await openAssign(page);
                const w0 = await winRead(win);
                r.options = w0.select.options;
                await chooseRole(page, win, role); await search(page, win, '');
                const list = await winRead(win);
                r.people = list.rows.map((x) => x.text);
                const radio = win.getByRole('row').filter({hasText: k}).locator('input[name="userId"]');
                if (!(await radio.count())) { r.notInList = true; await closeWin(page, win); out[label] = r; log(`[rev ${label}]`, JSON.stringify(r)); return r; }
                await radio.first().check();
                const w = await reviewerWarning(page);
                r.warning = w.shown ? {text: w.text, buttons: w.buttons, cls: w.cls, role: w.role} : false;
                await snap(page, `rev-${label}-picked`, {warning: r.warning});
                if (w.shown) {
                    await loc(page, `anonymous-review warning (${label})`, w.loc);
                    await w.loc.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                    await w.loc.waitFor({state: 'hidden', timeout: 6000}).catch(() => {});
                    await idle(page);
                }
                r.stillChosen = await radio.first().isChecked().catch(() => null);
                r.boxes = (await winRead(win)).boxes;
                if (assign) {
                    r.ok = await pressOK(page, win);
                    if (r.ok.windowStillOpen) { await closeWin(page, win); await relandIfStuck(page); }
                    r.panel = (await panelRead(page)).items;
                    await snap(page, `rev-${label}-after-ok`, {r});
                } else await closeWin(page, win);
                out[label] = r;
                log(`[rev ${label}]`, JSON.stringify({warning: r.warning && {text: flat(r.warning.text, 90), buttons: r.warning.buttons}, stillChosen: r.stillChosen, status: r.ok && r.ok.saveStatus, notices: r.ok && r.ok.notices.map((n) => n.text), panel: r.panel}));
                return r;
            };
            const sfx = Date.now().toString(36).slice(-4);
            const fresh = async (ctx, submitter, key, decisions, reviewers) => {
                const s = await app.api.createSubmission({tag: `${ctx}${key}${sfx}`.slice(0, 32), context: ctx, submitter, title: `K2 ${key} ${sfx}`, decisions, reviewRounds: [{reviewers}]});
                return {id: s.submissionId, stage: s.stageId, rounds: s.reviewRounds};
            };
            const Rv = await fresh(sc.M.ctx, `${t}au`, 'rv', ['sendExternalReview'], [{username: `${t}rv`, status: 'accepted'}, {username: `${t}rvd`, status: 'declined'}]);
            const Ri = isOMP ? await fresh(sc.M.ctx, `${t}au`, 'ri', ['sendInternalReview'], [{username: `${t}rvi`, status: 'accepted'}]) : null;
            for (const key of ['VA', 'VO']) if (sc[key]) sc[key].S = await fresh(sc[key].ctx, `${sc[key].t}au`, 's', ['sendExternalReview'], [{username: `${sc[key].t}rv`, status: 'accepted'}]);
            out.seeded = {Rv, Ri, VA: sc.VA && sc.VA.S, VO: sc.VO && sc.VO.S};
            // the window's own options, as its form's HTML carries them (the browser's own traffic)
            const idsSeen = [];
            page.on('response', async (r) => {
                if (!/add-participant|addParticipant/i.test(r.url())) return;
                const b = await r.text().catch(() => '');
                const m = b.match(/anonymousReviewerIds\\?"?\s*:\s*(\[[^\]]*\])/);
                idsSeen.push({url: r.url().replace(/^.*index\.php/, ''), ids: m ? m[1] : null});
            });
            await as(page, 'mgr');
            if (Rv) {
                const rk = roundKey(Rv);
                await probeCase('rv-fc-control', sc.M.ctx, Rv, rk, L.funding, u.fc.name);
                await probeCase('rv-declined', sc.M.ctx, Rv, rk, L.funding, u.rvd.name);
                await probeCase('rv-subtab-translator', sc.M.ctx, Rv, 'workflow_1', L.translator, u.rv.name);
                await probeCase('rv-double-anon-translator', sc.M.ctx, Rv, rk, L.translator, u.rv.name);
                await probeCase('rv-double-anon', sc.M.ctx, Rv, rk, L.funding, u.rv.name, {assign: true});
                // the reviewer-only account in every offered role
                await openWf(page, sc.M.ctx, Rv.id, rk, 'rev-rvo-panel');
                const win = await openAssign(page);
                const opts = (await winRead(win)).select.options;
                out.rvoByRole = {};
                for (const o of opts) { await chooseRole(page, win, o); await search(page, win, 'Ola'); out.rvoByRole[o] = (await winRead(win)).rowCount; }
                await snap(page, 'rev-rvo-search', {rvoByRole: out.rvoByRole});
                await closeWin(page, win);
                log('[rev rvo]', JSON.stringify(out.rvoByRole));
                // the review panel's own reading of the review type
                await openWf(page, sc.M.ctx, Rv.id, rk, 'rev-Rv-review-panel');
            }
            if (sc.M.RvC) await probeCase('rvc-copyediting', sc.M.ctx, sc.M.RvC, 'workflow_4', L.translator, u.rv.name);
            if (Ri) await probeCase('ri-internal', sc.M.ctx, Ri, roundKey(Ri), L.funding, u.rvi.name, {assign: true});
            for (const key of ['VA', 'VO']) {
                const V = sc[key];
                if (!V || !V.S) continue;
                await signIn(page, `${V.t}mgr`, {contextPath: V.ctx}); await idle(page);
                await probeCase(`${key.toLowerCase()}-${V.mode}`, V.ctx, V.S, roundKey(V.S), L.funding, 'Rae Reviewer', {assign: true});
            }
            out.idsSeen = idsSeen;
            record('rev', out);
            log('[rev ids]', JSON.stringify(idsSeen));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- mgrlevel: a manager-level assignment (no "Permissions" box) and what the page's own data says of it ----------
    if (on('mgrlevel')) await sect('mgrlevel', async () => {
        const {page, close} = await session();
        try {
            const out = {};
            const bodies = [];
            page.on('response', async (r) => {
                if (!/\/api\/v1\/submissions\/\d+(\/participants\/\d+)?(\?|$)/.test(r.url()) || r.request().method() !== 'GET') return;
                const b = await r.json().catch(() => null);
                if (!b) return;
                if (Array.isArray(b)) bodies.push(b.map((p) => ({name: p.fullName, assignments: (p.stageAssignments || []).map((a) => ({role: a.stageAssignmentUserGroup && a.stageAssignmentUserGroup.name, stage: a.stageAssignmentStageId, recommendOnly: a.recommendOnly, canChangeMetadata: a.canChangeMetadata}))})));
            });
            await as(page, 'mgr');
            await openWf(page, sc.M.ctx, isOPS ? sc.M.A.id : sc.M.PR.id, isOPS ? L.stageA : 'workflow_5', 'mgrlevel-A-before');
            const k = isOPS ? 'mgr2' : (process.env.MGRK || 'pe');
            const role = isOPS ? 'Preprint Server manager' : (process.env.MGRK === 'ed' ? L.editor : 'Production editor');
            const win = await openAssign(page);
            await chooseRole(page, win, role); await search(page, win, '');
            out.list = (await winRead(win)).rows.map((r) => r.text);
            await pick(page, win, k);
            out.boxes = (await winRead(win)).boxes;
            await snap(page, 'mgrlevel-picked', {boxes: out.boxes});
            out.ok = await pressOK(page, win);
            if (out.ok.windowStillOpen) { await closeWin(page, win); }
            bodies.length = 0;
            await relandIfStuck(page);
            await sleep(1000);
            const last = bodies[bodies.length - 1] || [];
            out.stageAssignments = bodies.slice(-3);
            out.panel = (await panelRead(page)).items;
            await snap(page, 'mgrlevel-after', {out});
            record('mgrlevel', out);
            log('[mgrlevel]', JSON.stringify({list: out.list, ro: out.boxes.recommendOnly && [out.boxes.recommendOnly.visible, out.boxes.recommendOnly.checked], md: out.boxes.canChangeMetadata && [out.boxes.canChangeMetadata.visible, out.boxes.canChangeMetadata.checked], status: out.ok.saveStatus, notices: out.ok.notices.map((n) => n.text), panel: out.panel, sa: out.stageAssignments}));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- roles: context R, the roles' own settings changed (Rule 4 other end) ---------------------------------------
    if (on('roles')) await sect('roles', async () => {
        const R = sc.R;
        const {page, close} = await session();
        try {
            await signIn(page, `${R.t}mgr`, {contextPath: R.ctx}); await idle(page);
            await openWf(page, R.ctx, R.S.id, L.stageA, 'roles-R-panel');
            const sweep = await rolesSweep(page, 'roles-R');
            if (isOPS) await carryLeg(page, 'roles-R', R.ctx, R.S, L.se, 'se', L.author, null, 'Abe Authortwo');
            // the same sweep on context M for the install defaults (Submission stage, and Copyediting/Production)
            await as(page, 'mgr');
            const out = {R: sweep};
            const visits = isOPS ? [['A', L.stageA]] : [['A', 'workflow_1'], ['RvC', 'workflow_4'], ['PR', 'workflow_5']];
            for (const [k, key] of visits) {
                if (!sc.M[k]) continue;
                await openWf(page, sc.M.ctx, sc.M[k].id, key, `roles-M-${k}-panel`);
                out[`M-${k}`] = await rolesSweep(page, `roles-M-${k}`, {skip: ['rv', 'rvd']});
            }
            if (!isOPS) {
                await openWf(page, sc.M.ctx, sc.M.A.id, 'workflow_1', 'roles-M-carry-panel');
                out.carry = await carryLeg(page, 'roles-M', sc.M.ctx, sc.M.A, L.se, 'se2', L.funding, null, 'Eli Ended');
            }
            record('roles', out);
            await signOut(page);
        } finally { await close(); }
    });
});
