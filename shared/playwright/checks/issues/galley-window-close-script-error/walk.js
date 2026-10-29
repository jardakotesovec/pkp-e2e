// Issue walk, U46 A9 (docs/specs/U46-galleys.md#a9): on 3.5 the "Create New Galley" window's
// header "Close" makes the page's script fail; its "Cancel" does not.
//
// Runs on a dataset fleet (PKP's default test dataset), as `dbarnes`:
//   OJS: "Genetic transformation of forest trees" (submission 5), Publication › "Galleys"
//   OPS: "The influence of lactation …" (submission 1), Preprint › "Galleys"
// Modes (MODE=…), each run on its own:
//   steps  (default) the report's Steps 1–6 and the Control: header "Close" unchanged; "Galley Label" typed,
//          header "Close", "OK"; "Cancel" (the control). Saves nothing.
//   save   the fix trial's check of the saved path: "Galley Label" "h29g" › "Save" must still close the
//          window and open "Upload a File Ready for Publication" for the new galley, which then
//          shows in the list (the path that reads the new galley's id). Saves a galley: reset after.
//   issue  OJS only, the same fault in the issue window on 3.5: "Schedule For Publication" › "Select an
//          issue to schedule for publication" › header "Close"; Publication › "Issue" › "Assign to
//          Issue" › the same window › header "Close". Saves nothing.
// Every step records the page errors and console errors it raised (own listeners, a 1.5 s wait
// after the close, since the failure comes from the close's callback) and never throws past itself.
//
//   main: PROBE_FEATURE=issues-h29g PROBE_AGENT=h29g node bin/probe.js <ojs|ops> \
//           shared/playwright/checks/issues/galley-window-close-script-error/walk.js
//   3.5:  PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h29g-3_5 PROBE_AGENT=h29g \
//           node bin/probe.js <ojs|ops> shared/playwright/checks/issues/galley-window-close-script-error/walk.js
const {expect} = require('@playwright/test');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, sql} = require('../../../probe');

const MODE = process.env.MODE || 'steps';
const PLAN = {
    ojs: {sub: 5, group: 'Publication'},
    ops: {sub: 1, group: 'Preprint'},
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    const plan = PLAN[app.name];
    if (!plan) return; // OMP: a press has no galleys
    if (MODE === 'issue' && app.name !== 'ojs') return;
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${plan.sub}`));
    const stored = () => sql(app, `select galley_id || '|' || coalesce(label, '') from publication_galleys where publication_id = ${pub} order by seq, galley_id`).split('\n').filter(Boolean);
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager, GalleyWindow, GALLEYS_TEXT: TEXT} = require('../../../pages/GalleysPages.js');
    const run = process.env.PROBE_RUN || 'main';
    const name = `walk-${MODE}`;
    const out = {app: app.name, line: app.line || 'main', mode: MODE, user: 'dbarnes', submission: plan.sub, publication: pub, steps: {}};

    const {page, close} = await launch(app);
    let cur = 'start';
    const errors = [];
    const dialogs = [];
    page.on('pageerror', (e) => errors.push({step: cur, kind: 'pageerror', text: flat(e.message), stack: flat(e.stack, 600)}));
    page.on('console', (m) => { if (m.type() === 'error') errors.push({step: cur, kind: 'console', text: flat(m.text())}); });
    page.on('dialog', async (d) => { dialogs.push({step: cur, type: d.type(), message: flat(d.message())}); await d.accept().catch(() => {}); });
    const step = async (key, fn) => {
        cur = key;
        const e0 = errors.length;
        const d0 = dialogs.length;
        try {
            out.steps[key] = await fn();
        } catch (e) {
            out.steps[key] = {error: flat(e.message, 500)};
            await shot(page, `${name}-${run}-fail-${key}`).catch(() => {});
        }
        await sleep(1500);
        out.steps[key] = {...out.steps[key], errors: errors.slice(e0), dialogs: dialogs.slice(d0)};
        record(name, out);
    };

    try {
        await signIn(page, 'dbarnes');
        const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: plan.group}});
        // the side menu, as a person opens it (3.5 names a version's page without its id)
        const openMenuPage = async (label) => {
            await page.goto('about:blank');
            await frame.gotoEditorial(plan.sub);
            await idle(page);
            const link = frame.menuLink(label);
            if (!(await link.last().isVisible().catch(() => false))) {
                if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) await frame.latestVersionNode().click();
                else await frame.publicationGroup().click();
            }
            await expect(link.last()).toBeVisible({timeout: 30_000});
            await link.last().click();
            await idle(page);
        };
        const g = new GalleyManager(page, frame);
        const openGalleys = async () => {
            await openMenuPage('Galleys');
            await g.expectLoaded();
            await idle(page);
        };
        const winOpen = async () => {
            await g.addButton().click();
            const win = new GalleyWindow(page, TEXT.createTitle);
            await win.expectLoaded();
            await idle(page);
            return win;
        };
        const gone = async (dialog) => {
            await expect(dialog).toHaveCount(0, {timeout: 15_000}).catch(() => {});
            await idle(page);
            return (await dialog.count()) === 0;
        };

        if (MODE === 'steps') {
            await step('3-galleys', async () => {
                await openGalleys();
                await loc(page, 'Galleys: "Add galley"', g.addButton());
                return {screen: await screen(page), labels: await g.labels(), stored: stored()};
            });
            if (out.steps['3-galleys'].error) return;
            await step('4-5-close-unchanged', async () => {
                const win = await winOpen();
                const w = await screen(page);
                await shot(page, `${name}-${run}-create-window`);
                await loc(page, 'Create New Galley: header "Close"', win.closeButton());
                await win.closeButton().click();
                const closed = await gone(win.dialog());
                return {window: w.text.dialog, closed, labels: await g.labels(), stored: stored()};
            });
            await step('6-typed-close-ok', async () => {
                const win = await winOpen();
                await win.type(win.labelBox(), 'h29g');
                await win.closeButton().click(); // the question is a browser confirm: the listener answers "OK"
                const closed = await gone(win.dialog());
                return {closed, labels: await g.labels(), stored: stored()};
            });
            await step('7-cancel', async () => {
                const win = await winOpen();
                await win.type(win.labelBox(), 'h29g');
                await win.cancelControl().click();
                const closed = await gone(win.dialog());
                return {closed, labels: await g.labels(), stored: stored()};
            });
            await step('after-reload', async () => {
                await page.reload();
                await g.expectLoaded().catch(() => {});
                await idle(page);
                return {labels: await g.labels(), stored: stored()};
            });
            await shot(page, `${name}-${run}-end`);
        } else if (MODE === 'save') {
            await step('galleys', async () => {
                await openGalleys();
                return {labels: await g.labels(), stored: stored()};
            });
            if (out.steps.galleys.error) return;
            await step('save-opens-upload', async () => {
                const win = await winOpen();
                await win.type(win.labelBox(), 'h29g');
                await win.saveButton().click();
                const createGone = await gone(win.dialog());
                const upload = page.getByRole('dialog', {name: 'Upload a File Ready for Publication', exact: true});
                const uploadOpened = await upload.isVisible({timeout: 20_000}).catch(() => false)
                    || await expect(upload).toBeVisible({timeout: 20_000}).then(() => true).catch(() => false);
                await idle(page);
                const s = await screen(page);
                await shot(page, `${name}-${run}-upload-window`);
                let uploadClosed = null;
                if (uploadOpened) {
                    await upload.getByRole('button', {name: 'Close', exact: true}).first().click();
                    uploadClosed = await gone(upload);
                }
                await sleep(1000);
                return {createGone, uploadOpened, uploadWindow: s.text.dialog, uploadClosed, labels: await g.labels(), stored: stored()};
            });
        } else if (MODE === 'issue') {
            const selectIssue = () => page.getByRole('dialog', {name: 'Select an issue to schedule for publication', exact: true});
            const closeSelect = async (key) => {
                await expect(selectIssue()).toBeVisible({timeout: 30_000});
                await idle(page);
                const s = await screen(page);
                await shot(page, `${name}-${run}-${key}`);
                await selectIssue().getByRole('button', {name: 'Close', exact: true}).first().click();
                return {window: s.text.dialog, closed: await gone(selectIssue())};
            };
            await step('schedule-select-issue-close', async () => {
                await openGalleys();
                const btn = page.getByRole('button', {name: 'Schedule For Publication', exact: true});
                await loc(page, 'header "Schedule For Publication"', btn);
                await btn.first().click();
                return closeSelect('schedule');
            });
            await step('issue-assign-close', async () => {
                await openMenuPage('Issue');
                const btn = page.getByRole('button', {name: 'Assign to Issue', exact: true});
                await expect(btn.first()).toBeVisible({timeout: 30_000});
                await loc(page, 'Issue: "Assign to Issue"', btn);
                await btn.first().click();
                return closeSelect('assign');
            });
        }
    } finally {
        out.errorsTotal = errors.length;
        record(name, out);
        await close();
    }
});
