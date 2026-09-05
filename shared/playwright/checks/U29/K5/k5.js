// U29 claim check, chunk K5: review forms in use — activate/deactivate, the
// in-use lock, copy, reorder, delete, and where a form lands (the Add
// Reviewer window, the reviewer row's "Edit" window, the reviewer's step 3).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Rules 11, 12, 14,
// 17 (222–243, 251–257, 281–292), register A2, A3, A6, scenarios 7 and 8
// (482–501), footnotes f, f-a2, f-a3, f-a6.
//
// Seeds its own scratch context per app: a throwaway manager and two
// throwaway external reviewers; forms "Form A" (active), "Form B" (inactive),
// "Form C" (active), each with a required text box and a Yes/No radio;
// submissions in external review: s1 rev1 accepted + Form A, s2 reviewer.paul
// declined + Form A, s3 no reviewer (the Add Reviewer target), s4
// reviewer.paul declined + Form C, s5 rev2 accepted + Form A (rev2 submits
// the review through the wizard, so "Completed" gets a count). Records every
// screen. Nothing on the seeded context is touched. OPS has no Review tab:
// skipped with a record.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U29/K5/k5.js
//   PHASES=seed,a,b,c,d,e   (default: all; later phases reuse k5-scratch-<app>.json)
//   a: list, lock, preview, Add Reviewer list, activate Form B, s1 Edit window (Rules 11, 12, 17)
//   b: rev2 submits the review on s5 → "Completed" 1; the submitted row's Edit window (Rules 12, 17)
//   c: deactivate Form A in use: counts, Add Reviewer, s1 Edit window, rev1's step 3, "OK" detaches (A2, A6, scenario 7)
//   d: copy, order, delete the copy; declined-only Form C: s4 Edit window before/after its deletion (Rule 14, A3, scenario 8)
//   e: {OJS} the section's default form preselects in Add Reviewer (Rule 17)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'a', 'b', 'c', 'd', 'e'];
const on = (p) => PHASES.includes(p);
const scratchFile = (app) => path.join(outDir(), `k5-scratch-${app.name}.json`);
const resultsFile = (app) => path.join(outDir(), `k5-results-${app.name}.json`);
const log = (...a) => console.log(`[${process.env.PKP_APP_NAME}]`, ...a);
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const FORMS_PATH = (ctx) => `/index.php/${ctx}/en/management/settings/workflow#review/reviewForms`;
const WORKFLOW = (ctx, id) => `/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${id}`;
const REV1 = 'Kay Fiveone', REV2 = 'Kay Fivetwo';
const ELEMENTS = [
    {question: 'Overall assessment', type: 'textarea', required: true},
    {question: 'Recommend?', type: 'radiobuttons', options: ['Yes', 'No']},
];

async function full(page, name, extra = {}) {
    const data = await screen(page);
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** The review-forms grid as data: rows (title, counts, Active box) and the grid links. */
async function readGrid(page) {
    return page.evaluate(() => {
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        const grid = [...document.querySelectorAll('.pkp_controllers_grid')].find((g) => g.getClientRects().length > 0 && /Active/.test(g.innerText));
        if (!grid) return {missing: true};
        const rows = [...grid.querySelectorAll('tbody tr.gridRow')].filter((r) => r.querySelector('td')).map((r) => {
            const box = r.querySelector('input[type=checkbox]');
            const ctl = r.nextElementSibling;
            return {
                id: r.id, cells: [...r.querySelectorAll('td')].map(t), title: t(r.querySelector('td:first-child')).replace(/^Settings\s*/, ''),
                checked: box ? box.checked : null, disabled: box ? box.disabled : null,
                actions: ctl ? [...ctl.querySelectorAll('a')].map(t).filter(Boolean) : [], actionsVisible: ctl ? ctl.getClientRects().length > 0 : false,
            };
        });
        return {headers: [...grid.querySelectorAll('thead th')].map(t), rows, links: [...grid.querySelectorAll('a')].filter((a) => a.getClientRects().length && t(a) && !a.closest('tbody')).map(t), empty: t(grid.querySelector('.empty, tr.empty, .gridRowEmpty'))};
    });
}

async function openForms(page, app, ctx) {
    await page.goto(app.url(FORMS_PATH(ctx)));
    await idle(page);
    const reviewTab = page.getByRole('tab', {name: 'Review', exact: true});
    if ((await reviewTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await reviewTab.click();
    const formsTab = page.getByRole('tab', {name: 'Review Forms', exact: true});
    if ((await formsTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await formsTab.click();
    await page.locator('.pkp_controllers_grid:visible').first().waitFor({timeout: 20000});
    await idle(page);
}

const gridLoc = (page) => page.locator('.pkp_controllers_grid:visible').first();
const rowLoc = (page, title, nth = 0) => gridLoc(page).locator('tbody tr.gridRow').filter({has: page.locator('td:first-child', {hasText: new RegExp(`^\\s*(Settings\\s*)?${title}\\s*$`)})}).nth(nth);

/** Open the row's arrow only when its controls row is hidden; return the controls row locator. */
async function rowActions(page, row) {
    const ctl = row.locator('xpath=following-sibling::tr[1]');
    if (!(await ctl.isVisible().catch(() => false))) { await row.locator('a.show_extras').click(); await ctl.waitFor({state: 'visible', timeout: 10000}).catch(() => {}); }
    return ctl;
}

/** Read every open dialog after the side window has filled. */
async function readDialog(page) {
    await page.getByRole('dialog').last().waitFor({timeout: 10000}).catch(() => {});
    await Promise.race([
        page.locator('[role=dialog] .ui-tabs-nav li, [role=dialog] form, [role=dialog] .pkp_controllers_grid').first().waitFor({timeout: 60000}),
        page.locator('[role=dialog]').getByText(/Are you sure/).first().waitFor({timeout: 60000}),
    ]).catch(() => {});
    await page.locator('[role=dialog] .ui-tabs-loading').first().waitFor({state: 'detached', timeout: 60000}).catch(() => {});
    return page.evaluate(() => {
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        return [...document.querySelectorAll('[role=dialog]')].filter((d) => d.getClientRects().length > 0).map((d) => ({
            title: t(d.querySelector('h1, h2, h3, .modal__header, [id$="title"]')),
            text: t(d).slice(0, 1500),
            buttons: [...d.querySelectorAll('button, a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length > 0).map((b) => t(b) || b.value),
            tabs: [...d.querySelectorAll('.ui-tabs-nav li, [role=tab]')].filter((x) => x.getClientRects().length > 0).map((tb) => ({text: t(tb), selected: tb.getAttribute('aria-selected') || tb.classList.contains('ui-tabs-active'), disabled: tb.classList.contains('ui-state-disabled') || tb.getAttribute('aria-disabled') === 'true'})),
        }));
    });
}

async function notices$(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('.pkpNotification, [role=status], [role=alert], .pkp_notification')].some((e) => e.getClientRects().length > 0 && e.innerText.trim()), null, {timeout: 4000}).catch(() => {});
    return page.evaluate(() => [...document.querySelectorAll('.pkpNotification, [role=status], [role=alert], .pkp_notification')].filter((e) => e.getClientRects().length > 0 && e.innerText.trim()).map((e) => ({cls: e.className.slice(0, 60), text: e.innerText.trim().replace(/\s+/g, ' ')})));
}

/** Press a "Confirm" dialog button; collect the review-form traffic and the notice. */
async function confirmDialog(page, name = 'OK') {
    const dlg = page.getByRole('dialog').last();
    const before = await page.evaluate(() => document.querySelectorAll('[role=dialog]').length);
    const responses = [];
    const l = (r) => { if (/review-form|reviewer-grid|sequence/i.test(r.url())) responses.push({method: r.request().method(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200), status: r.status()}); };
    page.on('response', l);
    await dlg.getByRole('button', {name, exact: true}).click();
    await page.waitForFunction((n) => document.querySelectorAll('[role=dialog]').length < n, before, {timeout: 10000}).catch(() => {});
    const notices = await notices$(page);
    await idle(page);
    page.off('response', l);
    return {responses, notices};
}

/** Tick or untick a form's "Active" box: returns the dialog and the result. */
async function toggleActive(page, row, snapName) {
    await row.locator('input[type=checkbox]').click();
    const dialog = await readDialog(page);
    await full(page, snapName, {dialog});
    const result = await confirmDialog(page, 'OK');
    return {dialog, result};
}

/** Workflow page › "Add Reviewer" › "Select <name>"; read the Review Form list; Cancel. */
async function addReviewerList(page, app, ctx, subId, reviewerName, snapName) {
    await page.goto(app.url(WORKFLOW(ctx, subId)));
    await idle(page);
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
    const select = page.getByRole('dialog').last().getByRole('button', {name: `Select ${reviewerName}`}).first();
    await select.waitFor({timeout: 20000});
    await select.click();
    await page.locator('input.datepicker').first().waitFor({timeout: 20000});
    await page.locator('#regularReviewerForm iframe, .tox-tinymce').first().waitFor({timeout: 15000}).catch(() => {});
    const list = await readSelect(page, '#regularReviewerForm');
    await full(page, snapName, {reviewFormList: list});
    await page.getByRole('dialog').last().locator('a, button').filter({hasText: /^Cancel$/}).first().click().catch(() => {});
    await page.waitForFunction(() => !document.querySelector('input.datepicker'), null, {timeout: 5000}).catch(() => {});
    return list;
}

async function readSelect(page, scope) {
    return page.evaluate((scope) => {
        const root = document.querySelector(scope) || document;
        const s = root.querySelector('select#reviewFormId, select[name="reviewFormId"]');
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        return s ? {present: true, label: t(root.querySelector(`label[for="${s.id}"]`)), options: [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected}))}
            : {present: false, selects: [...root.querySelectorAll('select')].map((x) => x.name), hasReviewFormWords: /Review Form/.test(root.innerText || '')};
    }, scope);
}

/** Workflow page › reviewer row › "More Actions" › "Edit": the window's Review Form list; then Cancel or OK. */
async function editReviewerRow(page, app, ctx, subId, reviewerName, snapName, press = 'Cancel') {
    await page.goto(app.url(WORKFLOW(ctx, subId)));
    await idle(page);
    const row = page.getByRole('row', {name: new RegExp(reviewerName)}).first();
    await row.waitFor({timeout: 20000});
    const rowText = flat(await row.innerText());
    await row.getByRole('button', {name: 'More Actions'}).click();
    const menu = await page.locator('[role=menuitem]').allInnerTexts();
    const edit = page.getByRole('menuitem', {name: 'Edit', exact: true});
    if (!(await edit.count())) { await page.keyboard.press('Escape'); await full(page, snapName, {menu, rowText, noEdit: true}); return {menu, rowText, noEdit: true}; }
    await edit.click();
    await page.locator('form#editReviewForm').waitFor({timeout: 20000});
    await page.locator('form#editReviewForm select, form#editReviewForm input.datepicker').first().waitFor({timeout: 15000}).catch(() => {});
    const list = await readSelect(page, 'form#editReviewForm');
    const formText = flat(await page.locator('form#editReviewForm').innerText(), 1200);
    await full(page, snapName, {menu, rowText, reviewFormSelect: list, formText});
    let result = null;
    if (press === 'OK') {
        result = await confirmDialog(page, 'OK');
        await page.waitForFunction(() => !document.querySelector('form#editReviewForm'), null, {timeout: 10000}).catch(() => {});
        await full(page, `${snapName}-after-ok`, {result});
    } else {
        await page.getByRole('dialog').last().locator('a, button').filter({hasText: /^Cancel$/}).first().click().catch(() => {});
    }
    return {menu, rowText, list, formText, result};
}

/** The reviewer's wizard: walk from step 1 to step 3 with the buttons; read step 3. */
async function walkToStep3(page, app, ctx, subId, prefix) {
    await page.goto(app.url(`/index.php/${ctx}/en/reviewer/submission/${subId}`));
    await idle(page);
    const o = {landing: page.url()};
    for (let i = 0; i < 3; i++) {
        if (await page.locator('[name^="reviewFormResponses"], textarea[name="comments"]').count()) break;
        const btn = page.getByRole('button', {name: /Save and continue|Continue to Step/i}).first();
        if (!(await btn.count())) break;
        const noCI = page.locator('input[name="competingInterestOption"]').first();
        if (await noCI.count()) await noCI.check().catch(() => {});
        const label = await btn.innerText();
        const beforeText = await page.locator('main').first().innerText().catch(() => '');
        await btn.click();
        await page.waitForFunction((t) => (document.querySelector('main') || document.body).innerText !== t, beforeText, {timeout: 15000}).catch(() => {});
        await idle(page);
        o[`press${i + 1}`] = {label: flat(label), url: page.url()};
    }
    await page.locator('[name^="reviewFormResponses"], textarea[name="comments"]').first().waitFor({timeout: 15000}).catch(() => {});
    o.url = page.url();
    o.step3 = await page.evaluate(() => {
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        const m = document.querySelector('main') || document.body;
        return {
            headings: [...m.querySelectorAll('h1, h2, h3, h4, legend')].map(t).filter(Boolean).slice(0, 30),
            labels: [...m.querySelectorAll('label')].map(t).filter(Boolean).slice(0, 30),
            formControls: [...m.querySelectorAll('[name^="reviewFormResponses"]')].map((e) => ({tag: e.tagName, type: e.type, name: e.name})),
            textareas: [...m.querySelectorAll('textarea')].map((x) => x.name),
            buttons: [...m.querySelectorAll('button')].filter((b) => b.getClientRects().length).map(t),
        };
    });
    await full(page, prefix, {walk: o});
    return o;
}

forEachApp(async (app) => {
    const out = fs.existsSync(resultsFile(app)) ? JSON.parse(fs.readFileSync(resultsFile(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(resultsFile(app), JSON.stringify(out, null, 2));
    if (app.name === 'ops') { record('k5-results', {app: 'ops', skipped: 'OPS has no Review tab and no review forms (spec Purpose, K6); nothing in K5 has a screen there'}); return; }
    let scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;
    const omp = app.name === 'omp';

    if (on('seed') || !scratch) {
        const t = tag('u29k5');
        scratch = {tag: t, mgr: `${t}mgr`, rev1: `${t}rev1`, rev2: `${t}rev2`};
        const ctx = await app.api.createContext({
            tag: t,
            users: [
                {username: scratch.mgr, roles: ['manager'], givenName: 'Kay', familyName: 'Manager'},
                {username: scratch.rev1, roles: ['externalReviewer'], givenName: 'Kay', familyName: 'Fiveone'},
                {username: scratch.rev2, roles: ['externalReviewer'], givenName: 'Kay', familyName: 'Fivetwo'},
            ],
            reviewForms: [
                {title: 'Form A', description: 'Form A description', active: true, elements: ELEMENTS},
                {title: 'Form B', description: 'Form B description', active: false, elements: ELEMENTS},
                {title: 'Form C', description: 'Form C description', active: true, elements: ELEMENTS},
            ],
        });
        scratch.contextId = ctx.contextId; scratch.path = ctx.path;
        const stage = omp ? {stage: 'external'} : {};
        const mk = async (suffix, title, reviewers) => (await app.api.createSubmission({
            tag: `${t}${suffix}`, context: scratch.path, submitter: 'author.alex', title, submitted: true,
            decisions: ['sendExternalReview'], reviewRounds: [{...stage, reviewers}],
            participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
        })).submissionId;
        scratch.s1 = await mk('s1', `U29K5 s1 rev1 accepted Form A ${t}`, [{username: scratch.rev1, status: 'accepted', reviewForm: 'Form A'}]);
        scratch.s2 = await mk('s2', `U29K5 s2 paul declined Form A ${t}`, [{username: 'reviewer.paul', status: 'declined', reviewForm: 'Form A'}]);
        scratch.s3 = await mk('s3', `U29K5 s3 no reviewer ${t}`, []);
        scratch.s4 = await mk('s4', `U29K5 s4 paul declined Form C ${t}`, [{username: 'reviewer.paul', status: 'declined', reviewForm: 'Form C'}]);
        scratch.s5 = await mk('s5', `U29K5 s5 rev2 accepted Form A ${t}`, [{username: scratch.rev2, status: 'accepted', reviewForm: 'Form A'}]);
        fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
        out.seed = scratch; save();
        log('[seed]', JSON.stringify(scratch));
    }

    const {page, close} = await launch(app);
    const browserDialogs = [];
    page.on('dialog', async (d) => { browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    try {
        // ---------------- a: list, lock, preview, Add Reviewer, activate, Edit window with an active form
        if (on('a')) {
            const r = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openForms(page, app, scratch.path);
            r.grid = await readGrid(page);
            await full(page, 'a-forms-list', {grid: r.grid});
            log('[a list]', JSON.stringify(r.grid.headers), JSON.stringify(r.grid.rows.map((x) => [x.title, x.cells.slice(1, 3), x.checked])), JSON.stringify(r.grid.links));
            await loc(page, 'Review Forms grid', gridLoc(page));
            await loc(page, 'Form A row', rowLoc(page, 'Form A'));
            // Form A (1 / 0): its actions, then Preview
            const ctlA = await rowActions(page, rowLoc(page, 'Form A'));
            r.formAActions = await ctlA.locator('a:visible').allInnerTexts();
            await full(page, 'a-form-a-actions', {actions: r.formAActions});
            log('[a Form A actions]', JSON.stringify(r.formAActions));
            await ctlA.getByRole('link', {name: 'Preview', exact: true}).click();
            r.preview = await readDialog(page);
            await full(page, 'a-form-a-preview', {dialog: r.preview});
            log('[a preview]', JSON.stringify(r.preview.map((d) => [d.title, d.tabs, d.buttons])), flat(r.preview.at(-1)?.text, 300));
            const rfTab = page.getByRole('dialog').last().locator('.ui-tabs-nav li').filter({hasText: /^Review Form$/}).first();
            await rfTab.locator('a').first().click({force: true, timeout: 5000}).catch((e) => { r.reviewFormTabClickError = flat(e.message, 120); });
            await idle(page);
            r.previewAfterClick = await readDialog(page);
            await full(page, 'a-form-a-preview-after-tab-click', {dialog: r.previewAfterClick});
            log('[a preview after click]', JSON.stringify(r.previewAfterClick.map((d) => d.tabs)));
            await page.getByRole('dialog').last().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
            await idle(page);
            // Form C (declined-only, 0 / 0) and Form B (inactive, unused): their actions
            for (const title of ['Form C', 'Form B']) {
                const ctl = await rowActions(page, rowLoc(page, title));
                r[`${title}Actions`] = await ctl.locator('a:visible').allInnerTexts();
                log(`[a ${title} actions]`, JSON.stringify(r[`${title}Actions`]));
            }
            await full(page, 'a-form-c-b-actions', {formC: r['Form CActions'], formB: r['Form BActions']});
            // Add Reviewer on s3: the list with A and C active
            r.addReviewerBefore = await addReviewerList(page, app, scratch.path, scratch.s3, REV2, 'a-add-reviewer-before');
            log('[a add reviewer before]', JSON.stringify(r.addReviewerBefore));
            await loc(page, 'Review Form select in Add Reviewer', page.locator('select#reviewFormId'));
            // tick Form B
            await openForms(page, app, scratch.path);
            r.activateB = await toggleActive(page, rowLoc(page, 'Form B'), 'a-activate-dialog');
            r.gridAfterActivate = await readGrid(page);
            await full(page, 'a-forms-list-after-activate', {grid: r.gridAfterActivate, result: r.activateB.result});
            log('[a activate]', flat(r.activateB.dialog.at(-1)?.text, 300), JSON.stringify(r.activateB.dialog.at(-1)?.buttons), JSON.stringify(r.activateB.result), JSON.stringify(r.gridAfterActivate.rows.map((x) => [x.title, x.cells.slice(1, 3), x.checked])));
            r.addReviewerAfter = await addReviewerList(page, app, scratch.path, scratch.s3, REV2, 'a-add-reviewer-after');
            log('[a add reviewer after]', JSON.stringify(r.addReviewerAfter.options));
            // s1's row "Edit" with its carried Form A active
            r.editS1 = await editReviewerRow(page, app, scratch.path, scratch.s1, REV1, 'a-edit-s1-active');
            log('[a edit s1]', JSON.stringify(r.editS1.menu), JSON.stringify(r.editS1.list));
            await loc(page, 'Review Form select in Edit Review', page.locator('form#editReviewForm select#reviewFormId'));
            await signOut(page);
            out.a = r; save();
        }
        // ---------------- b: rev2 submits the review on s5 (Form A) → "Completed"; the submitted row's Edit window
        if (on('b')) {
            const r = {};
            await signIn(page, scratch.rev2, {contextPath: scratch.path});
            r.walk = await walkToStep3(page, app, scratch.path, scratch.s5, 'b-rev2-step3');
            log('[b step3]', JSON.stringify(r.walk.step3.headings), JSON.stringify(r.walk.step3.formControls), JSON.stringify(r.walk.step3.textareas), JSON.stringify(r.walk.step3.buttons));
            await page.locator('textarea[name^="reviewFormResponses"]').first().fill('Assessed by K5.');
            await page.locator('input[type=radio][name^="reviewFormResponses"]').first().check();
            const rec = page.locator('select#reviewerRecommendationId');
            if (await rec.count()) await rec.selectOption({index: 1});
            await page.getByRole('button', {name: 'Submit Review', exact: true}).click();
            r.submitAsk = await readDialog(page);
            await full(page, 'b-submit-ask', {dialog: r.submitAsk});
            await page.getByRole('dialog').last().getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForFunction(() => /Review Submitted/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            r.afterSubmit = {url: page.url(), text: flat(await page.locator('main').first().innerText().catch(() => ''), 400)};
            await full(page, 'b-after-submit', {after: r.afterSubmit});
            log('[b submitted]', flat(r.submitAsk.at(-1)?.text, 200), r.afterSubmit.url, r.afterSubmit.text.slice(0, 120));
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openForms(page, app, scratch.path);
            r.grid = await readGrid(page);
            await full(page, 'b-forms-list-after-submit', {grid: r.grid});
            log('[b list]', JSON.stringify(r.grid.rows.map((x) => [x.title, x.cells.slice(1, 3), x.checked])));
            r.editS5 = await editReviewerRow(page, app, scratch.path, scratch.s5, REV2, 'b-edit-s5-submitted');
            log('[b edit s5]', JSON.stringify(r.editS5.menu), JSON.stringify(r.editS5.list), flat(r.editS5.formText, 300));
            await signOut(page);
            out.b = r; save();
        }
        // ---------------- c: deactivate Form A while in use (A2), the lists, rev1's step 3 before and after the Edit window's "OK" (A6)
        if (on('c')) {
            const r = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openForms(page, app, scratch.path);
            r.deactivateA = await toggleActive(page, rowLoc(page, 'Form A'), 'c-deactivate-dialog');
            r.gridAfter = await readGrid(page);
            await full(page, 'c-forms-list-after-deactivate', {grid: r.gridAfter, result: r.deactivateA.result});
            log('[c deactivate]', flat(r.deactivateA.dialog.at(-1)?.text, 300), JSON.stringify(r.deactivateA.result), JSON.stringify(r.gridAfter.rows.map((x) => [x.title, x.cells.slice(1, 3), x.checked])));
            const ctlA = await rowActions(page, rowLoc(page, 'Form A'));
            r.formAActionsAfter = await ctlA.locator('a:visible').allInnerTexts();
            log('[c Form A actions]', JSON.stringify(r.formAActionsAfter));
            r.addReviewer = await addReviewerList(page, app, scratch.path, scratch.s3, REV2, 'c-add-reviewer-after-deactivate');
            log('[c add reviewer]', JSON.stringify(r.addReviewer.options));
            r.editS1 = await editReviewerRow(page, app, scratch.path, scratch.s1, REV1, 'c-edit-s1-deactivated', 'Cancel');
            log('[c edit s1]', JSON.stringify(r.editS1.list));
            // rev1's step 3: the deactivated form is still there
            await signIn(page, scratch.rev1, {contextPath: scratch.path});
            r.step3Before = await walkToStep3(page, app, scratch.path, scratch.s1, 'c-rev1-step3-before-ok');
            log('[c step3 before OK]', JSON.stringify(r.step3Before.step3.headings), JSON.stringify(r.step3Before.step3.formControls), JSON.stringify(r.step3Before.step3.textareas));
            // the editor presses "OK" in the Edit window without changing anything
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            r.editS1Ok = await editReviewerRow(page, app, scratch.path, scratch.s1, REV1, 'c-edit-s1-press-ok', 'OK');
            log('[c edit s1 OK]', JSON.stringify(r.editS1Ok.result));
            r.editS1After = await editReviewerRow(page, app, scratch.path, scratch.s1, REV1, 'c-edit-s1-after-ok', 'Cancel');
            log('[c edit s1 after OK]', JSON.stringify(r.editS1After.list));
            await signIn(page, scratch.rev1, {contextPath: scratch.path});
            r.step3After = await walkToStep3(page, app, scratch.path, scratch.s1, 'c-rev1-step3-after-ok');
            log('[c step3 after OK]', JSON.stringify(r.step3After.step3.headings), JSON.stringify(r.step3After.step3.formControls), JSON.stringify(r.step3After.step3.textareas));
            await signOut(page);
            out.c = r; save();
        }
        // ---------------- d: copy Form A (first row), order, activate, delete the copy; declined-only Form C's deletion and s4's Edit window
        if (on('d')) {
            const r = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openForms(page, app, scratch.path);
            r.gridBefore = await readGrid(page);
            const firstTitle = r.gridBefore.rows[0].title;
            const ctl = await rowActions(page, rowLoc(page, firstTitle));
            await ctl.getByRole('link', {name: 'Copy', exact: true}).click();
            r.copyDialog = await readDialog(page);
            await full(page, 'd-copy-dialog', {dialog: r.copyDialog});
            r.copyResult = await confirmDialog(page, 'OK');
            r.gridAfterCopy = await readGrid(page);
            await full(page, 'd-forms-list-after-copy', {grid: r.gridAfterCopy, result: r.copyResult});
            log('[d copy]', firstTitle, flat(r.copyDialog.at(-1)?.text, 200), JSON.stringify(r.copyResult), JSON.stringify(r.gridAfterCopy.rows.map((x) => [x.id, x.title, x.cells.slice(1, 3), x.checked])));
            const copyRow = gridLoc(page).locator('tbody tr.gridRow').last();
            r.copyRowId = await copyRow.getAttribute('id');
            const ctlCopy = await rowActions(page, copyRow);
            r.copyActions = await ctlCopy.locator('a:visible').allInnerTexts();
            await ctlCopy.getByRole('link', {name: 'Edit', exact: true}).click();
            r.copyEdit = await readDialog(page);
            await full(page, 'd-copy-edit-review-form-tab', {dialog: r.copyEdit});
            const dlg = page.getByRole('dialog').last();
            r.copyTitleValue = await dlg.locator('input[name^="title"]').first().inputValue().catch(() => null);
            await dlg.locator('.ui-tabs-nav li').filter({hasText: /^Form Items$/}).locator('a').first().click();
            await dlg.locator('#reviewFormElementsGridContainer table').waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            r.copyItems = await dlg.locator('#reviewFormElementsGridContainer').innerText().then(flat).catch(() => null);
            await full(page, 'd-copy-form-items', {items: r.copyItems});
            await dlg.locator('.ui-tabs-nav li').filter({hasText: /^Preview Form$/}).locator('a').first().click();
            await dlg.locator('form#previewReviewForm').waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            r.copyPreview = await dlg.locator('form#previewReviewForm').innerText().then(flat).catch(() => null);
            await full(page, 'd-copy-preview-tab', {preview: r.copyPreview});
            log('[d copy window]', JSON.stringify(r.copyActions), r.copyTitleValue, '| items:', r.copyItems, '| preview:', r.copyPreview);
            await dlg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
            await idle(page);
            // Order: drag the copy to the top, Done, reload
            await gridLoc(page).locator('a.pkp_linkaction_orderItems').first().click();
            await idle(page);
            r.orderingMode = await page.evaluate(() => { const g = [...document.querySelectorAll('.pkp_controllers_grid')].find((x) => x.getClientRects().length); const t = (el) => el.innerText.trim().replace(/\s+/g, ' '); return {links: [...g.querySelectorAll('a')].filter((a) => a.getClientRects().length && t(a) && !a.closest('tbody')).map((a) => t(a)), cursor: getComputedStyle(g.querySelector('tbody tr.gridRow')).cursor}; });
            await full(page, 'd-ordering-mode', {mode: r.orderingMode});
            const moving = page.locator(`tr#${r.copyRowId}`).first();
            const mb = await moving.locator('td').first().boundingBox();
            const fb = await gridLoc(page).locator('tbody tr.gridRow').first().boundingBox();
            const x = mb.x + 60, y0 = mb.y + mb.height / 2, y1 = fb.y + 4;
            await page.mouse.move(x, y0); await page.mouse.down();
            for (let i = 1; i <= 25; i++) await page.mouse.move(x, y0 + ((y1 - y0) * i) / 25);
            await page.mouse.move(x, y1 - 2); await page.mouse.up();
            r.afterDrag = (await readGrid(page)).rows.map((x) => x.id);
            const responses = []; const l = (rr) => { if (/sequence|review-form/i.test(rr.url())) responses.push({method: rr.request().method(), url: rr.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200), status: rr.status()}); }; page.on('response', l);
            await gridLoc(page).locator('a.saveButton').first().click();
            await idle(page); page.off('response', l);
            r.doneResponses = responses; r.doneNotices = await notices$(page);
            await full(page, 'd-after-done', {order: r.afterDrag, responses, notices: r.doneNotices});
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/website`)); await idle(page);
            await openForms(page, app, scratch.path);
            r.afterReload = await readGrid(page);
            await full(page, 'd-after-reload', {grid: r.afterReload});
            log('[d order]', JSON.stringify(r.orderingMode), 'copy', r.copyRowId, 'afterDrag', JSON.stringify(r.afterDrag), JSON.stringify(r.doneResponses), JSON.stringify(r.doneNotices), 'afterReload', JSON.stringify(r.afterReload.rows.map((x) => [x.id, x.title, x.checked])));
            // activate the copy; Add Reviewer names it first
            r.activateCopy = await toggleActive(page, page.locator(`tr#${r.copyRowId}`).first(), 'd-activate-copy-dialog');
            r.gridActivated = await readGrid(page);
            r.addReviewer = await addReviewerList(page, app, scratch.path, scratch.s3, REV2, 'd-add-reviewer-copy-first');
            log('[d add reviewer]', JSON.stringify(r.gridActivated.rows.map((x) => [x.id, x.title, x.checked])), JSON.stringify(r.addReviewer.options));
            // delete the copy
            await openForms(page, app, scratch.path);
            const ctlDel = await rowActions(page, page.locator(`tr#${r.copyRowId}`).first());
            await ctlDel.getByRole('link', {name: 'Delete', exact: true}).click();
            r.deleteDialog = await readDialog(page);
            await full(page, 'd-delete-dialog', {dialog: r.deleteDialog});
            r.deleteResult = await confirmDialog(page, 'OK');
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/website`)); await idle(page);
            await openForms(page, app, scratch.path);
            r.gridAfterDelete = await readGrid(page);
            await full(page, 'd-forms-list-after-delete-copy', {grid: r.gridAfterDelete, result: r.deleteResult});
            log('[d delete copy]', flat(r.deleteDialog.at(-1)?.text, 200), JSON.stringify(r.deleteResult), JSON.stringify(r.gridAfterDelete.rows.map((x) => [x.id, x.title, x.cells.slice(1, 3), x.checked])));
            // declined-only Form C: s4's Edit window before, delete, after (Form B still active)
            r.editS4Before = await editReviewerRow(page, app, scratch.path, scratch.s4, 'Paul', 'd-edit-s4-before-delete');
            log('[d edit s4 before]', JSON.stringify(r.editS4Before.list), flat(r.editS4Before.rowText, 120));
            await openForms(page, app, scratch.path);
            const ctlC = await rowActions(page, rowLoc(page, 'Form C'));
            r.formCActions = await ctlC.locator('a:visible').allInnerTexts();
            await ctlC.getByRole('link', {name: 'Delete', exact: true}).click();
            r.deleteCDialog = await readDialog(page);
            r.deleteCResult = await confirmDialog(page, 'OK');
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/website`)); await idle(page);
            await openForms(page, app, scratch.path);
            r.gridAfterDeleteC = await readGrid(page);
            await full(page, 'd-forms-list-after-delete-c', {grid: r.gridAfterDeleteC, result: r.deleteCResult});
            r.editS4After = await editReviewerRow(page, app, scratch.path, scratch.s4, 'Paul', 'd-edit-s4-after-delete');
            log('[d delete C]', JSON.stringify(r.formCActions), JSON.stringify(r.deleteCResult), JSON.stringify(r.gridAfterDeleteC.rows.map((x) => [x.title, x.cells.slice(1, 3), x.checked])), 'edit s4 after', JSON.stringify(r.editS4After.list), flat(r.editS4After.rowText, 120));
            await signOut(page);
            out.d = r; save();
        }
        // ---------------- e: {OJS} the section's default review form preselects in Add Reviewer
        if (on('e') && !omp) {
            const r = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await page.goto(app.url(`/index.php/${scratch.path}/en/management/settings/context#sections`)); await idle(page);
            await page.getByRole('tab', {name: 'Sections', exact: true}).click().catch(() => {}); await idle(page);
            const sgrid = page.locator('[role="tabpanel"]:visible .pkp_controllers_grid').last();
            await sgrid.locator('table').waitFor({timeout: 30000});
            const first = sgrid.locator('tr.gridRow').first();
            r.sectionTitle = flat(await first.innerText(), 80);
            const sctl = await rowActions(page, first);
            await sctl.getByRole('link', {name: 'Edit', exact: true}).click();
            const dlg = page.locator('[role=dialog]').filter({has: page.locator('form[id*="ection"]')}).last();
            await dlg.locator('select[name="reviewFormId"]').waitFor({timeout: 30000});
            await idle(page);
            r.sectionSelect = await dlg.locator('select[name="reviewFormId"]').evaluate((s) => [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected})));
            await full(page, 'e-section-edit', {select: r.sectionSelect});
            await dlg.locator('select[name="reviewFormId"]').selectOption({label: 'Form B'});
            await dlg.getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => !document.querySelector('form[id*="ection"]'), null, {timeout: 20000}).catch(() => {});
            r.saveNotices = await notices$(page);
            await idle(page);
            await full(page, 'e-section-saved', {notices: r.saveNotices});
            r.addReviewer = await addReviewerList(page, app, scratch.path, scratch.s3, REV2, 'e-add-reviewer-section-default');
            log('[e section]', r.sectionTitle, JSON.stringify(r.sectionSelect), JSON.stringify(r.saveNotices), JSON.stringify(r.addReviewer.options));
            await signOut(page);
            out.e = r; save();
        }
    } catch (e) {
        out.error = {message: flat(e.message, 600), stack: flat(e.stack, 1200), url: page.url()};
        save();
        await full(page, 'error').catch(() => {});
        log('[error]', out.error.message, page.url());
    } finally {
        out.browserDialogs = browserDialogs; save();
        await close();
    }
});
