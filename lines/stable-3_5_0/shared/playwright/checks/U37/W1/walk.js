// U37 "Tasks & discussions" walked on OJS 3.5 (stable-3_5_0), where the feature is the older
// "Discussions" grid: the walk behind docs/specs/lines/stable-3_5_0/U37-tasks-and-discussions.md.
//
// Re-run, one part per process (each part makes its own scratch journal, accounts and submissions,
// and touches nothing else; the 3.5 probe server must be up, harness.md "The stable lines"):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=lines35 PROBE_AGENT=<id> PROBE_RUN=s1 \
//     node bin/probe.js ojs lines/stable-3_5_0/shared/playwright/checks/U37/W1/walk.js <part>
//
// Run every part twice (PROBE_RUN=s1, then s2) before writing a difference down. No assertions: each
// screen is saved with screen() as <part>-<nn>-<name>-<run>-ojs.json, and what the part read is in
// <part>-facts-<run>-ojs.json. A step that fails is recorded under `errors` and the part goes on.
//
// Parts (the spec's scenario each one walks, as 3.5 has it):
//   s1   S1: open a discussion and reply. The grid, "Add discussion", the save, the other person's
//        email and Tasks row, their view and reply, a file chosen from the submission ("Select
//        Files"), the manager's row strip against the Section Editor's.
//   s2   S2: what "Add discussion" refuses, and "Cancel". Also S3: the "Choose a predefined message"
//        list, and S4's absence (no task field anywhere in the form).
//   s5   S5: close and reopen from the row's "Closed" box, a reply on a closed discussion; the
//        Section Editor's box; no task conversion.
//   s6   S6: "Edit" (rename, tick, untick, new text, an uploaded file), who is told, the window
//        after, no History, the Author's grid, "Delete". Also "Leave Discussion" and "Order".
//   s7   S7: the Author's grid, reply, "Add discussion" (who is offered, own box unticked, an
//        uploaded file), the Section Editor's email, the Journal Manager who is not a participant.
//   s8   S8, S9: Settings › Workflow has no "Tasks and Discussions" tab; where the predefined
//        messages are kept. S10: the Copyeditor's grid on Copyediting (their own discussion's
//        "Edit" and its time line, the "Closed" box, a reply with an uploaded file).
//   s11  S11: reviewers and the Author on a review round, default review type and "Open".
//   x    Body statements no scenario reaches: each stage's heading, a Section Editor removed on the
//        Participants panel (Rule 23), a subject of 300 characters, a reply left with "Cancel" and
//        with the window's "Close", a message sent from the Participants panel's "Notify".
const {forEachApp, launch, signIn, screen, shot, record, idle} = require('../../../probe');
const L = require('./lib.js');

const PARTS = process.argv.slice(2).filter((a) => /^(s\d+|x)$/.test(a));
const {PEOPLE, TO_PRODUCTION, TO_COPYEDITING, journal, browserAs, tasksRows, pressClosedBox, reviewerStep3} = L;

/** A recorder for one part: numbered screen snapshots, facts, and steps that never throw. */
function recorder(part) {
    const facts = {part, errors: []};
    let n = 0;
    return {
        facts,
        async snap(page, name) {
            n += 1;
            const data = await screen(page);
            record(`${part}-${String(n).padStart(2, '0')}-${name}`, data);
            return data;
        },
        async step(name, fn) {
            try {
                const out = await fn();
                if (out !== undefined) facts[name] = out;
                console.log(`[${part}] ${name}: ${JSON.stringify(out === undefined ? 'done' : out).slice(0, 1500)}`);
                return out;
            } catch (error) {
                facts.errors.push({step: name, error: String(error && error.message ? error.message : error).slice(0, 600)});
                console.log(`[${part}] ${name}: ERROR ${String(error && error.message).slice(0, 600)}`);
                return null;
            }
        },
        save() {
            record(`${part}-facts`, facts);
        },
    };
}

// ---------------------------------------------------------------------------------------------
// S1: open a discussion and reply.
async function s1(app) {
    const R = recorder('s1');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: J.people.au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
        files: [{file: 'article.pdf'}],
    });
    facts.journal = J.path;
    facts.submissionId = sub.submissionId;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const s = await browserAs(app, se1.username, J.path);
    try {
        // The panel.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await snap(m.page, 'mgr-production');
        await shot(m.page, 's1-mgr-production');
        await step('grid', () => L.readGrid(m.page));
        await step('gridHtmlHead', () => L.grid(m.page).locator('.header').first().evaluate((el) => el.outerHTML.replace(/\s+/g, ' ').slice(0, 1500)));

        // The "Add discussion" window.
        const form = await L.openAdd(m.page);
        await snap(m.page, 'mgr-add-window');
        await shot(m.page, 's1-mgr-add-window');
        await step('addForm', () => L.readForm(m.page, form));
        await step('filesGridLinks', () => form.locator('[id^="component-grid-files-query-querynotefilesgrid"] a:visible').allInnerTexts().then((a) => a.map((t) => t.trim()).filter(Boolean)));

        // "OK".
        await step('add', async () => {
            await L.tick(m.page, se1.name);
            await form.locator('input[name="subject"]').fill('Figure permissions');
            await L.typeMessage(m.page, form, 'Please confirm the permissions for figure 2.');
            await snap(m.page, 'mgr-add-filled');
            return L.pressOk(m.page, form);
        });
        await snap(m.page, 'mgr-after-add');
        await shot(m.page, 's1-mgr-after-add');
        await step('gridAfterAdd', () => L.readGrid(m.page));

        // The Section Editor's email and Tasks row; the writer's own.
        await step('se1Mail', async () => {
            const box = await L.mailbox(app, se1.mail, 'Figure permissions', {page: s.page});
            return Promise.all(box.map(async (b) => ({...b, body: await L.mailBody(app, b.id)})));
        });
        await step('mgrMailAfterAdd', () => L.mailbox(app, mgr.mail, 'Figure permissions', {tries: 2}));
        await step('se1Tasks', () => tasksRows(s.page, app, J.path));
        await snap(s.page, 'se1-dashboard');
        await step('mgrTasksAfterAdd', () => tasksRows(m.page, app, J.path));

        // The Section Editor's view.
        await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
        await snap(s.page, 'se1-production');
        await step('se1Grid', () => L.readGrid(s.page));
        await step('se1RowActions', async () => (await L.rowActions(s.page, 'Figure permissions')).actions);
        await snap(s.page, 'se1-row-strip');
        const dlg = await L.openDiscussion(s.page, 'Figure permissions');
        await snap(s.page, 'se1-discussion-window');
        await shot(s.page, 's1-se1-discussion-window');
        await step('se1Window', () => L.readDiscussion(s.page, dlg));

        // The reply: empty, then typed.
        await step('replyEmpty', async () => {
            const rf = await L.openReply(s.page, dlg);
            await snap(s.page, 'se1-reply-form');
            const out = await L.pressReplyOk(s.page, rf);
            const data = await snap(s.page, 'se1-reply-empty-ok');
            return {...out, formText: L.flat(await rf.innerText().catch(() => null), 600), errors: await rf.locator('.error:visible, label.error:visible').allInnerTexts().catch(() => []), notices: data.notices};
        });
        await step('reply', async () => {
            const rf = dlg.locator('form#noteForm').last();
            await L.typeMessage(s.page, rf, 'Permissions confirmed for figure 2.');
            const out = await L.pressReplyOk(s.page, rf);
            const data = await snap(s.page, 'se1-after-reply');
            out.windowStillOpen = (await s.page.locator('#readQueryContainer:visible').count()) > 0;
            out.notices = data.notices;
            out.grid = await L.readGrid(s.page);
            const d = out.windowStillOpen ? dlg : await L.openDiscussion(s.page, 'Figure permissions');
            await snap(s.page, 'se1-window-after-reply');
            out.window = await L.readDiscussion(s.page, d);
            await L.closeWindow(s.page, d);
            return out;
        });
        await shot(s.page, 's1-se1-after-reply');

        // The Journal Manager's side.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await snap(m.page, 'mgr-after-reply');
        await step('mgrGridAfterReply', () => L.readGrid(m.page));
        await step('mgrMailReply', async () => {
            const box = await L.mailbox(app, mgr.mail, 'Figure permissions', {page: m.page});
            return Promise.all(box.map(async (b) => ({...b, body: await L.mailBody(app, b.id)})));
        });
        await step('se1MailAfterReply', () => L.mailbox(app, se1.mail, 'Figure permissions', {tries: 1}));
        await step('mgrTasksAfterReply', () => tasksRows(m.page, app, J.path));

        // A file of the submission: "Select Files" in the reply's "Attached Files".
        await step('selectFiles', async () => {
            const out = {};
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            let d = await L.openDiscussion(s.page, 'Figure permissions');
            const rf = await L.openReply(s.page, d);
            const filesGrid = rf.locator('[id^="component-grid-files-query-querynotefilesgrid"]').first();
            await filesGrid.waitFor({timeout: 30_000});
            out.links = (await filesGrid.locator('a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            await filesGrid.locator('a:has-text("Select Files")').first().click();
            const sel = s.page.locator('form#manageQueryNoteFilesForm, form[id*="anageQueryNoteFiles"], form:has([id*="managequerynotefilesgrid"])').last();
            await sel.waitFor({timeout: 30_000});
            await idle(s.page);
            await L.sleep(800);
            const data = await snap(s.page, 'se1-select-files');
            await shot(s.page, 's1-se1-select-files');
            out.window = L.flat(data.text.dialog, 1500);
            const row = sel.locator('tr.gridRow').filter({hasText: 'article.pdf'}).first();
            out.articleRowListedAtOnce = (await row.count()) > 0;
            // The window opens on the discussion's own stage; its link shows the other stages' files.
            const all = sel.getByText('Show files from all accessible workflow stages', {exact: false}).first();
            out.showAllOffered = (await all.count()) > 0;
            if (out.showAllOffered && !out.articleRowListedAtOnce) {
                await all.click();
                await L.sleep(2000);
                await idle(s.page);
                const wide = await snap(s.page, 'se1-select-files-all-stages');
                await shot(s.page, 's1-se1-select-files-all-stages');
                out.windowAllStages = L.flat(wide.text.dialog, 1500);
            }
            out.articleRowListed = (await row.count()) > 0;
            if (out.articleRowListed) await row.locator('input[type="checkbox"]').first().check();
            await sel.locator('button[type="submit"], button.submitFormButton').last().click();
            await L.sleep(1500);
            await idle(s.page);
            out.gridAfter = L.flat(await filesGrid.innerText().catch(() => null), 300);
            await snap(s.page, 'se1-reply-with-file');
            await L.typeMessage(s.page, rf, 'The signed form is attached.');
            out.save = await L.pressReplyOk(s.page, rf);
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            d = await L.openDiscussion(s.page, 'Figure permissions');
            await snap(s.page, 'se1-after-file-reply');
            await shot(s.page, 's1-se1-after-file-reply');
            out.windowAfter = await L.readDiscussion(s.page, d);
            return out;
        });
        await step('fileDownload', async () => {
            const link = L.queryWindow(s.page).locator(`${L.notesGridSel} a`).filter({hasText: 'article.pdf'}).first();
            if (!(await link.count())) return {link: false};
            const dl = s.page.waitForEvent('download', {timeout: 20_000});
            await link.click();
            const d = await dl;
            return {link: true, suggested: d.suggestedFilename()};
        });
        await step('mgrMailFile', async () => {
            const box = await L.mailbox(app, mgr.mail, 'Figure permissions', {n: 2, page: m.page});
            return Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
        });
        await step('submissionFilesAfter', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.submission);
            const data = await snap(s.page, 'se1-submission-stage');
            return {articleCount: (data.text.dialog.match(/article\.pdf/g) || []).length};
        });

        // Control: the manager's strip and window against the Section Editor's.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('mgrRowActions', async () => (await L.rowActions(m.page, 'Figure permissions')).actions);
        await snap(m.page, 'mgr-row-strip');
        await shot(m.page, 's1-mgr-row-strip');
        await step('mgrWindow', async () => {
            const d = await L.openDiscussion(m.page, 'Figure permissions');
            await snap(m.page, 'mgr-discussion-window');
            await shot(m.page, 's1-mgr-discussion-window');
            const out = await L.readDiscussion(m.page, d);
            // What a reply's row strip offers the manager.
            const reply = d.locator(`${L.notesGridSel} tbody:not(.empty) tr.gridRow`).nth(1);
            if (await reply.locator('a.show_extras').count()) {
                await reply.locator('a.show_extras').click();
                await L.sleep(600);
                out.replyActions = (await reply.locator('xpath=following-sibling::tr[1]').locator('a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
                await snap(m.page, 'mgr-reply-strip');
                await shot(m.page, 's1-mgr-reply-strip');
            }
            await L.closeWindow(m.page, d);
            return out;
        });

        // The submission's Activity Log.
        await step('activityLog', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            await m.page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
            await L.sleep(2500);
            await idle(m.page);
            const data = await snap(m.page, 'mgr-activity-log');
            await shot(m.page, 's1-mgr-activity-log');
            return L.flat(data.text.dialog, 3000);
        });
    } finally {
        R.save();
        await m.close();
        await s.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S2: what "Add discussion" refuses, and "Cancel"; S3: the predefined messages; S4: no task field.
async function s2(app) {
    const R = recorder('s2');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: J.people.au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await launch(app);
    const page = m.page;
    // What the browser asked, and the answer the next question gets.
    const dialogs = [];
    let answer = 'accept';
    page.on('dialog', (d) => {
        dialogs.push({type: d.type(), message: d.message(), answered: d.type() === 'beforeunload' ? 'accept' : answer});
        (d.type() === 'beforeunload' || answer === 'accept' ? d.accept() : d.dismiss()).catch(() => {});
    });
    // The requests the window sends for its discussion.
    const sent = [];
    page.on('request', (r) => {
        const hit = /\/queries-grid\/(add-query|update-query|delete-query|fetch-template-body)/.exec(r.url());
        if (hit) sent.push(hit[1]);
    });
    const formErrors = (form) => form.evaluate((f) => [...f.querySelectorAll('label.error, .error')].filter((e) => e.offsetParent !== null && e.tagName !== 'INPUT' && e.tagName !== 'TEXTAREA').map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean));
    const formOpen = async () => (await page.locator('form#queryForm:visible').count()) > 0;
    const cancelLink = (form) => form.locator('a.cancelButton, a[id^="cancelFormButton"]').last();
    const closeControl = (form) => page.locator('[role="dialog"]').filter({has: form}).last().getByRole('button', {name: 'Close', exact: true}).first();
    /** The stage landed afresh: the grid's rows as their "Name" cells. */
    const rowsNow = async () => {
        await L.openStage(page, app, J.path, id, L.MENU_KEY.production);
        return (await L.readGrid(page)).rows.map((r) => r.cells[0].replace(/^Settings /, ''));
    };
    /** One way of leaving the window, on a fresh form: what asked, what was sent, the rows after. */
    const leave = async (name, {fill = false, refuse = false, how}) => {
        await L.openStage(page, app, J.path, id, L.MENU_KEY.production);
        const form = await L.openAdd(page);
        const out = {};
        if (fill) {
            await form.locator('input[name="subject"]').fill('Layout question');
            await L.typeMessage(page, form, 'Is the layout final?');
            await form.locator('input[name="subject"]').focus();
        }
        if (refuse) out.refused = await L.pressOk(page, L.queryForm(page));
        const d0 = dialogs.length;
        const s0 = sent.length;
        await how(L.queryForm(page), out);
        await L.sleep(2500);
        out.asked = dialogs.slice(d0);
        out.sent = sent.slice(s0);
        out.formStillOpen = await formOpen();
        await snap(page, name);
        out.rows = await rowsNow();
        return out;
    };
    try {
        await signIn(page, mgr.username, {contextPath: J.path});
        await L.openStage(page, app, J.path, id, L.MENU_KEY.production);

        // Required fields.
        let form = await L.openAdd(page);
        await step('emptyOk', async () => {
            const out = await L.pressOk(page, form, {timeout: 6_000});
            const data = await snap(page, 'empty-ok');
            await shot(page, 's2-empty-ok');
            return {...out, errors: await formErrors(form), notices: data.notices};
        });

        // One participant.
        await step('oneParticipant', async () => {
            await form.locator('input[name="subject"]').fill('Layout question');
            await L.typeMessage(page, form, 'Is the layout final?');
            const out = await L.pressOk(page, L.queryForm(page));
            form = L.queryForm(page);
            const data = await snap(page, 'one-participant');
            await shot(page, 's2-one-participant');
            const read = await L.readForm(page, form);
            return {...out, errors: await formErrors(form), notices: data.notices, notice: read.notice, boxes: read.boxes, subject: read.subject, message: read.message};
        });

        // No task field anywhere (S4).
        await step('taskFields', async () => {
            const text = await form.innerText();
            return {
                enterTaskInformation: /Enter task information/i.test(text),
                dueDate: /Due Date/i.test(text),
                taskOwner: /Task owner/i.test(text),
                inputs: await form.locator('input:visible, select:visible, textarea').evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}[name=${e.getAttribute('name')}]`)),
            };
        });

        // The refused window saved once a second person is ticked.
        await step('savedAfterRefusal', async () => {
            await L.tick(page, se1.name);
            const out = await L.pressOk(page, L.queryForm(page));
            await snap(page, 'saved-after-refusal');
            return {...out, rows: await rowsNow()};
        });

        // Leaving the window, each way on a fresh form.
        await step('cancelUntouched', () => leave('cancel-untouched', {how: (f) => cancelLink(f).click()}));
        await step('closeUntouched', () => leave('close-untouched', {how: (f) => closeControl(f).click()}));
        await step('cancelChanged', () => leave('cancel-changed', {fill: true, how: (f) => cancelLink(f).click()}));
        await step('closeChangedNo', () =>
            leave('close-changed-no', {
                fill: true,
                how: async (f, out) => {
                    answer = 'dismiss';
                    await closeControl(f).click();
                    await L.sleep(1500);
                    out.afterNo = {formStillOpen: await formOpen(), subject: await L.queryForm(page).locator('input[name="subject"]').inputValue().catch(() => null)};
                    await shot(page, 's2-close-changed-no');
                    // Escape, the same question.
                    await L.queryForm(page).locator('input[name="subject"]').press('Escape');
                    await L.sleep(1500);
                    out.afterEscapeNo = {formStillOpen: await formOpen()};
                    answer = 'accept';
                    await closeControl(L.queryForm(page)).click();
                },
            })
        );
        await step('cancelAfterRefusal', () => leave('cancel-after-refusal', {fill: true, refuse: true, how: (f) => cancelLink(f).click()}));
        await step('closeAfterRefusal', () => leave('close-after-refusal', {fill: true, refuse: true, how: (f) => closeControl(f).click()}));

        // What an empty row offers.
        await step('emptyRow', async () => {
            const g = await L.readGrid(page);
            const empty = g.rows.filter((r) => /^Settings —$|^—$/.test(r.cells[0]));
            const out = {count: empty.length, cells: empty[0] ? empty[0].cells : null};
            if (!empty.length) return out;
            const row = L.gridRows(page).filter({hasText: '—'}).first();
            await row.locator('a.show_extras').click();
            await L.sleep(400);
            out.actions = (await row.locator('xpath=following-sibling::tr[1]').locator('a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            await snap(page, 'empty-row-strip');
            await shot(page, 's2-empty-row-strip');
            return out;
        });
        await step('emptyRowSe1', async () => {
            const b = await browserAs(app, se1.username, J.path);
            try {
                await L.openStage(b.page, app, J.path, id, L.MENU_KEY.production);
                await snap(b.page, 'se1-grid');
                return (await L.readGrid(b.page)).rows.map((r) => r.cells[0]);
            } finally {
                await b.close();
            }
        });

        // S3: the predefined messages.
        await step('templates', async () => {
            const out = {};
            await L.openStage(page, app, J.path, id, L.MENU_KEY.production);
            form = await L.openAdd(page);
            const select = form.locator('select[name="template"]');
            out.label = L.flat(await form.locator('label[for="template"]').innerText().catch(() => null));
            out.options = (await select.locator('option').allInnerTexts()).map((t) => t.trim());
            await form.locator('input[name="subject"]').fill('Layout check');
            const pick = async (option) => {
                const resp = page.waitForResponse((r) => /fetch-template-body/i.test(r.url()), {timeout: 30_000}).catch(() => null);
                await select.selectOption(option);
                const r = await resp;
                await L.sleep(800);
                await idle(page);
                return {status: r ? r.status() : null, subject: await form.locator('input[name="subject"]').inputValue(), message: await L.readMessage(page, form)};
            };
            out.discussionProduction = await pick({label: 'Discussion (Production)'});
            await snap(page, 'template-discussion');
            out.assignEditor = await pick({label: 'Assign Editor'});
            await snap(page, 'template-assign-editor');
            await shot(page, 's2-template-assign-editor');
            out.blankAgain = await pick({index: 0});
            const data = await snap(page, 'template-blank-again');
            out.blankAgain.notices = data.notices;
            out.assignEditorAgain = await pick({label: 'Assign Editor'});
            await L.tick(page, se1.name);
            out.save = await L.pressOk(page, form);
            await snap(page, 'template-saved');
            const subject = out.assignEditorAgain.subject;
            const d = await L.openDiscussion(page, subject);
            if (d) {
                out.window = await L.readDiscussion(page, d);
                await snap(page, 'template-discussion-window');
                await shot(page, 's2-template-discussion-window');
                await L.closeWindow(page, d);
            }
            const box = await L.mailbox(app, se1.mail, subject, {page});
            out.mail = await Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
            return out;
        });

        // Control: two participants save.
        await step('control', async () => {
            await L.openStage(page, app, J.path, id, L.MENU_KEY.production);
            const out = await L.addDiscussion(page, {tickNames: [se1.name], subject: 'Layout answer', message: 'The layout is final.', label: null});
            await snap(page, 'control-saved');
            return {...out, rows: await rowsNow()};
        });
        facts.dialogs = dialogs;
    } finally {
        R.save();
        await m.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S5: close, reopen; a reply on a closed discussion; no conversion into a task.
async function s5(app) {
    const R = recorder('s5');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: J.people.au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const s = await browserAs(app, se1.username, J.path);
    try {
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('given', () => L.addDiscussion(m.page, {tickNames: [se1.name], subject: 'Cover image', message: 'Which image goes on the cover?', label: null}));
        await step('given2', () => L.addDiscussion(m.page, {tickNames: [se1.name], subject: 'Second thread', message: 'A second thread.', label: null}));
        await snap(m.page, 'mgr-grid');
        await step('gridBefore', () => L.readGrid(m.page));
        const startedAt = Date.now();
        await L.mailbox(app, se1.mail, 'Cover image', {page: s.page});

        // Closed from the row.
        await step('closeFromRow', () => pressClosedBox(m.page, 'Cover image'));
        await snap(m.page, 'mgr-closed');
        await shot(m.page, 's5-mgr-closed');
        await step('gridClosed', () => L.readGrid(m.page));
        await step('gridClosedAfterReload', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            return L.readGrid(m.page);
        });

        // The closed discussion's strip and window.
        await step('closedRowActions', async () => (await L.rowActions(m.page, 'Cover image')).actions);
        await snap(m.page, 'mgr-closed-strip');
        await step('closedWindowMgr', async () => {
            const d = await L.openDiscussion(m.page, 'Cover image');
            await snap(m.page, 'mgr-closed-window');
            await shot(m.page, 's5-mgr-closed-window');
            const out = await L.readDiscussion(m.page, d);
            await L.closeWindow(m.page, d);
            return out;
        });

        // The first writer's own reply on the closed discussion, then the other person's.
        await step('writerReplyOnClosed', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const d = await L.openDiscussion(m.page, 'Cover image');
            const rf = await L.openReply(m.page, d);
            await L.typeMessage(m.page, rf, 'A note from the writer while closed.');
            const out = await L.pressReplyOk(m.page, rf);
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            await snap(m.page, 'mgr-after-own-reply');
            return {...out, grid: await L.readGrid(m.page)};
        });
        await step('otherReplyOnClosed', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            await snap(s.page, 'se1-grid-closed');
            const gridBefore = await L.readGrid(s.page);
            const d = await L.openDiscussion(s.page, 'Cover image');
            const rf = await L.openReply(s.page, d);
            await L.typeMessage(s.page, rf, 'One more change to the cover.');
            const out = await L.pressReplyOk(s.page, rf);
            await snap(s.page, 'se1-after-reply-on-closed');
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            await snap(s.page, 'se1-grid-after-reply');
            await shot(s.page, 's5-se1-grid-after-reply');
            return {...out, gridBefore, gridAfter: await L.readGrid(s.page)};
        });
        await step('mgrMailReply', async () => {
            const box = await L.mailbox(app, mgr.mail, 'Cover image', {page: m.page});
            return box.map((b) => ({subject: b.subject, from: b.from, snippet: b.snippet}));
        });

        // Closed again, then reopened from the row.
        await step('closeAgain', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const g = await L.readGrid(m.page);
            const row = g.rows.find((r) => r.cells.join(' ').includes('Cover image'));
            if (row && row.closedBox && row.closedBox.checked) return {alreadyClosed: true};
            return pressClosedBox(m.page, 'Cover image');
        });
        await step('reopenFromRow', () => pressClosedBox(m.page, 'Cover image'));
        await snap(m.page, 'mgr-reopened');
        await step('gridReopened', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            return L.readGrid(m.page);
        });

        // The Section Editor's own "Closed" box (not the writer).
        await step('se1Close', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            const out = await pressClosedBox(s.page, 'Second thread');
            await snap(s.page, 'se1-closed-second');
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            return {...out, grid: await L.readGrid(s.page)};
        });

        // No conversion into a task: the strip, the window, the edit form.
        await step('noTask', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const actions = (await L.rowActions(m.page, 'Cover image')).actions;
            const form = await L.openEdit(m.page, 'Cover image');
            const text = await form.innerText();
            await snap(m.page, 'mgr-edit-form');
            return {actions, enterTaskInformation: /task/i.test(text), formText: L.flat(text, 500)};
        });

        // Control: closing and reopening emailed nobody.
        await step('controlMail', async () => {
            const box = await L.mailbox(app, se1.mail, 'Cover image', {tries: 2});
            return {se1: box.map((b) => ({subject: b.subject, from: b.from, snippet: b.snippet, created: b.created})), startedAt: new Date(startedAt).toISOString()};
        });
        await step('se1Tasks', () => tasksRows(s.page, app, J.path));
    } finally {
        R.save();
        await m.close();
        await s.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S6: "Edit", who is told, the window after, no History, the Author's grid, "Delete"; "Leave
// Discussion" and "Order".
async function s6(app) {
    const R = recorder('s6');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1, se2, au} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}, {username: se2.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const a = await browserAs(app, au.username, J.path);
    const s = await browserAs(app, se1.username, J.path);
    try {
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('given', () => L.addDiscussion(m.page, {tickNames: [se1.name, au.name], subject: 'Proof corrections', message: 'Please send your corrections.', label: null}));
        await step('givenOther', () => L.addDiscussion(m.page, {tickNames: [se1.name], subject: 'Second thread', message: 'A second thread.', label: null}));
        await L.mailbox(app, se1.mail, 'Proof corrections', {page: s.page});
        await step('se1TasksBefore', () => tasksRows(s.page, app, J.path));
        await step('authorGridBefore', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            await snap(a.page, 'author-grid-before');
            return L.readGrid(a.page);
        });

        // The row's strip.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('windowBeforeEdit', async () => {
            const d = await L.openDiscussion(m.page, 'Proof corrections');
            const out = await L.readDiscussion(m.page, d);
            await L.closeWindow(m.page, d);
            return out;
        });
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('rowActions', async () => (await L.rowActions(m.page, 'Proof corrections')).actions);
        await snap(m.page, 'mgr-row-strip');
        await shot(m.page, 's6-mgr-row-strip');

        // "Edit".
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        const form = await L.openEdit(m.page, 'Proof corrections');
        await snap(m.page, 'mgr-edit-window');
        await shot(m.page, 's6-mgr-edit-window');
        await step('editForm', () => L.readForm(m.page, form));

        // The edit saved.
        await step('editSave', async () => {
            await form.locator('input[name="subject"]').fill('Final proof corrections');
            await L.tick(m.page, se2.name, true);
            await L.tick(m.page, au.name, false);
            await L.replaceMessage(m.page, form, 'Please send your final corrections.');
            const upload = await L.uploadInForm(m.page, form, 'profile-image-400.png');
            await snap(m.page, 'mgr-edit-filled');
            await shot(m.page, 's6-mgr-edit-filled');
            const out = await L.pressOk(m.page, form);
            return {...out, upload};
        });
        await snap(m.page, 'mgr-after-edit');
        await step('gridAfterEdit', () => L.readGrid(m.page));

        // Who is told.
        await step('mailAfterEdit', async () => {
            const se2Box = await L.mailbox(app, se2.mail, 'Final proof corrections', {page: s.page});
            return {
                se2: await Promise.all(se2Box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)}))),
                se1: (await L.mailbox(app, se1.mail, 'Final proof corrections', {tries: 1})).map((b) => b.subject),
                au: (await L.mailbox(app, au.mail, 'Final proof corrections', {tries: 1})).map((b) => b.subject),
                mgr: (await L.mailbox(app, mgr.mail, 'Final proof corrections', {tries: 1})).map((b) => b.subject),
            };
        });

        // The discussion window.
        await step('windowAfterEdit', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const d = await L.openDiscussion(m.page, 'Final proof corrections');
            await snap(m.page, 'mgr-window-after-edit');
            await shot(m.page, 's6-mgr-window-after-edit');
            const out = await L.readDiscussion(m.page, d);
            await L.closeWindow(m.page, d);
            return out;
        });

        // No History.
        await step('history', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const actions = (await L.rowActions(m.page, 'Final proof corrections')).actions;
            const data = await snap(m.page, 'mgr-strip-after-edit');
            return {actions, historyOnScreen: /History/.test(data.text.dialog.slice(data.text.dialog.indexOf('Production Discussions'), data.text.dialog.indexOf('Production Discussions') + 800))};
        });

        // "Leave Discussion": the manager in a discussion of three.
        await step('leave', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const d = await L.openDiscussion(m.page, 'Final proof corrections');
            const before = await L.readDiscussion(m.page, d);
            const out = {offered: before.leaveDiscussion};
            if (!out.offered) return out;
            await d.locator('.leaveQueryForm a').first().click();
            await L.sleep(800);
            const confirm = await L.readConfirm(m.page);
            await snap(m.page, 'mgr-leave-confirm');
            await shot(m.page, 's6-mgr-leave-confirm');
            out.confirm = confirm ? {text: confirm.text, buttons: confirm.buttons} : null;
            if (confirm) await confirm.dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await L.sleep(1500);
            await idle(m.page);
            const data = await snap(m.page, 'mgr-after-leave');
            out.windowStillOpen = (await m.page.locator('#readQueryContainer:visible').count()) > 0;
            out.notices = data.notices;
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            out.gridAfter = await L.readGrid(m.page);
            const d2 = await L.openDiscussion(m.page, 'Final proof corrections');
            out.windowAfter = d2 ? await L.readDiscussion(m.page, d2) : null;
            await snap(m.page, 'mgr-window-after-leave');
            if (d2) await L.closeWindow(m.page, d2);
            return out;
        });
        await step('leaveTwo', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const d = await L.openDiscussion(m.page, 'Second thread');
            const out = await L.readDiscussion(m.page, d);
            await L.closeWindow(m.page, d);
            return {participants: out.participants, leaveDiscussion: out.leaveDiscussion};
        });

        // The Author's grid.
        await step('authorGridAfter', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            await snap(a.page, 'author-grid-after');
            return L.readGrid(a.page);
        });

        // "Order".
        await step('order', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const link = L.grid(m.page).locator('a.pkp_linkaction_orderItems, a:has-text("Order")').first();
            const out = {offered: (await link.count()) > 0 && (await link.isVisible())};
            if (!out.offered) return out;
            await link.click();
            await L.sleep(800);
            const data = await snap(m.page, 'mgr-order-mode');
            await shot(m.page, 's6-mgr-order-mode');
            const i = data.text.dialog.indexOf('Production Discussions');
            out.gridText = L.flat(data.text.dialog.slice(i, i + 500));
            out.buttons = (await L.grid(m.page).locator('a:visible, button:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            const cancel = L.grid(m.page).locator('a:has-text("Cancel"), button:has-text("Cancel")').first();
            if (await cancel.count()) await cancel.click();
            await L.sleep(500);
            return out;
        });
        await step('orderSe1', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            const link = L.grid(s.page).locator('a.pkp_linkaction_orderItems, a:has-text("Order")').first();
            return {offered: (await link.count()) > 0 && (await link.isVisible())};
        });
        await step('orderAuthor', async () => {
            const link = L.grid(a.page).locator('a.pkp_linkaction_orderItems, a:has-text("Order")').first();
            return {offered: (await link.count()) > 0 && (await link.isVisible())};
        });

        // "Delete".
        await step('delete', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const out = {};
            let {strip} = await L.rowActions(m.page, 'Final proof corrections');
            await strip.getByRole('link', {name: 'Delete', exact: true}).click();
            await L.sleep(800);
            let confirm = await L.readConfirm(m.page);
            await snap(m.page, 'mgr-delete-confirm');
            await shot(m.page, 's6-mgr-delete-confirm');
            out.confirm = confirm ? {text: confirm.text, buttons: confirm.buttons} : null;
            await confirm.dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await L.sleep(800);
            out.rowAfterCancel = (await L.gridRow(m.page, 'Final proof corrections').count()) > 0;
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            ({strip} = await L.rowActions(m.page, 'Final proof corrections'));
            await strip.getByRole('link', {name: 'Delete', exact: true}).click();
            await L.sleep(800);
            confirm = await L.readConfirm(m.page);
            const resp = m.page.waitForResponse((r) => /delete-query/i.test(r.url()), {timeout: 20_000}).catch(() => null);
            await confirm.dlg.getByRole('button', {name: 'OK', exact: true}).click();
            const r = await resp;
            out.status = r ? r.status() : null;
            await L.sleep(1200);
            await idle(m.page);
            const data = await snap(m.page, 'mgr-after-delete');
            out.notices = data.notices;
            out.rowAfterOk = (await L.gridRow(m.page, 'Final proof corrections').count()) > 0;
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            out.gridAfterReload = await L.readGrid(m.page);
            return out;
        });
        // Rule 8b: the person saving leaves themselves out, two others ticked.
        await step('authorLeftOut', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            const form = await L.openAdd(a.page);
            await L.tick(a.page, au.name, false);
            await L.tick(a.page, se1.name, true);
            await L.tick(a.page, se2.name, true);
            await form.locator('input[name="subject"]').fill('Without me');
            await L.typeMessage(a.page, form, 'A thread its writer is not in.');
            const boxes = await L.boxes(a.page, form);
            await snap(a.page, 'author-left-out-filled');
            const out = await L.pressOk(a.page, form);
            const data = await snap(a.page, 'author-left-out-saved');
            out.boxes = boxes;
            out.notices = data.notices;
            out.formText = out.formStillOpen ? (await L.readForm(a.page, L.queryForm(a.page))).text.slice(0, 300) : null;
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            out.authorRows = (await L.readGrid(a.page)).rows.map((r) => r.cells[0]);
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            out.se1Rows = (await L.readGrid(s.page)).rows.map((r) => r.cells.slice(0, 2).join(' | '));
            return out;
        });
        await step('se1TasksAfterDelete', () => tasksRows(s.page, app, J.path));
        await step('se2TasksAfterDelete', async () => {
            const b = await browserAs(app, se2.username, J.path);
            try {
                return await tasksRows(b.page, app, J.path);
            } finally {
                await b.close();
            }
        });
    } finally {
        R.save();
        await m.close();
        await a.close();
        await s.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S7: the Author's discussions.
async function s7(app) {
    const R = recorder('s7');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1, au} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
        files: [{file: 'article.pdf'}],
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const a = await browserAs(app, au.username, J.path);
    const s = await browserAs(app, se1.username, J.path);
    try {
        await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
        await step('givenProof', () => L.addDiscussion(s.page, {tickNames: [au.name], subject: 'Proof queries', message: 'Please answer the proof queries.', label: null}));
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('givenNotes', () => L.addDiscussion(m.page, {tickNames: [se1.name], subject: 'Editorial notes', message: 'Notes between editors.', label: null}));

        // The Author's grid.
        await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
        await snap(a.page, 'author-production');
        await shot(a.page, 's7-author-production');
        await step('authorGrid', () => L.readGrid(a.page));
        await step('authorRowActions', async () => (await L.rowActions(a.page, 'Proof queries')));
        await step('authorTasks', () => tasksRows(a.page, app, J.path, 'mySubmissions'));

        // The reply.
        await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
        await step('authorReply', async () => {
            const d = await L.openDiscussion(a.page, 'Proof queries');
            await snap(a.page, 'author-window');
            const before = await L.readDiscussion(a.page, d);
            const rf = await L.openReply(a.page, d);
            await snap(a.page, 'author-reply-form');
            const links = (await rf.locator('[id^="component-grid-files-query-querynotefilesgrid"] a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            await L.typeMessage(a.page, rf, 'The proofs look fine.');
            const out = await L.pressReplyOk(a.page, rf);
            await snap(a.page, 'author-after-reply');
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            const d2 = await L.openDiscussion(a.page, 'Proof queries');
            const after = await L.readDiscussion(a.page, d2);
            await L.closeWindow(a.page, d2);
            return {...out, before, replyFileLinks: links, after};
        });
        await step('se1MailReply', async () => {
            const box = await L.mailbox(app, se1.mail, 'Proof queries', {page: s.page});
            return Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
        });
        await step('se1TasksAfterReply', () => tasksRows(s.page, app, J.path));

        // Who the Author is offered.
        await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
        const form = await L.openAdd(a.page);
        await snap(a.page, 'author-add-window');
        await shot(a.page, 's7-author-add-window');
        await step('authorAddForm', () => L.readForm(a.page, form));
        await step('authorFileLinks', () => form.locator('[id^="component-grid-files-query-querynotefilesgrid"] a:visible').allInnerTexts().then((x) => x.map((t) => t.trim()).filter(Boolean)));

        // The creator unticked.
        await step('creatorUnticked', async () => {
            await form.locator('input[name="subject"]').fill('Figure 3');
            await L.typeMessage(a.page, form, 'Here is the corrected figure 3.');
            await L.tick(a.page, au.name, false);
            await L.tick(a.page, se1.name, true);
            const out = await L.pressOk(a.page, form);
            const f = L.queryForm(a.page);
            const data = await snap(a.page, 'author-creator-unticked');
            await shot(a.page, 's7-author-creator-unticked');
            return {...out, form: out.formStillOpen ? await L.readForm(a.page, f) : null, notices: data.notices};
        });

        // An uploaded file.
        await step('authorUpload', async () => {
            let f = L.queryForm(a.page);
            if (!(await f.count())) return {formGone: true};
            await L.tick(a.page, au.name, true);
            await L.tick(a.page, se1.name, true);
            const upload = await L.uploadInForm(a.page, f, 'profile-image-400.png');
            await snap(a.page, 'author-add-with-file');
            await shot(a.page, 's7-author-add-with-file');
            f = L.queryForm(a.page);
            const before = await L.readForm(a.page, f);
            const out = await L.pressOk(a.page, f);
            await snap(a.page, 'author-after-add');
            return {...out, upload, before: {boxes: before.boxes, subject: before.subject, message: before.message}};
        });
        await step('authorGridAfterAdd', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            await snap(a.page, 'author-grid-after-add');
            return L.readGrid(a.page);
        });
        await step('authorOwnRow', async () => {
            const actions = (await L.rowActions(a.page, 'Figure 3')).actions;
            await snap(a.page, 'author-own-strip');
            return {actions};
        });
        await step('authorOwnEdit', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            const f = await L.openEdit(a.page, 'Figure 3');
            if (!f) return {edit: false};
            const data = await snap(a.page, 'author-own-edit');
            await shot(a.page, 's7-author-own-edit');
            const out = await L.readForm(a.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {edit: true, title: out.title, boxes: out.boxes, editNotice: out.editNotice, tail: L.flat(data.text.dialog, 4000).slice(-300)};
        });
        await step('authorOwnWindow', async () => {
            await L.openStage(a.page, app, J.path, id, L.MENU_KEY.production, {view: 'mySubmissions'});
            const d = await L.openDiscussion(a.page, 'Figure 3');
            await snap(a.page, 'author-own-window');
            await shot(a.page, 's7-author-own-window');
            const out = await L.readDiscussion(a.page, d);
            const link = d.locator(`${L.notesGridSel} a`).filter({hasText: 'profile-image-400.png'}).first();
            if (await link.count()) {
                const dl = a.page.waitForEvent('download', {timeout: 20_000}).catch(() => null);
                await link.click();
                const got = await dl;
                out.download = got ? got.suggestedFilename() : null;
            }
            return out;
        });

        // The Section Editor's email.
        await step('se1MailFigure', async () => {
            const box = await L.mailbox(app, se1.mail, 'Figure 3', {page: s.page});
            return Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
        });
        await step('authorMailFigure', () => L.mailbox(app, au.mail, 'Figure 3', {tries: 1}).then((b) => b.map((x) => x.subject)));

        // The Journal Manager, not a participant.
        await step('mgrNotParticipant', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            await snap(m.page, 'mgr-grid');
            const out = {grid: await L.readGrid(m.page)};
            const d = await L.openDiscussion(m.page, 'Figure 3');
            await snap(m.page, 'mgr-figure3-window');
            await shot(m.page, 's7-mgr-figure3-window');
            out.window = await L.readDiscussion(m.page, d);
            if (out.window.addMessage) {
                const rf = await L.openReply(m.page, d);
                await L.typeMessage(m.page, rf, 'Thank you, the figure is in.');
                out.reply = await L.pressReplyOk(m.page, rf);
                await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
                const d2 = await L.openDiscussion(m.page, 'Figure 3');
                await snap(m.page, 'mgr-after-reply');
                await shot(m.page, 's7-mgr-after-reply');
                out.windowAfter = await L.readDiscussion(m.page, d2);
                await L.closeWindow(m.page, d2);
            } else {
                await L.closeWindow(m.page, d);
            }
            return out;
        });
        await step('mailAfterMgrReply', async () => {
            const box = await L.mailbox(app, au.mail, 'Figure 3', {page: a.page});
            return {au: box.map((b) => ({subject: b.subject, from: b.from, snippet: b.snippet})), se1: (await L.mailbox(app, se1.mail, 'Figure 3', {tries: 1})).map((b) => ({subject: b.subject, from: b.from}))};
        });

        // Control: the manager's grid lists "Editorial notes"; the Author's does not (read above).
        await step('se1Grid', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            await snap(s.page, 'se1-grid');
            return L.readGrid(s.page);
        });
    } finally {
        R.save();
        await m.close();
        await a.close();
        await s.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S8, S9: no template screen. S10: the Copyeditor on Copyediting.
async function s8(app) {
    const R = recorder('s8');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1, ce} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: J.people.au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}, {username: ce.username, role: 'copyeditor'}],
        decisions: TO_COPYEDITING,
        files: [{file: 'article.pdf'}],
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const c = await browserAs(app, ce.username, J.path);
    const s = await browserAs(app, se1.username, J.path);
    try {
        // Settings › Workflow: the tabs.
        await step('workflowSettings', async () => {
            await m.page.goto(app.url(`/index.php/${J.path}/en/management/settings/workflow`));
            await idle(m.page);
            const data = await snap(m.page, 'mgr-settings-workflow');
            await shot(m.page, 's8-mgr-settings-workflow');
            const tabs = (await m.page.getByRole('tab').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            return {tabs, tasksAndDiscussions: /Tasks and Discussions/i.test(data.text.main)};
        });
        await step('emailTemplates', async () => {
            await m.page.goto(app.url(`/index.php/${J.path}/en/management/settings/manageEmails`));
            await idle(m.page);
            const data = await snap(m.page, 'mgr-manage-emails');
            const text = data.text.main || '';
            const i = text.indexOf('Discussion (');
            return {found: i >= 0, around: L.flat(text.slice(Math.max(0, i - 200), i + 600), 800)};
        });
        await step('sectionEditorSettings', async () => {
            await s.page.goto(app.url(`/index.php/${J.path}/en/management/settings/workflow`));
            await idle(s.page);
            const data = await snap(s.page, 'se1-settings-workflow');
            return {text: L.flat(data.text.main, 300)};
        });

        // Copyediting: the given discussions.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.copyediting);
        await snap(m.page, 'mgr-copyediting-empty');
        await step('copyeditingGridEmpty', () => L.readGrid(m.page));
        await step('noticeBefore', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.copyediting);
            const data = await snap(s.page, 'se1-copyediting-before');
            const t = data.text.dialog;
            const i = t.indexOf('Notification');
            return i >= 0 ? L.flat(t.slice(i, i + 200)) : null;
        });
        await step('addFormCopyediting', async () => {
            const form = await L.openAdd(m.page);
            const out = await L.readForm(m.page, form);
            await snap(m.page, 'mgr-copyediting-add');
            await form.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {boxes: out.boxes, templates: out.templates};
        });
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.copyediting);
        await step('given', () => L.addDiscussion(m.page, {tickNames: [ce.name], subject: 'Copyedit the manuscript', message: 'Please copyedit the manuscript.', label: null}));
        await step('givenNotes', () => L.addDiscussion(m.page, {tickNames: [se1.name], subject: 'Editorial notes', message: 'Notes between editors.', label: null}));
        await step('noticeAfter', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.copyediting);
            const data = await snap(s.page, 'se1-copyediting-after');
            const t = data.text.dialog;
            const i = t.indexOf('Notification');
            return i >= 0 ? L.flat(t.slice(i, i + 200)) : null;
        });

        // The Copyeditor's grid.
        await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
        await snap(c.page, 'ce-copyediting');
        await shot(c.page, 's8-ce-copyediting');
        await step('ceGrid', () => L.readGrid(c.page));
        await step('ceRowActions', async () => (await L.rowActions(c.page, 'Copyedit the manuscript')).actions);
        await step('ceWindow', async () => {
            const d = await L.openDiscussion(c.page, 'Copyedit the manuscript');
            await snap(c.page, 'ce-window');
            return L.readDiscussion(c.page, d);
        });

        // A reply with an uploaded file.
        await step('ceReply', async () => {
            const d = L.queryWindow(c.page);
            const rf = await L.openReply(c.page, d);
            const links = (await rf.locator('[id^="component-grid-files-query-querynotefilesgrid"] a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            const upload = await L.uploadInForm(c.page, rf, 'notes.md');
            await snap(c.page, 'ce-reply-with-file');
            await L.typeMessage(c.page, rf, 'Copyedits done; my notes are attached.');
            const out = await L.pressReplyOk(c.page, rf);
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            const d2 = await L.openDiscussion(c.page, 'Copyedit the manuscript');
            await snap(c.page, 'ce-window-after-reply');
            await shot(c.page, 's8-ce-window-after-reply');
            const after = await L.readDiscussion(c.page, d2);
            await L.closeWindow(c.page, d2);
            return {...out, links, upload, after};
        });
        await step('mgrMail', async () => {
            const box = await L.mailbox(app, mgr.mail, 'Copyedit the manuscript', {page: m.page});
            return Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
        });

        // The Copyeditor's "Select Files".
        await step('ceSelectFiles', async () => {
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            const d = await L.openDiscussion(c.page, 'Copyedit the manuscript');
            const rf = await L.openReply(c.page, d);
            const filesGrid = rf.locator('[id^="component-grid-files-query-querynotefilesgrid"]').first();
            await filesGrid.waitFor({timeout: 30_000});
            const link = filesGrid.locator('a:has-text("Select Files")').first();
            if (!(await link.count())) return {offered: false};
            await link.click();
            await L.sleep(2500);
            await idle(c.page);
            const data = await snap(c.page, 'ce-select-files');
            await shot(c.page, 's8-ce-select-files');
            const out = {offered: true, window: L.flat(data.text.dialog, 1200)};
            await L.closeWindow(c.page);
            await L.sleep(500);
            const cancel = c.page.locator('form#noteForm a.cancelButton, form#noteForm a:has-text("Cancel")').last();
            if (await cancel.count()) await cancel.click().catch(() => {});
            await L.sleep(800);
            return out;
        });

        // The Copyeditor's "Closed" box on a discussion they did not open.
        await step('ceClose', async () => {
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            const out = await pressClosedBox(c.page, 'Copyedit the manuscript');
            await snap(c.page, 'ce-closed');
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            return {...out, grid: await L.readGrid(c.page)};
        });

        // The Copyeditor's own discussion: the form's time line, the strip, "Edit".
        await step('ceAdd', async () => {
            const form = await L.openAdd(c.page);
            const read = await L.readForm(c.page, form);
            await snap(c.page, 'ce-add-window');
            await shot(c.page, 's8-ce-add-window');
            await L.tick(c.page, se1.name);
            await form.locator('input[name="subject"]').fill('Style question');
            await L.typeMessage(c.page, form, 'Which style guide applies?');
            const out = await L.pressOk(c.page, form);
            return {...out, boxes: read.boxes, templates: read.templates, editNotice: read.editNotice};
        });
        await step('ceOwnRow', async () => {
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            const grid = await L.readGrid(c.page);
            const actions = (await L.rowActions(c.page, 'Style question')).actions;
            await snap(c.page, 'ce-own-strip');
            return {grid, actions};
        });
        await step('ceOwnEdit', async () => {
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            const f = await L.openEdit(c.page, 'Style question');
            if (!f) return {edit: false};
            await snap(c.page, 'ce-own-edit');
            await shot(c.page, 's8-ce-own-edit');
            const read = await L.readForm(c.page, f);
            await f.locator('input[name="subject"]').fill('Style guide question');
            const out = await L.pressOk(c.page, f);
            await L.openStage(c.page, app, J.path, id, L.MENU_KEY.copyediting);
            return {edit: true, editNotice: read.editNotice, title: read.title, ...out, grid: await L.readGrid(c.page)};
        });

        // Control: the manager's grid lists "Editorial notes".
        await step('mgrGrid', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.copyediting);
            await snap(m.page, 'mgr-copyediting');
            return L.readGrid(m.page);
        });
    } finally {
        R.save();
        await m.close();
        await c.close();
        await s.close();
    }
}

// ---------------------------------------------------------------------------------------------
// S11: reviewers and the Author on a review round.
async function s11(app) {
    const R = recorder('s11');
    const {step, snap, facts} = R;
    const REVIEWERS = {
        rv1: ['Rhea', 'Reviewer', ['externalReviewer']],
        rv2: ['Rolf', 'Reviewer', ['externalReviewer']],
    };
    const J = await journal(app, {...PEOPLE, ...REVIEWERS});
    const {se1, au, rv1, rv2} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}],
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: rv1.username, status: 'accepted'}, {username: rv2.username, status: 'accepted'}]}],
    });
    facts.journal = J.path;
    facts.seed = {reviewRounds: sub.reviewRounds, reviewAssignments: sub.reviewAssignments};
    const id = sub.submissionId;
    const roundKey = `workflow_3_${sub.reviewRounds[0].id}`;
    const s = await browserAs(app, se1.username, J.path);
    const r = await browserAs(app, rv1.username, J.path);
    const a = await browserAs(app, au.username, J.path);
    const QUESTION = 'Question for the reviewer';
    try {
        // Who the Section Editor is offered.
        await L.openStage(s.page, app, J.path, id, roundKey);
        await snap(s.page, 'se1-review-round');
        await shot(s.page, 's11-se1-review-round');
        await step('se1Grid', () => L.readGrid(s.page));
        let form = await L.openAdd(s.page);
        await snap(s.page, 'se1-add-window');
        await shot(s.page, 's11-se1-add-window');
        await step('se1AddForm', async () => {
            const f = await L.readForm(s.page, form);
            return {boxes: f.boxes, templates: f.templates};
        });

        // Two reviewers; a reviewer with the Author; one reviewer.
        const refusal = async (name) => {
            const ticked = await L.boxes(s.page, L.queryForm(s.page));
            const out = await L.pressOk(s.page, L.queryForm(s.page));
            out.boxesSent = ticked;
            form = L.queryForm(s.page);
            const data = await snap(s.page, name);
            const read = out.formStillOpen ? await L.readForm(s.page, form) : null;
            return {...out, boxesAfter: read && read.boxes, notice: read && read.notice, notices: data.notices};
        };
        await step('twoReviewers', async () => {
            await form.locator('input[name="subject"]').fill(QUESTION);
            await L.typeMessage(s.page, form, 'Please look again at figure 2.');
            await L.tick(s.page, rv1.name);
            await L.tick(s.page, rv2.name);
            return refusal('se1-two-reviewers');
        });
        await shot(s.page, 's11-se1-two-reviewers');
        await step('reviewerWithAuthor', async () => {
            await L.tick(s.page, rv1.name, true);
            await L.tick(s.page, rv2.name, false);
            await L.tick(s.page, au.name, true);
            await L.tick(s.page, se1.name, true);
            return refusal('se1-reviewer-with-author');
        });
        await step('saved', async () => {
            await L.tick(s.page, rv1.name, true);
            await L.tick(s.page, rv2.name, false);
            await L.tick(s.page, au.name, false);
            await L.tick(s.page, se1.name, true);
            const out = await L.pressOk(s.page, L.queryForm(s.page));
            await snap(s.page, 'se1-saved');
            return {...out, grid: await L.readGrid(s.page)};
        });

        // The Reviewer's email.
        await step('rv1Mail', async () => {
            const box = await L.mailbox(app, rv1.mail, QUESTION, {page: r.page});
            return Promise.all(box.map(async (b) => ({subject: b.subject, from: b.from, body: await L.mailBody(app, b.id)})));
        });

        // The Reviewer's grid at step 3, and the reply.
        await reviewerStep3(r.page, app, J.path, id);
        await snap(r.page, 'rv1-step3');
        await shot(r.page, 's11-rv1-step3');
        await step('rv1Grid', () => L.readGrid(r.page));
        await step('rv1RowActions', async () => (await L.rowActions(r.page, QUESTION)).actions);
        await step('rv1Reply', async () => {
            const d = await L.openDiscussion(r.page, QUESTION);
            await snap(r.page, 'rv1-window');
            await shot(r.page, 's11-rv1-window');
            const before = await L.readDiscussion(r.page, d);
            const rf = await L.openReply(r.page, d);
            const links = (await rf.locator('[id^="component-grid-files-query-querynotefilesgrid"] a:visible').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
            await L.typeMessage(r.page, rf, 'Figure 2 is fine now.');
            const out = await L.pressReplyOk(r.page, rf);
            await snap(r.page, 'rv1-after-reply');
            return {...out, before, links, grid: await L.readGrid(r.page)};
        });
        await step('se1MailReply', async () => {
            const box = await L.mailbox(app, se1.mail, QUESTION, {page: s.page});
            return box.map((b) => ({subject: b.subject, from: b.from, snippet: b.snippet}));
        });

        // Who the Reviewer is offered.
        await step('rv1AddForm', async () => {
            await reviewerStep3(r.page, app, J.path, id);
            const f = await L.openAdd(r.page);
            await snap(r.page, 'rv1-add-window');
            await shot(r.page, 's11-rv1-add-window');
            const read = await L.readForm(r.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {boxes: read.boxes, templates: read.templates, editNotice: read.editNotice, files: (read.text.match(/Search|Upload File|Select Files/g) || [])};
        });

        // The Author on the review round.
        await step('authorReview', async () => {
            await L.openStage(a.page, app, J.path, id, roundKey, {view: 'mySubmissions'});
            await snap(a.page, 'author-review-round');
            await shot(a.page, 's11-author-review-round');
            const grid = await L.readGrid(a.page);
            if (!grid.present) return {grid};
            const f = await L.openAdd(a.page);
            await snap(a.page, 'author-add-window');
            const read = await L.readForm(a.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {grid, boxes: read.boxes, templates: read.templates};
        });

        // A cancelled request.
        await step('cancelReviewer', async () => {
            await L.openStage(s.page, app, J.path, id, roundKey);
            const out = {};
            const row = s.page.getByRole('table', {name: 'Reviewers'}).getByRole('row').filter({hasText: rv1.name});
            out.rowFound = (await row.count()) > 0;
            await row.getByRole('button', {name: 'More Actions'}).click();
            await L.sleep(500);
            out.menu = (await s.page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map((t) => t.trim());
            await s.page.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
            // 3.5 serves "Cancel Reviewer" and "Unassign Reviewer" from one form.
            const cf = s.page.locator('form#unassignReviewerForm, form#cancelReviewForm').last();
            await cf.waitFor({timeout: 30_000});
            await idle(s.page);
            await L.sleep(1500);
            const formData = await snap(s.page, 'se1-cancel-reviewer-form');
            out.form = L.flat(formData.text.dialog, 300);
            await cf.locator('button[type="submit"], button.submitFormButton').last().click();
            await cf.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await idle(s.page);
            await L.openStage(s.page, app, J.path, id, roundKey);
            const data = await snap(s.page, 'se1-after-cancel');
            await shot(s.page, 's11-se1-after-cancel');
            out.cancelledShown = /Request Cancelled/i.test(data.text.dialog);
            out.grid = await L.readGrid(s.page);
            const d = await L.openDiscussion(s.page, QUESTION);
            await snap(s.page, 'se1-window-after-cancel');
            out.window = d ? await L.readDiscussion(s.page, d) : null;
            if (d) await L.closeWindow(s.page, d);
            return out;
        });
        await step('se1AddAfterCancel', async () => {
            await L.openStage(s.page, app, J.path, id, roundKey);
            const f = await L.openAdd(s.page);
            await snap(s.page, 'se1-add-after-cancel');
            const read = await L.readForm(s.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {boxes: read.boxes};
        });
        await step('se1EditAfterCancel', async () => {
            await L.openStage(s.page, app, J.path, id, roundKey);
            const f = await L.openEdit(s.page, QUESTION);
            if (!f) return {edit: false};
            await snap(s.page, 'se1-edit-after-cancel');
            const read = await L.readForm(s.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {boxes: read.boxes};
        });
    } finally {
        await s.close();
        await r.close();
        await a.close();
    }

    // An "Open" review, on a second scratch journal.
    const O = await journal(
        app,
        {
            se: ['Sam', 'Section', ['sectionEditor']],
            au: ['Ava', 'Author', ['author']],
            ra: ['Rhea', 'Accepted', ['externalReviewer']],
            rw: ['Rory', 'Waiting', ['externalReviewer']],
            rd: ['Rita', 'Declined', ['externalReviewer']],
        },
        {review: {defaultReviewMode: 'open'}}
    );
    const open = await app.api.createSubmission({
        tag: `${O.t}a`, context: O.path, submitter: O.people.au.username, title: `Submission ${O.t}a`,
        participants: [{username: O.people.se.username, role: 'sectionEditor'}],
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: O.people.ra.username, status: 'accepted'}, {username: O.people.rw.username, status: 'invited'}, {username: O.people.rd.username, status: 'declined'}]}],
    });
    facts.openJournal = O.path;
    const openKey = `workflow_3_${open.reviewRounds[0].id}`;
    const os = await browserAs(app, O.people.se.username, O.path);
    const oa = await browserAs(app, O.people.au.username, O.path);
    const or = await browserAs(app, O.people.ra.username, O.path);
    try {
        await step('openSeAddForm', async () => {
            await L.openStage(os.page, app, O.path, open.submissionId, openKey);
            const f = await L.openAdd(os.page);
            await snap(os.page, 'open-se-add-window');
            await shot(os.page, 's11-open-se-add-window');
            const read = await L.readForm(os.page, f);
            await f.locator('a.cancelButton, a:has-text("Cancel")').last().click();
            await L.sleep(1000);
            return {boxes: read.boxes};
        });
        await step('openAuthorDiscussion', async () => {
            await L.openStage(oa.page, app, O.path, open.submissionId, openKey, {view: 'mySubmissions'});
            const f = await L.openAdd(oa.page);
            await snap(oa.page, 'open-author-add-window');
            await shot(oa.page, 's11-open-author-add-window');
            const read = await L.readForm(oa.page, f);
            await L.tick(oa.page, O.people.ra.name);
            await f.locator('input[name="subject"]').fill('About point 3');
            await L.typeMessage(oa.page, f, 'Could you say more about point 3?');
            const out = await L.pressOk(oa.page, f);
            const data = await snap(oa.page, 'open-author-saved');
            return {...out, boxes: read.boxes, notices: data.notices, formText: out.formStillOpen ? (await L.readForm(oa.page, L.queryForm(oa.page))).text.slice(0, 400) : null, grid: await L.readGrid(oa.page)};
        });
        await step('openReviewerGrid', async () => {
            await reviewerStep3(or.page, app, O.path, open.submissionId);
            await snap(or.page, 'open-reviewer-step3');
            await shot(or.page, 's11-open-reviewer-step3');
            return L.readGrid(or.page);
        });
        await step('openSeTwoWithAuthor', async () => {
            // Control of the refusals: an "Open" reviewer and the Author in one discussion, by the editor.
            await L.openStage(os.page, app, O.path, open.submissionId, openKey);
            const out = await L.addDiscussion(os.page, {tickNames: [O.people.ra.name, O.people.au.name], subject: 'Open thread', message: 'An open thread.', label: null});
            await snap(os.page, 'open-se-saved');
            return {...out, grid: await L.readGrid(os.page)};
        });
    } finally {
        R.save();
        await os.close();
        await oa.close();
        await or.close();
    }
}

// ---------------------------------------------------------------------------------------------
// Body statements no scenario reaches.
async function x(app) {
    const R = recorder('x');
    const {step, snap, facts} = R;
    const J = await journal(app, PEOPLE);
    const {mgr, se1, se2, au} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}, {username: se2.username, role: 'sectionEditor'}],
        decisions: TO_PRODUCTION,
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const m = await browserAs(app, mgr.username, J.path);
    const s = await browserAs(app, se2.username, J.path);
    try {
        // Every stage's grid heading.
        await step('headings', async () => {
            const out = {};
            for (const [stage, key] of Object.entries({submission: 'workflow_1', copyediting: 'workflow_4', production: 'workflow_5'})) {
                await L.openStage(m.page, app, J.path, id, key);
                await snap(m.page, `mgr-${stage}`);
                out[stage] = (await L.readGrid(m.page)).heading;
            }
            return out;
        });

        // Rule 23: a person removed from the Participants panel.
        await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
        await step('given', () => L.addDiscussion(m.page, {tickNames: [se1.name, se2.name], subject: 'Three of us', message: 'A thread of three.', label: null}));
        await step('se2GridBefore', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            return L.readGrid(s.page);
        });
        await step('removeParticipant', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const out = {};
            const row = m.page.locator('li, tr').filter({hasText: se2.name}).filter({has: m.page.getByRole('button', {name: /More Actions/})}).last();
            out.rowFound = (await row.count()) > 0;
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await L.sleep(500);
            out.menu = (await m.page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map((t) => t.trim());
            await m.page.getByRole('menuitem', {name: 'Remove', exact: true}).click();
            await L.sleep(1200);
            await idle(m.page);
            const data = await snap(m.page, 'mgr-remove-participant');
            await shot(m.page, 'x-mgr-remove-participant');
            out.dialog = L.flat(data.text.dialog, 400);
            const ok = m.page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(OK|Yes|Remove)$/}).first();
            await ok.click();
            await L.sleep(1500);
            await idle(m.page);
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const after = await snap(m.page, 'mgr-after-remove');
            const t = after.text.dialog;
            out.participantsPanel = L.flat(t.slice(t.indexOf('PARTICIPANTS')), 300);
            const d = await L.openDiscussion(m.page, 'Three of us');
            await snap(m.page, 'mgr-window-after-remove');
            await shot(m.page, 'x-mgr-window-after-remove');
            out.window = await L.readDiscussion(m.page, d);
            await L.closeWindow(m.page, d);
            return out;
        });
        await step('editAfterRemove', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const f = await L.openEdit(m.page, 'Three of us');
            await snap(m.page, 'mgr-edit-after-remove');
            const read = await L.readForm(m.page, f);
            const out = {boxes: read.boxes};
            out.save = await L.pressOk(m.page, f);
            const data = await snap(m.page, 'mgr-edit-after-remove-ok');
            out.notices = data.notices;
            if (out.save.formStillOpen) {
                out.formText = (await L.readForm(m.page, L.queryForm(m.page))).text.slice(0, 500);
                await L.queryForm(m.page).locator('a.cancelButton, a:has-text("Cancel")').last().click();
                await L.sleep(1000);
            }
            return out;
        });
        await step('se2AfterRemove', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production, {wait: false});
            await L.sleep(3000);
            const data = await snap(s.page, 'se2-after-remove');
            return {url: s.page.url(), grid: await L.readGrid(s.page), text: L.flat(data.text.dialog || data.text.main, 300)};
        });

        // Fields: a subject longer than 255 characters.
        await step('longSubject', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const form = await L.openAdd(m.page);
            await L.tick(m.page, se1.name);
            await form.locator('input[name="subject"]').fill(`Long ${'x'.repeat(295)}`);
            await L.typeMessage(m.page, form, 'A long subject.');
            const out = await L.pressOk(m.page, form);
            const data = await snap(m.page, 'mgr-long-subject');
            await shot(m.page, 'x-mgr-long-subject');
            out.notices = data.notices;
            out.dialogText = L.flat((data.text.dialog || '').slice(-600), 600);
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            out.rows = (await L.readGrid(m.page)).rows.map((r) => r.cells[0].slice(0, 60) + ` (${r.cells[0].length})`);
            return out;
        });

        // Rule 13: "Add Message" left without saving, by "Cancel" and by the window's "Close".
        await step('replyLeft', async () => {
            const sent = [];
            const onRequest = (r) => {
                const hit = /\/query-notes-grid\/(add-note|insert-note|delete-note)/.exec(r.url());
                if (hit) sent.push(hit[1]);
            };
            m.page.on('request', onRequest);
            const read = async () => {
                await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
                const row = (await L.readGrid(m.page)).rows.find((r) => r.cells[0].includes('Three of us'));
                const d = await L.openDiscussion(m.page, 'Three of us');
                const notes = (await L.readDiscussion(m.page, d)).notes.map((n) => n.cells.join(' | '));
                return {replies: row ? row.cells[3] : null, lastReply: row ? row.cells[2] : null, notes, d};
            };
            const out = {};
            let state = await read();
            out.before = {replies: state.replies, notes: state.notes};
            // "Cancel" on the reply form.
            let rf = await L.openReply(m.page, state.d);
            await L.typeMessage(m.page, rf, 'A reply that is not saved.');
            let s0 = sent.length;
            await rf.locator('a.cancelButton, a[id^="cancelFormButton"]').last().click();
            await L.sleep(2500);
            out.cancel = {sent: sent.slice(s0), formStillOpen: (await m.page.locator('form#noteForm:visible').count()) > 0, windowStillOpen: (await m.page.locator('#readQueryContainer:visible').count()) > 0};
            await snap(m.page, 'mgr-reply-cancelled');
            state = await read();
            await snap(m.page, 'mgr-window-after-reply-cancel');
            await shot(m.page, 'x-mgr-window-after-reply-cancel');
            out.afterCancel = {replies: state.replies, lastReply: state.lastReply, notes: state.notes};
            // The discussion window's "Close" with the reply form open and untouched.
            rf = await L.openReply(m.page, state.d);
            s0 = sent.length;
            await state.d.getByRole('button', {name: 'Close', exact: true}).first().click();
            await L.sleep(2500);
            out.close = {sent: sent.slice(s0), windowStillOpen: (await m.page.locator('#readQueryContainer:visible').count()) > 0};
            state = await read();
            out.afterClose = {replies: state.replies, lastReply: state.lastReply, notes: state.notes};
            await L.closeWindow(m.page, state.d);
            m.page.off('request', onRequest);
            return out;
        });

        // Rule 21: a message sent from the Participants panel's "Notify".
        await step('notify', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const out = {};
            const row = m.page.locator('li, tr').filter({hasText: se1.name}).filter({has: m.page.getByRole('button', {name: /More Actions/})}).last();
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await L.sleep(500);
            out.menu = (await m.page.locator('[role="menu"] [role="menuitem"]').allInnerTexts()).map((t) => t.trim());
            await m.page.getByRole('menuitem', {name: 'Notify', exact: true}).click();
            const nf = m.page.locator('form#notifyForm, form[id^="notifyForm"]').last();
            await nf.waitFor({timeout: 30_000});
            await idle(m.page);
            await L.sleep(1500);
            const data = await snap(m.page, 'mgr-notify-form');
            await shot(m.page, 'x-mgr-notify-form');
            out.form = L.flat(data.text.dialog, 700);
            const select = nf.locator('select[name="template"]');
            out.templates = (await select.locator('option').allInnerTexts()).map((t) => t.trim());
            const resp = m.page.waitForResponse((r) => /fetch-template-body/i.test(r.url()), {timeout: 30_000}).catch(() => null);
            await select.selectOption({index: 1});
            await resp;
            await L.sleep(1200);
            await idle(m.page);
            const save = m.page.waitForResponse((r) => /save-participant|send-notification|notify/i.test(r.url()) && r.request().method() === 'POST', {timeout: 30_000}).catch(() => null);
            await nf.locator('button[type="submit"], button.submitFormButton').last().click();
            const r = await save;
            out.status = r ? `${new URL(r.url()).pathname.split('/').pop()} ${r.status()}` : null;
            await L.sleep(1500);
            await idle(m.page);
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            await snap(m.page, 'mgr-after-notify');
            await shot(m.page, 'x-mgr-after-notify');
            out.grid = await L.readGrid(m.page);
            return out;
        });
    } finally {
        R.save();
        await m.close();
        await s.close();
    }
}

const RUN = {s1, s2, s5, s6, s7, s8, s11, x};

forEachApp(async (app) => {
    if (app.line !== 'stable-3_5_0') throw new Error('walk.js drives OJS 3.5: put PKP_E2E_LINE=stable-3_5_0 in front');
    if (!PARTS.length) throw new Error(`walk.js: name a part (${Object.keys(RUN).join(', ')})`);
    for (const part of PARTS) {
        if (!RUN[part]) throw new Error(`walk.js: no part "${part}"`);
        await RUN[part](app);
    }
});

