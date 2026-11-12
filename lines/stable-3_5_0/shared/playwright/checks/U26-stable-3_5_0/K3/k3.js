// U26 "Review stage & rounds" on stable-3_5_0: claim check chunk K3 (spec body lines 278-365: Side effects,
// Settings that modify behavior, Cross-feature interactions; register A1, A7, A9, A10, A11, A13, A14, OMP2,
// OMP3). Spec: lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md.
//
// Run (the version's fleets up: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature U26-stable-3_5_0):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=U26-stable-3_5_0 PROBE_AGENT=ccK3 PROBE_RUN=s1 PARTS=mail,a11 \
//       PROBE_NOTES_FEATURE=U26-stable-3_5_0 ONLY=ojs,omp \
//       node bin/probe.js all lines/stable-3_5_0/shared/playwright/checks/U26-stable-3_5_0/K3/k3.js
//
// PROBE_RUN names the run (s1, then s2: each run builds its own scratch journals or presses with throwaway
// accounts; nothing on `publicknowledge` or the seeded roster is touched). PARTS picks parts (comma list,
// default all; a part takes one to five minutes per app, so run two or three per call). OJS and OMP only
// (a preprint server has no review stage; K1 owns the OPS absence lines). Needs Mailpit (mail, a11, rounds).
// No other script, env part or file another script writes is needed.
//
//   mail    Side effects "Author uploads a revised file" (fn l): who gets "Revised Version Uploaded", its
//           sender, the step-1 attach, the window's header "Close", the throttle (a second upload, a fresh
//           sign-in, an editor assigned after the first notice, a notice older than a day)
//   a11     register A11: the upload window's own "Cancel" link after the attach (file, status, email)
//   tasks   "Request Revisions decision" and "The revisions task once revised files arrive" (fn m), OMP3,
//           A9, A14, A1's in-round contrast: one author and two; upload, delete (author side and editor
//           side), a later upload; Tasks panel, My Submissions row, stored task rows
//   resub   the new-round variant: "Resubmit for review." (A13), A1 (the bottom button after the first file),
//           what clears the task (a recommendation, "Create New Review Round", "Cancel Review Round")
//   rounds  "Round created" (fn n: the round-status record, where it shows) and "Round cancelled" (fn f:
//           the wizard's steps, the emails to the author and the reviewer, the reviewer's lists)
//   min     "Minimum Confirmed Reviews Required" (fn r): minimum 2, minimum 1 and the 0 control, every state
//   sugg    "Reviewer suggestions enabled": the panel on the round, per role, against a journal with it off
//   a7      register A7: the review-files window after an on-screen "Send for Review", an upload from the
//           window, untick + OK, and what the Add Reviewer form and the reviewer's own page then offer
//   hist    "Reviewer's review": a reviewer's "Previous Reviews" box and its window on their own page,
//           and whether any of it shows on the review stage
//
// Outputs: .reports/U26-stable-3_5_0/ccK3/<part>-<screen>-<run>-<app>.json (+ .png) and per part
// `<part>-checks-<run>-<app>.json` (one row per claim read: the spec's sentence, what the screen gave,
// `same`). Helpers: ../W1/lib.js and ../K2/lib.js (and the version's apps/ojs/playwright/pages/ReviewStagePages.js).
const L = require('../W1/lib');
const K = require('../K2/lib');
const {forEachApp, check, fact, sect, snap, flat, log, idle, statusText, rowsOf, note, tag} = L;
const {has, eq, sleep, bits, finishDecision, decide, promoteBoxes, openChoice, reviewerDo, reviewerLists} = K;

const ALL = ['mail', 'a11', 'tasks', 'resub', 'rounds', 'min', 'sugg', 'a7', 'hist'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const REVISED = 'Revised Version Uploaded';
const LOG_REVISED = 536870913; // SubmissionEmailLogEventType::AUTHOR_NOTIFY_REVISED_VERSION (0x20000001)
const TASK_TYPES = {16777232: 'EDITOR_DECISION_PENDING_REVISIONS', 16777233: 'EDITOR_DECISION_RESUBMIT', 16777237: 'PENDING_INTERNAL_REVISIONS', 16777238: 'PENDING_EXTERNAL_REVISIONS'};
const ROUND_STATUS_TYPE = 16777236; // NOTIFICATION_TYPE_REVIEW_ROUND_STATUS (0x1000014)

forEachApp(async (app) => {
    if (app.name === 'ops') { log('OPS has no review stage: K3 runs on OJS and OMP only'); return; }
    const B = bits(app);
    const {P, GENRE, SEND, isOMP} = B;
    const EDITOR_GROUP = isOMP ? 'Press editor' : 'Journal editor';
    const SEND_LABEL = isOMP ? 'Send to External Review' : 'Send for Review';
    const PRESS_TASK = 'Revisions to consider in External Review.';
    const sql = (q) => L.sql(app, q).split('\n').filter(Boolean);
    const mailTo = (u) => `${u}@mail.test`;
    const parts = {};

    // ---------------------------------------------------------------------------------------------
    // Shared helpers of this chunk.
    async function journal(prefix, people, extra = {}) {
        const J = tag(`u26vk3${prefix}`);
        const u = {}; const n = {};
        for (const [k, g, f] of people) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
        await app.api.createContext({tag: J, ...extra,
            users: people.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]}))});
        fact(`journal-${prefix}`, J);
        return {J, u, n};
    }
    async function seed(j, suffix, {decisions, reviewRounds = [{reviewers: []}], participants, submitter, files, reviewerSuggestions} = {}) {
        const t = `${j.J}${suffix}`;
        const spec = {tag: t, context: j.J, submitter: submitter || j.u.au, title: `Submission ${t}`,
            decisions: decisions || SEND, reviewRounds: reviewRounds.map((x) => B.R(x))};
        if (participants) spec.participants = participants;
        if (files) spec.files = files;
        if (reviewerSuggestions) spec.reviewerSuggestions = reviewerSuggestions;
        const r = await app.api.createSubmission(spec);
        fact(`seed-${suffix}`, r.submissionId);
        return {id: r.submissionId, title: `Submission ${t}`, tag: t};
    }
    const ED = (j, k = 'ed') => ({username: j.u[k], role: 'editor'});
    /** The author's My Submissions row for the title: its text and controls. */
    async function myRow(a, title, label) {
        await a.page.goto(`/index.php/${a.ctx}/dashboard/mySubmissions`);
        await idle(a.page);
        const row = a.page.getByRole('row').filter({hasText: new RegExp(`${title}(?![a-z0-9])`)}).first();
        await row.waitFor({timeout: 30000}).catch(() => {});
        await idle(a.page);
        await snap(a.page, label);
        return {
            text: flat(await row.innerText().catch(() => null), 300),
            buttons: await row.locator('button:visible, a:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean)).catch(() => []),
        };
    }
    /** The header Tasks window's rows naming the submission. */
    async function tasksFor(a, title, label) {
        const t = await L.taskRows(a, label);
        return t.rows.filter((r) => new RegExp(`${title}(?![a-z0-9])`).test(r));
    }
    /** The header Tasks window opened from a dashboard page (`editorial` for an editor). */
    async function tasksAt(a, view, label) {
        const page = a.page;
        await page.goto(`/index.php/${a.ctx}/dashboard/${view}`);
        await idle(page);
        const bell = page.getByRole('button', {name: /^Tasks/}).first();
        await bell.waitFor({timeout: 30000});
        await bell.click();
        const dlg = page.getByRole('dialog').filter({has: page.getByRole('heading', {name: 'Tasks', exact: true})});
        await dlg.locator('table').first().waitFor({timeout: 45000});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').filter({visible: true}).allInnerTexts().then((r) => r.map((x) => flat(x, 260)));
        await snap(page, label, {taskRows: rows});
        await dlg.getByRole('button', {name: 'Close', exact: true}).first().click();
        return {rows};
    }
    /** The task rows stored for a submission: username and type. */
    const storedTasks = (id) => sql(`select u.username, n.type from notifications n left join users u on u.user_id = n.user_id where n.assoc_id = ${id} and n.type in (${Object.keys(TASK_TYPES).join(',')}) order by 1, 2`)
        .map((r) => { const [user, type] = r.split('|'); return `${user}:${TASK_TYPES[type] || type}`; });
    /** "Request Revisions" on screen: the choice window, then the wizard to "Record Decision". */
    async function requestRevisions(a, {newRound = false} = {}, label) {
        const c = await openChoice(a, `${label}-choice`);
        await c.modal.getByRole('radio', {name: newRound ? 'Revisions will be subject to a new round of peer reviews.' : 'Revisions will not be subject to a new round of peer reviews.'}).check();
        await c.modal.getByRole('button', {name: 'Next', exact: true}).click();
        return finishDecision(app, a, label);
    }
    /** The wizard's first step: component and file attached, the window left open. */
    async function attach(page, file) {
        const dlg = P.uploadWizardDialog(page);
        await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        const genre = dlg.locator('select[id^="genreId"]');
        if (await genre.count()) await genre.selectOption({label: GENRE});
        await dlg.locator('input[type="file"]').setInputFiles(file);
        await dlg.getByRole('button', {name: 'Continue', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 30000});
        await idle(page);
        return dlg;
    }
    async function authorUpload(au, id, file, label, {button = 'Upload revisions'} = {}) {
        await L.openAuthor(au, id, `${label}-before`);
        if (button === 'Upload') {
            const wf = new P.WorkflowPage(au.page, au.ctx);
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
        } else {
            await au.page.getByRole('button', {name: button, exact: true}).click();
        }
        await P.uploadViaWizard(au.page, {genre: GENRE, file});
    }
    async function deleteRevision(a, file) {
        const wf = new P.WorkflowPage(a.page, a.ctx);
        const row = wf.panelRow('Revisions Uploaded', file.name).first();
        const menu = await P.openRowMenu(a.page, row);
        const items = await menu.getByRole('menuitem').allInnerTexts().then((x) => x.map((y) => flat(y)));
        await menu.getByRole('menuitem', {name: 'Delete', exact: true}).click();
        const c = a.page.getByRole('dialog').filter({hasText: 'Delete'}).filter({has: a.page.getByRole('button', {name: 'OK', exact: true})}).last();
        await c.getByRole('button', {name: 'OK', exact: true}).click();
        await idle(a.page);
        return items;
    }
    const subjects = async (to, since) => {
        const r = await app.mail._search({to, since});
        return (r.messages || []).map((m) => m.Subject);
    };
    const countRevised = (u, since) => app.mail.count({to: mailTo(u), subject: REVISED, since});
    async function pollCount(u, want, since, ms = 20000) {
        const end = Date.now() + ms; let c = 0;
        while (Date.now() < end) { c = await countRevised(u, since); if (c >= want) return c; await sleep(500); }
        return c;
    }

    // =============================================================================================
    // Side effects: the "Revised Version Uploaded" email (fn l).
    parts.mail = async () => {
        const people = [
            ['mgr', 'Mona', 'Managerly', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'], ['ed2', 'Eddie', 'Unassigned', 'editor'],
            ['ed3', 'Edna', 'Later', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['fc', 'Fran', 'Funderly', 'funding'],
            ['au', 'Avery', 'Authorly', 'author'],
        ];
        if (!isOMP) people.push(['ge', 'Gene', 'Guestly', 'guestEditor']);
        const j = await journal('m', people);
        const part = [ED(j), {username: j.u.se, role: 'sectionEditor'}, {username: j.u.fc, role: 'funding'}];
        if (!isOMP) part.push({username: j.u.ge, role: 'guestEditor'});
        const s = await seed(j, 'm', {decisions: [...SEND, 'requestRevisions'], participants: part});
        const since = new Date(Date.now() - 2000);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const f1 = L.txtNamed(`${s.tag}-rev1.txt`), f2 = L.txtNamed(`${s.tag}-rev2.txt`), f3 = L.txtNamed(`${s.tag}-rev3.txt`), f4 = L.txtNamed(`${s.tag}-rev4.txt`);
        const assigned = isOMP ? ['ed', 'se'] : ['ed', 'se', 'ge'];
        await sect('attach', async () => {
            let e = await L.openEditorial(ed, s.id, 'ed-requested');
            fact('ed-requested', statusText(e));
            await L.openAuthor(au, s.id, 'au-requested');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = await attach(au.page, f1);
            const tAttach = new Date();
            const behind = await L.reread(au, 'au-attached-window-open');
            const tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
            const selected = await dlg.locator('[role=tab][aria-selected="true"]').allInnerTexts().catch(() => []);
            fact('window-open', {tabs, selected, panelBehind: rowsOf(behind, 'Revisions Uploaded'), status: statusText(behind)});
            check('l.panel-behind', '(read, the spec says "as it closes") with the window still open on step 1, what the "Revisions Uploaded" panel behind it lists', rowsOf(behind, 'Revisions Uploaded'), true);
            e = await L.openEditorial(ed, s.id, 'ed-after-attach');
            check('l.flip', 'the step-1 attach flips the editor\'s box to "Revisions have been submitted and a decision is needed."', statusText(e), eq(e.status && e.status.lines, ['Revisions have been submitted and a decision is needed.']));
            const got = {};
            for (const k of assigned) {
                const m = await app.mail.find({to: mailTo(j.u[k]), subject: REVISED, since, timeoutMs: 20000}).catch(() => null);
                got[k] = m ? {subject: m.Subject, fromName: m.From && m.From.Name, fromAddress: m.From && m.From.Address, created: m.Created} : null;
            }
            fact('notice-assigned', {got, attachedAt: tAttach.toISOString()});
            check('l.recipients', `the assigned ${assigned.join(', ')} (Journal/Press editor, Section editor${isOMP ? '' : ', Guest editor'}) each get "${REVISED}" at the attach`, got, assigned.every((k) => got[k] && got[k].subject === REVISED));
            check('l.sender', 'sent under the author\'s own name and address', Object.values(got).map((x) => x && `${x.fromName} <${x.fromAddress}>`), assigned.every((k) => got[k] && got[k].fromAddress === mailTo(j.u.au) && got[k].fromName === j.n.au));
            const none = {};
            for (const k of ['mgr', 'ed2', 'fc']) none[k] = await countRevised(j.u[k], since);
            fact('notice-not-assigned', none);
            check('l.not-others', 'no notice to the unassigned Journal/Press manager, the unassigned editor, or the assigned Funding coordinator (bounded by the assigned ones\' notices)', none, Object.values(none).every((c) => c === 0));
            // The window's header "Close" (it asks first; the actor accepts).
            const n0 = au.nativeDialogs.length;
            await dlg.getByRole('button', {name: 'Close', exact: true}).first().click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(600);
            const same = await L.reread(au, 'au-closed');
            const re = await L.openAuthor(au, s.id, 'au-closed-reloaded');
            fact('close', {dialogs: au.nativeDialogs.slice(n0), samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded'), status: statusText(re)});
            check('l.close-keeps', 'closing the window through its header "Close" keeps the file (same page and after a reload)', {samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded')}, has(rowsOf(same, 'Revisions Uploaded'), f1.name) && has(rowsOf(re, 'Revisions Uploaded'), f1.name));
            check('l.close-mail', 'the email stands after the "Close"', await countRevised(j.u.ed, since), (await countRevised(j.u.ed, since)) === 1);
        });
        await sect('throttle', async () => {
            // An editor assigned on screen after the first notice, who has not signed in since.
            await L.openEditorial(ed, s.id, 'ed-before-assign');
            await P.assignParticipant(ed.page, {group: EDITOR_GROUP, name: j.n.ed3, searchName: j.u.ed3});
            const pi = await L.reread(ed, 'ed-after-assign');
            fact('ed3-assigned', (pi.tables || []).map((t) => t.name));
            // Second upload, complete wizard, nobody signed in again.
            await authorUpload(au, s.id, f2, 'au-second');
            await sleep(3000);
            const after2 = {};
            for (const k of [...assigned, 'ed3']) after2[k] = await countRevised(j.u[k], since);
            fact('after-second-upload', after2);
            // The Editor signs in again, then a third upload.
            await sleep(1500);
            await L.actor(app, j.u.ed, j.J);
            await sleep(1500);
            await authorUpload(au, s.id, f3, 'au-third');
            const edCount = await pollCount(j.u.ed, 2, since);
            const after3 = {ed: edCount};
            for (const k of [...assigned.filter((x) => x !== 'ed'), 'ed3']) after3[k] = await countRevised(j.u[k], since);
            fact('after-third-upload', after3);
            check('l.throttle', 'a further upload the same day sends nothing to an editor already notified who has not signed in since', {after2, after3}, assigned.every((k) => after2[k] === 1) && assigned.filter((k) => k !== 'ed').every((k) => after3[k] === 1));
            check('l.signin', 'after the Editor signs in again, a further upload sends that Editor a fresh notice (and only that Editor)', after3, after3.ed === 2);
            check('l.new-editor', '(not in the spec) an editor assigned after the first notice, never signed in since: notified at all?', {after2: after2.ed3, after3: after3.ed3}, true);
            // The other end of "within a day": the logged notices moved two days back, then a fourth upload.
            const moved = sql(`update email_log set date_sent = date_sent - interval '2 days' where assoc_id = ${s.id} and event_type = ${LOG_REVISED} returning log_id`);
            fact('log-backdated', moved);
            await authorUpload(au, s.id, f4, 'au-fourth');
            const se4 = await pollCount(j.u.se, 2, since);
            const after4 = {se: se4};
            for (const k of [...assigned.filter((x) => x !== 'se'), 'ed3']) after4[k] = await countRevised(j.u[k], since);
            fact('after-fourth-upload', after4);
            check('l.day', 'with the last notice over a day old, the next upload notifies again editors who have not signed in', after4, after4.se === 2);
            const panel = await L.openAuthor(au, s.id, 'au-four-files');
            fact('four-files', rowsOf(panel, 'Revisions Uploaded'));
            fact('email-log', sql(`select event_type, to_char(date_sent, 'YYYY-MM-DD HH24:MI:SS'), from_address, recipients from email_log where assoc_id = ${s.id} and event_type = ${LOG_REVISED} order by log_id`));
        });
    };

    // =============================================================================================
    // Register A11: the upload window's own "Cancel" link.
    parts.a11 = async () => {
        const j = await journal('c', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author']]);
        const s = await seed(j, 'c', {decisions: [...SEND, 'requestRevisions'], participants: [ED(j)]});
        const since = new Date(Date.now() - 2000);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const f = L.txtNamed(`${s.tag}-cancelled.txt`);
        await sect('cancel', async () => {
            await L.openEditorial(ed, s.id, 'ed-before');
            await L.openAuthor(au, s.id, 'au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = await attach(au.page, f);
            const behind = await L.reread(au, 'au-attached');
            let e = await L.openEditorial(ed, s.id, 'ed-after-attach');
            const m = await app.mail.find({to: mailTo(j.u.ed), subject: REVISED, since, timeoutMs: 20000}).catch(() => null);
            fact('attached', {panelBehind: rowsOf(behind, 'Revisions Uploaded'), editor: statusText(e), mail: m && m.Subject});
            const links = await dlg.locator('a:visible, button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean));
            fact('window-controls', links);
            const n0 = au.nativeDialogs.length;
            await dlg.getByRole('link', {name: 'Cancel'}).click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(800);
            const same = await L.reread(au, 'au-after-cancel');
            const sc = await snap(au.page, 'au-after-cancel-notices');
            const re = await L.openAuthor(au, s.id, 'au-after-cancel-reloaded');
            e = await L.openEditorial(ed, s.id, 'ed-after-cancel');
            await sleep(2000);
            const count = await countRevised(j.u.ed, since);
            const rows = sql(`select count(*) from submission_files where submission_id = ${s.id} and file_stage = 15`);
            fact('after-cancel', {dialogs: au.nativeDialogs.slice(n0), notices: sc.notices, samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded'),
                authorButtons: re.buttons, authorStatus: statusText(re), editor: statusText(e), mails: count, revisionRows: rows});
            check('a11.file', 'A11: "Cancel" after the attach removes the file: the panel back to "No Items" (same page and after a reload)', {samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded')}, eq(rowsOf(same, 'Revisions Uploaded'), ['No Items']) && eq(rowsOf(re, 'Revisions Uploaded'), ['No Items']));
            check('a11.status', 'A11: the editor\'s box back to "Revisions have been requested."', statusText(e), eq(e.status && e.status.lines, ['Revisions have been requested.']));
            check('a11.mail', 'A11: the email already sent stands (one notice)', {first: m && m.Subject, count}, !!m && count === 1);
            check('a11.button', 'the author is offered "Upload revisions" again', re.buttons, has(re.buttons, 'Upload revisions'));
            check('a11.silent', 'nothing on the screen explains (no page notice, no browser question)', {notices: sc.notices, dialogs: au.nativeDialogs.slice(n0)}, !(sc.notices || []).length && au.nativeDialogs.length === n0);
        });
    };

    // =============================================================================================
    // Side effects: the revisions task in the same round; one author and two (fn m, OMP3, A9, A14, A1 contrast).
    parts.tasks = async () => {
        const j = await journal('t', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['au2', 'Blake', 'Writerly', 'author'],
            ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const rr = [{reviewers: [{username: j.u.rv1, status: 'completed'}]}];
        const S1 = await seed(j, 'one', {participants: [ED(j)], reviewRounds: rr});
        const S2 = await seed(j, 'two', {participants: [ED(j), {username: j.u.au2, role: 'author'}], reviewRounds: rr});
        const S2b = await seed(j, 'co2', {participants: [ED(j), {username: j.u.au2, role: 'author'}], reviewRounds: rr});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const au2 = await L.actor(app, j.u.au2, j.J);
        const fresh = isOMP ? PRESS_TASK : 'Revision required.';
        const read = async (s, who, label) => {
            const out = {};
            for (const [k, a] of who) out[k] = {tasks: await tasksFor(a, s.title, `${label}-${k}-tasks`), row: await myRow(a, s.title, `${label}-${k}-row`)};
            out.stored = storedTasks(s.id);
            fact(label, out);
            return out;
        };
        await sect('one', async () => {
            await L.openEditorial(ed, S1.id, 'one-ed-before');
            await requestRevisions(ed, {}, 'one-request');
            let e = await L.reread(ed, 'one-ed-requested');
            let r = await read(S1, [['au', au]], 'one-requested');
            check('m.task', `a sole author's task reads "${fresh}" and names the submission`, r.au.tasks, r.au.tasks.length === 1 && r.au.tasks[0].includes(fresh));
            check('m.row', 'the My Submissions row reads "Revision requested" with "Submit revisions"', r.au.row, /Revision requested/.test(r.au.row.text || '') && has(r.au.row.buttons, 'Submit revisions'));
            const f = L.txtNamed(`${S1.tag}-rev.txt`);
            await authorUpload(au, S1.id, f, 'one-upload');
            const a = await L.reread(au, 'one-au-after-upload');
            check('a1.contrast', 'A1 contrast: in the same-round path "Upload revisions" and the panel\'s "Upload" both stay after the first file', a.buttons, has(a.buttons, 'Upload revisions') && has(a.buttons, 'Upload'));
            e = await L.openEditorial(ed, S1.id, 'one-ed-submitted');
            r = await read(S1, [['au', au]], 'one-uploaded');
            check('m.clears', 'the task disappears once a revised file is uploaded', r.au.tasks, r.au.tasks.length === 0);
            fact('one-uploaded-status', statusText(e));
            // Author-side delete of the only revised file.
            await L.openAuthor(au, S1.id, 'one-au-before-delete');
            const menu = await deleteRevision(au, f);
            fact('author-file-menu', menu);
            const same = await L.reread(au, 'one-au-after-delete');
            e = await L.openEditorial(ed, S1.id, 'one-ed-after-delete');
            r = await read(S1, [['au', au]], 'one-deleted');
            check('a9.status', 'A9: the only revised file deleted (author side): the round reads "Revisions have been requested." again (editor\'s box, after a reload; author\'s same page)', {editor: statusText(e), author: statusText(same)}, eq(e.status && e.status.lines, ['Revisions have been requested.']));
            check('a9.row', 'A9: the My Submissions row reverts to "Revision requested" / "Submit revisions"', r.au.row, /Revision requested/.test(r.au.row.text || '') && has(r.au.row.buttons, 'Submit revisions'));
            check('a9.task', 'A9: no revisions task comes back (Tasks panel and stored rows)', {tasks: r.au.tasks, stored: r.stored}, r.au.tasks.length === 0 && r.stored.length === 0);
            // A later revised file does not re-create it either.
            await authorUpload(au, S1.id, L.txtNamed(`${S1.tag}-rev2.txt`), 'one-later');
            r = await read(S1, [['au', au]], 'one-later');
            fact('one-later-tasks', r.au.tasks);
        });
        await sect('two', async () => {
            await L.openEditorial(ed, S2.id, 'two-ed-before');
            await requestRevisions(ed, {}, 'two-request');
            let r = await read(S2, [['au', au], ['au2', au2]], 'two-requested');
            const words = [r.au.tasks.join(' | '), r.au2.tasks.join(' | ')];
            check('m.two', isOMP ? 'OMP3: with two authors, one task reads "Revisions to consider in External Review." and the other "Revision required."' : 'with two authors, each task reads "Revision required."',
                {au: r.au.tasks, au2: r.au2.tasks, stored: r.stored},
                r.au.tasks.length === 1 && r.au2.tasks.length === 1 && (isOMP ? words.some((w) => w.includes(PRESS_TASK)) && words.some((w) => w.includes('Revision required.')) : words.every((w) => w.includes('Revision required.'))));
            check('m.two-rows', 'each author\'s row reads "Revision requested" with "Submit revisions"', {au: r.au.row, au2: r.au2.row}, [r.au.row, r.au2.row].every((x) => /Revision requested/.test(x.text || '') && has(x.buttons, 'Submit revisions')));
            const f = L.txtNamed(`${S2.tag}-rev.txt`);
            await authorUpload(au, S2.id, f, 'two-upload');
            const e = await L.openEditorial(ed, S2.id, 'two-ed-submitted');
            r = await read(S2, [['au', au], ['au2', au2]], 'two-uploaded');
            check('a14', 'A14: after the submitter\'s upload only one author\'s task goes; the other keeps "Revision required." while the round reads "Revisions have been submitted and a decision is needed."',
                {au: r.au.tasks, au2: r.au2.tasks, stored: r.stored, status: statusText(e), rows: [r.au.row.text, r.au2.row.text]},
                (r.au.tasks.length + r.au2.tasks.length) === 1 && [...r.au.tasks, ...r.au2.tasks].join().includes('Revision required.') && eq(e.status && e.status.lines, ['Revisions have been submitted and a decision is needed.']));
            fact('a14-who-kept', {submitterKept: r.au.tasks.length === 1, participantKept: r.au2.tasks.length === 1});
            // Editor-side delete of the only revised file.
            await L.openEditorial(ed, S2.id, 'two-ed-before-delete');
            await deleteRevision(ed, f);
            const same = await L.reread(ed, 'two-ed-after-delete');
            const re = await L.openEditorial(ed, S2.id, 'two-ed-after-delete-reloaded');
            r = await read(S2, [['au', au], ['au2', au2]], 'two-deleted');
            check('a9.two', 'A9 (editor side, two authors): the round reads "Revisions have been requested." again (same page and reload); no task comes back for the author whose task went',
                {same: statusText(same), reloaded: statusText(re), au: r.au.tasks, au2: r.au2.tasks, stored: r.stored, rows: [r.au.row.text, r.au2.row.text]},
                eq(re.status && re.status.lines, ['Revisions have been requested.']) && (r.au.tasks.length + r.au2.tasks.length) === 1);
        });
        // The same two-author request, the co-author (added in Participants) uploading: whose task goes?
        await sect('two-coauthor', async () => {
            await L.openEditorial(ed, S2b.id, 'twob-ed-before');
            await requestRevisions(ed, {}, 'twob-request');
            let r = await read(S2b, [['au', au], ['au2', au2]], 'twob-requested');
            await authorUpload(au2, S2b.id, L.txtNamed(`${S2b.tag}-rev.txt`), 'twob-upload');
            r = await read(S2b, [['au', au], ['au2', au2]], 'twob-uploaded');
            fact('a14-coauthor-upload-who-kept', {submitterKept: r.au.tasks.length === 1, participantKept: r.au2.tasks.length === 1, stored: r.stored});
            check('a14.coauthor', 'A14 with the co-author uploading: again only one of the two tasks goes', {au: r.au.tasks, au2: r.au2.tasks}, (r.au.tasks.length + r.au2.tasks.length) === 1);
        });
    };

    // =============================================================================================
    // The new-round variant: "Resubmit for review." (A13) and A1.
    parts.resub = async () => {
        const j = await journal('r', [['ed', 'Edda', 'Editorly', 'editor'], ['rec', 'Remy', 'Recommendly', 'sectionEditor'], ['au', 'Avery', 'Authorly', 'author'],
            ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const S3 = await seed(j, 'new', {participants: [ED(j), {username: j.u.rec, role: 'sectionEditor', recommendOnly: true}], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const S4 = await seed(j, 'cxl', {participants: [ED(j)]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const rec = await L.actor(app, j.u.rec, j.J);
        await sect('resubmit', async () => {
            await L.openEditorial(ed, S3.id, 'new-ed-before');
            const tDec = new Date(Date.now() - 1000);
            await requestRevisions(ed, {newRound: true}, 'new-request');
            let e = await L.reread(ed, 'new-ed-requested');
            let t = await tasksFor(au, S3.title, 'new-au-tasks');
            let row = await myRow(au, S3.title, 'new-au-row');
            fact('new-requested', {status: statusText(e), tasks: t, row, stored: storedTasks(S3.id)});
            check('m.resubmit', 'the new-round variant\'s task reads "Resubmit for review."', t, t.length === 1 && t[0].includes('Resubmit for review.'));
            const f = L.txtNamed(`${S3.tag}-rev.txt`);
            const tUp = new Date(Date.now() - 1000);
            await authorUpload(au, S3.id, f, 'new-upload');
            let a = await L.reread(au, 'new-au-after-upload');
            const a2 = await L.openAuthor(au, S3.id, 'new-au-after-upload-reloaded');
            check('a1', 'A1: after the first file "Upload revisions" is gone and the panel\'s "Upload" stays (same page and after a reload)', {samePage: a.buttons, reloaded: a2.buttons, status: statusText(a2)},
                !has(a.buttons, 'Upload revisions') && has(a.buttons, 'Upload') && !has(a2.buttons, 'Upload revisions') && has(a2.buttons, 'Upload'));
            e = await L.openEditorial(ed, S3.id, 'new-ed-submitted');
            t = await tasksFor(au, S3.title, 'new-au-tasks-after-upload');
            row = await myRow(au, S3.title, 'new-au-row-after-upload');
            const mailsAfterUpload = await subjects(mailTo(j.u.au), tUp);
            fact('new-uploaded', {status: statusText(e), tasks: t, row, stored: storedTasks(S3.id), authorMailSinceDecision: await subjects(mailTo(j.u.au), tDec), authorMailSinceUpload: mailsAfterUpload});
            check('a13', 'A13: the task stays after the upload, while the round reads "Revisions submitted. A new review round needs to be created." and the row "Review update"',
                {tasks: t, status: statusText(e), row: row.text}, t.length === 1 && t[0].includes('Resubmit for review.') && eq(e.status && e.status.lines, ['Revisions submitted. A new review round needs to be created.']) && /Review update/.test(row.text || ''));
            check('a13.mail', 'A13: it sends no email (nothing reaches the author after the upload)', mailsAfterUpload, mailsAfterUpload.length === 0);
            // A recommendation leaves it.
            await L.openEditorial(rec, S3.id, 'new-rec-before');
            await decide(app, rec, 'Recommend Accept', 'new-recommend');
            t = await tasksFor(au, S3.title, 'new-au-tasks-after-recommendation');
            check('a13.recommendation', 'A13: a recommendation leaves the task', t, t.length === 1);
            // "Create New Review Round" clears it.
            await L.openEditorial(ed, S3.id, 'new-ed-before-newround');
            await decide(app, ed, 'Create New Review Round', 'new-newround');
            e = await L.reread(ed, 'new-ed-round2');
            t = await tasksFor(au, S3.title, 'new-au-tasks-after-newround');
            fact('new-round2', {title: e.title, status: statusText(e), tasks: t, stored: storedTasks(S3.id)});
            check('a13.newround', 'A13: "Create New Review Round" clears the task', t, t.length === 0);
        });
        await sect('cancel', async () => {
            await L.openEditorial(ed, S4.id, 'cxl-ed-before');
            await requestRevisions(ed, {newRound: true}, 'cxl-request');
            await authorUpload(au, S4.id, L.txtNamed(`${S4.tag}-rev.txt`), 'cxl-upload');
            let t = await tasksFor(au, S4.title, 'cxl-au-tasks-uploaded');
            await L.openEditorial(ed, S4.id, 'cxl-ed-before-cancel');
            await decide(app, ed, 'Cancel Review Round', 'cxl-cancel');
            const e = await L.reread(ed, 'cxl-ed-after-cancel');
            const t2 = await tasksFor(au, S4.title, 'cxl-au-tasks-after-cancel');
            const row = await myRow(au, S4.title, 'cxl-au-row-after-cancel');
            fact('cxl', {afterUpload: t, afterCancel: t2, title: e.title, row, stored: storedTasks(S4.id)});
            check('a13.cancel', 'A13: "Cancel Review Round" leaves the task', {afterUpload: t, afterCancel: t2}, t.length === 1 && t2.length === 1);
        });
    };

    // =============================================================================================
    // Side effects: round created (fn n) and round cancelled (fn f).
    parts.rounds = async () => {
        const j = await journal('o', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const S5 = await seed(j, 'new', {decisions: [], reviewRounds: [], participants: [ED(j)], files: [{file: 'article.pdf'}]});
        const S6 = await seed(j, 'cxl', {participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'invited'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        await sect('created', async () => {
            await L.openEditorial(ed, S5.id, 'new-ed-submission');
            await decide(app, ed, SEND_LABEL, 'new-send');
            const e = await L.reread(ed, 'new-ed-round1');
            const rounds = sql(`select review_round_id from review_rounds where submission_id = ${S5.id}`);
            const recs = rounds.length ? sql(`select n.type, n.level, coalesce(n.user_id::text, 'null'), n.assoc_type, to_char(n.date_read, 'YYYY') from notifications n where n.type = ${ROUND_STATUS_TYPE} and n.assoc_id in (${rounds.join(',')})`) : [];
            const edT = await tasksAt(ed, 'editorial', 'new-ed-tasks');
            const auT = await L.taskRows(au, 'new-au-tasks');
            const a = await L.openAuthor(au, S5.id, 'new-au-round1');
            fact('round-created', {title: e.title, status: statusText(e), rounds, records: recs, edTasks: edT.rows, auTasks: auT.rows, authorStatus: statusText(a), authorHeadings: a.headings});
            check('n.record', 'one round-status record is created for the round, with no user', recs, recs.length === 1 && recs[0].split('|')[2] === 'null');
            const roundRows = [...edT.rows, ...auT.rows].filter((r) => r.includes(S5.title) && !/editor needs to be assigned/.test(r));
            check('n.nowhere', 'it surfaces nowhere: no Tasks row of the editor or the author names the submission for its round (the seed\'s "editor needs to be assigned" row aside)', {ed: edT.rows, au: auT.rows, roundRows}, roundRows.length === 0);
        });
        await sect('cancelled', async () => {
            const rv1 = await L.actor(app, j.u.rv1, j.J);
            const before = await reviewerLists(rv1, 'cxl-rv1-before');
            const t0 = new Date(Date.now() - 1000);
            await L.openEditorial(ed, S6.id, 'cxl-ed-before');
            const steps = await decide(app, ed, 'Cancel Review Round', 'cxl-cancel');
            const e = await L.reread(ed, 'cxl-ed-after');
            await sleep(2000);
            const auMail = await subjects(mailTo(j.u.au), t0);
            const rvMail = await subjects(mailTo(j.u.rv1), t0);
            const after = await reviewerLists(rv1, 'cxl-rv1-after');
            fact('cancelled', {steps, title: e.title, auMail, rvMail, before: before['reviewer-assignments-all'], after});
            check('f.steps', 'with a reviewer on the round, the wizard offers the author step and the reviewer-notice step', steps, steps.length === 2 && /Notify Authors/.test(steps[0]) && /Notify Reviewers/.test(steps[1]));
            check('f.mails', 'the author and the reviewer are each emailed by the decision', {auMail, rvMail}, auMail.length >= 1 && rvMail.length >= 1);
            check('f.withdrawn', 'the reviewer\'s invitation is withdrawn: listed before, gone from every list after', {before: before['reviewer-assignments-all'], after},
                has(before['reviewer-assignments-all'], S6.title) && Object.values(after).every((rows) => !has(rows, S6.title)));
        });
    };

    // =============================================================================================
    // Settings: Minimum Confirmed Reviews Required (fn r).
    parts.min = async () => {
        const people = [['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['au', 'Avery', 'Authorly', 'author'],
            ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer']];
        const MIN = (n) => `Minimum number of confirmed reviews required: ${n}.`;
        const MET = 'Minimum required number of reviews have been confirmed. A decision is needed.';
        const rv = (j, k, status) => ({username: j.u[k], status});
        const cases = [];
        const j2 = await journal('n2', people, {review: {numReviewsPerSubmission: 2}});
        const j1 = await journal('n1', people, {review: {numReviewsPerSubmission: 1}});
        const j0 = await journal('n0', people);
        const add = async (j, key, reviewers, confirm, expect, extra = {}) => {
            const s = await seed(j, key, {participants: [ED(j), {username: j.u.se, role: 'sectionEditor'}], reviewRounds: [{reviewers}]});
            cases.push({j, key, s, confirm, expect, ...extra});
        };
        await add(j2, 'acc', [rv(j2, 'rv1', 'accepted')], [], [MIN(2), 'Awaiting responses from reviewers.']);
        await add(j2, 'sub', [rv(j2, 'rv1', 'completed')], [], [MIN(2), 'New reviews have been submitted.']);
        await add(j2, 'one', [rv(j2, 'rv1', 'completed')], ['rv1'], [MIN(2)]);
        await add(j2, 'both', [rv(j2, 'rv1', 'completed'), rv(j2, 'rv2', 'completed')], ['rv1', 'rv2'], [MIN(2), MET], {others: true});
        await add(j2, 'mix', [rv(j2, 'rv1', 'completed'), rv(j2, 'rv2', 'accepted')], ['rv1'], null);
        await add(j2, 'late', [rv(j2, 'rv1', 'accepted')], [], null, {overdue: true});
        await add(j1, 'mix', [rv(j1, 'rv1', 'completed'), rv(j1, 'rv2', 'accepted')], ['rv1'], [MIN(1), MET]);
        await add(j1, 'sub', [rv(j1, 'rv1', 'completed')], [], [MIN(1), 'New reviews have been submitted.']);
        await add(j0, 'one', [rv(j0, 'rv1', 'completed')], ['rv1'], ['All reviews are confirmed and a decision is needed.']);
        const actors = {};
        const actorFor = async (j, k) => { const key = `${j.J}:${k}`; if (!actors[key]) actors[key] = await L.actor(app, j.u[k], j.J); return actors[key]; };
        for (const c of cases) {
            await sect(`${c.j === j2 ? 'n2' : c.j === j1 ? 'n1' : 'n0'}-${c.key}`, async () => {
                const label = `${c.j === j2 ? 'n2' : c.j === j1 ? 'n1' : 'n0'}-${c.key}`;
                if (c.overdue) sql(`update review_assignments set date_response_due = now() - interval '3 days', date_due = now() - interval '3 days' where submission_id = ${c.s.id}`);
                const ed = await actorFor(c.j, 'ed');
                let e = await L.openEditorial(ed, c.s.id, `${label}-ed`);
                for (const k of c.confirm) {
                    await L.editorReadReview(ed, c.j.n[k], {label: `${label}-read-${k}`});
                    e = await L.reread(ed, `${label}-ed-after-${k}`);
                }
                const same = e.status && e.status.lines;
                e = await L.openEditorial(ed, c.s.id, `${label}-ed-reloaded`);
                const got = {samePage: same, reloaded: e.status && e.status.lines, heading: e.status && e.status.heading};
                if (c.others) {
                    const au = await actorFor(c.j, 'au'); const se = await actorFor(c.j, 'se');
                    got.author = (await L.openAuthor(au, c.s.id, `${label}-au`)).status;
                    got.section = (await L.openEditorial(se, c.s.id, `${label}-se`)).status;
                }
                fact(label, got);
                if (c.expect) {
                    check(label, `the box reads ${JSON.stringify(c.expect)} (same page and after a reload${c.others ? '; the author and an assigned Section editor alike' : ''})`, got,
                        eq(got.samePage, c.expect) && eq(got.reloaded, c.expect) && (!c.others || (eq(got.author && got.author.lines, c.expect) && eq(got.section && got.section.lines, c.expect))));
                } else {
                    check(label, '(edge, not named by the spec) what the box reads', got, true);
                }
            });
        }
    };

    // =============================================================================================
    // Settings: reviewer suggestions enabled.
    parts.sugg = async () => {
        const people = [['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['au', 'Avery', 'Authorly', 'author']];
        const jy = await journal('sy', people, {review: {reviewerSuggestionEnabled: true}});
        const jn = await journal('sn', people);
        const A = await seed(jy, 'with', {participants: [ED(jy), {username: jy.u.se, role: 'sectionEditor'}],
            reviewerSuggestions: [{givenName: 'Sugg', familyName: 'Gested', email: `${jy.J}sugg@mail.test`, affiliation: 'K3 University', suggestionReason: 'K3 suggestion reason.'}]});
        const Bs = await seed(jy, 'none', {participants: [ED(jy)]});
        const C = await seed(jn, 'off', {participants: [ED(jn)]});
        const sugg = (info) => (info.headings || []).filter((h) => /[Ss]uggest/.test(h));
        const read = async (a, s, label, author) => {
            const info = author ? await L.openAuthor(a, s.id, label) : await L.openEditorial(a, s.id, label);
            const h = a.page.getByRole('heading', {name: 'Reviewers Suggested by Author', exact: true});
            const dlgText = await a.page.locator('[role=dialog]').first().innerText().catch(() => '');
            const i = dlgText.indexOf('Reviewers Suggested by Author') >= 0 ? dlgText.indexOf('Reviewers Suggested by Author') : dlgText.toUpperCase().indexOf('REVIEWERS SUGGESTED BY AUTHOR');
            const panel = (await h.count()) && i >= 0 ? flat(dlgText.slice(i, i + 400), 400) : null;
            const named = dlgText.includes('Sugg Gested');
            return {headings: sugg(info), panel, named, title: info.title};
        };
        await sect('read', async () => {
            const ed = await L.actor(app, jy.u.ed, jy.J);
            const se = await L.actor(app, jy.u.se, jy.J);
            const au = await L.actor(app, jy.u.au, jy.J);
            const edn = await L.actor(app, jn.u.ed, jn.J);
            const got = {
                edWith: await read(ed, A, 'ed-with'), seWith: await read(se, A, 'se-with'), auWith: await read(au, A, 'au-with', true),
                edNone: await read(ed, Bs, 'ed-none'), edOff: await read(edn, C, 'ed-off'),
            };
            fact('sugg', got);
            check('sugg.on', 'enabled: the editor\'s round carries a reviewer-suggestions panel listing the suggestion', got.edWith, got.edWith.headings.length > 0 && got.edWith.named);
            check('sugg.se', 'an assigned Section editor gets the same panel', got.seWith, got.seWith.headings.length > 0);
            check('sugg.author', 'the author\'s view has no such panel', got.auWith, got.auWith.headings.length === 0);
            check('sugg.empty', 'enabled, a submission without suggestions: the spec reads as if the panel were added (it is not: shown only with a suggestion)', got.edNone, got.edNone.headings.length > 0);
            check('sugg.off', 'control: a journal with the setting off shows no panel', got.edOff, got.edOff.headings.length === 0);
        });
    };

    // =============================================================================================
    // Register A7: the review-files window and what the reviewer then gets.
    parts.a7 = async () => {
        const j = await journal('f', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const s = await seed(j, 'f', {decisions: [], reviewRounds: [], participants: [ED(j)], files: [{file: 'article.pdf'}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const filesDlg = (page) => page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
        const boxes = (page) => filesDlg(page).last().evaluate((d) => [...d.querySelectorAll('input[type=checkbox]')]
            .filter((b) => b.name && b.name.startsWith('selectedFiles') && b.getClientRects().length > 0)
            .map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)})));
        const up = L.txtNamed(`${s.tag}-dialog.txt`);
        await sect('send', async () => {
            await L.openEditorial(ed, s.id, 'ed-submission');
            const offered = [];
            await ed.page.getByRole('button', {name: SEND_LABEL, exact: true}).click();
            await finishDecision(app, ed, 'send', {onStep: async () => {
                const b = await promoteBoxes(ed.page);
                if (b.length) {
                    offered.push(b);
                    const box = ed.page.locator('label:has(input[name^="promoteFile"])').filter({hasText: 'article.pdf'}).locator('input');
                    if (await box.count() && !(await box.first().isChecked())) await box.first().check();
                }
            }});
            fact('send-file-step', offered);
            let info = await L.reread(ed, 'ed-round1');
            fact('panel', rowsOf(info, 'Files for Review'));
            let dlg = await P.openReviewFilesDialog(ed.page);
            let b = await boxes(ed.page);
            await snap(ed.page, 'dialog-open');
            check('a7.decision', 'A7: the file the round received through the decision arrives in the window unticked while the panel lists it', {panel: rowsOf(info, 'Files for Review'), boxes: b}, has(rowsOf(info, 'Files for Review'), 'article.pdf') && b.some((x) => x.row.includes('article.pdf') && !x.checked));
            await P.uploadInReviewFilesDialog(ed.page, dlg, {genre: GENRE, file: up});
            b = await boxes(ed.page);
            await snap(ed.page, 'dialog-uploaded');
            check('a7.upload', 'A7: a file uploaded from the window arrives unticked', b, b.some((x) => x.row.includes(up.name) && !x.checked));
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const sc0 = await snap(ed.page, 'dialog-ok-unchanged');
            info = await L.reread(ed, 'ed-round1-two');
            fact('panel-two', {rows: rowsOf(info, 'Files for Review'), notices: sc0.notices});
            // Tick article.pdf, OK, reopen, untick, OK.
            dlg = await P.openReviewFilesDialog(ed.page);
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().check();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            await sleep(500);
            dlg = await P.openReviewFilesDialog(ed.page);
            const ticked = await boxes(ed.page);
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().uncheck();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const sc = await snap(ed.page, 'dialog-after-untick');
            const same = await L.reread(ed, 'ed-after-untick');
            const re = await L.openEditorial(ed, s.id, 'ed-after-untick-reloaded');
            dlg = await P.openReviewFilesDialog(ed.page);
            const again = await boxes(ed.page);
            await snap(ed.page, 'dialog-reopened');
            await filesDlg(ed.page).getByRole('link', {name: 'Cancel'}).click().catch(() => {});
            await filesDlg(ed.page).first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(500);
            fact('untick', {ticked, notices: sc.notices, samePage: rowsOf(same, 'Files for Review'), reloaded: rowsOf(re, 'Files for Review'), reopened: again,
                db: sql(`select sf.submission_file_id, rrf.review_round_id, sf.viewable from review_round_files rrf join submission_files sf on sf.submission_file_id = rrf.submission_file_id where rrf.submission_id = ${s.id} order by 1`)});
            check('a7.untick', 'A7: untick + OK reports "Review files updated." and the panel lists the file as before (same page and after a reload); reopened, the box is clear',
                {notices: sc.notices, samePage: rowsOf(same, 'Files for Review'), reloaded: rowsOf(re, 'Files for Review'), reopened: again},
                has(sc.notices, 'Review files updated.') && has(rowsOf(same, 'Files for Review'), 'article.pdf') && has(rowsOf(re, 'Files for Review'), 'article.pdf') && again.some((x) => x.row.includes('article.pdf') && !x.checked));
        });
        await sect('reviewer', async () => {
            // Add Reviewer, reading the form's file list before adding.
            await L.openEditorial(ed, s.id, 'ed-before-add');
            const page = ed.page;
            await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            const modal = page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')});
            const search = modal.locator('.listPanel--selectReviewer input.pkpSearch__input');
            await search.waitFor({timeout: 30000});
            await search.fill(j.n.rv1); await search.press('Enter');
            await page.waitForFunction(() => { const t = document.querySelector('#reviewerFormFooter textarea[name="personalMessage"]'); const m = window.tinyMCE || window.tinymce; return !!(t && m && m.get(t.id) && m.get(t.id).initialized); }, undefined, {timeout: 30000});
            await modal.getByText(`Select ${j.n.rv1}`).click();
            await idle(page);
            await P.waitForLegacyFormSettled(page, modal).catch(() => {});
            const formFiles = await modal.evaluate((d) => [...d.querySelectorAll('input[type=checkbox]')].filter((b) => /selectedFiles/.test(b.name || '') && b.getClientRects().length > 0)
                .map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)})));
            await snap(page, 'add-reviewer-files');
            fact('add-reviewer-files', formFiles);
            check('a7.form', 'A7 open half: the Add Reviewer form\'s file list offers the unticked file, and ticks it', formFiles, formFiles.some((x) => x.row.includes('article.pdf') && x.checked));
            await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const rv1 = await L.actor(app, j.u.rv1, j.J);
            await reviewerDo(rv1, s.id, {submit: false});
            await rv1.page.goto(`/index.php/${j.J}/reviewer/submission/${s.id}?step=3`).catch(() => {});
            await idle(rv1.page);
            const step3 = rv1.page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true});
            if (await step3.count()) { await step3.first().click(); await idle(rv1.page); }
            await rv1.page.getByRole('button', {name: 'Submit Review', exact: true}).filter({visible: true}).waitFor({timeout: 30000}).catch(() => {});
            await idle(rv1.page);
            const sc = await snap(rv1.page, 'rv1-step3');
            const txt = await rv1.page.locator('body').innerText();
            fact('reviewer-files', {pdf: txt.includes('article.pdf'), dialogFile: txt.includes(up.name), grants: sql(`select rf.submission_file_id from review_files rf join review_assignments ra on ra.review_id = rf.review_id where ra.submission_id = ${s.id} order by 1`)});
            check('a7.reviewer', 'A7 open half: the reviewer\'s own page lists the unticked file', {pdf: txt.includes('article.pdf'), url: sc.url}, txt.includes('article.pdf'));
        });
    };

    // =============================================================================================
    // Cross-feature: a reviewer's own past rounds (round history), and none of it on the stage.
    parts.hist = async () => {
        const j = await journal('h', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const s = await seed(j, 'h', {decisions: [...SEND, 'newExternalReviewRound'], participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed', comments: `Round one remark ${tag('x')}.`}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        await sect('hist', async () => {
            await L.openEditorial(ed, s.id, 'ed-round2');
            await P.addReviewer(ed.page, j.n.rv1);
            const e2 = await L.reread(ed, 'ed-round2-added');
            const rv1 = await L.actor(app, j.u.rv1, j.J);
            await rv1.page.goto(`/index.php/${j.J}/reviewer/submission/${s.id}`);
            await idle(rv1.page);
            await rv1.page.getByRole('heading', {name: 'Previous Reviews'}).waitFor({timeout: 20000}).catch(() => {});
            const sc = await snap(rv1.page, 'rv1-page');
            const box = await rv1.page.locator('div').filter({has: rv1.page.getByRole('heading', {name: 'Previous Reviews', exact: true})}).last().innerText().catch(() => null);
            let win = null;
            const link = rv1.page.getByRole('button', {name: 'Read Round 1 Review'});
            if (await link.count()) {
                await link.first().click();
                await idle(rv1.page); await sleep(800); await idle(rv1.page);
                const ws = await snap(rv1.page, 'rv1-round1-window');
                win = flat(ws.text && ws.text.dialog, 900);
                await rv1.page.getByRole('dialog').last().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            }
            fact('reviewer-history', {box: flat(box, 300), window: win, url: sc.url});
            check('hist.reviewer', 'the reviewer revisits their past round on their own page, with a round-history window', {box: flat(box, 200), window: win}, !!box && /Round 1 Review Submitted on/.test(box) && !!win);
            const e1 = await L.selectMenu(ed, 'Review Round 1', 'ed-round1');
            const au = await L.actor(app, j.u.au, j.J);
            const a2 = await L.openAuthor(au, s.id, 'au-round2');
            const pat = /Previous Reviews|Review Submitted on|Read Round \d Review/;
            const texts = [e2, e1, a2].map((x) => JSON.stringify([x.headings, x.buttons]));
            check('hist.stage', 'none of it appears on the review stage (editor Round 1 and 2, author)', texts.map((t) => pat.test(t)), texts.every((t) => !pat.test(t)));
        });
    };

    for (const name of PARTS) {
        if (!parts[name]) { log(`unknown part ${name}`); continue; }
        L.startPart(name);
        const t = Date.now();
        try { await parts[name](); } catch (e) {
            log(`[${name} ABORTED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
            L.state.checks.push({id: `${name}.ABORTED`, spec: 'the part runs', got: String(e.message).slice(0, 900), same: false});
        }
        await L.closeActors();
        fact('seconds', Math.round((Date.now() - t) / 1000));
        L.endPart();
    }
});
