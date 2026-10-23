// U27 A50 (issue report docs/issues/U27-A50-enroll-reviewer-no-matches-hangs.md): in "Add Reviewer" ›
// "Enroll Existing User", the "No Matches" suggestion can be picked, and "Add Reviewer" then fails on
// the server with the window left on a spinner.
//
// On PKP's default test dataset, as `dbarnes`, on a submission in review (OJS 12, OMP 2). OPS has no
// review stage. Three modes (WALK_MODE):
//   steps (default)  the report's Steps: type "Janssen" (a reviewer), pick "No Matches", press
//                    "Add Reviewer", read the window 5 s on, reload and read the panel; then the menu
//                    for "Zqxwvu" (a name nobody has); then the control: Maria Fritz picked and added.
//   nb               the neighbour: Sarah Vogt picked in one tab, enrolled from a second tab, then
//                    "Add Reviewer" pressed in the first tab (a user who became a reviewer meanwhile).
//   keys             step 6 by keyboard: Enter alone after typing, then Arrow Down and Enter (with a note
//                    typed in the letter first), "Add Reviewer", and whether the note survives a reload.
// Each step records what it finds rather than throwing, so the same script reads the fixed code.
//
// Run (reset the dataset fleet first, each walk on a freshly loaded dataset):
//   npm run fleet-prep -- --feature issues-q23i --dataset 1 --reset
//   PROBE_FEATURE=issues-q23i PROBE_AGENT=q23i node bin/probe.js ojs shared/playwright/checks/issues/enroll-reviewer-no-matches-hangs/walk.js
//   (omp the same; WALK_MODE=nb for the neighbour; PROBE_RUN names a run's records.)
// stable-3_5_0: PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-q23i-3_5 PROBE_RUN=r35, after
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-q23i-3_5 --dataset 1 --reset
const {forEachApp, launch, signIn, screen, record, shot, loc} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.WALK_MODE || 'steps';
const SUB = {ojs: 12, omp: 2};

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, run: process.env.PROBE_RUN || null};
    const {context, page, close} = await launch(app);
    const answers = [];
    context.on('response', async (r) => {
        if (/get-users-not-assigned-as-reviewers/.test(r.url())) {
            answers.push({status: r.status(), body: L.flat(await r.text().catch(() => ''), 600)});
        }
    });
    const dialogs = [];
    context.on('page', (p) => p.on('dialog', async (dl) => (dialogs.push({type: dl.type(), message: dl.message()}), dl.accept().catch(() => {}))));
    page.on('dialog', async (dl) => (dialogs.push({type: dl.type(), message: dl.message()}), dl.accept().catch(() => {})));
    try {
        if (!SUB[app.name]) {
            facts.skipped = 'no review stage';
            return;
        }
        const id = SUB[app.name];
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        let modal = await L.openWorkflow(page, app, id);
        facts.stage = await L.stageHeading(modal);
        facts.rowsBefore = await L.rows(modal);

        if (MODE === 'steps') {
            // Steps 3-7: "Janssen", "No Matches", "Add Reviewer"
            const f = (facts.noMatches = {typed: 'Janssen'});
            let win = await L.openEnroll(page);
            record('a50-enroll-open', await screen(page));
            const t = await L.typeSearch(page, win, 'Janssen', answers);
            f.autocomplete = t.answer;
            f.menu = t.menu;
            record('a50-menu', await screen(page));
            await shot(page, 'a50-menu');
            const entry = L.menuEntry(page, 'No Matches');
            f.offered = (await entry.count()) > 0;
            if (f.offered) {
                await loc(page, '"No Matches" entry', entry);
                await entry.click();
                await L.sleep(400);
                f.afterPick = await L.fieldState(win);
                await page.keyboard.press('Tab'); // on to the button, as a person does
                await L.sleep(400);
                f.afterLeave = await L.fieldState(win);
                record('a50-picked', await screen(page));
                await shot(page, 'a50-picked');
                f.add = await L.pressAddAndRead(page, app, win, 'submitted');
            }
            // Step 8: reload, the panel
            modal = await L.openWorkflow(page, app, id);
            f.rowsAfterReload = await L.rows(modal);
            record('a50-reloaded', await screen(page));

            // a name nobody has: the menu only
            const z = (facts.nobody = {typed: 'Zqxwvu'});
            win = await L.openEnroll(page);
            const tz = await L.typeSearch(page, win, 'Zqxwvu', answers);
            z.autocomplete = tz.answer;
            z.menu = tz.menu;

            // Control: Maria Fritz, in a fresh window
            const c = (facts.control = {typed: 'Fritz'});
            modal = await L.openWorkflow(page, app, id);
            win = await L.openEnroll(page);
            const tc = await L.typeSearch(page, win, 'Fritz', answers);
            c.menu = tc.menu;
            const pick = L.menuEntry(page, 'Maria Fritz');
            if ((await pick.count()) > 0) {
                await pick.click();
                await L.sleep(400);
                c.afterPick = await L.fieldState(win);
                c.add = await L.pressAddAndRead(page, app, win, 'control-submitted');
                modal = await L.openWorkflow(page, app, id);
                c.rowsAfterReload = await L.rows(modal);
            } else {
                c.add = 'Maria Fritz not offered';
            }
        } else if (MODE === 'keys') {
            // Step 6 by keyboard, and what a reload keeps of a message typed before
            const k = (facts.keys = {});
            // Enter alone after typing (no entry focused)
            let win = await L.openEnroll(page);
            await L.typeSearch(page, win, 'Zqxwvu', answers);
            const enterOnly = page
                .waitForResponse((r) => /\/reviewer-grid\/enroll-reviewer/.test(r.url()) && r.request().method() === 'POST', {timeout: 6_000})
                .catch(() => null);
            await win.searchByName().press('Enter');
            const r0 = await enterOnly;
            await L.sleep(800);
            k.enterOnly = {
                requestSent: !!r0,
                status: r0 ? r0.status() : null,
                field: await L.fieldState(win),
                fieldMessages: await win.dialog().locator('label.error:visible').allInnerTexts().catch(() => []),
            };
            // A note in the letter, then "Janssen", Arrow Down and Enter, then "Add Reviewer"
            modal = await L.openWorkflow(page, app, id);
            win = await L.openEnroll(page);
            const NOTE = 'hkq23i note for the reviewer';
            await win.appendToMessage(NOTE).catch((e) => (k.noteError = String(e.message).slice(0, 200)));
            const t = await L.typeSearch(page, win, 'Janssen', answers);
            k.menu = t.menu;
            await win.searchByName().press('ArrowDown');
            await L.sleep(300);
            k.afterArrow = await L.fieldState(win);
            await win.searchByName().press('Enter');
            await L.sleep(500);
            k.afterEnter = await L.fieldState(win);
            record('a50-keys-picked', await screen(page));
            k.add = await L.pressAddAndRead(page, app, win, 'keys-submitted');
            // reload, open the form again: is the note still in the letter?
            modal = await L.openWorkflow(page, app, id);
            k.rowsAfterReload = await L.rows(modal);
            win = await L.openEnroll(page);
            const letter = await win.messageBody().innerText().catch(() => null);
            k.noteAfterReload = letter == null ? null : letter.includes(NOTE);
            k.letterStart = L.flat(letter, 120);
        } else {
            // Neighbour: Sarah Vogt picked here, enrolled from a second tab first
            const n = (facts.stale = {typed: 'Vogt'});
            const winA = await L.openEnroll(page);
            const ta = await L.typeSearch(page, winA, 'Vogt', answers);
            n.menuA = ta.menu;
            const pickA = L.menuEntry(page, 'Sarah Vogt');
            if ((await pickA.count()) === 0) {
                n.result = 'Sarah Vogt not offered';
                return;
            }
            await pickA.click();
            await L.sleep(400);
            n.afterPickA = await L.fieldState(winA);

            const pageB = await context.newPage();
            await L.openWorkflow(pageB, app, id);
            const winB = await L.openEnroll(pageB);
            await L.typeSearch(pageB, winB, 'Vogt', answers);
            const pickB = L.menuEntry(pageB, 'Sarah Vogt');
            if ((await pickB.count()) > 0) {
                await pickB.click();
                await L.sleep(400);
                n.addB = await L.pressAddAndRead(pageB, app, winB, 'nb-tab2-submitted');
            } else {
                n.addB = 'Sarah Vogt not offered in the second tab';
            }
            await pageB.close();

            await page.bringToFront();
            n.addA = await L.pressAddAndRead(page, app, winA, 'nb-tab1-submitted');
            modal = await L.openWorkflow(page, app, id);
            n.rowsAfterReload = await L.rows(modal);
            record('a50-nb-reloaded', await screen(page));
        }
    } catch (e) {
        facts.error = String(e && e.stack).slice(0, 900);
        await shot(page, 'a50-error').catch(() => {});
    } finally {
        facts.dialogs = dialogs;
        record('a50-facts', facts);
        await close();
    }
});
