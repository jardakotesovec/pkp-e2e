// Helpers of walk.js here: the stage's "Discussions" grid of OJS 3.5 (stable-3_5_0), which `main`
// replaced with the "Tasks & Discussions" panel. Requiring this file runs nothing. Every helper drives
// the screens a person uses; none sends a request of its own. The grid and form locators started from
// the U37 issue walks' lib.js (checks/issues/writer-told-of-own-message, taken-off-manager-reply-…).
//
// The screens, as 3.5 has them:
//  - the grid: `[id^="component-grid-queries-queriesgrid"]`, one per stage page, headed "Pre-Review
//    Discussions", "Review Discussions", "Copyediting Discussions" or "Production Discussions", with
//    the link "Add discussion" and the columns "Name", "From", "Last Reply", "Replies", "Closed";
//  - a row: `tr.gridRow`; its subject is a link that opens the discussion's window; its "Edit" and
//    "Delete" links sit in the next `tr.row_controls`, shown by the row's arrow (`a.show_extras`);
//  - the add and edit form: `form#queryForm` in a side window titled "Add discussion" or "Update
//    discussion" ("Participants" boxes `users[]`, a `template` select for editors and assistants,
//    "Subject" `subject`, "Message" a TinyMCE over `textarea[name=comment]`, the "Attached Files"
//    grid with "Upload File", "OK" and "Cancel");
//  - the discussion's window: `#readQueryContainer` ("Participants" with an "Edit" link, the notes
//    grid `[id^="component-grid-queries-querynotesgrid"]`, "Add Message", "Leave Discussion").
//
// Scratch data (all of it works on 3.5): journal(app) makes a scratch journal with the PEOPLE
// accounts; a submission is app.api.createSubmission({tag, context, submitter, participants: [{username,
// role: 'sectionEditor'|'copyeditor'}], decisions: TO_PRODUCTION | TO_COPYEDITING | TO_REVIEW, files:
// [{file: 'article.pdf'}], reviewRounds: [{reviewers: [{username, status}]}]}); a review round's menu
// key is `workflow_3_${response.reviewRounds[0].id}`. The scenario key `tasks[]` answers 500 on 3.5:
// make a discussion on screen with addDiscussion(), signed in as its writer.
//
// Traps: a saved reply closes the discussion's window (reopen it to read the thread); "OK" on an empty
// "Subject" or "Message" sends no request; the "form has changed" question is the browser's own
// confirm (set page.on('dialog') before pressing "Close"); the form's "Cancel" leaves a row named "—"
// behind, so find rows by subject, never by count; a row's arrow flips from `a.show_extras` to
// `a.hide_extras` once pressed; "Order" is in the DOM always and hidden until the list has two rows;
// "Cancel Reviewer" opens `form#unassignReviewerForm` on 3.5; mail is read by recipient
// (`{username}@mail.test`) and subject, and a reply's subject is "Re: {subject}".
const path = require('path');
const {screen, record, idle, settled, launch, signIn, tag} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** An upload fixture's path (the OJS suite's fixtures). */
const fx = (name) => path.join(__dirname, '..', '..', '..', '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files', name);

/** The stages' menu keys of the workflow page. A review round's is `workflow_3_<round id>`. */
const MENU_KEY = {submission: 'workflow_1', review: 'workflow_3', copyediting: 'workflow_4', production: 'workflow_5'};

const grid = (page) => page.locator('[id^="component-grid-queries-queriesgrid"]').first();
const queryForm = (page) => page.locator('form#queryForm').last();
const gridRows = (page) => grid(page).locator('tbody:not(.empty) tr.gridRow');
const gridRow = (page, subject) => gridRows(page).filter({hasText: subject}).last();
const notesGridSel = '[id^="component-grid-queries-querynotesgrid"]';
const queryWindow = (page) => page.locator('[role="dialog"]').filter({has: page.locator('#readQueryContainer')}).last();

/** The workflow page at a stage, editorial view (`view: 'mySubmissions'` for the author's). */
async function openStage(page, app, ctx, submissionId, menuKey, {view = 'editorial', wait = true} = {}) {
    await page.goto(app.url(`/index.php/${ctx}/en/dashboard/${view}?workflowSubmissionId=${submissionId}&workflowMenuKey=${menuKey}`));
    await idle(page);
    if (wait) {
        await grid(page).waitFor({timeout: 45_000}).catch(() => {});
        await idle(page);
        await sleep(400);
    }
}

/** The grid as data: its heading, the header links, the column heads and every row's cells. */
async function readGrid(page) {
    const g = grid(page);
    if (!(await g.count())) return {present: false};
    return g.evaluate((el) => {
        const t = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
        const rows = [...el.querySelectorAll('tbody:not(.empty) tr.gridRow')].map((tr) => ({
            cells: [...tr.querySelectorAll('td')].map((td) => t(td)),
            closedBox: (() => {
                const box = tr.querySelector('input[type="checkbox"]');
                return box ? {checked: box.checked, disabled: box.disabled} : null;
            })(),
            arrow: !!tr.querySelector('a.show_extras, a.hide_extras'),
            subjectIsLink: !!tr.querySelector('td a:not(.show_extras):not(.hide_extras)'),
        }));
        const empty = el.querySelector('tbody.empty');
        return {
            present: true,
            heading: t(el.querySelector('.header h4, .header')),
            actions: [...el.querySelectorAll('.header .actions a, .header .actions button')].map((a) => t(a)).filter(Boolean),
            columns: [...el.querySelectorAll('thead th')].map((th) => t(th)),
            rows,
            emptyLine: empty && getComputedStyle(empty).display !== 'none' ? t(empty) : null,
        };
    });
}

/** The form's "Participants" boxes as "[x] label" lines. */
const boxes = (page, form = queryForm(page)) =>
    form
        .locator('label')
        .filter({has: page.locator('input[type="checkbox"]')})
        .evaluateAll((ls) => ls.map((l) => `${l.querySelector('input').checked ? '[x]' : '[ ]'} ${l.innerText.replace(/\s+/g, ' ').trim()}`));

const boxOf = (page, fullName, form = queryForm(page)) => form.locator('label', {hasText: fullName}).locator('input[type="checkbox"]').first();

/** Tick or untick a participant by full name. Returns false when the form has no box for them. */
async function tick(page, fullName, on = true) {
    const box = boxOf(page, fullName);
    if (!(await box.count())) return false;
    if (on) await box.check();
    else await box.uncheck();
    return true;
}

/** The id of the form's message editor, once TinyMCE is up. */
async function editorId(page, form) {
    const id = await form.locator('textarea[name="comment"]').getAttribute('id');
    await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: 30_000});
    return id;
}

/** Type into the form's message box (appends to what is there). */
async function typeMessage(page, form, text) {
    const id = await editorId(page, form);
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.type(text);
}

/** Replace the message box's text. */
async function replaceMessage(page, form, text) {
    const id = await editorId(page, form);
    await page.frameLocator(`#${id}_ifr`).locator('body').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text);
}

/** The message box's text. */
async function readMessage(page, form) {
    const id = await editorId(page, form);
    return flat(await page.evaluate((i) => window.tinymce.get(i).getContent({format: 'text'}), id), 600);
}

/** "Add discussion" pressed: the form, once its boxes and editor are up. */
async function openAdd(page) {
    await grid(page).locator('a.pkp_linkaction_addQuery, a:has-text("Add discussion")').first().click();
    const form = queryForm(page);
    await form.waitFor({timeout: 45_000});
    await idle(page);
    await editorId(page, form);
    return form;
}

/** The form as data: the window's title, the boxes, the template list, subject, message, the notices and field errors. */
async function readForm(page, form = queryForm(page)) {
    const dlg = page.locator('[role="dialog"]').filter({has: form}).last();
    const title = flat(await dlg.locator('h1, h2, .pkpModal__title, [id^="headlessui-dialog-title"]').first().innerText().catch(() => null), 120);
    const template = form.locator('select[name="template"]');
    return {
        title,
        boxes: await boxes(page, form),
        sections: await form.locator('.section > label, .section > span.label, legend, .pkp_form .label').allInnerTexts().then((a) => a.map((t) => flat(t, 120)).filter(Boolean)).catch(() => []),
        templates: (await template.count()) ? await template.locator('option').allInnerTexts().then((a) => a.map((t) => flat(t, 120))) : null,
        subject: await form.locator('input[name="subject"]').inputValue().catch(() => null),
        message: await readMessage(page, form).catch(() => null),
        errors: await form.locator('.error:visible, label.error:visible, .pkp_form_error:visible').allInnerTexts().then((a) => a.map((t) => flat(t, 200)).filter(Boolean)).catch(() => []),
        notice: flat(await form.locator('[id^="queryFormNotification"]:visible, .notifyFormError:visible, .pkp_notification:visible').first().innerText().catch(() => null), 400),
        buttons: await form.locator('button:visible, a.cancelButton:visible, .formButtons a:visible').allInnerTexts().then((a) => a.map((t) => flat(t, 60)).filter(Boolean)),
        editNotice: flat(await form.locator('.sub_label:visible').last().innerText().catch(() => null), 200),
        text: flat(await form.innerText().catch(() => null), 2500),
    };
}

/**
 * Press the form's "OK" and wait for the save's answer. Returns its status (null when the form sent
 * nothing: its own check of the required boxes stops the press) and whether the form is still open.
 */
async function pressOk(page, form = queryForm(page), {timeout = 45_000} = {}) {
    const resp = page.waitForResponse((r) => /update-?query/i.test(r.url()) && r.request().method() === 'POST', {timeout}).catch(() => null);
    await form.locator('button[type="submit"], button.submitFormButton').last().click();
    const r = await resp;
    await sleep(1200);
    await idle(page);
    const open = (await page.locator('form#queryForm:visible').count()) > 0;
    return {status: r ? r.status() : null, formStillOpen: open};
}

/** "Add discussion", the people ticked by full name, "Subject", "Message", "OK". */
async function addDiscussion(page, {tickNames = [], subject, message, label, upload = null}) {
    const form = await openAdd(page);
    const notListed = [];
    for (const name of tickNames) if (!(await tick(page, name))) notListed.push(name);
    if (subject != null) await form.locator('input[name="subject"]').fill(subject);
    if (message != null) await typeMessage(page, form, message);
    if (upload) await uploadInForm(page, form, upload);
    const before = await boxes(page, form);
    if (label) record(`${label}-add-filled`, await screen(page));
    const out = await pressOk(page, form);
    return {...out, boxes: before, notListed};
}

/** In a form's "Attached Files" grid: "Upload File", the file, "Continue", "Continue", "Complete". Returns what the wizard showed. */
async function uploadInForm(page, form, fixtureName) {
    const out = {};
    const filesGrid = form.locator('[id^="component-grid-files-query-querynotefilesgrid"]').first();
    await filesGrid.waitFor({timeout: 30_000});
    out.gridBefore = flat(await filesGrid.innerText(), 300);
    await filesGrid.locator('a:has-text("Upload File")').first().click();
    const wiz = page.locator('#uploadForm, form[id^="uploadForm"]').last();
    await wiz.waitFor({timeout: 30_000});
    await idle(page);
    out.wizard = flat(await page.locator('[role="dialog"]').filter({has: wiz}).last().innerText().catch(() => null), 600);
    const genre = wiz.locator('select[name="genreId"]');
    if (await genre.count()) {
        out.genres = await genre.locator('option').allInnerTexts().then((a) => a.map((t) => flat(t, 60)));
        if (!(await genre.inputValue())) await genre.selectOption({index: 1}).catch(() => {});
    }
    await wiz.locator('input[type="file"]').setInputFiles(fx(fixtureName));
    await sleep(1500);
    await idle(page);
    const wizDlg = page.locator('[role="dialog"]').filter({has: page.locator('.pkp_controllers_wizard, #fileUploadWizard, [id^="fileUploadWizard"]')}).last();
    for (const name of ['Continue', 'Continue', 'Complete']) {
        const btn = wizDlg.getByRole('button', {name, exact: true});
        await btn.waitFor({timeout: 20_000}).catch(() => {});
        if (await btn.count()) {
            await btn.click();
            await sleep(1200);
            await idle(page);
        }
    }
    await sleep(800);
    out.gridAfter = flat(await filesGrid.innerText().catch(() => null), 300);
    return out;
}

/** The row's arrow pressed: the links its strip offers ("Edit", "Delete"). The strip stays open. */
async function rowActions(page, subject) {
    const row = gridRow(page, subject);
    const toggle = row.locator('a.show_extras').first();
    const open = (await row.locator('a.hide_extras').count()) > 0;
    if (!open && !(await toggle.count())) return {arrow: false, actions: []};
    if (!open) {
        await toggle.click();
        await sleep(400);
    }
    const strip = row.locator('xpath=following-sibling::tr[1]');
    const actions = (await strip.locator('a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return {arrow: true, actions, strip};
}

/** The row's strip › "Edit": the form, or null when the row offers none. */
async function openEdit(page, subject) {
    const {actions, strip} = await rowActions(page, subject);
    if (!actions.includes('Edit')) return null;
    await strip.getByRole('link', {name: 'Edit', exact: true}).click();
    const form = queryForm(page);
    await form.waitFor({timeout: 45_000});
    await idle(page);
    await editorId(page, form);
    return form;
}

/** Press the discussion's subject: its window, left open. Null when the row is not listed. */
async function openDiscussion(page, subject) {
    const row = gridRow(page, subject);
    if (!(await row.count())) return null;
    await row.locator('a').filter({hasText: subject}).first().click();
    const dlg = queryWindow(page);
    await dlg.locator(`${notesGridSel} tbody tr`).first().waitFor({timeout: 45_000});
    await idle(page);
    await settled(page, dlg.locator('#participantsListPlaceholder'));
    return dlg;
}

/** The discussion's window as data. */
async function readDiscussion(page, dlg = queryWindow(page)) {
    return dlg.evaluate((el) => {
        const t = (n) => (n ? n.innerText.replace(/\s+/g, ' ').trim() : null);
        const vis = (n) => !!n && getComputedStyle(n).display !== 'none' && n.offsetParent !== null;
        const c = el.querySelector('#readQueryContainer');
        const notes = c.querySelector('[id^="component-grid-queries-querynotesgrid"]');
        return {
            title: t(el.querySelector('h1, h2, .pkpModal__title')),
            participantsHeading: t(c.querySelector('h4')),
            editLink: vis(c.querySelector('h4 a')),
            participants: [...c.querySelectorAll('#participantsListPlaceholder li')].map((li) => t(li)),
            notesColumns: notes ? [...notes.querySelectorAll('thead th')].map((th) => t(th)) : null,
            notes: notes
                ? [...notes.querySelectorAll('tbody:not(.empty) tr.gridRow')].map((tr) => ({
                      cells: [...tr.querySelectorAll('td')].map((td) => t(td)),
                      links: [...tr.querySelectorAll('td a')].map((a) => t(a)).filter(Boolean),
                      arrow: !!tr.querySelector('a.show_extras'),
                  }))
                : null,
            addMessage: vis(c.querySelector('.openNoteForm a')),
            addMessageText: t(c.querySelector('.openNoteForm')),
            leaveDiscussion: vis(c.querySelector('.leaveQueryForm a')),
            text: t(c),
        };
    });
}

/** In the discussion's window: "Add Message" pressed; the reply form. */
async function openReply(page, dlg = queryWindow(page)) {
    await dlg.locator('.openNoteForm a').first().click();
    const form = dlg.locator('form#noteForm').last();
    await form.waitFor({timeout: 45_000});
    await idle(page);
    await editorId(page, form);
    return form;
}

/** Press the reply form's "OK". Returns the answer's status and whether the form is still open. */
async function pressReplyOk(page, form, {timeout = 45_000} = {}) {
    const resp = page.waitForResponse((r) => /insert-?note/i.test(r.url()), {timeout}).catch(() => null);
    await form.locator('button[type="submit"], button.submitFormButton').last().click();
    const r = await resp;
    await sleep(1200);
    await idle(page);
    return {status: r ? r.status() : null, formStillOpen: (await page.locator('form#noteForm:visible').count()) > 0};
}

/** Close the top legacy side window with its own close control. */
async function closeWindow(page, dlg) {
    const target = dlg || page.locator('[role="dialog"]:visible').last();
    await target.locator('button:has-text("Close"), .pkpModalCloseButton, button[aria-label="Close"]').first().click({timeout: 10_000}).catch(() => {});
    await sleep(900);
    await idle(page);
}

/** The visible confirmation dialog (title, text, buttons), or null. */
async function readConfirm(page) {
    const dlg = page.locator('[data-cy="dialog"]:visible, [role="alertdialog"]:visible, [role="dialog"]:visible:has(button:text-is("OK")):not(:has(form))').last();
    if (!(await dlg.count())) return null;
    return {
        text: flat(await dlg.innerText().catch(() => null), 500),
        buttons: (await dlg.locator('button:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean),
        dlg,
    };
}

/** Mails to `to` whose subject holds `subject`: [{from, subject, snippet, attachments}], oldest first. Polls until `n` are there. */
async function mailbox(app, to, subject, {n = 1, tries = 10, page = null} = {}) {
    const read = async () => {
        const res = await app.mail._search({to, subject});
        return (res.messages || [])
            .map((m) => ({
                id: m.ID,
                from: m.From ? `${m.From.Name} <${m.From.Address}>` : null,
                to: (m.To || []).map((t) => t.Address).join(', '),
                subject: m.Subject,
                snippet: flat(m.Snippet, 200),
                attachments: m.Attachments,
                created: m.Created,
            }))
            .reverse();
    };
    let box = await read();
    for (let i = 0; i < tries && box.length < n; i++) {
        await sleep(1500);
        if (page) {
            await page.reload().catch(() => {});
            await idle(page).catch(() => {});
        }
        box = await read();
    }
    return box;
}

/** A mail's text body and attachment names. */
async function mailBody(app, id) {
    const m = await app.mail.fullMessage(id);
    return {text: flat(m.Text, 1200), attachments: (m.Attachments || []).map((a) => a.FileName), from: m.From ? `${m.From.Name} <${m.From.Address}>` : null};
}

// ---------------------------------------------------------------------------------------------
// Scratch data and the other screens a walk passes.

/** The throwaway accounts of a scratch journal: `{key: [givenName, familyName, roles]}`. */
const PEOPLE = {
    mgr: ['Mona', 'Manager', ['manager']],
    se1: ['Sena', 'Sectioned', ['sectionEditor']],
    se2: ['Sven', 'Sectioned', ['sectionEditor']],
    au: ['Aura', 'Author', ['author']],
    ce: ['Cora', 'Copyeditor', ['copyeditor']],
};

/** Decisions that bring a seeded submission to a stage. */
const TO_PRODUCTION = ['skipExternalReview', 'sendToProduction'];
const TO_COPYEDITING = ['skipExternalReview'];
const TO_REVIEW = ['sendExternalReview'];

/**
 * A scratch journal with throwaway accounts. Returns `{t, path, people}`, each person with
 * `username`, `name` (the full name the boxes print) and `mail`. `extra` goes into the context
 * scenario as it is (`{review: {defaultReviewMode: 'open'}}`).
 */
async function journal(app, accounts = PEOPLE, extra = {}) {
    const t = tag('l35u37');
    const people = {};
    for (const [key, [givenName, familyName, roles]] of Object.entries(accounts)) {
        const username = `${key}${t}`;
        people[key] = {username, givenName, familyName, roles, name: `${givenName} ${familyName}`, mail: `${username}@mail.test`};
    }
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `Journal ${t}`},
        users: Object.values(people).map(({username, givenName, familyName, roles}) => ({username, givenName, familyName, roles})),
        ...extra,
    });
    return {t, path: ctx.path, people};
}

/** A browser signed in as `username` on the journal; it accepts every browser question. */
async function browserAs(app, username, ctxPath) {
    const b = await launch(app);
    b.page.on('dialog', (d) => d.accept().catch(() => {}));
    await signIn(b.page, username, {contextPath: ctxPath});
    return b;
}

/** The header's "Tasks" window read from the dashboard: every row as "{sentence} | {submission}". */
async function tasksRows(page, app, ctxPath, view = 'editorial') {
    const {TasksPanel} = require('../../../pages/NotificationsPages.js');
    await page.goto(app.url(`/index.php/${ctxPath}/en/dashboard/${view}`));
    await idle(page);
    const tasks = new TasksPanel(page);
    await tasks.open();
    await sleep(500);
    const rows = await tasks.rowTexts();
    const data = await screen(page);
    await tasks.close().catch(() => {});
    return {rows, text: flat(data.text.dialog, 1500)};
}

/** The row's "Closed" box pressed. Returns what asked (if anything) and the request the press sent. */
async function pressClosedBox(page, subject) {
    const row = gridRow(page, subject);
    const box = row.locator('input[type="checkbox"]').first();
    const before = {checked: await box.isChecked(), disabled: await box.isDisabled()};
    if (before.disabled) return {before, pressed: false};
    const resp = page.waitForResponse((r) => /(open|close)-query/i.test(r.url()), {timeout: 8_000}).catch(() => null);
    await row.locator('td').last().locator('a, input[type="checkbox"]').first().click();
    await sleep(700);
    const confirm = await readConfirm(page);
    const r = await resp;
    await sleep(800);
    await idle(page);
    const after = gridRow(page, subject).locator('input[type="checkbox"]').first();
    return {before, pressed: true, confirm: confirm ? {text: confirm.text, buttons: confirm.buttons} : null, request: r ? `${new URL(r.url()).pathname.split('/').pop()} ${r.status()}` : null, afterChecked: await after.isChecked().catch(() => null)};
}

/** The reviewer's review form at step 3, where its "Review Discussions" list stands (a request already accepted). */
async function reviewerStep3(page, app, ctxPath, submissionId) {
    await page.goto(app.url(`/index.php/${ctxPath}/en/reviewer/submission/${submissionId}`));
    await idle(page);
    for (const name of ['Save and continue', 'Accept Review, Continue to Step #2', 'Continue to Step #3']) {
        const b = page.getByRole('button', {name, exact: true});
        if ((await b.count()) && (await b.first().isVisible())) {
            await b.first().click();
            await sleep(1500);
            await idle(page);
        }
    }
    await grid(page).waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    await sleep(500);
}

module.exports = {
    sleep, flat, fx, MENU_KEY, grid, gridRows, gridRow, queryForm, queryWindow, notesGridSel,
    openStage, readGrid, boxes, boxOf, tick, editorId, typeMessage, replaceMessage, readMessage,
    openAdd, readForm, pressOk, addDiscussion, uploadInForm, rowActions, openEdit,
    openDiscussion, readDiscussion, openReply, pressReplyOk, closeWindow, readConfirm, mailbox, mailBody,
    PEOPLE, TO_PRODUCTION, TO_COPYEDITING, TO_REVIEW, journal, browserAs, tasksRows, pressClosedBox, reviewerStep3,
};
