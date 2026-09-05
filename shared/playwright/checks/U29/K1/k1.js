// U29 claim check, chunk K1: Settings › Workflow › Review › "Setup" itself
// (reach, tabs and address, fields, deadlines, minimum, sliders, leaving
// unsaved) and the reminder clocks, on OJS and OMP. Spec:
// docs/specs/U29-review-setup-and-review-forms.md — Actors & permissions,
// Fields "Setup" table, Rules 1, 3, 4, 8, 9, register A1 and A5, scenarios
// 1, 3, 4, 9.
//
// Seeds its own scratch context (throwaway manager, editor, production
// editor, section editor, {OJS} guest editor, reviewer, author, reader; one
// active review form not in use; "Minimum Confirmed Reviews Required" 2; one
// submission in external review with the reviewer accepted). Roster accounts
// are only visited read-only on the seeded context. Records every screen.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U29/K1/k1.js
//   PHASES=seed,s1,roles,fields,sliders,leave   (default: all; later phases reuse k1-scratch-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 's1', 'roles', 'fields', 'sliders', 'leave'];
const on = (p) => PHASES.includes(p);
const scratchFile = (app) => path.join(outDir(), `k1-scratch-${app.name}.json`);
const WORKFLOW = (ctx) => `/index.php/${ctx}/en/management/settings/workflow`;
const NESTED = (ctx) => `${WORKFLOW(ctx)}#review/reviewSetup`;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function full(page, name, extra = {}) {
    const data = await screen(page);
    data.tabSelected = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null);
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** Every field of the visible Setup panel: radios, boxes, textboxes, sliders with their readings, errors, status. */
async function readSetup(page) {
    return page.evaluate(() => {
        const panels = [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => p.offsetParent !== null);
        const scope = panels.length ? panels[panels.length - 1] : document;
        const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
        const field = (el) => el.closest('.pkpFormField') || el.closest('fieldset') || el.parentElement;
        return {
            headings: [...scope.querySelectorAll('.pkpFormField__heading, legend, .pkpFormFieldLabel, label.pkpFormFieldLabel')].map(t).filter(Boolean),
            radios: [...scope.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: t(r.closest('label') || r.parentElement)})),
            checkboxes: [...scope.querySelectorAll('input[type=checkbox]')].map((c) => ({name: c.name, checked: c.checked, label: t(c.closest('label') || c.parentElement)})),
            textboxes: [...scope.querySelectorAll('input[type=text], input[type=number], input:not([type])')].map((i) => ({name: i.name, id: i.id, value: i.value, errorText: t(field(i).querySelector('.pkpFieldError'))})),
            sliders: [...scope.querySelectorAll('[role=slider]')].map((s) => { const box = s.closest('.max-w-lg') || field(s); return {value: s.getAttribute('aria-valuenow'), min: s.getAttribute('aria-valuemin'), max: s.getAttribute('aria-valuemax'), heading: t(box.querySelector('.pkpFormField__heading')), endLabels: t(box.querySelector('.justify-between')), reading: t(box.querySelector('.w-48'))}; }),
            fieldErrors: [...scope.querySelectorAll('.pkpFieldError')].map(t),
            footerErrors: t(scope.querySelector('.pkpFormErrors')),
            status: t(scope.querySelector('.pkpFormPage__status')),
            saveButton: [...scope.querySelectorAll('button')].filter((b) => /^save$/i.test(b.innerText.trim())).map((b) => ({text: t(b), disabled: b.disabled})),
            panelText: scope.innerText,
        };
    });
}

async function hashAfter(page, action) {
    const before = await page.evaluate(() => location.hash);
    await action();
    await page.waitForFunction((p) => location.hash !== p, before, {timeout: 2500}).catch(() => {});
    return page.url();
}

async function openSetup(page, app, ctx) {
    await page.goto(app.url(NESTED(ctx)));
    await idle(page);
    const reviewTab = page.getByRole('tab', {name: 'Review', exact: true});
    if ((await reviewTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await reviewTab.click();
    const setupTab = page.getByRole('tab', {name: 'Setup', exact: true});
    if ((await setupTab.getAttribute('aria-selected')) !== 'true') await setupTab.click();
    await page.getByRole('textbox', {name: 'Default Response Deadline'}).waitFor({timeout: 20000});
}

async function fillBox(page, name, value) {
    const box = page.getByRole('textbox', {name, exact: true});
    await box.fill(value);
    await box.blur().catch(() => {});
}

async function setSlider(page, name, presses, key = 'ArrowRight') {
    const slider = page.getByRole('slider', {name, exact: true});
    await slider.focus();
    for (let i = 0; i < presses; i++) await page.keyboard.press(key);
}

/** Press the visible form's Save; wait for the contexts POST/PUT; return status, response, errors. */
async function saveForm(page) {
    const panel = page.locator('[role="tabpanel"]:visible').last();
    const waited = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && ['PUT', 'POST'].includes(r.request().method()), {timeout: 15000}).catch(() => null);
    await panel.getByRole('button', {name: 'Save', exact: true}).click();
    const resp = await waited;
    await page.waitForFunction(() => {
        const panels = [...document.querySelectorAll('[role="tabpanel"]')].filter((p) => p.offsetParent !== null);
        const scope = panels.length ? panels[panels.length - 1] : document;
        const s = scope.querySelector('.pkpFormPage__status');
        return (s && /Saved/.test(s.innerText)) || scope.querySelector('.pkpFieldError');
    }, null, {timeout: 6000}).catch(() => {});
    const r = await readSetup(page);
    return {method: resp ? resp.request().method() : null, status: resp ? resp.status() : null, notice: r.status, fieldErrors: r.fieldErrors, footer: r.footerErrors};
}

async function sidebarAndTyped(page, app, ctx, label) {
    await idle(page).catch(() => {});
    await page.locator('nav a').first().waitFor({timeout: 10000}).catch(() => {});
    const out = {label, landing: page.url()};
    out.sidebar = (await page.locator('nav a').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    out.sidebarHasSettings = out.sidebar.some((s) => /^Settings$/.test(s));
    await full(page, `landing-${label}`);
    await page.goto(app.url(WORKFLOW(ctx)));
    await page.waitForLoadState('domcontentloaded');
    await idle(page).catch(() => {});
    out.typedURL = page.url();
    out.refused = /authorizationDenied/.test(page.url());
    out.bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 400);
    out.hasReviewTab = await page.getByRole('tab', {name: 'Review', exact: true}).count();
    await full(page, `workflow-typed-${label}`);
    return out;
}

async function readWorkflowStatus(page, app, ctx, subId, name) {
    await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${subId}`));
    await idle(page);
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().waitFor({timeout: 20000});
    const text = await page.locator('main').innerText();
    const box = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h1,h2,h3,h4')].find((e) => /Round \d+ Status|^Status$/.test(e.innerText.trim()));
        return h ? (h.closest('section, div') || h.parentElement).innerText.replace(/\s+/g, ' ').trim() : null;
    });
    await full(page, name, {statusBox: box});
    return {statusBox: box, minimumLine: (text.match(/Minimum number of confirmed reviews required: \d+\./) || [null])[0], awaiting: /Awaiting responses from reviewers\./.test(text), allConfirmed: /All reviews are confirmed/.test(text)};
}

async function readAddReviewer(page, app, ctx, subId, name) {
    await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${subId}`));
    await idle(page);
    const addBtn = page.getByRole('button', {name: 'Add Reviewer', exact: true}).first();
    await addBtn.waitFor({timeout: 20000});
    await addBtn.click();
    const dlg = page.getByRole('dialog').last();
    await dlg.getByRole('button', {name: /^Select (?!Files)/}).first().waitFor({timeout: 20000});
    await dlg.getByRole('button', {name: /^Select (?!Files)/}).first().click();
    await dlg.locator('input.datepicker').first().waitFor({timeout: 20000});
    const dates = await dlg.evaluate((d) => [...d.querySelectorAll('input[name*="DueDate"]')].map((i) => ({name: i.name, value: i.value})));
    await full(page, name, {dates, today: today()});
    await dlg.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
    return dates;
}

forEachApp(async (app) => {
    const out = {app: app.name, today: today()};
    if (app.name === 'ops') { record('k1-results', {app: 'ops', skipped: 'OPS has no Review tab and refuses the review seed; the spec covers OJS and OMP'}); return; }
    let scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;

    if (on('seed')) {
        const t = tag('u29k1');
        scratch = {tag: t, mgr: `${t}mgr`, ed: `${t}ed`, pe: `${t}pe`, se: `${t}se`, ge: `${t}ge`, rev: `${t}rev`, rev2: `${t}rev2`, au: `${t}au`, rdr: `${t}rdr`};
        const users = [
            {username: scratch.mgr, roles: ['manager'], givenName: 'Kone', familyName: 'Manager'},
            {username: scratch.ed, roles: ['editor'], givenName: 'Kone', familyName: 'Editor'},
            {username: scratch.pe, roles: ['productionEditor'], givenName: 'Kone', familyName: 'Production'},
            {username: scratch.se, roles: ['sectionEditor'], givenName: 'Kone', familyName: 'Section'},
            {username: scratch.rev, roles: ['externalReviewer'], givenName: 'Kone', familyName: 'Reviewer'},
            {username: scratch.rev2, roles: ['externalReviewer'], givenName: 'Ktwo', familyName: 'Reviewer'}, // free for the Add Reviewer search
            {username: scratch.au, roles: ['author'], givenName: 'Kone', familyName: 'Author'},
            {username: scratch.rdr, roles: ['reader'], givenName: 'Kone', familyName: 'Reader'},
        ];
        if (app.name === 'ojs') users.push({username: scratch.ge, roles: ['guestEditor'], givenName: 'Kone', familyName: 'Guest'});
        const ctx = await app.api.createContext({
            tag: t,
            users,
            review: {numReviewsPerSubmission: 2},
            reviewForms: [{title: {en: `K1 form ${t}`}, elements: [{question: {en: 'Comments'}, type: 'textarea'}]}],
        });
        scratch.contextId = ctx.contextId;
        scratch.path = ctx.path;
        const stage = app.name === 'omp' ? 'external' : undefined;
        const sub = await app.api.createSubmission({
            tag: `${t}s1`,
            context: scratch.path,
            submitter: 'author.alex',
            title: `U29 K1 ${t}`,
            submitted: true,
            decisions: ['sendExternalReview'],
            reviewRounds: [{...(stage ? {stage} : {}), reviewers: [{username: scratch.rev, status: 'accepted'}]}],
        });
        scratch.submissionId = sub.submissionId;
        scratch.seededAt = new Date().toISOString();
        fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
        out.seed = scratch;
    }

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); await d.accept().catch(() => {}); });
    try {
        // ---------------- s1: seeded context, read-only — scenario 1, Fields defaults, Rule 1, A5, Actors refusals
        if (on('s1')) {
            const ctx = app.contextPath;
            await signIn(page, 'manager.maya', {contextPath: ctx});
            await page.goto(app.url(WORKFLOW(ctx)));
            await idle(page);
            out.s1 = {mainTabs: await page.locator('[role="tablist"]').first().locator('[role="tab"]').allInnerTexts()};
            out.s1.afterReview = await hashAfter(page, () => page.getByRole('tab', {name: 'Review', exact: true}).click());
            await page.getByRole('tab', {name: 'Setup', exact: true}).waitFor();
            out.s1.sideTabs = await page.locator('[role="tabpanel"]:visible [role="tablist"] [role="tab"]').allInnerTexts();
            out.s1.afterSetup = await hashAfter(page, () => page.getByRole('tab', {name: 'Setup', exact: true}).click());
            await page.getByRole('textbox', {name: 'Default Response Deadline'}).waitFor();
            out.s1.setup = await readSetup(page);
            await full(page, 's1-setup-defaults');
            await loc(page, 'Review main tab', page.getByRole('tab', {name: 'Review', exact: true}));
            await loc(page, 'Setup side tab', page.getByRole('tab', {name: 'Setup', exact: true}));
            await loc(page, 'Setup "Save"', page.locator('[role="tabpanel"]:visible').last().getByRole('button', {name: 'Save', exact: true}));
            out.s1.afterGuidance = await hashAfter(page, () => page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click());
            await page.locator('#reviewerGuidance').waitFor();
            out.s1.guidance = await page.evaluate(() => {
                const f = document.querySelector('#reviewerGuidance');
                const frames = [...f.querySelectorAll('iframe')].map((i) => ({id: i.id, text: i.contentDocument ? i.contentDocument.body.innerText.trim() : null}));
                const box = f.querySelector('input[name="showEnsuringLink"]');
                return {frames, anonymityBox: box ? box.checked : null, saveButtons: [...f.querySelectorAll('button')].map((b) => b.innerText.trim()).filter((s) => /save/i.test(s))};
            });
            await full(page, 's1-guidance-defaults');
            out.s1.afterForms = await hashAfter(page, () => page.getByRole('tab', {name: 'Review Forms', exact: true}).click());
            await page.locator('#reviewFormGridContainer').waitFor();
            await idle(page);
            out.s1.formsGridText = (await page.locator('#reviewFormGridContainer').innerText()).replace(/\s+/g, ' ').trim();
            await full(page, 's1-forms-empty');
            // A5: reload on the address the screen wrote
            await page.reload();
            await idle(page);
            out.s1.reload = {url: page.url(), visibleHeading: (await page.locator('[role="tabpanel"]:visible').last().innerText()).replace(/\s+/g, ' ').slice(0, 160)};
            await full(page, 's1-after-reload');
            // a typed flat hash (bookmark) and the nested one
            await page.goto(app.url(`${WORKFLOW(ctx)}#reviewSetup`));
            await page.reload();
            await idle(page);
            out.s1.typedFlat = {url: page.url(), visibleHeading: (await page.locator('[role="tabpanel"]:visible').last().innerText()).replace(/\s+/g, ' ').slice(0, 160)};
            await page.goto(app.url(NESTED(ctx)));
            await page.reload();
            await idle(page);
            out.s1.typedNested = {url: page.url(), responseBoxVisible: await page.getByRole('textbox', {name: 'Default Response Deadline'}).isVisible().catch(() => false)};
            await full(page, 's1-typed-nested');
            // scenario 1 control and the Actors row's refused roles on the seeded context (read-only)
            out.s1.roles = {};
            for (const u of ['sectioneditor.ana', 'assistant.rita', 'reviewer.julia', 'author.alex', 'reader.rosa']) {
                await signIn(page, u, {contextPath: ctx});
                out.s1.roles[u] = await sidebarAndTyped(page, app, ctx, u.replace('.', '-'));
            }
            await signOut(page);
        }

        // ---------------- roles: scratch context — admin, editor, production editor save; section/guest editor and reader refused
        if (on('roles')) {
            out.roles = {};
            for (const [label, user] of [['admin', 'admin'], ['editor', scratch.ed], ['productionEditor', scratch.pe]]) {
                await signIn(page, user, {contextPath: scratch.path});
                await idle(page).catch(() => {});
                await page.locator('nav a').first().waitFor({timeout: 10000}).catch(() => {});
                const r = {landing: page.url(), sidebar: (await page.locator('nav a').allInnerTexts()).map((s) => s.trim()).filter(Boolean)};
                r.sidebarHasSettings = r.sidebar.some((s) => /^Settings$/.test(s));
                await openSetup(page, app, scratch.path);
                r.setupVisible = true;
                r.sideTabs = await page.locator('[role="tabpanel"]:visible [role="tablist"] [role="tab"]').allInnerTexts();
                r.save = await saveForm(page);
                await full(page, `roles-${label}-setup-saved`);
                if (label === 'productionEditor') {
                    await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click();
                    await page.locator('#reviewerGuidance').waitFor();
                    r.guidanceSave = await saveForm(page);
                    await full(page, `roles-${label}-guidance-saved`);
                }
                if (label === 'admin') {
                    await page.getByRole('tab', {name: 'Review Forms', exact: true}).click();
                    await page.locator('#reviewFormGridContainer tr.gridRow').first().waitFor({timeout: 20000});
                    await idle(page);
                    const row = page.locator('#reviewFormGridContainer tr.gridRow').first();
                    await row.locator('a.show_extras').click();
                    const ctl = row.locator('xpath=following-sibling::tr[1]');
                    await ctl.locator('a').first().waitFor({timeout: 10000}).catch(() => {});
                    r.formRow = {text: (await row.innerText()).replace(/\s+/g, ' ').trim(), activeBox: await row.locator('input[type=checkbox]').isChecked().catch(() => null), actions: (await ctl.locator('a').allInnerTexts()).map((s) => s.trim()).filter(Boolean), gridLinks: (await page.locator('#reviewFormGridContainer a.pkp_linkaction_createReviewForm, #reviewFormGridContainer a.pkp_linkaction_orderItems').allInnerTexts()).map((s) => s.trim())};
                    await full(page, 'roles-admin-review-forms');
                    if (app.name === 'ojs') {
                        await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).click();
                        await page.locator('[data-cy="reviewer-recommendation-manager"] tbody tr').first().waitFor({timeout: 20000});
                        r.recommendationRows = await page.locator('[data-cy="reviewer-recommendation-manager"] tbody tr').count();
                        await full(page, 'roles-admin-recommendations');
                    }
                }
                out.roles[label] = r;
            }
            const refused = [['sectionEditor', scratch.se], ['reader', scratch.rdr], ['author', scratch.au]];
            if (app.name === 'ojs') refused.push(['guestEditor', scratch.ge]);
            for (const [label, user] of refused) {
                await signIn(page, user, {contextPath: scratch.path});
                out.roles[label] = await sidebarAndTyped(page, app, scratch.path, `scratch-${label}`);
            }
            await signOut(page);
        }

        // ---------------- fields: refusals on every box, the footer with two errors, scenario 3, Rule 3 both ends, Rule 4
        if (on('fields')) {
            out.fields = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openSetup(page, app, scratch.path);
            out.fields.seededSetup = await readSetup(page);
            await full(page, 'fields-scratch-start');
            const refuse = async (name, box, value) => {
                await fillBox(page, box, value);
                const s = await saveForm(page);
                const r = await readSetup(page);
                out.fields[name] = {...s, boxValue: r.textboxes.find((b) => b.id.includes(box === 'Default Response Deadline' ? 'numWeeksPerResponse' : box === 'Default Completion Deadline' ? 'numWeeksPerReview' : 'numReviewsPerSubmission')).value};
                await full(page, `fields-${name}`);
            };
            await refuse('response-abc', 'Default Response Deadline', 'abc');
            await fillBox(page, 'Default Response Deadline', '4');
            await refuse('completion-minus1', 'Default Completion Deadline', '-1');
            await refuse('completion-2_5', 'Default Completion Deadline', '2.5');
            await fillBox(page, 'Default Completion Deadline', '4');
            await refuse('minimum-minus1', 'Minimum Confirmed Reviews Required', '-1');
            // two boxes wrong at once: the footer's count
            await fillBox(page, 'Minimum Confirmed Reviews Required', '2');
            await fillBox(page, 'Default Response Deadline', 'abc');
            await refuse('two-errors', 'Default Completion Deadline', '-1');
            await loc(page, 'field error under a box', page.locator('.pkpFieldError').first());
            await loc(page, 'form error footer', page.locator('.pkpFormErrors'));
            // scenario 3: 0 and 2, Save, reload
            await fillBox(page, 'Default Response Deadline', '0');
            await fillBox(page, 'Default Completion Deadline', '4');
            await fillBox(page, 'Minimum Confirmed Reviews Required', '2');
            out.fields.scenario3Save = await saveForm(page);
            await openSetup(page, app, scratch.path);
            out.fields.scenario3Reloaded = (await readSetup(page)).textboxes;
            await full(page, 'fields-scenario3-reloaded');
            // Rule 4: the round status box with minimum 2 and one accepted reviewer
            out.fields.statusMin2 = await readWorkflowStatus(page, app, scratch.path, scratch.submissionId, 'fields-status-min2');
            // scenario 3 control: Add Reviewer proposes today + 21
            out.fields.addReviewerResponse0 = await readAddReviewer(page, app, scratch.path, scratch.submissionId, 'fields-add-reviewer-response0');
            // the completion box at 0 (the end pA did not drive)
            await openSetup(page, app, scratch.path);
            await fillBox(page, 'Default Completion Deadline', '0');
            out.fields.completion0Save = await saveForm(page);
            out.fields.addReviewerCompletion0 = await readAddReviewer(page, app, scratch.path, scratch.submissionId, 'fields-add-reviewer-completion0');
            // minimum back to 0: the status box again
            await openSetup(page, app, scratch.path);
            await fillBox(page, 'Default Completion Deadline', '4');
            await fillBox(page, 'Default Response Deadline', '4');
            await fillBox(page, 'Minimum Confirmed Reviews Required', '0');
            out.fields.restoreSave = await saveForm(page);
            out.fields.statusMin0 = await readWorkflowStatus(page, app, scratch.path, scratch.submissionId, 'fields-status-min0');
            await signOut(page);
        }

        // ---------------- sliders: scenario 4, the readings at 1 and 14, no mail
        if (on('sliders')) {
            out.sliders = {};
            const revMail = `${scratch.rev}@mail.test`;
            out.sliders.mailBefore = await app.mail.count({to: revMail}).catch((e) => String(e.message));
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openSetup(page, app, scratch.path);
            const S = ['Review Request Response - Before Due Date', 'Review Request Response - After Due Date', 'Review Submission - Before Due Date', 'Review Submission - After Due Date'];
            await setSlider(page, S[3], 1);
            out.sliders.fourthAt1 = (await readSetup(page)).sliders[3];
            await setSlider(page, S[3], 1, 'End');
            out.sliders.fourthAtEnd = (await readSetup(page)).sliders[3];
            await setSlider(page, S[3], 1, 'ArrowRight');
            out.sliders.fourthPastEnd = (await readSetup(page)).sliders[3];
            await setSlider(page, S[3], 1, 'Home');
            await setSlider(page, S[0], 3);
            await setSlider(page, S[1], 5);
            await setSlider(page, S[2], 7);
            out.sliders.before = (await readSetup(page)).sliders;
            await full(page, 'sliders-set-3-5-7-0');
            await loc(page, 'first reminder slider', page.getByRole('slider', {name: S[0], exact: true}));
            out.sliders.save = await saveForm(page);
            await openSetup(page, app, scratch.path);
            out.sliders.reloaded = (await readSetup(page)).sliders;
            await full(page, 'sliders-reloaded');
            out.sliders.mailAfter = await app.mail.count({to: revMail}).catch((e) => String(e.message));
            await signOut(page);
        }

        // ---------------- leave: scenario 9, Rule 1's unsaved-change and "nothing else changes"
        if (on('leave')) {
            out.leave = {};
            await signIn(page, scratch.mgr, {contextPath: scratch.path});
            await openSetup(page, app, scratch.path);
            const checkedRadio = () => page.evaluate(() => { const r = document.querySelector('input[name=defaultReviewMode]:checked'); return r ? r.closest('label').innerText.trim() : null; });
            out.leave.start = await checkedRadio();
            await page.getByRole('radio', {name: 'Open', exact: true}).check();
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click();
            await page.locator('#reviewerGuidance').waitFor();
            await page.getByRole('tab', {name: 'Setup', exact: true}).click();
            await page.getByRole('textbox', {name: 'Default Response Deadline'}).waitFor();
            out.leave.afterTabTrip = await checkedRadio();
            await full(page, 'leave-after-tab-trip');
            const website = page.locator('nav').getByRole('link', {name: 'Website', exact: true});
            await loc(page, 'sidebar "Website"', website);
            await website.click();
            await page.waitForURL(/settings\/website/, {timeout: 15000});
            await idle(page);
            out.leave.websiteURL = page.url();
            await full(page, 'leave-website');
            await openSetup(page, app, scratch.path);
            out.leave.afterReturn = await checkedRadio();
            await full(page, 'leave-after-return');
            // control: the same change saved survives the trip; "nothing else on the page changes"
            await page.getByRole('radio', {name: 'Open', exact: true}).check();
            const beforeSave = (await readSetup(page)).panelText;
            out.leave.controlSave = await saveForm(page);
            const afterSave = (await readSetup(page)).panelText;
            out.leave.pageDiffOnSave = beforeSave === afterSave ? 'identical' : {before: beforeSave.length, after: afterSave.length, addedText: afterSave.split('\n').filter((l) => !beforeSave.includes(l))};
            await full(page, 'leave-control-saved');
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click();
            await page.locator('#reviewerGuidance').waitFor();
            await page.getByRole('tab', {name: 'Setup', exact: true}).click();
            await page.getByRole('textbox', {name: 'Default Response Deadline'}).waitFor();
            out.leave.controlAfterTabTrip = await checkedRadio();
            await website.click();
            await page.waitForURL(/settings\/website/, {timeout: 15000});
            await openSetup(page, app, scratch.path);
            out.leave.controlAfterReturn = await checkedRadio();
            await full(page, 'leave-control-after-return');
            await signOut(page);
        }
    } catch (e) {
        out.error = {message: String(e.message || e).slice(0, 800), url: page.url()};
        await full(page, 'error-state').catch(() => {});
    } finally {
        out.dialogs = dialogs;
        // merge with an earlier partial run's bag, so PHASES=… reruns keep the other phases' results
        const bag = path.join(outDir(), `k1-results-${app.name}.json`);
        const prev = fs.existsSync(bag) ? JSON.parse(fs.readFileSync(bag, 'utf8')) : {};
        record('k1-results', Object.assign(prev, out));
        await close();
    }
});
