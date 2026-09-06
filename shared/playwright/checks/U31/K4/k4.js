// U31 claim check, chunk K4: inside the Add Reviewer window — the list "Select
// a Reviewer from Reviewer Suggestions" and its "Select Reviewer" (Rule 10),
// what turns a suggestion into a reviewer (Rule 11), once matched always
// matched (Rule 12, register A3), languages and the ORCID box (Rule 13, the
// cross-feature pointer), and the Internal Review window on a press (t10).
// Spec: docs/specs/U31-reviewer-suggestions.md lines 146–184, 240–265, 314–324.
//
// OJS/OMP: seeds a scratch context with the setting ON, ORCID on, fr_CA as a
// UI language (not yet a form language), one account per permission level and
// four throwaway reviewers plus a reader. Submissions:
//   R1  in review; reviewer "Rhea Assigned" already invited by the seed; seven
//       suggestions: Xavier (no account), Rowan (a reviewer), Rae (a reader),
//       Rhea (the assigned reviewer), Yara (left pending), Rhys (a reviewer,
//       added through "Locate a Reviewer"), Zane (no account; t11)
//   R2  in review; one suggestion "Ria Cancel" (a reviewer): matched, accepted
//       by the reviewer, then "Cancel Reviewer"
//   R3  in review with two rounds; suggestions Rowan and Yara ("any round")
//   R0  in review, no suggestions (the other end of "pending suggestions")
//   D1  the author's draft (Rule 13)
//   I1  (OMP) in Internal Review; suggestions Xavier, Rowan, Rae, Yara
// Phases (PHASES=… narrows; later phases reuse k4-state-<app>.json):
//   seed      the context and the submissions
//   list      manager on R1: the window's list, the assigned entry, "Select Reviewer" on a reviewer and on
//             a reader, the sweep on the way out, the plain "Locate a Reviewer" add of Rhys
//   x         manager on R1: "Select Reviewer" on Xavier (no account): the inner window, its Cancel and
//             "Back to Search", the add, which button closes the outer window
//   y         manager on R1: Yara (no account) added from the list; the outer window afterwards, its header "Close", the panel
//   t11       manager on R1: the row's "Add Reviewer" on Zane with the address changed
//   unassign  manager on R1: "Unassign Reviewer" on Rowan; the panel, the list, the Submission stage
//   cancel    manager on R2: Ria added from the row, accepts as reviewer, "Cancel Reviewer"
//   rounds    manager on R3: the list on round 2, Rowan added there, round 1 afterwards
//   levels    section editor and site admin on R1: the list; R0: no list
//   lang      author on D1: the window with one form language; manager ticks French "Forms"; the window again;
//             manager unticks "Enable ORCID functionality"; the window again
//   off       manager: the setting off → R1's Add Reviewer without the list; on again
//   lang2     manager ticks "Enable ORCID functionality" again; the author's window re-read with "French" pressed
//   omp       (OMP only) Internal Review on I1: the list, Xavier (by then a reviewer) and Rowan from it,
//             "Send to External Review", the External Review panel and list
//   omp2      (OMP only) Internal Review on I2 (seeded here): a no-account person added from the list, the decision, the External panel
//   notes     (run once, OJS) appends what the chunk learned to screen-notes.md
//
//   PROBE_FEATURE=U31 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U31/K4/k4.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const ALL = ['seed', 'list', 'x', 't11', 'unassign', 'cancel', 'rounds', 'levels', 'lang', 'lang2', 'off', 'omp', 'omp2', 'omp3', 'y'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}
// screen() first, then the structured read; record(name) and shot(name) share the file stem, so the
// structured read rides inside the screen record.
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const visDialogs = (page) => page.locator('[role="dialog"]:visible');
const dialogTexts = (page) => visDialogs(page).evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 4000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.offsetParent !== null).map((b) => ({aria: b.getAttribute('aria-label'), text: (b.innerText || b.value || '').trim()})).slice(0, 50),
    }))).catch(() => []);
// The "Reviewers Suggested by Author" panel on the workflow screen, plus the Reviewers table.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,span,div')].find((e) => vis(e) && e.children.length === 0 && e.textContent.trim() === 'Reviewers Suggested by Author');
    let rows = null; let panelText = null;
    if (h) {
        let c = h;
        for (let i = 0; i < 5 && c.parentElement && !c.querySelector('li'); i++) c = c.parentElement;
        panelText = c.innerText.slice(0, 3000);
        rows = [...c.querySelectorAll('li')].map((li) => ({
            lines: li.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
            buttons: [...li.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.innerText).trim()),
        }));
    }
    const more = [...document.querySelectorAll('button')].filter((b) => vis(b) && /More Actions/i.test(b.getAttribute('aria-label') || b.innerText)).map((b) => (b.getAttribute('aria-label') || b.innerText).trim());
    const headings = [...document.querySelectorAll('[role=dialog] h1, [role=dialog] h2, [role=dialog] h3, [role=dialog] h4')].filter(vis).map((e) => e.innerText.trim());
    const tbl = [...document.querySelectorAll('table')].find((t) => /Reviewers/i.test(t.getAttribute('aria-label') || '') || /Reviewer Status/i.test(t.innerText));
    const reviewers = tbl ? [...tbl.querySelectorAll('tbody tr')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean) : null;
    const errors = [...document.querySelectorAll('[role=alert], .pkpNotification, [role=status]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
    return {panelHeadingPresent: !!h, rows, panelText, moreActions: more, headings, reviewers, errors};
});
// The Add Reviewer window as opened from the Reviewers panel: the suggestions list and the reviewer list.
async function listInfo(page) {
    const d = visDialogs(page).last();
    const info = await d.evaluate((root) => {
        const vis = (e) => e.offsetParent !== null;
        const txt = root.innerText;
        const panels = [...root.querySelectorAll('.listPanel')].filter(vis).map((p) => ({
            title: (p.querySelector('.listPanel__title, h2, h3') || {}).innerText?.trim() || null,
            items: [...p.querySelectorAll('.listPanel__item')].filter(vis).map((li) => ({
                lines: li.innerText.split('\n').map((s) => s.trim()).filter(Boolean),
                buttons: [...li.querySelectorAll('button, a[role=button]')].filter(vis).map((b) => ({aria: b.getAttribute('aria-label'), text: b.innerText.trim(), disabled: b.disabled})),
            })),
            emptyText: (p.querySelector('.listPanel__empty') || {}).innerText?.trim() || null,
        }));
        return {
            title: (root.getAttribute('aria-label') || (root.querySelector('h1,h2,.modal__title,[class*="title"]') || {}).innerText || '').trim().slice(0, 120),
            headings: [...root.querySelectorAll('h1,h2,h3,h4,h5,legend,.section_title,.pkpListPanel__title,.listPanel__title')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 30),
            has: {selectedReviewer: /Selected Reviewer/.test(txt), locate: /Locate a Reviewer/.test(txt), suggestions: /Select a Reviewer from Reviewer Suggestions/.test(txt), enroll: /Enroll Existing User/.test(txt), create: /Create New Reviewer/.test(txt), assignedNotice: /This reviewer has already been assigned to this review round\./.test(txt)},
            panels,
            fields: [...root.querySelectorAll('input, select, textarea')].filter((e) => vis(e) || e.type === 'hidden').map((e) => ({name: e.name, type: e.type || e.tagName.toLowerCase(), value: e.type === 'select-one' ? (e.selectedOptions[0] || {}).text : (e.type === 'radio' || e.type === 'checkbox' ? `${e.value}${e.checked ? ' [checked]' : ''}` : e.value), visible: vis(e)})).filter((f) => f.name && !/^(csrfToken)$/.test(f.name)).slice(0, 60),
            labels: [...root.querySelectorAll('label, .pkpFormFieldLabel, .label')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40),
            buttons: [...root.querySelectorAll('button, a.pkp_button, input[type=submit], a[role=button]')].filter(vis).map((b) => ({aria: b.getAttribute('aria-label'), text: (b.innerText || b.value || '').trim()})).slice(0, 50),
            text: txt.slice(0, 5000),
        };
    }).catch((e) => ({error: String(e.message).slice(0, 200)}));
    info.dialogCount = await visDialogs(page).count();
    const fr = d.locator('iframe:visible').first();
    info.message = (await fr.count()) ? await d.frameLocator('iframe:visible').first().locator('body').innerText().then((t) => flat(t, 600)).catch(() => null) : null;
    return info;
}
const suggPanel = (page) => visDialogs(page).last().locator('.listPanel').filter({hasText: 'Select a Reviewer from Reviewer Suggestions'}).first();
const locatePanel = (page) => visDialogs(page).last().locator('.listPanel').filter({hasText: 'Locate a Reviewer'}).first();
const suggItem = (page, name) => suggPanel(page).locator('.listPanel__item').filter({hasText: name}).first();
const locateItem = (page, name) => locatePanel(page).locator('.listPanel__item').filter({hasText: name}).first();
async function waitReviewerForm(page) {
    const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
    await dlg.waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
    await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 30000}).catch(() => {});
    await idle(page);
    return dlg;
}
async function waitList(page) {
    await waitReviewerForm(page);
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && (d.querySelector('.listPanel__item') || /No items|No Items|Locate a Reviewer/.test(d.innerText)); }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
}
// The Reviewers panel's own "Add Reviewer" (the window this chunk is about).
async function openPanelAdd(page, label) {
    const btn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
    await btn.waitFor({timeout: 30000});
    await loc(page, `${label}: the Reviewers panel's "Add Reviewer"`, btn);
    await btn.click();
    await waitList(page);
    const w = await listInfo(page);
    const s = await snap(page, `${label}-window`, {window: w});
    log(`[${label} window]`, JSON.stringify(w.has), 'panels', JSON.stringify((w.panels || []).map((p) => `${p.title}: ${p.items.length}`)));
    return {w, s};
}
// Press the form's own "Add Reviewer" and wait for the grid to answer; record the browser's traffic.
async function pressAddReviewer(page, label) {
    const form = visDialogs(page).last();
    const st = [];
    const onR = (r) => { if (r.status() >= 400 || /reviewer-grid|reviewers\/suggestions|reviewer-suggestion|users\/reviewers|_submissions|submissions\/\d+/.test(r.url())) st.push({m: r.request().method(), s: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 220)}); };
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
// Close candidates of the topmost window: every visible control reading Close or Cancel, with tag, class and position.
const closeCandidates = (page) => visDialogs(page).last().evaluate((root) => [...root.querySelectorAll('a, button')].filter((e) => e.getClientRects().length > 0 && /^(Close|Cancel)$/.test((e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' '))).map((e) => { const r = e.getBoundingClientRect(); return {tag: e.tagName, cls: (e.className || '').toString().slice(0, 80), aria: e.getAttribute('aria-label'), text: e.innerText.trim(), x: Math.round(r.x), y: Math.round(r.y)}; })).catch(() => []);
async function closeTop(page, prefer) {
    const top = visDialogs(page).last();
    // the legacy forms' "Cancel" is a plain link at the bottom, not a button
    let btn = top.locator('a:visible, button:visible').filter({hasText: /^\s*Cancel\s*$/}).last();
    if (prefer) btn = top.locator('a:visible, button:visible').filter({hasText: prefer}).last();
    if (!(await btn.count())) btn = top.getByRole('button', {name: /^(Close|OK)$/}).last();
    const used = (await btn.count()) ? await btn.evaluate((b) => b.getAttribute('aria-label') || b.innerText.trim()) : null;
    if (await btn.count()) { await btn.click(); await idle(page); await page.waitForTimeout(400); }
    return {used, dialogs: await visDialogs(page).count()};
}
async function closeAll(page) {
    for (let i = 0; i < 4; i++) { if ((await visDialogs(page).count()) <= 1) break; await closeTop(page); }
}
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
// The decision Composer: press the named decision, Continue to "Record Decision", press it.
async function recordDecision(page, name, label) {
    const btn = page.getByRole('button', {name, exact: true}).first();
    await btn.click(); await idle(page);
    const choose = visDialogs(page).last();
    const next = choose.getByRole('button', {name: /^(Next|Continue)$/}).first();
    if (!/decision/.test(page.url()) && (await next.count())) { await next.click(); await idle(page); }
    await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
    await idle(page);
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    await idle(page);
    const cont = page.getByRole('button', {name: 'Continue', exact: true});
    const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
    for (let i = 0; i < 6 && !(await rec.isVisible().catch(() => false)); i++) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await cont.first().click(); await idle(page);
    }
    await rec.click(); await idle(page);
    await page.waitForTimeout(1000); await idle(page);
    await snap(page, `${label}-decision-recorded`, {dialogs: await dialogTexts(page)});
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    if (app.name === 'ops') { log('[k4] OPS has no surface in this chunk; skipped'); return; }
    const isOMP = app.name === 'omp';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const wizard = (id) => ctxUrl(`/submission?id=${id}`);
    const roundKey = (rounds, stageId, round) => { const r = (rounds || []).find((x) => (!stageId || x.stageId === stageId) && (!round || x.round === round)) || (rounds || [])[0]; return r ? `workflow_${r.stageId}_${r.id}` : 'workflow_3_1'; };
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };
    const mail = (u) => `${u}@mail.test`;

    // ---- seed --------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u31k4');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            {username: `${t}rev2`, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Assigned'},
            {username: `${t}rev3`, roles: ['externalReviewer'], givenName: 'Rhys', familyName: 'Plain'},
            {username: `${t}rev4`, roles: ['externalReviewer'], givenName: 'Ria', familyName: 'Cancel'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rae', familyName: 'Reader'},
        ];
        if (isOMP) users.push({username: `${t}irev`, roles: ['internalReviewer'], givenName: 'Ian', familyName: 'Internal'});
        const ctx = await app.api.createContext({tag: t, context: {name: `U31 K4 ${t}`, acronym: 'U31K4', supportedLocales: ['en', 'fr_CA'], contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users, review: {reviewerSuggestionEnabled: true}, orcid: {enabled: true}});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const u = sc.users;
        const X = {givenName: 'Xavier', familyName: 'Noaccount', email: `xavier.${t}@mail.test`, affiliation: 'Nowhere University', suggestionReason: 'Knows the field well.'};
        const R = {givenName: 'Rowan', familyName: 'Reviewer', email: mail(u.rev), affiliation: 'Reviewer College', suggestionReason: 'Has reviewed for us before.'};
        const D = {givenName: 'Rae', familyName: 'Reader', email: mail(u.rd), affiliation: 'Reader Institute', suggestionReason: 'Wrote the standard textbook.'};
        const A = {givenName: 'Rhea', familyName: 'Assigned', email: mail(u.rev2), affiliation: 'Assigned Academy', suggestionReason: 'Already on the round.'};
        const Y = {givenName: 'Yara', familyName: 'Pending', email: `yara.${t}@mail.test`, affiliation: 'Pending Polytechnic', suggestionReason: 'Left pending on purpose.'};
        const P = {givenName: 'Rhys', familyName: 'Plain', email: mail(u.rev3), affiliation: 'Plain University', suggestionReason: 'Picked through Locate a Reviewer.'};
        const Z = {givenName: 'Zane', familyName: 'Changemail', email: `zane.${t}@mail.test`, affiliation: 'Changed Address College', suggestionReason: 'Address changed before Add Reviewer.'};
        const C = {givenName: 'Ria', familyName: 'Cancel', email: mail(u.rev4), affiliation: 'Cancel College', suggestionReason: 'Accepts, then is cancelled.'};
        sc.sugg = {X, R, D, A, Y, P, Z, C};
        const parts = [{username: u.se, role: 'sectionEditor'}];
        const r1 = await app.api.createSubmission({tag: `${t}r1`, context: sc.contextPath, submitter: u.au, title: `K4 R1 in review ${t}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u.rev2, status: 'invited'}]}], reviewerSuggestions: [X, R, D, A, Y, P, Z], participants: parts});
        const r2 = await app.api.createSubmission({tag: `${t}r2`, context: sc.contextPath, submitter: u.au, title: `K4 R2 cancel ${t}`, decisions: ['sendExternalReview'], reviewerSuggestions: [C], participants: parts});
        const r3 = await app.api.createSubmission({tag: `${t}r3`, context: sc.contextPath, submitter: u.au, title: `K4 R3 two rounds ${t}`, decisions: ['sendExternalReview', 'newExternalReviewRound'], reviewerSuggestions: [R, Y], participants: parts});
        const r0 = await app.api.createSubmission({tag: `${t}r0`, context: sc.contextPath, submitter: u.au, title: `K4 R0 no suggestions ${t}`, decisions: ['sendExternalReview'], participants: parts});
        const d1 = await app.api.createSubmission({tag: `${t}d1`, context: sc.contextPath, submitter: u.au, title: `K4 D1 draft ${t}`, submitted: false});
        Object.assign(sc, {r1: r1.submissionId, r1Rounds: r1.reviewRounds, r2: r2.submissionId, r2Rounds: r2.reviewRounds, r3: r3.submissionId, r3Rounds: r3.reviewRounds, r0: r0.submissionId, r0Rounds: r0.reviewRounds, d1: d1.submissionId});
        if (isOMP) {
            const i1 = await app.api.createSubmission({tag: `${t}i1`, context: sc.contextPath, submitter: u.au, title: `K4 I1 internal review ${t}`, decisions: ['sendInternalReview'], reviewerSuggestions: [X, R, D, Y], participants: parts});
            sc.i1 = i1.submissionId; sc.i1Rounds = i1.reviewRounds;
        }
        save();
        log('[seed]', app.name, JSON.stringify({ctx: sc.contextPath, r1: sc.r1, r1Rounds: sc.r1Rounds, r2: sc.r2, r3: sc.r3, r3Rounds: sc.r3Rounds, r0: sc.r0, d1: sc.d1, i1: sc.i1}));
    }
    const u = sc.users; const S = sc.sugg;

    async function openWorkflow(page, url, label, extra) {
        await page.goto(url); await idle(page);
        await visDialogs(page).first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 600)})), ...(extra || {})});
        log(`[${label}]`, app.name, 'panel:', info.panelHeadingPresent, 'rows:', info.rows ? info.rows.map((r) => r.lines[1]).join('|') : null, 'reviewers:', JSON.stringify(info.reviewers).slice(0, 300));
        return {info, dialogs, s};
    }
    // The row's "…" › "Add Reviewer" (Rule 9's path; used here for t11 and the cancel path).
    async function openFromRow(page, fullName, label) {
        const more = page.getByRole('button', {name: new RegExp(`${fullName} More Actions`)}).first();
        await more.waitFor({timeout: 15000});
        await more.click(); await idle(page);
        const items = await menuItems(page);
        await page.getByRole('menuitem', {name: /Add Reviewer/}).first().click();
        await waitReviewerForm(page);
        const w = await listInfo(page);
        await snap(page, `${label}-window`, {window: w, menu: items});
        return w;
    }
    // "Select Reviewer" on a suggestions-list entry; returns the top window afterwards.
    async function selectSuggestion(page, name, label) {
        const item = suggItem(page, name);
        await item.waitFor({timeout: 15000});
        const btn = item.getByRole('button', {name: /^Select/}).first();
        await loc(page, `${label}: suggestion "${name}" › "Select Reviewer"`, btn);
        record(`${label}-button-name`, {aria: await btn.getAttribute('aria-label'), text: await btn.innerText(), accessibleName: await btn.evaluate((b) => b.getAttribute('aria-label') || b.textContent.trim())});
        await btn.click(); await idle(page);
        await waitReviewerForm(page);
        const w = await listInfo(page);
        const s = await snap(page, `${label}-after-select`, {window: w, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text)}))});
        log(`[${label} after select]`, app.name, 'dialogs', w.dialogCount, JSON.stringify(w.has), 'fields', JSON.stringify(w.fields.filter((f) => f.visible).map((f) => `${f.name}=${String(f.value).slice(0, 40)}`)).slice(0, 500));
        return w;
    }
    // The Reviewers table row menu → an action → its dialog → the confirming button.
    async function reviewerRowAction(page, fullName, action, label) {
        const row = page.getByRole('row').filter({hasText: fullName}).first();
        const more = row.getByRole('button', {name: /More Actions/}).first();
        await more.waitFor({timeout: 15000});
        await loc(page, `${label}: reviewer row "${fullName}" › More Actions`, more);
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-row-menu`, {items});
        const it = page.getByRole('menuitem', {name: action, exact: true}).first();
        if (!(await it.count())) { await page.keyboard.press('Escape'); return {items, absent: action}; }
        await it.click(); await idle(page);
        const dlg = visDialogs(page).last();
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 60; }, null, {timeout: 15000}).catch(() => {});
        await page.waitForFunction(() => { const ta = [...document.querySelectorAll('textarea')].pop(); const mce = window.tinyMCE || window.tinymce; return !ta || !!mce?.get(ta.id)?.initialized; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const w = await listInfo(page);
        await snap(page, `${label}-dialog`, {window: w, menu: items});
        const confirm = dlg.getByRole('button', {name: action, exact: true}).last();
        let pressed = null;
        if (await confirm.count()) { pressed = action; await confirm.click(); } else {
            const alt = dlg.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).last();
            if (await alt.count()) { pressed = await alt.innerText(); await alt.click(); }
        }
        await idle(page); await page.waitForTimeout(800); await idle(page);
        const after = await dialogTexts(page);
        return {items, pressed, dialogsAfter: after.map((d) => ({name: d.name, text: d.text.slice(0, 400)})), info: await wfInfo(page)};
    }

    // ---- list: the manager on R1 -------------------------------------------
    if (on('list')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-mgr');
            // Rule 10: the list, its entries, the assigned entry (t13)
            await sect('list open', async () => {
                const {w} = await openPanelAdd(page, 'r1-list');
                await loc(page, 'Add Reviewer: the suggestions list title', visDialogs(page).last().getByText('Select a Reviewer from Reviewer Suggestions', {exact: true}).first());
                await loc(page, 'Add Reviewer: the "Locate a Reviewer" title', visDialogs(page).last().getByText('Locate a Reviewer', {exact: true}).first());
                const rhea = suggItem(page, 'Rhea Assigned');
                record('r1-list-rhea-entry', {count: await rhea.count(), text: flat(await rhea.innerText().catch(() => null), 400), buttons: await rhea.locator('button:visible').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.innerText.trim())).catch(() => [])});
                // the "Locate a Reviewer" list: who is listed, and how Rhea (assigned by the seed) reads there
                const rheaLoc = locateItem(page, 'Rhea Assigned');
                record('r1-list-locate-rhea', {count: await rheaLoc.count(), text: flat(await rheaLoc.innerText().catch(() => null), 400)});
            });
            // Rule 10 bullet 1: "Select Reviewer" on Rowan (Reviewer role) → the same window; then leave unsaved (sweep)
            await sect('select R then cancel', async () => {
                const w = await selectSuggestion(page, 'Rowan Reviewer', 'r1-select-R');
                const top = visDialogs(page).last();
                if (await top.locator('iframe:visible').count()) { const body = top.frameLocator('iframe:visible').first().locator('body'); await body.click({timeout: 5000}).catch(() => {}); await page.keyboard.type(' K4 marker.'); }
                const r = await closeTop(page, /^Cancel$/);
                const after = await dialogTexts(page);
                await snap(page, 'r1-select-R-after-cancel', {closedWith: r, dialogs: after.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 300)})), info: await wfInfo(page)});
                log('[R cancel]', app.name, JSON.stringify(r), 'dialogs', after.length);
                await closeAll(page);
            });
            // the control: "Select Reviewer" in "Locate a Reviewer" on Rhys; then the plain add (Rule 11's third way)
            await sect('locate select P and add', async () => {
                if ((await visDialogs(page).count()) <= 1) await openPanelAdd(page, 'r1-list-2');
                const item = locateItem(page, 'Rhys Plain');
                await item.waitFor({timeout: 15000});
                const btn = item.getByRole('button', {name: /^Select/}).first();
                await loc(page, 'Locate a Reviewer: "Rhys Plain" › Select Reviewer', btn);
                record('r1-locate-P-button-name', {aria: await btn.getAttribute('aria-label'), text: await btn.innerText()});
                await btn.click(); await idle(page); await waitReviewerForm(page);
                const w = await listInfo(page);
                await snap(page, 'r1-locate-P-after-select', {window: w});
                log('[locate P]', app.name, JSON.stringify(w.has), 'fields', JSON.stringify(w.fields.filter((f) => f.visible).map((f) => `${f.name}=${String(f.value).slice(0, 40)}`)).slice(0, 400));
                const res = await pressAddReviewer(page, 'r1-locate-P');
                const s = await snap(page, 'r1-locate-P-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 500)})), info: await wfInfo(page)});
                log('[P submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.map((r) => r.lines[1]).join('|') : null);
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-P');
            // Rule 10 bullet 1 to the end: Rowan through the list → "Add Reviewer"
            await sect('select R and add', async () => {
                await openPanelAdd(page, 'r1-list-3');
                await selectSuggestion(page, 'Rowan Reviewer', 'r1-select-R-2');
                const res = await pressAddReviewer(page, 'r1-select-R');
                const s = await snap(page, 'r1-select-R-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 500)})), info: await wfInfo(page)});
                log('[R submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.map((r) => r.lines[1]).join('|') : null);
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-R');
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-X');
            // Rule 10 bullet 2: Rae Reader (account, no reviewer role) → "Enroll Existing User"
            await sect('select D and add', async () => {
                await openPanelAdd(page, 'r1-list-6');
                await selectSuggestion(page, 'Rae Reader', 'r1-select-D');
                const inner = visDialogs(page).last();
                const sel = inner.locator('select[name="userGroupId"]');
                if (await sel.count()) {
                    const opts = await sel.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected})));
                    record('r1-select-D-role-options', opts);
                    const pick = opts.find((o) => /External Reviewer/i.test(o.text)) || opts.find((o) => /Reviewer/i.test(o.text) && o.value);
                    if (pick) await sel.selectOption(pick.value);
                    await idle(page);
                }
                const res = await pressAddReviewer(page, 'r1-select-D');
                const w = await listInfo(page);
                await snap(page, 'r1-select-D-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 500)})), window: w});
                log('[D submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panels', JSON.stringify((w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-D');
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-after-D');
            await signOut(page);
        } finally { await close(); }
    }


    // ---- x: Rule 10 bullet 2 with Xavier (no account): the inner window, the sweep on the way out, the add ----
    if (on('x')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-X');
            await sect('select X cancel inner', async () => {
                await openPanelAdd(page, 'r1-list-4');
                const w = await selectSuggestion(page, 'Xavier Noaccount', 'r1-select-X');
                record('r1-select-X-inner-close-candidates', await closeCandidates(page));
                const inner = visDialogs(page).last();
                await inner.locator('input[name="username"]').fill('k4typed').catch(() => {});
                const r = await closeTop(page);
                const after = await dialogTexts(page);
                const w2 = await listInfo(page);
                await snap(page, 'r1-select-X-after-inner-cancel', {closedWith: r, dialogs: after.map((d) => ({name: d.name})), window: w2});
                log('[X inner cancel]', app.name, JSON.stringify(r), 'dialogs', after.length, 'sugg items', JSON.stringify((w2.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)));
            });
            // Sweep: the inner window's "Back to Search"
            await sect('select X back to search', async () => {
                if ((await visDialogs(page).count()) <= 1) await openPanelAdd(page, 'r1-list-4b');
                await selectSuggestion(page, 'Xavier Noaccount', 'r1-select-X-b');
                const inner = visDialogs(page).last();
                const back = inner.locator('a, button').filter({hasText: /^\s*Back to Search\s*$/}).first();
                await loc(page, 'inner Add Reviewer: "Back to Search"', back);
                if (await back.count()) { await back.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
                const w = await listInfo(page);
                await snap(page, 'r1-select-X-after-back-to-search', {window: w, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name}))});
                log('[X back]', app.name, 'dialogs', w.dialogCount, JSON.stringify(w.has), JSON.stringify((w.panels || []).map((p) => `${p.title}: ${p.items.length}`)));
                await closeAll(page);
                record('r1-select-X-after-back-closed', {dialogs: await visDialogs(page).count()});
            });
            await sect('select X and add', async () => {
                if ((await visDialogs(page).count()) <= 1) await openPanelAdd(page, 'r1-list-5');
                await selectSuggestion(page, 'Xavier Noaccount', 'r1-select-X-2');
                const inner = visDialogs(page).last();
                const suggest = inner.getByRole('button', {name: 'Suggest', exact: true});
                await suggest.waitFor({timeout: 15000});
                await suggest.click(); await idle(page); await page.waitForTimeout(500);
                const username = await inner.locator('input[name="username"]').inputValue().catch(() => null);
                const res = await pressAddReviewer(page, 'r1-select-X');
                const w = await listInfo(page);
                const s = await snap(page, 'r1-select-X-after-submit', {username, responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 500)})), window: w});
                log('[X submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panels', JSON.stringify((w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines.join('/')).join(' ; ')}`)).slice(0, 900));
                const xLoc = locateItem(page, 'Xavier Noaccount');
                record('r1-select-X-locate-entry', {count: await xLoc.count(), text: flat(await xLoc.innerText().catch(() => null), 400), buttons: await xLoc.locator('button:visible').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.innerText.trim())).catch(() => [])});
                // which button closes the outer window: the header "Close"
                const outer = visDialogs(page).last();
                const btns = await outer.locator('button:visible, a.pkp_button:visible').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.innerText.trim()));
                const closeBtn = outer.getByRole('button', {name: /^Close$/}).first();
                await loc(page, 'Add Reviewer (outer): its "Close"', closeBtn);
                const cnt = await closeBtn.count();
                if (cnt) { await closeBtn.click(); await idle(page); await page.waitForTimeout(400); }
                await snap(page, 'r1-select-X-after-outer-close', {outerButtons: btns, closePresent: cnt, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name})), info: await wfInfo(page)});
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-X');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- y: a clean read of the outer window after an inner add: it stays open, the header "Close" closes it, the panel refreshes ----
    if (on('y')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-Y');
            await sect('select Y and add, then Close', async () => {
                await openPanelAdd(page, 'r1-list-Y');
                await selectSuggestion(page, 'Yara Pending', 'r1-select-Y');
                const inner = visDialogs(page).last();
                await inner.getByRole('button', {name: 'Suggest', exact: true}).waitFor({timeout: 15000});
                await inner.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                const res = await pressAddReviewer(page, 'r1-select-Y');
                const w = await listInfo(page);
                const toast = await page.locator('[role="alert"], [role="status"], .pkpNotification, [class*="notification"]').filter({hasText: /assigned|review/i}).allInnerTexts().catch(() => []);
                await snap(page, 'r1-select-Y-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name})), window: w, toast, panelBehind: await wfInfo(page)});
                log('[Y submit]', app.name, 'dialogs', res.dialogs.length, 'toast', JSON.stringify(toast).slice(0, 300), 'panels', JSON.stringify((w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)).slice(0, 400));
                record('r1-select-Y-close-candidates', await closeCandidates(page));
                const outer = visDialogs(page).last();
                const closeBtn = outer.getByRole('button', {name: /^Close$/}).first();
                await closeBtn.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                const after = await dialogTexts(page);
                await snap(page, 'r1-select-Y-after-outer-close', {dialogs: after.map((d) => ({name: d.name})), info: await wfInfo(page)});
                log('[Y close]', app.name, 'dialogs', after.length, 'panel rows', JSON.stringify((await wfInfo(page)).rows?.map((r) => r.lines[1])));
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-Y');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- t11: the row's "Add Reviewer" on Zane, address changed ----------------
    if (on('t11')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-Z');
            await sect('Z changed email', async () => {
                await openFromRow(page, 'Zane Changemail', 'r1-row-Z');
                const form = visDialogs(page).last();
                const email = form.locator('input[name="email"]');
                await email.waitFor({timeout: 15000});
                record('r1-row-Z-email-before', {value: await email.inputValue()});
                await email.fill(`zane.other.${sc.tag}@mail.test`);
                await form.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                const res = await pressAddReviewer(page, 'r1-row-Z');
                const s = await snap(page, 'r1-row-Z-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.aria || b.text), text: d.text.slice(0, 500)})), info: await wfInfo(page)});
                log('[Z submit]', app.name, JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panel rows', s.info.rows ? s.info.rows.map((r) => r.lines[1]).join('|') : null, 'reviewers', JSON.stringify(s.info.reviewers).slice(0, 300));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-Z');
            await sect('list after Z', async () => {
                const {w} = await openPanelAdd(page, 'r1-list-after-Z');
                record('r1-list-after-Z-entries', {items: (w.panels || []).map((p) => ({title: p.title, items: p.items.map((i) => i.lines.join(' / '))}))});
                await closeAll(page);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- unassign: Rule 12 / A3 --------------------------------------------------
    if (on('unassign')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-before-unassign');
            await sect('unassign Rowan', async () => {
                const r = await reviewerRowAction(page, 'Rowan Reviewer', 'Unassign Reviewer', 'r1-unassign-R');
                record('r1-unassign-R-result', {items: r.items, pressed: r.pressed, absent: r.absent, dialogsAfter: r.dialogsAfter, reviewers: r.info.reviewers, rows: r.info.rows});
                log('[unassign R]', app.name, JSON.stringify(r.items.map((i) => i.text)), 'pressed', r.pressed, 'reviewers', JSON.stringify(r.info.reviewers).slice(0, 300));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-after-unassign');
            await sect('list after unassign', async () => {
                const {w} = await openPanelAdd(page, 'r1-list-after-unassign');
                const rowanSugg = suggItem(page, 'Rowan Reviewer');
                const rowanLoc = locateItem(page, 'Rowan Reviewer');
                record('r1-list-after-unassign-rowan', {inSuggestions: await rowanSugg.count(), inLocate: await rowanLoc.count(), locateText: flat(await rowanLoc.innerText().catch(() => null), 300), locateButtons: await rowanLoc.locator('button:visible').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.innerText.trim())).catch(() => [])});
                log('[after unassign list]', app.name, 'sugg', await rowanSugg.count(), 'locate', await rowanLoc.count());
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'r1-submission-after-unassign');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- cancel: Ria matched, accepts, then "Cancel Reviewer" ------------------------
    if (on('cancel')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const key = roundKey(sc.r2Rounds, 3);
            await openWorkflow(page, workflow(sc.r2, key), 'r2-review-before-C');
            await sect('add Ria from row', async () => {
                await openFromRow(page, 'Ria Cancel', 'r2-row-C');
                const res = await pressAddReviewer(page, 'r2-row-C');
                const s = await snap(page, 'r2-row-C-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, text: d.text.slice(0, 300)})), info: await wfInfo(page)});
                log('[C submit]', app.name, JSON.stringify(res.responses), 'panel', s.info.panelHeadingPresent, 'reviewers', JSON.stringify(s.info.reviewers).slice(0, 300));
                await closeAll(page);
            });
            // the reviewer accepts on the review wizard
            await sect('Ria accepts', async () => {
                await signInAs(page, u.rev4);
                await page.goto(ctxUrl(`/reviewer/submission/${sc.r2}`)); await idle(page);
                const accept = page.getByRole('button', {name: /Accept Review, Continue to Step #2/});
                await accept.waitFor({timeout: 30000});
                await snap(page, 'r2-reviewer-step1');
                const privacy = page.locator('input[name="privacyConsent"]:visible');
                if (await privacy.count()) await privacy.first().check().catch(() => {});
                await accept.click(); await idle(page); await page.waitForTimeout(800);
                await snap(page, 'r2-reviewer-accepted');
            });
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(sc.r2, key), 'r2-review-after-accept');
            await sect('cancel Ria', async () => {
                const r = await reviewerRowAction(page, 'Ria Cancel', 'Cancel Reviewer', 'r2-cancel-C');
                record('r2-cancel-C-result', {items: r.items, pressed: r.pressed, absent: r.absent, dialogsAfter: r.dialogsAfter, reviewers: r.info.reviewers, rows: r.info.rows});
                log('[cancel C]', app.name, JSON.stringify(r.items.map((i) => i.text)), 'pressed', r.pressed, 'reviewers', JSON.stringify(r.info.reviewers).slice(0, 300));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r2, key), 'r2-review-after-cancel');
            await sect('list after cancel', async () => {
                const {w} = await openPanelAdd(page, 'r2-list-after-cancel');
                const s = suggItem(page, 'Ria Cancel'); const l = locateItem(page, 'Ria Cancel');
                record('r2-list-after-cancel-ria', {inSuggestions: await s.count(), inLocate: await l.count(), locateText: flat(await l.innerText().catch(() => null), 300)});
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r2, 'workflow_1'), 'r2-submission-after-cancel');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- rounds: "any round" (Rule 11), R3 --------------------------------------------
    if (on('rounds')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const k1 = roundKey(sc.r3Rounds, 3, 1); const k2 = roundKey(sc.r3Rounds, 3, 2);
            await openWorkflow(page, workflow(sc.r3, k1), 'r3-round1-before');
            await sect('round1 add button', async () => {
                const btn = page.getByRole('button', {name: 'Add Reviewer', exact: true});
                record('r3-round1-add-button', {count: await btn.count(), visible: await btn.first().isVisible().catch(() => false)});
            });
            await openWorkflow(page, workflow(sc.r3, k2), 'r3-round2-before');
            await sect('round2 add Rowan from list', async () => {
                await openPanelAdd(page, 'r3-round2-list');
                await selectSuggestion(page, 'Rowan Reviewer', 'r3-round2-select-R');
                const res = await pressAddReviewer(page, 'r3-round2-select-R');
                const s = await snap(page, 'r3-round2-select-R-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, text: d.text.slice(0, 300)})), info: await wfInfo(page)});
                log('[R3 submit]', app.name, JSON.stringify(res.responses), 'panel rows', s.info.rows ? s.info.rows.map((r) => r.lines[1]).join('|') : null);
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.r3, k2), 'r3-round2-after');
            await openWorkflow(page, workflow(sc.r3, k1), 'r3-round1-after');
            await sect('round1 list after', async () => {
                const btn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
                if (await btn.count()) {
                    await openPanelAdd(page, 'r3-round1-list-after');
                    record('r3-round1-list-after-rowan', {inSuggestions: await suggItem(page, 'Rowan Reviewer').count(), inLocate: await locateItem(page, 'Rowan Reviewer').count(), locateText: flat(await locateItem(page, 'Rowan Reviewer').innerText().catch(() => null), 300)});
                    await closeAll(page);
                } else record('r3-round1-list-after-rowan', {addButton: 0});
            });
            await openWorkflow(page, workflow(sc.r3, 'workflow_1'), 'r3-submission-after');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- levels: section editor, site admin; R0 without suggestions ---------------------
    if (on('levels')) {
        const {page, close} = await launch(app);
        try {
            const key = roundKey(sc.r1Rounds, 3);
            for (const [who, label] of [[u.se, 'se'], ['admin', 'admin']]) {
                await sect(`${label} list`, async () => {
                    await signInAs(page, who);
                    await openWorkflow(page, workflow(sc.r1, key), `r1-review-${label}`);
                    const {w} = await openPanelAdd(page, `r1-list-${label}`);
                    if (label === 'se') {
                        // "Select Reviewer" on Yara (no account) → the inner window; then Cancel out
                        await selectSuggestion(page, 'Yara Pending', 'r1-se-select-Y');
                        await closeTop(page, /^Cancel$/);
                        const w2 = await listInfo(page);
                        record('r1-se-select-Y-after-cancel', {dialogs: w2.dialogCount, panels: (w2.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)});
                    }
                    await closeAll(page);
                    await signOut(page);
                });
            }
            await sect('R0 no suggestions', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(sc.r0, roundKey(sc.r0Rounds, 3)), 'r0-review-mgr');
                const {w} = await openPanelAdd(page, 'r0-list');
                record('r0-list-has', {has: w.has, headings: w.headings, panels: (w.panels || []).map((p) => `${p.title}: ${p.items.length}`)});
                await closeAll(page);
                await signOut(page);
            });
        } finally { await close(); }
    }

    // ---- lang: Rule 13 and the ORCID pointer (author's window on D1) ------------------
    async function openSuggestionWindow(page, label) {
        await page.goto(wizard(sc.d1)); await idle(page);
        const current = () => page.locator('.pkpSteps__step__label--current');
        const footer = () => page.locator('.submissionWizard__footer');
        await current().first().waitFor({timeout: 30000});
        for (let i = 0; i < 7; i++) {
            const cur = (await current().first().innerText()).trim();
            if (/Reviewer Suggestions\s*$/.test(cur)) break;
            await footer().getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
            await current().first().waitFor({timeout: 30000});
        }
        await page.getByRole('button', {name: 'Add Reviewer Suggestion'}).click();
        const d = page.getByRole('dialog').last();
        await d.getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30000});
        await page.waitForFunction(() => { const f = document.querySelector('iframe[id*="suggestionReason"]'); const mce = window.tinyMCE || window.tinymce; return f && mce && mce.get(f.id.replace(/_ifr$/, ''))?.initialized; }, null, {timeout: 30000}).catch(() => {});
        await idle(page);
        const boxes = await d.evaluate((root) => {
            const vis = (e) => e.getClientRects().length > 0;
            const inputs = [...root.querySelectorAll('input, textarea')].filter(vis).map((e) => ({name: e.name, id: e.id, type: e.type, label: (e.labels && e.labels[0] && e.labels[0].innerText.trim()) || e.getAttribute('aria-label') || null}));
            const frames = [...root.querySelectorAll('iframe')].map((f) => ({id: f.id, visible: vis(f)}));
            const labels = [...root.querySelectorAll('label, .pkpFormFieldLabel, .pkpFormField__heading, legend')].filter(vis).map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean);
            const localeTabs = [...root.querySelectorAll('[class*="locale"], [class*="Locale"], button')].filter(vis).map((e) => e.innerText.trim()).filter((t) => /English|French|Français|EN|FR/.test(t));
            return {inputs, frames, labels, localeTabs, text: root.innerText.slice(0, 2500)};
        });
        // a second form language adds a language button ("French") that reveals the twins (K2-5); press it and read again
        const langBtn = d.getByRole('button', {name: /French|Français/}).first();
        let boxesAfterFrench = null;
        if (await langBtn.count()) {
            await loc(page, 'Add Reviewer Suggestion window: the "French" button', langBtn);
            await langBtn.click(); await idle(page); await page.waitForTimeout(500);
            boxesAfterFrench = await d.evaluate((root) => {
                const vis = (e) => e.getClientRects().length > 0;
                return {inputs: [...root.querySelectorAll('input, textarea')].filter(vis).map((e) => ({name: e.name, id: e.id, label: (e.labels && e.labels[0] && e.labels[0].innerText.trim()) || e.getAttribute('aria-label') || null})), frames: [...root.querySelectorAll('iframe')].map((f) => ({id: f.id, visible: vis(f)}))};
            });
        }
        await snap(page, label, {boxes, languageButtons: await d.getByRole('button').evaluateAll((els) => els.map((b) => b.innerText.trim()).filter((t) => /English|French|Français/.test(t))), boxesAfterFrench});
        log(`[${label}]`, app.name, 'inputs', JSON.stringify(boxes.inputs.map((i) => `${i.name}:${i.label}`)), 'frames', JSON.stringify(boxes.frames), 'afterFrench', JSON.stringify(boxesAfterFrench && boxesAfterFrench.inputs.map((i) => i.name)), JSON.stringify(boxesAfterFrench && boxesAfterFrench.frames));
        return boxes;
    }
    // Settings › Users & Roles › ORCID: "Enable ORCID functionality" ticked or unticked, then Save.
    async function setOrcid(page, want, label) {
        await signInAs(page, u.mgr);
        await page.goto(ctxUrl('/management/settings/access')); await idle(page);
        const tab = page.getByRole('tab', {name: 'ORCID', exact: true});
        await tab.waitFor({timeout: 20000}); await tab.click(); await idle(page);
        const box = page.getByRole('checkbox', {name: /Enable ORCID functionality/});
        await box.first().waitFor({timeout: 20000});
        await loc(page, 'Users & Roles › ORCID: "Enable ORCID functionality"', box.first());
        await snap(page, `${label}-before`, {checked: await box.first().isChecked()});
        if ((await box.first().isChecked()) !== want) await box.first().setChecked(want);
        await idle(page);
        const panel = page.getByRole('tabpanel', {name: 'ORCID', exact: true});
        const saveBtn = (await panel.count() ? panel : page).getByRole('button', {name: 'Save', exact: true}).last();
        await saveBtn.click();
        await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await snap(page, `${label}-after`, {checked: await box.first().isChecked(), status: await page.locator('[role="status"]').allInnerTexts().catch(() => [])});
    }
    // lang2: ORCID on again, then the window alone (a re-read after phase lang)
    if (on('lang2')) {
        const {page, close} = await launch(app);
        try {
            await sect('orcid on', () => setOrcid(page, true, 'orcid-settings-on'));
            await signInAs(page, u.au);
            await sect('window re-read', () => openSuggestionWindow(page, 'd1-window-reread'));
            await signOut(page);
        } finally { await close(); }
    }
    if (on('lang')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.au);
            await sect('window one language', () => openSuggestionWindow(page, 'd1-window-one-language'));
            // the manager ticks French under "Forms"
            await sect('tick French forms', async () => {
                await signInAs(page, u.mgr);
                await page.goto(ctxUrl('/management/settings/website')); await idle(page);
                const setupTab = page.locator('#setup-button');
                if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
                await page.getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
                await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
                const gridRows = () => page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
                await snap(page, 'languages-before', {grid: await gridRows()});
                const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
                await loc(page, 'Languages: the French row "Forms" box', formsBox);
                if (await formsBox.count() && !(await formsBox.isChecked())) {
                    const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: 10000}).catch(() => null);
                    await formsBox.click();
                    const resp = await w; await idle(page);
                    await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
                    log('[lang] forms box POST', resp ? resp.status() : 'none');
                }
                await snap(page, 'languages-after', {grid: await gridRows()});
            });
            await signInAs(page, u.au);
            await sect('window two languages', () => openSuggestionWindow(page, 'd1-window-two-languages'));
            // the ORCID pointer: "Enable ORCID functionality" off → no "ORCID iD" box
            await sect('orcid off', () => setOrcid(page, false, 'orcid-settings'));
            await signInAs(page, u.au);
            await sect('window orcid off', () => openSuggestionWindow(page, 'd1-window-orcid-off'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- off: the setting off → the window without the list; then on again ---------------
    if (on('off')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const setupPanel = () => page.locator('#reviewSetup');
            async function setBox(want, label) {
                await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                await page.getByRole('tab').first().waitFor({timeout: 30000}).catch(() => {});
                await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
                const side = page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Setup', exact: true});
                if (await side.count()) await side.first().click();
                const box = setupPanel().locator('input[name="reviewerSuggestionEnabled"]');
                await box.waitFor({timeout: 30000}); await idle(page);
                const was = await box.isChecked();
                if (was !== want) await box.setChecked(want);
                await setupPanel().getByRole('button', {name: 'Save', exact: true}).click();
                await setupPanel().locator('[role="status"]:has-text("Saved")').waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                await snap(page, label, {was, now: await box.isChecked(), boxLabel: await box.evaluate((b) => (b.labels && b.labels[0] && b.labels[0].innerText.trim()) || null)});
            }
            await setBox(false, 'setting-off');
            const key = roundKey(sc.r1Rounds, 3);
            await openWorkflow(page, workflow(sc.r1, key), 'r1-review-setting-off');
            await sect('list setting off', async () => {
                const {w} = await openPanelAdd(page, 'r1-list-setting-off');
                record('r1-list-setting-off-has', {has: w.has, headings: w.headings, panels: (w.panels || []).map((p) => `${p.title}: ${p.items.length}`)});
                await closeAll(page);
            });
            await setBox(true, 'setting-on');
            await signOut(page);
        } finally { await close(); }
    }

    // The External Review round through the workflow dialog's own tree ("External Review" › "Review Round 1", the last such item).
    async function openExternalRound(page, id, label) {
        await page.goto(workflow(id)); await idle(page);
        await visDialogs(page).first().waitFor({timeout: 30000}).catch(() => {});
        const item = page.getByRole('treeitem', {name: 'Review Round 1', exact: true}).last();
        await item.waitFor({timeout: 15000});
        await loc(page, `${label}: the tree's last "Review Round 1" (External Review)`, item);
        const link = item.getByRole('link').first();
        if (await link.count()) await link.click(); else await item.click();
        await idle(page);
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        const s = await snap(page, label, {info, url: page.url()});
        log(`[${label}]`, app.name, page.url(), 'panel:', info.panelHeadingPresent, 'rows:', info.rows ? info.rows.map((r) => r.lines[1]).join('|') : null, 'headings', JSON.stringify(info.headings.slice(0, 4)));
        return {info, s};
    }
    // ---- omp3: I1 re-read after its decision: the External Review round through the tree ----
    if (on('omp3') && isOMP) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(sc.i1), 'i1-after-decision-default');
            await openExternalRound(page, sc.i1, 'i1-external-tree');
            await sect('i1 external list', async () => {
                const {w} = await openPanelAdd(page, 'i1-external-tree-list');
                record('i1-external-tree-list-entries', {panels: (w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)});
                await closeAll(page);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- omp2: Internal Review with a person who has no account (t10, the no-account end) ----
    if (on('omp2') && isOMP) {
        if (!sc.i2) {
            const V = {givenName: 'Yves', familyName: 'Nobody', email: `yves.${sc.tag}@mail.test`, affiliation: 'Nobody Institute', suggestionReason: 'No account, internal round.'};
            const i2 = await app.api.createSubmission({tag: `${sc.tag}i2`, context: sc.contextPath, submitter: u.au, title: `K4 I2 internal no-account ${sc.tag}`, decisions: ['sendInternalReview'], reviewerSuggestions: [V, S.Y], participants: [{username: u.se, role: 'sectionEditor'}]});
            sc.i2 = i2.submissionId; sc.i2Rounds = i2.reviewRounds; save();
        }
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const ikey = roundKey(sc.i2Rounds, 2);
            await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-mgr');
            await sect('internal list, Yves added', async () => {
                await openPanelAdd(page, 'i2-internal-list');
                await selectSuggestion(page, 'Yves Nobody', 'i2-internal-select-V');
                const inner = visDialogs(page).last();
                await inner.getByRole('button', {name: 'Suggest', exact: true}).waitFor({timeout: 15000});
                await inner.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                const res = await pressAddReviewer(page, 'i2-internal-select-V');
                const w2 = await listInfo(page);
                await snap(page, 'i2-internal-select-V-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, text: d.text.slice(0, 400)})), window: w2});
                log('[I2 V submit]', JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panels', JSON.stringify((w2.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.i2, ikey), 'i2-internal-after-V');
            await sect('send to external', async () => { await recordDecision(page, 'Send to External Review', 'i2-external'); });
            await openWorkflow(page, workflow(sc.i2), 'i2-after-decision-default');
            const ext = await openExternalRound(page, sc.i2, 'i2-external-after');
            log('[i2 external]', 'panel', ext.info.panelHeadingPresent, JSON.stringify(ext.info.rows && ext.info.rows.map((r) => r.lines[1])));
            await sect('external list', async () => {
                const {w} = await openPanelAdd(page, 'i2-external-list');
                record('i2-external-list-entries', {panels: (w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)});
                await closeAll(page);
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- notes: what this chunk learned, appended to screen-notes.md once ---------------------
    if (on('notes') && app.name === 'ojs') {
        note('ccK4 [ojs,omp]: Add Reviewer from the Reviewers panel: the suggestions list is `dlg.locator(".listPanel").filter({hasText: "Select a Reviewer from Reviewer Suggestions"})`, the reviewer list `.filter({hasText: "Locate a Reviewer"})`, entries `.listPanel__item`; a suggestion entry\'s button reads "Select Reviewer" with a screen-reader suffix "Select undefined" (the reviewer list\'s reads "Select <name>"); the assigned entry has the notice and no button');
        note('ccK4 [ojs,omp]: "Select Reviewer" on a suggestion with a Reviewer role rewrites the same window to "Selected Reviewer / <name> — <email> / Change" (dialog count unchanged); on anyone else a second "Add Reviewer" dialog stacks (count +1): close it with its bottom `a.cancelButton` "Cancel" (`locator("a:visible").filter({hasText: /^\\s*Cancel\\s*$/}).last()`), a link, not a button; its header "Close" is `button.DialogClose`. The outer list window has only the header "Close" (the "<" arrow) and closes without asking, typed message text included');
        note('ccK4 [ojs,omp]: after an inner add succeeds the outer list keeps a blank `.listPanel__item` where the entry was, and the workflow\'s "Reviewers Suggested by Author" panel refreshes only once the window is closed or the page reloaded; read the panel after `closeAll` + goto');
        note('ccK4 [ojs,omp]: the inner Create window\'s "Back to Search" turns it into a full second Add Reviewer (suggestions list, Locate, Create/Enroll) from which a third can stack; the browser then logs two page errors ("handler … has already been bound to the selected element!"), so do not use it to go back — press Cancel');
        note('ccK4 [ojs,omp]: Reviewers table row: `getByRole("row").filter({hasText: name}).getByRole("button", {name: /More Actions/})`; items Review Details, Edit, Unassign Reviewer (Cancel Reviewer once the request is accepted), Email Reviewer, History, Login As, Editorial Notes, Log Response; the action\'s window loads by AJAX after it opens (a `screen()` right after the click is empty) and its confirming button carries the action\'s own name');
        note('ccK4 [ojs,omp]: a scratch reviewer accepts at `/reviewer/submission/<id>` with "Accept Review, Continue to Step #2"; the editor\'s row then reads "Request Accepted" and its menu offers "Cancel Reviewer" instead of "Unassign Reviewer"');
        note('ccK4 [ojs,omp]: Settings › Users & Roles › tab "ORCID": `getByRole("checkbox", {name: /Enable ORCID functionality/})`, Save in the tabpanel, then `[role=status]:has-text("Saved")`; unticked, the wizard\'s Add Reviewer Suggestion window loses its "ORCID iD" box');
        note('ccK4 [ojs,omp]: premise: a person created from a suggestion on one submission holds a Reviewer role from then on, so the same address suggested on another submission (OMP I1) takes the "Selected Reviewer" path, not the Create one; seed distinct addresses per submission for the no-account path');
    }

    // ---- omp: Internal Review (t10) --------------------------------------------------------
    if (on('omp') && isOMP) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, u.mgr);
            const ikey = roundKey(sc.i1Rounds, 2);
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-mgr');
            await sect('internal list, X added', async () => {
                const {w} = await openPanelAdd(page, 'i1-internal-list');
                await selectSuggestion(page, 'Xavier Noaccount', 'i1-internal-select-X');
                const inner = visDialogs(page).last();
                await inner.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                const res = await pressAddReviewer(page, 'i1-internal-select-X');
                const w2 = await listInfo(page);
                await snap(page, 'i1-internal-select-X-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, text: d.text.slice(0, 400)})), window: w2});
                log('[I1 X submit]', JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'panels', JSON.stringify((w2.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-after-X');
            // Rowan holds the External Reviewer role only: "Select Reviewer" on him in the Internal window
            await sect('internal select Rowan', async () => {
                await openPanelAdd(page, 'i1-internal-list-2');
                const w = await selectSuggestion(page, 'Rowan Reviewer', 'i1-internal-select-R');
                const res = await pressAddReviewer(page, 'i1-internal-select-R');
                const w2 = await listInfo(page);
                await snap(page, 'i1-internal-select-R-after-submit', {responses: res.responses, dialogs: res.dialogs.map((d) => ({name: d.name, text: d.text.slice(0, 500)})), window: w2, info: await wfInfo(page)});
                log('[I1 R submit]', JSON.stringify(res.responses), 'dialogs', res.dialogs.length, 'text', flat(res.dialogs.map((d) => d.text).join(' | '), 400));
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-after-R');
            await sect('send to external', async () => {
                await recordDecision(page, 'Send to External Review', 'i1-external');
            });
            const ext = await openWorkflow(page, workflow(sc.i1, 'workflow_3'), 'i1-external-after');
            log('[i1 external]', 'panel', ext.info.panelHeadingPresent, JSON.stringify(ext.info.rows && ext.info.rows.map((r) => r.lines[0])));
            await sect('external list', async () => {
                const {w} = await openPanelAdd(page, 'i1-external-list');
                record('i1-external-list-entries', {panels: (w.panels || []).map((p) => `${p.title}: ${p.items.map((i) => i.lines[0]).join(',')}`)});
                await closeAll(page);
            });
            await openWorkflow(page, workflow(sc.i1, ikey), 'i1-internal-after-decision');
            await signOut(page);
        } finally { await close(); }
    }
});
