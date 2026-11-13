// U26 claim check K13b (main): helpers of k13b.js (the entry script, which says how to run it).
// A port to `main` of the 3.5 build-out's helpers (lines/stable-3_5_0/shared/playwright/checks/
// U26-stable-3_5_0/W1/lib.js and K2/lib.js): run bookkeeping (snapshots, facts, checks), one browser
// per role, the workflow dialog read as data, the decision wizard, the editor's Vue "Review Details"
// window ("Mark as Complete"), the reviewer's wizard. Requiring this file runs nothing.
const path = require('path');
const kit = require('../../../probe');
const {launch, signIn, screen, shot, record, idle} = kit;

const REPO = path.resolve(__dirname, '../../../../..');
const RUN = process.env.PROBE_RUN || 'r0';
const txtNamed = (name) => ({name, mimeType: 'text/plain', buffer: Buffer.from(`Scratch upload ${name}`)});
const log = (...a) => console.log(`[k13b ${RUN}]`, ...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const has = (list, s) => !!list && list.some((x) => String(x).includes(s));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------------------------------
// Bookkeeping. A `check` is one claim read on the screen: the claim (which spec text, main or the
// 3.5 copy, it comes from), what the screen gave, and whether the screen agrees with that claim.
const state = {part: 'x', checks: [], facts: {}};
function startPart(part) { state.part = part; state.checks = []; state.facts = {}; }
function fact(k, v) { state.facts[k] = v; log(state.part, k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 1500)); }
function check(id, claim, got, same) {
    const row = {id: `${state.part}.${id}`, claim, got: typeof got === 'string' ? got : JSON.stringify(got), same: !!same};
    state.checks.push(row);
    log(same ? 'SAME ' : 'DIFF ', row.id, '|', claim, '|', flat(row.got, 300));
    return same;
}
function endPart() {
    record(`${state.part}-checks`, {part: state.part, run: RUN, checks: state.checks, facts: state.facts});
    const diff = state.checks.filter((c) => !c.same);
    log(`== ${state.part}: ${state.checks.length} checks, ${diff.length} differ`, diff.map((c) => c.id).join(', '));
}
async function sect(name, fn) {
    try { await fn(); } catch (e) {
        const msg = String(e.stack || e).split('\n').slice(0, 6).join(' | ');
        log(`[${state.part}/${name} FAILED]`, msg);
        state.checks.push({id: `${state.part}.${name}.FAILED`, claim: 'the step runs', got: msg.slice(0, 900), same: false});
    }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(`${state.part}-${name}`, s);
    await shot(page, `${state.part}-${name}`).catch(() => {});
    return s;
}

// ---------------------------------------------------------------------------------------------------
// One browser per role, signed in on the context's own login page. Native dialogs are recorded and
// accepted (the upload window's "The data on this form has changed…" question).
const actors = [];
async function actor(app, username, ctx) {
    const b = await launch(app);
    const nativeDialogs = [];
    b.page.on('dialog', async (d) => { nativeDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    await signIn(b.page, username, {contextPath: ctx});
    await idle(b.page);
    const a = {...b, username, ctx, app, nativeDialogs};
    actors.push(a);
    return a;
}
async function closeActors() { while (actors.length) await actors.pop().close().catch(() => {}); }

// ---------------------------------------------------------------------------------------------------
// The workflow dialog as data (as W1/lib.js): status box, Recommendation box, tables and rows,
// action-region buttons, headings, every visible button, the side menu.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const t = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ');
    const tc = (e) => (e.textContent || '').trim().replace(/\s+/g, ' ');
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const statusH = hs.find((x) => /Status$/.test(tc(x)));
    const box = statusH ? statusH.closest('div.border') || statusH.parentElement : null;
    const recH = hs.find((x) => tc(x) === 'Recommendation');
    const recBox = recH ? recH.closest('div.border') || recH.parentElement : null;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((tb) => ({
        name: (tb.getAttribute('aria-labelledby') && document.getElementById(tb.getAttribute('aria-labelledby')) && t(document.getElementById(tb.getAttribute('aria-labelledby')))) || tb.getAttribute('aria-label') || null,
        rows: [...tb.querySelectorAll('tbody tr')].filter(vis).map((tr) => t(tr).slice(0, 240)),
    }));
    const actions = root.querySelector('[data-cy="workflow-action-items"]');
    return {
        dialogCount: dlgs.length,
        title: hs.filter((h) => /^Workflow:/.test(tc(h))).map(tc)[0] || null,
        headings: hs.map((h) => `${h.tagName.toLowerCase()}:${tc(h)}`).slice(0, 40),
        status: box ? {heading: tc(statusH), lines: [...box.querySelectorAll('p')].map(t)} : null,
        recommendation: recBox ? t(recBox) : null,
        tables,
        actionButtons: actions ? [...actions.querySelectorAll('button, a')].filter(vis).map(t) : null,
        buttons: [...root.querySelectorAll('button')].filter(vis).map(t).filter(Boolean).slice(0, 80),
        menu: [...root.querySelectorAll('nav a, nav button')].filter(vis).map(t).filter(Boolean).slice(0, 30),
        text: t(root).slice(0, 1500),
    };
});
const statusText = (info) => (info && info.status ? `${info.status.heading} — ${info.status.lines.join(' / ')}` : 'no status box');
const lines = (info) => (info && info.status ? info.status.lines : null);
const rowsOf = (info, name) => { const tb = (info.tables || []).find((x) => x.name === name); return tb ? tb.rows : null; };
const editorialUrl = (ctx, id) => `/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`;
const authorUrl = (ctx, id) => `/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}`;

async function openWorkflow(a, url, label) {
    await a.page.goto(`/index.php/${a.ctx}/user/profile`).catch(() => {});
    await a.page.goto(url);
    await idle(a.page);
    await a.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000}).catch(() => {});
    await idle(a.page);
    return reread(a, label);
}
const openEditorial = (a, id, label) => openWorkflow(a, editorialUrl(a.ctx, id), label);
const openAuthor = (a, id, label) => openWorkflow(a, authorUrl(a.ctx, id), label);
async function reread(a, label) {
    await idle(a.page);
    const s = await snap(a.page, label);
    const info = await wfInfo(a.page).catch((e) => ({error: String(e.message), tables: [], buttons: [], headings: [], menu: []}));
    info.notices = s.notices;
    record(`${state.part}-${label}-info`, info);
    return info;
}
/** Press a workflow menu entry ("Review Round 1", "External Review") and read the screen. */
async function selectMenu(a, name, label) {
    const l = a.page.getByRole('link', {name, exact: true}).or(a.page.getByRole('button', {name, exact: true})).first();
    await l.click();
    await idle(a.page);
    await sleep(500);
    return reread(a, label);
}

// ---------------------------------------------------------------------------------------------------
// The decision wizard: "Continue" to "Record Decision", every step snapshotted, then "View Submission".
async function finishDecision(P, a, label, {onStep} = {}) {
    const d = new P.DecisionPage(a.page);
    await a.page.waitForURL(/decision\/record/, {timeout: 45000});
    await a.page.getByRole('heading', {level: 1}).first().waitFor({timeout: 45000});
    await idle(a.page);
    const steps = [];
    for (let i = 0; i < 6; i++) {
        await d.awaitComposerLoaded();
        steps.push(flat(await a.page.getByRole('heading', {level: 1}).first().innerText()));
        await snap(a.page, `${label}-step${i + 1}`);
        if (onStep) await onStep(i);
        if (await d.recordButton.isVisible()) break;
        await d.continueButton.click();
        await idle(a.page);
    }
    fact(`${label}-steps`, steps);
    await d.record();
    await idle(a.page);
    return steps;
}
async function decide(P, a, button, label, opts) {
    const b = typeof button === 'string' ? a.page.getByRole('button', {name: button, exact: true}) : a.page.getByRole('button', {name: button});
    await b.first().click();
    return finishDecision(P, a, label, opts);
}
/** "Request Revisions": its choice window, read as data, left open. */
async function openChoice(a, label) {
    await a.page.getByRole('button', {name: 'Request Revisions', exact: true}).click();
    const modal = a.page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
    await modal.getByRole('radio').first().waitFor({timeout: 30000});
    await idle(a.page);
    const radios = await modal.locator('label').filter({has: a.page.locator('input[type=radio]')})
        .evaluateAll((ls) => ls.map((l) => ({label: l.innerText.trim().replace(/\s+/g, ' '), checked: l.querySelector('input').checked})));
    const buttons = await modal.locator('button:visible, a:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean));
    await snap(a.page, label);
    return {modal, radios, buttons};
}

// ---------------------------------------------------------------------------------------------------
// The editor's "Read Review" on main: the Vue "Review Details" window; `confirm` presses "Mark as
// Complete" and answers its question, else the window is closed with its "Cancel".
async function editorReadReview(P, a, reviewerName, {confirm = true, label = 'read-review'} = {}) {
    const page = a.page;
    const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: reviewerName}).filter({visible: true}).first();
    await row.waitFor({timeout: 30000});
    await idle(page);
    // A confirmed review's row offers no "Read Review": its "More Actions" › "Review Details" opens the window.
    const viaRead = await row.getByRole('button', {name: 'Read Review', exact: true}).waitFor({timeout: 8000}).then(() => true, () => false);
    const modal = viaRead ? await P.openReviewDetails(page, row) : await P.openReviewDetailsFromMenu(page, row);
    await P.awaitReviewDetailsSettled(modal).catch(() => {});
    await idle(page);
    const s = await snap(page, label);
    const buttons = await modal.locator('button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean)).catch(() => []);
    if (confirm && buttons.includes('Mark as Complete')) {
        await P.markReviewComplete(page, modal);
        await idle(page);
    }
    await P.closeReviewDetails(page, modal).catch(async () => { await modal.getByRole('button', {name: 'Close'}).first().click().catch(() => {}); });
    await idle(page);
    return {via: viaRead ? 'Read Review' : 'More Actions › Review Details', buttons, dialog: flat(s.text && s.text.dialog, 400)};
}

/** The reviewer's own page: accept (when asked) and walk to step 3; returns the visible body text. */
async function reviewerToStep3(a, submissionId) {
    const page = a.page;
    await page.goto(`/index.php/${a.ctx}/reviewer/submission/${submissionId}`);
    const acceptB = page.getByRole('button', {name: /Accept Review, Continue to Step #2/});
    const save = page.getByRole('button', {name: 'Save and continue', exact: true});
    const step3 = page.getByRole('button', {name: 'Continue to Step #3'});
    const submitB = page.getByRole('button', {name: 'Submit Review', exact: true});
    await submitB.or(step3).or(acceptB).or(save).filter({visible: true}).first().waitFor({timeout: 45000});
    const one = acceptB.or(save).filter({visible: true});
    if (await one.count()) {
        const privacy = page.locator('input[name="privacyConsent"]').filter({visible: true});
        if (await privacy.count()) await privacy.check();
        await one.first().click();
    }
    await step3.or(submitB).filter({visible: true}).first().waitFor({timeout: 45000});
    if (await step3.filter({visible: true}).count()) await step3.filter({visible: true}).first().click();
    await submitB.filter({visible: true}).waitFor({timeout: 45000});
    await idle(page);
    return page.locator('body').innerText();
}

/** The author's My Submissions row for the title: its text and controls. */
async function myRow(a, title, label) {
    await a.page.goto(`/index.php/${a.ctx}/dashboard/mySubmissions`);
    await idle(a.page);
    const row = a.page.getByRole('row').filter({hasText: title}).first();
    await row.waitFor({timeout: 30000}).catch(() => {});
    await idle(a.page);
    await snap(a.page, label);
    return {
        text: flat(await row.innerText().catch(() => null), 300),
        buttons: await row.locator('button:visible, a:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean)).catch(() => []),
    };
}

module.exports = {
    ...kit, REPO, RUN, txtNamed, log, flat, sleep, has, eq, state, startPart, endPart, fact, check, sect, snap,
    actor, closeActors, wfInfo, statusText, lines, rowsOf, editorialUrl, authorUrl, openWorkflow, openEditorial,
    openAuthor, reread, selectMenu, finishDecision, decide, openChoice, editorReadReview, reviewerToStep3, myRow,
};
