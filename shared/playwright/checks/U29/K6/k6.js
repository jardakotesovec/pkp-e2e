// U29 claim check, chunk K6: the "Reviewer Recommendations" side tab of
// Settings › Workflow › "Review" on OJS, its effects on the reviewer's wizard
// and the editor's review windows, and the tab's absence on a press (OMP).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Fields "Reviewer
// Recommendations" (lines 108–122), Rules 17–18 (341–371), Side effects
// "Recommendation actions" (387–392), scenarios 9–10 (540–557), register A6
// (635–645) and OMP1 (649–655).
//
// Seeds its own scratch journal (OJS: manager, author, three external
// reviewers accepted on one submission) and scratch press (OMP: manager,
// author, one reviewer accepted) and records every screen with screen().
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK6 node bin/probe.js all shared/playwright/checks/U29/K6/k6.js
//   PHASES=seed,a,rev,b,c,c2,close,rd,lang,omp   (default: all; later phases reuse k6-scratch-<app>.json)
//
// Phase a: the table as installed, the Add window and its refusals, add/edit/
//          toggle (scenario 9's manager half, Rule 17).
// Phase rev: the reviewers' step 3 (scenario 9's reviewer half); rev2 saves a
//          choice for later, rev1 submits with the custom entry.
// Phase b: the entry in use (Rule 18, scenario 10, A6 deactivated end), the
//          reviewers' lists with the entry deactivated (Rule 17's exception).
// Phase c: reactivated end of A6.
// Phase c2: A6's deactivated end read again, Delete of the unused custom row,
//          a default edited and deleted, reload, a fresh reviewer's list.
// Phase close: the table after a window is closed with "Close" and nothing saved.
// Phase rd: the Reviewers row's "Review Details" window.
// Phase lang: a second form language and the window's title boxes.
// Phase omp: the seeded press's "Review" side tabs and a press reviewer's step 3.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'a', 'rev', 'b', 'c', 'c2', 'close', 'rd', 'lang', 'omp'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const scratchFile = (app) => path.join(outDir(), `k6-scratch-${app.name}.json`);
const texts = async (l) => (await l.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
const TYPE_WORDS = ['Approved', 'Not Approved', 'Revisions Requested', 'With Comments'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

forEachApp(async (app) => {
    if (app.name === 'ops') return; // no "Review" tab on a preprint server (K7's screen)
    const facts = {app: app.name, browserDialogs: [], steps: {}};
    const scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    const full = async (name) => { let d; try { d = await screen(page); } catch (e) { d = {url: page.url(), error: String(e.message)}; } record(`${name}-${app.name}`, d); await shot(page, `${name}-${app.name}`).catch(() => {}); return d; };
    const dlg = () => page.locator('[role="dialog"]:visible').last();
    const waitModal = () => page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const noModal = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const modalInfo = async () => {
        const d = dlg();
        if (!(await d.isVisible().catch(() => false))) return null;
        return {title: await texts(d.locator('h1, h2, h3, [class*="title"]').first()).catch(() => []), text: (await d.innerText()).trim().slice(0, 1500), buttons: await texts(d.locator('button:visible, a.pkp_button:visible'))};
    };
    const pressModal = async (name) => { await dlg().getByRole('button', {name, exact: true}).last().click(); await idle(page); };
    const notices = () => page.locator('.pkpNotification, .pkp_notification, [role="alert"], [role="status"]').filter({visible: true}).allInnerTexts().then((a) => a.map((s) => s.trim()).filter(Boolean)).catch(() => []);
    const mailCounts = async (users) => { const out = {total: await app.mail.messageCount().catch(() => null)}; for (const u of Object.values(users)) out[u] = await app.mail.count({to: `${u}@mail.test`}).catch(() => null); return out; };

    // ---- the manager's table
    const mgrRoot = () => page.locator('[data-cy="reviewer-recommendation-manager"]');
    const openTab = async (ctxPath) => {
        await page.goto(app.url(`/index.php/${ctxPath}/management/settings/workflow`)); await idle(page);
        await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
        await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).click(); await idle(page);
        await mgrRoot().locator('tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
    };
    const tableState = async () => mgrRoot().evaluate((root) => ({
        title: [...root.querySelectorAll('h1,h2,h3,h4')].map((h) => h.innerText.trim()),
        buttons: [...root.querySelectorAll('button')].filter((b) => !b.closest('tbody')).map((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label')})),
        columns: [...root.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...root.querySelectorAll('tbody tr')].map((tr) => ({
            title: (tr.querySelector('th, td') || {}).innerText?.trim(),
            cells: [...tr.querySelectorAll('td, th')].map((td) => td.innerText.trim()),
            checked: tr.querySelector('input[type=checkbox]')?.checked ?? null,
            menu: [...tr.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
        })),
        typeWords: ['Approved', 'Not Approved', 'Revisions Requested', 'With Comments'].filter((w) => new RegExp(`\\b${w}\\b`).test(root.innerText)),
    }));
    const rowByTitle = (title) => mgrRoot().locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^${esc(title)}$`)})}).first();
    const openMenu = async (title) => {
        const row = rowByTitle(title);
        const btn = row.getByRole('button', {name: 'More Actions'});
        if (!(await btn.count())) return {present: false, items: []};
        for (let i = 0; i < 2; i++) {
            if (await page.locator('[role="menuitem"]:visible').count()) break; // already open (focus returns to the trigger after a window closes)
            await btn.click();
            const opened = await page.waitForFunction(() => document.querySelector('[role="menuitem"]'), null, {timeout: 4000}).then(() => true).catch(() => false);
            if (opened) break;
        }
        return {present: true, items: await texts(page.locator('[role="menuitem"]:visible'))};
    };
    const formInfo = async () => dlg().evaluate((d) => {
        const lab = (el) => { const l = el.id ? d.querySelector(`label[for="${el.id}"]`) : null; return (l ? l.innerText : (el.closest('label') || {}).innerText || '').trim(); };
        return {
            title: [...d.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()),
            labels: [...d.querySelectorAll('label, legend, .pkpFormField__label, .pkpFormField__description, .pkpFormFieldLabel')].map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean),
            text: d.innerText.trim().replace(/\n+/g, ' / ').slice(0, 2000),
            inputs: [...d.querySelectorAll('input:not([type=hidden]), select, textarea')].map((i) => ({tag: i.tagName, type: i.type, name: i.name, value: i.value, label: lab(i), required: i.required || i.getAttribute('aria-required'), visible: i.offsetParent !== null,
                options: i.tagName === 'SELECT' ? [...i.options].map((o) => ({value: o.value, text: o.text, selected: o.selected})) : undefined})),
            buttons: [...d.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label'), disabled: b.disabled})),
            errors: (d.innerText.match(/This field is required\.|Please correct \d+ errors?\.|Jump to next error/g) || []),
            saveDisabled: [...d.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'Save').map((b) => b.disabled),
            localeSwitch: [...d.querySelectorAll('.pkpFormLocales button, .pkpFormLocales span')].map((e) => e.innerText.trim()).filter(Boolean),
        };
    });
    const fillForm = async ({title, type, status}) => {
        const d = dlg();
        if (title !== undefined) { const i = d.locator('input[name="title-en"]').first(); await i.fill(''); await i.fill(title); }
        if (type) await d.locator('select[name="type"]').first().selectOption({label: type});
        if (status) await d.locator('select[name="status"]').first().selectOption({label: status});
    };
    const saveForm = async (label) => {
        const seen = [];
        const onR = (r) => { if (/\/api\/v1\//.test(r.url()) && r.request().method() !== 'GET') seen.push({m: r.request().method(), u: r.url().replace(/^.*\/api\/v1\//, ''), s: r.status()}); };
        page.on('response', onR);
        const saveBtn = dlg().getByRole('button', {name: 'Save', exact: true}).last();
        if (await saveBtn.isDisabled().catch(() => false)) {
            page.off('response', onR);
            const info = await formInfo().catch(() => null);
            await full(label);
            return {saveDisabled: true, responses: seen, windowStillOpen: true, form: info, noticeNow: [], noticeAfter: []};
        }
        await saveBtn.click();
        await page.waitForResponse((r) => /\/api\/v1\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 6000}).catch(() => {});
        await idle(page); page.off('response', onR);
        const noticeNow = await notices();
        await noModal();
        const still = (await page.locator('[role="dialog"]:visible').count()) > 0;
        const info = still ? await formInfo().catch(() => null) : null;
        await full(label);
        return {responses: seen, windowStillOpen: still, form: info, noticeNow, noticeAfter: await notices()};
    };
    const closeWindow = async () => { await dlg().getByRole('button', {name: 'Close'}).first().click().catch(() => {}); await noModal(); await idle(page); };
    const toggle = async (title, label) => {
        const row = rowByTitle(title);
        const before = await row.locator('input[type=checkbox]').isChecked();
        await row.locator('input[type=checkbox]').click();
        await waitModal();
        await full(label);
        return {before, modal: await modalInfo(), checkedWhileAsked: await row.locator('input[type=checkbox]').isChecked()};
    };
    const waitRow = (title, checked) => page.waitForFunction(({title, checked}) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === title && tr.querySelector('input[type=checkbox]')?.checked === checked), {title, checked}, {timeout: 10000}).catch(() => {});
    const rowsBrief = (t) => t.rows.map((r) => `${r.title}${r.checked ? ' ✓' : ' ☐'}${r.menu.length ? '' : ' (no menu)'}`);

    // ---- the reviewer's wizard
    const gotoStep3 = async (ctxPath, subId) => {
        await page.goto(app.url(`/index.php/${ctxPath}/reviewer/submission/${subId}?step=3`)); await idle(page);
        await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
        const onStep = async () => (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
        if (!(await onStep()).startsWith('3')) {
            const sc = page.getByRole('button', {name: 'Save and continue'});
            if (await sc.count()) { await sc.first().click(); await idle(page); }
            const c3 = page.getByRole('button', {name: /Continue to Step #3/});
            if (await c3.count()) { await c3.first().click(); await idle(page); }
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3'), null, {timeout: 30000}).catch(() => {});
        }
        return onStep();
    };
    const recList = async () => {
        const main = page.locator('main');
        const rec = main.locator('select[name="reviewerRecommendationId"], select[name="recommendation"]').first();
        if (!(await rec.count())) return {present: false, headingRecommendation: /\bRecommendation\b/.test(await main.innerText()), selects: await main.locator('select').evaluateAll((ss) => ss.map((s) => s.name))};
        return {present: true, ...(await rec.evaluate((s) => ({name: s.name, required: s.required, options: [...s.options].map((o) => ({value: o.value, text: o.text, selected: o.selected}))}))),
            typeWords: await page.evaluate((words) => words.filter((w) => new RegExp(`\\b${w}\\b`).test(document.body.innerText)), TYPE_WORDS)};
    };

    // ---- the review stage
    const openReviewStage = async (ctxPath, subId) => {
        await page.goto(app.url(`/index.php/${ctxPath}/dashboard/editorial?workflowSubmissionId=${subId}`)); await idle(page);
        await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click({timeout: 8000}).catch(() => {});
        const revTable = page.getByRole('table', {name: 'Reviewers', exact: true});
        await revTable.waitFor({timeout: 30000}); await idle(page);
        return revTable;
    };
    const waitWindowLoaded = async () => {
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).pop(); return d && !/Loading/.test(d.innerText) && /Reviewer rating/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).pop(); return d && /For author and editor|For editor/.test(d.innerText); }, null, {timeout: 8000}).catch(() => {});
    };
    const windowInfo = async () => dlg().evaluate((d) => {
        const t = d.innerText;
        return {title: [...d.querySelectorAll('h1,h2,h3')].map((h) => h.innerText.trim()), text: t.trim().slice(0, 4000),
            buttons: [...d.querySelectorAll('button, a.pkp_button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim() || b.getAttribute('aria-label')),
            hasReviewSubmittedLine: /Review Submitted:/.test(t), hasRecommendationLine: /Recommendation:/.test(t),
            recommendationSection: (t.match(/Recommendation\n+([^\n]*)/) || [])[1] || null,
            typeWords: ['Approved', 'Not Approved', 'Revisions Requested', 'With Comments'].filter((w) => new RegExp(`\\b${w}\\b`).test(t))};
    });
    const readReview = async (revTable, who, label) => {
        const row = revTable.getByRole('row').filter({hasText: new RegExp(who)}).first();
        const cells = await row.locator('td, th').allInnerTexts();
        await row.getByRole('button', {name: 'Read Review', exact: true}).first().click();
        await waitWindowLoaded(); await idle(page);
        await full(label);
        const info = await windowInfo();
        await dlg().getByRole('button', {name: /^Close$/}).first().click().catch(async () => { await page.keyboard.press('Escape'); });
        await noModal(); await idle(page);
        return {rowCells: cells.map((s) => s.trim()), window: info};
    };

    try {
        // =================================================================== OMP
        if (app.name === 'omp') {
            if (!on('omp')) return;
            // the seeded press: the "Review" tab's side tabs
            await signIn(page, 'manager.maya', {contextPath: app.contextPath}); await idle(page);
            await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`)); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            await full('omp1-review-tab');
            const panel = page.getByRole('tabpanel', {name: 'Review', exact: true}).first();
            facts.steps.omp1 = {url: page.url(), sideTabs: await texts(panel.locator('[role="tab"]:visible')), topTabs: await texts(page.locator('main').getByRole('tablist').first().getByRole('tab')), recommendationInMain: /Recommendation/.test(await page.locator('main').innerText())};
            await loc(page, 'OMP Settings › Workflow › Review side tabs', panel.locator('[role="tab"]'));
            log(`[omp1] side tabs ${JSON.stringify(facts.steps.omp1.sideTabs)} mention: ${facts.steps.omp1.recommendationInMain}`);
            // a scratch press: the reviewer's step 3
            if (!scratch.tag) {
                const t = tag('u29k6');
                const U = {mgr: `${t}mgr`, au: `${t}au`, rev1: `${t}rev1`};
                const ctx = await app.api.createContext({tag: t, users: [
                    {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                    {username: U.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                    {username: U.rev1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'}]});
                const s1 = await app.api.createSubmission({tag: `${t}s1`, context: ctx.path || t, submitter: U.au, title: `K6 press sub ${t}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: U.rev1, status: 'accepted'}]}]});
                Object.assign(scratch, {tag: t, path: ctx.path || t, users: U, sub1: s1.submissionId}); saveScratch();
            }
            await signIn(page, scratch.users.rev1, {contextPath: scratch.path}); await idle(page);
            facts.steps.omp1_step = await gotoStep3(scratch.path, scratch.sub1);
            await full('omp1-reviewer-step3');
            facts.steps.omp1_reviewerList = await recList();
            facts.steps.omp1_step3Headings = await texts(page.locator('main h1, main h2, main h3, main h4, main legend'));
            log(`[omp1] step ${facts.steps.omp1_step} list: ${JSON.stringify(facts.steps.omp1_reviewerList)}`);
            return;
        }

        // =================================================================== OJS
        if (on('seed') && !scratch.tag) {
            const t = tag('u29k6');
            const U = {mgr: `${t}mgr`, au: `${t}au`, rev1: `${t}rev1`, rev2: `${t}rev2`, rev3: `${t}rev3`};
            const ctx = await app.api.createContext({tag: t, users: [
                {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: U.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: U.rev1, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
                {username: U.rev2, roles: ['externalReviewer'], givenName: 'Sasha', familyName: 'Second'},
                {username: U.rev3, roles: ['externalReviewer'], givenName: 'Tamsin', familyName: 'Third'}]});
            const s1 = await app.api.createSubmission({tag: `${t}s1`, context: ctx.path || t, submitter: U.au, title: `K6 sub ${t}`, decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: U.rev1, status: 'accepted'}, {username: U.rev2, status: 'accepted'}, {username: U.rev3, status: 'accepted'}]}]});
            Object.assign(scratch, {tag: t, path: ctx.path || t, users: U, sub1: s1.submissionId}); saveScratch();
            log(`[seed ojs] ctx=${scratch.path} sub1=${scratch.sub1}`);
        }
        const {path: ctxPath, users: U, sub1} = scratch;

        // ---------------------------------------------------------------- phase a
        if (on('a')) {
            const a = facts.steps.a = {};
            a.mailBefore = await mailCounts(U);
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await openTab(ctxPath);
            await full('a-tab-installed');
            a.url = page.url();
            a.sideTabs = await texts(page.getByRole('tabpanel', {name: 'Review', exact: true}).first().locator('[role="tab"]:visible'));
            a.installed = await tableState();
            await loc(page, 'Reviewer Recommendations manager root', mgrRoot());
            await loc(page, '"Add Recommendation" button', mgrRoot().getByRole('button', {name: 'Add Recommendation'}));
            log(`[a] installed: ${JSON.stringify(rowsBrief(a.installed))} cols ${JSON.stringify(a.installed.columns)} title ${JSON.stringify(a.installed.title)}`);
            a.menuDefault = await openMenu('Accept Submission');
            await full('a-menu-default');
            await page.keyboard.press('Escape'); await idle(page);
            // the Add window, empty save, title-only save
            await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).click(); await waitModal(); await idle(page);
            await full('a-add-window');
            a.addWindow = await formInfo();
            await loc(page, 'Add Recommendation window', dlg());
            a.saveEmpty = await saveForm('a-save-empty');
            log(`[a] save empty: ${JSON.stringify({resp: a.saveEmpty.responses, open: a.saveEmpty.windowStillOpen, errors: a.saveEmpty.form?.errors})}`);
            await fillForm({title: 'Accept with minor changes'});
            a.saveNoType = await saveForm('a-save-no-type');
            log(`[a] save without type: ${JSON.stringify({disabled: a.saveNoType.saveDisabled, resp: a.saveNoType.responses, open: a.saveNoType.windowStillOpen, errors: a.saveNoType.form?.errors})}`);
            // scenario 9: the custom entry
            await fillForm({type: 'Approved'});
            a.statusBeforeSave = await dlg().locator('select[name="status"]').evaluate((s) => s.options[s.selectedIndex]?.text);
            a.add1 = await saveForm('a-add1-saved');
            if (a.add1.windowStillOpen) await closeWindow();
            a.afterAdd1 = await tableState();
            log(`[a] after add1: ${JSON.stringify(rowsBrief(a.afterAdd1))} notice ${JSON.stringify(a.add1.noticeNow)}`);
            // a second custom entry, deactivated on save
            await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).click(); await waitModal(); await idle(page);
            await fillForm({title: 'Park it', type: 'With Comments', status: 'Deactivate'});
            a.add2 = await saveForm('a-add2-saved');
            if (a.add2.windowStillOpen) await closeWindow();
            a.afterAdd2 = await tableState();
            log(`[a] after add2: ${JSON.stringify(rowsBrief(a.afterAdd2))}`);
            // scenario 9: untick "See Comments" › Yes
            a.toggleSeeComments = await toggle('See Comments', 'a-deactivate-dialog');
            await pressModal('Yes');
            await waitRow('See Comments', false);
            await full('a-after-deactivate');
            a.afterDeactivate = await tableState();
            a.noticeAfterDeactivate = await notices();
            log(`[a] after deactivate: ${JSON.stringify(rowsBrief(a.afterDeactivate))} dialog ${JSON.stringify(a.toggleSeeComments.modal)}`);
            // untick "Decline Submission" › No
            a.toggleNo = await toggle('Decline Submission', 'a-deactivate-no-dialog');
            await pressModal('No');
            await full('a-after-no');
            a.afterNo = await tableState();
            // tick "Park it" › the activate dialog › No (the row stays unticked, order unchanged)
            a.activateDialog = await toggle('Park it', 'a-activate-dialog');
            await pressModal('No');
            a.afterActivateNo = await tableState();
            log(`[a] activate dialog ${JSON.stringify(a.activateDialog.modal)} rows ${JSON.stringify(rowsBrief(a.afterActivateNo))}`);
            a.mailAfter = await mailCounts(U);
            await signOut(page).catch(() => {});
        }

        // -------------------------------------------------------------- phase rev
        if (on('rev')) {
            const r = facts.steps.rev = {};
            // rev1: scenario 9's reviewer half
            await signIn(page, U.rev1, {contextPath: ctxPath}); await idle(page);
            r.rev1Step = await gotoStep3(ctxPath, sub1);
            await full('rev1-step3');
            r.rev1List = await recList();
            await loc(page, 'Reviewer wizard step 3: "Recommendation" list', page.locator('main select[name="reviewerRecommendationId"]'));
            log(`[rev] rev1 step ${r.rev1Step} list: ${JSON.stringify(r.rev1List.options?.map((o) => o.text))}`);
            // rev2: choose the custom entry and save for later
            await signIn(page, U.rev2, {contextPath: ctxPath}); await idle(page);
            r.rev2Step = await gotoStep3(ctxPath, sub1);
            const rec2 = page.locator('main select[name="reviewerRecommendationId"]').first();
            await rec2.selectOption({label: 'Accept with minor changes'});
            r.rev2Buttons = await texts(page.locator('main button:visible, main a.pkp_button:visible, main input[type=submit]:visible'));
            await page.getByRole('button', {name: /Save for Later/i}).first().click(); await idle(page);
            await full('rev2-saved-for-later');
            r.rev2AfterSave = {url: page.url(), step: (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim(), notices: await notices()};
            log(`[rev] rev2 buttons ${JSON.stringify(r.rev2Buttons)} after save ${JSON.stringify(r.rev2AfterSave)}`);
            // rev1: submit with the custom entry
            await signIn(page, U.rev1, {contextPath: ctxPath}); await idle(page);
            await gotoStep3(ctxPath, sub1);
            const rec1 = page.locator('main select[name="reviewerRecommendationId"]').first();
            await rec1.selectOption({label: 'Accept with minor changes'});
            const main = page.locator('main');
            const ta = main.locator('textarea:visible').first();
            if (await ta.count()) await ta.fill('Comment from the K6 check.');
            else { await page.frameLocator('main iframe').first().locator('body').click(); await page.keyboard.type('Comment from the K6 check.'); }
            await page.getByRole('button', {name: 'Submit Review'}).first().click();
            await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null && /sure|submit/i.test(e.innerText)), null, {timeout: 8000}).catch(() => {});
            await full('rev1-submit-confirm');
            r.submitConfirm = await modalInfo();
            if (r.submitConfirm) await pressModal('OK');
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('4'), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            const s4 = await full('rev1-after-submit');
            r.afterSubmit = {url: page.url(), step: (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim(), head: (s4.text?.main || '').slice(0, 300)};
            log(`[rev] rev1 after submit: ${JSON.stringify(r.afterSubmit)}`);
            await signOut(page).catch(() => {});
        }

        // ---------------------------------------------------------------- phase b
        if (on('b')) {
            const b = facts.steps.b = {};
            b.mailBefore = await mailCounts(U);
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await openTab(ctxPath);
            await full('b-tab-in-use');
            b.table = await tableState();
            b.menuInUse = await openMenu('Accept with minor changes');
            b.menuUnused = await openMenu('Park it');
            await full('b-menu-unused');
            await page.keyboard.press('Escape'); await idle(page);
            log(`[b] rows ${JSON.stringify(rowsBrief(b.table))} inUse menu ${JSON.stringify(b.menuInUse)} unused ${JSON.stringify(b.menuUnused)}`);
            // the tick still works: No, then Yes
            b.toggleNo = await toggle('Accept with minor changes', 'b-deactivate-dialog-no');
            await pressModal('No');
            b.afterNo = await tableState();
            b.toggleYes = await toggle('Accept with minor changes', 'b-deactivate-dialog');
            await pressModal('Yes');
            await waitRow('Accept with minor changes', false);
            await full('b-after-deactivate');
            b.afterDeactivate = await tableState();
            b.noticeAfterDeactivate = await notices();
            log(`[b] after deactivate ${JSON.stringify(rowsBrief(b.afterDeactivate))}`);
            // the review stage while deactivated
            const revTable = await openReviewStage(ctxPath, sub1);
            await full('b-review-stage-deactivated');
            b.reviewersTable = await revTable.innerText();
            b.readReviewDeactivated = await readReview(revTable, 'Rowan', 'b-read-review-deactivated');
            await loc(page, 'Reviewers row "Read Review" button', revTable.getByRole('row').filter({hasText: /Rowan/}).first().getByRole('button', {name: 'Read Review', exact: true}));
            log(`[b] Read Review (deactivated): ${JSON.stringify({cells: b.readReviewDeactivated.rowCells, lines: [b.readReviewDeactivated.window.hasReviewSubmittedLine, b.readReviewDeactivated.window.hasRecommendationLine], section: b.readReviewDeactivated.window.recommendationSection, types: b.readReviewDeactivated.window.typeWords})}`);
            b.mailAfter = await mailCounts(U);
            // the reviewers' lists while deactivated: rev3 has not chosen, rev2 carries it
            await signIn(page, U.rev3, {contextPath: ctxPath}); await idle(page);
            b.rev3Step = await gotoStep3(ctxPath, sub1);
            await full('b-rev3-step3-deactivated');
            b.rev3List = await recList();
            await signIn(page, U.rev2, {contextPath: ctxPath}); await idle(page);
            b.rev2Step = await gotoStep3(ctxPath, sub1);
            await full('b-rev2-step3-deactivated');
            b.rev2List = await recList();
            log(`[b] rev3 list ${JSON.stringify(b.rev3List.options?.map((o) => o.text))}\n[b] rev2 list ${JSON.stringify(b.rev2List.options?.map((o) => `${o.text}${o.selected ? '*' : ''}`))}`);
            await signOut(page).catch(() => {});
        }

        // ---------------------------------------------------------------- phase c
        if (on('c')) {
            const c = facts.steps.c = {};
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await openTab(ctxPath);
            c.reactivate = await toggle('Accept with minor changes', 'c-activate-dialog');
            await pressModal('Yes');
            await waitRow('Accept with minor changes', true);
            await full('c-after-reactivate');
            c.afterReactivate = await tableState();
            log(`[c] activate dialog ${JSON.stringify(c.reactivate.modal)} rows ${JSON.stringify(rowsBrief(c.afterReactivate))}`);
            const revTable = await openReviewStage(ctxPath, sub1);
            c.readReviewActive = await readReview(revTable, 'Rowan', 'c-read-review-active');
            log(`[c] Read Review (active): ${JSON.stringify({cells: c.readReviewActive.rowCells, lines: [c.readReviewActive.window.hasReviewSubmittedLine, c.readReviewActive.window.hasRecommendationLine], section: c.readReviewActive.window.recommendationSection})}`);
            await signOut(page).catch(() => {});
        }

        // --------------------------------------------------------------- phase c2
        if (on('c2')) {
            const c = facts.steps.c2 = {};
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await openTab(ctxPath);
            // A6, second read of the deactivated end with a longer wait for the window to fill in
            c.deactivateAgain = await toggle('Accept with minor changes', 'c2-deactivate-dialog');
            await pressModal('Yes');
            await waitRow('Accept with minor changes', false);
            c.afterDeactivate = await tableState();
            const revTable2 = await openReviewStage(ctxPath, sub1);
            await full('c2-review-stage-deactivated');
            c.readReviewDeactivated2 = await readReview(revTable2, 'Rowan', 'c2-read-review-deactivated');
            log(`[c2] Read Review (deactivated, 2nd read): ${JSON.stringify({cells: c.readReviewDeactivated2.rowCells, lines: [c.readReviewDeactivated2.window.hasReviewSubmittedLine, c.readReviewDeactivated2.window.hasRecommendationLine], text: c.readReviewDeactivated2.window.text.slice(0, 700)})}`);
            await openTab(ctxPath);
            c.reactivateAgain = await toggle('Accept with minor changes', 'c2-activate-dialog');
            await pressModal('Yes');
            await waitRow('Accept with minor changes', true);
            // scenario 10: Edit on the unused custom row, then Delete › Yes
            await openMenu('Park it');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await waitModal(); await idle(page);
            await full('c-edit-window');
            c.editWindow = await formInfo();
            await closeWindow();
            c.menuAfterEdit = await openMenu('Park it');
            await full('c2-menu-after-edit');
            log(`[c2] menu right after the Edit window closed: ${JSON.stringify(c.menuAfterEdit)} visible menuitems ${await page.locator('[role="menuitem"]:visible').count()}`);
            if (!c.menuAfterEdit.items.includes('Delete')) { await page.keyboard.press('Escape'); await openTab(ctxPath); c.menuAfterEditRetry = await openMenu('Park it'); }
            await page.getByRole('menuitem', {name: 'Delete', exact: true}).first().click(); await waitModal(); await idle(page);
            await full('c-delete-dialog');
            c.deleteDialog = await modalInfo();
            await pressModal('Yes');
            await page.waitForFunction(() => ![...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => /^Park it$/.test((tr.querySelector('th, td') || {}).innerText?.trim())), null, {timeout: 10000}).catch(() => {});
            await full('c-after-delete');
            c.afterDelete = await tableState();
            c.noticeAfterDelete = await notices();
            log(`[c] delete dialog ${JSON.stringify(c.deleteDialog)} rows ${JSON.stringify(rowsBrief(c.afterDelete))}`);
            // a default entry edited, another deleted
            await openMenu('Resubmit Elsewhere');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await waitModal(); await idle(page);
            c.editDefaultWindow = await formInfo();
            await fillForm({title: 'Resubmit Elsewhere (edited)'});
            c.editDefault = await saveForm('c-edit-default-saved');
            if (c.editDefault.windowStillOpen) await closeWindow();
            c.afterEditDefault = await tableState();
            await openMenu('Resubmit for Review');
            await page.getByRole('menuitem', {name: 'Delete', exact: true}).first().click(); await waitModal(); await idle(page);
            c.deleteDefaultDialog = await modalInfo();
            await pressModal('Yes');
            await page.waitForFunction(() => ![...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => /^Resubmit for Review$/.test((tr.querySelector('th, td') || {}).innerText?.trim())), null, {timeout: 10000}).catch(() => {});
            await full('c-after-delete-default');
            c.afterDeleteDefault = await tableState();
            log(`[c] after default edit ${JSON.stringify(rowsBrief(c.afterEditDefault))} after default delete ${JSON.stringify(rowsBrief(c.afterDeleteDefault))}`);
            await page.reload(); await idle(page);
            await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).click().catch(() => {}); await idle(page);
            await mgrRoot().locator('tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
            await full('c-after-reload');
            c.afterReload = await tableState();
            c.mailAfter = await mailCounts(U);
            // rev3's list follows the table's order
            await signIn(page, U.rev3, {contextPath: ctxPath}); await idle(page);
            await gotoStep3(ctxPath, sub1);
            await full('c-rev3-step3-final');
            c.rev3List = await recList();
            log(`[c] table ${JSON.stringify(rowsBrief(c.afterReload))}\n[c] rev3 ${JSON.stringify(c.rev3List.options?.map((o) => o.text))}`);
            await signOut(page).catch(() => {});
        }

        // ------------------------------------------------------------- phase close
        // What the table offers after a window is closed with "Close" and nothing saved.
        if (on('close')) {
            const k = facts.steps.close = {};
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await openTab(ctxPath);
            const probeTable = async (label) => {
                const state = await page.evaluate(() => {
                    const main = document.querySelector('main');
                    const hiddenAncestor = (el) => { for (let e = el; e; e = e.parentElement) { if (e.getAttribute('aria-hidden') === 'true' || e.hasAttribute('inert')) return {tag: e.tagName, id: e.id, cls: e.className?.toString().slice(0, 80), ariaHidden: e.getAttribute('aria-hidden'), inert: e.hasAttribute('inert')}; } return null; };
                    return {
                        dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => ({visible: d.offsetParent !== null, text: d.innerText.trim().slice(0, 60), cls: d.className?.toString().slice(0, 80)})),
                        mainHidden: hiddenAncestor(main),
                        moreActionsButtons: [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody button[aria-label="More Actions"]')].length,
                        checkboxes: [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody input[type=checkbox]')].length,
                        activeElement: document.activeElement && {tag: document.activeElement.tagName, text: document.activeElement.innerText?.trim().slice(0, 40), aria: document.activeElement.getAttribute('aria-label')},
                    };
                });
                state.byRole = await mgrRoot().getByRole('button', {name: 'More Actions'}).count();
                state.addByRole = await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).count();
                await full(label);
                return state;
            };
            k.before = await probeTable('close-before');
            // Add window › Close
            await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).click(); await waitModal(); await idle(page);
            await dlg().getByRole('button', {name: 'Close', exact: true}).first().click(); await noModal(); await idle(page);
            k.afterAddClose = await probeTable('close-after-add-close');
            log(`[close] after Add › Close: ${JSON.stringify(k.afterAddClose)}`);
            // can the table be used? click the tick of "See Comments" by CSS and see whether the dialog comes
            const cb = mgrRoot().locator('tbody tr').filter({hasText: 'See Comments'}).first().locator('input[type=checkbox]');
            k.cssClick = await cb.click({timeout: 5000, trial: true}).then(() => 'clickable').catch((e) => `blocked: ${String(e.message).split('\n')[0]}`);
            // keyboard: Tab from the body and see where focus goes
            await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
            k.afterTabs = await page.evaluate(() => ({tag: document.activeElement?.tagName, text: document.activeElement?.innerText?.trim().slice(0, 40), aria: document.activeElement?.getAttribute('aria-label'), inDialog: !!document.activeElement?.closest('[role="dialog"]')}));
            // Edit window › Close (via a fresh tab)
            await openTab(ctxPath);
            await openMenu('See Comments');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await waitModal(); await idle(page);
            await dlg().getByRole('button', {name: 'Close', exact: true}).first().click(); await noModal(); await idle(page);
            k.afterEditClose = await probeTable('close-after-edit-close');
            k.cssClickAfterEdit = await cb.click({timeout: 5000, trial: true}).then(() => 'clickable').catch((e) => `blocked: ${String(e.message).split('\n')[0]}`);
            log(`[close] after Edit › Close: ${JSON.stringify(k.afterEditClose)} css ${k.cssClickAfterEdit}`);
            // and after a successful save from the same window (control)
            await openTab(ctxPath);
            await openMenu('See Comments');
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await waitModal(); await idle(page);
            await fillForm({title: 'See Comments'});
            k.saveControl = await saveForm('close-after-edit-save');
            k.afterEditSave = await probeTable('close-after-edit-save-table');
            log(`[close] after Edit › Save: ${JSON.stringify(k.afterEditSave)}`);
            await signOut(page).catch(() => {});
        }

        // ---------------------------------------------------------------- phase rd
        // The "Review Details" menu entry's window (the entry active).
        if (on('rd')) {
            const d = facts.steps.rd = {};
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            const revTable = await openReviewStage(ctxPath, sub1);
            const row = revTable.getByRole('row').filter({hasText: /Rowan/}).first();
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.waitForFunction(() => document.querySelector('[role="menuitem"]'), null, {timeout: 5000}).catch(() => {});
            d.rowMenu = await texts(page.locator('[role="menuitem"]:visible'));
            await page.getByRole('menuitem', {name: 'Review Details', exact: true}).first().click();
            await waitWindowLoaded(); await idle(page);
            await full('rd-review-details');
            d.window = await windowInfo();
            log(`[rd] menu ${JSON.stringify(d.rowMenu)} window ${JSON.stringify({title: d.window.title, lines: [d.window.hasReviewSubmittedLine, d.window.hasRecommendationLine], types: d.window.typeWords, section: (d.window.text.match(/Recommendation\n+([^\n]*)/g) || [])})}`);
            await dlg().getByRole('button', {name: /^Close$/}).first().click().catch(() => {}); await noModal();
            await signOut(page).catch(() => {});
        }

        // -------------------------------------------------------------- phase lang
        if (on('lang')) {
            const l = facts.steps.lang = {};
            await signIn(page, U.mgr, {contextPath: ctxPath}); await idle(page);
            await page.goto(app.url(`/index.php/${ctxPath}/management/settings/website`)); await idle(page);
            await page.locator('#setup-button').click(); await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 30000});
            const fr = page.locator('input[id*="fr_CA-formLocale"]').first();
            l.frFormsBefore = await fr.isChecked().catch(() => null);
            if (l.frFormsBefore === false) { await fr.click(); await idle(page); }
            l.frFormsAfter = await fr.isChecked().catch(() => null);
            await full('lang-languages');
            await openTab(ctxPath);
            await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).click(); await waitModal(); await idle(page);
            await full('lang-add-window');
            l.addWindow = await formInfo();
            l.titleBoxes = await dlg().locator('input[name^="title-"]').evaluateAll((is) => is.map((i) => ({name: i.name, visible: i.offsetParent !== null})));
            const frBtn = dlg().locator('.pkpFormLocales button').first();
            if (await frBtn.count()) { await frBtn.click(); await idle(page); await full('lang-add-window-fr'); l.titleBoxesFr = await dlg().locator('input[name^="title-"]').evaluateAll((is) => is.map((i) => ({name: i.name, visible: i.offsetParent !== null}))); }
            log(`[lang] boxes ${JSON.stringify(l.titleBoxes)} switch ${JSON.stringify(l.addWindow.localeSwitch)} fr ${JSON.stringify(l.titleBoxesFr)}`);
            await closeWindow();
            await signOut(page).catch(() => {});
        }
        note(`[ccK6 ojs] scratch ${scratch.tag} (manager ${U.mgr}, reviewers ${U.rev1} submitted / ${U.rev2} saved for later / ${U.rev3} untouched on sub ${sub1}). The reviewer's step 3 opens straight from \`/reviewer/submission/{id}?step=3\` once the request is accepted; "Save for Later" keeps the chosen recommendation. Wait for a toggled row's checkbox state (waitForFunction on the tbody) before reading the table — the redraw lags the dialog's "Yes".`);
    } catch (e) {
        facts.error = String(e && e.stack || e);
        log(`[error ${app.name}]`, facts.error.slice(0, 900));
        await full('k6-error').catch(() => {});
    } finally {
        record(`k6-facts-${PHASES.join('_')}-${app.name}`, facts);
        await signOut(page).catch(() => {});
        await close();
    }
});
