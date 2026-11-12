// U26 "Review stage & rounds" on stable-3_5_0, claim check chunk K2: helpers of k2.js (the entry
// script, which says how to run it). Builds on W1's helpers (../W1/lib.js: bookkeeping, one browser
// per role, the workflow dialog read as data, the editor's legacy "Read Review" window) and on the
// version's OJS page object (apps/ojs/playwright/pages/ReviewStagePages.js: the Add Reviewer form,
// the upload wizard, the decision wizard), which drive the same lib/pkp screens on a press. What is
// here is what differs per app (OMP: "Book Manuscript", the external round's `stage` key, no
// recommendation list) and the reads K2 adds: the reviewer's wizard with a file or a review form,
// the author's "Read Review" window, the reviewer's own lists, the decision wizard's file step.
const path = require('path');
const L = require('../W1/lib');
const {idle, snap, fact, flat, tag, screen, record} = L;

const DECISIONS = ['Request Revisions', 'Accept Submission', 'Create New Review Round', 'Cancel Review Round', 'Decline Submission'];
const RECOMMEND = ['Recommend Revisions', 'Recommend Accept', 'Recommend Decline'];
const has = (list, s) => !!list && list.some((x) => String(x).includes(s));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** What differs per app, and the version's OJS page object (its helpers are page-based). */
function bits(app) {
    const isOMP = app.name === 'omp';
    return {
        isOMP,
        SEND: isOMP ? ['skipInternalReview'] : ['sendExternalReview'],
        R: (o = {}) => (isOMP ? {stage: 'external', ...o} : o),
        GENRE: isOMP ? 'Book Manuscript' : 'Article Text',
        P: require(path.join(L.REPO, 'apps/ojs/playwright/pages/ReviewStagePages.js')),
    };
}

/** A scratch journal or press with throwaway accounts (keys below), `extra` passed to createContext. */
async function journal(app, prefix, extra = {}) {
    const J = tag(`u26vk2${prefix}`);
    const u = {}; const n = {};
    const people = [
        ['mgr', 'Mona', 'Managerly', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'],
        ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['rec', 'Remy', 'Recommendly', 'sectionEditor'],
        ['rec2', 'Rina', 'Recotwo', 'sectionEditor'],
        ['au', 'Avery', 'Authorly', 'author'], ['au2', 'Blake', 'Writerly', 'author'],
        ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer'],
        ['rv3', 'Rudy', 'Revthree', 'externalReviewer'], ['rv4', 'Rosa', 'Revfour', 'externalReviewer'],
    ];
    for (const [k, g, f] of people) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
    await app.api.createContext({
        tag: J, ...extra,
        users: people.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]})),
    });
    fact(`journal-${prefix}`, J);
    return {J, u, n};
}

/** One submission on `j`; `reviewRounds` entries pass through the app's `R()`. */
async function seed(app, j, suffix, {decisions, reviewRounds = [{reviewers: []}], participants, submitter, files} = {}) {
    const B = bits(app);
    const t = `${j.J}${suffix}`;
    const r = await app.api.createSubmission({
        tag: t, context: j.J, submitter: submitter || j.u.au, title: `Submission ${t}`,
        decisions: decisions || B.SEND, reviewRounds: reviewRounds.map((x) => B.R(x)),
        ...(participants ? {participants} : {}), ...(files ? {files} : {}),
    });
    fact(`seed-${suffix}`, {id: r.submissionId, rounds: r.reviewRounds});
    return {id: r.submissionId, title: `Submission ${t}`, tag: t, rounds: r.reviewRounds || []};
}

// ---------------------------------------------------------------------------------------------------
// The decision wizard: "Continue" to "Record Decision", every step snapshotted; `onStep(i)` runs on
// each step before it is left (the file step of "Create New Review Round" is read there).
async function finishDecision(app, a, label, {onStep, record: doRecord = true} = {}) {
    const {P} = bits(app);
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
    if (doRecord) { await d.record(); await idle(a.page); }
    return steps;
}
async function decide(app, a, button, label, opts) {
    await a.page.getByRole('button', {name: button, exact: true}).click();
    return finishDecision(app, a, label, opts);
}
/** The promote-files boxes of a wizard step: each row's label and whether it is ticked. */
const promoteBoxes = (page) => page.locator('label:has(input[name^="promoteFile"])').evaluateAll((ls) => ls
    .filter((l) => l.getClientRects().length > 0)
    .map((l) => ({label: l.innerText.trim().replace(/\s+/g, ' ').slice(0, 160), checked: l.querySelector('input').checked})));

/** "Request Revisions": the choice window, read as data. Leaves it open. */
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
// The reviewer's wizard on 3.5: accept, step 3 with a file, the two remarks or a review form's text
// answers, the recommendation where the list exists (OJS), "Submit Review" › "OK".
async function reviewerDo(a, submissionId, {accept = true, submit = true, comments, privateComments, file, formAnswers, recommendation = 'Accept Submission', label} = {}) {
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
    await idle(page);
    if (!submit) return null;
    if (await step3.filter({visible: true}).count()) await step3.filter({visible: true}).first().click();
    await submitB.filter({visible: true}).waitFor({timeout: 45000});
    await idle(page);
    if (file) {
        const grid = page.locator('#reviewAttachmentsGridContainer');
        await grid.getByRole('link', {name: 'Upload File', exact: true}).click();
        const wiz = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: '1. Upload File'})});
        await wiz.getByRole('tab', {name: '1. Upload File'}).waitFor({timeout: 30000});
        await page.locator('input[type="file"]').last().setInputFiles({name: file, mimeType: 'text/plain', buffer: Buffer.from(`Reviewer file ${file}`)});
        await wiz.getByRole('button', {name: /Change File/}).waitFor({timeout: 30000});
        for (const next of ['2. Review Details', '3. Confirm']) {
            await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
            await wiz.getByRole('tab', {name: next}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: 30000});
            await idle(page);
        }
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click();
        await wiz.waitFor({state: 'hidden', timeout: 30000});
        await grid.getByRole('row').filter({hasText: file}).first().waitFor({timeout: 30000});
    }
    const type = async (selector, text) => {
        const iframe = page.locator(selector).first();
        await iframe.waitFor({timeout: 30000});
        const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
        await page.waitForFunction((eid) => { const m = window.tinyMCE || window.tinymce; return !!(m && m.get(eid) && m.get(eid).initialized); }, id, {timeout: 30000});
        const body = iframe.contentFrame().locator('body');
        await body.click();
        await body.pressSequentially(text);
        await page.evaluate(() => { const m = window.tinyMCE || window.tinymce; for (const e of m.get()) if (e.initialized) { e.fire('change'); e.save(); } });
    };
    if (comments) await type('iframe[id^="comments"]:not([id^="commentsPrivate"])', comments);
    if (privateComments) await type('iframe[id^="commentsPrivate"]', privateComments);
    if (formAnswers) {
        const boxes = page.locator('#reviewStep3Form input[type="text"][name^="reviewFormResponses"]');
        const n = await boxes.count();
        for (let i = 0; i < n; i++) await boxes.nth(i).fill(formAnswers[i] || `answer ${i + 1}`);
    }
    const sel = page.locator('select[name="recommendation"], select[name="reviewerRecommendationId"]').filter({visible: true});
    let selInfo = null;
    if (await sel.count()) {
        selInfo = await sel.first().evaluate((s) => ({name: s.name, options: [...s.options].map((o) => o.text.trim())}));
        await sel.first().selectOption({label: recommendation});
    }
    if (label) await snap(page, label, {recommendationList: selInfo});
    await submitB.filter({visible: true}).click();
    await page.getByRole('button', {name: 'OK', exact: true}).click();
    await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 45000});
    await idle(page);
    return selInfo;
}

/** The reviewer's own lists ("All assignments", "Action Required by me"): their rows as text. */
async function reviewerLists(a, label) {
    const out = {};
    for (const view of ['reviewer-action-required', 'reviewer-assignments-all', 'reviewer-assignments-completed', 'reviewer-assignments-declined', 'reviewer-assignments-archived']) {
        await a.page.goto(`/index.php/${a.ctx}/dashboard/reviewAssignments?currentViewId=${view}`);
        await idle(a.page);
        await a.page.getByRole('table').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(a.page);
        const s = await snap(a.page, `${label}-${view}`);
        out[view] = await a.page.getByRole('table').first().locator('tbody tr').filter({visible: true}).allInnerTexts().then((r) => r.map((x) => flat(x, 200))).catch(() => [flat(s.text && s.text.main, 300)]);
    }
    return out;
}

// ---------------------------------------------------------------------------------------------------
// The author's "Read Review" window. Register A3 is recorded privately: the attachments section is
// read for its presence only, and nothing after its heading is kept (no PNG of the window).
async function authorReadReview(a, reviewerName, label) {
    const page = a.page;
    const row = page.getByRole('row').filter({hasText: reviewerName}).first();
    await row.getByRole('button', {name: 'Read Review', exact: true}).click();
    const win = page.getByRole('dialog').filter({has: page.locator('form#readReviewForm')});
    await win.locator('form#readReviewForm').waitFor({timeout: 45000});
    await idle(page);
    await L.settled(page, win.locator('form#readReviewForm')).catch(() => {});
    const cut = (s) => { if (typeof s !== 'string') return s; const i = s.indexOf('Reviewer Files'); return i >= 0 ? `${s.slice(0, i)}Reviewer Files [section not recorded: register A3]` : s; };
    const s = await screen(page).catch((e) => ({error: String(e.message)}));
    if (s.text) for (const k of Object.keys(s.text)) s.text[k] = cut(s.text[k]);
    if (Array.isArray(s.aria)) s.aria = s.aria.map(cut); else s.aria = cut(s.aria);
    record(`${L.state.part}-${label}`, s);
    const data = await win.last().evaluate((d) => {
        const copy = d.cloneNode(true);
        copy.querySelectorAll('script, style, .pkp_controllers_grid, [id^="component-grid"]').forEach((g) => g.remove());
        const vis = (e) => e.getClientRects().length > 0;
        const whole = (copy.textContent || '').replace(/\s+/g, ' ').trim();
        const i = whole.indexOf('Reviewer Files');
        return {
            title: [...d.querySelectorAll('h1,h2')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean),
            text: (i >= 0 ? whole.slice(0, i) : whole).slice(0, 1200),
            hasFilesHeading: i >= 0,
            inputs: [...d.querySelectorAll('textarea, input[type=text]')].map((x) => ({name: x.name, value: x.value.slice(0, 120), readOnly: x.readOnly || x.disabled})),
            buttons: [...d.querySelectorAll('button, input[type=submit]')].filter(vis).map((b) => (b.innerText || b.value || '').trim()).filter(Boolean),
        };
    });
    record(`${L.state.part}-${label}-data`, data);
    await win.getByRole('button', {name: 'Close', exact: true}).first().click();
    await win.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    await sleep(600);
    return data;
}

/** What the author's round view shows, as the checks read it. */
const authorSees = (ai) => ({
    reviewers: L.rowsOf(ai, 'Reviewers'),
    readReview: (ai.buttons || []).filter((b) => b === 'Read Review').length,
    notifications: (ai.headings || []).some((h) => /:Notifications$/.test(h)),
    uploadRevisions: (ai.buttons || []).includes('Upload revisions'),
    revisionsPanel: L.rowsOf(ai, 'Revisions Uploaded') !== null,
    panelUpload: (ai.buttons || []).includes('Upload'),
    discussions: (ai.headings || []).filter((h) => /Discussions/.test(h)),
    headings: ai.headings, status: L.statusText(ai),
});

module.exports = {
    DECISIONS, RECOMMEND, has, eq, sleep, bits, journal, seed, finishDecision, decide, promoteBoxes, openChoice,
    reviewerDo, reviewerLists, authorReadReview, authorSees,
};
