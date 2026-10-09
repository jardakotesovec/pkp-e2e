// Helpers of walk.js here (issue report docs/issues/U37-A36-taken-off-manager-reply-unexpected-error.md).
// Requiring this file runs nothing. Every helper drives the screens a person uses, on PKP's default
// test dataset: the stage's "Tasks & Discussions" panel (main) through the shared page objects
// (pages/TasksDiscussionsPages.js), and on stable-3_5_0 the stage's older "Discussions" grid, whose
// address and grid locator are the U37 A3 walk's (../writer-told-of-own-message/lib.js).
const {screen, record, idle} = require('../../../probe');
const A3 = require('../writer-told-of-own-message/lib.js');

const {sleep, flat, grid, openWorkflow35} = A3;

/**
 * Per app, on PKP's default test dataset (docs/process/dataset.md): the submission and its stage;
 * `manager` writes the discussion and is the manager-level person taken off, `editor` the manager who
 * takes them off; `others` the two people ticked beside the writer. In the control the first of
 * `others` is the one taken off (not manager-level) and the second stays and replies.
 */
const WORDS = {
    ojs: {id: 3, menuKey: 'workflow_4', stage: 'Copyediting', manager: 'dbarnes', managerName: 'Daniel Barnes', editor: 'rvaca', others: ['dbuskins', 'mfritz'], otherNames: ['David Buskins', 'Maria Fritz'], otherRoles: ['Section editor', 'Copyeditor']},
    omp: {id: 7, menuKey: 'workflow_4', stage: 'Copyediting', manager: 'dbarnes', managerName: 'Daniel Barnes', editor: 'rvaca', others: ['mfritz', 'dkennepohl'], otherNames: ['Maria Fritz', 'Dietmar Kennepohl'], otherRoles: ['Copyeditor', 'Author']},
    ops: {id: 1, menuKey: 'workflow_5', stage: 'Production', manager: 'dbarnes', managerName: 'Daniel Barnes', editor: 'rvaca', others: ['dbuskins', 'sberardo'], otherNames: ['David Buskins', 'Stephanie Berardo'], otherRoles: ['Moderator', 'Moderator']},
};

const NOTE_PATH = /\/tasks\/\d+\/notes?$/;

/** The stage's panel in `page` (main). */
function panelOf(page, app, w) {
    const {TasksDiscussionsPanel} = require('../../../pages/TasksDiscussionsPages.js');
    return new TasksDiscussionsPanel(page, app.contextPath, {title: `${w.stage} Tasks & Discussions`});
}

/** "Add": the name, the people ticked, the message, "Save". Returns the answer's status and the boxes as they stood. */
async function addDiscussion(page, panel, {name, tick, message, label}) {
    const win = await panel.openAdd();
    await win.nameField().fill(name);
    for (const username of tick) await win.tick(username);
    await win.typeMessage(message);
    const boxes = await win.participants().catch(() => null);
    record(`${label}-add-window`, await screen(page));
    const answer = await win.saveAndAnswer();
    const status = answer.status();
    await win.root.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await idle(page);
    await panel.reland();
    return {status, boxes};
}

/** Row menu › "Edit": the person unticked, "Save". Returns the boxes before, the answer's status and its text when refused. */
async function untickInEdit(page, panel, name, username, label) {
    const win = await panel.openEdit(name);
    const before = await win.participants().catch(() => null);
    await win.tick(username, false);
    record(`${label}-edit-window`, await screen(page));
    const answer = await win.saveAndAnswer();
    const out = {before, status: answer.status()};
    if (out.status >= 400) out.answer = flat(await answer.text().catch(() => ''), 300);
    await win.root.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
    await idle(page);
    return out;
}

/**
 * In the item's window already open: "Add New Message", the text, "Save". Takes the state it finds:
 * no "Add New Message" is recorded, not thrown. Returns the request's status and answer, the "Error"
 * window's text and buttons, and the messages the window lists after.
 */
async function replyInOpenWindow(page, win, text, label) {
    const out = {addNewMessageOffered: (await win.addNewMessageButton().count()) > 0};
    if (!out.addNewMessageOffered) {
        out.noAccessLine = flat(await win.noAccessLine().innerText().catch(() => null));
        record(`${label}-no-button`, await screen(page));
        return out;
    }
    await win.addNewMessage();
    await win.typeReply(text);
    const answered = page.waitForResponse((r) => NOTE_PATH.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: 30_000}).catch(() => null);
    await win.pressSave();
    const answer = await answered;
    out.status = answer ? answer.status() : null;
    out.answer = answer ? flat(await answer.text().catch(() => ''), 300) : null;
    await sleep(1200);
    const error = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'OK', exact: true})}).last();
    out.errorWindow = (await error.count()) ? flat(await error.innerText().catch(() => null), 400) : null;
    out.saved = (await win.savedStatus().count()) > 0;
    record(`${label}-after-save`, await screen(page));
    if (out.errorWindow) {
        // "OK" closes "Error": what the item's window behind it still holds (the typed reply, "Save").
        await error.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await sleep(500);
        const id = await win.replyEditorId().catch(() => null);
        out.afterOk = {
            windowOpen: (await win.root.count()) > 0,
            replyBox: id ? flat(await page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : null), id).catch(() => null), 200) : null,
            saveEnabled: await win.saveButton().isEnabled().catch(() => null),
        };
        record(`${label}-after-ok`, await screen(page));
    }
    out.messages = await messagesOf(win);
    return out;
}

/**
 * The row's name pressed on the page as it stands (no reload): what the window opened now offers.
 * Takes what it finds; when "Add New Message" is offered the reply is tried as in replyInOpenWindow.
 */
async function openWithoutReload(page, panel, name, text, label) {
    const {DiscussionWindow} = require('../../../pages/TasksDiscussionsPages.js');
    const out = {rowListed: (await panel.nameButton(name).count()) > 0};
    if (!out.rowListed) {
        record(`${label}-panel`, await screen(page));
        return out;
    }
    await panel.nameButton(name).click();
    const win = new DiscussionWindow(page, name);
    await win.expectReady({participants: false});
    await sleep(1500);
    await idle(page);
    out.participants = await win.participantUsernames().catch(() => null);
    out.addNewMessageOffered = (await win.addNewMessageButton().count()) > 0;
    out.noAccessLine = flat(await win.noAccessLine().innerText().catch(() => null));
    record(`${label}-window`, await screen(page));
    if (out.addNewMessageOffered) out.reply = await replyInOpenWindow(page, win, text, `${label}-reply`);
    return out;
}

/** The window's messages as "head | body". */
async function messagesOf(win) {
    const n = await win.messages().count().catch(() => 0);
    const out = [];
    for (let i = 0; i < n; i++) {
        out.push(`${flat(await win.messageHead(i).innerText().catch(() => null), 120)} | ${flat(await win.messageBody(i).innerText().catch(() => null), 160)}`);
    }
    return out;
}

/**
 * The page landed afresh, then the row's name pressed when the row is listed: the messages, whether
 * "Add New Message" is offered, the no-access line. The window is closed after.
 */
async function readAfterReload(page, panel, name, label) {
    const {DiscussionWindow} = require('../../../pages/TasksDiscussionsPages.js');
    await panel.reland();
    const out = {rowListed: (await panel.nameButton(name).count()) > 0};
    if (!out.rowListed) {
        record(`${label}-panel`, await screen(page));
        return out;
    }
    await panel.nameButton(name).click();
    const win = new DiscussionWindow(page, name);
    await win.expectReady({participants: false});
    await sleep(800);
    out.participants = await win.participantUsernames().catch(() => null);
    out.messages = await messagesOf(win);
    out.addNewMessageOffered = (await win.addNewMessageButton().count()) > 0;
    out.noAccessLine = flat(await win.noAccessLine().innerText().catch(() => null));
    record(`${label}-window`, await screen(page));
    await win.close().catch(() => {});
    return out;
}

// ---------------------------------------------------------------------------------------------
// stable-3_5_0: the stage's legacy "Discussions" grid.

const queryForm = (page) => page.locator('form#queryForm').last();
const gridRow = (page, subject) => grid(page).locator('tbody tr.gridRow').filter({hasText: subject}).last();
const boxOf = (form, page, fullName) => form.locator('label', {hasText: fullName}).locator('input[type="checkbox"]').first();
const boxes35 = (form, page) => form.locator('label').filter({has: page.locator('input[type="checkbox"]')}).evaluateAll((ls) => ls.map((l) => `${l.querySelector('input').checked ? '[x]' : '[ ]'} ${l.innerText.replace(/\s+/g, ' ').trim()}`));

async function typeInEditor35(page, form, text) {
    const id = await form.locator('textarea[name="comment"]').getAttribute('id');
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 30_000});
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.type(text);
}

/** "Add discussion": the people ticked by full name, "Subject", "Message", "OK". */
async function addQuery35(page, {tickNames, subject, message, label}) {
    await grid(page).getByText(/Add discussion/i).first().click();
    const form = queryForm(page);
    await form.waitFor({timeout: 30_000});
    await idle(page);
    const notListed = [];
    for (const fullName of tickNames) {
        // the writer has no box of their own where the form adds them by itself
        if (await boxOf(form, page, fullName).count()) await boxOf(form, page, fullName).check();
        else notListed.push(fullName);
    }
    await form.locator('input[name="subject"]').fill(subject);
    await typeInEditor35(page, form, message);
    const boxes = await boxes35(form, page);
    record(`${label}-add-window`, await screen(page));
    const resp = page.waitForResponse((r) => /update-?query/i.test(r.url()), {timeout: 30_000}).catch(() => null);
    await form.getByRole('button', {name: /^(Save|OK)$/}).last().click();
    const r = await resp;
    await sleep(1500);
    await idle(page);
    return {status: r ? r.status() : null, boxes, notListed};
}

/** The row's settings › "Edit": the person unticked by full name, "OK". Takes what it finds: no "Edit", or no box for the person, is recorded. */
async function untickInEdit35(page, subject, fullName, label) {
    const row = gridRow(page, subject);
    const toggle = row.locator('a.show_extras, button.show_extras').first();
    if (await toggle.count()) await toggle.click();
    await sleep(500);
    const controls = page.locator('tr.row_controls:visible a, tr.row_controls:visible button');
    const out = {actions: (await controls.allInnerTexts()).map((t) => t.trim()).filter(Boolean)};
    const edit = controls.filter({hasText: /^\s*Edit\s*$/});
    if (!(await edit.count())) return out;
    await edit.first().click();
    const form = queryForm(page);
    await form.waitFor({timeout: 30_000});
    await idle(page);
    out.before = await boxes35(form, page);
    const box = boxOf(form, page, fullName);
    out.boxListed = (await box.count()) > 0;
    if (out.boxListed) await box.uncheck();
    record(`${label}-edit-window`, await screen(page));
    const resp = page.waitForResponse((r) => /update-?query/i.test(r.url()), {timeout: 30_000}).catch(() => null);
    await form.getByRole('button', {name: /^(Save|OK)$/}).last().click();
    const r = await resp;
    out.status = r ? r.status() : null;
    out.answer = r ? flat(await r.text().catch(() => ''), 200) : null;
    await sleep(1500);
    await idle(page);
    return out;
}

const notesGrid = '[id^="component-grid-queries-querynotesgrid"]';
const queryWindow35 = (page) => page.locator('[role="dialog"]').filter({has: page.locator(notesGrid)}).last();
const notes35 = async (dlg) => (await dlg.locator(`${notesGrid} tbody tr`).allInnerTexts().catch(() => [])).map((t) => flat(t, 200)).filter((t) => t && t !== 'No Items');

/** Press the discussion's subject: its window, left open. Null when the row is not listed. */
async function openQuery35(page, subject, label) {
    const row = gridRow(page, subject);
    if (!(await row.count())) {
        record(`${label}-no-row`, await screen(page));
        return null;
    }
    await row.locator('a').filter({hasText: subject}).first().click();
    const dlg = queryWindow35(page);
    await dlg.locator(`${notesGrid} tbody tr`).first().waitFor({timeout: 30_000});
    await idle(page);
    record(`${label}-window`, await screen(page));
    return dlg;
}

/** In the discussion's window already open: "Add Message", the text, "OK". Returns the request's status and answer and the notes listed after. */
async function replyInOpenWindow35(page, dlg, text, label) {
    const add = dlg.getByText(/Add Message/i).first();
    const out = {addMessageOffered: (await add.count()) > 0};
    if (!out.addMessageOffered) return out;
    await add.click();
    const form = dlg.locator('form').filter({has: page.locator('textarea[name="comment"]')}).last();
    const opened = await form.waitFor({timeout: 30_000}).then(() => true).catch(() => false);
    if (!opened) {
        out.formOpened = false;
        out.window = flat(await dlg.innerText().catch(() => null), 400);
        record(`${label}-no-form`, await screen(page));
        return out;
    }
    await typeInEditor35(page, form, text);
    const resp = page.waitForResponse((r) => /insert-?note/i.test(r.url()), {timeout: 30_000}).catch(() => null);
    await form.getByRole('button', {name: /^(OK|Save|Add)$/}).last().click();
    const r = await resp;
    out.status = r ? r.status() : null;
    out.answer = r ? flat(await r.text().catch(() => ''), 200) : null;
    await sleep(1500);
    await idle(page);
    record(`${label}-after-save`, await screen(page));
    out.notes = await notes35(dlg);
    return out;
}

/** The stage landed afresh and the discussion opened: whether the row is listed, the notes, whether "Add Message" is offered. */
async function readAfterReload35(page, app, w, subject, label) {
    await openWorkflow35(page, app, w);
    const dlg = await openQuery35(page, subject, label);
    if (!dlg) return {rowListed: false};
    const out = {rowListed: true, notes: await notes35(dlg), addMessageOffered: (await dlg.getByText(/Add Message/i).count()) > 0};
    await dlg.getByRole('button', {name: /Close/}).first().click().catch(() => {});
    await sleep(800);
    return out;
}

module.exports = {
    WORDS, sleep, flat, panelOf, addDiscussion, untickInEdit, replyInOpenWindow, openWithoutReload, messagesOf, readAfterReload,
    openWorkflow35, addQuery35, untickInEdit35, openQuery35, replyInOpenWindow35, readAfterReload35,
};
