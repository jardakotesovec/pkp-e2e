// U37 A32 walk (issue report docs/issues/U37-A32-task-boxes-screen-reader-shared-names.md).
// On PKP's default test dataset, as dbarnes, at the Production stage of OJS 5, OMP 4, OPS 1:
//   "Add" a task "hkri task" (owner dbarnes, "Create Task (Do Not Start)"); read the row's "Started" and "Closed" boxes
//   as a screen reader hears them (the accessibility tree) and what their aria-labelledby points at; then on
//   Settings › Workflow › "Tasks and Discussions" read every template's "Auto-add at stage" box the same way, and the
//   names of the "Add template" buttons.
//   PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/task-boxes-screen-reader-shared-names/walk.js
// With `neighbour` after the script's path it runs the neighbour check alone (what a fix must leave as it is):
//   the dashboard's table (its column headers, a sort press), a box named by a file's name ("Add" › "Attach Files" ›
//   "Attach Workflow Files"), "Yes" on "Start this task" for a task "hkri nb task", "No" on a template's "Confirm
//   Automatic Addition", and the ids any page carries twice.
// On stable-3_5_0 (PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front) the stage has the legacy discussions grid and
// Settings › Workflow no "Tasks and Discussions" tab: the script records both and stops.
const {forEachApp, launch, signIn, screen, record, idle} = require('../../../probe');
const L = require('./lib.js');

const NEIGHBOUR = process.argv.includes('neighbour');
const TASK = NEIGHBOUR ? 'hkri nb task' : 'hkri task';

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line || 'main', mode: NEIGHBOUR ? 'neighbour' : 'steps'};
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
                await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${L.SUBMISSION[app.name]}&workflowMenuKey=${L.MENU_KEY}`));
                await idle(page);
                await L.sleep(1500);
                const s = await screen(page);
                record('a32-stage', s);
                return {
                    vuePanel: await page.locator('[data-cy="discussion-manager"]').count(),
                    legacyGrid: await page.locator('[id^="component-grid-queries"]').count(),
                    gridBoxes: await page.locator('[id^="component-grid-queries"] input[type="checkbox"]').count(),
                    dialog: L.flat(s.text.dialog, 1200),
                };
            });
            await step('settingsWorkflow', async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/workflow`));
                await idle(page);
                const tabs = (await page.getByRole('tab').allInnerTexts()).map((t) => L.flat(t));
                record('a32-settings-workflow', await screen(page));
                return {tabs, tasksTab: tabs.includes('Tasks and Discussions')};
            });
            record('a32-facts', facts);
            return;
        }

        let panel;
        if (!NEIGHBOUR) {
            // Steps 1-2
            await step('add', async () => {
                panel = await L.openPanel(page, app);
                await L.addTask(page, panel, TASK);
                return {group: await L.rowGroup(panel, TASK), columns: await L.columnHeaders(panel.root())};
            });
            // Step 3
            await step('rowBoxes', async () => {
                const started = await L.readName(L.rowCell(panel, TASK, 'Started'));
                const closed = await L.readName(L.rowCell(panel, TASK, 'Closed'));
                record('a32-panel', await screen(page));
                return {started, closed, sameName: started.hears === closed.hears};
            });
            // Step 4
            await step('templates', async () => {
                const tab = await L.openTemplates(page, app);
                const boxes = await L.templateBoxes(tab);
                const names = [...new Set(boxes.map((b) => b.hears))];
                const addButtons = await tab.panel().getByRole('button', {name: /Add template/}).evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-labelledby')));
                const addNames = L.flat(await tab.panel().locator('tbody').ariaSnapshot(), 20000).match(/button "[^"]*Add template[^"]*"/g) || [];
                record('a32-templates', await screen(page));
                return {columns: await L.columnHeaders(tab.panel()), count: boxes.length, names, boxes, addTemplate: {count: addButtons.length, labelledby: [...new Set(addButtons)], names: [...new Set(addNames)]}};
            });
            record('a32-facts', facts);
            return;
        }

        // The neighbour check.
        await step('dashboard', async () => {
            await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?currentViewId=active`));
            await idle(page);
            const table = page.locator('main table').first();
            const before = await L.columnHeaders(table);
            const firstRow = L.flat(await table.locator('tbody tr').first().innerText(), 80);
            const sort = table.locator('thead th button').first();
            const sortName = L.flat(await sort.innerText());
            await sort.click();
            await idle(page);
            await L.sleep(800);
            record('a32-nb-dashboard', await screen(page));
            return {columns: before, sortPressed: sortName, address: page.url().replace(/^[^?]*/, ''), firstRowBefore: firstRow, firstRowAfter: L.flat(await table.locator('tbody tr').first().innerText(), 80), duplicateIds: await L.duplicateIds(page)};
        });
        await step('fileBox', async () => {
            panel = await L.openPanel(page, app);
            const win = await panel.openAdd();
            const attach = await win.openAttachFiles();
            await attach.openWorkflowFiles();
            const stages = (await attach.stageSelect().locator('option').allInnerTexts()).map((s) => L.flat(s));
            for (const stage of stages) {
                await attach.chooseStage(stage);
                await idle(page);
                await L.sleep(800);
                if (!(await attach.workflowRoot.locator('tbody input[type="checkbox"]').count())) continue;
                const row = attach.workflowRoot.locator('tbody tr').filter({has: page.locator('input[type="checkbox"]')}).first();
                const cell = row.locator('td').filter({has: page.locator('input[type="checkbox"]')}).first();
                record('a32-nb-file-box', await screen(page));
                return {stage, row: L.flat(await row.innerText(), 120), box: await L.readName(cell), columns: await L.columnHeaders(attach.workflowRoot)};
            }
            return {stages, files: 'none listed'};
        });
        await step('startYes', async () => {
            await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial`));
            panel = await L.openPanel(page, app);
            await L.addTask(page, panel, TASK);
            const before = {group: await L.rowGroup(panel, TASK), started: await L.readName(L.rowCell(panel, TASK, 'Started')), closed: await L.readName(L.rowCell(panel, TASK, 'Closed'))};
            await panel.pressBox(TASK, 'Started');
            await panel.answerRowQuestion('Start this task', 'Yes');
            await idle(page);
            await panel.reland();
            record('a32-nb-started', await screen(page));
            return {before, after: {group: await L.rowGroup(panel, TASK), startedChecked: await panel.startedBox(TASK).isChecked()}, columns: await L.columnHeaders(panel.root()), duplicateIds: await L.duplicateIds(page)};
        });
        await step('autoAddNo', async () => {
            const tab = await L.openTemplates(page, app);
            const first = (await L.templateBoxes(tab))[0];
            const q = await tab.pressAutoAdd(first.template, first.stage);
            const question = L.flat(await q.root.innerText(), 300);
            await q.answer('No');
            await idle(page);
            record('a32-nb-templates', await screen(page));
            return {template: first.template, stage: first.stage, box: first.hears, question, checkedAfterReload: await (async () => { const t = await L.openTemplates(page, app); return t.autoAddBox(first.template, first.stage).isChecked(); })(), duplicateIds: await L.duplicateIds(page)};
        });
        record('a32-neighbour', facts);
    } finally {
        await close();
    }
});
