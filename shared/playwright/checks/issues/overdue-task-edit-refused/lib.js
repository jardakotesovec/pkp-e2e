// Helpers of walk.js here (issue report docs/issues/U37-A34-overdue-task-edit-refused.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses, on PKP's default test dataset;
// the one exception is backdate(), which stands in for waiting a day (see there).
const {execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const {idle, screen, record, sql} = require('../../../probe');

const flat = (s, n = 700) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app: the dataset's submission, its stage's panel, and a second person on that stage (docs/process/dataset.md, `main`). */
const W = {
    ojs: {id: 3, menuKey: 'workflow_4', title: 'Copyediting Tasks & Discussions', other: 'mfritz'},
    omp: {id: 7, menuKey: 'workflow_4', title: 'Copyediting Tasks & Discussions', other: 'mfritz'},
    ops: {id: 1, menuKey: 'workflow_5', title: 'Production Tasks & Discussions', other: 'ccorino'},
};

/** The server's date today in its own time zone (the fleet's config `time_zone`), and the days around it. */
function serverDays(app) {
    const config = fs.readFileSync(path.resolve(__dirname, '../../../../..', app.configFile), 'utf8');
    const tz = ((config.match(/^\s*time_zone\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1] || 'UTC').trim();
    const day = (n) =>
        execFileSync('php', ['-r', `date_default_timezone_set(${JSON.stringify(tz)}); echo date('Y-m-d', strtotime('${n >= 0 ? '+' : ''}${n} day'));`], {encoding: 'utf8'}).trim();
    return {tz, today: day(0), day};
}

/** Open the submission's workflow at the stage; returns the panel. */
async function openPanel(page, app) {
    const {TasksDiscussionsPanel} = require('../../../pages/TasksDiscussionsPages.js');
    const w = W[app.name];
    const panel = new TasksDiscussionsPanel(page, app.contextPath, {title: w.title});
    await panel.gotoEditorial(w.id, w.menuKey);
    await idle(page);
    return panel;
}

/** Fill the "Add" window for a task owned by dbarnes, begun on saving, and press "Save"; returns the save's answer. */
async function addTask(page, panel, {name, dateDue, message}) {
    const win = await panel.openAdd();
    await win.nameField().fill(name);
    await win.taskBox().check();
    await win.dueDate().fill(dateDue);
    await win.ownerRadio('dbarnes').check();
    await win.typeMessage(message);
    return saveAndRead(page, win);
}

/** "Add": a discussion between dbarnes and `other`; "Save". */
async function addDiscussion(page, panel, {name, other, message}) {
    const win = await panel.openAdd();
    await win.nameField().fill(name);
    await win.tick(other);
    await win.typeMessage(message);
    return saveAndRead(page, win);
}

/**
 * Press "Save" in an item window and read what the screen then shows: the
 * answer's status and body, whether the window stayed, the line under
 * "Due Date", the summary beside the buttons and whether "Save" is greyed.
 */
async function saveAndRead(page, win) {
    const answer = await win.saveAndAnswer();
    await idle(page);
    await page.waitForTimeout(800);
    const open = (await win.root.count()) > 0 && (await win.root.isVisible().catch(() => false));
    const read = {status: answer.status(), windowOpen: open};
    if (answer.status() >= 400) read.body = await answer.json().catch(() => null);
    if (open) {
        read.dueDateBox = await win.dueDate().inputValue().catch(() => null);
        read.dueDateError = flat(await win.fieldError('dateDue').innerText({timeout: 3000}).catch(() => null));
        read.summary = await win.errorSummaryLine().catch(() => null);
        read.saveGreyed = await win.saveButton().isDisabled().catch(() => null);
    }
    return read;
}

/**
 * In place of waiting for the due date to pass: move the task's stored due
 * date `days` back. A task saved with a date as its "Due Date" stores that
 * day at midnight, so this is the value the same "Save" would have stored
 * `days` earlier. Returns the row (id, due date).
 */
function backdate(app, name, days = 1) {
    const title = name.replace(/'/g, "''");
    sql(app, `UPDATE edit_tasks SET date_due = date_due - INTERVAL '${Number(days)} day' WHERE title = '${title}'`);
    return sql(app, `SELECT edit_task_id, date_due, date_started, date_closed FROM edit_tasks WHERE title = '${title}'`);
}

/** The task as stored: name, due date, participants. */
function stored(app, name) {
    const title = name.replace(/'/g, "''");
    return {
        task: sql(app, `SELECT edit_task_id, title, date_due FROM edit_tasks WHERE title LIKE '${title}%'`),
        participants: sql(
            app,
            `SELECT u.username, p.is_responsible FROM edit_task_participants p JOIN users u ON u.user_id = p.user_id JOIN edit_tasks t ON t.edit_task_id = p.edit_task_id WHERE t.title LIKE '${title}%' ORDER BY u.username`
        ),
    };
}

/** Land afresh and read the item's row: its group, name line, "Activity" and "Due Date" (null when not listed). */
async function readRow(page, panel, name) {
    await panel.reland();
    await idle(page);
    const row = panel.row(name);
    if ((await row.count()) === 0) return null;
    const group = await row.first().evaluate((tr) => {
        let el = tr.previousElementSibling;
        while (el && !el.querySelector('th[scope="rowgroup"]')) el = el.previousElementSibling;
        return el ? el.innerText.trim() : null;
    });
    return {
        group,
        name: flat(await panel.nameCell(name).innerText()),
        activity: flat(await panel.activityCell(name).innerText()),
        dueDate: flat(await panel.dueDateCell(name).innerText()),
    };
}

/** Row menu › "History": every line, newest first; close it. */
async function readHistory(page, panel, name, label) {
    await panel.reland();
    const history = await panel.openHistory(name);
    const entries = await history.entries();
    record(`a34-${label}-history`, await screen(page));
    await history.close();
    return entries;
}

/** Settings › Workflow › "Tasks and Discussions" › "Production Stage" › "Add template": a task template due one week after creation, added automatically at the stage. */
async function addAutoTaskTemplate(page, app, name) {
    const {TaskTemplatesTab} = require('../../../pages/TasksDiscussionsPages.js');
    const tab = new TaskTemplatesTab(page, app.contextPath);
    await tab.goto();
    await idle(page);
    const win = await tab.openAdd(TEMPLATE_STAGE);
    await win.nameField().fill(name);
    await win.taskBox().check();
    await win.dueSelect().selectOption('P1W');
    await win.autoAddBox().check();
    await win.typeMessage('Please do this.');
    const filled = flat((await screen(page)).text.dialog, 900);
    await win.saveExpectClosed();
    await idle(page);
    return {filled, templates: await tab.templateNames(TEMPLATE_STAGE)};
}

/** The workflow of submission `id`: "Send To Production", "Continue" through the steps, "Record Decision", "View Submission Summary". */
async function sendToProduction(page, app, id) {
    await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?workflowSubmissionId=${id}`));
    await idle(page);
    await page.getByRole('button', {name: 'Send To Production', exact: true}).click();
    await page.getByRole('heading', {name: /^Send To Production(:|$)/, level: 1}).waitFor({timeout: 30_000});
    const mask = page.locator('.composer__loadingTemplateMask');
    const recordBtn = page.getByRole('button', {name: 'Record Decision', exact: true});
    for (let i = 0; i < 8; i++) {
        await mask.waitFor({state: 'detached', timeout: 30_000}).catch(() => {});
        await idle(page);
        if (await recordBtn.isVisible()) break;
        await page.getByRole('button', {name: 'Continue', exact: true}).click();
        await page.waitForTimeout(800);
    }
    const posted = page.waitForResponse((r) => r.url().includes('/decisions') && r.request().method() === 'POST', {timeout: 60_000});
    await recordBtn.click();
    const r = await posted;
    const done = page.getByRole('dialog').filter({has: page.getByRole('link', {name: 'View Submission Summary'})}).last();
    await done.waitFor({timeout: 30_000});
    await done.getByRole('link', {name: 'View Submission Summary'}).click();
    await idle(page);
    return {decision: r.status()};
}

/** Submission `id`'s "Production Tasks & Discussions"; returns the panel. */
async function openProductionPanel(page, app, id) {
    const {TasksDiscussionsPanel} = require('../../../pages/TasksDiscussionsPages.js');
    const panel = new TasksDiscussionsPanel(page, app.contextPath, {title: 'Production Tasks & Discussions'});
    await panel.gotoEditorial(id, 'workflow_5');
    await idle(page);
    return panel;
}

/** Row menu › "Edit" on a task nobody owns yet: tick Daniel Barnes, make him the owner, "Save". */
async function editAssignSelf(page, panel, name) {
    await panel.reland();
    const win = await panel.openEdit(name);
    const shown = await win.dueDate().inputValue();
    await win.tick('dbarnes');
    await win.ownerRadio('dbarnes').check();
    const read = await saveAndRead(page, win);
    return {dueDateShown: shown, ...read};
}

const TEMPLATE_STAGE = 'Production Stage';

module.exports = {
    TEMPLATE_STAGE,
    addAutoTaskTemplate,
    sendToProduction,
    openProductionPanel,
    editAssignSelf,
    flat, W, serverDays, openPanel, addTask, addDiscussion, saveAndRead, backdate, stored, readRow, readHistory};
