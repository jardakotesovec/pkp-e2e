// U26 "Review stage & rounds": the walk of the spec's OJS scenarios on stable-3_5_0, for the differences
// file docs/specs/lines/stable-3_5_0/U26-review-stage-and-rounds.md.
//
// The 3.5 tests (lines/stable-3_5_0/apps/ojs/playwright/tests/U26-review-stage-and-rounds.spec.js) now
// assert the 13 scenarios. The parts that walked nothing but a scenario (7, 9, 10, 11, 15) are gone from
// this script; git keeps them. What stays is what no test asserts: the register entries a part reads on
// the way (A1, A2, A4, A7, A13, retired A12), the `reg` part, and Rule 17's old addresses in every form
// and for every reader (part s12).
//
// Run (the 3.5 install must be up: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature lines35 --apps ojs):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=lines35 PROBE_AGENT=u26 PROBE_RUN=s1 PARTS=s1,s2,s3 \
//       node bin/probe.js ojs lines/stable-3_5_0/shared/playwright/checks/U26-stable-3_5_0/W1/walk.js
//
// PROBE_RUN names the run (s1, then s2: every difference is read twice, each run on its own scratch
// journals). PARTS picks the parts (default: all of them, about five minutes; two or three parts
// stay under three minutes, a part takes 15 to 60 s). Every part builds its own scratch journal with
// throwaway accounts, so parts are independent and nothing on `publicknowledge` or the seeded roster
// is touched. Needs Mailpit (part s4 and reg's A11 read the editors' mailboxes).
//
// Each part walks one canonical scenario of the spec as the spec writes it, takes the kit's screen()
// snapshot on every screen (`<part>-<screen>-<run>-ojs.json`, a PNG beside it) and writes
// `<part>-checks-<run>-ojs.json`: one row per sentence of the scenario, with what the spec says, what
// the 3.5 screen gave, and `same`. A row with `same: false` is a lead for the differences file; it is
// read on the snapshot, and again in the second run, before it is written down. On the tip walked on
// 2026-11-11 (ojs 7cf6c9c60f) four rows differ in each run: s2.read.window and s2.read.confirm (the
// editor confirms a review with "Confirm" in the legacy "Review: {title}" window), s12.submitted and
// s12.early (the author reads an open review before an editor confirms it; s12.early is this script's
// own row for that lead and reads `same: false` whenever the early window opens).
//
//   s1   Round 1 opens with the submission; the review-files window (+ register A7: unticking a file)
//   s2   The status line follows the reviewers (+ the author's box at each state, register A2)
//   s3   Request revisions within the round
//   s4   Author uploads a revision: the panel, the editor's box, the task, the "Revised Version Uploaded"
//        emails (+ retired A12: the panel read with no reload after the window is closed at its first step)
//   s5   Request revisions toward a new round (+ A1 and A13 as the screen shows them), then
//        scenario 6 on the same submission: "Create New Review Round", the past round, the control
//   s8   Cancelling is blocked once a review is in (+ register A4: the all-declined round's sentence)
//   s12  Author reads an open review; "Notifications"; the old addresses (Rule 17, every form, every reader)
//   reg  The register entries no scenario passes: A5 (production assistants), A6 (a cancelled round's
//        previous round), A8 (a past round's panels still act), A11 (the upload window's "Cancel")
//
// The author's "Read Review" window is read without its attachments section (register A3: nothing about
// that section is recorded by this script).
const path = require('path');
const L = require('./lib');
const {forEachApp, tag, check, fact, sect, snap, flat, log, idle, statusText, rowsOf} = L;

const ALL = ['s1', 's2', 's3', 's4', 's5', 's8', 's12', 'reg'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const DECISIONS = ['Request Revisions', 'Accept Submission', 'Create New Review Round', 'Cancel Review Round', 'Decline Submission'];
const REVISED = 'Revised Version Uploaded';
const has = (list, s) => !!list && list.some((x) => x.includes(s));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const P = require(path.join(L.REPO, 'apps/ojs/playwright/pages/ReviewStagePages.js'));

    // -------------------------------------------------------------------------------------------
    // A scratch journal with throwaway accounts. `ed` and `ed2` are "Journal editor" (manager-level,
    // deciding), `se` and `rec` "Section editor", `mgr` "Journal manager", `ce` "Copyeditor".
    async function journal(prefix, extra = {}) {
        const J = tag(`l35u26${prefix}`);
        const u = {}; const n = {};
        const people = [
            ['mgr', 'Mona', 'Managerly', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'], ['ed2', 'Otto', 'Otherly', 'editor'],
            ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['rec', 'Remy', 'Recommendly', 'sectionEditor'],
            ['au', 'Avery', 'Authorly', 'author'], ['au2', 'Blake', 'Writerly', 'author'],
            ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer'],
            ['rv3', 'Rudy', 'Revthree', 'externalReviewer'], ['ce', 'Cora', 'Copyly', 'copyeditor'],
        ];
        for (const [k, g, f] of people) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
        await app.api.createContext({
            tag: J, ...extra,
            users: people.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]})),
        });
        fact(`journal-${prefix}`, J);
        return {J, u, n};
    }
    async function seed(j, suffix, {decisions = ['sendExternalReview'], reviewRounds = [{reviewers: []}], participants, submitter} = {}) {
        const t = `${j.J}${suffix}`;
        const r = await app.api.createSubmission({
            tag: t, context: j.J, submitter: submitter || j.u.au, title: `Submission ${t}`, decisions, reviewRounds,
            ...(participants ? {participants} : {}),
        });
        fact(`seed-${suffix}`, r.submissionId);
        return {id: r.submissionId, title: `Submission ${t}`, tag: t};
    }
    const asEditor = (j) => [{username: j.u.ed, role: 'editor'}];
    const roundIds = (id) => L.sql(app, `select review_round_id, round from review_rounds where submission_id = ${id} order by round`).split('\n').filter(Boolean).map((r) => r.split('|')[0]);

    // The decision wizard: its title, then "Continue" to "Record Decision", then "View Submission".
    async function decide(a, button, expectTitle, label, {onFiles} = {}) {
        await a.page.getByRole('button', {name: button, exact: true}).click();
        return finishDecision(a, expectTitle, label, {onFiles});
    }
    async function finishDecision(a, expectTitle, label, {onFiles} = {}) {
        const d = new P.DecisionPage(a.page);
        await a.page.getByRole('heading', {level: 1}).first().waitFor({timeout: 45000});
        await a.page.waitForURL(/decision\/record/, {timeout: 45000});
        await idle(a.page);
        await d.awaitComposerLoaded();
        const steps = [];
        for (let i = 0; i < 6; i++) {
            await d.awaitComposerLoaded();
            const h1 = flat(await a.page.getByRole('heading', {level: 1}).first().innerText());
            steps.push(h1);
            await snap(a.page, `${label}-step${i + 1}`);
            if (onFiles && (await a.page.locator('input[name^="promoteFile"]:visible').count())) await onFiles(d, i);
            if (await d.recordButton.isVisible()) break;
            await d.continueButton.click();
            await idle(a.page);
        }
        fact(`${label}-steps`, steps);
        if (expectTitle) check(`${label}.title`, `the wizard is headed "${expectTitle}"`, steps[0], steps[0].startsWith(expectTitle));
        await d.record();
        await idle(a.page);
        return steps;
    }
    // "Request Revisions": the choice window, read before a choice is made.
    async function requestRevisions(a, {newRound}, label) {
        await a.page.getByRole('button', {name: 'Request Revisions', exact: true}).click();
        const modal = a.page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
        await modal.getByRole('radio').first().waitFor({timeout: 30000});
        const radios = await modal.locator('label').filter({has: a.page.locator('input[type=radio]')}).evaluateAll((ls) => ls.map((l) => ({label: l.innerText.trim().replace(/\s+/g, ' '), checked: l.querySelector('input').checked})));
        await snap(a.page, `${label}-choice`);
        fact(`${label}-choice`, radios);
        const want = newRound ? 'Revisions will be subject to a new round of peer reviews.' : 'Revisions will not be subject to a new round of peer reviews.';
        await modal.getByRole('radio', {name: want}).check();
        await modal.getByRole('button', {name: 'Next', exact: true}).click();
        const steps = await finishDecision(a, newRound ? 'Resubmit for Review' : 'Request Revisions', label);
        return {radios, steps};
    }
    // The review-files window as data.
    const filesDlg = (page) => page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
    const filesInfo = (page) => filesDlg(page).last().evaluate((d) => {
        const vis = (e) => e.getClientRects().length > 0;
        const boxes = [...d.querySelectorAll('input[type=checkbox]')];
        return {
            title: [...d.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean),
            rows: boxes.filter((b) => b.name && b.name.startsWith('selectedFiles')).map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160)})),
            categories: [...d.querySelectorAll('tbody tr.category, tr.category_row, .pkp_controllers_grid tbody[id*="category"] > tr:first-child')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 10),
            showAll: boxes.filter((b) => !(b.name || '').startsWith('selectedFiles')).map((b) => ({checked: b.checked, label: (b.closest('label') || b.parentElement)?.innerText.trim().slice(0, 120)})),
            links: [...d.querySelectorAll('a')].filter(vis).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 20),
            buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => b.innerText.trim()).filter(Boolean).slice(0, 20),
            text: d.innerText.replace(/\s+/g, ' ').slice(0, 900),
        };
    });
    const mailCount = (to, since) => app.mail.count({to, subject: REVISED, since});

    const parts = {};

    // ===========================================================================================
    parts.s1 = async () => {
        const j = await journal('a');
        const s = await seed(j, 's1', {decisions: [], reviewRounds: [], participants: [{username: j.u.se, role: 'sectionEditor'}]});
        const f1 = L.txtNamed(`${s.tag}-one.txt`), f2 = L.txtNamed(`${s.tag}-two.txt`), f3 = L.txtNamed(`${s.tag}-three.txt`);
        const ed = await L.actor(app, j.u.se, j.J);
        const wf = new P.WorkflowPage(ed.page, j.J);
        let info;
        await sect('send', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-submission');
            fact('submission-title', info.title);
            for (const f of [f1, f2]) {
                await wf.panel('Submission Files').getByRole('button', {name: 'Upload', exact: true}).click();
                await P.uploadViaWizard(ed.page, {file: f});
            }
            info = await L.reread(ed, 'ed-submission-files');
            fact('submission-files', rowsOf(info, 'Submission Files'));
            fact('submission-buttons', info.actionButtons);
            await ed.page.getByRole('button', {name: 'Send for Review', exact: true}).click();
            await finishDecision(ed, 'Send for Review', 'send', {onFiles: async (d) => {
                const boxes = {one: await d.promoteFileCheckbox(f1.name).isChecked(), two: await d.promoteFileCheckbox(f2.name).isChecked()};
                fact('send-files-offered', boxes);
                await d.promoteFileCheckbox(f2.name).uncheck();
            }});
            info = await L.reread(ed, 'ed-round1');
            check('menu', 'the workflow menu shows "Review" with the entry "Review Round 1"', info.menu, has(info.menu, 'Review Round 1') && info.menu.includes('Review'));
            check('title', 'the page title reads "Review (Round 1)"', info.title, info.title === 'Workflow: Review (Round 1)');
            check('status', '"Round 1 Status — Waiting for reviewers to be assigned."', statusText(info), eq(info.status, {heading: 'Round 1 Status', lines: ['Waiting for reviewers to be assigned.']}));
            const rows = rowsOf(info, 'Files for Review') || [];
            check('files', 'the "Files for Review" panel lists the file chosen when sending to review (and only it)', rows, has(rows, f1.name) && !has(rows, f2.name));
            fact('round1-headings', info.headings);
            fact('round1-buttons', info.buttons);
            fact('round1-actions', info.actionButtons);
        });
        await sect('dialog', async () => {
            let dlg = await P.openReviewFilesDialog(ed.page);
            let fi = await filesInfo(ed.page);
            await snap(ed.page, 'files-dialog-open'); fact('dialog-open', fi);
            check('dialog.title', 'the selection dialog is "Current Review Files For Round 1"', fi.title, has(fi.title, 'Current Review Files For Round 1'));
            check('dialog.alone', 'it lists the file already under review alone, with a checkbox', fi.rows, fi.rows.length === 1 && fi.rows[0].row.includes(f1.name));
            fact('A7-decision-file-box-on-open', fi.rows.map((r) => r.checked));
            await P.showFilesFromAllStages(ed.page, dlg);
            fi = await filesInfo(ed.page);
            await snap(ed.page, 'files-dialog-all'); fact('dialog-all', fi);
            check('dialog.showall', 'ticking "Show files from all accessible workflow stages." adds the second file, still on the Submission stage', fi.rows, has(fi.rows.map((r) => r.row), f2.name) && fi.categories.includes('Submission') && has(fi.showAll.map((b) => b.label), 'Show files from all accessible workflow stages.'));
            fact('dialog-stage-row', /Submission/.test(fi.text) ? 'a row names "Submission"' : fi.text.slice(0, 300));
            await P.reviewFilesCheckbox(dlg, f2.name).check();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const sc = await snap(ed.page, 'files-after-tick');
            check('dialog.notice', 'confirming reports "Review files updated."', sc.notices, has(sc.notices, 'Review files updated.'));
            info = await L.reread(ed, 'ed-round1-two-files');
            let rows = rowsOf(info, 'Files for Review') || [];
            check('dialog.panel', 'the panel lists both files', rows, has(rows, f1.name) && has(rows, f2.name));

            await ed.page.getByText('Review files updated.').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            dlg = await P.openReviewFilesDialog(ed.page);
            await P.uploadInReviewFilesDialog(ed.page, dlg, {file: f3});
            fi = await filesInfo(ed.page);
            await snap(ed.page, 'files-dialog-uploaded'); fact('dialog-after-upload', fi.rows);
            fact('A7-uploaded-file-box', (fi.rows.find((r) => r.row.includes(f3.name)) || {}).checked);
            await P.reviewFilesCheckbox(dlg, f3.name).check();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const sc2 = await snap(ed.page, 'files-after-upload');
            check('upload.notice', 'after an upload from the dialog, confirming reports "Review files updated."', sc2.notices, has(sc2.notices, 'Review files updated.'));
            info = await L.reread(ed, 'ed-round1-three-files');
            rows = rowsOf(info, 'Files for Review') || [];
            check('upload.panel', 'the panel lists the new file too; the files listed before are still listed', rows, [f1, f2, f3].every((f) => has(rows, f.name)));
            const rounds = info.menu.filter((m) => /^Review Round/.test(m));
            check('control', 'the "Review" entry holds "Review Round 1" alone', rounds, eq(rounds, ['Review Round 1']));
        });
        // Register A7: unticking a file and confirming changes nothing the editor can see.
        await sect('a7', async () => {
            await ed.page.getByText('Review files updated.').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            let dlg = await P.openReviewFilesDialog(ed.page);
            let fi = await filesInfo(ed.page);
            fact('A7-boxes-before-untick', fi.rows);
            // The one box that shows ticked is the file ticked in the dialog's last visit (f3).
            check('a7.mirror', 'A7: the checkboxes do not mirror the panel (a file the panel lists shows unticked)', fi.rows, fi.rows.some((r) => !r.checked));
            await P.reviewFilesCheckbox(dlg, f3.name).uncheck();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const sc = await snap(ed.page, 'a7-after-untick');
            info = await L.reread(ed, 'a7-panel');
            const rows = rowsOf(info, 'Files for Review') || [];
            check('a7.notice', 'A7: unticking a listed file and confirming reports "Review files updated."', sc.notices, has(sc.notices, 'Review files updated.'));
            check('a7.panel', 'A7: the panel still lists the unticked file', rows, has(rows, f3.name));
            await ed.page.getByText('Review files updated.').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            dlg = await P.openReviewFilesDialog(ed.page);
            fi = await filesInfo(ed.page);
            await snap(ed.page, 'a7-dialog-reopened');
            const row = fi.rows.find((r) => r.row.includes(f3.name));
            check('a7.box', 'A7: reopening the dialog shows the cleared checkbox', fi.rows, !!row && row.checked === false);
            await dlg.getByRole('link', {name: 'Cancel'}).click().catch(() => dlg.getByRole('button', {name: 'Close', exact: true}).first().click());
        });
    };

    // ===========================================================================================
    parts.s2 = async () => {
        const j = await journal('b');
        const s = await seed(j, 's2', {participants: asEditor(j)});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const rv = await L.actor(app, j.u.rv1, j.J);
        const authorBox = async (label, editorInfo) => {
            const ai = await L.openAuthor(au, s.id, `au-${label}`);
            check(`a2.${label}`, 'A2: the author sees the same status box as the editor', statusText(ai), eq(ai.status, editorInfo.status));
            return ai;
        };
        let info;
        await sect('add', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-waiting');
            check('given', 'Round 1 reads "Waiting for reviewers to be assigned."', statusText(info), eq(info.status.lines, ['Waiting for reviewers to be assigned.']));
            fact('reviewers-panel-buttons', info.buttons);
            const ai = await authorBox('waiting', info);
            fact('author-headings-fresh', ai.headings); fact('author-buttons-fresh', ai.buttons);
            await P.addReviewer(ed.page, j.n.rv1);
            info = await L.openEditorial(ed, s.id, 'ed-awaiting');
            check('added', 'after "Add Reviewer" the box reads "Awaiting responses from reviewers."', statusText(info), eq(info.status.lines, ['Awaiting responses from reviewers.']));
            fact('reviewer-row-invited', rowsOf(info, 'Reviewers'));
            await authorBox('awaiting', info);
        });
        await sect('review', async () => {
            await L.reviewerAccept(rv, s.id);
            await snap(rv.page, 'rv-accepted');
            info = await L.openEditorial(ed, s.id, 'ed-accepted');
            check('control', 'with the request accepted and the review not yet submitted, the box still reads "Awaiting responses from reviewers."', statusText(info), eq(info.status.lines, ['Awaiting responses from reviewers.']));
            fact('reviewer-row-accepted', rowsOf(info, 'Reviewers'));
            const sel = await L.reviewerSubmit(rv, s.id, {label: 'rv-step3'});
            fact('reviewer-recommendation-list', sel);
            await snap(rv.page, 'rv-submitted');
            info = await L.openEditorial(ed, s.id, 'ed-submitted');
            check('submitted', 'after the review is submitted the box reads "New reviews have been submitted."', statusText(info), eq(info.status.lines, ['New reviews have been submitted.']));
            fact('reviewer-row-submitted', rowsOf(info, 'Reviewers'));
            await authorBox('submitted', info);
        });
        await sect('read', async () => {
            const win = await L.editorReadReview(ed, j.n.rv1, {label: 'ed-read-review'});
            fact('read-review-window', win);
            check('read.window', '"Read Review" opens the "Review Details" window', win.title, win.kind === 'vue Review Details');
            check('read.confirm', 'the review is confirmed with "Mark as Complete"', win.buttons, has(win.buttons, 'Mark as Complete'));
            info = await L.openEditorial(ed, s.id, 'ed-confirmed');
            check('confirmed', 'once confirmed the box reads "All reviews are confirmed and a decision is needed."', statusText(info), eq(info.status.lines, ['All reviews are confirmed and a decision is needed.']));
            fact('reviewer-row-confirmed', rowsOf(info, 'Reviewers'));
            await authorBox('confirmed', info);
        });
    };

    // ===========================================================================================
    parts.s3 = async () => {
        const j = await journal('c');
        const s = await seed(j, 's3', {participants: asEditor(j), reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        let info;
        await sect('request', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-before');
            fact('decision-buttons', info.actionButtons);
            check('buttons', 'the decision buttons are "Request Revisions", "Accept Submission", "Create New Review Round", "Cancel Review Round"*, "Decline Submission" (*not once a reviewer responded)', info.actionButtons, eq(info.actionButtons, DECISIONS.filter((d) => d !== 'Cancel Review Round')));
            fact('revisions-panel-before', {rows: rowsOf(info, 'Revisions Uploaded'), description: info.headings});
            const r = await requestRevisions(ed, {newRound: false}, 'request');
            check('choice', 'the wizard opens on the choice "Require New Review Round" with "Revisions will not be subject to a new round of peer reviews." preselected', r.radios,
                r.radios.length === 2 && r.radios[0].label === 'Revisions will not be subject to a new round of peer reviews.' && r.radios[0].checked && r.radios[1].label === 'Revisions will be subject to a new round of peer reviews.' && !r.radios[1].checked);
            info = await L.reread(ed, 'ed-requested');
            check('status', 'the box reads "Revisions have been requested."', statusText(info), eq(info.status, {heading: 'Round 1 Status', lines: ['Revisions have been requested.']}));
        });
        await sect('author', async () => {
            const t = await L.taskRows(au, 'au-tasks');
            const mine = t.rows.filter((r) => r.includes(s.title));
            check('task', 'the author\'s Tasks panel holds "Revision required." naming the submission', mine, mine.length === 1 && mine[0].includes('Revision required.'));
            await au.page.goto(`/index.php/${j.J}/dashboard/mySubmissions`); await idle(au.page);
            const list = await snap(au.page, 'au-my-submissions');
            fact('my-submissions-row', flat((list.text.main || '').split('\n').filter((l) => l.trim()).join(' | '), 700));
            const ai = await L.openAuthor(au, s.id, 'au-review-stage');
            check('upload-button', 'the author\'s review stage shows the "Upload revisions" button', ai.buttons, ai.buttons.includes('Upload revisions'));
            fact('author-action-buttons', ai.actionButtons);
            const rows = rowsOf(ai, 'Revisions Uploaded');
            check('control', 'the "Revisions Uploaded" panel still reads "No Items"', rows, eq(rows, ['No Items']));
            check('a2', 'A2: the author sees the same status box as the editor', statusText(ai), eq(ai.status, info.status));
        });
    };

    // ===========================================================================================
    parts.s4 = async () => {
        const j = await journal('d');
        const s = await seed(j, 's4', {decisions: ['sendExternalReview', 'requestRevisions'], participants: asEditor(j)});
        const f1 = L.txtNamed(`${s.tag}-rev1.txt`), f2 = L.txtNamed(`${s.tag}-rev2.txt`), f3 = L.txtNamed(`${s.tag}-rev3.txt`);
        const edMail = `${j.u.ed}@mail.test`, ed2Mail = `${j.u.ed2}@mail.test`;
        const t0 = new Date(Date.now() - 2000);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const wf = new P.WorkflowPage(au.page, j.J);
        let info, ai;
        await sect('first', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-requested');
            check('given', 'the round reads "Revisions have been requested."', statusText(info), eq(info.status.lines, ['Revisions have been requested.']));
            fact('participants', info.buttons.filter((b) => /More Actions/.test(b)));
            const before = await L.taskRows(au, 'au-tasks-before');
            fact('task-before', before.rows.filter((r) => r.includes(s.title)));
            ai = await L.openAuthor(au, s.id, 'au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = P.uploadWizardDialog(au.page);
            await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
            await snap(au.page, 'au-upload-window');
            fact('upload-window', {tabs: await dlg.getByRole('tab').allInnerTexts(), buttons: await dlg.locator('button:visible, a:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean))});
            await P.uploadFirstStepOnly(au.page, {file: f1});
            fact('leave-prompts', au.nativeDialogs.slice());
            ai = await L.reread(au, 'au-after-close-no-reload');
            let rows = rowsOf(ai, 'Revisions Uploaded') || [];
            check('panel-no-reload', 'closing the window through its header "Close" keeps the file: the "Revisions Uploaded" panel lists it as the window closes (retired A12)', rows, has(rows, f1.name));
            ai = await L.openAuthor(au, s.id, 'au-after-close-reloaded');
            rows = rowsOf(ai, 'Revisions Uploaded') || [];
            check('panel', 'the "Revisions Uploaded" panel lists the file all the same', rows, has(rows, f1.name));
            info = await L.openEditorial(ed, s.id, 'ed-submitted');
            check('editor', 'the editor\'s box reads "Revisions have been submitted and a decision is needed."', statusText(info), eq(info.status.lines, ['Revisions have been submitted and a decision is needed.']));
            const after = await L.taskRows(au, 'au-tasks-after');
            const mine = after.rows.filter((r) => r.includes(s.title));
            check('task', 'the "Revision required." task is gone from the author\'s Tasks panel', mine, mine.length === 0);
        });
        await sect('mail', async () => {
            const m = await app.mail.find({to: edMail, subject: REVISED, since: t0, timeoutMs: 30000});
            fact('mail-1', {subject: m.Subject, from: m.From, to: m.To});
            check('mail', 'the assigned Editor\'s mailbox holds "Revised Version Uploaded", sent under the Author\'s own name and address', m.From, m.From.Address === `${j.u.au}@mail.test` && m.From.Name === j.n.au);
        });
        await sect('second', async () => {
            ai = await L.openAuthor(au, s.id, 'au-second-before');
            check('s5-control', 'after the in-round upload the bottom "Upload revisions" button is still offered (scenario 5\'s control)', ai.buttons, ai.buttons.includes('Upload revisions'));
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            await P.uploadViaWizard(au.page, {file: f2});
            ai = await L.reread(au, 'au-second-after');
            const rows = rowsOf(ai, 'Revisions Uploaded') || [];
            check('second.panel', 'after a second upload the panel lists both files', rows, has(rows, f1.name) && has(rows, f2.name));
            const again = await L.actor(app, j.u.ed, j.J); // a real sign-in, which re-arms the notice
            await snap(again.page, 'ed-signed-in-again');
            const n = await mailCount(edMail, t0);
            check('second.mail', 'the assigned Editor\'s mailbox holds no second notice', n, n === 1);
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            await P.uploadViaWizard(au.page, {file: f3});
            let n2 = 0;
            for (let i = 0; i < 40 && n2 < 2; i++) { n2 = await mailCount(edMail, t0); if (n2 < 2) await au.page.waitForTimeout(500); }
            check('third.mail', 'after the Editor signs in again, a third upload sends a fresh "Revised Version Uploaded" email', n2, n2 === 2);
            const none = await mailCount(ed2Mail, t0);
            check('control', 'the Editor not assigned to the stage has no "Revised Version Uploaded" email', none, none === 0);
        });
    };

    // ===========================================================================================
    // Scenario 5, then scenario 6 on the same submission.
    parts.s5 = async () => {
        const j = await journal('e');
        const s = await seed(j, 's5', {participants: asEditor(j), reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        const f1 = L.pdfNamed(`${s.tag}-revised.pdf`);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        let info, ai;
        await sect('request', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-before');
            await requestRevisions(ed, {newRound: true}, 'resubmit');
            info = await L.reread(ed, 'ed-requested');
            check('status', 'the box reads "Revisions requested from the author to be taken to a new review round."', statusText(info), eq(info.status, {heading: 'Round 1 Status', lines: ['Revisions requested from the author to be taken to a new review round.']}));
        });
        await sect('author', async () => {
            const t = await L.taskRows(au, 'au-tasks');
            const mine = t.rows.filter((r) => r.includes(s.title));
            check('task', 'the author\'s Tasks panel holds "Resubmit for review."', mine, mine.length === 1 && mine[0].includes('Resubmit for review.'));
            ai = await L.openAuthor(au, s.id, 'au-before');
            check('upload-button', '"Upload revisions" is offered before the first upload', ai.buttons, ai.buttons.includes('Upload revisions'));
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            await P.uploadViaWizard(au.page, {file: f1});
            ai = await L.reread(au, 'au-after');
            const rows = rowsOf(ai, 'Revisions Uploaded') || [];
            check('panel', 'the "Revisions Uploaded" panel lists the file', rows, has(rows, f1.name));
            info = await L.openEditorial(ed, s.id, 'ed-submitted');
            check('editor', 'the editor\'s box reads "Revisions submitted. A new review round needs to be created."', statusText(info), eq(info.status.lines, ['Revisions submitted. A new review round needs to be created.']));
            ai = await L.openAuthor(au, s.id, 'au-after-reload');
            fact('A1-upload-revisions-after-first-file', ai.buttons.includes('Upload revisions') ? 'still offered' : 'gone');
            const t2 = await L.taskRows(au, 'au-tasks-after');
            fact('A13-resubmit-task-after-upload', t2.rows.filter((r) => r.includes(s.title)));
            ai = await L.openAuthor(au, s.id, 'au-further');
            const wf = new P.WorkflowPage(au.page, j.J);
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
            const dlg = P.uploadWizardDialog(au.page);
            const opened = await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}).then(() => true, () => false);
            await snap(au.page, 'au-panel-upload-window');
            check('further', 'the panel\'s own "Upload" control opens the same upload wizard', await dlg.getByRole('tab').allInnerTexts().catch(() => []), opened);
            await dlg.getByRole('link', {name: 'Cancel'}).click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        });
        // Scenario 6.
        await sect('newround', async () => {
            info = await L.openEditorial(ed, s.id, 's6-ed-before');
            fact('s6-buttons-before', info.actionButtons);
            let ticked = null;
            await ed.page.getByRole('button', {name: 'Create New Review Round', exact: true}).click();
            const steps = await finishDecision(ed, null, 's6-newround', {onFiles: async (d) => { ticked = await d.promoteFileCheckbox(f1.name).isChecked().catch(() => null); }});
            fact('s6-wizard-steps', steps);
            check('s6.wizard', 'the wizard\'s file step offers the revised file, already ticked', ticked, ticked === true);
            info = await L.reread(ed, 's6-ed-round2');
            check('s6.menu', 'the menu gains "Review Round 2"', info.menu, has(info.menu, 'Review Round 2') && has(info.menu, 'Review Round 1'));
            check('s6.title', 'the page title reads "Review (Round 2)"', info.title, info.title === 'Workflow: Review (Round 2)');
            check('s6.status', '"Round 2 Status — Waiting for reviewers to be assigned."', statusText(info), eq(info.status, {heading: 'Round 2 Status', lines: ['Waiting for reviewers to be assigned.']}));
            const files = rowsOf(info, 'Files for Review') || [];
            check('s6.files', 'Round 2\'s "Files for Review" panel lists the carried file', files, has(files, f1.name));
            const revs = rowsOf(info, 'Reviewers');
            check('s6.reviewers', 'Round 2\'s Reviewers panel lists no reviewer', revs, eq(revs, ['No Items']));
            const r1 = await L.selectMenu(ed, 'Review Round 1', 's6-ed-round1');
            check('s6.past.panels', 'on "Review Round 1" its reviewers and files show', {reviewers: rowsOf(r1, 'Reviewers'), revisions: rowsOf(r1, 'Revisions Uploaded')}, has(rowsOf(r1, 'Reviewers'), j.n.rv1) && has(rowsOf(r1, 'Revisions Uploaded'), f1.name));
            check('s6.past.buttons', 'a past round has no decision buttons', r1.actionButtons, !(r1.actionButtons || []).some((b) => DECISIONS.includes(b)));
            check('s6.past.status', 'the box, headed "Status", reads "The submission has been advanced to the next round of review"', statusText(r1), eq(r1.status, {heading: 'Status', lines: ['The submission has been advanced to the next round of review']}));
            fact('s6-past-round-buttons', r1.buttons);
            const r2 = await L.selectMenu(ed, 'Review Round 2', 's6-ed-round2-again');
            check('s6.control', 'on "Review Round 2" again the decision buttons are back and the box is headed "Round 2 Status"', {buttons: r2.actionButtons, heading: r2.status && r2.status.heading}, eq(r2.actionButtons, DECISIONS) && r2.status.heading === 'Round 2 Status');
            const a2 = await L.openAuthor(au, s.id, 's6-au-round2');
            fact('s6-author-round2', {title: a2.title, status: a2.status, menu: a2.menu, buttons: a2.buttons});
        });
    };

    // ===========================================================================================
    parts.s8 = async () => {
        const j = await journal('g');
        const p = asEditor(j);
        const done = await seed(j, 's8a', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const declined = await seed(j, 's8b', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'declined'}]}]});
        const invited = await seed(j, 's8c', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv3, status: 'invited'}]}]});
        const mixed = await seed(j, 's8d', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'declined'}, {username: j.u.rv1, status: 'accepted'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        await sect('buttons', async () => {
            let info = await L.openEditorial(ed, done.id, 'ed-completed');
            check('completed', 'with a review in, "Cancel Review Round" is not among the decision buttons; the other four are offered', info.actionButtons, eq(info.actionButtons, DECISIONS.filter((d) => d !== 'Cancel Review Round')));
            const text = await ed.page.locator('[role=dialog]').first().innerText();
            check('nothing', 'nothing stands in the button\'s place', /Cancel Review Round/.test(text) ? 'the text "Cancel Review Round" is on the screen' : 'no "Cancel Review Round" text', !/Cancel Review Round/.test(text));
            fact('completed-status', statusText(info));
            info = await L.openEditorial(ed, declined.id, 'ed-declined');
            check('declined', 'on a round whose only reviewer declined, "Cancel Review Round" is absent equally', info.actionButtons, !!info.actionButtons && !info.actionButtons.includes('Cancel Review Round') && info.actionButtons.includes('Accept Submission'));
            check('a4', 'A4: a round whose only reviewer declined reads "All reviews are confirmed and a decision is needed."', statusText(info), eq(info.status.lines, ['All reviews are confirmed and a decision is needed.']));
            fact('declined-reviewers', rowsOf(info, 'Reviewers'));
            info = await L.openEditorial(ed, mixed.id, 'ed-mixed');
            check('mixed', 'a declined reviewer beside an accepted one: the box reads "Awaiting responses from reviewers." and "Cancel Review Round" is absent', {status: statusText(info), buttons: info.actionButtons}, eq(info.status.lines, ['Awaiting responses from reviewers.']) && !info.actionButtons.includes('Cancel Review Round'));
            info = await L.openEditorial(ed, invited.id, 'ed-invited');
            check('control', 'on a round whose only reviewer has not yet responded, "Cancel Review Round" is offered', info.actionButtons, eq(info.actionButtons, DECISIONS));
        });
    };

    // ===========================================================================================
    parts.s12 = async () => {
        const j = await journal('m');
        const s = await seed(j, 's12', {participants: asEditor(j), submitter: j.u.au2});
        const c = await seed(j, 's12b', {participants: asEditor(j), submitter: j.u.au2, reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'completed'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au2, j.J);
        const rv = await L.actor(app, j.u.rv1, j.J);
        const authorSees = (ai) => ({
            reviewersList: rowsOf(ai, 'Reviewers'), readReview: ai.buttons.filter((b) => b === 'Read Review').length,
            notifications: ai.headings.some((h) => /:Notifications$/.test(h)), uploadRevisions: ai.buttons.includes('Upload revisions'),
            revisionsPanel: rowsOf(ai, 'Revisions Uploaded') !== null, discussions: ai.headings.filter((h) => /Discussions/.test(h)), status: statusText(ai),
        });
        let ai;
        await sect('setup', async () => {
            await L.openEditorial(ed, s.id, 'ed-setup');
            await P.addReviewer(ed.page, j.n.rv1, {method: 'Open'});
            await L.reviewerAccept(rv, s.id);
            await L.openEditorial(ed, s.id, 'ed-open-accepted');
            await requestRevisions(ed, {newRound: false}, 'letter');
        });
        await sect('fresh', async () => {
            ai = await L.openAuthor(au, c.id, 'au-control-fresh');
            const v = authorSees(ai); fact('control-fresh', v); fact('control-headings', ai.headings);
            check('fresh.panels', 'fresh in review: the "Revisions Uploaded" panel and the Discussions panel are there', v, v.revisionsPanel && v.discussions.length > 0);
            check('fresh.absent', 'no "Notifications" list, no reviewers list (not even an empty one), no "Upload revisions" button', v, !v.notifications && v.reviewersList === null && v.readReview === 0 && !v.uploadRevisions);
            ai = await L.openAuthor(au, s.id, 'au-open-underway');
            const w = authorSees(ai); fact('open-underway', w);
            check('underway', 'an open review under way: no reviewers list yet', w, w.reviewersList === null && w.readReview === 0);
        });
        await sect('submitted', async () => {
            await L.reviewerSubmit(rv, s.id, {comments: 'Shared remarks for the author.', privateComments: 'Private remarks for the editor.', label: 'rv-step3'});
            ai = await L.openAuthor(au, s.id, 'au-open-submitted');
            const w = authorSees(ai); fact('open-submitted', w);
            check('submitted', 'submitted, not confirmed: the author\'s review stage still lists no reviewer and offers no "Read Review"', w, w.reviewersList === null && w.readReview === 0);
        });
        const readAsAuthor = async (label) => {
            const row = au.page.getByRole('row').filter({hasText: j.n.rv1}).first();
            await row.getByRole('button', {name: 'Read Review', exact: true}).click();
            const win = au.page.getByRole('dialog').filter({has: au.page.locator('form#readReviewForm')});
            await win.locator('form#readReviewForm').waitFor({timeout: 45000});
            await idle(au.page);
            await L.settled(au.page, win.locator('form#readReviewForm')).catch(() => {});
            // Read without the attachments grid (register A3: nothing of that section is recorded).
            const data = await win.last().evaluate((d) => {
                const copy = d.cloneNode(true);
                copy.querySelectorAll('script, style, .pkp_controllers_grid, [id^="component-grid"]').forEach((g) => g.remove());
                const vis = (e) => e.getClientRects().length > 0;
                const whole = (copy.textContent || '').replace(/\s+/g, ' ').trim();
                const cut = whole.indexOf('Reviewer Files'); // the attachments section's heading: nothing after it is kept
                return {
                    title: [...d.querySelectorAll('h1,h2')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean),
                    headings: [...copy.querySelectorAll('h3,h4,legend,.label,label')].map((h) => (h.textContent || '').trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20),
                    text: (cut >= 0 ? whole.slice(0, cut) : whole).slice(0, 900),
                    hasAttachmentsSection: !!d.querySelector('.pkp_controllers_grid, [id^="component-grid"]'),
                    inputs: d.querySelectorAll('textarea, input[type=text]').length,
                    buttons: [...d.querySelectorAll('button')].filter(vis).map((b) => b.innerText.trim()).filter(Boolean),
                };
            });
            // The empty-state sentence of the window when the reviewer attached nothing: is it on screen?
            data.emptyFilesSentenceVisible = await win.getByText('You have not uploaded any review files.').first().isVisible().catch(() => false);
            L.record(`${L.state.part}-${label}`, data);
            await win.getByRole('button', {name: 'Close', exact: true}).first().click();
            await win.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            return data;
        };
        await sect('confirm', async () => {
            // 3.5 lead: is the review already on the author's screen before the editor confirms it?
            if (rowsOf(ai, 'Reviewers')) {
                const early = await readAsAuthor('au-read-review-before-confirm');
                fact('read-before-confirm', early);
                check('early', '(3.5 lead) before the editor confirms, the author\'s "Read Review" does not open the review', early.text, false);
            }
            await L.openEditorial(ed, s.id, 'ed-before-confirm');
            const win = await L.editorReadReview(ed, j.n.rv1, {label: 'ed-read-review'});
            fact('editor-read-review', win);
            ai = await L.openAuthor(au, s.id, 'au-open-confirmed');
            const w = authorSees(ai); fact('open-confirmed', w);
            check('listed', 'once the editor confirms it, the author\'s review stage lists the reviewer with "Read Review"', w, has(w.reviewersList, j.n.rv1) && w.readReview === 1);
            const data = await readAsAuthor('au-read-review');
            fact('author-read-review', data);
            check('window', 'the window shows the reviewer\'s name, completion date and recommendation', data.text, data.text.includes(j.n.rv1) && /Completed:\s*\d{4}-\d{2}-\d{2}/.test(data.text) && /Recommendation:\s*Accept Submission/.test(data.text));
            check('remark', 'then the typed remark "Shared remarks for the author." under "Reviewer Comments" › "For author and editor"', data.text, /Reviewer Comments/.test(data.text) && /For author and editor/.test(data.text) && data.text.includes('Shared remarks for the author.'));
            check('private', 'remarks meant for the editor alone never show', data.text.includes('Private remarks for the editor.') ? 'the editor-only remark is in the window' : 'no editor-only remark in the window', !data.text.includes('Private remarks for the editor.'));
            check('editor-sees-private', '(control) the editor\'s window shows the editor-only remark', flat(win.text, 900), win.text.includes('Private remarks for the editor.'));
        });
        await sect('letters', async () => {
            ai = await L.openAuthor(au, s.id, 'au-notifications');
            const heading = au.page.getByRole('heading', {name: 'Notifications', exact: true});
            const list = au.page.locator('div').filter({has: heading}).last();
            const items = await list.getByRole('listitem').allInnerTexts().then((x) => x.map((y) => flat(y, 200)));
            check('letters.list', 'the "Notifications" list holds the decision letter as a subject line and a date', items, items.length >= 1 && /\d{4}-\d{2}-\d{2}/.test(items[0]));
            const link = list.getByRole('listitem').first().locator('a').first();
            const subject = flat(await link.innerText());
            await link.click();
            const win = au.page.getByRole('dialog').filter({hasText: subject}).last();
            await win.waitFor({timeout: 30000}); await idle(au.page);
            const sc = await snap(au.page, 'au-letter-open');
            const boxes = await win.locator('textarea:visible, input[type=text]:visible, [contenteditable=true]:visible').count();
            check('letters.open', 'clicking it opens the full letter read-only in a side panel', {subject, editableBoxes: boxes, text: flat(sc.text.dialog, 200)}, boxes === 0 && (sc.text.dialog || '').includes(subject));
            await win.getByRole('button', {name: 'Close', exact: true}).first().click();
            ai = await L.openAuthor(au, c.id, 'au-control-end');
            const v = authorSees(ai); fact('control-end', v);
            check('control', 'the second submission, its anonymous review completed, shows no reviewers list at all', v, v.reviewersList === null && v.readReview === 0);
        });
        // Rule 17: the old addresses, every form, every reader.
        await sect('old', async () => {
            const rounds = roundIds(s.id);
            const base = `/index.php/${j.J}`;
            const read = async (a, url) => {
                const resp = await a.page.goto(url).catch((e) => ({error: String(e.message).slice(0, 120)}));
                await a.page.waitForLoadState('domcontentloaded').catch(() => {});
                const body = flat(await a.page.locator('body').innerText().catch(() => ''), 160);
                return {status: resp && resp.status ? resp.status() : resp, url: a.page.url().replace(app.baseURL, ''), body};
            };
            await au.page.goto(`${base}/authorDashboard/submission/${s.id}`);
            await au.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000}).catch(() => {});
            await idle(au.page);
            const sc = await snap(au.page, 'au-old-submission');
            const u = new URL(au.page.url());
            check('old.submission', '`authorDashboard/submission/{id}` lands on My Submissions with the submission\'s workflow open', sc.url.replace(app.baseURL, ''), u.pathname.endsWith('/dashboard/mySubmissions') && u.searchParams.get('workflowSubmissionId') === String(s.id) && (sc.text.dialog || '').includes(s.title));
            const forms = {
                'with-id': `${base}/authorDashboard/reviewRoundInfo/${s.id}`,
                'no-id': `${base}/authorDashboard/reviewRoundInfo`,
                'tab-form': `${base}/authorDashboard/reviewRoundInfo?submissionId=${s.id}&stageId=3&reviewRoundId=${rounds[0]}`,
                'language': `${base}/en/authorDashboard/reviewRoundInfo/${s.id}`,
            };
            const is404 = (r) => r.status === 404 && /^404 Not Found$/.test(r.body);
            for (const [k, url] of Object.entries(forms)) {
                const r = await read(au, url);
                if (k === 'with-id') await snap(au.page, 'au-old-round-tab');
                check(`old.author.${k}`, `the old per-round tab address (${k}) answers a bare "404 Not Found" page`, r, is404(r));
            }
            const others = {
                'another Author': await L.actor(app, j.u.au, j.J), 'an Editor': ed, 'the round\'s Reviewer': rv,
            };
            for (const [who, a] of Object.entries(others)) {
                const r = await read(a, forms['with-id']);
                check(`old.${who.replace(/\W+/g, '-')}`, `typed by ${who}, the page is the same "404 Not Found"`, r, is404(r));
            }
            const visitor = await L.launch(app);
            const r = await read({page: visitor.page}, forms['with-id']);
            check('old.visitor', 'a visitor who is not signed in gets the same page, not Login', r, is404(r));
            await visitor.close();
        });
    };

    // ===========================================================================================
    // Register entries no scenario passes.
    parts.reg = async () => {
        const j = await journal('r');
        const ed = await L.actor(app, j.u.ed, j.J);
        const wf = new P.WorkflowPage(ed.page, j.J);
        // A5: the review stage's Assign roster; a Copyeditor assigned on Copyediting opens the review stage.
        await sect('a5', async () => {
            const s = await seed(j, 'a5', {participants: asEditor(j), decisions: ['sendExternalReview', 'accept']});
            let info = await L.openEditorial(ed, s.id, 'a5-ed-copyediting');
            fact('a5-title', info.title);
            await ed.page.getByRole('button', {name: 'Assign', exact: true}).click();
            await P.completeAssignParticipantForm(ed.page, {group: 'Copyeditor', name: j.n.ce, searchName: j.u.ce});
            info = await L.selectMenu(ed, 'Review Round 1', 'a5-ed-round1');
            await ed.page.getByRole('button', {name: 'Assign', exact: true}).click();
            const modal = ed.page.getByRole('dialog').filter({has: ed.page.locator('select[name="filterUserGroupId"]')});
            await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
            const roster = await modal.locator('select[name="filterUserGroupId"] option').allInnerTexts().then((x) => x.map((y) => flat(y)));
            await snap(ed.page, 'a5-assign-roster');
            check('a5.roster', 'A5: the review stage\'s assignment dialog offers no production assistant group (Copyeditor, Layout Editor, Proofreader); Funding coordinator is offered', roster, !roster.some((r) => /Copyeditor|Layout Editor|Proofreader/i.test(r)) && roster.some((r) => /Funding coordinator/i.test(r)));
            await modal.getByRole('link', {name: 'Cancel'}).click().catch(() => modal.getByRole('button', {name: 'Close', exact: true}).first().click());
            const ce = await L.actor(app, j.u.ce, j.J);
            let ci = await L.openEditorial(ce, s.id, 'a5-ce-copyediting');
            fact('a5-ce-lands', {title: ci.title, menu: ci.menu});
            ci = await L.selectMenu(ce, 'Review Round 1', 'a5-ce-round1').catch(async () => L.selectMenu(ce, 'Review', 'a5-ce-review'));
            const text = flat(await ce.page.locator('[role=dialog]').first().innerText(), 1500);
            check('a5.refused', 'A5: a Copyeditor assigned on Copyediting who selects the review stage sees "You don\'t currently have access to that stage of the workflow."', {title: ci.title, tables: (ci.tables || []).map((t) => t.name)}, text.includes("You don't currently have access to that stage of the workflow."));
        });
        // A8: a past round's panels still act.
        await sect('a8', async () => {
            const s = await seed(j, 'a8', {participants: asEditor(j), decisions: ['sendExternalReview', 'newExternalReviewRound'], reviewRounds: [{reviewers: []}]});
            const f = L.txtNamed(`${s.tag}-past.txt`);
            await L.openEditorial(ed, s.id, 'a8-ed-round2');
            let r1 = await L.selectMenu(ed, 'Review Round 1', 'a8-ed-round1');
            fact('a8-round1-before', {status: r1.status, buttons: r1.buttons, reviewers: rowsOf(r1, 'Reviewers')});
            await P.addReviewer(ed.page, j.n.rv1);
            r1 = await L.reread(ed, 'a8-ed-round1-reviewer');
            check('a8.reviewer', 'A8: a reviewer added on a past round lands in that past round ("Request Sent")', rowsOf(r1, 'Reviewers'), has(rowsOf(r1, 'Reviewers'), j.n.rv1));
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
            await P.uploadViaWizard(ed.page, {file: f});
            r1 = await L.reread(ed, 'a8-ed-round1-file');
            check('a8.file', 'A8: a file uploaded on a past round lands in that past round\'s panel', rowsOf(r1, 'Revisions Uploaded'), has(rowsOf(r1, 'Revisions Uploaded'), f.name));
            check('a8.status', 'A8: the past round still reads "The submission has been advanced to the next round of review"', statusText(r1), eq(r1.status, {heading: 'Status', lines: ['The submission has been advanced to the next round of review']}));
            const r2 = await L.selectMenu(ed, 'Review Round 2', 'a8-ed-round2-after');
            check('a8.round2', 'A8: Round 2\'s panels stay empty', {reviewers: rowsOf(r2, 'Reviewers'), revisions: rowsOf(r2, 'Revisions Uploaded')}, eq(rowsOf(r2, 'Reviewers'), ['No Items']) && eq(rowsOf(r2, 'Revisions Uploaded'), ['No Items']));
        });
        // A6: Round 1 with a resubmit request and a revised file; Round 2 created, then cancelled.
        await sect('a6', async () => {
            const s = await seed(j, 'a6', {participants: asEditor(j), decisions: ['sendExternalReview', 'resubmit'], reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'accepted'}]}]});
            const f = L.pdfNamed(`${s.tag}-revised.pdf`);
            let info = await L.openEditorial(ed, s.id, 'a6-ed-requested');
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
            await P.uploadViaWizard(ed.page, {file: f});
            info = await L.openEditorial(ed, s.id, 'a6-ed-submitted');
            fact('a6-before-round2', statusText(info));
            await decide(ed, 'Create New Review Round', null, 'a6-newround');
            info = await L.reread(ed, 'a6-ed-round2');
            fact('a6-round2', {title: info.title, buttons: info.actionButtons});
            await decide(ed, 'Cancel Review Round', 'Cancel Review Round', 'a6-cancel');
            info = await L.reread(ed, 'a6-ed-restored');
            check('a6', 'A6: after Round 2 is cancelled, the restored Round 1 reads "Awaiting responses from reviewers." although its revision request stands and the revised file is still listed', {title: info.title, status: statusText(info), revisions: rowsOf(info, 'Revisions Uploaded')},
                eq(info.status, {heading: 'Round 1 Status', lines: ['Awaiting responses from reviewers.']}) && has(rowsOf(info, 'Revisions Uploaded'), f.name));
        });
        // A11: the upload window's own "Cancel" after the file was attached.
        await sect('a11', async () => {
            const s = await seed(j, 'a11', {participants: asEditor(j), decisions: ['sendExternalReview', 'requestRevisions']});
            const f = L.txtNamed(`${s.tag}-cancelled.txt`);
            const t0 = new Date(Date.now() - 2000);
            const au = await L.actor(app, j.u.au, j.J);
            await L.openAuthor(au, s.id, 'a11-au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = P.uploadWizardDialog(au.page);
            await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
            const genre = dlg.locator('select[id^="genreId"]');
            if (await genre.count()) await genre.selectOption({label: 'Article Text'});
            await dlg.locator('input[type="file"]').setInputFiles(f);
            await dlg.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
            await au.page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
            await snap(au.page, 'a11-au-attached');
            await dlg.getByRole('link', {name: 'Cancel'}).click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            fact('a11-prompts', au.nativeDialogs.slice());
            const ai = await L.openAuthor(au, s.id, 'a11-au-after-cancel');
            const info = await L.openEditorial(ed, s.id, 'a11-ed-after-cancel');
            let m = null;
            try { m = await app.mail.find({to: `${j.u.ed}@mail.test`, subject: REVISED, since: t0, timeoutMs: 20000}); } catch (e) { m = null; }
            check('a11', 'A11: after the window\'s "Cancel" the panel is back to "No Items" and the editor\'s box to "Revisions have been requested.", while the "Revised Version Uploaded" email stands', {panel: rowsOf(ai, 'Revisions Uploaded'), editor: statusText(info), mail: m ? m.Subject : null},
                eq(rowsOf(ai, 'Revisions Uploaded'), ['No Items']) && eq(info.status.lines, ['Revisions have been requested.']) && !!m);
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
