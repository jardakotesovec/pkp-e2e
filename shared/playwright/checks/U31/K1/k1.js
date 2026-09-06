// U31 claim check, chunk K1: the setting "Reviewer Suggestion at Submission"
// (Settings › Workflow › Review › Setup) and who sees what — Purpose with the
// OPS absence paragraph, the Actors table (one account per permission level),
// register entry A1 (the Funding Coordinator's error dialog).
// Spec: docs/specs/U31-reviewer-suggestions.md lines 10–49 and 290–301.
//
// OJS/OMP: seeds a scratch context with the setting OFF and one account per
// permission level, records the default-off Setup box and the author's
// wizard without the step, switches the box on through the screen, records
// the wizard with the step, then seeds four submissions (Submission stage
// and Review stage, each with and without suggestions) and visits their
// workflow screen as every level. OPS: a scratch server, the Workflow
// settings tabs, the wizard's steps rail and the workflow screen (absence).
//
//   PROBE_FEATURE=U31 PROBE_AGENT=ccK1 node bin/probe.js ojs shared/playwright/checks/U31/K1/k1.js
//   PHASES=seed,setting,seed2,editorial,menu,author,others,fc,fcselect2,fccreate,t1,t1b,fcbase,fcoff,reviewstep,base
//   (default all; later phases reuse k1-state-<app>.json; OPS runs seed, setting and base only)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'setting', 'seed2', 'editorial', 'menu', 'author', 'others', 'fc', 'fcselect2', 'fccreate', 't1', 't1b', 'fcbase', 'fcoff', 'reviewstep', 'base'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); }
}
async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => `${e.textContent.trim()}:selected=${e.getAttribute('aria-selected')}`)).catch(() => []);
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 4000),
        buttons: [...d.querySelectorAll('button, a[role=button]')].filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).slice(0, 40),
    }))).catch(() => []);
// The workflow screen is a dialog over the dashboard: what it shows about the panel.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    const heads = [...document.querySelectorAll('[role=dialog] h1, [role=dialog] h2, [role=dialog] h3, [role=dialog] h4')].filter(vis).map((e) => e.innerText.trim());
    const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,span,div')].find((e) => vis(e) && e.children.length === 0 && e.textContent.trim() === 'Reviewers Suggested by Author');
    let panelText = null;
    if (h) {
        let c = h;
        for (let i = 0; i < 4 && c.parentElement; i++) c = c.parentElement;
        panelText = c.innerText.slice(0, 3000);
    }
    const more = [...document.querySelectorAll('button')].filter((b) => vis(b) && /More Actions/i.test(b.getAttribute('aria-label') || b.innerText)).map((b) => (b.getAttribute('aria-label') || b.innerText).trim());
    const stageNav = [...document.querySelectorAll('[role=dialog] nav a, [role=dialog] nav button, [role=dialog] [role=menuitem]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 40);
    const errors = [...document.querySelectorAll('[role=alert], .pkpNotification, [role=status]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
    return {headings: heads, panelHeadingPresent: !!h, panelText, moreActions: more, stageNav, errors};
});
const wizardSteps = (page) => page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const steps = [...document.querySelectorAll('.pkpSteps__step, .pkpSteps__step__label')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const lines = main.innerText.split('\n').map((s) => s.trim()).filter((s) => /^\d+\s/.test(s)).slice(0, 12);
    return {h1: (main.querySelector('h1') || {}).innerText, steps, lines, hasAddSuggestion: !!document.querySelector('button') && [...document.querySelectorAll('button')].some((b) => /Add Reviewer Suggestion/.test(b.innerText))};
});

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOPS = app.name === 'ops';
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const baseUrl = (p) => app.url(`/index.php/${app.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const mySub = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const wizard = (id) => ctxUrl(`/submission?id=${id}`);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const REVIEW_KEY = 'workflow_3_1';

    // ---- seed: a scratch context with the setting OFF, one account per level, one draft
    if (on('seed') && !sc.contextPath) {
        const t = tag('u31k1');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}au2`, roles: ['author'], givenName: 'Bo', familyName: 'Other'},
            {username: `${t}rd`, roles: ['reader'], givenName: 'Rae', familyName: 'Reader'},
        ];
        if (!isOPS) {
            users.push(
                {username: `${t}ed`, roles: ['editor'], givenName: 'Eve', familyName: 'Editor'},
                {username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Section'},
                {username: `${t}fc`, roles: ['funding'], givenName: 'Fay', familyName: 'Funding'},
                {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            );
            if (app.name === 'ojs') users.push({username: `${t}ge`, roles: ['guestEditor'], givenName: 'Gus', familyName: 'Guest'});
        } else {
            users.push({username: `${t}se`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Moderator'});
        }
        const ctx = await app.api.createContext({tag: t, context: {name: `U31 K1 ${t}`, acronym: 'U31K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(users.map((u) => [u.username.slice(t.length), u.username]));
        const d = await app.api.createSubmission({tag: `${t}d`, context: sc.contextPath, submitter: `${t}au`, title: `K1 draft ${t}`, submitted: false});
        sc.draft = d.submissionId;
        if (isOPS) {
            const s = await app.api.createSubmission({tag: `${t}s`, context: sc.contextPath, submitter: `${t}au`, title: `K1 posted ${t}`});
            sc.s1 = s.submissionId;
        }
        save();
        log('[seed]', app.name, JSON.stringify({ctx: sc.contextPath, draft: sc.draft, s1: sc.s1}));
    }

    // ---- settings helpers
    const setupPanel = (page) => page.locator('#reviewSetup');
    async function gotoWorkflowSettings(page, url) {
        await page.goto(url); await idle(page);
        await page.getByRole('tab').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
    }
    async function gotoReviewSetup(page, url) {
        await gotoWorkflowSettings(page, url);
        await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
        const side = page.getByRole('tabpanel', {name: 'Review', exact: true}).getByRole('tab', {name: 'Setup', exact: true});
        if (await side.count()) await side.first().click();
        await setupPanel(page).locator('input[name="reviewerSuggestionEnabled"]').waitFor({timeout: 30000});
        await idle(page);
    }
    const readSetup = (page) => setupPanel(page).evaluate((root) => {
        const i = root.querySelector('input[name="reviewerSuggestionEnabled"]');
        const lab = i && i.id ? root.querySelector(`label[for="${i.id}"]`) : null;
        const field = i ? i.closest('.pkpFormField') : null;
        return i ? {checked: i.checked, label: (lab ? lab.innerText : '').trim(), fieldText: field ? field.innerText.trim() : null} : null;
    });

    // ---- OPS: the absence paragraph (lines 26–29) ---------------------------
    if (isOPS) {
        if (on('setting')) {
            const {page, close} = await launch(app);
            try {
                await signInAs(page, sc.users.mgr);
                await gotoWorkflowSettings(page, ctxUrl('/management/settings/workflow'));
                const tabs = await tabsOf(page);
                record('ops-settings-workflow-tabs', {tabs, reviewInput: await page.locator('input[name="reviewerSuggestionEnabled"]').count()});
                await snap(page, 'ops-settings-workflow');
                log('[ops settings]', JSON.stringify(tabs));
                // Typed straight in: the Review tab's own address, as on OJS/OMP.
                await page.goto(ctxUrl('/management/settings/workflow#review')); await idle(page);
                await page.reload(); await idle(page);
                record('ops-settings-workflow-hash-review', {tabs: await tabsOf(page), url: page.url()});
                // Author: the wizard's steps rail on the draft, walked to its last step.
                await signInAs(page, sc.users.au);
                await page.goto(wizard(sc.draft)); await idle(page);
                await page.locator('.pkpSteps__step__label--current').first().waitFor({timeout: 30000});
                const st = await wizardSteps(page);
                record('ops-wizard-steps', st);
                await snap(page, 'ops-wizard-first-step');
                const footer = page.locator('.submissionWizard__footer');
                for (let i = 0; i < 8; i++) {
                    const cont = footer.getByRole('button', {name: 'Continue', exact: true});
                    if (!(await cont.count())) break;
                    await cont.click(); await idle(page);
                }
                const last = await wizardSteps(page);
                last.panels = await page.locator('main h2, main h3').allInnerTexts().catch(() => []);
                record('ops-wizard-last-step-info', last);
                await snap(page, 'ops-wizard-last-step');
                log('[ops wizard]', JSON.stringify(st.steps), '| last:', JSON.stringify(last.panels));
                // Moderator (OPS's sub-editor) and manager: the workflow screen of a posted preprint.
                await signInAs(page, sc.users.mgr);
                await page.goto(workflow(sc.s1)); await idle(page);
                await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000});
                await idle(page);
                const info = await wfInfo(page);
                record('ops-workflow-manager-info', {info, dialogs: await dialogTexts(page)});
                await snap(page, 'ops-workflow-manager');
                log('[ops workflow]', JSON.stringify(info.headings), 'panel:', info.panelHeadingPresent);
                await signOut(page);
            } finally { await close(); }
        }
        if (on('base')) {
            const {page, close} = await launch(app);
            try {
                await signInAs(page, 'manager.maya', app.contextPath);
                await gotoWorkflowSettings(page, baseUrl('/management/settings/workflow'));
                record('ops-base-settings-workflow-tabs', {tabs: await tabsOf(page)});
                await snap(page, 'ops-base-settings-workflow');
                await signOut(page);
            } finally { await close(); }
        }
        return;
    }

    // ---- OJS/OMP: the setting, default off → on through the screen (lines 15–16, 45)
    if (on('setting')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await gotoReviewSetup(page, ctxUrl('/management/settings/workflow'));
            const before = await readSetup(page);
            record('setting-off-setup', {tabs: await tabsOf(page), box: before});
            await snap(page, 'setting-off-setup');
            await loc(page, 'Review › Setup: the "Reviewer Suggestion at Submission" box', setupPanel(page).locator('input[name="reviewerSuggestionEnabled"]'));
            log('[setting before]', app.name, JSON.stringify(before));
            // Leave the tab with the box changed and unsaved: what asks on the way out?
            await setupPanel(page).locator('input[name="reviewerSuggestionEnabled"]').click();
            const dialogsSeen = [];
            page.on('dialog', (d) => { dialogsSeen.push({type: d.type(), message: d.message()}); d.dismiss().catch(() => {}); });
            await page.getByRole('tab', {name: 'Submission', exact: true}).first().click(); await idle(page);
            const leaveDialogs = await dialogTexts(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            const afterReturn = await readSetup(page);
            record('setting-leave-unsaved', {browserDialogs: dialogsSeen, pageDialogs: leaveDialogs, boxAfterReturn: afterReturn});
            await page.reload(); await idle(page);
            await gotoReviewSetup(page, ctxUrl('/management/settings/workflow'));
            record('setting-after-reload-unsaved', await readSetup(page));

            // Author: the wizard with the setting off.
            await signInAs(page, sc.users.au);
            await page.goto(wizard(sc.draft)); await idle(page);
            await page.locator('.pkpSteps__step__label--current').first().waitFor({timeout: 30000});
            const offSteps = await wizardSteps(page);
            record('wizard-off-steps', offSteps);
            await snap(page, 'wizard-off');
            log('[wizard off]', app.name, JSON.stringify(offSteps.steps));

            // Manager switches it on through the screen.
            await signInAs(page, sc.users.mgr);
            await gotoReviewSetup(page, ctxUrl('/management/settings/workflow'));
            const box = setupPanel(page).locator('input[name="reviewerSuggestionEnabled"]');
            if (!(await box.isChecked())) await box.click();
            const st = [];
            page.on('response', (r) => { if (/\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET') st.push({m: r.request().method(), s: r.status()}); });
            await setupPanel(page).getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 30000}).catch(() => {});
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            record('setting-on-save', {responses: st, box: await readSetup(page)});
            await snap(page, 'setting-on-saved');
            await page.reload(); await idle(page);
            await gotoReviewSetup(page, ctxUrl('/management/settings/workflow'));
            const after = await readSetup(page);
            record('setting-on-after-reload', after);
            log('[setting after]', app.name, JSON.stringify(after));
            sc.settingOn = !!after?.checked; save();

            // Author: the wizard with the setting on; walk to the step, record it.
            await signInAs(page, sc.users.au);
            await page.goto(wizard(sc.draft)); await idle(page);
            await page.locator('.pkpSteps__step__label--current').first().waitFor({timeout: 30000});
            const onSteps = await wizardSteps(page);
            record('wizard-on-steps', onSteps);
            await snap(page, 'wizard-on');
            log('[wizard on]', app.name, JSON.stringify(onSteps.steps));
            const footer = page.locator('.submissionWizard__footer');
            const current = page.locator('.pkpSteps__step__label--current');
            for (let i = 0; i < 6; i++) {
                const label = (await current.first().innerText()).trim();
                if (/Reviewer Suggestions/.test(label)) break;
                await footer.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
            }
            await snap(page, 'wizard-on-step');
            record('wizard-on-step-info', {...(await wizardSteps(page)), buttons: await page.locator('main button:visible').allInnerTexts().catch(() => [])});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- seed2: the submissions (needs the setting on)
    if (on('seed2') && !sc.s1) {
        const t = sc.tag; const u = sc.users;
        const sugg = [
            {givenName: 'Xavier', familyName: 'Noaccount', email: `xavier.${t}@mail.test`, affiliation: 'Nowhere U', suggestionReason: 'Knows the field.'},
            {givenName: 'Rowan', familyName: 'Reviewer', email: `${u.rev}@mail.test`, affiliation: 'Reviewer U', suggestionReason: 'Has reviewed for us before.'},
        ];
        const parts = (extra) => [{username: u.fc, role: 'funding'}, {username: u.se, role: 'sectionEditor'}, ...(u.ge ? [{username: u.ge, role: 'guestEditor'}] : []), ...(extra || [])];
        const s1 = await app.api.createSubmission({tag: `${t}s1`, context: sc.contextPath, submitter: u.au, title: `K1 S1 suggestions ${t}`, reviewerSuggestions: sugg, participants: parts()});
        const s0 = await app.api.createSubmission({tag: `${t}s0`, context: sc.contextPath, submitter: u.au, title: `K1 S0 none ${t}`, participants: parts()});
        const r1 = await app.api.createSubmission({tag: `${t}r1`, context: sc.contextPath, submitter: u.au, title: `K1 R1 review suggestions ${t}`, decisions: ['sendExternalReview'], reviewerSuggestions: sugg, participants: parts()});
        const r0 = await app.api.createSubmission({tag: `${t}r0`, context: sc.contextPath, submitter: u.au, title: `K1 R0 review none ${t}`, decisions: ['sendExternalReview'], participants: parts()});
        Object.assign(sc, {s1: s1.submissionId, s0: s0.submissionId, r1: r1.submissionId, r0: r0.submissionId, r1Rounds: r1.reviewRounds, s1Sugg: s1.reviewerSuggestions, r1Sugg: r1.reviewerSuggestions});
        save();
        log('[seed2]', app.name, JSON.stringify({s1: sc.s1, s0: sc.s0, r1: sc.r1, r0: sc.r0, rounds: sc.r1Rounds}));
    }

    // Close the topmost window with its own form button ("Cancel" at the bottom of a legacy form, else the last "Close"), never Escape (pitfall 7).
    async function closeTop(page) {
        const top = page.locator('[role="dialog"]:visible').last();
        let btn = top.getByRole('button', {name: 'Cancel', exact: true}).last();
        if (!(await btn.count())) btn = top.getByRole('button', {name: /^(Close|OK)$/}).last();
        await loc(page, 'topmost window: the button that closes it', btn);
        if (await btn.count()) { await btn.click(); await idle(page); }
        return page.locator('[role="dialog"]:visible').count();
    }
    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        // A Vue panel fetching after mount: give the page a moment to settle, then read.
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label);
        record(`${label}-info`, {url: page.url(), info, dialogs, status: s.error || null});
        log(`[${label}]`, app.name, 'panel:', info.panelHeadingPresent, 'more:', info.moreActions.length, 'dialogs:', dialogs.length, JSON.stringify(dialogs.map((d) => (d.text || '').slice(0, 80))));
        return {info, dialogs};
    }
    // Every editorial level: Submission stage of S1 and Review stage of R1.
    async function editorialPair(page, who, label) {
        await sect(`${label} S1`, () => openWorkflow(page, workflow(sc.s1), `${label}-s1-submission`));
        await sect(`${label} R1`, () => openWorkflow(page, workflow(sc.r1, REVIEW_KEY), `${label}-r1-review`));
    }
    async function driveRowMenu(page, label) {
        // The participants list has "<name> More Actions" buttons too: scope to the suggestion rows by name.
        const more = page.getByRole('button', {name: /(Xavier Noaccount|Rowan Reviewer) More Actions/}).first();
        await more.waitFor({timeout: 15000});
        await loc(page, 'panel row "…" menu ("<full name> More Actions")', more);
        await more.click(); await idle(page);
        const items = await page.locator('[role="menu"]:visible, [role="menuitem"]:visible').evaluateAll((els) => els.filter((e) => e.getAttribute('role') === 'menuitem').map((e) => ({text: e.textContent.trim(), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'})));
        record(`${label}-row-menu`, {items});
        await snap(page, `${label}-row-menu`);
        log(`[${label} menu]`, app.name, JSON.stringify(items));
        const add = page.getByRole('menuitem', {name: /Add Reviewer/}).first();
        if (await add.count()) {
            await add.click(); await idle(page);
            const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
            await dlg.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            record(`${label}-add-reviewer-window-info`, {dialogs: await dialogTexts(page), fields: await dlg.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, type: e.type}))).catch(() => [])});
            await snap(page, `${label}-add-reviewer-window`);
            await closeTop(page);
            record(`${label}-after-close`, {dialogs: await dialogTexts(page), info: await wfInfo(page)});
        }
    }

    if (on('editorial')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            await signInAs(page, u.mgr);
            await editorialPair(page, u.mgr, 'manager');
            await sect('manager menu', () => driveRowMenu(page, 'manager-r1'));
            // The Submission stage of R1 (a submission already in review) and the Review stage of S1 (not yet in review).
            await sect('manager R1 submission stage', () => openWorkflow(page, workflow(sc.r1, 'workflow_1'), 'manager-r1-submission'));
            await sect('manager S1 review key', () => openWorkflow(page, workflow(sc.s1, REVIEW_KEY), 'manager-s1-reviewkey'));
            await sect('manager S0', () => openWorkflow(page, workflow(sc.s0), 'manager-s0-submission'));
            await sect('manager R0', () => openWorkflow(page, workflow(sc.r0, REVIEW_KEY), 'manager-r0-review'));
            await signInAs(page, u.ed);
            await editorialPair(page, u.ed, 'editor');
            await signInAs(page, u.se);
            await editorialPair(page, u.se, 'sectioneditor');
            await sect('se menu', () => driveRowMenu(page, 'sectioneditor-r1'));
            if (u.ge) {
                await signInAs(page, u.ge);
                await editorialPair(page, u.ge, 'guesteditor');
            }
            await signInAs(page, 'admin');
            await editorialPair(page, 'admin', 'siteadmin');
            await signOut(page);
        } finally { await close(); }
    }

    if (on('menu')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            const reviewKey = `workflow_3_${(sc.r1Rounds && sc.r1Rounds[0] && sc.r1Rounds[0].id) || 1}`;
            for (const [who, label] of [[u.mgr, 'manager'], [u.se, 'sectioneditor'], ['admin', 'siteadmin']]) {
                await signInAs(page, who);
                await sect(`${label} S1 row menu`, async () => {
                    await openWorkflow(page, workflow(sc.s1), `${label}-s1-menucheck`);
                    record(`${label}-s1-rowmenu`, {count: await page.getByRole('button', {name: /(Xavier Noaccount|Rowan Reviewer) More Actions/}).count()});
                });
                await sect(`${label} R1 row menu`, async () => {
                    await openWorkflow(page, workflow(sc.r1, reviewKey), `${label}-r1-menucheck`);
                    await driveRowMenu(page, `${label}-r1`);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    if (on('author')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            await signInAs(page, u.au);
            await sect('author S1', () => openWorkflow(page, mySub(sc.s1), 'author-s1-submission'));
            await sect('author R1', () => openWorkflow(page, mySub(sc.r1, REVIEW_KEY), 'author-r1-review'));
            await sect('author R1 editorial url', () => openWorkflow(page, workflow(sc.r1, REVIEW_KEY), 'author-r1-editorial-url'));
            await signOut(page);
        } finally { await close(); }
    }

    if (on('others')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            for (const [who, label] of [[u.au2, 'otherauthor'], [u.rev, 'reviewer'], [u.rd, 'reader']]) {
                await signInAs(page, who);
                await sect(`${label} S1`, () => openWorkflow(page, workflow(sc.s1), `${label}-s1-editorial-url`));
                await sect(`${label} draft wizard`, async () => {
                    await page.goto(wizard(sc.draft)); await idle(page);
                    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                    const s = await snap(page, `${label}-draft-wizard-url`);
                    record(`${label}-draft-wizard-url-info`, {url: s.url, title: s.title, steps: await wizardSteps(page).catch(() => null)});
                    log(`[${label} wizard url]`, app.name, s.url, s.title);
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- A1: the Funding Coordinator (lines 46, 48, 290–299)
    if (on('fc')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            await signInAs(page, u.fc);
            await snap(page, 'fc-dashboard');
            for (const [id, key, label] of [[sc.s1, null, 'fc-s1-submission'], [sc.s0, null, 'fc-s0-submission'], [sc.r1, REVIEW_KEY, 'fc-r1-review'], [sc.r0, REVIEW_KEY, 'fc-r0-review']]) {
                await sect(label, async () => {
                    const {dialogs} = await openWorkflow(page, workflow(id, key), label);
                    // Dismiss the topmost dialog if one sits over the workflow screen, then read the stage again.
                    if (dialogs.length > 1) {
                        const top = page.locator('[role="dialog"]:visible').last();
                        const btn = top.getByRole('button').last();
                        record(`${label}-dismiss-button`, {name: await btn.innerText().catch(() => null), all: await top.getByRole('button').allInnerTexts().catch(() => [])});
                        await btn.click(); await idle(page);
                        const after = {info: await wfInfo(page), dialogs: await dialogTexts(page)};
                        record(`${label}-after-dismiss`, after);
                        await snap(page, `${label}-after-dismiss`);
                        log(`[${label} after dismiss]`, app.name, 'dialogs:', after.dialogs.length, 'panel:', after.info.panelHeadingPresent);
                    }
                });
            }
            // Line 48: the Funding Coordinator opens Add Reviewer on the Review stage; what does the window offer?
            await sect('fc add reviewer', async () => {
                await openWorkflow(page, workflow(sc.r1, REVIEW_KEY), 'fc-r1-review-again');
                if ((await page.locator('[role="dialog"]:visible').count()) > 1) { await page.locator('[role="dialog"]:visible').last().getByRole('button').last().click(); await idle(page); }
                const addBtn = page.getByRole('button', {name: 'Add Reviewer', exact: true});
                await loc(page, 'review stage: "Add Reviewer" button (funding coordinator)', addBtn);
                if (!(await addBtn.count())) { record('fc-add-reviewer-absent', {buttons: await page.locator('[role=dialog] button:visible').allInnerTexts().catch(() => [])}); return; }
                await addBtn.click(); await idle(page);
                const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
                await dlg.waitFor({timeout: 30000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
                await idle(page);
                const text = await dlg.innerText();
                record('fc-add-reviewer-window-info', {dialogs: await dialogTexts(page), hasSuggestionList: /Select a Reviewer from Reviewer Suggestions/.test(text), headings: await dlg.locator('h1,h2,h3,h4').allInnerTexts().catch(() => [])});
                await snap(page, 'fc-add-reviewer-window');
                log('[fc add reviewer]', app.name, 'suggestion list:', /Select a Reviewer from Reviewer Suggestions/.test(text));
                // "Select Reviewer" on the suggestion whose person has an account with the Reviewer role, then on the one without.
                for (const [who, label] of [['Rowan Reviewer', 'fc-select-account'], ['Xavier Noaccount', 'fc-select-noaccount']]) {
                    const item = dlg.locator('.listPanel__item').filter({hasText: who}).first();
                    if (!(await item.count())) { record(`${label}-absent`, {text: text.slice(0, 2000)}); continue; }
                    // The button reads "Select Reviewer" but its accessible name is "Select undefined" (recorded in the row's text): match by role and prefix.
                    const sel = item.getByRole('button', {name: /^Select/}).first();
                    await loc(page, `suggestion "${who}": Select Reviewer (accessible name recorded in fc-select-*-info)`, sel);
                    record(`${label}-button`, {names: await item.getByRole('button').evaluateAll((els) => els.map((e) => ({ariaLabel: e.getAttribute('aria-label'), text: e.innerText.trim()})))});
                    if (!(await sel.count())) { record(`${label}-nobutton`, {itemText: await item.innerText()}); continue; }
                    await sel.click(); await idle(page);
                    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 60; }, null, {timeout: 15000}).catch(() => {});
                    await idle(page);
                    const ds = await dialogTexts(page);
                    record(`${label}-info`, {dialogs: ds});
                    await snap(page, label);
                    log(`[${label}]`, app.name, JSON.stringify(ds.map((d) => (d.text || '').slice(0, 120))));
                    // Back out without sending anything: close the topmost window(s) down to the workflow screen.
                    for (let i = 0; i < 3; i++) {
                        if ((await page.locator('[role="dialog"]:visible').count()) <= 1) break;
                        await closeTop(page);
                    }
                    // Re-open Add Reviewer for the second pass.
                    if ((await page.locator('[role="dialog"]:visible').count()) === 1 && label === 'fc-select-account') {
                        await addBtn.click(); await idle(page);
                        await dlg.waitFor({timeout: 30000});
                        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
                        await idle(page);
                    }
                }
                record('fc-after-select-passes', {dialogs: await dialogTexts(page), info: await wfInfo(page)});
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- fcselect2: the Funding Coordinator's "Select Reviewer" on the suggestion without an account, from a fresh Add Reviewer window
    if (on('fcselect2')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            const reviewKey = `workflow_3_${(sc.r1Rounds && sc.r1Rounds[0] && sc.r1Rounds[0].id) || 1}`;
            await signInAs(page, u.fc);
            await openWorkflow(page, workflow(sc.r1, reviewKey), 'fc2-r1-review');
            if ((await page.locator('[role="dialog"]:visible').count()) > 1) { await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK'}).click(); await idle(page); }
            const addBtn = page.getByRole('button', {name: 'Add Reviewer', exact: true});
            await addBtn.click(); await idle(page);
            const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
            await dlg.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const item = dlg.locator('.listPanel__item').filter({hasText: 'Xavier Noaccount'}).first();
            await item.waitFor({timeout: 15000});
            await item.getByRole('button', {name: /^Select/}).first().click(); await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 60; }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            record('fc2-select-noaccount-info', {dialogs: await dialogTexts(page)});
            await snap(page, 'fc2-select-noaccount');
            log('[fc2 noaccount]', app.name, JSON.stringify((await dialogTexts(page)).map((d) => (d.text || '').slice(0, 200))));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- fccreate: the Funding Coordinator presses the Create New Reviewer form's own "Add Reviewer" (what the role would do next)
    if (on('fccreate')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            const reviewKey = `workflow_3_${(sc.r1Rounds && sc.r1Rounds[0] && sc.r1Rounds[0].id) || 1}`;
            await signInAs(page, u.fc);
            await openWorkflow(page, workflow(sc.r1, reviewKey), 'fc3-r1-review');
            if ((await page.locator('[role="dialog"]:visible').count()) > 1) { await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK'}).click(); await idle(page); }
            await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click(); await idle(page);
            const dlg = page.getByRole('dialog', {name: /Add Reviewer/i}).last();
            await dlg.waitFor({timeout: 30000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const item = dlg.locator('.listPanel__item').filter({hasText: 'Xavier Noaccount'}).first();
            await item.waitFor({timeout: 15000});
            await item.getByRole('button', {name: /^Select/}).first().click(); await idle(page);
            const form = page.locator('[role="dialog"]:visible').last();
            await form.getByRole('button', {name: 'Suggest', exact: true}).waitFor({timeout: 30000});
            await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
            await form.getByRole('button', {name: 'Suggest', exact: true}).click(); await idle(page);
            const username = await form.locator('input[name="username"]').inputValue().catch(() => null);
            const st = [];
            const onR = (r) => { if (r.status() >= 400 || /reviewer-grid|updateReviewer|createReviewer/.test(r.url())) st.push({m: r.request().method(), s: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200)}); };
            page.on('response', onR);
            const submit = form.getByRole('button', {name: 'Add Reviewer', exact: true}).last();
            await loc(page, 'Create New Reviewer form: its "Add Reviewer" button (funding coordinator)', submit);
            await submit.click();
            await page.waitForResponse((r) => /reviewer-grid|reviewer\/reviewer-grid/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            page.off('response', onR);
            const ds = await dialogTexts(page);
            record('fc3-create-submit-info', {username, responses: st, dialogs: ds, notices: await page.locator('[role=status], [role=alert], .pkpNotification, .pkp_notification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim())).catch(() => [])});
            await snap(page, 'fc3-create-submit');
            log('[fc3 create submit]', app.name, JSON.stringify(st), JSON.stringify(ds.map((d) => (d.text || '').slice(0, 160))));
            // Close whatever is open and read the stage once more: the Reviewers table and the suggestions panel.
            for (let i = 0; i < 3; i++) { if ((await page.locator('[role="dialog"]:visible').count()) <= 1) break; await closeTop(page); }
            await openWorkflow(page, workflow(sc.r1, reviewKey), 'fc3-r1-review-after');
            if ((await page.locator('[role="dialog"]:visible').count()) > 1) { await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'OK'}).click(); await idle(page); }
            record('fc3-reviewers-after', {reviewers: await page.getByRole('table', {name: 'Reviewers', exact: true}).innerText().catch(() => null)});
            await signOut(page);
        } finally { await close(); }
    }

    // ---- t1: the manager and the section editor on an author's draft (line 45)
    if (on('t1')) {
        const {page, close} = await launch(app);
        try {
            const u = sc.users;
            await signInAs(page, u.mgr);
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const views = await page.locator('button:visible, a:visible').allInnerTexts().catch(() => []);
            record('t1-dashboard-views', {buttonsAndLinks: views.map((v) => v.replace(/\s+/g, ' ').trim()).filter(Boolean), bodyHasIncomplete: await page.evaluate(() => /Incomplete/i.test(document.body.innerText))});
            await snap(page, 't1-dashboard');
            // The Incomplete view, if the dashboard has one.
            const inc = page.getByRole('button', {name: /Incomplete/i}).or(page.getByRole('link', {name: /Incomplete/i})).first();
            let opened = null;
            if (await inc.count()) {
                await inc.click(); await idle(page);
                await snap(page, 't1-incomplete-view');
                const row = page.locator('tr, li, [role=row]').filter({hasText: `K1 draft ${sc.tag}`}).first();
                if (await row.count()) {
                    const buttons = await row.getByRole('button').allInnerTexts().catch(() => []);
                    const links = await row.getByRole('link').allInnerTexts().catch(() => []);
                    record('t1-incomplete-row', {buttons, links, text: await row.innerText()});
                    const view = row.getByRole('button', {name: /View/}).or(row.getByRole('link', {name: /View/})).first();
                    if (await view.count()) {
                        await view.click(); await idle(page);
                        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                        opened = await snap(page, 't1-incomplete-view-opened');
                        record('t1-incomplete-view-opened-info', {url: opened.url, dialogs: await dialogTexts(page), steps: await wizardSteps(page).catch(() => null)});
                    }
                }
            } else {
                record('t1-incomplete-view', {absent: true, views});
            }
            // Typed straight in: the wizard address of the author's draft.
            for (const [who, label] of [[u.mgr, 'manager'], [u.se, 'sectioneditor']]) {
                await signInAs(page, who);
                await sect(`${label} wizard url`, async () => {
                    await page.goto(wizard(sc.draft)); await idle(page);
                    await page.locator('.pkpSteps__step__label--current, main').first().waitFor({timeout: 30000}).catch(() => {});
                    await idle(page);
                    const s = await snap(page, `t1-${label}-wizard-url`);
                    const steps = await wizardSteps(page).catch(() => null);
                    let stepInfo = null;
                    if (steps && steps.steps.some((x) => /Reviewer Suggestions/.test(x))) {
                        const footer = page.locator('.submissionWizard__footer');
                        const current = page.locator('.pkpSteps__step__label--current');
                        for (let i = 0; i < 6; i++) {
                            const l = (await current.first().innerText()).trim();
                            if (/Reviewer Suggestions/.test(l)) break;
                            await footer.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
                        }
                        stepInfo = {...(await wizardSteps(page)), buttons: await page.locator('main button:visible').allInnerTexts().catch(() => [])};
                        await snap(page, `t1-${label}-wizard-step`);
                    }
                    record(`t1-${label}-wizard-url-info`, {url: s.url, title: s.title, steps, stepInfo});
                    log(`[t1 ${label}]`, app.name, s.url, JSON.stringify(steps && steps.steps));
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- t1b: the manager reaches the author's draft from the dashboard's "All in submission stage" view (no "Incomplete" view exists)
    if (on('t1b')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            const view = page.getByText(/All in submission stage/).first();
            await loc(page, 'Editor Dashboard: "All in submission stage" view', view);
            await view.click({timeout: 15000}).catch(async () => { await page.getByText(/Active submissions/).first().click(); }); await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, 't1b-submission-stage-view');
            const row = page.getByRole('row').filter({hasText: `K1 draft ${sc.tag}`}).first();
            const found = await row.count();
            record('t1b-draft-row', {found, text: found ? await row.innerText() : null, buttons: found ? await row.getByRole('button').allInnerTexts() : [], links: found ? await row.getByRole('link').allInnerTexts() : []});
            log('[t1b row]', app.name, found, found ? (await row.innerText()).replace(/\s+/g, ' ').slice(0, 200) : '');
            if (found) {
                // The draft's row offers "Complete submission" (no "View"): press what it offers.
                const view2 = row.getByRole('button', {name: /View|Complete submission/}).or(row.getByRole('link', {name: /View|Complete submission/})).first();
                if (await view2.count()) {
                    await view2.click(); await idle(page);
                    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                    await idle(page);
                    const s2 = await snap(page, 't1b-draft-opened');
                    record('t1b-draft-opened-info', {url: s2.url, dialogs: await dialogTexts(page), steps: await wizardSteps(page).catch(() => null)});
                    log('[t1b opened]', app.name, s2.url);
                }
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- fcbase: the seeded Funding Coordinator on the seeded journal (setting off), read-only: does a dialog open on a stage?
    if (on('fcbase')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, 'assistant.rita', app.contextPath);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, 'fcbase-dashboard');
            const view = page.getByRole('button', {name: /View/}).first();
            if (await view.count()) {
                await view.click(); await idle(page);
                await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                const info = await wfInfo(page);
                const dialogs = await dialogTexts(page);
                record('fcbase-workflow-info', {url: page.url(), info, dialogs});
                await snap(page, 'fcbase-workflow');
                log('[fcbase]', app.name, 'dialogs:', dialogs.length, JSON.stringify(dialogs.map((d) => (d.text || '').slice(0, 100))), 'headings:', JSON.stringify(info.headings));
            } else {
                record('fcbase-workflow-info', {noRows: true});
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- fcoff: the control for A1 — a Funding Coordinator on a scratch journal with the setting OFF
    if (on('fcoff')) {
        if (!sc.offContextPath) {
            const t = tag('u31k1o');
            const ctx = await app.api.createContext({tag: t, context: {name: `U31 K1 off ${t}`, acronym: 'U31K1O'}, users: [
                {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: `${t}fc`, roles: ['funding'], givenName: 'Fay', familyName: 'Funding'},
            ]});
            sc.offContextPath = ctx.path || t; sc.offTag = t;
            const s = await app.api.createSubmission({tag: `${t}s`, context: sc.offContextPath, submitter: `${t}au`, title: `K1 off S ${t}`, participants: [{username: `${t}fc`, role: 'funding'}]});
            const r = await app.api.createSubmission({tag: `${t}r`, context: sc.offContextPath, submitter: `${t}au`, title: `K1 off R ${t}`, decisions: ['sendExternalReview'], participants: [{username: `${t}fc`, role: 'funding'}]});
            sc.offS = s.submissionId; sc.offR = r.submissionId; sc.offRounds = r.reviewRounds; save();
        }
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${sc.offTag}fc`, {contextPath: sc.offContextPath}); await idle(page);
            const off = (id, key) => app.url(`/index.php/${sc.offContextPath}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
            await sect('fcoff S', () => openWorkflow(page, off(sc.offS), 'fcoff-s-submission'));
            await sect('fcoff R', () => openWorkflow(page, off(sc.offR, `workflow_3_${(sc.offRounds && sc.offRounds[0] && sc.offRounds[0].id) || 1}`), 'fcoff-r-review'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- reviewstep: the wizard's Review step as the author, with the setting on (line 18: the "Reviewer Suggestions" panel there)
    if (on('reviewstep')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.au);
            await page.goto(wizard(sc.draft)); await idle(page);
            await page.locator('.pkpSteps__step__label--current').first().waitFor({timeout: 30000});
            const footer = page.locator('.submissionWizard__footer');
            const current = page.locator('.pkpSteps__step__label--current');
            for (let i = 0; i < 8; i++) {
                const label = (await current.first().innerText()).trim();
                if (/^\d*\s*Review$/.test(label)) break;
                const cont = footer.getByRole('button', {name: 'Continue', exact: true});
                if (!(await cont.count())) break;
                await cont.click(); await idle(page);
            }
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const s2 = await snap(page, 'wizard-review-step');
            record('wizard-review-step-info', {url: s2.url, headings: await page.locator('main h2, main h3').allInnerTexts().catch(() => []), buttons: await page.locator('main button:visible').allInnerTexts().catch(() => [])});
            log('[review step]', app.name, JSON.stringify(await page.locator('main h2, main h3').allInnerTexts().catch(() => [])));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- base: the seeded journal's default (read-only)
    if (on('base')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, 'manager.maya', app.contextPath);
            await gotoReviewSetup(page, baseUrl('/management/settings/workflow'));
            record('base-setting-info', {tabs: await tabsOf(page), box: await readSetup(page)});
            await snap(page, 'base-setting');
            await signOut(page);
        } finally { await close(); }
    }
});
