// Helpers of walk.js here (issue report docs/issues/U37-A32-task-boxes-screen-reader-shared-names.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses, on PKP's default test dataset.
const {idle} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** Per app: the dataset's submission in Production, opened by dbarnes. */
const SUBMISSION = {ojs: 5, omp: 4, ops: 1};
const PANEL = 'Production Tasks & Discussions';
const MENU_KEY = 'workflow_5';

/** A date `days` from today, year-month-day. */
function dayFromToday(days) {
    return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}

/**
 * A box as a screen reader gets it: `hears` is its role and name in the accessibility tree (the cell's aria
 * snapshot), `labelledby` the input's aria-labelledby with, per id, the text of the element it points at (null when
 * the page holds no such element), `labelAriaLabel` the aria-label of the <label> wrapped round the input.
 */
async function readName(cell) {
    const input = cell.locator('input[type="checkbox"]');
    const attrs = await input.evaluate((el) => {
        const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
        const label = el.closest('label');
        return {
            labelledby: ids.map((id) => {
                const target = document.getElementById(id);
                return {id, text: target ? target.innerText.replace(/\s+/g, ' ').trim() : null};
            }),
            ariaLabel: el.getAttribute('aria-label'),
            labelAriaLabel: label ? label.getAttribute('aria-label') : null,
        };
    });
    const snapshot = await cell.ariaSnapshot().catch(() => '');
    const m = /checkbox(?: "((?:[^"\\]|\\.)*)")?/.exec(snapshot);
    return {hears: m ? `checkbox "${m[1] == null ? '' : m[1]}"` : flat(snapshot, 200), ...attrs};
}

/** Open the submission's workflow at Production; returns the panel. */
async function openPanel(page, app) {
    const {TasksDiscussionsPanel} = require('../../../pages/TasksDiscussionsPages.js');
    const panel = new TasksDiscussionsPanel(page, app.contextPath, {title: PANEL});
    await panel.gotoEditorial(SUBMISSION[app.name], MENU_KEY);
    await idle(page);
    return panel;
}

/** "Add": a task `name` owned by dbarnes, due in a week, "Create Task (Do Not Start)", message, "Save". */
async function addTask(page, panel, name) {
    const win = await panel.openAdd();
    await win.nameField().fill(name);
    if (!(await win.participantBox('dbarnes').isChecked())) await win.tick('dbarnes');
    await win.taskBox().check();
    await win.dueDate().fill(dayFromToday(7));
    await win.ownerRadio('dbarnes').check();
    await win.startSelect().selectOption({label: 'Create Task (Do Not Start)'});
    await win.typeMessage('Please check.');
    await win.saveExpectClosed();
    await idle(page);
    await panel.reland();
}

/** The row's group ("Yet to begin", "In progress", "Closed"). */
async function rowGroup(panel, name) {
    const row = panel.row(name).first();
    await row.waitFor({timeout: 30_000});
    return row.evaluate((tr) => {
        let el = tr.previousElementSibling;
        while (el && !el.querySelector('th[scope="rowgroup"]')) el = el.previousElementSibling;
        return el ? el.innerText.replace(/\s+/g, ' ').trim() : null;
    });
}

/** The row's "Started" (td 3) or "Closed" (td 4) cell. */
function rowCell(panel, name, column) {
    return panel.row(name).locator('td').nth(column === 'Started' ? 3 : 4);
}

/** Settings › Workflow › "Tasks and Discussions": the tab, landed. */
async function openTemplates(page, app) {
    const {TaskTemplatesTab} = require('../../../pages/TasksDiscussionsPages.js');
    const tab = new TaskTemplatesTab(page, app.contextPath);
    await tab.goto();
    await idle(page);
    return tab;
}

/** Every template row of the tab: its stage group, its name and its "Auto-add at stage" box as readName() gives it. */
async function templateBoxes(tab) {
    const rows = tab.panel().locator('tbody tr').filter({has: tab.page.locator('input[type="checkbox"]')});
    const out = [];
    for (let i = 0, n = await rows.count(); i < n; i++) {
        const row = rows.nth(i);
        const where = await row.evaluate((tr) => {
            let el = tr.previousElementSibling;
            while (el && !el.querySelector('th[scope="rowgroup"]')) el = el.previousElementSibling;
            const th = tr.querySelector('th[scope="row"]');
            return {
                stage: el ? el.querySelector('th[scope="rowgroup"] span').innerText.replace(/\s+/g, ' ').trim() : null,
                template: th ? th.innerText.replace(/\s+/g, ' ').trim() : null,
            };
        });
        const cell = row.locator('td').filter({has: tab.page.locator('input[type="checkbox"]')}).first();
        out.push({...where, ...(await readName(cell))});
    }
    return out;
}

/** A table's column headers: the text and the id of each <th>. */
function columnHeaders(table) {
    return table.locator('thead th').evaluateAll((ths) => ths.map((th) => ({text: th.innerText.replace(/\s+/g, ' ').trim(), id: th.id || null})));
}

/** The ids more than one element of the page carries. */
function duplicateIds(page) {
    return page.evaluate(() => {
        const seen = {};
        document.querySelectorAll('[id]').forEach((el) => {
            if (el.id) seen[el.id] = (seen[el.id] || 0) + 1;
        });
        return Object.entries(seen)
            .filter(([, n]) => n > 1)
            .map(([id, n]) => `${id} x${n}`);
    });
}

module.exports = {sleep, flat, SUBMISSION, PANEL, MENU_KEY, dayFromToday, readName, openPanel, addTask, rowGroup, rowCell, openTemplates, templateBoxes, columnHeaders, duplicateIds};
