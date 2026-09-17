// Sync claim check S17 — U27 Rules 3, 14a, 14b, scenario 16 and register A24 after pkp/pkp-lib#13338
// (issue #13337): the "Review Details" window and its "Modify Review" / "Mark as Complete" on reviewer
// rows whose review is NOT submitted (request sent, accepted, declined), beside the submitted-review
// control (scenario 16), the publicly visible end of the save ("Save changes to this review?") and a
// cancelled row's menu. Built from the regression reader's probes (.reports/sync/rr8/probe-1.js, -2.js).
//
//   PROBE_FEATURE=sync PROBE_AGENT=ccS17 node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13338/s17.js
//   S17_LEGS=reach,declined …   runs only the named legs (the seed and the sign-ins always run)
//
// One scratch context per app per run; publicknowledge and the roster are never touched. OPS mounts no
// review stage (the spec's absence paragraph), so the script skips it. No assertions: every screen is
// recorded with screen() as <leg>-<step>-<app>.json and judged against the spec lines by the reader.
const {forEachApp, launch, signIn, signOut, screen, record, shot, idle, tag, loc} = require('../../../probe');

const log = (...a) => console.log(...a);
const fold = (s) => (s || '').replace(/\s+/g, ' ').trim();
const ONLY = (process.env.S17_LEGS || '').split(',').map((s) => s.trim()).filter(Boolean);

forEachApp(async (app) => {
    if (app.name === 'ops') {
        log('ops: no review stage, nothing to drive');
        return;
    }
    const {ReviewWizardPage} = require('../../../pages/ReviewerPages');
    const T = tag('s17k');
    const isOmp = app.name === 'omp';
    const isOjs = app.name === 'ojs';
    const N = {
        r1: 'Una Unanswered', r2: 'Ace Accepted', r3: 'Cora Completed', r4: 'Dex Declined', r5: 'Ivy Invited',
        r6: 'Cal Cancelled', r7: 'Rae Assisted', r8: 'Pia Public', r9: 'Sol Sectioned', r10: 'Max Marked', r11: 'Fern Formed',
    };
    const U = {mgr: `${T}mgr`, sed: `${T}sed`, fund: `${T}fund`, au: `${T}au`};
    for (const k of Object.keys(N)) U[k] = `${T}${k}`;
    const mk = (k) => ({username: U[k], roles: ['externalReviewer'], givenName: N[k].split(' ')[0], familyName: N[k].split(' ')[1]});
    const FORM = `S17 form ${T}`;
    const ctx = await app.api.createContext({
        tag: T,
        reviewForms: [{title: FORM, elements: [
            {question: 'Is the argument sound?', type: 'textarea', required: true},
            {question: 'Optional remark', type: 'smalltextfield', required: false},
        ]}],
        users: [
            {username: U.mgr, roles: ['manager'], givenName: 'Mona', familyName: 'Managerova'},
            {username: U.sed, roles: ['sectionEditor'], givenName: 'Sed', familyName: 'Sectionova'},
            {username: U.fund, roles: ['funding'], givenName: 'Fay', familyName: 'Fundova'},
            {username: U.au, roles: ['author'], givenName: 'Ada', familyName: 'Authoress'},
            ...Object.keys(N).map(mk),
        ],
    });
    const TITLE = `S17 ${T}`;
    const sub = await app.api.createSubmission({
        tag: T, context: T, submitter: U.au, title: TITLE,
        decisions: [isOmp ? 'skipInternalReview' : 'sendExternalReview'],
        participants: [{username: U.sed, role: 'sectionEditor'}, {username: U.fund, role: 'funding'}],
        reviewRounds: [{...(isOmp ? {stage: 'external'} : {}), reviewers: [
            {username: U.r1, status: 'invited'},
            {username: U.r2, status: 'accepted'},
            {username: U.r3, status: 'accepted'}, // submits through the wizard below, both comment blocks and a file
            {username: U.r4, status: 'declined'},
            {username: U.r5, status: 'invited'},
            {username: U.r6, status: 'accepted'},
            {username: U.r7, status: 'invited'},
            {username: U.r8, status: 'completed', comments: `Public remarks ${T}.`},
            {username: U.r9, status: 'invited'},
            {username: U.r10, status: 'completed', comments: `Remarks to be marked ${T}.`},
            {username: U.r11, status: 'invited', reviewForm: FORM}, // the review-form end: a required question nobody answered
        ]}],
    });
    const sid = sub.submissionId;
    record('seed', {ctx, sub});
    log('seeded', app.name, T, sid);

    const {page, close} = await launch(app);
    // The assignment JSON the Review Details window itself fetches, newest last per reviewer name.
    const seen = {};
    const writes = [];
    page.on('response', async (r) => {
        const u = r.url();
        const m = u.match(/\/reviewAssignments\/(\d+)(\/[a-z]+)?(\?|$)/i);
        if (!m) return;
        const method = r.request().method();
        const over = r.request().headers()['x-http-method-override'];
        if (method !== 'GET') {
            let body = null;
            if (r.status() >= 400) body = await r.text().then((t) => t.slice(0, 600)).catch(() => null);
            writes.push({at: new Date().toISOString(), path: u.replace(/^https?:\/\/[^/]+/, ''), method: over || method, status: r.status(), body});
            return;
        }
        if (r.status() !== 200 || m[2]) return;
        try {
            const j = await r.json();
            (seen[j.reviewerFullName] = seen[j.reviewerFullName] || []).push({at: new Date().toISOString(), id: j.id,
                dateConfirmed: j.dateConfirmed, dateCompleted: j.dateCompleted, step: j.step, statusId: j.statusId, status: j.status,
                declined: j.declined, considered: j.considered, quality: j.quality,
                isReviewPubliclyVisible: j.isReviewPubliclyVisible, lastModifiedBy: j.lastModifiedBy?.userFullName});
        } catch (e) { /* not json */ }
    });
    const lastSeen = (name) => (seen[name] || []).slice(-1)[0] || null;
    const result = {app: app.name, T, sid, legs: {}, errors: {}};
    const snap = async (name) => { const s = await screen(page); record(name, s); return s; };
    const leg = async (name, fn) => {
        if (ONLY.length && !ONLY.includes(name)) return;
        log('LEG', app.name, name);
        try { result.legs[name] = await fn(); } catch (e) {
            result.errors[name] = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
            log('LEG FAILED', name, result.errors[name]);
            await shot(page, `zz-${name}`).catch(() => {});
            await snap(`zz-${name}`).catch(() => {});
        }
        record('result', result);
    };

    const wf = () => page.locator('[data-cy="active-modal"]').first();
    const panel = () => wf().locator('[data-cy="reviewer-manager"]');
    const row = (name) => panel().getByRole('row').filter({hasText: name});
    const details = () => page.getByRole('dialog', {name: /^Review Details:/});
    const editWin = () => page.getByRole('dialog', {name: /^Modify Review/});
    const confirmDlg = (text) => page.locator('[data-cy="dialog"]').filter({hasText: text});
    const toasts = async () => (await page.locator('[role="status"], [role="alert"], .app__notifications li').allInnerTexts()).map(fold).filter(Boolean);

    async function openWorkflow(view = 'editorial') {
        await page.goto(app.url(`/index.php/${T}/en/dashboard/${view}?workflowSubmissionId=${sid}`));
        await wf().getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 30_000});
        await idle(page);
        await panel().getByRole('row').nth(1).waitFor({timeout: 30_000});
    }
    async function readRow(name) {
        const r = row(name);
        if (!(await r.waitFor({timeout: 10_000}).then(() => true).catch(() => false))) return {absent: true};
        const text = fold(await r.innerText());
        const buttons = (await r.getByRole('button').allInnerTexts()).map(fold).filter(Boolean);
        await r.getByRole('button', {name: 'More Actions'}).click();
        const menu = page.getByRole('menu').last();
        await menu.waitFor({timeout: 10_000});
        const items = (await menu.getByRole('menuitem').allInnerTexts()).map(fold);
        // never Escape here: it closes the workflow window too (patterns.md pitfall 7)
        await r.getByRole('button', {name: 'More Actions'}).click();
        await menu.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
        return {text, buttons, menu: items};
    }
    async function readRows(names) {
        const out = {};
        for (const k of names) out[k] = await readRow(N[k]);
        return out;
    }
    async function openDetails(name) {
        const r = row(name);
        await r.getByRole('button', {name: 'More Actions'}).click();
        const menu = page.getByRole('menu').last();
        await menu.getByRole('menuitem', {name: 'Review Details', exact: true}).click();
        await details().waitFor({timeout: 20_000});
        const modify = details().getByRole('button', {name: 'Modify Review', exact: true});
        const present = await modify.waitFor({timeout: 15_000}).then(() => true).catch(() => false);
        if (present) await modify.and(page.locator(':enabled')).waitFor({timeout: 15_000}).catch(() => {});
        await idle(page);
        return present;
    }
    async function footer() {
        const d = details();
        const states = {};
        for (const b of ['Cancel', 'Modify Review', 'Mark as Complete']) {
            const l = d.getByRole('button', {name: b, exact: true});
            states[b] = (await l.count()) ? ((await l.first().isEnabled()) ? 'enabled' : 'disabled') : 'absent';
        }
        const text = fold(await d.innerText());
        // what the window prints between the rating row and the footer buttons (the gate message sits there on a journal)
        const tail = text.slice(Math.max(0, text.lastIndexOf('1 out of 5 stars')));
        return {states, tail, uploads: await d.getByRole('button', {name: /upload/i}).count(), fileInputs: await d.locator('input[type=file]').count()};
    }
    async function closeDetails() {
        await details().getByRole('button', {name: 'Cancel', exact: true}).click();
        await details().waitFor({state: 'hidden', timeout: 20_000});
        await idle(page);
    }
    /** From an open Review Details window: "Modify Review" › the confirm dialog (recorded) › the stacked window (recorded). */
    async function openModify(prefix) {
        await details().getByRole('button', {name: 'Modify Review', exact: true}).click();
        const dlg = confirmDlg('Modify this review?');
        await dlg.waitFor({timeout: 10_000});
        const confirmText = fold(await dlg.innerText());
        const confirmButtons = (await dlg.getByRole('button').allInnerTexts()).map(fold).filter(Boolean);
        if (prefix) await snap(`${prefix}-confirm`);
        await dlg.getByRole('button', {name: 'Modify Review', exact: true}).click();
        await editWin().waitFor({timeout: 20_000});
        const body = editWin().frameLocator('iframe.tox-edit-area__iframe').first().locator('body');
        await body.waitFor({timeout: 30_000});
        await idle(page);
        await page.waitForTimeout(800);
        if (prefix) { await snap(`${prefix}-window`); await shot(page, `${prefix}-window`); }
        const w = editWin();
        const info = {
            confirmText, confirmButtons,
            text: fold(await w.innerText()),
            buttons: (await w.getByRole('button').allInnerTexts()).map(fold).filter(Boolean),
            editors: await w.locator('iframe.tox-edit-area__iframe').count(),
            selects: await w.locator('select').evaluateAll((els) => els.map((e) => ({name: e.name, required: e.required, value: e.value,
                options: [...e.options].map((o) => o.text.trim())}))),
            fileInputs: await w.locator('input[type=file]').count(),
            commentNow: fold(await body.innerText()),
        };
        return info;
    }
    async function typeComment(text) {
        const body = editWin().frameLocator('iframe.tox-edit-area__iframe').first().locator('body');
        await body.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(text);
    }
    /** Press "Save Changes" and wait for what the screen does: the save's response, or a dialog, or nothing. */
    async function pressSave({expectDialog = null} = {}) {
        const before = writes.length;
        const button = editWin().getByRole('button', {name: 'Save Changes', exact: true});
        if (!(await button.isEnabled())) return {saveChangesDisabled: true, editWindowOpen: true};
        const saved = page.waitForResponse((r) => /\/reviewAssignments\/\d+\/review/.test(r.url()) && r.request().method() !== 'GET', {timeout: 12_000})
            .then((r) => ({status: r.status()})).catch(() => null);
        await editWin().getByRole('button', {name: 'Save Changes', exact: true}).click();
        let dialog = null;
        if (expectDialog) {
            const d = confirmDlg(expectDialog);
            if (await d.waitFor({timeout: 8_000}).then(() => true).catch(() => false)) {
                dialog = {text: fold(await d.innerText()), buttons: (await d.getByRole('button').allInnerTexts()).map(fold).filter(Boolean)};
            }
            return {dialog, sentBeforeAnswer: writes.length - before};
        }
        const resp = await saved;
        await idle(page);
        await page.waitForTimeout(600);
        return {resp, write: writes.slice(before), editWindowOpen: await editWin().isVisible().catch(() => false), toasts: await toasts()};
    }
    async function pressMarkComplete(prefix, {confirm = true} = {}) {
        const before = writes.length;
        await details().getByRole('button', {name: 'Mark as Complete', exact: true}).click();
        const dlg = confirmDlg('Mark this review as complete?');
        await dlg.waitFor({timeout: 10_000});
        const out = {dialogText: fold(await dlg.innerText()), dialogButtons: (await dlg.getByRole('button').allInnerTexts()).map(fold).filter(Boolean)};
        await snap(`${prefix}-confirm`);
        if (!confirm) {
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: 10_000});
            return out;
        }
        await dlg.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
        const toast = page.getByText('The review has been marked as complete.').first();
        out.successToast = await toast.waitFor({timeout: 15_000}).then(() => true).catch(() => false);
        out.toasts = await toasts();
        await idle(page);
        await page.waitForTimeout(600);
        out.write = writes.slice(before);
        out.footerAfter = await footer();
        await snap(`${prefix}-after`);
        return out;
    }
    async function reviewerSide(k, prefix) {
        await signIn(page, U[k], {contextPath: T});
        const views = {};
        for (const view of ['reviewer-action-required', 'reviewer-assignments-all', 'reviewer-assignments-completed']) {
            await page.goto(app.url(`/index.php/${T}/en/dashboard/reviewAssignments?currentViewId=${view}`));
            await idle(page);
            await page.locator('main table').getByText(new RegExp(`${TITLE}|No Items`)).first().waitFor({timeout: 20_000}).catch(() => {});
            const r = page.locator('main table').getByRole('row').filter({hasText: TITLE});
            views[view] = (await r.count()) ? {row: fold(await r.first().innerText()), buttons: (await r.first().getByRole('button').allInnerTexts()).map(fold)} : null;
        }
        await page.goto(app.url(`/index.php/${T}/en/reviewer/submission/${sid}`));
        await idle(page);
        await page.locator('#reviewTabs, .ui-tabs').first().waitFor({timeout: 30_000}).catch(() => {});
        await idle(page);
        await snap(`${prefix}-wizard`);
        const tabs = await page.locator('[role="tab"]').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(), selected: e.getAttribute('aria-selected'),
            disabled: e.getAttribute('aria-disabled') || e.classList.contains('ui-state-disabled')})));
        const p = page.locator('[role="tabpanel"]:visible').first();
        const landed = fold(await p.innerText().catch(() => '')).slice(0, 700);
        const btns = await p.locator('button:visible, a.pkp_button:visible, .formButtons a:visible').evaluateAll((els) => els.map((e) => ({text: e.innerText.trim(),
            disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true'})).filter((b) => b.text));
        return {views, tabs, landed, buttons: btns.slice(0, 12)};
    }

    try {
        // 0. R3 submits a review through the wizard: both comment blocks, a file ({OJS}: a recommendation).
        await leg('wizard', async () => {
            await signIn(page, U.r3, {contextPath: T});
            const wiz = new ReviewWizardPage(page, T);
            wiz.contextPath = T;
            await page.goto(app.url(`/index.php/${T}/reviewer/submission/${sid}`));
            await wiz.expectOpen();
            await wiz.saveAndContinueButton.click();
            await wiz.expectStep(2);
            await wiz.continueToStep3();
            await wiz.uploadReviewerFile(`s17-reviewer-${T}.txt`);
            await wiz.typeComments(`Shared remarks ${T}.`);
            await wiz.typePrivateComments(`Private remarks ${T}.`);
            if (isOjs) await wiz.chooseRecommendation('Revisions Required');
            await wiz.submitReview();
            await wiz.expectCompleted();
            return {submitted: true};
        });

        // 1. The other permission levels, read-only: an assigned Section Editor (OMP: Series editor) and a
        //    Funding coordinator. Rows and menus of the unsubmitted states, the window's footer on R9 / R7.
        for (const [who, k] of [['sed', 'r9'], ['fund', 'r7']]) {
            await leg(`level-${who}`, async () => {
                await signIn(page, U[who], {contextPath: T});
                await openWorkflow();
                await snap(`level-${who}-panel`);
                const rows = await readRows(['r1', 'r2', 'r4', k]);
                const out = {rows};
                if (rows[k].menu?.includes('Review Details')) {
                    out.modifyPresent = await openDetails(N[k]);
                    await snap(`level-${who}-details`);
                    out.footer = await footer();
                    await closeDetails();
                }
                return out;
            });
        }
        // 1b. Each of the two levels uses what the window offers on its unanswered request: Modify Review › type ›
        //     Save Changes. The Funding coordinator then presses a rating star and "Mark as Complete" on the
        //     submitted review R10 (on a press also reachable on the unanswered row; R10 serves both apps).
        for (const [who, k] of [['sed', 'r9'], ['fund', 'r7']]) {
            await leg(`level-${who}-modify`, async () => {
                await signIn(page, U[who], {contextPath: T});
                await openWorkflow();
                if (!(await openDetails(N[k]))) return {modifyPresent: false};
                const win = await openModify(`level-${who}-modify`);
                await typeComment(`Remarks typed by ${who} ${T}.`);
                if (isOjs && win.selects.length) await editWin().locator('select').first().selectOption({label: 'Accept Submission'});
                const save = await pressSave();
                await snap(`level-${who}-modify-after-save`);
                await shot(page, `level-${who}-modify-after-save`);
                save.visibleErrors = (await page.locator('.pkpFieldError:visible, [class*="FieldError"]:visible, [role="alert"]:visible').allInnerTexts().catch(() => [])).map(fold).filter(Boolean);
                save.appDialogs = (await page.locator('[data-cy="dialog"]:visible').allInnerTexts()).map(fold);
                for (const d of await page.locator('[data-cy="dialog"]:visible').all()) await d.getByRole('button').last().click().catch(() => {});
                if (await editWin().isVisible().catch(() => false)) {
                    await editWin().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
                    await page.waitForTimeout(800);
                    for (const d of await page.locator('[data-cy="dialog"]:visible').all()) { save.leaveDialog = fold(await d.innerText()); await d.getByRole('button').first().click().catch(() => {}); }
                    await page.waitForTimeout(600);
                }
                const out = {win, save, assignment: lastSeen(N[k])};
                if (!(await details().isVisible().catch(() => false))) { await openWorkflow(); } else { out.detailsAfter = await footer(); await closeDetails(); }
                out.rowAfter = await readRow(N[k]);
                return out;
            });
        }
        await leg('level-fund-complete', async () => {
            await signIn(page, U.fund, {contextPath: T});
            await openWorkflow();
            const out = {rowBefore: await readRow(N.r10)};
            await row(N.r10).getByRole('button', {name: 'Read Review', exact: true}).click();
            await details().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            await snap('level-fund-complete-details');
            out.footerBefore = await footer();
            const n = writes.length;
            const star = details().getByRole('radio', {name: '3 out of 5 stars'});
            await star.click({force: true}).catch((e) => { out.starError = String(e).slice(0, 120); });
            out.ratingToast = await page.getByText('Reviewer rating saved').first().waitFor({timeout: 8_000}).then(() => true).catch(() => false);
            out.ratingWrites = writes.slice(n);
            await snap('level-fund-complete-after-star');
            if (out.footerBefore.states['Mark as Complete'] === 'enabled') out.mark = await pressMarkComplete('level-fund-complete');
            out.after = lastSeen(N.r10);
            if (await details().isVisible().catch(() => false)) await closeDetails();
            out.rowAfter = await readRow(N.r10);
            return out;
        });

        await signIn(page, U.mgr, {contextPath: T});

        // 2. The dashboard list's review indicator › "View details" on an unsubmitted review (Rule 14a's second entry).
        await leg('dashboard', async () => {
            await page.goto(app.url(`/index.php/${T}/en/dashboard/editorial?currentViewId=active`));
            await idle(page);
            const r = page.locator('main table').getByRole('row').filter({hasText: TITLE}).first();
            await r.waitFor({timeout: 30_000});
            await snap('dashboard-list');
            const indicators = r.getByRole('cell').nth(3).getByRole('button');
            const names = [];
            const out = {indicators: names};
            for (let i = 0; i < await indicators.count(); i++) {
                const b = indicators.nth(i);
                names.push(fold(await b.getAttribute('aria-label') || await b.innerText()));
                await b.click();
                await page.waitForTimeout(500);
                const pop = page.locator('[data-headlessui-state="open"] [id^="headlessui-popover-panel"], [id^="headlessui-popover-panel"]').last();
                const text = fold(await pop.innerText().catch(() => ''));
                if (text.includes(N.r8) && !out.submittedPopover) {
                    // the submitted end of the same entry: the popover's button on R8's submitted review
                    out.submittedPopover = text;
                    out.submittedPopoverButtons = (await pop.getByRole('button').allInnerTexts()).map(fold);
                    await snap('dashboard-popover-submitted');
                    const open = pop.getByRole('button', {name: /View unread recommendation|View details|Read/i}).last();
                    out.submittedOpenButton = fold(await open.innerText());
                    await open.click();
                    await details().waitFor({timeout: 20_000});
                    await details().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 15_000}).catch(() => {});
                    await idle(page);
                    await snap('dashboard-details-submitted');
                    out.submittedFooter = await footer();
                    out.submittedDetailsText = fold(await details().innerText()).slice(0, 700);
                    await details().getByRole('button', {name: 'Cancel', exact: true}).click();
                    await details().waitFor({state: 'hidden', timeout: 20_000});
                    await idle(page);
                    continue;
                }
                if (text.includes(N.r1)) {
                    out.popover = text;
                    out.popoverButtons = (await pop.getByRole('button').allInnerTexts()).map(fold);
                    await snap('dashboard-popover');
                    await pop.getByRole('button', {name: 'View details'}).click();
                    await details().waitFor({timeout: 20_000});
                    const mod = details().getByRole('button', {name: 'Modify Review', exact: true});
                    await mod.waitFor({timeout: 15_000}).catch(() => {});
                    out.modifyEnabledWithin15s = await mod.and(page.locator(':enabled')).waitFor({timeout: 15_000}).then(() => true).catch(() => false);
                    await idle(page);
                    await snap('dashboard-details');
                    await shot(page, 'dashboard-details');
                    out.footer = await footer();
                    out.detailsText = fold(await details().innerText()).slice(0, 500);
                    await details().getByRole('button', {name: 'Cancel', exact: true}).click();
                    await details().waitFor({state: 'hidden', timeout: 20_000});
                    await idle(page);
                    out.unsubmittedDone = true;
                }
                if (out.unsubmittedDone && out.submittedPopover) break;
                await page.keyboard.press('Escape');
            }
            return out;
        });

        // 3. Reach: rows, menus and the window in each unsubmitted state, read-only, then the sweep of the window's
        //    other controls on the unanswered row (the "Download Review Form" menu, a rating star).
        await leg('reach', async () => {
            await openWorkflow();
            await snap('reach-panel');
            const out = {};
            for (const k of ['r1', 'r2', 'r4', 'r3']) {
                const state = {r1: 'request sent', r2: 'request accepted', r4: 'request declined', r3: 'review submitted'}[k];
                const before = await readRow(N[k]);
                const entry = {state, row: before};
                if (before.menu?.includes('Review Details')) {
                    entry.modifyPresent = await openDetails(N[k]);
                    await snap(`reach-details-${k}`);
                    await shot(page, `reach-details-${k}`);
                    entry.footer = await footer();
                    entry.assignment = lastSeen(N[k]);
                    if (k === 'r1') {
                        const dl = details().getByRole('button', {name: /Download Review Form/});
                        await dl.click();
                        await page.waitForTimeout(400);
                        entry.downloadMenu = (await page.getByRole('menu').last().getByRole('menuitem').allInnerTexts().catch(() => [])).map(fold);
                        await dl.click();
                        await page.waitForTimeout(300);
                        const star = details().getByRole('radio', {name: '4 out of 5 stars'});
                        await star.click({force: true}).catch((e) => { entry.starError = String(e).slice(0, 120); });
                        entry.ratingToast = await page.getByText('Reviewer rating saved').first().waitFor({timeout: 8_000}).then(() => true).catch(() => false);
                        entry.ratingChecked = await star.isChecked().catch(() => null);
                    }
                    await closeDetails();
                    entry.rowAfterClose = fold(await row(N[k]).innerText());
                }
                out[k] = entry;
            }
            await loc(page, 'Reviewers panel row by reviewer name', row(N.r1));
            return out;
        });

        // 4. "Modify Review" on the unanswered request R1: the dialog and the window as they read with nothing
        //    submitted; leave with something typed and unsaved ("Cancel"); "Save Changes" with nothing entered;
        //    then the real save.
        await leg('modify-unsubmitted', async () => {
            await openWorkflow();
            await openDetails(N.r1);
            const out = {before: lastSeen(N.r1)};
            out.win = await openModify('modify-unsubmitted');
            await typeComment(`Typed and abandoned ${T}.`);
            let browserDialog = null;
            const onDialog = async (d) => { browserDialog = {type: d.type(), message: d.message()}; await d.accept(); };
            page.on('dialog', onDialog);
            await editWin().getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.waitForTimeout(1200);
            out.leaveUnsaved = {browserDialog, appDialog: await page.locator('[data-cy="dialog"]:visible').allInnerTexts().then((a) => a.map(fold)),
                editWindowOpen: await editWin().isVisible().catch(() => false), detailsOpen: await details().isVisible().catch(() => false)};
            await snap('modify-unsubmitted-after-cancel');
            for (const d of await page.locator('[data-cy="dialog"]:visible').all()) {
                out.leaveUnsaved.appDialogButtons = (await d.getByRole('button').allInnerTexts()).map(fold);
                await d.getByRole('button').first().click().catch(() => {});
            }
            page.off('dialog', onDialog);
            if (await editWin().isVisible().catch(() => false)) {
                await editWin().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
            }
            if (!(await details().isVisible().catch(() => false))) { await openWorkflow(); await openDetails(N.r1); }
            const again = await openModify(null);
            out.reopenedComment = again.commentNow;
            // Save with nothing entered (the default end of the axis)
            out.saveEmpty = await pressSave();
            await snap('modify-unsubmitted-save-empty');
            out.saveEmpty.errors = (await editWin().locator('.pkpFieldError, [class*="FieldError"], [role="alert"]').allInnerTexts().catch(() => [])).map(fold).filter(Boolean);
            out.afterEmpty = {assignment: lastSeen(N.r1), editWindowOpen: await editWin().isVisible().catch(() => false)};
            if (!out.afterEmpty.editWindowOpen && !out.saveEmpty.saveChangesDisabled) {
                out.afterEmpty.detailsText = fold(await details().innerText().catch(() => '')).slice(0, 400);
                await closeDetails().catch(() => {});
                out.afterEmpty.row = await readRow(N.r1);
                await openDetails(N.r1);
                await openModify(null);
            }
            // the comment only ({OJS}: the required "Recommendation" left empty)
            await typeComment(`Editor's remarks for Una ${T}.`);
            if (isOjs) {
                out.saveNoRecommendation = await pressSave();
                out.saveNoRecommendation.errors = (await editWin().locator('.pkpFieldError, [class*="FieldError"], [role="alert"]').allInnerTexts().catch(() => [])).map(fold).filter(Boolean);
                await snap('modify-unsubmitted-save-no-recommendation');
                if (out.saveNoRecommendation.editWindowOpen) {
                    const sel = editWin().locator('select').first();
                    await sel.selectOption({label: 'Accept Submission'});
                }
            }
            if (await editWin().isVisible().catch(() => false)) out.save = await pressSave();
            await snap('modify-unsubmitted-after-save');
            await shot(page, 'modify-unsubmitted-after-save');
            out.detailsAfter = await footer();
            out.detailsTextAfter = fold(await details().innerText()).slice(0, 700);
            out.after = lastSeen(N.r1);
            await closeDetails();
            out.rowAfter = await readRow(N.r1);
            return out;
        });

        // 5./6. "Mark as Complete" on a request nobody answered (R5) and on an accepted, unwritten one (R2).
        for (const [name, k] of [['complete-unanswered', 'r5'], ['complete-accepted', 'r2']]) {
            await leg(name, async () => {
                await openWorkflow();
                const out = {rowBefore: await readRow(N[k])};
                await openDetails(N[k]);
                out.footerBefore = await footer();
                out.before = lastSeen(N[k]);
                await snap(`${name}-details`);
                if (out.footerBefore.states['Mark as Complete'] !== 'enabled') {
                    await shot(page, `${name}-disabled`);
                    await closeDetails();
                    return out;
                }
                if (k === 'r5') out.cancelBranch = await pressMarkComplete(`${name}-cancelled`, {confirm: false});
                out.mark = await pressMarkComplete(name);
                await shot(page, `${name}-after`);
                out.after = lastSeen(N[k]);
                await closeDetails();
                out.rowAfter = await readRow(N[k]);
                await snap(`${name}-panel-after`);
                return out;
            });
        }

        // 7. The declined request R4: "Modify Review" pressed, typed and saved; then "Mark as Complete".
        await leg('declined', async () => {
            await openWorkflow();
            const out = {rowBefore: await readRow(N.r4)};
            await openDetails(N.r4);
            out.before = lastSeen(N.r4);
            out.win = await openModify('declined-modify');
            await typeComment(`Editor's remarks for Dex ${T}.`);
            if (isOjs && out.win.selects.length) await editWin().locator('select').first().selectOption({label: 'Accept Submission'});
            out.save = await pressSave();
            await snap('declined-after-save');
            await shot(page, 'declined-after-save');
            out.save.errors = (await page.locator('.pkpFieldError:visible, [class*="FieldError"]:visible, [role="alert"]:visible').allInnerTexts().catch(() => [])).map(fold).filter(Boolean);
            out.save.appDialogs = (await page.locator('[data-cy="dialog"]:visible').allInnerTexts()).map(fold);
            for (const d of await page.locator('[data-cy="dialog"]:visible').all()) await d.getByRole('button').last().click().catch(() => {});
            if (await editWin().isVisible().catch(() => false)) {
                page.once('dialog', (d) => d.accept().catch(() => {}));
                await editWin().getByRole('button', {name: 'Cancel', exact: true}).click();
                await page.waitForTimeout(800);
                for (const d of await page.locator('[data-cy="dialog"]:visible').all()) await d.getByRole('button').first().click().catch(() => {});
            }
            out.afterSave = lastSeen(N.r4);
            if (!(await details().isVisible().catch(() => false))) { await openWorkflow(); await openDetails(N.r4); }
            out.footer = await footer();
            if (out.footer.states['Mark as Complete'] === 'enabled') {
                out.mark = await pressMarkComplete('declined-complete');
                out.afterMark = lastSeen(N.r4);
            }
            await closeDetails();
            out.rowAfter = await readRow(N.r4);
            return out;
        });

        // 8. Scenario 16 on the submitted review R3 (both comment blocks, a reviewer file), plus the window's "Upload".
        await leg('submitted', async () => {
            await openWorkflow();
            const out = {rowBefore: await readRow(N.r3)};
            await row(N.r3).getByRole('button', {name: 'Read Review', exact: true}).click();
            await details().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 30_000});
            await idle(page);
            await snap('submitted-details');
            // the reviewer's attached file in the view window's read-only "Reviewer Files": on the first read, and ten seconds on
            const fileName = `s17-reviewer-${T}.txt`;
            out.reviewerFile = {atOpen: fold(await details().innerText()).includes(fileName)};
            out.reviewerFile.within10s = await details().getByText(fileName).first().waitFor({timeout: 10_000}).then(() => true).catch(() => false);
            if (out.reviewerFile.atOpen !== out.reviewerFile.within10s) await snap('submitted-details-10s');
            out.footerBefore = await footer();
            out.detailsEditors = await details().locator('iframe.tox-edit-area__iframe, textarea:not([disabled]), [contenteditable="true"]').count();
            out.win = await openModify('submitted-modify');
            // the control: nothing to edit the editor-only comment with
            out.privateInEditWindow = {mentions: /For editor/.test(out.win.text), editors: out.win.editors,
                textareas: await editWin().locator('textarea:visible').count()};
            await editWin().getByRole('button', {name: 'Cancel', exact: true}).click();
            await editWin().waitFor({state: 'hidden', timeout: 15_000});
            out.afterCancel = {detailsOpen: await details().isVisible(), writes: writes.length};
            await snap('submitted-after-cancel');
            await openModify(null);
            await typeComment('Revised by the editor.');
            if (isOjs) await editWin().locator('select').first().selectOption({label: 'Decline Submission'});
            out.save = await pressSave();
            await snap('submitted-after-save');
            await shot(page, 'submitted-after-save');
            out.detailsTextAfter = fold(await details().innerText()).slice(0, 900);
            out.after = lastSeen(N.r3);
            // the "Upload" control of the Modify Review window
            out.uploadWin = await openModify(null);
            const up = editWin().getByRole('button', {name: /^Upload/});
            out.upload = {buttons: (await up.allInnerTexts()).map(fold)};
            if (await up.count()) {
                await up.first().click();
                await page.waitForTimeout(1500);
                await idle(page);
                await snap('submitted-upload-wizard');
                const wizard = page.locator('[data-cy="active-modal"]').last();
                out.upload.wizardText = fold(await wizard.innerText()).slice(0, 400);
                const genre = wizard.locator('select[id^="genreId"]');
                if (await genre.count()) out.upload.genres = (await genre.locator('option').allInnerTexts()).map(fold);
                await page.locator('input[type="file"]').last().setInputFiles({name: `s17-editor-${T}.txt`, mimeType: 'text/plain', buffer: Buffer.from('Editor upload')});
                await wizard.getByRole('button', {name: /Change File/}).waitFor({timeout: 20_000});
                await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
                await page.waitForTimeout(1500); await idle(page);
                await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
                await page.waitForTimeout(1500); await idle(page);
                await wizard.getByRole('button', {name: 'Complete', exact: true}).click();
                await page.waitForTimeout(1500); await idle(page);
                await snap('submitted-upload-done');
                out.upload.editWindowFiles = fold(await editWin().innerText()).includes(`s17-editor-${T}.txt`);
                // leave with only the file added: Cancel
                await editWin().getByRole('button', {name: 'Cancel', exact: true}).click();
                await page.waitForTimeout(1000);
                out.upload.afterCancelDialogs = (await page.locator('[data-cy="dialog"]:visible').allInnerTexts()).map(fold);
                await idle(page);
                out.upload.detailsShowsFile = fold(await details().innerText()).includes(`s17-editor-${T}.txt`);
                await snap('submitted-upload-after-cancel');
            } else {
                await editWin().getByRole('button', {name: 'Cancel', exact: true}).click();
            }
            await closeDetails();
            out.rowAfter = await readRow(N.r3);
            // the activity log
            await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
            const logDlg = page.getByRole('dialog', {name: /Activity Log/});
            await logDlg.getByRole('table').first().waitFor({timeout: 30_000});
            await idle(page);
            await snap('submitted-activity-log');
            const lines = (await logDlg.getByRole('row').allInnerTexts()).map(fold).filter(Boolean);
            out.log = lines.filter((l) => /modified in this review|Cora/.test(l)).slice(0, 12);
            const changed = logDlg.getByRole('row').filter({hasText: 'modified in this review'}).first();
            out.logRowControls = (await changed.locator('a, button').allInnerTexts()).map(fold).filter(Boolean);
            // a legacy grid: the row's controls sit in the NEXT row, behind the row's "Settings" arrow (patterns.md pitfall 10)
            await changed.locator('a.show_extras').click();
            const controls = changed.locator('xpath=following-sibling::tr[1]');
            await controls.getByRole('link').first().waitFor({timeout: 10_000}).catch(() => {});
            out.logRowExtras = (await controls.getByRole('link').allInnerTexts()).map(fold).filter(Boolean);
            await snap('submitted-activity-log-row-open');
            const view = controls.getByRole('link', {name: 'View changes', exact: true});
            if (await view.count()) {
                await view.click();
                await page.waitForTimeout(1500);
                await idle(page);
                const s = await snap('submitted-view-changes');
                await shot(page, 'submitted-view-changes');
                out.viewChanges = fold(s.text.dialog).slice(0, 900);
            }
            return out;
        });

        // 9. The publicly visible end of the save: R8's row › "Edit" › "Publicly Show Reviewer Comments" › "Mark as
        //    Complete" (the dialog's extra sentence) › "Modify Review" › "Save Changes" › "Save changes to this review?".
        await leg('public', async () => {
            await openWorkflow();
            const out = {};
            await row(N.r8).getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menu').last().getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const edit = page.locator('[data-cy="active-modal"]').last();
            await edit.getByText('Review Type').first().waitFor({timeout: 20_000});
            await idle(page);
            await snap('public-edit-window');
            const box = edit.locator('input[name="isReviewPubliclyVisible"]');
            out.boxBefore = await box.isChecked();
            await box.check();
            await edit.getByRole('button', {name: 'OK', exact: true}).click();
            await edit.getByText('Review Type').first().waitFor({state: 'hidden', timeout: 20_000});
            await idle(page);
            await row(N.r8).getByRole('button', {name: 'Read Review', exact: true}).click();
            await details().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 30_000});
            await idle(page);
            out.assignment = lastSeen(N.r8);
            // before completion: a save asks nothing
            await openModify(null);
            await typeComment(`Public remarks, first edit ${T}.`);
            out.saveBeforeComplete = await pressSave({expectDialog: 'Save changes to this review?'});
            if (out.saveBeforeComplete.dialog) await confirmDlg('Save changes to this review?').getByRole('button', {name: 'Save Changes', exact: true}).click();
            await editWin().waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
            await idle(page);
            out.mark = await pressMarkComplete('public-complete');
            await openModify(null);
            await typeComment(`Public remarks, second edit ${T}.`);
            out.saveAfterComplete = await pressSave({expectDialog: 'Save changes to this review?'});
            await snap('public-save-dialog');
            await shot(page, 'public-save-dialog');
            if (out.saveAfterComplete.dialog) {
                const d = confirmDlg('Save changes to this review?');
                await d.getByRole('button', {name: 'Cancel', exact: true}).click();
                await d.waitFor({state: 'hidden', timeout: 10_000});
                out.afterDialogCancel = {editWindowOpen: await editWin().isVisible(), writesSent: writes.filter((w) => /\/review$/.test(w.path.split('?')[0])).length};
                const n = writes.length;
                await editWin().getByRole('button', {name: 'Save Changes', exact: true}).click();
                await d.waitFor({timeout: 10_000});
                await d.getByRole('button', {name: 'Save Changes', exact: true}).click();
                await editWin().waitFor({state: 'hidden', timeout: 20_000}).catch(() => {});
                await idle(page);
                out.afterDialogConfirm = {write: writes.slice(n), editWindowOpen: await editWin().isVisible().catch(() => false)};
            }
            await snap('public-after-save');
            out.detailsTextAfter = fold(await details().innerText()).slice(0, 600);
            await closeDetails();
            out.rowAfter = await readRow(N.r8);
            return out;
        });

        // 9b. The review-form end on an unanswered request (R11, a form with one required question): the window's
        //     gate beside "Mark as Complete", then "Modify Review" saved empty and saved answered.
        await leg('form-unsubmitted', async () => {
            await openWorkflow();
            const out = {rowBefore: await readRow(N.r11)};
            await openDetails(N.r11);
            await snap('form-details');
            await shot(page, 'form-details');
            out.footerBefore = await footer();
            out.detailsText = fold(await details().innerText()).slice(0, 1200);
            out.win = await openModify('form-modify');
            const w = editWin();
            out.fields = await w.locator('textarea:visible, input[type="text"]:visible').evaluateAll((els) => els.map((e) => ({tag: e.tagName, name: e.name, required: e.required, value: e.value})));
            out.saveEmpty = await pressSave();
            await snap('form-save-empty');
            out.saveEmpty.errors = (await w.locator('.pkpFieldError:visible, [class*="FieldError"]:visible, [role="alert"]:visible').allInnerTexts().catch(() => [])).map(fold).filter(Boolean);
            out.afterEmpty = lastSeen(N.r11);
            if (!(await w.isVisible().catch(() => false))) {
                out.afterEmptyFooter = await footer();
                await snap('form-details-after-empty-save');
                out.win2 = await openModify(null);
            }
            // the form's "textarea" question renders as a rich-text editor, the window's first (a form replaces the free comments)
            const area = w.locator('textarea:visible').first();
            if (await area.count()) await area.fill(`Sound enough ${T}.`);
            else await typeComment(`Sound enough ${T}.`);
            if (isOjs) await w.locator('select[name="reviewerRecommendationId"]').selectOption({label: 'See Comments'});
            out.save = await pressSave();
            await snap('form-after-save');
            await shot(page, 'form-after-save');
            out.after = lastSeen(N.r11);
            if (await w.isVisible().catch(() => false)) {
                await w.getByRole('button', {name: 'Cancel', exact: true}).click();
                await page.waitForTimeout(800);
                for (const d of await page.locator('[data-cy="dialog"]:visible').all()) await d.getByRole('button').first().click().catch(() => {});
                await page.waitForTimeout(600);
            }
            if (await details().isVisible().catch(() => false)) { out.footerAfter = await footer(); out.detailsTextAfter = fold(await details().innerText()).slice(0, 1200); await closeDetails(); }
            out.rowAfter = await readRow(N.r11);
            return out;
        });

        // 10. A cancelled row's menu (R6: "Cancel Reviewer" sent as it comes).
        await leg('cancelled', async () => {
            await openWorkflow();
            const out = {rowBefore: await readRow(N.r6)};
            await row(N.r6).getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menu').last().getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
            const win = page.locator('[data-cy="active-modal"]').last();
            await win.getByText('Choose a predefined message to use').waitFor({timeout: 20_000});
            await page.frameLocator('iframe[id^="personalMessage"]').last().locator('body').getByText(/\w/).first().waitFor({timeout: 20_000});
            await win.getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
            await row(N.r6).getByText('Request Cancelled').waitFor({timeout: 20_000});
            await idle(page);
            out.rowAfter = await readRow(N.r6);
            await snap('cancelled-panel');
            return out;
        });

        // 11. The reviewer's side after an editor's "Mark as Complete" on their unanswered / unwritten request.
        for (const k of ['r5', 'r2']) {
            await leg(`reviewer-${k}`, async () => reviewerSide(k, `reviewer-${k}`));
        }
        await leg('mail', async () => {
            const out = {};
            for (const k of ['r1', 'r2', 'r4', 'r5', 'r7']) {
                out[k] = ((await app.mail._search({to: `${U[k]}@mail.test`})).messages || []).map((m) => m.Subject);
            }
            return out;
        });
        result.seen = seen;
        result.writes = writes;
        await signOut(page).catch(() => {});
    } catch (e) {
        result.error = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
        log('FAILED', result.error);
        await shot(page, 'zz-failure').catch(() => {});
    } finally {
        record('result', result);
        await close();
    }
});
