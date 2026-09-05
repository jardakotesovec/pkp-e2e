// U29 claim check, chunk K6: {OJS} Settings › Workflow › Review › "Reviewer
// Recommendations" (the tab, its Add/Edit window, the reviewer's step 3
// "Recommendation" list, a new language), the press's absence of the tab and
// of the reviewer's list, the preprint server's absence of the Review tab.
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Purpose 14–42,
// Fields "Recommendation" 114–122, Rules 18–19 (293–323), register A7 and
// OMP1, scenarios 10 and 12 (509–523, 532–539), footnotes c, p, q, f-a7,
// f-omp1.
//
// Seeds its own scratch context per app. OJS: a journal with en + fr_CA as UI
// languages (French NOT yet a form language), a throwaway manager and one
// throwaway external reviewer, two submissions in external review with that
// reviewer accepted (s1: the review is submitted with "See Comments"; s2: a
// recommendation saved for later, then deactivated). OMP: a press with a
// throwaway manager and reviewer, one submission in external review (the
// reviewer's step 3 has no list). OPS: nothing to seed; the tooling refusal
// of the `review` key is recorded. Nothing on the seeded contexts is touched.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK6 node bin/probe.js all shared/playwright/checks/U29/K6/k6.js
//   PHASES=seed,a,b,c,d,e,f   (default: all; later phases reuse k6-scratch-<app>.json)
//   a {ojs} manager: the tab and its defaults, row menu, Add window, empty save, add, edit, deactivate + reload (Fields; Rule 18; A7; scenario 10)
//   b {ojs} reviewer: s1 step 3 list after add + deactivate; s2 "Save for Later" with "Resubmit Elsewhere"; s1 submitted with "See Comments" (Rule 18; scenario 10)
//   c {ojs} manager: the in-use row, its toggles, delete, the workflow page; rename a default, add "Only English", tick "Forms" for French, reread the windows (Rule 18; Rule 19; scenario 10)
//   d {ojs} reviewer: s2 step 3 in /fr_CA/ and /en/ (Rule 18 "since deactivated"; Rule 19)
//   e {omp} manager.maya: the Review side tabs, the typed address; the throwaway reviewer's step 3 (Purpose; OMP1)
//   f {ops} manager.maya: the Workflow tabs, the typed Review address, the control (Purpose; scenario 12)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'a', 'b', 'c', 'd', 'e', 'f'];
const on = (p) => PHASES.includes(p);
const scratchFile = (app) => path.join(outDir(), `k6-scratch-${app.name}.json`);
const resultsFile = (app) => path.join(outDir(), `k6-results-${app.name}.json`);
const log = (...a) => console.log(`[${process.env.PKP_APP_NAME}]`, ...a);
const RECS_PATH = (ctx) => `/index.php/${ctx}/en/management/settings/workflow#review/reviewerRecommendations`;
const MGR = '[data-cy="reviewer-recommendation-manager"]';
const TYPE_WORDS = /Approved|Not Approved|Revisions Requested|With Comments/;

async function full(page, name, extra = {}) {
    const data = await screen(page);
    data.tabSelected = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null);
    data.url = page.url();
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** The Reviewer Recommendations table as data. */
async function readRecs(page) {
    return page.evaluate((sel) => {
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        const m = document.querySelector(sel);
        if (!m) return {present: false};
        return {
            present: true,
            heading: t(m.querySelector('h1, h2, h3, h4')),
            tableAria: m.querySelector('table') && m.querySelector('table').getAttribute('aria-label'),
            headers: [...m.querySelectorAll('th')].filter((h) => h.closest('thead')).map(t),
            topButtons: [...m.querySelectorAll('button')].filter((b) => !b.closest('tbody')).map(t),
            rows: [...m.querySelectorAll('tbody tr')].map((r) => {
                const cb = r.querySelector('input[type=checkbox]');
                const menu = r.querySelector('button[aria-label*="More Actions"]');
                return {title: t(r.querySelector('th, td')), checked: cb ? cb.checked : null, disabled: cb ? cb.disabled : null, menu: !!menu};
            }),
            typeWordsInTable: /Approved|Not Approved|Revisions Requested|With Comments/.test(m.innerText),
        };
    }, MGR);
}

/** Every visible [role=dialog] as data. */
async function readDialogs(page) {
    return page.evaluate(() => {
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        return [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length).map((d) => ({
            headings: [...d.querySelectorAll('h1, h2, h3, h4')].map(t).filter(Boolean),
            text: d.innerText,
            inputs: [...d.querySelectorAll('input, select, textarea')].map((i) => ({tag: i.tagName, type: i.type, name: i.name, id: i.id, value: i.value, placeholder: i.placeholder,
                options: i.tagName === 'SELECT' ? [...i.options].map((o) => ({text: o.text, value: o.value, selected: o.selected})) : undefined})),
            labels: [...d.querySelectorAll('label, legend, .pkpFormField__heading, .pkpFormField__description, .pkpFormLocales')].map(t).filter(Boolean),
            errors: [...d.querySelectorAll('.pkpFieldError, .pkpFormErrors')].map(t).filter(Boolean),
            buttons: [...d.querySelectorAll('button')].map(t).filter(Boolean),
        }));
    });
}

const notices = (page) => page.evaluate(() => [...document.querySelectorAll('[role=status], [role=alert], .pkpNotification, [class*="notification"]')].filter((e) => e.innerText.trim()).map((e) => e.innerText.trim()));

async function openRecs(page, app, ctx) {
    await page.goto(app.url(RECS_PATH(ctx)));
    await idle(page);
    const reviewTab = page.getByRole('tab', {name: 'Review', exact: true});
    if ((await reviewTab.count()) && (await reviewTab.getAttribute('aria-selected')) !== 'true') await reviewTab.click();
    const side = page.getByRole('tab', {name: 'Reviewer Recommendations'});
    if ((await side.count()) && (await side.getAttribute('aria-selected')) !== 'true') await side.click();
    await page.locator(`${MGR} tbody tr`).first().waitFor({timeout: 20000}).catch(() => {});
    await idle(page);
}

const row = (page, title) => page.locator(`${MGR} tbody tr`).filter({hasText: title});
const dialogOf = (page, text) => page.locator('[role=dialog]').filter({hasText: text}).last();
const lastDialog = (page) => page.locator('[role=dialog]').last();

/** Tick or untick a row's "Activate" box; returns the dialog and the status call. */
async function toggle(page, title, name) {
    const o = {};
    await row(page, title).locator('input[type=checkbox]').click();
    await lastDialog(page).waitFor({timeout: 10000});
    o.dialog = await readDialogs(page);
    await full(page, `${name}-dialog`, {dialogs: o.dialog});
    const w = page.waitForResponse((x) => /recommendations\/\d+\/status/.test(x.url()), {timeout: 10000}).catch(() => null);
    await lastDialog(page).getByRole('button', {name: 'Yes', exact: true}).click();
    const s = await w; o.response = s ? {status: s.status(), method: s.request().method()} : null;
    const wanted = !(await row(page, title).locator('input[type=checkbox]').isChecked().catch(() => false));
    o.stateWaited = await page.waitForFunction(({sel, title, wanted}) => { const r = [...document.querySelectorAll(`${sel} tbody tr`)].find((x) => x.innerText.includes(title)); return r && r.querySelector('input[type=checkbox]').checked === wanted; }, {sel: MGR, title, wanted}, {timeout: 10000}).then(() => true).catch(() => false);
    await idle(page);
    o.notices = await notices(page);
    o.table = await readRecs(page);
    await full(page, `${name}-after`, {table: o.table, notices: o.notices});
    return o;
}

/** Open a row's More Actions menu item ("Edit" or "Delete"). */
async function rowAction(page, title, item) {
    const r = row(page, title);
    await r.locator('button[aria-label*="More Actions"]').click();
    const items = await page.locator('[role=menuitem]:visible').allInnerTexts();
    await page.getByRole('menuitem', {name: item}).click();
    return items;
}

/** Fill the Add/Edit window: title(s), type, status; Save; wait for the table. */
async function saveWindow(page, dlg, {title, titleFr, type, status}) {
    if (title !== undefined) await dlg.locator('input[name^="title"]').first().fill(title);
    if (titleFr !== undefined) { await dlg.getByRole('button', {name: 'French'}).click().catch(() => {}); await dlg.locator('input[name="title-fr_CA"]').fill(titleFr); }
    if (type) await dlg.locator('select[name="type"]').selectOption({label: type});
    if (status) await dlg.locator('select[name="status"]').selectOption({label: status});
    const w = page.waitForResponse((x) => /reviewers\/recommendations/.test(x.url()) && x.request().method() === 'POST', {timeout: 10000}).catch(() => null);
    await dlg.getByRole('button', {name: 'Save', exact: true}).click();
    const s = await w;
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
    await idle(page);
    return s ? {status: s.status(), url: s.url()} : null;
}

/** Walk the reviewer's wizard to step 3 (re-resolving the button each press) and read the list. */
async function reviewerStep3(page, app, ctx, subId, prefix, locale = 'en') {
    const o = {};
    await page.goto(app.url(`/index.php/${ctx}/${locale}/reviewer/submission/${subId}?step=3`));
    await idle(page);
    o.landedURL = page.url();
    for (let i = 0; i < 3; i++) {
        if (await page.locator('select#reviewerRecommendationId, h2:has-text("Review Submitted"), input[name^="reviewFormResponses"], iframe[id^="comments"]').count()) break;
        const btn = page.locator('button:visible, a.pkp_button:visible, input[type=submit]:visible').filter({hasText: /Continue to Step #|Save and continue|Continuer|Enregistrer et continuer/}).first();
        if (!(await btn.count())) break;
        o[`pressed${i}`] = await btn.innerText();
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        await btn.click({force: true, timeout: 10000}).catch(() => btn.dispatchEvent('click'));
        await idle(page);
    }
    o.step3URL = page.url();
    o.recommendation = await page.evaluate(() => {
        const s = document.querySelector('select#reviewerRecommendationId');
        const sec = s && s.closest('.section, fieldset, div');
        return {present: !!s, sectionText: sec ? sec.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null,
            options: s ? [...s.options].map((x) => ({text: x.text, value: x.value, selected: x.selected})) : null,
            anyRecommendationWord: /Recommendation|Recommandation/.test(document.body.innerText)};
    });
    await full(page, prefix, {step3: o});
    return o;
}

forEachApp(async (app) => {
    const out = fs.existsSync(resultsFile(app)) ? JSON.parse(fs.readFileSync(resultsFile(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(resultsFile(app), JSON.stringify(out, null, 2));
    let scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;

    // ---------------- seed
    if (on('seed') && !scratch) {
        const t = tag('u29k6');
        scratch = {tag: t, mgr: `${t}mgr`, rev: `${t}rev`};
        if (app.name === 'ops') {
            // Purpose / footnote p: the tooling refuses review settings on a preprint server.
            try {
                await app.api.createContext({tag: t, review: {numReviewsPerSubmission: 1}, users: [{username: scratch.mgr, roles: ['manager']}]});
                scratch.reviewKeyRefusal = 'ACCEPTED (unexpected)';
            } catch (e) { scratch.reviewKeyRefusal = String(e.message).slice(0, 300); }
            try {
                await app.api.createContext({tag: `${t}b`, reviewForms: [{title: 'X'}], users: [{username: `${t}bmgr`, roles: ['manager']}]});
                scratch.reviewFormsKeyRefusal = 'ACCEPTED (unexpected)';
            } catch (e) { scratch.reviewFormsKeyRefusal = String(e.message).slice(0, 300); }
            log('[seed ops]', JSON.stringify(scratch));
        } else {
            const ctxSpec = {tag: t, users: [
                {username: scratch.mgr, roles: ['manager'], givenName: 'Kay', familyName: 'Sixmgr'},
                {username: scratch.rev, roles: ['externalReviewer'], givenName: 'Kay', familyName: 'Sixrev'},
            ]};
            if (app.name === 'ojs') ctxSpec.context = {supportedLocales: ['en', 'fr_CA']};
            const ctx = await app.api.createContext(ctxSpec);
            scratch.contextId = ctx.contextId; scratch.path = ctx.path;
            const subs = app.name === 'ojs' ? ['s1', 's2'] : ['s1'];
            for (const s of subs) {
                const sub = await app.api.createSubmission({
                    tag: `${t}${s}`, context: scratch.path, submitter: 'author.alex', title: `U29 K6 ${s} ${t}`, submitted: true,
                    decisions: ['sendExternalReview'],
                    reviewRounds: [{reviewers: [{username: scratch.rev, status: 'accepted'}]}],
                });
                scratch[s] = sub.submissionId;
            }
            log('[seed]', JSON.stringify(scratch));
        }
        fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
        out.seed = scratch; save();
    }
    if (!scratch) { log('no scratch context; run PHASES=seed first'); return; }

    const {page, close} = await launch(app);
    const browserDialogs = [];
    page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); });
    try {
        // ---------------- a: {ojs} manager — the tab, the window, add, edit, deactivate
        if (app.name === 'ojs' && on('a')) {
            const r = {}; out.a = r;
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openRecs(page, app, scratch.path);
            r.sideTabs = await page.locator('[role=tablist]').nth(2).locator('[role=tab]').allInnerTexts().catch(() => null);
            r.fresh = await readRecs(page);
            await full(page, 'a1-tab-fresh', {table: r.fresh, sideTabs: r.sideTabs});
            await loc(page, 'Reviewer Recommendations side tab', page.getByRole('tab', {name: 'Reviewer Recommendations'}));
            await loc(page, 'Add Recommendation button', page.locator(MGR).getByRole('button', {name: 'Add Recommendation'}));
            // row menu on a default
            await row(page, 'Accept Submission').locator('button[aria-label*="More Actions"]').click();
            r.defaultRowMenu = await page.locator('[role=menuitem]:visible').allInnerTexts();
            await full(page, 'a2-default-row-menu', {menu: r.defaultRowMenu});
            await page.keyboard.press('Escape');
            // the Edit window of a default: its type, then Close
            await rowAction(page, 'Accept Submission', 'Edit');
            let dlg = dialogOf(page, 'Edit Recommendation'); await dlg.waitFor({timeout: 15000});
            r.editDefault = await readDialogs(page);
            await full(page, 'a3-edit-default-window', {dialogs: r.editDefault});
            await dlg.getByRole('button', {name: 'Close'}).click(); await dlg.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
            // types of every default, read from each Edit window
            r.defaultTypes = {};
            for (const t of ['Revisions Required', 'Resubmit for Review', 'Resubmit Elsewhere', 'Decline Submission', 'See Comments']) {
                await rowAction(page, t, 'Edit');
                dlg = dialogOf(page, 'Edit Recommendation'); await dlg.waitFor({timeout: 15000});
                r.defaultTypes[t] = await dlg.locator('select[name="type"] option:checked').innerText().catch(() => null);
                await dlg.getByRole('button', {name: 'Close'}).click(); await dlg.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
            }
            // Add window: fields, empty save
            await page.locator(MGR).getByRole('button', {name: 'Add Recommendation'}).click();
            dlg = dialogOf(page, 'Add Recommendation'); await dlg.waitFor({timeout: 15000});
            r.addWindow = await readDialogs(page);
            await full(page, 'a4-add-window', {dialogs: r.addWindow});
            await loc(page, 'Add window title box', dlg.locator('input[name^="title"]'));
            await loc(page, 'Add window type select', dlg.locator('select[name="type"]'));
            await loc(page, 'Add window status select', dlg.locator('select[name="status"]'));
            const reqs = []; const onReq = (q) => { if (/reviewers\/recommendations/.test(q.url()) && q.method() !== 'GET') reqs.push(q.method() + ' ' + q.url()); };
            page.on('request', onReq);
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            await dlg.locator('.pkpFieldError, .pkpFormErrors').first().waitFor({timeout: 8000}).catch(() => {});
            r.emptySave = {requests: reqs.slice(), dialogs: await readDialogs(page)};
            await full(page, 'a5-add-empty-save', r.emptySave);
            // title only, type blank
            await dlg.locator('input[name^="title"]').first().fill('Major revisions');
            const saveBtn = dlg.getByRole('button', {name: 'Save', exact: true});
            r.saveDisabledAfterTitle = await saveBtn.isDisabled();
            if (!r.saveDisabledAfterTitle) { await saveBtn.click(); await idle(page); }
            r.typeBlankSave = {saveDisabled: r.saveDisabledAfterTitle, requests: reqs.slice(), dialogs: await readDialogs(page)};
            await full(page, 'a6-add-type-blank-save', r.typeBlankSave);
            page.off('request', onReq);
            // real add
            r.addResponse = await saveWindow(page, dlg, {type: 'Revisions Requested'});
            await page.waitForFunction((sel) => document.querySelectorAll(`${sel} tbody tr`).length >= 7, MGR, {timeout: 10000}).catch(() => {});
            r.afterAdd = {notices: await notices(page), table: await readRecs(page), dialogOpen: await dialogOf(page, 'Add Recommendation').count()};
            await full(page, 'a7-after-add', r.afterAdd);
            // edit the new row: keeps its place
            r.newRowMenu = await rowAction(page, 'Major revisions', 'Edit');
            dlg = dialogOf(page, 'Edit Recommendation'); await dlg.waitFor({timeout: 15000});
            r.editWindow = await readDialogs(page);
            await full(page, 'a8-edit-window', {dialogs: r.editWindow});
            r.editResponse = await saveWindow(page, dlg, {title: 'Major revisions (edited)'});
            await page.waitForFunction((sel) => /Major revisions \(edited\)/.test(document.querySelector(sel).innerText), MGR, {timeout: 10000}).catch(() => {});
            r.afterEdit = {notices: await notices(page), table: await readRecs(page)};
            await full(page, 'a9-after-edit', r.afterEdit);
            // deactivate Accept Submission, then reload (A7)
            r.deactivate = await toggle(page, 'Accept Submission', 'a10-deactivate-accept');
            await page.reload(); await idle(page);
            await openRecs(page, app, scratch.path);
            r.afterReload = await readRecs(page);
            await full(page, 'a11-after-reload', {table: r.afterReload});
            r.browserDialogs = browserDialogs.slice();
            save();
        }
        // ---------------- b: {ojs} reviewer — s1 list; s2 saved for later; s1 submitted
        if (app.name === 'ojs' && on('b')) {
            const r = {}; out.b = r;
            await signIn(page, scratch.rev, {contextPath: scratch.path});
            r.s1 = await reviewerStep3(page, app, scratch.path, scratch.s1, 'b1-s1-step3');
            await loc(page, 'step 3 Recommendation select', page.locator('select#reviewerRecommendationId'));
            r.s1typeWords = TYPE_WORDS.test(await page.locator('body').innerText());
            // s2: choose Resubmit Elsewhere, Save for Later
            r.s2 = await reviewerStep3(page, app, scratch.path, scratch.s2, 'b2-s2-step3');
            await page.locator('select#reviewerRecommendationId').selectOption({label: 'Resubmit Elsewhere'});
            const later = page.locator('button, a.pkp_button, input[type=submit]').filter({hasText: /Save for Later/}).first();
            r.saveForLaterCount = await later.count();
            await loc(page, 'step 3 Save for Later', later);
            if (r.saveForLaterCount) { await later.click(); await idle(page); }
            r.afterSaveForLater = {url: page.url(), notices: await notices(page)};
            await full(page, 'b3-s2-saved-for-later', r.afterSaveForLater);
            // s1: comment + See Comments + Submit Review
            await page.goto(app.url(`/index.php/${scratch.path}/en/reviewer/submission/${scratch.s1}?step=3`)); await idle(page);
            await page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body').fill('U29 K6 check comment line.');
            await page.locator('select#reviewerRecommendationId').selectOption({label: 'See Comments'});
            await page.getByRole('button', {name: 'Submit Review', exact: true}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to submit this review?'});
            await confirm.waitFor({timeout: 15000});
            r.confirm = await readDialogs(page);
            await confirm.getByRole('button', {name: 'OK', exact: true}).click();
            await confirm.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            await full(page, 'b4-s1-submitted');
            r.s1afterSubmitURL = page.url();
            save();
        }
        // ---------------- c: {ojs} manager — the in-use row, delete, workflow page, rename, add, new language
        if (app.name === 'ojs' && on('c')) {
            const r = {}; out.c = r;
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openRecs(page, app, scratch.path);
            r.afterSubmit = await readRecs(page);
            await full(page, 'c1-after-submit', {table: r.afterSubmit});
            await loc(page, 'See Comments row (in use) More Actions', row(page, 'See Comments').locator('button[aria-label*="More Actions"]'));
            await row(page, 'Decline Submission').locator('button[aria-label*="More Actions"]').click();
            r.controlMenu = await page.locator('[role=menuitem]:visible').allInnerTexts();
            await page.keyboard.press('Escape');
            r.untickInUse = await toggle(page, 'See Comments', 'c2-untick-see-comments');
            r.tickInUse = await toggle(page, 'See Comments', 'c3-tick-see-comments');
            // the option saved for later on s2 (not submitted): deactivate it
            r.deactivateSavedForLater = await toggle(page, 'Resubmit Elsewhere', 'c4-untick-resubmit-elsewhere');
            // delete the custom row
            r.deleteMenu = await rowAction(page, 'Major revisions (edited)', 'Delete');
            await lastDialog(page).waitFor({timeout: 10000});
            r.deleteDialog = await readDialogs(page);
            await full(page, 'c5-delete-dialog', {dialogs: r.deleteDialog});
            const w = page.waitForResponse((x) => /reviewers\/recommendations\/\d+$/.test(x.url()) && x.request().method() !== 'GET', {timeout: 10000}).catch(() => null);
            await lastDialog(page).getByRole('button', {name: 'Yes', exact: true}).click();
            const s = await w; r.deleteResponse = s ? {status: s.status(), method: s.request().method()} : null;
            await page.waitForFunction((sel) => !/Major revisions/.test(document.querySelector(sel).innerText), MGR, {timeout: 10000}).catch(() => {});
            await idle(page);
            r.afterDelete = {notices: await notices(page), table: await readRecs(page)};
            await full(page, 'c6-after-delete', r.afterDelete);
            // the workflow page of s1: does the type show anywhere? does the chosen option?
            await page.goto(app.url(`/index.php/${scratch.path}/en/dashboard/editorial?workflowSubmissionId=${scratch.s1}`)); await idle(page);
            await page.locator('[role=dialog]').last().waitFor({timeout: 20000}).catch(() => {});
            await idle(page);
            const panel = await page.locator('[role=dialog]').last().innerText().catch(() => '');
            r.workflow = {typeWords: TYPE_WORDS.test(panel), seeComments: /See Comments/.test(panel), excerpt: panel.replace(/\s+/g, ' ').slice(0, 600)};
            await full(page, 'c7-workflow-s1', r.workflow);
            // Rule 19 prep: rename a default, add an English-only option
            await openRecs(page, app, scratch.path);
            await rowAction(page, 'Decline Submission', 'Edit');
            let dlg = dialogOf(page, 'Edit Recommendation'); await dlg.waitFor({timeout: 15000});
            r.renameResponse = await saveWindow(page, dlg, {title: 'Decline (renamed)'});
            await page.locator(MGR).getByRole('button', {name: 'Add Recommendation'}).click();
            dlg = dialogOf(page, 'Add Recommendation'); await dlg.waitFor({timeout: 15000});
            r.addOnlyEnglishResponse = await saveWindow(page, dlg, {title: 'Only English', type: 'With Comments'});
            r.beforeLanguage = await readRecs(page);
            await full(page, 'c8-before-language', {table: r.beforeLanguage});
            // Website › Setup › Languages: tick "Forms" for French
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/website#setup/languages`)); await idle(page);
            const setupTab = page.getByRole('tab', {name: 'Setup', exact: true});
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            const langTab = page.getByRole('tab', {name: 'Languages', exact: true});
            if ((await langTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await langTab.click();
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000}); await idle(page);
            const grid = () => page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((h) => h.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((x) => ({text: x.innerText.trim().replace(/\s+/g, ' '), boxes: [...x.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked, disabled: b.disabled}))}))}));
            r.langBefore = await grid();
            await full(page, 'c9-languages-before', {grid: r.langBefore});
            const frRow = page.locator('#languageGridContainer tbody tr.gridRow').filter({hasText: /Fran|French/});
            const formsBox = frRow.locator('input[type=checkbox][id*="formLocale"]').first();
            await loc(page, 'Languages grid French "Forms" box', formsBox);
            const wl = page.waitForResponse((x) => x.request().method() === 'POST' && /language/.test(x.url()), {timeout: 10000}).catch(() => null);
            if (!(await formsBox.isChecked())) await formsBox.click();
            const sl = await wl; r.formsBoxResponse = sl ? {status: sl.status(), url: sl.url()} : null;
            await idle(page);
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
            r.langAfter = await grid();
            await full(page, 'c10-languages-after', {grid: r.langAfter});
            // reread the Edit windows: an untouched default, the renamed default, the English-only option
            await openRecs(page, app, scratch.path);
            r.afterLanguage = await readRecs(page);
            r.titlesAfterLanguage = {};
            for (const t of ['Accept Submission', 'Decline (renamed)', 'Only English']) {
                await rowAction(page, t, 'Edit');
                dlg = dialogOf(page, 'Edit Recommendation'); await dlg.waitFor({timeout: 15000});
                const d = (await readDialogs(page)).pop();
                r.titlesAfterLanguage[t] = {titles: d.inputs.filter((i) => /^title/.test(i.name)).map((i) => ({name: i.name, value: i.value})), labels: d.labels};
                await full(page, `c11-edit-${t.replace(/[^a-z]+/gi, '-').toLowerCase()}-after-language`, {dialog: d});
                await dlg.getByRole('button', {name: 'Close'}).click(); await dlg.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
            }
            r.browserDialogs = browserDialogs.slice();
            save();
        }
        // ---------------- d: {ojs} reviewer — s2 in French and English
        if (app.name === 'ojs' && on('d')) {
            const r = {}; out.d = r;
            await signIn(page, scratch.rev, {contextPath: scratch.path});
            r.s2fr = await reviewerStep3(page, app, scratch.path, scratch.s2, 'd1-s2-step3-fr', 'fr_CA');
            r.s2en = await reviewerStep3(page, app, scratch.path, scratch.s2, 'd2-s2-step3-en', 'en');
            // s1 (submitted): what does a typed step 3 show now?
            r.s1 = await reviewerStep3(page, app, scratch.path, scratch.s1, 'd3-s1-step3-after-submit', 'en');
            save();
        }
        // ---------------- e: {omp} the press's absence
        if (app.name === 'omp' && on('e')) {
            const r = {}; out.e = r;
            await signIn(page, 'manager.maya');
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/workflow#review/reviewerRecommendations`)); await idle(page);
            const reviewTab = page.getByRole('tab', {name: 'Review', exact: true});
            if ((await reviewTab.getAttribute('aria-selected')) !== 'true') await reviewTab.click();
            await idle(page);
            r.mainTabs = await page.locator('[role=tablist]').first().locator('[role=tab]').allInnerTexts();
            r.sideTabs = await page.locator('[role=tablist]').nth(2).locator('[role=tab]').allInnerTexts();
            r.recsTabCount = await page.getByRole('tab', {name: 'Reviewer Recommendations'}).count();
            r.managerCount = await page.locator(MGR).count();
            await full(page, 'e1-review-tab', r);
            await page.reload(); await idle(page);
            r.afterReload = {url: page.url(), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts()};
            await full(page, 'e2-typed-address-reload', r.afterReload);
            const rt = page.getByRole('tab', {name: 'Review', exact: true});
            if ((await rt.getAttribute('aria-selected')) !== 'true') await rt.click();
            await page.getByRole('tab', {name: 'Review Forms', exact: true}).click(); await idle(page);
            r.control = {formsGrid: await page.locator('#reviewFormGridContainer').count()};
            await full(page, 'e3-review-forms-control', r.control);
            // the press reviewer's step 3
            await signIn(page, scratch.rev, {contextPath: scratch.path});
            r.reviewerStep3 = await reviewerStep3(page, app, scratch.path, scratch.s1, 'e4-reviewer-step3');
            save();
        }
        // ---------------- f: {ops} the preprint server's absence
        if (app.name === 'ops' && on('f')) {
            const r = {}; out.f = r;
            r.tooling = {reviewKey: scratch.reviewKeyRefusal, reviewFormsKey: scratch.reviewFormsKeyRefusal};
            await signIn(page, 'manager.maya');
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/workflow`)); await idle(page);
            r.mainTabs = await page.locator('[role=tablist]').first().locator('[role=tab]').allInnerTexts();
            r.reviewTabCount = await page.getByRole('tab', {name: 'Review', exact: true}).count();
            r.selected = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts();
            await full(page, 'f1-workflow', r);
            await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/workflow#review/reviewSetup`)); await idle(page);
            await page.reload(); await idle(page);
            r.typed = {url: page.url(), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts(), forms: await page.locator('[role=tabpanel]:visible form').count()};
            await full(page, 'f2-typed-review-address', r.typed);
            save();
        }
    } finally {
        out.browserDialogs = browserDialogs; save();
        await close();
    }
});
