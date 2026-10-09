// U37 A34 issue walk (docs/issues/U37-A34-overdue-task-edit-refused.md): once a task's due date has passed, every
// "Save" in its "Edit" window is refused under "Due Date" until that date is moved, even when only "Name" changed.
//
// Runs on a dataset fleet (PKP's default test dataset, docs/process/dataset.md), reset first:
//   PROBE_FEATURE=<dataset feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/overdue-task-edit-refused/walk.js
// No assertions: each step records what the screen shows, and facts-<app>.json holds the reads. A step takes the
// state it finds (with the report's fix applied the "Edit" window closes on "Save"), so the same script shows the
// fault and the fix.
//
// The walk (the report's Steps), as dbarnes on OJS 3 and OMP 7 (Copyediting), OPS 1 (Production):
//   1-3. "Add" a task "hkrf overdue task" due today, owned by Daniel Barnes, begun on saving.
//   4.   The due date passes. A person waits a day; the script moves the stored due date one day back
//        (lib.js backdate()), the value step 3 would have saved the day before.
//   5-6. Row menu "Edit": "Due Date" shows the past date; change "Name" only; "Save".
//   7.   Reload, "Edit" again, tick a second participant only; "Save".
//   8.   Set "Due Date" to today; "Save".
//   Control: a second task, due in five days, renamed in "Edit".
//
// WALK=neighbour (run alone, PROBE_RUN of its own) is the check that the fix reaches no further than it should:
//   N1. "Add" with a date two days before today typed into "Due Date".
//   N2. "Edit" on an overdue task with "Due Date" changed to another past date; then to today.
//   N3. "Add Task Details" on a discussion with a past date typed.
//
// WALK=template (run alone, PROBE_RUN of its own) takes the report's steps 9-13: the same edit on tasks nobody made by
// hand, whose stored due date carries a time of day:
//   T1. Settings > Workflow > "Tasks and Discussions" > "Production Stage" > "Add template", twice: the task templates
//       "hkrf template A" and "hkrf template B", due "1 week" after creation, added automatically at the stage.
//   T2. OJS 3, OMP 7: "Send To Production", "Record Decision". OPS: ccorino submits the preprint "hkrf template preprint".
//   T3. "Production Tasks & Discussions" lists both tasks, with no owner.
//   T4. Task A, not yet due: "Edit", Daniel Barnes ticked and made its owner, "Save"; its stored date and its History.
//   T5. Task B, eight days later (lib.js backdate(), eight days): the same edit; its stored date and its History.
//
// On stable-3_5_0 (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front) the stage has no tasks: the script records the
// stage's discussions and the "Add discussion" window, and stops.
const probe = require('../../../probe');
const {forEachApp, launch, signIn, screen, idle, sql} = probe;
const L = require('./lib.js');

// Names of this script's own in the agent's folder, which other walks also write to.
const record = (name, data) => probe.record(`a34-${name}`, data);
const shot = (page, name) => probe.shot(page, `a34-${name}`);

const MODE = process.env.WALK || 'walk';
const TASK = 'hkrf overdue task';
const RENAMED = 'hkrf overdue task renamed';
const AHEAD = 'hkrf task due later';
const AHEAD_RENAMED = 'hkrf task due later renamed';
const N_PAST = 'hkrf neighbour past date';
const N_TASK = 'hkrf neighbour overdue task';
const N_DISCUSSION = 'hkrf neighbour discussion';
const TPL_A = 'hkrf template A';
const TPL_B = 'hkrf template B';
const PREPRINT = 'hkrf template preprint';
const SEND = {ojs: 3, omp: 7};

forEachApp(async (app) => {
    const w = L.W[app.name];
    const days = L.serverDays(app);
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: w.id, server: {tz: days.tz, today: days.today}};
    const step = async (name, fn) => {
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {failed: String(e.stack || e).split('\n').slice(0, 4).join(' | ')};
        }
        console.log(`[${app.name}]`, name, JSON.stringify(facts[name]));
    };
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});

        if (facts.line !== 'main') {
            await step('stage', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${w.id}&workflowMenuKey=${w.menuKey}`));
                await idle(page);
                await page.waitForTimeout(1500);
                const s = await screen(page);
                record('stage', s);
                await shot(page, 'stage');
                const add = page.getByRole('dialog').last().getByText(/Add discussion/i).first();
                let window_ = null;
                if (await add.isVisible().catch(() => false)) {
                    await add.click();
                    await idle(page);
                    await page.waitForTimeout(1500);
                    const d = await screen(page);
                    record('add-discussion', d);
                    window_ = L.flat(d.text.dialog, 1500);
                }
                const stage = L.flat(s.text.dialog, 3000);
                return {
                    tasksPanel: /Tasks & Discussions/.test(stage),
                    discussionsHeading: (stage.match(/(?:Copyediting |Production )?Discussions/) || [null])[0],
                    addDiscussion: window_,
                    mentionsDueDate: /Due Date/.test(window_ || ''),
                    mentionsTask: /task/i.test(window_ || ''),
                };
            });
            record('facts', facts);
            return;
        }

        let panel;
        if (MODE === 'template') {
            const due = () => sql(app, "SELECT title, date_due, created_by FROM edit_tasks WHERE title LIKE 'hkrf template %' ORDER BY title");
            let id = SEND[app.name];
            await step('t1-templates', async () => {
                const a = await L.addAutoTaskTemplate(page, app, TPL_A);
                const b = await L.addAutoTaskTemplate(page, app, TPL_B);
                record('t1-templates', await screen(page));
                return {window: a.filled, templates: b.templates};
            });
            await step('t2-stage-entry', async () => {
                if (app.name !== 'ops') return L.sendToProduction(page, app, id);
                const {submitAs} = require('../editorial-submitter-no-acknowledgement/lib.js');
                const sub = await submitAs(page, app, 'ccorino', PREPRINT);
                id = sub.id;
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                return {submitted: sub.id, problems: sub.problems};
            });
            await step('t3-tasks', async () => {
                panel = await L.openProductionPanel(page, app, id);
                record('t3-panel', await screen(page));
                return {a: await L.readRow(page, panel, TPL_A), b: await L.readRow(page, panel, TPL_B), stored: due()};
            });
            await step('t4-edit-not-yet-due', async () => {
                const read = await L.editAssignSelf(page, panel, TPL_A);
                record('t4-edit-not-yet-due', await screen(page));
                return {...read, stored: due(), row: await L.readRow(page, panel, TPL_A), history: await L.readHistory(page, panel, TPL_A, 't4')};
            });
            await step('t5-backdate', async () => L.backdate(app, TPL_B, 8));
            await step('t5-edit-overdue', async () => {
                const read = await L.editAssignSelf(page, panel, TPL_B);
                record('t5-edit-overdue', await screen(page));
                await shot(page, 't5-edit-overdue');
                return {...read, stored: due(), row: await L.readRow(page, panel, TPL_B), history: await L.readHistory(page, panel, TPL_B, 't5')};
            });
            record('facts', facts);
            return;
        }
        if (MODE === 'neighbour') {
            await step('n1-add-past-date', async () => {
                panel = await L.openPanel(page, app);
                const read = await L.addTask(page, panel, {name: N_PAST, dateDue: days.day(-2), message: 'Past date check.'});
                record('n1-add-past-date', await screen(page));
                return {typed: days.day(-2), ...read, row: await L.readRow(page, panel, N_PAST)};
            });
            await step('n2-add', async () => {
                panel = await L.openPanel(page, app);
                return L.addTask(page, panel, {name: N_TASK, dateDue: days.today, message: 'Please finish this.'});
            });
            await step('n2-backdate', async () => L.backdate(app, N_TASK, 1));
            await step('n2-edit-other-past-date', async () => {
                await panel.reland();
                const win = await panel.openEdit(N_TASK);
                const shown = await win.dueDate().inputValue();
                await win.dueDate().fill(days.day(-3));
                const read = await L.saveAndRead(page, win);
                record('n2-edit-other-past-date', await screen(page));
                let today = null;
                if (read.windowOpen) {
                    await win.dueDate().fill(days.today);
                    today = await L.saveAndRead(page, win);
                }
                return {shown, typed: days.day(-3), ...read, thenToday: today, row: await L.readRow(page, panel, N_TASK), stored: L.stored(app, N_TASK)};
            });
            await step('n3-add-discussion', async () => {
                panel = await L.openPanel(page, app);
                return L.addDiscussion(page, panel, {name: N_DISCUSSION, other: w.other, message: 'A question.'});
            });
            await step('n3-add-task-details-past-date', async () => {
                await panel.reland();
                const win = await panel.openEdit(N_DISCUSSION, 'Add Task Details');
                await win.taskBox().check();
                await win.dueDate().fill(days.day(-2));
                await win.ownerRadio(w.other).check();
                const read = await L.saveAndRead(page, win);
                record('n3-add-task-details-past-date', await screen(page));
                return {typed: days.day(-2), ...read, row: await L.readRow(page, panel, N_DISCUSSION), stored: L.stored(app, N_DISCUSSION)};
            });
            record('facts', facts);
            return;
        }

        // Steps 1-3.
        await step('s3-add', async () => {
            panel = await L.openPanel(page, app);
            const read = await L.addTask(page, panel, {name: TASK, dateDue: days.today, message: 'Please finish this.'});
            return {...read, row: await L.readRow(page, panel, TASK)};
        });
        // Step 4: the due date passes.
        await step('s4-backdate', async () => L.backdate(app, TASK, 1));
        await step('s4-row', async () => {
            const row = await L.readRow(page, panel, TASK);
            record('s4-panel', await screen(page));
            return row;
        });
        // Steps 5-6: "Edit", only "Name" changed, "Save".
        await step('s6-rename', async () => {
            const win = await panel.openEdit(TASK);
            const shown = await win.dueDate().inputValue();
            record('s5-edit-window', await screen(page));
            await win.nameField().fill(RENAMED);
            const read = await L.saveAndRead(page, win);
            record('s6-rename-save', await screen(page));
            await shot(page, 's6-rename-save');
            return {dueDateShown: shown, ...read, stored: L.stored(app, TASK)};
        });
        // Step 7: reload, "Edit" again, only a participant added, "Save". The task keeps its first name when step 6 was refused.
        let name = TASK;
        let win7 = null;
        await step('s7-add-participant', async () => {
            await panel.reland();
            if ((await panel.row(RENAMED).count()) > 0) name = RENAMED;
            win7 = await panel.openEdit(name);
            const shown = await win7.dueDate().inputValue();
            await win7.tick(w.other);
            const read = await L.saveAndRead(page, win7);
            record('s7-add-participant-save', await screen(page));
            return {taskName: name, dueDateShown: shown, ...read, stored: L.stored(app, TASK)};
        });
        // Step 8: the way round, in the window step 7 left open.
        await step('s8-move-due-date', async () => {
            if (!facts['s7-add-participant'] || !facts['s7-add-participant'].windowOpen) return {skipped: 'step 7 saved: the window is closed'};
            await win7.dueDate().fill(days.today);
            const read = await L.saveAndRead(page, win7);
            record('s8-move-due-date-save', await screen(page));
            return read;
        });
        await step('end-row', async () => ({row: await L.readRow(page, panel, name), stored: L.stored(app, TASK)}));
        await step('end-history', async () => L.readHistory(page, panel, name, 'end'));

        // Control: a task whose due date is ahead is renamed in "Edit".
        await step('control-add', async () => {
            await panel.reland();
            return L.addTask(page, panel, {name: AHEAD, dateDue: days.day(5), message: 'Due later.'});
        });
        await step('control-rename', async () => {
            await panel.reland();
            const win = await panel.openEdit(AHEAD);
            const shown = await win.dueDate().inputValue();
            await win.nameField().fill(AHEAD_RENAMED);
            const read = await L.saveAndRead(page, win);
            return {dueDateShown: shown, ...read, row: await L.readRow(page, panel, AHEAD_RENAMED)};
        });
        record('facts', facts);
    } catch (e) {
        facts.error = String(e && e.stack).slice(0, 800);
        record('error-screen', await screen(page).catch(() => null));
        record('facts', facts);
    } finally {
        await close();
    }
});
