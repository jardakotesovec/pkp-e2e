// U26 "Review stage & rounds" on stable-3_5_0: helpers of walk.js (the entry script, which says how to run it).
//
// What is here: the run's bookkeeping (snapshots, facts, the "same as the spec?" checks), one browser per
// role (`actor`), reads of the workflow dialog as data (`wfInfo`), and the screen flows that differ on
// 3.5 from `main`'s page objects: the reviewer's wizard (the recommendation list is `recommendation`),
// the editor's "Read Review" window (a legacy window with "Confirm", where `main` has the "Review Details"
// window with "Mark as Complete"), the header's Tasks window and the legacy "Discussions" grid.
const fs = require('fs');
const path = require('path');
const kit = require('../../../probe');
const {launch, signIn, screen, shot, record, idle, outFile} = kit;

// The version's folder: its page objects and fixture files.
const REPO = path.resolve(__dirname, '../../../../..');
const RUN = process.env.PROBE_RUN || 's1';
const PDF = fs.readFileSync(path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf'));
const pdfNamed = (name) => ({name, mimeType: 'application/pdf', buffer: PDF});
const txtNamed = (name) => ({name, mimeType: 'text/plain', buffer: Buffer.from(`Scratch upload ${name}`)});
const log = (...a) => console.log(`[${RUN}]`, ...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));

// ---------------------------------------------------------------------------------------------------
// Bookkeeping. A `check` is one sentence of the spec read on the 3.5 screen: what the spec says, what
// the screen gave, and whether the two agree. `facts` are plain reads. Both land in one JSON per part.
const state = {part: 'x', checks: [], facts: {}};
function startPart(part) { state.part = part; state.checks = []; state.facts = {}; }
function fact(k, v) { state.facts[k] = v; log(state.part, k, typeof v === 'string' ? v : JSON.stringify(v)); }
function check(id, spec, got, same) {
    const row = {id: `${state.part}.${id}`, spec, got: typeof got === 'string' ? got : JSON.stringify(got), same: !!same};
    state.checks.push(row);
    log(same ? 'SAME ' : 'DIFF ', row.id, '|', spec, '|', flat(row.got, 300));
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
        state.checks.push({id: `${state.part}.${name}.FAILED`, spec: 'the step runs', got: msg.slice(0, 900), same: false});
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
// One browser per role. `actor()` signs the user in on the journal's own login page.
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
// The workflow dialog as data: the status box (heading + each line), every table with its rows, the
// action buttons (right column), the side menu, the panel headings, and every button's label.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const t = (e) => (e.innerText || '').trim().replace(/\s+/g, ' ');
    const tc = (e) => (e.textContent || '').trim().replace(/\s+/g, ' '); // headings: innerText follows text-transform
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
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]') || root.querySelector('[data-cy="workflow-secondary-items"]');
    const actions = root.querySelector('[data-cy="workflow-action-items"]');
    return {
        dialogCount: dlgs.length,
        title: hs.filter((h) => /^Workflow:/.test(tc(h))).map(tc)[0] || null,
        headings: hs.map((h) => `${h.tagName.toLowerCase()}:${tc(h)}`).slice(0, 40),
        status: box ? {heading: tc(statusH), lines: [...box.querySelectorAll('p')].map(t)} : null,
        recommendation: recBox ? t(recBox) : null,
        tables,
        actionButtons: actions ? [...actions.querySelectorAll('button, a')].filter(vis).map(t) : null,
        hasActionRegion: !!actionRegion,
        buttons: [...root.querySelectorAll('button')].filter(vis).map(t).filter(Boolean).slice(0, 80),
        menu: [...root.querySelectorAll('nav a')].filter(vis).map(t).filter(Boolean).slice(0, 30),
    };
});
const statusText = (info) => (info && info.status ? `${info.status.heading} — ${info.status.lines.join(' / ')}` : 'no status box');
const table = (info, name) => (info.tables || []).find((tb) => tb.name === name) || null;
const rowsOf = (info, name) => { const tb = table(info, name); return tb ? tb.rows : null; };

const editorialUrl = (ctx, id) => `/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`;
const authorUrl = (ctx, id) => `/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}`;

/** Open a workflow by its address, wait for the dialog, snapshot it and return it as data. */
async function openWorkflow(a, url, label) {
    // Leave the page first: a goto that changes only the query of the open dashboard keeps the old dialog.
    await a.page.goto(`/index.php/${a.ctx}/user/profile`).catch(() => {});
    await a.page.goto(url);
    await idle(a.page);
    await a.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000}).catch(() => {});
    await idle(a.page);
    await snap(a.page, label);
    const info = await wfInfo(a.page).catch((e) => ({error: String(e.message)}));
    record(`${state.part}-${label}-info`, info);
    return info;
}
const openEditorial = (a, id, label) => openWorkflow(a, editorialUrl(a.ctx, id), label);
const openAuthor = (a, id, label) => openWorkflow(a, authorUrl(a.ctx, id), label);
/** Read the open workflow again (after a press that changed it), with a snapshot. */
async function reread(a, label) {
    await idle(a.page);
    await snap(a.page, label);
    const info = await wfInfo(a.page).catch((e) => ({error: String(e.message)}));
    record(`${state.part}-${label}-info`, info);
    return info;
}
/** Press a workflow menu entry ("Review Round 1") and read the screen. */
async function selectMenu(a, name, label) {
    await a.page.getByRole('link', {name, exact: true}).click();
    await idle(a.page);
    return reread(a, label);
}

// ---------------------------------------------------------------------------------------------------
// The reviewer's own page on 3.5. The wizard's four steps are jQuery tabs; step 3's recommendation list
// is `select[name="recommendation"]` (on `main`: `reviewerRecommendationId`).
async function reviewerAccept(a, submissionId) {
    const page = a.page;
    await page.goto(`/index.php/${a.ctx}/reviewer/submission/${submissionId}`);
    const accept = page.getByRole('button', {name: /Accept Review, Continue to Step #2/}).filter({visible: true});
    await accept.waitFor({timeout: 45000});
    const privacy = page.locator('input[name="privacyConsent"]').filter({visible: true});
    if (await privacy.count()) await privacy.check();
    await accept.click();
    await page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true}).waitFor({timeout: 45000});
    await idle(page);
}
async function reviewerSubmit(a, submissionId, {recommendation = 'Accept Submission', comments, privateComments, label} = {}) {
    const page = a.page;
    await page.goto(`/index.php/${a.ctx}/reviewer/submission/${submissionId}`);
    const accept = page.getByRole('button', {name: /Accept Review, Continue to Step #2/});
    const save = page.getByRole('button', {name: 'Save and continue', exact: true});
    const step3 = page.getByRole('button', {name: 'Continue to Step #3'});
    const submit = page.getByRole('button', {name: 'Submit Review', exact: true});
    await submit.or(step3).or(accept).or(save).filter({visible: true}).first().waitFor({timeout: 45000});
    const one = accept.or(save).filter({visible: true});
    if (await one.count()) {
        const privacy = page.locator('input[name="privacyConsent"]').filter({visible: true});
        if (await privacy.count()) await privacy.check();
        await one.first().click();
    }
    await step3.or(submit).filter({visible: true}).first().waitFor({timeout: 45000});
    if (await step3.filter({visible: true}).count()) await step3.filter({visible: true}).first().click();
    await submit.filter({visible: true}).waitFor({timeout: 45000});
    await idle(page);
    // Step 3's two boxes are TinyMCE editors: typed through the editor, once it is initialized.
    const type = async (selector, text) => {
        const iframe = page.locator(selector).first();
        await iframe.waitFor({timeout: 30000});
        const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
        await page.waitForFunction((eid) => { const m = window.tinyMCE || window.tinymce; return !!(m && m.get(eid) && m.get(eid).initialized); }, id, {timeout: 30000});
        const body = iframe.contentFrame().locator('body');
        await body.click();
        await body.pressSequentially(text);
    };
    if (comments) await type('iframe[id^="comments"]:not([id^="commentsPrivate"])', comments); // "For author and editor"
    if (privateComments) await type('iframe[id^="commentsPrivate"]', privateComments); // "For editor"
    const sel = page.locator('select[name="recommendation"], select[name="reviewerRecommendationId"]').filter({visible: true}).first();
    const selInfo = await sel.evaluate((s) => ({name: s.name, id: s.id, options: [...s.options].map((o) => o.text.trim())}));
    await sel.selectOption({label: recommendation});
    if (label) await snap(page, label, {recommendationList: selInfo});
    await submit.filter({visible: true}).click();
    await page.getByRole('button', {name: 'OK', exact: true}).click();
    await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 45000});
    await idle(page);
    return selInfo;
}

// ---------------------------------------------------------------------------------------------------
// The editor's "Read Review" on 3.5: a legacy window (form#readReviewForm) whose footer button confirms
// the review. Returns what the window showed. `confirm: false` closes it with its own "Cancel"/"Close".
async function editorReadReview(a, reviewerName, {confirm = true, label = 'read-review'} = {}) {
    const page = a.page;
    const row = page.getByRole('row').filter({hasText: reviewerName}).first();
    await row.getByRole('button', {name: 'Read Review', exact: true}).click();
    const vue = page.getByRole('dialog', {name: /^Review Details:/});
    const legacy = page.getByRole('dialog').filter({has: page.locator('form#readReviewForm')});
    await vue.or(legacy).first().waitFor({timeout: 45000});
    await idle(page);
    const isVue = (await vue.count()) > 0 && (await legacy.count()) === 0;
    const dlg = isVue ? vue : legacy;
    await dlg.locator('button, a').first().waitFor({timeout: 30000}).catch(() => {});
    await kit.settled(page, dlg.last()).catch(() => {});
    const s = await snap(page, label);
    const info = await dlg.last().evaluate((d) => {
        const vis = (e) => e.getClientRects().length > 0;
        const t = (e) => (e.innerText || e.value || '').trim().replace(/\s+/g, ' ');
        return {
            title: [...d.querySelectorAll('h1,h2')].filter(vis).map(t).filter(Boolean),
            headings: [...d.querySelectorAll('h3,h4')].filter(vis).map(t).filter(Boolean),
            buttons: [...d.querySelectorAll('button, input[type=submit]')].filter(vis).map(t).filter(Boolean),
            links: [...d.querySelectorAll('a')].filter(vis).map(t).filter(Boolean).slice(0, 20),
            text: (d.innerText || "").replace(/\s+\n/g, "\n").slice(0, 3000),
        };
    });
    info.kind = isVue ? 'vue Review Details' : 'legacy readReviewForm';
    info.dialogText = s.text && s.text.dialog ? s.text.dialog.slice(0, 600) : null;
    if (confirm) {
        if (isVue) {
            await dlg.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            const c = page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'});
            await c.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
            await idle(page);
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
        } else {
            const btn = dlg.locator('button[id^="submitFormButton"]').filter({visible: true}).first();
            info.confirmLabel = flat(await btn.innerText().catch(() => null));
            await btn.click();
        }
        await dlg.first().waitFor({state: 'hidden', timeout: 45000}).catch(() => {});
    } else {
        const close = dlg.getByRole('button', {name: 'Close', exact: true}).first();
        await close.click();
        await dlg.first().waitFor({state: 'hidden', timeout: 45000}).catch(() => {});
    }
    await idle(page);
    return info;
}

// ---------------------------------------------------------------------------------------------------
// The header's Tasks window: its rows as text. The window is a legacy grid in both lines.
async function taskRows(a, label) {
    const page = a.page;
    await page.goto(`/index.php/${a.ctx}/dashboard/mySubmissions`);
    await idle(page);
    const bell = page.getByRole('button', {name: /^Tasks/}).first();
    await bell.waitFor({timeout: 30000});
    const badge = flat(await bell.innerText());
    await bell.click();
    const dlg = page.getByRole('dialog').filter({has: page.getByRole('heading', {name: 'Tasks', exact: true})});
    await dlg.locator('table').first().waitFor({timeout: 45000});
    await idle(page);
    const rows = await dlg.locator('table tbody tr').filter({visible: true}).allInnerTexts().then((r) => r.map((x) => flat(x, 260)));
    if (label) await snap(page, label, {bell: badge, taskRows: rows});
    await dlg.getByRole('button', {name: 'Close', exact: true}).first().click();
    await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    return {badge, rows};
}

module.exports = {
    ...kit, REPO, RUN, PDF, pdfNamed, txtNamed, log, flat, state, startPart, endPart, fact, check, sect, snap,
    actor, closeActors, wfInfo, statusText, table, rowsOf, editorialUrl, authorUrl, openWorkflow, openEditorial,
    openAuthor, reread, selectMenu, reviewerAccept, reviewerSubmit, editorReadReview, taskRows,
};
