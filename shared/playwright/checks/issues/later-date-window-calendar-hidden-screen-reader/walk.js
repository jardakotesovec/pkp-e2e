// U27 A54: from the second due-date window opened on one page, the calendar is hidden from screen readers.
// The report's Steps on PKP's default dataset (OJS submission 12, OMP submission 17), as `dbarnes`.
// A preprint server has no review stage: OPS is skipped with a log line.
//
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<agent> [PROBE_RUN=<run>] node bin/probe.js <ojs|omp|all> \
//     shared/playwright/checks/issues/later-date-window-calendar-hidden-screen-reader/walk.js
//
// Modes: the default walks the Steps (the workflow's "Edit" twice and "Add Reviewer", then the
// dashboard's "Edit Due Date" twice) and reads, in each window, what Chromium's accessibility tree
// gives a screen reader of the calendar under "Response Due Date". NB=1 walks the neighbour alone:
// a mouse user's pick in the second window ("Review Due Date", day 28, "OK") after a first window whose
// calendar was never opened: its screen-reader exposure, the calendar's place
// under its box, the saved date after a reload and no calendar left on screen. EXTRA=1 reads, alone: the date
// box's accessible name, description and value (Chromium), and a keyboard user's pick in a later window (focus the
// box, Ctrl+Right, Enter). SLIDE=1 reads, alone, a calendar opened while the window still slides in (the
// slide-in slowed to 3 s): the box focused as Tab focuses it, since a box still off screen takes no click. Every step records
// what it saw and never throws past its leg. Output: walk-facts[-<run>]-<app>.json and screens.
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, sql, axExposure} = require('../../../probe');
const {T, sleep, flat, SUBMISSION, editWin, picker, domRead, readCalendar, leave, editFromRow, addReviewerWindow} = require('./lib');

const RUN = process.env.PROBE_RUN || '';
const NB = process.env.NB === '1';
const EXTRA = process.env.EXTRA === '1';
const SLIDE = process.env.SLIDE === '1';
const sfx = RUN ? `-${RUN}` : '';

forEachApp(async (app) => {
    const A = app.name;
    if (!SUBMISSION[A]) { console.log(`[a54] ${A}: no review stage; skipped`); return; }
    const S = SUBMISSION[A];
    const log = (...a) => console.log(`[a54${sfx} ${A}]`, ...a);
    const fact = (k, v) => { record(`walk-facts${sfx}`, {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 900)); };
    const {EditorialDashboardPage} = require(path.join(__dirname, '../../../pages/EditorialDashboardPage.js'));

    const {page} = await launch(app);
    page.setDefaultTimeout(20000);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 200)}); await d.accept().catch(() => {}); });
    let n = 0;
    const snap = async (label) => {
        const name = `${RUN || 'main'}-${String(++n).padStart(2, '0')}-${label}`;
        record(name, await screen(page).catch((e) => ({screenError: flat(e.message, 200)})));
        await shot(page, name).catch(() => {});
        return name;
    };
    const dash = new EditorialDashboardPage(page, app.contextPath);
    const openDashboard = async () => {
        await dash.goto(S.view ? `?currentViewId=${S.view}` : '');
        await idle(page).catch(() => {});
        const row = dash.row(S.title).first();
        await row.waitFor({timeout: T});
        return row;
    };
    const openWorkflow = async () => {
        const row = await openDashboard();
        await dash.viewButton(row).first().click();
        await page.getByRole('table', {name: 'Reviewers', exact: true}).waitFor({timeout: T});
        await idle(page).catch(() => {});
        await sleep(600);
    };
    const step = async (key, fn) => {
        const out = {};
        try { await fn(out); } catch (e) { out.FAILED = flat(e.stack || e.message, 600); out.failSnap = await snap(`${key}-failed`).catch(() => null); }
        fact(key, out);
        return out;
    };

    await signIn(page, 'dbarnes', {contextPath: app.contextPath});
    await idle(page).catch(() => {});

    if (EXTRA || SLIDE) {
        const cdpAx = async (selector) => {
            const cdp = await page.context().newCDPSession(page);
            try {
                await cdp.send('Accessibility.enable');
                const {root} = await cdp.send('DOM.getDocument', {depth: 0});
                const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector});
                if (!nodeId) return {found: false};
                const {nodes} = await cdp.send('Accessibility.getPartialAXTree', {nodeId, fetchRelatives: false});
                const x = nodes[0] || {};
                const props = Object.fromEntries((x.properties || []).map((q) => [q.name, q.value && q.value.value]));
                return {role: x.role && x.role.value, name: x.name && x.name.value, description: x.description ? x.description.value : null,
                    value: x.value ? x.value.value : null, placeholder: props.placeholder || null, focusable: props.focusable || null};
            } finally { await cdp.detach().catch(() => {}); }
        };
        await step('extra', async (o) => {
            await openWorkflow();
            let w;
            if (!SLIDE) {
            w = await editFromRow(page, 'Julie Janssen');
            const ids = await w.locator('input.datepicker').evaluateAll((els) => els.map((e) => e.id));
            o.boxes = [];
            for (const id of ids) o.boxes.push({id, ax: await cdpAx(`[id="${id}"]`)});
            o.w1left = await leave(page, w, 'cancel');
            // a keyboard user in the second window: focus the box (as Tab does), Ctrl+Right, Enter
            w = await editFromRow(page, 'Paul Hudson');
            const box = w.locator('input.datepicker[id^="responseDueDate"]').first();
            o.kb = {before: await box.inputValue()};
            await box.focus();
            await picker(page).waitFor({state: 'visible', timeout: 10000}).catch(() => { o.kb.calendarNotVisible = true; });
            o.kb.dom = await domRead(page);
            o.kb.focused = await page.evaluate(() => document.activeElement && document.activeElement.id);
            await page.keyboard.press('Control+ArrowRight');
            await sleep(300);
            o.kb.highlighted = await picker(page).locator('.ui-datepicker-days-cell-over a').first().innerText().catch(() => null);
            await page.keyboard.press('Enter');
            await sleep(400);
            o.kb.after = {box: await box.inputValue(), posted: await w.locator('input[type="hidden"][name="responseDueDate"]').first().inputValue(),
                calendarVisible: await picker(page).isVisible(), windowOpen: await w.isVisible()};
            o.kb.snap = await snap('extra-keyboard');
            o.kb.left = await leave(page, w, 'cancel');
            return;
            }
            // a calendar opened while the window still slides in (3 s instead of 450 ms)
            await page.addStyleTag({content: ".DialogContent[data-state='open'] { animation-duration: 3000ms !important; }"});
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: 'Paul Hudson'}).first();
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const t0 = Date.now();
            w = editWin(page);
            const sbox = w.locator('input.datepicker[id^="responseDueDate"]').first();
            await sbox.waitFor({state: 'attached', timeout: T});
            await sbox.focus();
            await picker(page).waitFor({state: 'visible', timeout: 10000}).catch(() => {});
            const geo = () => page.evaluate(() => {
                const b = document.querySelector('[role="dialog"] form#editReviewForm input.datepicker[id^="responseDueDate"]');
                const c = document.getElementById('ui-datepicker-div');
                const d = b && b.closest('[role="dialog"]');
                const r = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return {x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width)}; };
                return {box: r(b), calendar: r(c), calendarParent: c && c.parentElement && c.parentElement.getAttribute('role'),
                    dialogTransform: d ? getComputedStyle(d).transform : null, calendarStyle: c ? {position: c.style.position, left: c.style.left, top: c.style.top} : null};
            });
            o.slide = {focusedAfterMs: Date.now() - t0, during: await geo()};
            await sleep(800);
            o.slide.mid = await geo();
            await sleep(3000);
            o.slide.after = await geo();
            o.slide.snap = await snap('extra-slide-after');
            await page.keyboard.press('Escape').catch(() => {});
            o.slide.left = await leave(page, w, 'cancel');
        });
        fact('dialogs', dialogs);
        return;
    }

    if (NB) {
        // the neighbour: a mouse user's pick in the second window of the page
        await step('nb', async (o) => {
            await openWorkflow();
            let w = await editFromRow(page, 'Julie Janssen');
            o.w1left = await leave(page, w, 'cancel');
            w = await editFromRow(page, 'Paul Hudson');
            const box = w.locator('input.datepicker[id^="reviewDueDate"]').first();
            o.before = {box: await box.inputValue(), posted: await w.locator('input[type="hidden"][name="reviewDueDate"]').first().inputValue()};
            await box.click();
            await picker(page).waitFor({state: 'visible', timeout: 10000});
            await sleep(500);
            o.dom = await domRead(page);
            // the first window's calendar was never opened: is this one given to a screen reader?
            o.ax = await axExposure(page, '#ui-datepicker-div');
            o.links = await picker(page).getByRole('link').count();
            o.exposed = !!(o.ax && o.ax.inTree && !o.ax.ignored && o.links > 0);
            const [b, c] = [await box.boundingBox(), await picker(page).boundingBox()];
            o.place = {box: b, calendar: c, underBox: !!(b && c && Math.abs(c.y - (b.y + b.height)) < 12 && Math.abs(c.x - b.x) < 12)};
            o.openSnap = await snap('nb-calendar-open');
            await picker(page).locator('td:not(.ui-datepicker-other-month) a').filter({hasText: /^28$/}).first().click();
            await sleep(500);
            o.picked = {box: await box.inputValue(), posted: await w.locator('input[type="hidden"][name="reviewDueDate"]').first().inputValue(),
                calendarVisible: await picker(page).isVisible()};
            await w.getByRole('button', {name: 'OK', exact: true}).click();
            await w.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await sleep(1200);
            o.afterSave = {windowOpen: await w.isVisible().catch(() => false), calendarVisible: await picker(page).isVisible(), dom: await domRead(page)};
            o.savedSnap = await snap('nb-saved');
            await openWorkflow();
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: 'Paul Hudson'}).first();
            o.rowAfterReload = flat(await row.innerText().catch(() => null), 300);
            o.db = sql(app, `select ra.date_due::date from review_assignments ra join users u on u.user_id = ra.reviewer_id where ra.submission_id = ${S.id} and u.username = 'phudson'`);
            o.reloadSnap = await snap('nb-reload');
        });
        fact('dialogs', dialogs);
        return;
    }

    // On the workflow: "Edit" (Julie Janssen), "Edit" (Paul Hudson), "Add Reviewer" (Aisla McCrae)
    await step('workflow', async (o) => {
        await openWorkflow();
        o.wfSnap = await snap('workflow');
        let w = await editFromRow(page, 'Julie Janssen');
        o.W1edit = await readCalendar(page, w, 'responseDueDate');
        o.W1edit.snap = await snap('w1-edit-calendar');
        o.W1edit.left = await leave(page, w, 'cancel');
        w = await editFromRow(page, 'Paul Hudson');
        o.W2edit = await readCalendar(page, w, 'responseDueDate');
        o.W2edit.snap = await snap('w2-edit-calendar');
        o.W2edit.left = await leave(page, w, 'cancel');
        w = await addReviewerWindow(page, {search: 'McCrae', name: 'Aisla McCrae'});
        o.W3add = await readCalendar(page, w, 'responseDueDate');
        o.W3add.snap = await snap('w3-add-calendar');
        o.W3add.left = await leave(page, w, 'close');
    });

    // On the dashboard (a fresh page): the first and the second reviewer's indicator › "Edit Due Date"
    await step('dashboard', async (o) => {
        const row = await openDashboard();
        o.dashSnap = await snap('dashboard');
        const indicators = dash.activityCellButtons(row);
        o.indicators = await indicators.evaluateAll((els) => els.map((b) => (b.getAttribute('aria-label') || b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120)));
        for (const i of [0, 1]) {
            const key = `W${i + 1}dash`;
            await dash.closeActivityPopover(row).catch(() => {});
            await indicators.nth(i).click();
            const pop = dash.activityPopover(row);
            await pop.getByRole('button', {name: 'Edit Due Date', exact: true}).waitFor({timeout: T});
            const popText = flat(await pop.innerText().catch(() => null), 200);
            await pop.getByRole('button', {name: 'Edit Due Date', exact: true}).click();
            const w = editWin(page);
            await w.locator('input.datepicker[id^="reviewDueDate"]').first().waitFor({timeout: T});
            await idle(page).catch(() => {});
            await sleep(600);
            o[key] = await readCalendar(page, w, 'responseDueDate');
            o[key].popover = popText;
            o[key].snap = await snap(`${key}-calendar`);
            o[key].left = await leave(page, w, 'cancel');
        }
    });
    fact('dialogs', dialogs);
});
