// U27 claim check I18 (housekeeping 2026-11-18): incidentals row "Edit Review" calendar aria-hidden
// (per .reports/hk1118/chunks/U27.md), against the U27 Fields row "Response Due Date" / "Review Due Date".
// OJS and OMP only (a preprint server has no review stage; OPS is skipped with a log line).
//
//   PROBE_FEATURE=U27 PROBE_AGENT=ccI18 PROBE_NOTES_FEATURE=U27 PROBE_RUN=r1 \
//     node bin/probe.js <ojs|omp|all> shared/playwright/checks/U27/I18/i18.js
//   then PROBE_RUN=r2. LEGS=<comma list> narrows (default every leg below); ROLES=mg,se narrows the roles.
//   (The 2026-11-18 drive ran the addclose leg's bottom-"Cancel" part later, as PROBE_RUN=r1b / r2b LEGS=addclose.)
// No other script or env part is needed. Every run seeds its own scratch context "I18 <tag>" (tag prefix
// u27i18): mg (manager: Journal/Press Manager level), se (sectionEditor: Section/Series Editor, a participant),
// au (author), rA, rB (externalReviewer, invited), rC (accepted), rD (externalReviewer, not on the round, for
// "Add Reviewer"); one submission in an external review round. Nothing on publicknowledge.
// Outputs (.reports/U27/ccI18/): i18-facts-<run>-<app>.json (every calendar read, keyed <role>.<leg>, window W1..;
// per field: response/review = read with nothing pressed, responsePick/reviewPick = a day clicked),
// <run>-NNN-<label>-<app>.json/.png (screen() of every window), the kit's run record.
//
// Legs (each opens the page fresh by address, as the role):
//   dash  the editorial dashboard: indicator 1 › "Edit Due Date" (W1), indicator 2 › "Edit Due Date" (W2),
//         indicator 1 again (W3)
//   wf    the workflow's Reviewers panel: row rA › More Actions › "Edit" (W1), row rB › "Edit" (W2),
//         "Add Reviewer" with rD selected (W3)
//   add   the workflow: "Add Reviewer" with rD selected first (W1), then row rA › "Edit" (W2)
//   addclose (sweep) "Add Reviewer" with rD picked, top "Close" (nothing else changed); again with the review
//         date changed by a calendar pick, top "Close" answered "Cancel", then "OK"; again with the date changed,
//         the bottom "Cancel" link (a question answered "Cancel" first); rD's row read, and after a reload
// In every window: the response-date calendar opened and read with nothing pressed in it (the jQuery calendar
// #ui-datepicker-div: its aria-hidden and its ancestors', Playwright role counts and aria snapshot, Chromium's
// AX nodes via CDP, partial and full tree; a press on the window's title tried, which leaves it open); the same
// for the review-date calendar; then a day clicked by CSS in each and the box read back (and Chromium's
// "Blocked aria-hidden" console warnings counted). Each window is left changed and unsaved: the manager's
// first dash window and every "Add Reviewer" window by the top "Close" (confirm() accepted), the other
// "Edit Review" windows by the bottom "Cancel" link; the calendar's attributes are read again after each
// close, and the rows' dates (screen and review_assignments) after a final reload.
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const LEGS = (process.env.LEGS || 'dash,wf,add,addclose').split(',');
const ROLES = (process.env.ROLES || 'mg,se').split(',');
const T = 30000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const NAMES = {mg: ['Mona', 'Manager'], se: ['Seth', 'Subeditor'], au: ['Ava', 'Author'],
    rA: ['Rae', 'Alpha'], rB: ['Rob', 'Bravo'], rC: ['Rita', 'Charlie'], rD: ['Rudi', 'Delta']};
const full = (k) => NAMES[k].join(' ');

forEachApp(async (app) => {
    const A = app.name;
    if (A === 'ops') { console.log('[i18] ops: no review stage, no "Edit Review" window; skipped'); return; }
    const T0 = Date.now();
    const log = (...a) => console.log(`[i18 ${RUN} ${A} +${Math.round((Date.now() - T0) / 1000)}s]`, ...a);
    const fact = (k, v) => { record(`i18-facts-${RUN}`, {[k]: v}, {merge: true}); log(`[${k}]`, JSON.stringify(v).slice(0, 1600)); };

    // ---- seed ---------------------------------------------------------------
    const t = tag('u27i18');
    const u = Object.fromEntries(Object.keys(NAMES).map((k) => [k, `${t}${k.toLowerCase()}`]));
    const person = (k, roles) => ({username: u[k], roles, givenName: NAMES[k][0], familyName: NAMES[k][1]});
    const users = [person('mg', ['manager']), person('se', ['sectionEditor']), person('au', ['author']),
        ...['rA', 'rB', 'rC', 'rD'].map((k) => person(k, ['externalReviewer']))];
    const C = await app.api.createContext({tag: t, context: {name: `I18 ${t}`}, users});
    const ctx = C.path;
    const title = `I18 study ${t}`;
    const s1 = await app.api.createSubmission({tag: `${t}s1`, context: ctx, submitter: u.au, title,
        decisions: [A === 'omp' ? 'skipInternalReview' : 'sendExternalReview'], participants: [{username: u.se, role: 'sectionEditor'}],
        reviewRounds: [{reviewers: [{username: u.rA, status: 'invited'}, {username: u.rB, status: 'invited'}, {username: u.rC, status: 'accepted'}]}]});
    fact('seed', {ctx, sid: s1.submissionId, rounds: s1.reviewRounds});

    // ---- browser ------------------------------------------------------------
    const {page} = await launch(app);
    page.setDefaultTimeout(20000);
    const jsDialogs = [], net = [], pageErrors = [];
    let answer = 'accept';
    page.on('dialog', async (d) => {
        const a = d.type() === 'beforeunload' ? 'accept' : answer;
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), answered: a});
        if (a === 'accept') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    page.on('response', (r) => { if (r.status() >= 400) net.push({at: Date.now(), m: r.request().method(), s: r.status(), u: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 200)}); });
    const consoleBlocked = [];
    page.on('console', (m) => { if (/Blocked aria-hidden/.test(m.text())) consoleBlocked.push({at: Date.now(), text: flat(m.text(), 160)}); });
    page.on('pageerror', (e) => pageErrors.push({at: Date.now(), text: flat(e.message, 200)}));
    const since = (arr, t0) => arr.filter((x) => x.at >= t0).map(({at, ...x}) => ({ms: at - t0, ...x}));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable').catch(() => {});

    let snapN = 0;
    async function snap(label, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), screenError: flat(e.message, 200)}; }
        if (extra) s.facts = extra;
        const name = `${RUN}-${String(++snapN).padStart(3, '0')}-${label}`;
        record(name, s);
        await shot(page, name).catch(() => {});
        return `${name}-${A}`;
    }
    const as = async (k) => { await signIn(page, u[k], {contextPath: ctx}); await idle(page).catch(() => {}); };
    const wfUrl = () => app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${s1.submissionId}&workflowMenuKey=workflow_${s1.reviewRounds[0].stageId}_${s1.reviewRounds[0].id}`);
    const dashUrl = (v) => app.url(`/index.php/${ctx}/dashboard/editorial${v ? `?currentViewId=${v}` : ''}`);
    const dashRow = () => page.locator('#app-main table tbody tr').filter({hasText: title}).first();
    const indicatorBtns = () => dashRow().locator('button[id^="headlessui-popover-button"], button[aria-haspopup]');
    const popPanel = () => dashRow().locator('[id^="headlessui-popover-panel"]').first();
    const wfRow = (k) => page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: full(k)}).first();
    const editWin = () => page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')}).last();
    const addWin = () => page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')}).last();
    const picker = () => page.locator('#ui-datepicker-div');

    // ---- the calendar read ---------------------------------------------------
    async function axOf(selector) {
        try {
            const {root} = await cdp.send('DOM.getDocument', {depth: 0});
            const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
            if (!nodeId) return {found: false};
            const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {nodeId, fetchRelatives: false});
            const n = nodes[0] || {};
            return {found: true, ignored: n.ignored, ignoredReasons: (n.ignoredReasons || []).map((r) => r.name), role: n.role && n.role.value, name: n.name && n.name.value};
        } catch (e) { return {err: flat(e.message, 160)}; }
    }
    // the calendar's subtree in Chromium's full accessibility tree: the links and comboboxes a screen reader is given
    async function axTreeCount() {
        try {
            const {root} = await cdp.send('DOM.getDocument', {depth: 0});
            const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#ui-datepicker-div'});
            if (!nodeId) return {found: false};
            const {node} = await cdp.send('DOM.describeNode', {nodeId});
            const {nodes} = await cdp.send('Accessibility.getFullAXTree');
            const byId = new Map(nodes.map((n) => [n.nodeId, n]));
            const top = nodes.find((n) => n.backendDOMNodeId === node.backendNodeId);
            if (!top) return {found: true, inTree: false};
            const acc = {inTree: true, topIgnored: top.ignored, topReasons: (top.ignoredReasons || []).map((r) => r.name), exposed: {}, ignored: 0};
            const walk = (n) => {
                for (const c of (n.childIds || [])) {
                    const k = byId.get(c); if (!k) continue;
                    if (k.ignored) acc.ignored++;
                    else { const r = k.role && k.role.value; if (/link|combobox|table|cell|gridcell|button/.test(r)) acc.exposed[r] = (acc.exposed[r] || 0) + 1; }
                    walk(k);
                }
            };
            walk(top);
            return acc;
        } catch (e) { return {err: flat(e.message, 160)}; }
    }
    const domRead = () => page.evaluate(() => {
        const dp = document.getElementById('ui-datepicker-div');
        const bodyKids = [...document.body.children].map((c) => ({tag: c.tagName, id: c.id || null, cls: String(c.className || '').slice(0, 50) || null,
            ariaHidden: c.getAttribute('aria-hidden'), dataAriaHidden: c.getAttribute('data-aria-hidden'), inert: c.hasAttribute('inert')}));
        const dialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => d.offsetWidth || d.offsetHeight)
            .map((d) => ({label: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && (document.getElementById(d.getAttribute('aria-labelledby')) || {}).innerText) || null, ariaModal: d.getAttribute('aria-modal')}));
        if (!dp) return {exists: false, bodyKids, dialogs};
        const chain = [];
        for (let e = dp; e && e !== document.documentElement; e = e.parentElement) {
            if (e.getAttribute('aria-hidden') != null || e.hasAttribute('inert') || e.getAttribute('data-aria-hidden') != null) chain.push({tag: e.tagName, id: e.id || null, ariaHidden: e.getAttribute('aria-hidden'), dataAriaHidden: e.getAttribute('data-aria-hidden'), inert: e.hasAttribute('inert')});
        }
        const days = [...dp.querySelectorAll('td:not(.ui-datepicker-other-month) a')];
        const cs = getComputedStyle(dp);
        return {exists: true, parent: dp.parentElement && dp.parentElement.tagName, display: cs.display, zIndex: cs.zIndex,
            ariaHidden: dp.getAttribute('aria-hidden'), dataAriaHidden: dp.getAttribute('data-aria-hidden'), hiddenChain: chain,
            dayCount: days.length, sampleDay: days[0] ? {outer: days[0].outerHTML.slice(0, 160)} : null,
            controls: [...dp.querySelectorAll('select, a.ui-datepicker-prev, a.ui-datepicker-next, button')].map((c) => ({tag: c.tagName, cls: String(c.className).slice(0, 40), title: c.getAttribute('title'), text: (c.innerText || '').trim().slice(0, 30), aria: c.getAttribute('aria-label')})),
            header: (dp.querySelector('.ui-datepicker-title') || {}).innerText || null, bodyKids, dialogs};
    });
    async function dismissPicker(win) {
        // tried: a press on the window's own title. It does NOT close the calendar on these windows (recorded as
        // closedWithoutPick: false); the next box's click re-renders it, so the next read is unaffected
        const h = win.locator('h1, h2').first();
        await h.click({position: {x: 2, y: 2}}).catch(() => {});
        await picker().waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
        await sleep(300);
    }
    async function readCalendar(win, field, pickDay, {pick = true} = {}) {
        const out = {field};
        const input = win.locator(`input.datepicker[id^="${field}"]`).first();
        out.inputCount = await win.locator(`input.datepicker[id^="${field}"]`).count();
        out.before = {visibleBox: await input.inputValue().catch(() => null), hidden: await win.locator(`input[type="hidden"][name="${field}"]`).first().inputValue().catch(() => null)};
        out.inputAx = await input.evaluate((el) => el.id).then((id) => axOf(`[id="${id}"]`)).catch((e) => ({err: flat(e.message, 100)}));
        await input.click();
        await picker().waitFor({state: 'visible', timeout: 10000}).catch(() => { out.pickerNotVisible = true; });
        await sleep(300);
        out.dom = await domRead();
        out.pw = {
            linksInPicker: await picker().getByRole('link').count(),
            dayLinkByRole: await picker().getByRole('link', {name: String(pickDay), exact: true}).count(),
            dayLinkByRolePage: await page.getByRole('link', {name: String(pickDay), exact: true}).count(),
            tableInPicker: await picker().getByRole('table').count(),
            gridInPicker: await picker().getByRole('grid').count(),
            comboInPicker: await picker().getByRole('combobox').count(),
            dayByCss: await picker().locator(`td:not(.ui-datepicker-other-month) a[data-date="${pickDay}"]`).count(),
            dayByCssText: await picker().locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${pickDay}$`)}).count(),
            pickerVisible: await picker().isVisible(),
        };
        out.ariaSnapshot = flat(await picker().ariaSnapshot().catch((e) => `err ${flat(e.message, 100)}`), 600);
        await sleep(600); // Chromium's AX tree updates after the DOM; read it settled
        out.ax = {
            picker: await axOf('#ui-datepicker-div'),
            day: await axOf('#ui-datepicker-div td:not(.ui-datepicker-other-month) a'),
            table: await axOf('#ui-datepicker-div table'),
            next: await axOf('#ui-datepicker-div a.ui-datepicker-next'),
            monthSelect: await axOf('#ui-datepicker-div select'),
        };
        out.axTree = await axTreeCount();
        if (!pick) { await dismissPicker(win); out.closedWithoutPick = !(await picker().isVisible()); return out; }
        // the day still takes a click? (by CSS, whatever the role tree says)
        const blocked0 = consoleBlocked.length;
        const day = picker().locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${pickDay}$`)}).first();
        if (await day.count()) {
            await day.click().catch((e) => { out.clickErr = flat(e.message, 160); });
            await sleep(400);
        }
        out.after = {visibleBox: await input.inputValue().catch(() => null), hidden: await win.locator(`input[type="hidden"][name="${field}"]`).first().inputValue().catch(() => null), pickerVisible: await picker().isVisible()};
        out.changed = out.after.hidden !== out.before.hidden;
        out.blockedAriaHiddenWarnings = consoleBlocked.length - blocked0;
        return out;
    }
    async function readWindow(label, win, extra = {}) {
        const out = {...extra};
        out.snap = await snap(`${label}-open`);
        // the reads first, with nothing pressed inside a calendar (a mouse press on a day moves focus into it,
        // and Chromium then blocks an aria-hidden around the focus, which taints a later read)
        out.response = await readCalendar(win, 'responseDueDate', 27, {pick: false});
        out.review = await readCalendar(win, 'reviewDueDate', 28, {pick: false});
        // then a day clicked in each calendar (by CSS), the box read back
        out.responsePick = await readCalendar(win, 'responseDueDate', 27);
        out.reviewPick = await readCalendar(win, 'reviewDueDate', 28);
        out.changedSnap = await snap(`${label}-changed`);
        return out;
    }
    async function leave(win, how, label) {
        const t0 = Date.now();
        if (how === 'close') await win.getByRole('button', {name: 'Close', exact: true}).first().click();
        else await win.getByRole('link', {name: 'Cancel', exact: true}).first().click();
        await sleep(2200); // past the 450 ms modal-store slot and the 300 ms legacy teardown, and a late confirm()
        await idle(page).catch(() => {});
        const out = {how, dialogs: since(jsDialogs, t0), stillOpen: await win.isVisible().catch(() => false), afterClose: await domRead().then((d) => ({ariaHidden: d.ariaHidden, dataAriaHidden: d.dataAriaHidden, hiddenChain: d.hiddenChain, exists: d.exists}))};
        out.snap = await snap(`${label}-left`);
        return out;
    }

    // ---- openers ---------------------------------------------------------------
    async function openDash() {
        for (const v of [null, 'active', 'assigned-to-me']) {
            await page.goto(dashUrl(v)); await idle(page).catch(() => {});
            await page.locator('#app-main h1').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page).catch(() => {});
            if (await dashRow().waitFor({timeout: 8000}).then(() => true).catch(() => false)) return v || '(landing)';
        }
        return null;
    }
    async function editFromIndicator(i) {
        await sleep(700);
        const btns = indicatorBtns();
        const names = await btns.evaluateAll((els) => els.map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160)));
        // a popover left open by the previous window (the list refetches on close) is closed first;
        // the indicator is pressed again until its panel offers "Edit Due Date"
        const editBtn = () => popPanel().getByRole('button', {name: 'Edit Due Date', exact: true});
        for (let tries = 0; tries < 4; tries++) {
            if (await popPanel().isVisible().catch(() => false)) { await page.locator('#app-main h1').first().click().catch(() => {}); await sleep(600); }
            await btns.nth(i).click();
            if (await editBtn().waitFor({timeout: 5000}).then(() => true).catch(() => false)) break;
        }
        await sleep(300);
        const popText = flat(await popPanel().innerText().catch(() => null), 400);
        await editBtn().click();
        const w = editWin();
        await w.locator('form#editReviewForm').waitFor({timeout: T});
        await w.locator('input.datepicker[id^="reviewDueDate"]').first().waitFor({timeout: T});
        await idle(page).catch(() => {}); await sleep(600);
        return {w, indicators: names, popover: popText};
    }
    async function openWf() {
        await page.goto(wfUrl()); await idle(page).catch(() => {});
        await wfRow('rA').waitFor({timeout: T}).catch(() => log('no row rA'));
        await idle(page).catch(() => {});
    }
    async function editFromRow(k) {
        await sleep(700);
        await wfRow(k).getByRole('button', {name: /More Actions/}).first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000}).catch(() => {});
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const w = editWin();
        await w.locator('input.datepicker[id^="reviewDueDate"]').first().waitFor({timeout: T});
        await idle(page).catch(() => {}); await sleep(600);
        return {w};
    }
    async function addReviewerWindow(k) {
        await sleep(700);
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
        const w = addWin();
        await w.locator('.listPanel--selectReviewer input.pkpSearch__input').waitFor({timeout: T});
        await page.waitForFunction(() => {
            const ta = document.querySelector('#reviewerFormFooter textarea[name="personalMessage"]');
            const mce = window.tinyMCE || window.tinymce;
            return !!(ta && mce && mce.get(ta.id) && mce.get(ta.id).initialized);
        }, undefined, {timeout: T}).catch(() => log('letter editor not ready'));
        const item = w.locator('.listPanel--selectReviewer .listPanel__item').filter({hasText: full(k)}).first();
        await item.waitFor({timeout: T});
        await item.getByRole('button', {name: /^Select /}).click();
        await w.locator('#regularReviewerForm').waitFor({timeout: T});
        await w.locator('input.datepicker[id^="responseDueDate"]').first().waitFor({timeout: T});
        await idle(page).catch(() => {}); await sleep(800);
        return {w};
    }

    // ---- legs ------------------------------------------------------------------
    async function leg(role, name, fn) {
        if (!LEGS.includes(name)) return;
        const t0 = Date.now();
        const out = {};
        try { await fn(out); } catch (e) {
            out.FAILED = flat(e.stack || e, 800);
            out.failSnap = await snap(`${role}-${name}-failed`).catch(() => null);
        }
        out.crashes = {server: since(net, t0).filter((x) => x.s >= 500), script: since(pageErrors, t0)};
        out.http4xx = since(net, t0).filter((x) => x.s < 500);
        out.dialogs = since(jsDialogs, t0);
        fact(`${role}.${name}`, out);
    }

    // sweep: the Add Reviewer window's top "Close" with a reviewer picked and nothing else changed (control),
    // then with a due date changed by a calendar pick: the question answered "Cancel", then "OK"
    async function addCloseLeg(role, o) {
        await openWf();
        let x = await addReviewerWindow('rD');
        o.pickedOnlySnap = await snap(`${role}-addclose-picked`);
        o.pickedOnly = await leave(x.w, 'close', `${role}-addclose-picked`);
        x = await addReviewerWindow('rD');
        o.dateChanged = await readCalendar(x.w, 'reviewDueDate', 28);
        o.dateChangedSnap = await snap(`${role}-addclose-datechanged`);
        answer = 'dismiss';
        o.dismissed = await leave(x.w, 'close', `${role}-addclose-dismissed`);
        answer = 'accept';
        o.dismissed.dateKept = o.dismissed.stillOpen ? await x.w.locator('input[type="hidden"][name="reviewDueDate"]').first().inputValue().catch(() => null) : null;
        if (o.dismissed.stillOpen) o.accepted = await leave(x.w, 'close', `${role}-addclose-accepted`);
        // the bottom "Cancel" link with the review date changed (the spec's other way out)
        x = await addReviewerWindow('rD');
        o.cancelDateChanged = await readCalendar(x.w, 'reviewDueDate', 28);
        answer = 'dismiss';
        o.cancelled = await leave(x.w, 'cancel', `${role}-addclose-cancelled`);
        answer = 'accept';
        if (o.cancelled.stillOpen) o.cancelledAccepted = await leave(x.w, 'cancel', `${role}-addclose-cancelled-accepted`);
        o.rowsAfter = {rD: await wfRow('rD').count()};
        await openWf();
        o.rowsAfterReload = {rD: await wfRow('rD').count(), snap: await snap(`${role}-addclose-reload`)};
    }

    for (const role of ROLES) {
        await as(role);
        await leg(role, 'dash', async (o) => {
            o.view = await openDash();
            o.dashSnap = await snap(`${role}-dash`);
            if (role === 'mg' && RUN === 'r1') await loc(page, 'Dashboard row: reviewer activity indicators', indicatorBtns());
            let x = await editFromIndicator(0);
            o.W1 = await readWindow(`${role}-dash-W1`, x.w, {indicators: x.indicators, popover: x.popover});
            o.W1.left = await leave(x.w, role === 'mg' ? 'close' : 'cancel', `${role}-dash-W1`);
            x = await editFromIndicator(1);
            o.W2 = await readWindow(`${role}-dash-W2`, x.w, {popover: x.popover});
            if (role === 'mg' && RUN === 'r1') {
                await loc(page, 'jQuery UI calendar (shared, appended to body)', picker());
                await loc(page, 'Edit Review window: response date box (visible)', x.w.locator('input.datepicker[id^="responseDueDate"]'));
            }
            o.W2.left = await leave(x.w, 'cancel', `${role}-dash-W2`);
            x = await editFromIndicator(0);
            o.W3 = await readWindow(`${role}-dash-W3`, x.w, {popover: x.popover});
            o.W3.left = await leave(x.w, 'cancel', `${role}-dash-W3`);
        });
        await leg(role, 'wf', async (o) => {
            await openWf();
            o.wfSnap = await snap(`${role}-wf`);
            let x = await editFromRow('rA');
            o.W1 = await readWindow(`${role}-wf-W1`, x.w);
            o.W1.left = await leave(x.w, 'cancel', `${role}-wf-W1`);
            x = await editFromRow('rB');
            o.W2 = await readWindow(`${role}-wf-W2`, x.w);
            o.W2.left = await leave(x.w, 'cancel', `${role}-wf-W2`);
            x = await addReviewerWindow('rD');
            o.W3add = await readWindow(`${role}-wf-W3add`, x.w);
            o.W3add.left = await leave(x.w, 'close', `${role}-wf-W3add`);
        });
        await leg(role, 'add', async (o) => {
            await openWf();
            o.wfSnap = await snap(`${role}-add-wf`);
            let x = await addReviewerWindow('rD');
            o.W1add = await readWindow(`${role}-add-W1add`, x.w);
            o.W1add.left = await leave(x.w, 'close', `${role}-add-W1add`);
            x = await editFromRow('rA');
            o.W2 = await readWindow(`${role}-add-W2`, x.w);
            o.W2.left = await leave(x.w, 'cancel', `${role}-add-W2`);
        });
        await leg(role, 'addclose', (o) => addCloseLeg(role, o));
    }
    // what the unsaved windows left, after a reload: the rows' dates and review_assignments
    await openWf();
    const endSnap = await snap('end-reload');
    const rows = {};
    for (const k of ['rA', 'rB', 'rC']) rows[k] = flat(await wfRow(k).innerText().catch(() => null), 200);
    fact('end', {snap: endSnap, rows, db: sql(app, `select reviewer_id, date_response_due::date, date_due::date from review_assignments where submission_id = ${s1.submissionId} order by reviewer_id`)});
});
