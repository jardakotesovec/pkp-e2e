// U29 claim check, chunk K1: the "Setup" tab of Settings › Workflow › "Review"
// and its saving, on OJS and OMP (OPS: one screen, the Workflow Settings tabs).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Fields "Setup"
// (lines 61–77), Rules 1–4 (123–162), Side effects "Saving" (372–376), the
// scenario preamble and scenarios 1–3 (452–486), register A4 (618–626).
//
// Seeds its own scratch journal/press (throwaway manager, author, three
// external reviewers; one submission in review with the first reviewer
// accepted) and records every screen with screen().
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U29/K1/k1.js
//   PHASES=seed,rule1,fields,s2,s3,s1,drag0,errpos,ops   (default: all; later phases reuse k1-scratch-<app>.json)
//
// Order matters: s2 and s3 leave the scratch context at the install defaults;
// s1 saves values and adds a request, and then drives Rules 3 and 4.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'rule1', 'fields', 's2', 's3', 's1', 'drag0', 'errpos', 'ops'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const scratchFile = (app) => path.join(outDir(), `k1-scratch-${app.name}.json`);
const iso = (d) => d.toISOString().slice(0, 10);
const dayDiff = (s) => { const t = Date.parse(s); if (Number.isNaN(t)) return null; return Math.round((t - Date.parse(iso(new Date()))) / 86400000); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SLIDERS = [
    'Review Request Response - Before Due Date',
    'Review Request Response - After Due Date',
    'Review Submission - Before Due Date',
    'Review Submission - After Due Date',
];
const MODES = ['Anonymous Reviewer/Anonymous Author', 'Anonymous Reviewer/Disclosed Author', 'Open'];

// The strings the spec's Fields table (lines 68–76) and Rule 1 name; each is
// looked up verbatim in the form's innerText and reported found / missing.
const FIELD_STRINGS = [
    'Default Review Mode', ...MODES,
    'Publicly Show Reviewer Comments',
    "Enable this setting if you'd like the review process to be made publicly visible alongside published submissions. This supports transparent peer review practices and can help foster greater trust and accountability.",
    'Make reviewer comments publicly visible with published content',
    'Restrict File Access',
    'One-click Reviewer Access',
    'Reviewers can be sent a secure link in the email invitation, which will log them in automatically when they click the link.',
    'Include a secure link in the email invitation to reviewers.',
    'Reviewer Suggestion at Submission',
    'Author can suggest several potential reviewers before completing the submission which can streamline the review process and provide valuable input for editorial team.',
    'Allow authors to suggest potential reviewers at submission process',
    'Default Response Deadline', 'Number of weeks to accept or decline a review request.',
    'Default Completion Deadline',
    'Minimum Confirmed Reviews Required', 'Minimum number of confirmed reviews required for a submission',
    'Set Reminders for Review',
    'Send an email reminder before or after for review request response (if reviewer has not responded to review request yet) or review submission (if reviewer has not submitted review yet)',
    ...SLIDERS, 'No reminder set', 'None', '14', 'Save',
];
const PER_APP_STRINGS = {
    ojs: ['Reviewers will not be given access to the submission file until they have agreed to review it.', 'Weeks allowed to complete the review'],
    omp: ['Reviewers will have access to the submission file only after agreeing to review it.', 'Weeks allowed for review completion'],
};

async function full(page, name) {
    let data;
    try { data = await screen(page); } catch (e) { data = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    data.tabSelected = await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts().catch(() => null);
    record(name, data);
    await shot(page, name).catch(() => {});
    return data;
}

forEachApp(async (app) => {
    let sc = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(sc, null, 2));
    const S = {app: app.name, phases: PHASES};
    const done = (name, data) => { S[name] = data; record(`k1-${name}-${app.name}`, data); log(`[${name}]`, app.name, JSON.stringify(data).slice(0, 1500)); };

    // ---- OPS: no Review tab; one screen of Workflow Settings as manager.maya ----
    if (app.name === 'ops') {
        if (!on('ops')) return;
        const {page, close} = await launch(app);
        try {
            await signIn(page, 'manager.maya', {contextPath: app.contextPath});
            await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`)); await idle(page);
            const d = await full(page, 'ops-workflow-settings');
            const topTabs = await page.locator('main').getByRole('tablist').first().getByRole('tab').allInnerTexts();
            done('ops', {url: page.url(), heading: (d.text && d.text.main || '').split('\n')[0], topTabs, hasReview: topTabs.includes('Review')});
            await signOut(page);
        } finally { await close(); }
        return;
    }

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u29k1');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}rev1`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            {username: `${t}rev2`, roles: ['externalReviewer'], givenName: 'Sparrow', familyName: 'Spare'},
            {username: `${t}rev3`, roles: ['externalReviewer'], givenName: 'Tern', familyName: 'Third'},
        ];
        const ctx = await app.api.createContext({tag: t, users});
        const sub = await app.api.createSubmission({
            tag: `${t}s1`, context: t, submitter: `${t}au`, title: `K1 in review ${t}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: `${t}rev1`, status: 'accepted'}]}],
        });
        sc = {tag: t, contextPath: ctx.path || t, contextId: ctx.contextId,
            users: {mgr: `${t}mgr`, au: `${t}au`, rev1: `${t}rev1`, rev2: `${t}rev2`, rev3: `${t}rev3`},
            sub: sub.submissionId, roundId: (sub.reviewRounds && sub.reviewRounds[0] || {}).id, seeded: sub};
        saveScratch();
        log('[seed]', app.name, JSON.stringify({ctx: sc.contextPath, sub: sc.sub, roundId: sc.roundId}));
    }
    if (!sc.contextPath) throw new Error('no scratch; run the seed phase first');

    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const workflowUrl = ctxUrl('/management/settings/workflow');
    const roundUrl = () => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${sc.sub}&workflowMenuKey=workflow_3_${sc.roundId}`);
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };

    // ---- helpers: the "Setup" tab ----------------------------------------------
    const topTabs = (page) => page.locator('main').getByRole('tablist').first().getByRole('tab');
    const reviewPanel = (page) => page.getByRole('tabpanel', {name: 'Review', exact: true});
    const sideTabs = (page) => reviewPanel(page).getByRole('tablist').first().getByRole('tab');
    const sideTab = (page, name) => reviewPanel(page).getByRole('tab', {name, exact: true});
    const setupForm = (page) => page.getByRole('tabpanel', {name: 'Setup', exact: true}).locator('form').first();
    async function openSetup(page, {viaClicks = false} = {}) {
        if (viaClicks) {
            await page.goto(workflowUrl); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click();
            await sideTab(page, 'Setup').click();
        } else {
            await page.goto(`${workflowUrl}#review/reviewSetup`);
        }
        await idle(page);
        const form = setupForm(page);
        await form.getByLabel('Default Response Deadline').waitFor({timeout: 30000});
        return form;
    }
    const fields = (form) => ({
        response: form.getByLabel('Default Response Deadline'),
        completion: form.getByLabel('Default Completion Deadline'),
        minimum: form.getByLabel('Minimum Confirmed Reviews Required'),
        mode: (name) => form.getByRole('radio', {name, exact: true}),
        publicBox: form.getByRole('checkbox', {name: 'Make reviewer comments publicly visible with published content'}),
        save: form.getByRole('button', {name: 'Save', exact: true}),
    });
    const sliderHandle = (page, name) => page.getByRole('slider', {name});
    async function sliderRead(page, name) {
        const handle = sliderHandle(page, name);
        const wrapper = page.locator('div.max-w-lg', {has: handle});
        return {name, valuenow: await handle.getAttribute('aria-valuenow'), valuetext: await handle.getAttribute('aria-valuetext'),
            readout: (await wrapper.locator('.w-48').innerText()).trim(), ends: await wrapper.locator('.justify-between > div').allInnerTexts()};
    }
    async function sliderKeys(page, name, n) {
        const h = sliderHandle(page, name); await h.focus(); await h.press('Home');
        for (let i = 0; i < n; i++) await h.press('ArrowRight');
    }
    async function sliderDrag(page, name, n) {
        const h = sliderHandle(page, name);
        const track = page.locator('div.max-w-lg', {has: h}).locator('.px-2');
        const box = await track.boundingBox(); const hb = await h.boundingBox();
        await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + (box.width * n) / 14, hb.y + hb.height / 2, {steps: 20}); await page.mouse.up();
        return sliderRead(page, name);
    }
    async function values(page, form) {
        const f = fields(form);
        return {response: await f.response.inputValue(), completion: await f.completion.inputValue(), minimum: await f.minimum.inputValue(),
            mode: await form.getByRole('radio').evaluateAll((els) => els.filter((e) => e.checked).map((e) => e.closest('label')?.innerText.trim())),
            publicBox: await f.publicBox.isChecked(),
            sliders: await Promise.all(SLIDERS.map((s) => sliderRead(page, s)))};
    }
    /** What the form and page show after a refused or accepted save. */
    async function saveState(page, form) {
        const f = fields(form);
        const errs = form.locator('.pkpFormField__error, [id$="-error"]');
        const fieldErrors = [];
        for (const e of await errs.all()) {
            fieldErrors.push(await e.evaluate((el) => {
                const block = el.closest('.pkpFormField');
                const help = block && block.querySelector('.pkpFormField__description');
                const cs = getComputedStyle(el);
                return {text: el.innerText.trim(), color: cs.color, afterHelp: help ? !!(help.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
                    blockLines: block ? block.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null};
            }));
        }
        const formTop = await form.evaluate((f) => {
            const els = [...f.querySelectorAll('.pkpForm__errors, .pkpFormPage__errors, [class*="rrors"]')].filter((e) => e.offsetParent !== null);
            return els.map((e) => ({text: e.innerText.trim().replace(/\n+/g, ' / '), links: [...e.querySelectorAll('a, button')].map((a) => ({tag: a.tagName, text: a.innerText.trim()}))}));
        });
        return {fieldErrors, formTop,
            notifications: await page.locator('.pkpNotification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim())),
            status: await form.locator('.pkpFormPage__status').allInnerTexts().catch(() => []),
            save: await f.save.evaluate((b) => { const cs = getComputedStyle(b); return {disabled: b.disabled, ariaDisabled: b.getAttribute('aria-disabled'), opacity: cs.opacity, color: cs.color, background: cs.backgroundColor}; })};
    }
    async function clickSaveExpectRefusal(page, form) {
        await fields(form).save.click();
        await form.locator('.pkpFormField__error, [id$="-error"]').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        return saveState(page, form);
    }
    /** Press Save on a form that should pass, and sample the footer status for 7 s. */
    async function clickSaveAndSample(page, form) {
        const status = form.locator('.pkpFormPage__status');
        const save = fields(form).save;
        const t0 = Date.now(); const timeline = []; let last = null;
        await save.click();
        while (Date.now() - t0 < 7000) {
            const s = JSON.stringify({status: (await status.allInnerTexts().catch(() => [])).map((x) => x.trim()), saveDisabled: await save.isDisabled().catch(() => null)});
            if (s !== last) { timeline.push({ms: Date.now() - t0, ...JSON.parse(s)}); last = s; }
            await sleep(100);
        }
        return {timeline, notifications: await page.locator('.pkpNotification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim()))};
    }
    const mailCounts = async () => { const r = {}; for (const [k, u] of Object.entries(sc.users)) r[k] = await app.mail.count({to: `${u}@mail.test`}); return r; };

    // ---- helpers: the review stage, Add Reviewer, Edit ------------------------
    const revTable = (page) => page.getByRole('table', {name: 'Reviewers', exact: true});
    async function openRound(page, label) {
        await page.goto(roundUrl()); await idle(page);
        await revTable(page).waitFor({timeout: 30000}); await idle(page);
        const d = await full(page, `${label}-review-stage`);
        d.dialogText = await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => []);
        record(`${label}-review-stage-dialog-${app.name}`, {url: page.url(), dialogText: d.dialogText});
        return d;
    }
    async function readReviewerForm(root) {
        return root.evaluate((f) => {
            const lab = (el) => { const l = el.id ? f.querySelector(`label[for="${el.id}"]`) : null; return (l ? l.innerText : (el.closest('label') || {}).innerText || '').trim(); };
            const radios = [...f.querySelectorAll('input[name="reviewMethod"]')].map((r) => ({value: r.value, checked: r.checked, label: lab(r)}));
            const v = (n) => { const i = f.querySelector(`input[name="${n}"]`); return i ? i.value : null; };
            const pv = f.querySelector('input[name="isReviewPubliclyVisible"]');
            return {reviewMethod: radios, checkedMode: radios.filter((r) => r.checked).map((r) => r.label), responseDueDate: v('responseDueDate'), reviewDueDate: v('reviewDueDate'),
                publicBox: pv ? {checked: pv.checked, label: lab(pv)} : null, reviewFormList: !!f.querySelector('select[name="reviewFormId"]'),
                buttons: [...f.querySelectorAll('button, a')].map((b) => ({tag: b.tagName, text: b.innerText.trim()})).filter((b) => b.text)};
        });
    }
    async function addReviewerWindow(page, label, who, {submit = false} = {}) {
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await dlg.waitFor({timeout: 30000});
        const entry = dlg.locator('.listPanel__item').filter({hasText: who}).first(); await entry.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
        await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
        const formEl = dlg.locator('#regularReviewerForm'); await formEl.waitFor({state: 'visible', timeout: 30000});
        const form = await readReviewerForm(formEl);
        form.today = iso(new Date()); form.responseDays = dayDiff(form.responseDueDate); form.reviewDays = dayDiff(form.reviewDueDate);
        record(`${label}-add-reviewer-${app.name}`, {form, aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
        await shot(page, `${label}-add-reviewer-${app.name}`).catch(() => {});
        if (submit) {
            await formEl.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await formEl.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            await revTable(page).getByRole('row').filter({hasText: who}).first().waitFor({timeout: 30000}).catch(() => {});
            form.submitted = {rows: await revTable(page).getByRole('row').allInnerTexts().catch(() => null)};
            await full(page, `${label}-after-add`);
        } else {
            await dlg.getByRole('button', {name: 'Close'}).first().click();
            await formEl.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page);
        }
        return form;
    }
    async function editWindow(page, label, who) {
        const row = revTable(page).getByRole('row').filter({hasText: who}).first();
        await row.getByRole('button', {name: 'More Actions'}).click({timeout: 15000});
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click({timeout: 15000});
        const dlg = page.getByRole('dialog').last(); await dlg.locator('input[name="reviewMethod"]').first().waitFor({timeout: 30000});
        const data = await readReviewerForm(dlg);
        data.title = await dlg.locator('h1, h2, .modal__title, [class*="title"]').first().innerText().catch(() => null);
        record(`${label}-edit-${app.name}`, {data, aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
        await shot(page, `${label}-edit-${app.name}`).catch(() => {});
        // The "Edit Review" window's "Cancel" is a link, not a button.
        const cancel = dlg.getByRole('link', {name: 'Cancel', exact: true});
        if (await cancel.count()) await cancel.first().click(); else await dlg.getByRole('button', {name: 'Close'}).first().click();
        await dlg.locator('input[name="reviewMethod"]').first().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
        return data;
    }

    // ---- rule1: the screen, its tabs, the address, the reload (Rule 1, A4) ----
    if (on('rule1')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await page.goto(workflowUrl); await idle(page);
            const landing = await full(page, 'rule1-landing');
            const r = {landingUrl: page.url(), heading: (landing.text && landing.text.main || '').split('\n')[0], top: await topTabs(page).allInnerTexts(), landingSelected: landing.tabSelected};
            await page.getByRole('tab', {name: 'Review', exact: true}).click();
            await page.waitForFunction(() => window.location.hash !== '', null, {timeout: 5000}).catch(() => {});
            r.afterReview = {url: page.url(), side: await sideTabs(page).allInnerTexts()};
            await sideTab(page, 'Setup').click();
            await page.waitForFunction((h) => window.location.hash !== h, new URL(r.afterReview.url).hash, {timeout: 5000}).catch(() => {});
            await idle(page);
            const setupScreen = await full(page, 'rule1-setup');
            r.afterSetup = {url: page.url(), selected: setupScreen.tabSelected};
            await sideTab(page, 'Reviewer Guidance').click();
            await page.waitForFunction((h) => window.location.hash !== h, new URL(r.afterSetup.url).hash, {timeout: 5000}).catch(() => {});
            r.afterGuidance = {url: page.url()};
            await sideTab(page, 'Setup').click();
            await page.waitForFunction((h) => window.location.hash !== h, new URL(r.afterGuidance.url).hash, {timeout: 5000}).catch(() => {});
            r.beforeReload = {url: page.url()};
            await page.reload(); await idle(page);
            const reloaded = await full(page, 'rule1-after-reload');
            r.afterReload = {url: page.url(), selected: reloaded.tabSelected, visibleTabpanels: await page.locator('[role="tabpanel"]:visible').evaluateAll((els) => els.map((e) => e.getAttribute('aria-labelledby') || e.id))};
            await page.goto(`${workflowUrl}#review/reviewSetup`); await idle(page);
            r.typedTwoPart = {url: page.url(), selected: await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts(), setupVisible: await setupForm(page).isVisible().catch(() => false)};
            done('rule1', r);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- fields: the form as installed on the scratch context (Fields table) ----
    if (on('fields')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const form = await openSetup(page);
            await full(page, 'fields-setup');
            const formText = (await form.innerText()).trim();
            const expected = [...FIELD_STRINGS, ...(PER_APP_STRINGS[app.name] || [])];
            const r = {missing: expected.filter((s) => !formText.includes(s)), formText,
                controls: await form.evaluate((f) => {
                    const lab = (el) => { const l = el.id ? f.querySelector(`label[for="${el.id}"]`) : null; return (l ? l.innerText : (el.closest('label') || {}).innerText || '').trim(); };
                    return {
                        radios: [...f.querySelectorAll('input[type=radio]')].map((r) => ({label: lab(r), checked: r.checked})),
                        boxes: [...f.querySelectorAll('input[type=checkbox]')].map((c) => ({label: lab(c), checked: c.checked})),
                        texts: [...f.querySelectorAll('input[type=text]')].map((t) => ({label: lab(t), value: t.value})),
                        sliders: [...f.querySelectorAll('[role=slider]')].map((s) => ({label: s.getAttribute('aria-label') || (document.getElementById(s.getAttribute('aria-labelledby') || '') || {}).innerText, now: s.getAttribute('aria-valuenow'), min: s.getAttribute('aria-valuemin'), max: s.getAttribute('aria-valuemax'), text: s.getAttribute('aria-valuetext')})),
                        buttons: [...f.querySelectorAll('button')].map((b) => ({text: b.innerText.trim(), disabled: b.disabled})),
                        forms: 1,
                        saveIsLast: (() => { const b = [...f.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Save'); const all = [...f.querySelectorAll('input, button, [role=slider]')]; return b ? all.indexOf(b) === all.length - 1 : null; })(),
                        helpUnderRestrict: (() => { const h = [...f.querySelectorAll('.pkpFormField')].find((b) => /Restrict File Access/.test(b.innerText)); return h ? h.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : null; })(),
                    };
                }),
                slidersAtRest: await Promise.all(SLIDERS.map((s) => sliderRead(page, s))),
            };
            // Line 76: keyboard (one day per press), a click on the track, a drag; "1 days".
            const name = SLIDERS[2];
            const h = sliderHandle(page, name);
            await h.focus(); await h.press('Home'); r.key0 = await sliderRead(page, name);
            await h.press('ArrowRight'); r.key1 = await sliderRead(page, name);
            await h.press('ArrowRight'); r.key2 = await sliderRead(page, name);
            await h.press('End'); r.keyEnd = await sliderRead(page, name);
            const track = page.locator('div.max-w-lg', {has: h}).locator('.px-2'); const box = await track.boundingBox();
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); r.clickMiddle = await sliderRead(page, name);
            r.dragTo3 = await sliderDrag(page, name, 3);
            r.dragTo0 = await sliderDrag(page, name, 0);
            await sliderKeys(page, SLIDERS[1], 1); r.afterSlider1 = await sliderRead(page, SLIDERS[1]);
            await full(page, 'fields-sliders-moved');
            done('fields', r);
            await loc(page, 'Setup form (tabpanel "Setup" › form)', form);
            await loc(page, 'slider handle by label', h);
            await loc(page, 'slider read-out box beside the handle', page.locator('div.max-w-lg', {has: h}).locator('.w-48'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- s2: a refused deadline saves nothing (scenario 2; Rule 2 refusal; Fields 74, 76) ----
    if (on('s2')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const r = {};
            let form = await openSetup(page);
            r.pristine = await values(page, form);
            // abc + mode change
            await fields(form).completion.fill('abc'); await fields(form).mode(MODES[1]).check();
            r.abc = await clickSaveExpectRefusal(page, form);
            await full(page, 's2-abc-refused');
            await page.reload(); form = await openSetup(page);
            r.abcReloaded = await values(page, form);
            // -1 + mode change
            await fields(form).completion.fill('-1'); await fields(form).mode(MODES[1]).check();
            r.minus1 = await clickSaveExpectRefusal(page, form);
            await full(page, 's2-minus1-refused');
            await page.reload(); form = await openSetup(page);
            r.minus1Reloaded = await values(page, form);
            // the other end of "{n} errors": two refused boxes
            await fields(form).completion.fill('abc'); await fields(form).response.fill('x');
            r.twoErrors = await clickSaveExpectRefusal(page, form);
            await full(page, 's2-two-errors');
            // Save stays greyed while the refused values stand? edit one box and read the button again
            await fields(form).response.fill('4');
            r.twoErrorsAfterEditingOne = await saveState(page, form);
            await page.reload(); form = await openSetup(page);
            r.twoErrorsReloaded = await values(page, form);
            // Fields line 74: an emptied completion deadline is accepted and comes back blank
            await fields(form).completion.fill('');
            r.emptyCompletion = await clickSaveAndSample(page, form);
            await page.reload(); form = await openSetup(page);
            r.emptyCompletionReloaded = await values(page, form);
            await full(page, 's2-empty-completion-reloaded');
            await fields(form).completion.fill('4'); await clickSaveAndSample(page, form);
            // Fields line 76: an emptied minimum comes back "0" (from a saved 2)
            await page.reload(); form = await openSetup(page);
            await fields(form).minimum.fill('2'); await clickSaveAndSample(page, form);
            await page.reload(); form = await openSetup(page);
            r.min2Reloaded = (await values(page, form)).minimum;
            await fields(form).minimum.fill('');
            r.emptyMinimum = await clickSaveAndSample(page, form);
            await page.reload(); form = await openSetup(page);
            r.emptyMinimumReloaded = await values(page, form);
            await full(page, 's2-empty-minimum-reloaded');
            done('s2', r);
            await loc(page, 'field error under a Setup box', form.locator('.pkpFormField__error'));
            await loc(page, 'page notice bar', page.locator('.pkpNotification'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- s3: unsaved edits survive a tab switch, not a reload (scenario 3; Rule 2) ----
    if (on('s3')) {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept(); });
        try {
            await signInAs(page, sc.users.mgr);
            const r = {};
            let form = await openSetup(page, {viaClicks: true});
            r.before = (await values(page, form)).response;
            await fields(form).response.fill('6');
            await sideTab(page, 'Reviewer Guidance').click(); await idle(page);
            const g = await full(page, 's3-on-guidance');
            r.onGuidance = {selected: g.tabSelected, dialogs: g.aria && g.aria.dialogs, url: page.url()};
            await sideTab(page, 'Setup').click(); await idle(page);
            r.backOnSetup = {response: await fields(form).response.inputValue(), status: await form.locator('.pkpFormPage__status').allInnerTexts(), notifications: await page.locator('.pkpNotification').allInnerTexts()};
            await full(page, 's3-back-on-setup');
            r.jsDialogsOnSwitch = dialogs.slice();
            await page.reload(); await idle(page);
            r.jsDialogsOnReload = dialogs.slice(r.jsDialogsOnSwitch.length);
            const rl = await full(page, 's3-after-reload');
            r.afterReloadSelected = rl.tabSelected;
            form = await openSetup(page, {viaClicks: true});
            r.afterReload = (await values(page, form)).response;
            done('s3', r);
            await signOut(page);
        } finally { await close(); }
    }

    // ---- s1: save the review setup, then Add Reviewer; Rules 3 and 4; side effects ----
    if (on('s1')) {
        const {page, close} = await launch(app);
        const r = {};
        try {
            await signInAs(page, sc.users.mgr);
            let form = await openSetup(page, {viaClicks: true});
            r.mailBefore = await mailCounts();
            await fields(form).mode('Open').check();
            await fields(form).response.fill('2'); await fields(form).minimum.fill('1');
            r.drag = await sliderDrag(page, SLIDERS[0], 3);
            if (r.drag.valuenow !== '3') { await sliderKeys(page, SLIDERS[0], 3); r.dragFallbackKeys = await sliderRead(page, SLIDERS[0]); }
            await full(page, 's1-edited');
            r.save = await clickSaveAndSample(page, form);
            r.mailAfter = await mailCounts();
            await page.reload(); await idle(page);
            form = await openSetup(page, {viaClicks: true});
            r.reloaded = await values(page, form);
            await full(page, 's1-reloaded');
            // The submission's review stage, Add Reviewer (Rule 3 and 7's effect end; Rule 4 "off" end)
            r.round = (await openRound(page, 's1')).dialogText;
            r.addReviewerOpen = await addReviewerWindow(page, 's1', 'Sparrow', {submit: true});
            await loc(page, 'Add Reviewer window: review type radios', page.locator('#regularReviewerForm input[name="reviewMethod"]'));
            // Rules 3 and 4: change the mode again and switch the public box on
            form = await openSetup(page);
            await fields(form).mode(MODES[1]).check(); await fields(form).publicBox.check();
            r.save2 = await clickSaveAndSample(page, form);
            await page.reload(); form = await openSetup(page);
            r.reloaded2 = await values(page, form);
            await openRound(page, 's1-after2');
            r.addReviewerAfter2 = await addReviewerWindow(page, 's1-after2', 'Tern');
            r.editRowan = await editWindow(page, 's1-rowan', 'Rowan');
            r.editSparrow = await editWindow(page, 's1-sparrow', 'Sparrow');
            r.mailAfterAll = await mailCounts();
            // Rule 3's last sentence: the reviewer reads the type on the wizard's step 1
            await signInAs(page, sc.users.rev2);
            await page.goto(ctxUrl(`/reviewer/submission/${sc.sub}`)); await idle(page);
            const w = await full(page, 's1-wizard-step1-sparrow');
            r.wizardStep1 = {url: page.url(), lines: (w.text && w.text.main || '').split('\n').map((s) => s.trim()).filter((s) => /Review Type|Anonymous|^Open$|Request/.test(s)).slice(0, 12)};
            done('s1', r);
            note(`[ccK1 ${app.name}] Setup side tabs: address them by role name (getByRole('tab', {name: 'Setup', exact: true}) inside the "Review" tabpanel); a hasText regex against the tab text does not match. The "Edit Review" window (Reviewers row › More Actions › Edit) has the button "OK" and a LINK "Cancel" (getByRole('link', {name: 'Cancel'})), not a Cancel button. The Add Reviewer form's review type radios are input[name="reviewMethod"] in #regularReviewerForm.`);
            await signOut(page);
        } catch (e) { r.error = String(e.message).slice(0, 300); done('s1-partial', r); throw e;
        } finally { await close(); }
    }
    // ---- drag0: scenario 1's "drag ... to 3" from the left end (the kit's drag from 0 missed in s1) ----
    if (on('drag0')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await openSetup(page);
            const name = SLIDERS[1]; const h = sliderHandle(page, name); const r = {};
            const track = page.locator('div.max-w-lg', {has: h}).locator('.px-2');
            await h.focus(); await h.press('Home'); r.start = (await sliderRead(page, name)).readout;
            r.plainDragFrom0 = (await sliderDrag(page, name, 3)).readout;
            await h.focus(); await h.press('Home');
            // nudge first, then travel
            const box = await track.boundingBox(); let hb = await h.boundingBox();
            await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2); await page.mouse.down();
            await page.mouse.move(hb.x + hb.width / 2 + 4, hb.y + hb.height / 2, {steps: 3});
            await page.mouse.move(box.x + (box.width * 3) / 14, hb.y + hb.height / 2, {steps: 25}); await page.mouse.up();
            r.nudgedDragFrom0 = (await sliderRead(page, name)).readout;
            await h.focus(); await h.press('Home');
            hb = await h.boundingBox();
            await h.dragTo(track, {targetPosition: {x: (box.width * 3) / 14, y: box.height / 2}});
            r.dragToFrom0 = (await sliderRead(page, name)).readout;
            r.handleBoxAt0 = hb; r.trackBox = box;
            await full(page, 'drag0-after');
            done('drag0', r);
            await signOut(page);
        } finally { await close(); }
    }
    // ---- errpos: where the refusal texts sit on the form (Rule 2 says "the top of the form") ----
    if (on('errpos')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            const form = await openSetup(page);
            await fields(form).completion.fill('abc');
            await clickSaveExpectRefusal(page, form);
            const r = await form.evaluate((f) => {
                const rect = (el) => { const b = el.getBoundingClientRect(); return {top: Math.round(b.top + window.scrollY), height: Math.round(b.height)}; };
                const find = (re) => [...f.querySelectorAll('*')].filter((e) => e.children.length === 0 && re.test(e.innerText || '')).map((e) => ({tag: e.tagName, text: e.innerText.trim(), visible: e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden', ...rect(e), cls: e.className}));
                return {formTop: rect(f).top, formBottom: rect(f).top + rect(f).height, save: rect([...f.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Save')),
                    firstField: rect(f.querySelector('.pkpFormField')),
                    correct: [...f.querySelectorAll('*')].filter((e) => /^Please correct/.test((e.innerText || '').trim()) && ![...e.children].some((c) => /^Please correct/.test((c.innerText || '').trim()))).map((e) => ({tag: e.tagName, text: e.innerText.trim().split('\n')[0], ...rect(e), cls: e.className})),
                    goTo: find(/^Go to /),
                    goToStyles: [...f.querySelectorAll('button')].filter((b) => /^Go to /.test(b.innerText)).map((b) => { const chain = []; let e = b; while (e && e !== f) { const cs = getComputedStyle(e); chain.push({tag: e.tagName, cls: e.className, opacity: cs.opacity, clip: cs.clip, clipPath: cs.clipPath, position: cs.position, height: cs.height, overflow: cs.overflow, display: cs.display}); e = e.parentElement; } return chain.slice(0, 4); }), jump: find(/^Jump to next error$/), fieldError: find(/This is not a valid integer/)};
            });
            done('errpos', r);
            await fields(form).completion.fill('4');
            await signOut(page);
        } finally { await close(); }
    }
    record(`k1-summary-${PHASES.join('_')}-${app.name}`, S);
});
