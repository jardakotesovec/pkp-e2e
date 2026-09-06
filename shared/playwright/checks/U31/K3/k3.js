// U31 claim check, chunk K3: the editorial view of the workflow screen — the
// "Reviewers Suggested by Author" panel on the Submission and Review stages
// (Rule 8), the row's "Add Reviewer" and the three modes of the window it opens
// (Rule 9), the side effects (mail, activity log), the Coverage rows, and
// register entry OMP1 (Internal Review on a press).
// Spec: docs/specs/U31-reviewer-suggestions.md lines 104–145, 185–239, 337–351.
//
// OJS/OMP: seeds a scratch context with the setting ON and one account per
// permission level, plus a throwaway reviewer (the "account with a Reviewer
// role" path) and a reader (the "account without a Reviewer role" path); seeds
// R1 (in review, four suggestions: no account / reviewer / reader / one left
// pending), R2 (in review, one suggestion), S1 (Submission stage, two), D1 (a
// draft for the author's add/edit/delete) and, on OMP, I1 (Internal Review,
// three). Phases:
//   seed     the context and the submissions
//   review   manager on R1: the panel, the row menu, the three Add Reviewer modes, mail, the activity log, the Submission stage
//   r2       section editor on R2: one suggestion → "Add Reviewer" → the panel is gone
//   setting  manager: the box off → S1/R1 without the panel → on → the panel is back
//   side     author on D1: add, edit, delete a suggestion, submit; mail count; manager reads D1's activity log
//   copy     manager on R1: "Accept Submission" → Copyediting; the Review stage rows afterwards
//   omp      (OMP only) Internal Review: no panel; its Add Reviewer list; an internal reviewer from it; "Send to External Review"; the External Review panel
//
//   PROBE_FEATURE=U31 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U31/K3/k3.js
//   PHASES=seed,review,r2,setting,side,copy,omp,sweep2,omp2   (default all; r1r re-runs only the Rowan path on R1; later phases reuse k3-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const ALL = ['seed', 'review', 'r2', 'setting', 'side', 'copy', 'omp', 'sweep2', 'omp2'];
//   sweep2   both apps: R3 (a fresh no-account suggestion) — "Back to Search", Cancel, an empty username; the site admin's window; S0/R0 (no suggestion, no panel)
//   omp2     OMP: I2 in Internal Review — a fresh no-account suggestion turned into an internal reviewer from the window's list, then "Send to External Review" and the External Review panel
// r1r: only the Rowan Reviewer path on R1 (a re-run after a failed section)
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); }
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
        buttons: [...d.querySelectorAll('button, a[role=button]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
// The "Reviewers Suggested by Author" panel: heading present, rows (avatar text, lines, buttons), the More Actions buttons on the whole screen.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,span,div')].find((e) => vis(e) && e.children.length === 0 && e.textContent.trim() === 'Reviewers Suggested by Author');
    let rows = null; let panelText = null;
    if (h) {
        let c = h;
        for (let i = 0; i < 5 && c.parentElement && !c.querySelector('li'); i++) c = c.parentElement;
        panelText = c.innerText.slice(0, 3000);
        rows = [...c.querySelectorAll('li')].map((li) => ({
            avatar: (li.querySelector('[class*="vatar"], [class*="Avatar"]') || {}).innerText?.trim() ?? null,
            lines: li.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
            buttons: [...li.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim()),
        }));
    }
    const more = [...document.querySelectorAll('button')].filter((b) => vis(b) && /More Actions/i.test(b.getAttribute('aria-label') || b.innerText)).map((b) => (b.getAttribute('aria-label') || b.innerText).trim());
    const headings = [...document.querySelectorAll('[role=dialog] h1, [role=dialog] h2, [role=dialog] h3, [role=dialog] h4')].filter(vis).map((e) => e.innerText.trim());
    const stageNav = [...document.querySelectorAll('[role=dialog] nav a, [role=dialog] nav button, [role=dialog] [role=menuitem]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40);
    const actionButtons = [...document.querySelectorAll('[role=dialog] button')].filter(vis).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 60);
    const errors = [...document.querySelectorAll('[role=alert], .pkpNotification, [role=status]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
    return {panelHeadingPresent: !!h, rows, panelText, moreActions: more, headings, stageNav, actionButtons, errors};
});
const reviewersTable = (page) => page.getByRole('table', {name: 'Reviewers', exact: true}).innerText().then((t) => flat(t, 1500)).catch(() => null);
// The legacy Add Reviewer window: mode headings, visible fields, selects, message text, dates.
const windowInfo = async (page) => {
    const d = page.locator('[role="dialog"]:visible').last();
    const info = await d.evaluate((root) => {
        const vis = (e) => e.offsetParent !== null;
        const txt = root.innerText;
        return {
            title: (root.getAttribute('aria-label') || (root.querySelector('h1,h2,.modal__title,[class*="title"]') || {}).innerText || '').trim().slice(0, 120),
            headings: [...root.querySelectorAll('h1,h2,h3,h4,h5,legend,.section_title,.pkpListPanel__title,.listPanel__title')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 30),
            has: {selectedReviewer: /Selected Reviewer/.test(txt), locate: /Locate a Reviewer/.test(txt), suggestions: /Select a Reviewer from Reviewer Suggestions/.test(txt), enroll: /Enroll Existing User/.test(txt), create: /Create New Reviewer/.test(txt), change: /\bChange\b/.test(txt)},
            fields: [...root.querySelectorAll('input, select, textarea')].filter((e) => vis(e) || e.type === 'hidden').map((e) => ({name: e.name, type: e.type || e.tagName.toLowerCase(), value: e.type === 'select-one' ? (e.selectedOptions[0] || {}).text : (e.type === 'radio' || e.type === 'checkbox' ? `${e.value}${e.checked ? ' [checked]' : ''}` : e.value), visible: vis(e), options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.text.trim()) : undefined})).filter((f) => f.name && !/^(csrfToken)$/.test(f.name)).slice(0, 60),
            labels: [...root.querySelectorAll('label, .pkpFormFieldLabel, .label')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40),
            buttons: [...root.querySelectorAll('button, a.pkp_button, input[type=submit]')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value).trim()).filter(Boolean).slice(0, 40),
            text: txt.slice(0, 3500),
        };
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
    info.iframes = await d.locator('iframe').evaluateAll((els) => els.map((e) => ({id: e.id, visible: e.getClientRects().length > 0}))).catch(() => []);
    const fr = d.locator('iframe:visible').first();
    info.message = (await fr.count()) ? await d.frameLocator('iframe:visible').first().locator('body').innerText().then((t) => flat(t, 600)).catch(() => null) : null;
    return info;
};
async function waitReviewerForm(page) {
    const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
    await dlg.waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
    await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 30000}).catch(() => {});
    await idle(page);
    return dlg;
}
// Press the form's own "Add Reviewer" and wait for the grid to answer; record the browser's traffic to the reviewer grid.
async function pressAddReviewer(page, label) {
    const form = page.locator('[role="dialog"]:visible').last();
    const st = [];
    const onR = (r) => { if (r.status() >= 400 || /reviewer-grid|reviewers\/suggestions|reviewer\/reviewer-grid/.test(r.url())) st.push({m: r.request().method(), s: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 220)}); };
    page.on('response', onR);
    const submit = form.getByRole('button', {name: 'Add Reviewer', exact: true}).last();
    await loc(page, `${label}: the form's "Add Reviewer"`, submit);
    await submit.click();
    await page.waitForResponse((r) => /reviewer-grid/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).catch(() => {});
    await idle(page);
    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
    await page.waitForTimeout(800);
    await idle(page);
    page.off('response', onR);
    return {responses: st, dialogs: await dialogTexts(page)};
}
async function closeTop(page) {
    const top = page.locator('[role="dialog"]:visible').last();
    let btn = top.getByRole('button', {name: 'Cancel', exact: true}).last();
    if (!(await btn.count())) btn = top.getByRole('button', {name: /^(Close|OK)$/}).last();
    if (await btn.count()) { await btn.click(); await idle(page); }
    return page.locator('[role="dialog"]:visible').count();
}
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
async function activityLog(page, name) {
    const btn = page.getByRole('button', {name: /Activity Log/}).first();
    if (!(await btn.count())) { record(name, {absent: true, buttons: (await dialogTexts(page)).map((d) => d.buttons)}); return null; }
    await btn.click();
    const dlg = page.locator('[role="dialog"]:visible').last();
    await dlg.waitFor({timeout: 30000}).catch(() => {});
    await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
    await idle(page);
    const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
    const s = await snap(page, name, {rows, dialogText: flat(await dlg.innerText().catch(() => ''), 4000)});
    log(`[${name}]`, JSON.stringify(rows).slice(0, 1500));
    const close = dlg.getByRole('button', {name: /^Close$/}).first();
    if (await close.count()) { await close.click(); await idle(page); }
    return s;
}
async function inbox(app, email) {
    const list = await app.mail.inboxFor(email, {timeout: 8000}).catch(() => []);
    const out = [];
    for (const m of list.slice(0, 8)) {
        const f = await app.mail.fullMessage(m.ID).catch(() => null);
        out.push({id: m.ID, subject: f ? f.Subject : m.Subject, from: f ? f.From : null, text: f ? flat(f.Text, 300) : null});
    }
    return out;
}
// The decision Composer: press the named decision, Continue to "Record Decision", press it, return to the workflow.
async function recordDecision(page, name, label) {
    const btn = page.getByRole('button', {name, exact: true}).first();
    await loc(page, `${label}: "${name}"`, btn);
    await btn.click(); await idle(page);
    const choose = page.locator('[role="dialog"]:visible').last();
    const pre = await choose.innerText().catch(() => '');
    const info = {preDialog: flat(pre, 500), steps: null};
    const next = choose.getByRole('button', {name: /^(Next|Continue)$/}).first();
    if (!/decision/.test(page.url()) && (await next.count())) { await next.click(); await idle(page); }
    await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
    await idle(page);
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    await idle(page);
    info.url = page.url();
    await snap(page, `${label}-decision-page`, info);
    const cont = page.getByRole('button', {name: 'Continue', exact: true});
    const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
    const seen = [];
    for (let i = 0; i < 6 && !(await rec.isVisible().catch(() => false)); i++) {
        seen.push(flat(await page.locator('main, body').first().innerText().then((t) => (t.match(/Notify (Authors|Reviewers)|Select Files|Files for Copyediting/g) || []).join(',')), 200));
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await cont.first().click(); await idle(page);
    }
    info.steps = seen;
    await rec.click(); await idle(page);
    await page.waitForTimeout(1000); await idle(page);
    const s = await snap(page, `${label}-decision-recorded`, {dialogs: await dialogTexts(page), steps: seen});
    log(`[${label} decision]`, page.url(), flat(s.text?.dialog || s.text?.main, 200));
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    if (app.name === 'ops') { log('[k3] OPS has no surface in this chunk; skipped'); return; }
    const isOMP = app.name === 'omp';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const wizard = (id) => ctxUrl(`/submission?id=${id}`);
    const roundKey = (rounds, stageId) => { const r = (rounds || []).find((x) => !stageId || x.stageId === stageId) || (rounds || [])[0]; return r ? `workflow_${r.stageId}_${r.id}` : 'workflow_3_1'; };
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const mail = (u) => `${u}@mail.test`;

    // ---- seed --------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u31k3');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rae', familyName: 'Reader'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U31 K3 ${t}`, acronym: 'U31K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users, review: {reviewerSuggestionEnabled: true}});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const u = sc.users;
        const X = {givenName: 'Xavier', familyName: 'Noaccount', email: `xavier.${t}@mail.test`, affiliation: 'Nowhere University', suggestionReason: 'Knows the field well.'};
        const R = {givenName: 'Rowan', familyName: 'Reviewer', email: mail(u.rev), affiliation: 'Reviewer College', suggestionReason: 'Has reviewed for us before.'};
        const D = {givenName: 'Rae', familyName: 'Reader', email: mail(u.rd), affiliation: 'Reader Institute', suggestionReason: 'Wrote the standard textbook.'};
        const Y = {givenName: 'Yara', familyName: 'Pending', email: `yara.${t}@mail.test`, affiliation: 'Pending Polytechnic', suggestionReason: 'Left pending on purpose.'};
        sc.sugg = {X, R, D, Y};
        const parts = [{username: u.se, role: 'sectionEditor'}];
        const r1 = await app.api.createSubmission({tag: `${t}r1`, context: sc.contextPath, submitter: u.au, title: `K3 R1 in review ${t}`, decisions: ['sendExternalReview'], reviewerSuggestions: [X, R, D, Y], participants: parts});
        const r2 = await app.api.createSubmission({tag: `${t}r2`, context: sc.contextPath, submitter: u.au, title: `K3 R2 one suggestion ${t}`, decisions: ['sendExternalReview'], reviewerSuggestions: [R], participants: parts});
        const s1 = await app.api.createSubmission({tag: `${t}s1`, context: sc.contextPath, submitter: u.au, title: `K3 S1 submission stage ${t}`, reviewerSuggestions: [X, R], participants: parts});
        const d1 = await app.api.createSubmission({tag: `${t}d1`, context: sc.contextPath, submitter: u.au, title: `K3 D1 draft ${t}`, submitted: false});
        Object.assign(sc, {r1: r1.submissionId, r1Rounds: r1.reviewRounds, r2: r2.submissionId, r2Rounds: r2.reviewRounds, s1: s1.submissionId, d1: d1.submissionId});
        if (isOMP) {
            const i1 = await app.api.createSubmission({tag: `${t}i1`, context: sc.contextPath, submitter: u.au, title: `K3 I1 internal review ${t}`, decisions: ['sendInternalReview'], reviewerSuggestions: [X, R, D], participants: parts});
            sc.i1 = i1.submissionId; sc.i1Rounds = i1.reviewRounds;
        }
        save();
        log('[seed]', app.name, JSON.stringify({ctx: sc.contextPath, r1: sc.r1, r1Rounds: sc.r1Rounds, r2: sc.r2, s1: sc.s1, d1: sc.d1, i1: sc.i1, i1Rounds: sc.i1Rounds}));
    }
    const u = sc.users; const S = sc.sugg;

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 600)})), reviewers: await reviewersTable(page), ...(extra || {})});
        log(`[${label}]`, app.name, 'panel:', info.panelHeadingPresent, 'rows:', info.rows ? info.rows.length : null, 'more:', JSON.stringify(info.moreActions), 'dialogs:', dialogs.length);
        return {info, dialogs, s};
    }
    // The row's "…" › "Add Reviewer": open it and read the window.
    async function openFromRow(page, fullName, label) {
        const more = page.getByRole('button', {name: new RegExp(`${fullName} More Actions`)}).first();
        await more.waitFor({timeout: 15000});
        await loc(page, `panel row "${fullName}": its "…" menu`, more);
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-row-menu`, {items});
        const add = page.getByRole('menuitem', {name: /Add Reviewer/}).first();
        await add.click();
        await waitReviewerForm(page);
        const w = await windowInfo(page);
        const s = await snap(page, `${label}-window`, {window: w, menu: items});
        log(`[${label} window]`, app.name, JSON.stringify(w.has), 'title', w.title, 'fields', JSON.stringify(w.fields.filter((f) => f.visible).map((f) => `${f.name}=${String(f.value).slice(0, 40)}`)));
        return {w, s};
    }

    // ---- review: the manager on R1 -------------------------------------------
    if (on('review')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            const mailBefore = {rev: await app.mail.count({to: mail(u.rev)}), rd: await app.mail.count({to: mail(u.rd)}), x: await app.mail.count({to: S.X.email}), total: await app.mail.messageCount()};
            record('r1-mail-before', mailBefore);
            // Rule 8, 8b: the Review stage panel with four pending rows
            const r = await openWorkflow(page, workflow(sc.r1, key), 'r1-review-mgr');
            await loc(page, 'review stage: the panel heading', page.getByText('Reviewers Suggested by Author', {exact: true}).first());
            // Sweep: every row's menu, opened and read
            for (const n of ['Xavier Noaccount', 'Rowan Reviewer', 'Rae Reader', 'Yara Pending']) {
                await sect(`menu ${n}`, async () => {
                    const more = page.getByRole('button', {name: new RegExp(`${n} More Actions`)}).first();
                    await more.click(); await idle(page);
                    record(`r1-menu-${n.split(' ')[0].toLowerCase()}`, {label: await more.getAttribute('aria-label'), items: await menuItems(page)});
                    await page.keyboard.press('Escape'); await idle(page);
                });
            }
            if ((await page.locator('[role="dialog"]:visible').count()) === 0) await openWorkflow(page, workflow(sc.r1, key), 'r1-review-mgr-reopened');
            await driveR(page, key, mailBefore);
            await signOut(page);
        } finally { await close(); }
    }
    async function driveR(page, key, mailBefore) {
        {
            // Rule 9, mode 1: the reviewer's account → "Selected Reviewer"
            await sect('R window', async () => {
                const {w} = await openFromRow(page, 'Rowan Reviewer', 'r1-add-R');
                // Sweep: type in the message, then the header "Close": does anything ask?
                const topd = page.locator('[role="dialog"]:visible').last();
                if (await topd.locator('iframe:visible').count()) { const body = topd.frameLocator('iframe:visible').first().locator('body'); await body.click({timeout: 5000}).catch(() => {}); await page.keyboard.type(' K3 marker.'); }
                const top = page.locator('[role="dialog"]:visible').last();
                const hdrClose = top.getByRole('button', {name: /^Close$/}).first();
                record('r1-add-R-header-close-present', {count: await hdrClose.count(), buttons: w.buttons});
                if (await hdrClose.count()) { await hdrClose.click(); await idle(page); await page.waitForTimeout(500); }
                const after = await dialogTexts(page);
                await snap(page, 'r1-add-R-after-header-close', {dialogs: after.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 400)})), info: await wfInfo(page)});
                log('[R header close]', app.name, 'dialogs', after.length, JSON.stringify(after.map((d) => d.text.slice(0, 80))));
                // a confirm may be up: take the "leave" branch if offered, then reopen
                const conf = page.locator('[role="dialog"]:visible').filter({hasText: /unsaved|sure|discard|leave|close/i}).last();
                if ((await conf.count()) && after.length > 2) { const b = conf.getByRole('button').filter({hasText: /OK|Yes|Close|Discard|Leave|Confirm/}).first(); if (await b.count()) { await b.click(); await idle(page); } }
                if (!(await page.getByRole('dialog', {name: /Add Reviewer/i}).count())) await openFromRow(page, 'Rowan Reviewer', 'r1-add-R-2');
                const w2 = await windowInfo(page);
                record('r1-add-R-before-submit', w2);
                const res = await pressAddReviewer(page, 'r1-add-R');
                const s = await snap(page, 'r1-add-R-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 500)})), info: await wfInfo(page), reviewers: await reviewersTable(page)});
                log('[R submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.length : null, 'reviewers', flat(s.reviewers, 200));
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-R-reload');
            const mailAfterR = {rev: await app.mail.count({to: mail(u.rev)}), total: await app.mail.messageCount(), revInbox: await inbox(app, mail(u.rev))};
            record('r1-mail-after-R', mailAfterR);
            log('[mail after R]', app.name, JSON.stringify(mailAfterR).slice(0, 600));
            await sect('activity log after R', () => activityLog(page, 'r1-activity-log-after-R'));
        }
    }
    if (on('r1r')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-mgr-r1r');
            await driveR(page, key, null);
            await signOut(page);
        } finally { await close(); }
    }
    if (on('review')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            if ((await page.locator('[role="dialog"]:visible').count()) === 0) await openWorkflow(page, workflow(sc.r1, key), 'r1-review-mgr-2');
            // Rule 9, mode 2: an account without a Reviewer role → "Enroll Existing User"
            await sect('D window', async () => {
                if ((await page.locator('[role="dialog"]:visible').count()) === 0) await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-D');
                const {w} = await openFromRow(page, 'Rae Reader', 'r1-add-D');
                const form = page.locator('[role="dialog"]:visible').last();
                const sel = form.locator('select[name="userGroupId"]');
                if (await sel.count()) {
                    const opts = await sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected})));
                    record('r1-add-D-role-options', opts);
                    const pick = opts.find((o) => /External Reviewer/i.test(o.text)) || opts.find((o) => /Reviewer/i.test(o.text) && o.value);
                    if (pick) await sel.selectOption(pick.value);
                    await idle(page);
                }
                const res = await pressAddReviewer(page, 'r1-add-D');
                const s = await snap(page, 'r1-add-D-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 500)})), info: await wfInfo(page), reviewers: await reviewersTable(page)});
                log('[D submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.length : null, 'reviewers', flat(s.reviewers, 200));
                if (res.dialogs.length > 1) { record('r1-add-D-form-after-refusal', await windowInfo(page)); await closeTop(page); }
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-D-reload');
            record('r1-mail-after-D', {rd: await app.mail.count({to: mail(u.rd)}), rdInbox: await inbox(app, mail(u.rd)), total: await app.mail.messageCount()});
            // Rule 8a (t6): the Submission stage lists every suggestion, matched ones included, no row action
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-mgr');
            // Rule 9, mode 3: no account → "Create New Reviewer"
            await sect('X window', async () => {
                await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-X');
                const {w} = await openFromRow(page, 'Xavier Noaccount', 'r1-add-X');
                const form = page.locator('[role="dialog"]:visible').last();
                const suggest = form.getByRole('button', {name: 'Suggest', exact: true});
                await loc(page, 'Create New Reviewer: "Suggest"', suggest);
                const before = await form.locator('input[name="username"]').inputValue().catch(() => null);
                await suggest.click(); await idle(page); await page.waitForTimeout(500);
                const username = await form.locator('input[name="username"]').inputValue().catch(() => null);
                record('r1-add-X-suggest', {before, after: username});
                const res = await pressAddReviewer(page, 'r1-add-X');
                const s = await snap(page, 'r1-add-X-after-submit', {username, responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 500)})), info: await wfInfo(page), reviewers: await reviewersTable(page)});
                log('[X submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.length : null, 'reviewers', flat(s.reviewers, 200));
                if (res.dialogs.length > 1) { record('r1-add-X-form-after-refusal', await windowInfo(page)); await closeTop(page); }
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-X-reload');
            record('r1-mail-after-X', {x: await app.mail.count({to: S.X.email}), xInbox: await inbox(app, S.X.email), total: await app.mail.messageCount(), before: (() => { try { return JSON.parse(fs.readFileSync(path.join(outDir(), `r1-mail-before-${app.name}.json`), "utf8")); } catch (e) { return null; } })()});
            await sect('activity log after X', () => activityLog(page, 'r1-activity-log-after-X'));
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-mgr-after-X');
            // Sweep: the Reviewers table's row menus after the adds
            await sect('reviewer row menu', async () => {
                await openWorkflow(page, workflow(sc.r1, key), 'r1-review-sweep');
                const tbl = page.getByRole('table', {name: 'Reviewers', exact: true});
                const more = tbl.getByRole('button', {name: /More Actions/}).first();
                if (await more.count()) { await more.click(); await idle(page); record('r1-reviewer-row-menu', {label: await more.getAttribute('aria-label'), items: await menuItems(page)}); await page.keyboard.press('Escape'); }
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- r2: the section editor, one suggestion → gone (8c) ---------------------
    if (on('r2')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.se);
            const key = roundKey(sc.r2Rounds, 3);
            await openWorkflow(page, workflow(sc.r2, key), 'r2-review-se');
            await sect('R2 add R', async () => {
                await openFromRow(page, 'Rowan Reviewer', 'r2-add-R');
                const res = await pressAddReviewer(page, 'r2-add-R');
                const s = await snap(page, 'r2-add-R-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 500)})), info: await wfInfo(page), reviewers: await reviewersTable(page)});
                log('[R2 submit]', app.name, JSON.stringify(res.responses), 'panel', s.info.panelHeadingPresent, 'reviewers', flat(s.reviewers, 200));
            });
            await openWorkflow(page, workflow(sc.r2, key), 'r2-review-se-reload');
            await openWorkflow(page, workflow(sc.r2, 'workflow_1'), 'r2-submission-se');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- setting: 8d (t7) --------------------------------------------------------
    if (on('setting')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const setupPanel = () => page.locator('#reviewSetup');
            async function gotoReviewSetup() {
                await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                await page.getByRole('tab').first().waitFor({timeout: 30000}).catch(() => {});
                await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
                const side = page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Setup', exact: true});
                if (await side.count()) await side.first().click();
                await setupPanel().locator('input[name="reviewerSuggestionEnabled"]').waitFor({timeout: 30000});
                await idle(page);
            }
            async function setBox(want, label) {
                await gotoReviewSetup();
                const box = setupPanel().locator('input[name="reviewerSuggestionEnabled"]');
                const was = await box.isChecked();
                if (was !== want) await box.setChecked(want);
                await setupPanel().getByRole('button', {name: 'Save', exact: true}).click();
                await setupPanel().locator('[role="status"]:has-text("Saved")').waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                record(label, {was, now: await box.isChecked(), status: await setupPanel().locator('[role="status"]').allInnerTexts().catch(() => [])});
            }
            await setBox(false, 'setting-off');
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.s1), 's1-submission-setting-off');
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-setting-off');
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-setting-off');
            await setBox(true, 'setting-on');
            await openWorkflow(page, workflow(sc.s1), 's1-submission-setting-on');
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-setting-on');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- side: the author adds, edits, deletes on D1 and submits; mail; the activity log -----
    if (on('side')) {
        const {page, close} = await launch(app);
        try {
            const totalBefore = await app.mail.messageCount();
            const auBefore = await app.mail.count({to: mail(u.au)});
            await signInAs(page, u.au);
            await page.goto(wizard(sc.d1)); await idle(page);
            const current = () => page.locator('.pkpSteps__step__label--current');
            const footer = () => page.locator('.submissionWizard__footer');
            await current().first().waitFor({timeout: 30000});
            // Upload Files first (the submit needs a file)
            await sect('upload', async () => {
                const genre = isOMP ? 'Book Manuscript' : 'Article Text';
                const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
                await chooser.setFiles(PDF);
                const gb = page.getByRole('button', {name: genre, exact: true});
                await gb.waitFor({timeout: 30000}); await gb.click();
                await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText(genre).first().waitFor({timeout: 30000});
                await idle(page);
            });
            async function continueTo(label) {
                for (let i = 0; i < 7; i++) {
                    await current().first().waitFor({timeout: 30000});
                    const cur = (await current().first().innerText()).trim();
                    if (new RegExp(`${label}\\s*$`).test(cur)) return;
                    await footer().getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
                }
            }
            await continueTo('Reviewer Suggestions');
            await snap(page, 'd1-step');
            const d = () => page.getByRole('dialog').last();
            const Z = {givenName: 'Zed', familyName: 'Sideeffect', email: `zed.${sc.tag}@mail.test`, affiliation: 'Side Effects Lab', reason: 'Added on screen.'};
            await sect('add', async () => {
                await page.getByRole('button', {name: 'Add Reviewer Suggestion'}).click();
                await d().getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30000});
                await page.waitForFunction(() => { const f = document.querySelector('iframe[id*="suggestionReason"]'); const mce = window.tinyMCE || window.tinymce; return f && mce && mce.get(f.id.replace(/_ifr$/, ''))?.initialized; }, null, {timeout: 30000}).catch(() => {});
                await d().getByRole('textbox', {name: /^Given Name/}).first().fill(Z.givenName);
                await d().getByRole('textbox', {name: /^Family Name/}).first().fill(Z.familyName);
                await d().getByRole('textbox', {name: /^Email/}).first().fill(Z.email);
                await d().getByRole('textbox', {name: /^Affiliation/}).first().fill(Z.affiliation);
                const body = d().frameLocator('iframe[id*="suggestionReason"]').first().locator('body');
                await body.click(); await body.fill(Z.reason);
                await d().getByRole('button', {name: 'Save', exact: true}).click(); await idle(page); await page.waitForTimeout(500); await idle(page);
                await snap(page, 'd1-added');
            });
            await sect('edit', async () => {
                const row = page.locator('.listPanel__item').filter({hasText: Z.email}).first();
                await row.getByRole('button', {name: /Edit/}).click(); await idle(page);
                await d().getByRole('textbox', {name: /^Affiliation/}).first().waitFor({timeout: 30000});
                await page.waitForTimeout(500);
                await d().getByRole('textbox', {name: /^Affiliation/}).first().fill('Side Effects Lab (edited)');
                await d().getByRole('button', {name: 'Save', exact: true}).click(); await idle(page); await page.waitForTimeout(500); await idle(page);
                await snap(page, 'd1-edited');
            });
            await sect('delete', async () => {
                const row = page.locator('.listPanel__item').filter({hasText: Z.email}).first();
                await row.getByRole('button', {name: /Delete/}).click(); await idle(page);
                const c = page.locator('[role="dialog"]:visible').filter({hasText: /remove this suggestion|Delete Reviewer Suggestion/}).first();
                await c.waitFor({timeout: 15000});
                await c.getByRole('button', {name: 'Delete Reviewer Suggestion', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                await snap(page, 'd1-deleted');
            });
            // one entry left in place so the submitted D1 has a suggestion, then submit
            await sect('add2', async () => {
                await page.getByRole('button', {name: 'Add Reviewer Suggestion'}).click();
                await d().getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30000});
                await page.waitForFunction(() => { const f = document.querySelector('iframe[id*="suggestionReason"]'); const mce = window.tinyMCE || window.tinymce; return f && mce && mce.get(f.id.replace(/_ifr$/, ''))?.initialized; }, null, {timeout: 30000}).catch(() => {});
                await d().getByRole('textbox', {name: /^Given Name/}).first().fill('Wren');
                await d().getByRole('textbox', {name: /^Family Name/}).first().fill('Kept');
                await d().getByRole('textbox', {name: /^Email/}).first().fill(`wren.${sc.tag}@mail.test`);
                await d().getByRole('textbox', {name: /^Affiliation/}).first().fill('Kept College');
                const body = d().frameLocator('iframe[id*="suggestionReason"]').first().locator('body');
                await body.click(); await body.fill('Kept for the log.');
                await d().getByRole('button', {name: 'Save', exact: true}).click(); await idle(page); await page.waitForTimeout(500); await idle(page);
            });
            const mailMid = {total: await app.mail.messageCount(), au: await app.mail.count({to: mail(u.au)}), zed: await app.mail.count({to: Z.email})};
            record('d1-mail-after-add-edit-delete', {before: {total: totalBefore, au: auBefore}, after: mailMid});
            log('[side mail]', app.name, JSON.stringify({before: {total: totalBefore, au: auBefore}, after: mailMid}));
            await sect('submit', async () => {
                await continueTo('Review');
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
                await idle(page);
                await footer().getByRole('button', {name: 'Submit', exact: true}).click();
                const sd = page.getByRole('dialog').filter({hasText: /will be submitted to|submit/i}).last();
                await sd.waitFor({timeout: 30000}).catch(() => {});
                await sd.getByRole('button', {name: 'Submit', exact: true}).click();
                await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000}).catch(() => {});
                await idle(page);
                await snap(page, 'd1-submitted');
            });
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(sc.d1), 'd1-submission-mgr');
            await sect('d1 activity log', () => activityLog(page, 'd1-activity-log'));
            // Sweep: the dashboard's notifications / tasks for anything naming the suggestion
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            const s = await snap(page, 'd1-dashboard-mgr');
            record('d1-dashboard-mentions', {zed: /Zed|Sideeffect/.test(JSON.stringify(s)), wren: /Wren|Kept/.test(JSON.stringify(s))});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- copy: R1 to Copyediting; the Review stage rows afterwards (8b's other end) ----
    if (on('copy')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-accept');
            await sect('accept', () => recordDecision(page, 'Accept Submission', 'r1-accept'));
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-copyediting');
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-copyediting');
            await openWorkflow(page, workflow(sc.r1, 'workflow_4'), 'r1-copyediting-stage');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- sweep2: the window's other controls, the site admin, the no-suggestion control ----
    if (on('sweep2')) {
        const {page, close} = await launch(app);
        try {
            if (!sc.r3) {
                const t = sc.tag;
                const I = {givenName: 'Ines', familyName: 'Fresh', email: `ines.${t}@mail.test`, affiliation: 'Fresh Faculty', suggestionReason: 'A fresh no-account suggestion.'};
                sc.sugg.I = I;
                const parts = [{username: u.se, role: 'sectionEditor'}];
                const r3 = await app.api.createSubmission({tag: `${t}r3`, context: sc.contextPath, submitter: u.au, title: `K3 R3 sweep ${t}`, decisions: ['sendExternalReview'], reviewerSuggestions: [I, S.R], participants: parts});
                const s0 = await app.api.createSubmission({tag: `${t}s0`, context: sc.contextPath, submitter: u.au, title: `K3 S0 none ${t}`, participants: parts});
                const r0 = await app.api.createSubmission({tag: `${t}r0`, context: sc.contextPath, submitter: u.au, title: `K3 R0 none ${t}`, decisions: ['sendExternalReview'], participants: parts});
                Object.assign(sc, {r3: r3.submissionId, r3Rounds: r3.reviewRounds, s0: s0.submissionId, r0: r0.submissionId, r0Rounds: r0.reviewRounds});
                save();
            }
            const key = roundKey(sc.r3Rounds, 3);
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(sc.s0), 's0-submission-mgr');
            await openWorkflow(page, workflow(sc.r0, roundKey(sc.r0Rounds, 3)), 'r0-review-mgr');
            await openWorkflow(page, workflow(sc.r3, key), 'r3-review-mgr');
            await sect('back to search', async () => {
                await openFromRow(page, 'Ines Fresh', 'r3-add-I');
                const form = page.locator('[role="dialog"]:visible').last();
                const back = form.getByText('Back to Search', {exact: true}).first();
                record('r3-add-I-back-present', {count: await back.count()});
                if (await back.count()) {
                    await back.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                    await snap(page, 'r3-add-I-after-back', {window: await windowInfo(page), dialogs: (await dialogTexts(page)).length});
                }
                await closeTop(page);
                await snap(page, 'r3-after-cancel', {info: await wfInfo(page), dialogs: (await dialogTexts(page)).length});
            });
            await sect('empty username', async () => {
                if (!(await page.getByRole('button', {name: /Ines Fresh More Actions/}).count())) await openWorkflow(page, workflow(sc.r3, key), 'r3-review-mgr-2');
                await openFromRow(page, 'Ines Fresh', 'r3-add-I-2');
                const form = page.locator('[role="dialog"]:visible').last();
                await form.locator('input[name="username"]').fill('');
                const res = await pressAddReviewer(page, 'r3-add-I-empty-username');
                await snap(page, 'r3-add-I-empty-username', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 600)})), window: await windowInfo(page), info: await wfInfo(page)});
                for (let i = 0; i < 3; i++) { if ((await page.locator('[role="dialog"]:visible').count()) <= 1) break; await closeTop(page); }
            });
            await sect('enroll back to search', async () => {
                // the enroll form's "Back to Search": on a suggestion whose address belongs to an account without the role (none left here: recorded on R1's D window text only)
            });
            await signInAs(page, 'admin');
            await sect('admin window', async () => {
                await openWorkflow(page, workflow(sc.r3, key), 'r3-review-admin');
                await openFromRow(page, 'Ines Fresh', 'r3-admin-add-I');
                await closeTop(page);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- omp2: I2 in Internal Review (OMP1, t10) with a fresh no-account suggestion --------
    if (on('omp2') && isOMP) {
        const {page, close} = await launch(app);
        try {
            if (!sc.i2) {
                const t = sc.tag;
                const J = {givenName: 'Jonas', familyName: 'Internal', email: `jonas.${t}@mail.test`, affiliation: 'Internal Institute', suggestionReason: 'For the internal round.'};
                sc.sugg.J = J;
                const i2 = await app.api.createSubmission({tag: `${t}i2`, context: sc.contextPath, submitter: u.au, title: `K3 I2 internal review ${t}`, decisions: ['sendInternalReview'], reviewerSuggestions: [J, S.R], participants: [{username: u.se, role: 'sectionEditor'}]});
                sc.i2 = i2.submissionId; sc.i2Rounds = i2.reviewRounds; save();
            }
            await signInAs(page, u.mgr);
            const ikey = roundKey(sc.i2Rounds, 2);
            await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-mgr');
            await openWorkflow(page, workflow(sc.i2, 'workflow_1'), 'i2-submission-mgr');
            await sect('internal add reviewer window', async () => {
                await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-mgr-2');
                const btn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
                await btn.click();
                const dlg = await waitReviewerForm(page);
                const w = await windowInfo(page);
                await snap(page, 'i2-internal-add-reviewer-window', {window: w});
                log('[i2 window]', JSON.stringify(w.has), JSON.stringify(w.headings));
                const item = dlg.locator('.listPanel__item').filter({hasText: 'Jonas Internal'}).first();
                await item.getByRole('button', {name: /^Select/}).first().click(); await idle(page);
                await page.waitForTimeout(1000); await idle(page);
                await snap(page, 'i2-internal-after-select', {dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 800)})), window: await windowInfo(page)});
                await waitReviewerForm(page);
                const form = page.locator('[role="dialog"]:visible').last();
                await form.getByRole('button', {name: 'Suggest', exact: true}).waitFor({timeout: 30000});
                const sel = form.locator('select[name="userGroupId"]');
                if (await sel.count()) record('i2-internal-create-role-options', await sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected}))));
                await form.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                await snap(page, 'i2-internal-create-form', {window: await windowInfo(page)});
                const res = await pressAddReviewer(page, 'i2-internal-add-J');
                await snap(page, 'i2-internal-add-J-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 800)})), window: await windowInfo(page)});
                log('[i2 J submit]', JSON.stringify(res.responses), 'dialogs', res.dialogs.length);
                for (let i = 0; i < 3; i++) { if ((await page.locator('[role="dialog"]:visible').count()) <= 1) break; await closeTop(page); }
            });
            await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-after-J');
            await openWorkflow(page, workflow(sc.i2, 'workflow_1'), 'i2-submission-after-J');
            await sect('send to external', async () => {
                await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-before-decision');
                await recordDecision(page, 'Send to External Review', 'i2-external');
            });
            const ext = await openWorkflow(page, workflow(sc.i2), 'i2-external-after-decision');
            log('[i2 external]', 'panel', ext.info.panelHeadingPresent, JSON.stringify(ext.info.rows && ext.info.rows.map((r) => r.lines[1])));
            await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-after-decision');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- omp: Internal Review (OMP1, t10) -----------------------------------------
    if (on('omp') && isOMP) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const ikey = roundKey(sc.i1Rounds, 2);
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-mgr');
            await openWorkflow(page, workflow(sc.i1, 'workflow_1'), 'i1-submission-mgr');
            await openWorkflow(page, workflow(sc.i1, 'workflow_3'), 'i1-external-key-before');
            await sect('internal add reviewer window', async () => {
                await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-mgr-2');
                const btn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
                await loc(page, 'Internal Review: the Reviewers panel "Add Reviewer"', btn);
                await btn.click();
                const dlg = await waitReviewerForm(page);
                const w = await windowInfo(page);
                await snap(page, 'i1-internal-add-reviewer-window', {window: w});
                log('[i1 window]', JSON.stringify(w.has), JSON.stringify(w.headings));
                const item = dlg.locator('.listPanel__item').filter({hasText: 'Xavier Noaccount'}).first();
                if (await item.count()) {
                    await item.getByRole('button', {name: /^Select/}).first().click(); await idle(page);
                    await waitReviewerForm(page);
                    const form = page.locator('[role="dialog"]:visible').last();
                    await form.getByRole('button', {name: 'Suggest', exact: true}).waitFor({timeout: 30000});
                    const w2 = await windowInfo(page);
                    await snap(page, 'i1-internal-create-form', {window: w2});
                    await form.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                    const res = await pressAddReviewer(page, 'i1-internal-add-X');
                    const s = await snap(page, 'i1-internal-add-X-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons, text: d.text.slice(0, 600)}))});
                    log('[i1 X submit]', JSON.stringify(res.responses), 'dialogs', res.dialogs.length);
                    for (let i = 0; i < 3; i++) { if ((await page.locator('[role="dialog"]:visible').count()) <= 1) break; await closeTop(page); }
                }
            });
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-after-X');
            await openWorkflow(page, workflow(sc.i1, 'workflow_1'), 'i1-submission-after-X');
            await sect('send to external', async () => {
                await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-before-decision');
                await recordDecision(page, 'Send to External Review', 'i1-external');
            });
            await openWorkflow(page, workflow(sc.i1), 'i1-after-decision-default');
            const ext = await openWorkflow(page, workflow(sc.i1, 'workflow_3'), 'i1-external-key-after');
            log('[i1 external]', 'panel', ext.info.panelHeadingPresent, JSON.stringify(ext.info.rows && ext.info.rows.map((r) => r.lines[0])));
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-after-decision');
            await signOut(page);
        } finally { await close(); }
    }
});
