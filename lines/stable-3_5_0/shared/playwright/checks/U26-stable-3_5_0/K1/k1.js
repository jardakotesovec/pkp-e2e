// U26 "Review stage & rounds" on stable-3_5_0, claim check K1: the review stage as each role opens it
// (Purpose, Actors & permissions, Rules 1-9 of lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md)
// and register entries A2, A4, A5, A6, OMP1, plus the OPS absence paragraph.
//
// Run (the version's fleets up: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature U26-stable-3_5_0):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=U26-stable-3_5_0 PROBE_AGENT=ccK1 PROBE_RUN=s1 PARTS=access \
//     PROBE_NOTES_FEATURE=U26-stable-3_5_0 \
//     node bin/probe.js all lines/stable-3_5_0/shared/playwright/checks/U26-stable-3_5_0/K1/k1.js
//
// PROBE_RUN names the run (s1, then s2; every part builds its own scratch journal or press, so the two runs
// never share state). PARTS picks parts (comma list; default all, about 25 minutes over two apps, so run
// two or three parts per call). `ops` runs on OPS only, every other part on OJS and OMP (`ONLY=ojs,omp`).
// Helpers come from ../W1/lib.js (the version's walk) and the version's OJS page object, whose screens the
// press shares (the External Review stage is the journal's Vue blocks on both apps).
//
//   ops      OPS: no review stage in a preprint's workflow menu, the Production stage as the control
//   access   who opens the review stage (Actors table, A5 roster), what each role is given, the refused
//            visitors, the author's way in through My Submissions; "Delete" while declined
//   panels   what the editor's and the author's round offers before and after "Request Revisions", and on
//            an accepted submission; the stage-not-started and skipped-review boxes; the press's menu (OMP1)
//   status1  reviewer-derived sentences and their precedence (overdue, unread, underway, declined, cancelled)
//   status2  recommendation sentences and their precedence over the reviewer ones
//   status3  the revision sentences and their flip back after the revised file is deleted (Rule 7)
//   status4  "Cancel Copyediting" back into review: which sentence the round reads
//   files    the "Current Review Files For Round {N}" window on Round 1 and on Round 2 (Rule 8)
//   a6       register A6 (Round 2 cancelled after a resubmit request), then a new Round 2 (Rule 2)
//   v2       the author reads an open review (before and after the editor's "Confirm"), the anonymous
//            control, and the editor's letter in "Notifications" (Actors rows, fn v2 and k)
//   past     Rule 4's past-round texts in review and after the Accept; every round stays listed
//   send     Rule 2: the Submission stage's send-to-review decision opens Round 1; recommend-only rows
//
// Every screen is recorded with the kit's screen() (`<part>-<screen>-<run>-<app>.json` + PNG), and each
// part writes `<part>-checks-<run>-<app>.json`: one row per claim, the spec's sentence, what the screen gave,
// `same`. Overdue reviews are reached by moving a seeded request's due date into the past with sql(): no
// scenario key sets due dates (scenarios.md "Field shapes not built yet").
const path = require('path');
const L = require('../W1/lib');
const {forEachApp, tag, check, fact, sect, snap, flat, log, idle, statusText, rowsOf, note} = L;

const ALL = ['ops', 'access', 'panels', 'status1', 'status2', 'status3', 'status4', 'files', 'a6', 'v2', 'past', 'send'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const has = (list, s) => !!list && list.some((x) => String(x).includes(s));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lines = (info) => (info && info.status ? info.status.lines : null);

forEachApp(async (app) => {
    const isOps = app.name === 'ops';
    const P = require(path.join(L.REPO, 'apps/ojs/playwright/pages/ReviewStagePages.js'));
    const omp = app.name === 'omp';
    const FIRST = omp ? 'skipInternalReview' : 'sendExternalReview';
    const GENRE = omp ? 'Book Manuscript' : 'Article Text';
    const STAGE = omp ? 'External Review' : 'Review';
    const roundTitle = (n) => `Workflow: ${STAGE} (Round ${n})`;
    const round = (o = {}) => (omp ? {stage: 'external', ...o} : o);

    async function journal(prefix, roles) {
        const J = tag(`u26vk1${prefix}`);
        const u = {}; const n = {};
        for (const [k, g, f] of roles) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
        await app.api.createContext({tag: J, users: roles.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]}))});
        fact(`journal-${prefix}`, J);
        return {J, u, n};
    }
    const BASIC = [
        ['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['rec', 'Remy', 'Recommendly', 'sectionEditor'],
        ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer'],
        ['rv3', 'Rudy', 'Revthree', 'externalReviewer'],
    ];
    async function seed(j, suffix, {decisions = [FIRST], reviewRounds = [round({reviewers: []})], participants, files, submitter} = {}) {
        const t = `${j.J}${suffix}`;
        const spec = {tag: t, context: j.J, submitter: submitter || j.u.au, title: `Submission ${t}`, decisions, reviewRounds};
        if (participants) spec.participants = participants;
        if (files) spec.files = files;
        const r = await app.api.createSubmission(spec);
        fact(`seed-${suffix}`, r.submissionId);
        return {id: r.submissionId, title: `Submission ${t}`, tag: t};
    }
    const asEditor = (j) => [{username: j.u.ed, role: 'editor'}];

    // The decision wizard: "Continue" to "Record Decision", then "View Submission" (as in W1/walk.js).
    async function finishDecision(a, expectTitle, label, {onFiles} = {}) {
        const d = new P.DecisionPage(a.page);
        await a.page.waitForURL(/decision\/record/, {timeout: 45000});
        await a.page.getByRole('heading', {level: 1}).first().waitFor({timeout: 45000});
        await idle(a.page);
        const steps = [];
        for (let i = 0; i < 6; i++) {
            await d.awaitComposerLoaded();
            steps.push(flat(await a.page.getByRole('heading', {level: 1}).first().innerText()));
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
    async function decide(a, button, expectTitle, label) {
        await a.page.getByRole('button', {name: button, exact: true}).click();
        return finishDecision(a, expectTitle, label);
    }
    async function requestRevisions(a, {newRound}, label) {
        await a.page.getByRole('button', {name: 'Request Revisions', exact: true}).click();
        const modal = a.page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
        await modal.getByRole('radio').first().waitFor({timeout: 30000});
        const want = newRound ? 'Revisions will be subject to a new round of peer reviews.' : 'Revisions will not be subject to a new round of peer reviews.';
        await modal.getByRole('radio', {name: want}).check();
        await modal.getByRole('button', {name: 'Next', exact: true}).click();
        return finishDecision(a, newRound ? 'Resubmit for Review' : 'Request Revisions', label);
    }
    // The text of the open workflow dialog (or the body when none is open), for refusals and absences.
    const dialogText = async (page) => flat(await page.locator('[role=dialog]').first().innerText({timeout: 5000}).catch(() => page.locator('body').innerText().catch(() => '')), 3000);
    const authorUpload = async (au, id, file, label) => {
        await L.openAuthor(au, id, `${label}-before`);
        await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
        await P.uploadViaWizard(au.page, {genre: GENRE, file});
    };
    const deleteRevision = async (ed, file) => {
        const wf = new P.WorkflowPage(ed.page, ed.ctx);
        const row = wf.panelRow('Revisions Uploaded', file.name).first();
        await P.clickRowAction(ed.page, row, 'Delete');
        const c = ed.page.getByRole('dialog').filter({hasText: 'Delete'}).filter({has: ed.page.getByRole('button', {name: 'OK', exact: true})}).last();
        await c.getByRole('button', {name: 'OK', exact: true}).click();
        await idle(ed.page);
    };
    const selectStageEntry = async (a, name, label) => {
        await a.page.getByRole('link', {name, exact: true}).first().click();
        await idle(a.page);
        return L.reread(a, label);
    };

    const parts = {};

    // ===========================================================================================
    // OPS: no review stage (spec lines 28-30).
    parts.ops = async () => {
        if (!isOps) return;
        const j = await journal('p', [['mgr', 'Mona', 'Managerly', 'manager'], ['mod', 'Mo', 'Moderly', 'sectionEditor'], ['au', 'Avery', 'Authorly', 'author']]);
        const r = await app.api.createSubmission({tag: `${j.J}pp`, context: j.J, submitter: j.u.au, title: `Preprint ${j.J}pp`, participants: [{username: j.u.mod, role: 'sectionEditor'}]});
        const id = r.submissionId; fact('seed-ops', id);
        for (const who of ['mgr', 'mod']) {
            const a = await L.actor(app, j.u[who], j.J);
            const info = await L.openEditorial(a, id, `${who}-workflow`);
            check(`${who}.menu`, 'no Review entry in a preprint\'s workflow menu', info.menu, !has(info.menu, 'Review'));
            check(`${who}.control`, '(control) the menu holds the Production stage and its screen renders its controls', {menu: info.menu, actions: info.actionButtons, headings: info.headings}, has(info.menu, 'Production') && (info.actionButtons || []).length > 0);
            check(`${who}.panels`, 'no round, reviewer or review-file surface anywhere on the screen', info.headings, !info.headings.some((h) => /Round|Reviewer|Files for Review|Revisions Uploaded/.test(h)));
            // The review stage's menu key typed into the address (as a journal's links carry it).
            await a.page.goto(`/index.php/${j.J}/user/profile`);
            await a.page.goto(`/index.php/${j.J}/dashboard/editorial?workflowSubmissionId=${id}&workflowMenuKey=workflow_3`);
            await idle(a.page);
            await a.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 30000}).catch(() => {});
            const typed = await L.reread(a, `${who}-typed-review-key`);
            check(`${who}.typed`, 'the review stage\'s menu key typed into the address opens no review screen', {title: typed.title, headings: typed.headings}, !typed.headings.some((h) => /Round|Reviewer|Files for Review|Revisions Uploaded/.test(h)));
            await a.close();
        }
        const au = await L.actor(app, j.u.au, j.J);
        const ai = await L.openAuthor(au, id, 'au-workflow');
        check('au.menu', 'the author\'s workflow menu holds no Review entry either', ai.menu, !has(ai.menu, 'Review'));
    };

    // ===========================================================================================
    // Actors & permissions: who opens the stage and what each gets; refused visitors; Delete while declined.
    parts.access = async () => {
        const roles = [
            ['mgr', 'Mona', 'Managerly', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'],
            ['se2', 'Sol', 'Unassigned', 'sectionEditor'], ['fc', 'Fern', 'Fundly', 'funding'], ['ce', 'Cora', 'Copyly', 'copyeditor'],
            ['le', 'Lev', 'Layoutly', 'layoutEditor'], ['pr', 'Pia', 'Proofly', 'proofreader'], ['au', 'Avery', 'Authorly', 'author'],
            ['au2', 'Blake', 'Otherly', 'author'], ['rv', 'Rhea', 'Revone', 'externalReviewer'],
        ];
        if (!omp) roles.push(['ge', 'Gil', 'Guestly', 'guestEditor']);
        const j = await journal('a', roles);
        const participants = [
            {username: j.u.ed, role: 'editor'}, {username: j.u.se, role: 'sectionEditor'}, {username: j.u.fc, role: 'funding'},
            {username: j.u.ce, role: 'copyeditor'}, {username: j.u.le, role: 'layoutEditor'}, {username: j.u.pr, role: 'proofreader'},
        ];
        if (!omp) participants.push({username: j.u.ge, role: 'guestEditor'});
        const s = await seed(j, 'x', {participants, files: [{file: 'article.pdf'}], reviewRounds: [round({reviewers: [{username: j.u.rv, status: 'accepted'}], files: [{file: 'notes.md'}]})]});
        const viewers = [['admin', 'admin'], ['mgr', j.u.mgr], ['ed', j.u.ed], ['se', j.u.se], ...(omp ? [] : [['ge', j.u.ge]]), ['fc', j.u.fc], ['ce', j.u.ce], ['le', j.u.le], ['pr', j.u.pr], ['se2', j.u.se2]];
        const seen = {};
        for (const [k, user] of viewers) {
            await sect(`open-${k}`, async () => {
                const a = await L.actor(app, user, j.J);
                const info = await L.openEditorial(a, s.id, `x-${k}`);
                const text = await dialogText(a.page);
                const row = {
                    title: info.title, status: statusText(info), headings: info.headings, actions: info.actionButtons,
                    selectFiles: has(info.buttons, 'Upload/Select Files'), addReviewer: has(info.buttons, 'Add Reviewer'), assign: info.buttons.includes('Assign'),
                    refused: /You don't currently have access to that stage of the workflow|does not have access/.test(text), showsTitle: text.includes(s.title),
                    menu: info.menu, dialogs: a.nativeDialogs.slice(), errorText: /Error|access/.test(text) ? text.slice(0, 300) : null,
                };
                seen[k] = row;
                fact(`x-${k}`, row);
                if (k === 'fc' && row.selectFiles) {
                    await a.page.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
                    const dlg = a.page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
                    const opened = await dlg.getByRole('link', {name: 'Upload Review File'}).waitFor({timeout: 20000}).then(() => true, () => false);
                    await snap(a.page, 'x-fc-files-dialog');
                    fact('fc-files-dialog', {opened, text: opened ? flat(await dlg.last().innerText(), 600) : null});
                    if (opened) {
                        // Does the Funding Coordinator's selection act? Tick the Submission-stage file and confirm.
                        await P.showFilesFromAllStages(a.page, dlg);
                        const box = P.reviewFilesCheckbox(dlg, 'article.pdf').first();
                        const offered = await box.waitFor({timeout: 20000}).then(() => true, () => false);
                        if (offered) {
                            await box.check();
                            await P.confirmReviewFilesDialog(a.page, dlg);
                            const sc = await snap(a.page, 'x-fc-files-after');
                            const after = await L.reread(a, 'x-fc-round-after');
                            check('fc.files.act', 'the Funding Coordinator\'s file selection acts: "Review files updated." and the panel lists the ticked file', {notices: sc.notices, panel: rowsOf(after, 'Files for Review')}, has(sc.notices, 'Review files updated.') && has(rowsOf(after, 'Files for Review'), 'article.pdf'));
                        } else {
                            fact('fc-files-offered', false);
                            await dlg.getByRole('link', {name: 'Cancel'}).click().catch(() => {});
                        }
                    }
                    if (has(row.buttons || (await L.wfInfo(a.page)).buttons, 'Add Reviewer')) {
                        await a.page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                        const m = a.page.getByRole('dialog').filter({has: a.page.locator('.listPanel--selectReviewer')});
                        const ok = await m.locator('input.pkpSearch__input').waitFor({timeout: 30000}).then(() => true, () => false);
                        await snap(a.page, 'x-fc-add-reviewer');
                        fact('fc-add-reviewer-window', ok);
                        if (ok) await m.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                    }
                }
                if (k === 'ed') {
                    // A5: the review stage's Assign roster.
                    await a.page.getByRole('button', {name: 'Assign', exact: true}).click();
                    const modal = a.page.getByRole('dialog').filter({has: a.page.locator('select[name="filterUserGroupId"]')});
                    await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
                    const roster = await modal.locator('select[name="filterUserGroupId"] option').allInnerTexts().then((x) => x.map((y) => flat(y)));
                    await snap(a.page, 'x-ed-assign-roster');
                    fact('assign-roster', roster);
                    check('a5.roster', 'A5: the review stage\'s Assign dialog offers no production assistant group (Copyeditor, Layout Editor, Proofreader); Funding coordinator is offered', roster, !roster.some((r) => /Copyeditor|Layout Editor|Proofreader/i.test(r)) && roster.some((r) => /Funding coordinator/i.test(r)));
                    await modal.getByRole('link', {name: 'Cancel'}).click().catch(() => modal.getByRole('button', {name: 'Close', exact: true}).first().click());
                }
                await a.close();
            });
        }
        const opens = (r) => !!r && r.title === roundTitle(1) && !r.refused && !!r.status;
        check('open.editors', 'Site Administrator, Journal Manager, Editor, assigned Section Editor (and Guest Editor) open the round', Object.fromEntries(['admin', 'mgr', 'ed', 'se', 'ge'].filter((k) => seen[k]).map((k) => [k, opens(seen[k])])), ['admin', 'mgr', 'ed', 'se', 'ge'].filter((k) => seen[k]).every((k) => opens(seen[k])));
        check('open.fc', 'Funding Coordinator assigned to the submission opens the round', seen.fc, opens(seen.fc));
        check('open.assistants', 'Copyeditor, Layout Editor, Proofreader assigned elsewhere are told they have no access to this stage', Object.fromEntries(['ce', 'le', 'pr'].map((k) => [k, seen[k] && {title: seen[k].title, refused: seen[k].refused, menu: seen[k].menu}])), ['ce', 'le', 'pr'].every((k) => seen[k] && seen[k].refused));
        check('open.se2', '(unassigned Section Editor) not assigned to the stage: no way into this submission\'s round', seen.se2, !!seen.se2 && !opens(seen.se2));
        const boxes = Object.entries(seen).filter(([, r]) => opens(r)).map(([k, r]) => [k, r.status]);
        check('status.same', 'everyone who opens the stage sees the same status box', boxes, new Set(boxes.map((b) => b[1])).size === 1);
        check('files.choose', 'the Files for Review selection (Upload/Select Files) is offered to Site Administrator, Journal Manager, Editor, assigned Section/Guest Editor only', Object.fromEntries(Object.entries(seen).map(([k, r]) => [k, r.selectFiles])), ['admin', 'mgr', 'ed', 'se', 'ge'].filter((k) => seen[k]).every((k) => seen[k].selectFiles) && !(seen.fc && seen.fc.selectFiles));
        check('decide.fc', 'assistant-level roles (Funding Coordinator) get no decision buttons', seen.fc && seen.fc.actions, !seen.fc || !(seen.fc.actions || []).length);

        // The author's own way in: My Submissions, then the row's "View".
        await sect('author', async () => {
            const au = await L.actor(app, j.u.au, j.J);
            await au.page.goto(`/index.php/${j.J}/dashboard/mySubmissions`);
            await idle(au.page);
            const list = await snap(au.page, 'au-my-submissions');
            const row = au.page.getByRole('row').filter({hasText: s.title}).first();
            const view = row.getByRole('button', {name: /^View/}).or(row.getByRole('link', {name: /^View/})).first();
            await view.click();
            await au.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000});
            const ai = await L.reread(au, 'au-via-list');
            fact('au-list-row', flat(list.text.main, 500));
            check('author.way-in', 'the Author reaches the stage through My Submissions, in the author view', {title: ai.title, url: au.page.url().replace(app.baseURL, ''), headings: ai.headings, status: statusText(ai)}, ai.title === roundTitle(1) && /mySubmissions/.test(au.page.url()));
            seen.au = {status: statusText(ai)};
            check('status.author', 'the author\'s status box is the editor\'s', {author: statusText(ai), editor: seen.ed && seen.ed.status}, !!seen.ed && statusText(ai) === seen.ed.status);
            // The author types the editorial address of their own submission.
            const ei = await L.openEditorial(au, s.id, 'au-editorial-address');
            fact('au-editorial-address', {title: ei.title, text: (await dialogText(au.page)).slice(0, 300), url: au.page.url().replace(app.baseURL, '')});
            await au.close();
        });
        // Refused visitors: another author, the round's reviewer.
        for (const [k, user] of [['au2', j.u.au2], ['rv', j.u.rv]]) {
            await sect(`refused-${k}`, async () => {
                const a = await L.actor(app, user, j.J);
                const out = {};
                for (const [kind, url] of [['author', L.authorUrl(j.J, s.id)], ['editorial', L.editorialUrl(j.J, s.id)]]) {
                    await a.page.goto(`/index.php/${j.J}/user/profile`).catch(() => {});
                    const resp = await a.page.goto(url).catch(() => null);
                    await idle(a.page);
                    await a.page.waitForTimeout(1500);
                    const sc = await snap(a.page, `refused-${k}-${kind}`);
                    const body = flat(await a.page.locator('body').innerText().catch(() => ''), 1500);
                    out[kind] = {status: resp && resp.status(), url: a.page.url().replace(app.baseURL, ''), dialog: flat(sc.text && sc.text.dialog, 300), notices: sc.notices, showsTitle: body.includes(s.title), body: body.slice(0, 300)};
                }
                fact(`refused-${k}`, out);
                check(`refused.${k}`, `${k === 'rv' ? 'the round\'s reviewer' : 'another author'} typing the workflow address gets only an access error, nothing of the submission`, out, !out.author.showsTitle && !out.editorial.showsTitle);
                await a.close();
            });
        }
        // Delete while declined (Actors row "Delete the submission").
        await sect('declined', async () => {
            const d = await seed(j, 'd', {decisions: [FIRST, 'decline'], participants: [{username: j.u.ed, role: 'editor'}, {username: j.u.se, role: 'sectionEditor'}]});
            const got = {};
            for (const [k, user] of [['admin', 'admin'], ['mgr', j.u.mgr], ['ed', j.u.ed], ['se', j.u.se]]) {
                const a = await L.actor(app, user, j.J);
                const info = await L.openEditorial(a, d.id, `d-${k}`);
                got[k] = {actions: info.actionButtons, status: statusText(info)};
                await a.close();
            }
            fact('declined-buttons', got);
            check('delete.declined', 'while declined: "Delete" for Journal Manager and Site Administrator; not for the Section Editor', got, has(got.admin.actions, 'Delete') && has(got.mgr.actions, 'Delete') && !has(got.se.actions, 'Delete'));
            check('delete.editor', '(Journal editor, a manager-level Editor) is "Delete" offered?', got.ed, true);
            check('declined.status', 'the box reads "Submission declined."', got.ed.status, /Submission declined\.$/.test(got.ed.status));
            check('delete.control', '(control) before the decline no "Delete" stands among the buttons of Site Administrator and Journal Manager', {admin: seen.admin && seen.admin.actions, mgr: seen.mgr && seen.mgr.actions}, !has(seen.admin && seen.admin.actions, 'Delete') && !has(seen.mgr && seen.mgr.actions, 'Delete'));
        });
    };

    // ===========================================================================================
    // What each view of a round offers (fn v1), Rule 9's panel, Rule 4's not-started and skipped boxes, OMP1.
    parts.panels = async () => {
        const j = await journal('b', BASIC);
        const s = await seed(j, 'r', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const offer = (info) => ({title: info.title, headings: info.headings, buttons: info.buttons, actions: info.actionButtons, status: statusText(info), menu: info.menu});
        const respond = (info) => [...info.headings, ...info.buttons].filter((x) => /respon|reply|rebuttal/i.test(x));
        let info, ai;
        await sect('fresh', async () => {
            info = await L.openEditorial(ed, s.id, 'ed-fresh');
            fact('ed-fresh', offer(info));
            const t = await dialogText(ed.page);
            check('revisions.description', 'the "Revisions Uploaded" panel is there from the moment the round opens, with "These files have been submitted by the author after revisions were requested"', {headings: info.headings, hasText: t.includes('These files have been submitted by the author after revisions were requested')}, has(info.headings, 'Revisions Uploaded') && t.includes('These files have been submitted by the author after revisions were requested'));
            check('menu', `the workflow menu's "${STAGE}" entry expands into "Review Round 1"; the title reads "${STAGE} (Round 1)"`, {menu: info.menu, title: info.title}, has(info.menu, 'Review Round 1') && info.menu.includes(STAGE) && info.title === roundTitle(1));
            if (omp) check('omp1.menu', 'OMP1: the press\'s workflow menu carries an "Internal Review" entry', info.menu, info.menu.includes('Internal Review'));
            ai = await L.openAuthor(au, s.id, 'au-fresh');
            fact('au-fresh', offer(ai));
            const at = await dialogText(au.page);
            check('au.fresh.upload', 'the author has no "Upload revisions" button before revisions are asked for', ai.buttons, !ai.buttons.includes('Upload revisions'));
            check('au.fresh.description', 'the author\'s "Revisions Uploaded" panel carries the same description', at.includes('These files have been submitted by the author after revisions were requested'), at.includes('These files have been submitted by the author after revisions were requested'));
        });
        await sect('requested', async () => {
            await requestRevisions(ed, {newRound: false}, 'request');
            info = await L.reread(ed, 'ed-requested');
            fact('ed-requested', offer(info));
            check('v1.editor', 'the editor\'s round with Request Revisions recorded: status box, "Revisions Uploaded", "Files for Review", "Reviewers", the discussions list and "Participants"; nothing about an author response', {headings: info.headings, respond: respond(info)},
                ['Revisions Uploaded', 'Files for Review', 'Reviewers', 'Participants'].every((h) => has(info.headings, h)) && has(info.headings, 'Discussions') && respond(info).length === 0);
            ai = await L.openAuthor(au, s.id, 'au-requested');
            fact('au-requested', offer(ai));
            check('v1.author', 'the author\'s round: status box, "Notifications", "Revisions Uploaded" and the discussions list; nothing to write a response', {headings: ai.headings, respond: respond(ai)},
                has(ai.headings, 'Notifications') && has(ai.headings, 'Revisions Uploaded') && has(ai.headings, 'Discussions') && !has(ai.headings, 'Files for Review') && respond(ai).length === 0);
            check('au.requested.upload', 'the author\'s "Upload revisions" button appears while "Revisions have been requested."', {buttons: ai.buttons, status: statusText(ai)}, ai.buttons.includes('Upload revisions') && /Revisions have been requested\.$/.test(statusText(ai)));
        });
        await sect('accepted', async () => {
            const a = await seed(j, 'acc', {decisions: [FIRST, 'accept'], participants: asEditor(j)});
            info = await L.openEditorial(ed, a.id, 'acc-ed-landing');
            fact('acc-landing', {title: info.title, status: statusText(info)});
            info = await L.selectMenu(ed, 'Review Round 1', 'acc-ed-round1');
            fact('acc-ed-round1', offer(info));
            check('v1.accepted.editor', 'an accepted round (Review Round 1): nothing about a response to the reviews', respond(info), respond(info).length === 0);
            check('accepted.box', 'after Accept the round box reads "The submission is currently in the Copyediting stage." under plain "Status"; "Submission accepted." does not show', statusText(info), eq(info.status, {heading: 'Status', lines: ['The submission is currently in the Copyediting stage.']}));
            ai = await L.openAuthor(au, a.id, 'acc-au-landing');
            ai = await L.selectMenu(au, 'Review Round 1', 'acc-au-round1');
            fact('acc-au-round1', offer(ai));
            check('v1.accepted.author', 'the author\'s accepted round: nothing about a response; same box', {respond: respond(ai), status: statusText(ai)}, respond(ai).length === 0 && statusText(ai) === statusText(info));
        });
        await sect('not-started', async () => {
            const n = await seed(j, 'n', {decisions: [], reviewRounds: [], participants: asEditor(j)});
            info = await L.openEditorial(ed, n.id, 'ns-ed-submission');
            fact('ns-menu', info.menu);
            info = await selectStageEntry(ed, STAGE, 'ns-ed-review');
            check('not-started', `before the stage has started the box reads "The ${STAGE} stage has not yet been initiated."`, {title: info.title, status: statusText(info)}, eq(lines(info), [`The ${STAGE} stage has not yet been initiated.`]));
            if (omp) {
                const ir = await selectStageEntry(ed, 'Internal Review', 'ns-ed-internal');
                fact('omp1-internal-entry', {title: ir.title, status: statusText(ir)});
            }
        });
        // OMP1: the press's Internal Review round, its decision labels and file panels, beside External Review.
        if (omp) await sect('omp1', async () => {
            const i = await seed(j, 'int', {decisions: ['sendInternalReview'], reviewRounds: [{stage: 'internal', reviewers: []}], participants: asEditor(j)});
            const ii = await L.openEditorial(ed, i.id, 'omp1-internal-round');
            fact('omp1-internal', offer(ii));
            check('omp1.internal', 'OMP1: the Internal Review round has the same round machinery (status box, file panels, reviewers) and its own decision labels, "Send to External Review" among them', {title: ii.title, headings: ii.headings, actions: ii.actionButtons, menu: ii.menu},
                /Internal Review \(Round 1\)/.test(ii.title || '') && has(ii.actionButtons, 'Send to External Review') && has(ii.headings, 'Reviewers'));
            const ext = await seed(j, 'ext', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            const ei = await L.openEditorial(ed, ext.id, 'omp1-external-round');
            fact('omp1-external', offer(ei));
            check('omp1.skip', 'OMP1: a monograph sent straight to External Review (Internal Review skipped) shows the External Review round; its Internal Review entry stays', {title: ei.title, menu: ei.menu}, ei.title === roundTitle(1) && ei.menu.includes('Internal Review'));
            const iEntry = await selectStageEntry(ed, 'Internal Review', 'omp1-skipped-internal');
            fact('omp1-skipped-internal', {title: iEntry.title, status: statusText(iEntry), headings: iEntry.headings});
        });
        await sect('skipped', async () => {
            let k = null;
            try { k = await seed(j, 'k', {decisions: ['skipExternalReview'], reviewRounds: [], participants: asEditor(j)}); } catch (e) { fact('skip-seed', String(e.message).slice(0, 300)); }
            if (!k) return;
            info = await L.openEditorial(ed, k.id, 'sk-ed-landing');
            fact('sk-landing', {title: info.title, menu: info.menu});
            info = await selectStageEntry(ed, STAGE, 'sk-ed-review');
            check('skipped', `a submission that skipped review: what the ${STAGE} entry's box reads`, {title: info.title, status: statusText(info), headings: info.headings}, true);
        });
    };

    // ===========================================================================================
    // Rules 5-6: the reviewer-derived sentences, their precedence, A4, a cancelled reviewer; A2 at each state.
    parts.status1 = async () => {
        const j = await journal('c', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const both = async (id, label) => {
            const e = await L.openEditorial(ed, id, `ed-${label}`);
            const a = await L.openAuthor(au, id, `au-${label}`);
            check(`a2.${label}`, 'A2: the author\'s box is character-identical to the editor\'s', {editor: statusText(e), author: statusText(a)}, statusText(e) === statusText(a));
            return e;
        };
        const reviewerId = (u) => L.sql(app, `select user_id from users where username = '${u}'`).trim();
        await sect('waiting', async () => {
            const w = await seed(j, 'w', {participants: asEditor(j)});
            let e = await both(w.id, 'waiting');
            check('waiting', '"Waiting for reviewers to be assigned." while no reviewer has been added', statusText(e), eq(lines(e), ['Waiting for reviewers to be assigned.']));
            await P.addReviewer(ed.page, j.n.rv1);
            e = await both(w.id, 'added');
            check('awaiting', 'after "Add Reviewer": "Awaiting responses from reviewers."', statusText(e), eq(lines(e), ['Awaiting responses from reviewers.']));
        });
        await sect('overdue', async () => {
            const o = await seed(j, 'o', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'invited'}, {username: j.u.rv2, status: 'completed'}]})]});
            let e = await both(o.id, 'unread-underway');
            check('unread>underway', 'an unread review beside one underway: "New reviews have been submitted."', statusText(e), eq(lines(e), ['New reviews have been submitted.']));
            L.sql(app, `update review_assignments set date_response_due = now() - interval '3 days' where submission_id = ${o.id} and reviewer_id = ${reviewerId(j.u.rv1)}`);
            e = await both(o.id, 'overdue-unread');
            check('overdue>unread', 'a missed response deadline beside an unread review: "A review is overdue."', {status: statusText(e), reviewers: rowsOf(e, 'Reviewers')}, eq(lines(e), ['A review is overdue.']));
            const v = await seed(j, 'v', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv3, status: 'accepted'}]})]});
            L.sql(app, `update review_assignments set date_due = now() - interval '3 days' where submission_id = ${v.id} and reviewer_id = ${reviewerId(j.u.rv3)}`);
            e = await both(v.id, 'review-overdue');
            check('overdue.review', 'a missed review deadline: "A review is overdue."', {status: statusText(e), reviewers: rowsOf(e, 'Reviewers')}, eq(lines(e), ['A review is overdue.']));
        });
        await sect('confirmed', async () => {
            const c = await seed(j, 'cf', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'completed'}]})]});
            let e = await both(c.id, 'unread');
            check('unread', 'a review submitted, no editor confirmed it: "New reviews have been submitted."', statusText(e), eq(lines(e), ['New reviews have been submitted.']));
            const win = await L.editorReadReview(ed, j.n.rv1, {label: 'ed-read-review'});
            fact('read-review-window', {kind: win.kind, title: win.title, buttons: win.buttons, confirm: win.confirmLabel});
            e = await both(c.id, 'confirmed');
            check('confirmed', 'every review in and confirmed: "All reviews are confirmed and a decision is needed."', statusText(e), eq(lines(e), ['All reviews are confirmed and a decision is needed.']));
        });
        await sect('declined', async () => {
            const d = await seed(j, 'dc', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'declined'}]})]});
            const e = await both(d.id, 'all-declined');
            check('a4', 'A4: a round whose only reviewer declined reads "All reviews are confirmed and a decision is needed."', {status: statusText(e), reviewers: rowsOf(e, 'Reviewers')}, eq(lines(e), ['All reviews are confirmed and a decision is needed.']));
            const m = await seed(j, 'dm', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'declined'}, {username: j.u.rv2, status: 'completed'}]})]});
            const e2 = await both(m.id, 'declined-unread');
            check('declined.notcounted', 'a declined reviewer beside an unread review: the unread one decides ("New reviews have been submitted.")', statusText(e2), eq(lines(e2), ['New reviews have been submitted.']));
        });
        await sect('cancelled', async () => {
            const x = await seed(j, 'cx', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            let e = await both(x.id, 'before-cancel');
            const wf = new P.WorkflowPage(ed.page, j.J);
            const row = wf.panelRow('Reviewers', j.n.rv1).first();
            const menu = await P.openRowMenu(ed.page, row);
            const items = await menu.getByRole('menuitem').allInnerTexts().then((t) => t.map((y) => flat(y)));
            fact('reviewer-row-menu', items);
            await menu.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
            const win = ed.page.getByRole('dialog').filter({has: ed.page.getByRole('button', {name: 'Cancel Reviewer', exact: true})}).last();
            await win.getByRole('button', {name: 'Cancel Reviewer', exact: true}).waitFor({timeout: 30000});
            await idle(ed.page);
            await snap(ed.page, 'cancel-reviewer-window');
            await win.getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
            await win.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(ed.page);
            e = await both(x.id, 'after-cancel');
            check('cancelled.only', 'the only reviewer removed ("Cancel Reviewer"): what the round reads (removed reviewers are not counted)', {status: statusText(e), reviewers: rowsOf(e, 'Reviewers')}, true);
        });
    };

    // ===========================================================================================
    // Rules 5-6: the recommendation sentences and where they stand against the reviewer ones.
    parts.status2 = async () => {
        const j = await journal('d', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const se = await L.actor(app, j.u.se, j.J);
        const rec = await L.actor(app, j.u.rec, j.J);
        const ro = (k) => ({username: j.u[k], role: 'sectionEditor', recommendOnly: true});
        const recommend = async (a, id, label) => {
            const i = await L.openEditorial(a, id, `${label}-before`);
            fact(`${label}-buttons`, i.actionButtons);
            await decide(a, 'Recommend Accept', 'Recommend Accept', label);
        };
        await sect('none', async () => {
            const r0 = await seed(j, 'r0', {participants: [...asEditor(j), ro('se')]});
            let e = await L.openEditorial(ed, r0.id, 'r0-before');
            check('r0.waiting', 'a reviewerless round with a recommendation pending reads "Waiting for reviewers to be assigned."', statusText(e), eq(lines(e), ['Waiting for reviewers to be assigned.']));
            await recommend(se, r0.id, 'r0-recommend');
            e = await L.openEditorial(ed, r0.id, 'r0-after');
            check('r0.after', 'a reviewerless round once its only recommendation is in: which sentence', {status: statusText(e), recommendation: e.recommendation}, true);
        });
        await sect('declined', async () => {
            const r1 = await seed(j, 'r1', {participants: [...asEditor(j), ro('se')], reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'declined'}]})]});
            let e = await L.openEditorial(ed, r1.id, 'r1-before');
            check('r1.awaiting', 'only a declined reviewer and a recommendation pending: "Awaiting recommendations from editors."', statusText(e), eq(lines(e), ['Awaiting recommendations from editors.']));
            await recommend(se, r1.id, 'r1-recommend');
            e = await L.openEditorial(ed, r1.id, 'r1-after');
            check('r1.after', 'every recommending editor has recorded one: "All recommendations are in and a decision is needed."', {status: statusText(e), recommendation: e.recommendation}, eq(lines(e), ['All recommendations are in and a decision is needed.']));
        });
        await sect('underway', async () => {
            const r2 = await seed(j, 'r2', {participants: [...asEditor(j), ro('se'), ro('rec')], reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            let e = await L.openEditorial(ed, r2.id, 'r2-before');
            check('r2.underway', 'a review underway and two recommendations pending: "Awaiting responses from reviewers."', statusText(e), eq(lines(e), ['Awaiting responses from reviewers.']));
            await recommend(se, r2.id, 'r2-recommend-se');
            e = await L.openEditorial(ed, r2.id, 'r2-one');
            check('r2.one', 'one of two recommendations in, a review still underway: "New editorial recommendations have been submitted."', {status: statusText(e), recommendation: e.recommendation}, eq(lines(e), ['New editorial recommendations have been submitted.']));
            const re = await L.openEditorial(rec, r2.id, 'r2-rec-view');
            check('r2.same-box', 'the second recommending editor sees the same box', statusText(re), statusText(re) === statusText(e));
            await recommend(rec, r2.id, 'r2-recommend-rec');
            e = await L.openEditorial(ed, r2.id, 'r2-both');
            check('r2.both', 'both in, a review still underway: "All recommendations are in and a decision is needed."', {status: statusText(e), recommendation: e.recommendation}, eq(lines(e), ['All recommendations are in and a decision is needed.']));
        });
    };

    // ===========================================================================================
    // Rule 7: the revision sentences flip to "submitted" with a revised file and back when it is deleted.
    parts.status3 = async () => {
        const j = await journal('e', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        for (const [k, decision, before, after] of [
            ['rq', 'requestRevisions', 'Revisions have been requested.', 'Revisions have been submitted and a decision is needed.'],
            ['rs', 'resubmit', 'Revisions requested from the author to be taken to a new review round.', 'Revisions submitted. A new review round needs to be created.'],
        ]) {
            await sect(k, async () => {
                const s = await seed(j, k, {decisions: [FIRST, decision], participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'completed'}]})]});
                const f = L.txtNamed(`${s.tag}-rev.txt`);
                let e = await L.openEditorial(ed, s.id, `${k}-ed-requested`);
                check(`${k}.requested`, `after the decision: "${before}"`, {status: statusText(e), menu: e.menu}, eq(lines(e), [before]));
                check(`${k}.one-round`, 'the decision opens no round of its own: the menu still holds "Review Round 1" alone', e.menu.filter((m) => /^Review Round/.test(m)), eq(e.menu.filter((m) => /^Review Round/.test(m)), ['Review Round 1']));
                const t0 = await L.taskRows(au, `${k}-au-tasks-before`);
                fact(`${k}-tasks-before`, t0.rows.filter((r) => r.includes(s.title)));
                await authorUpload(au, s.id, f, `${k}-au-upload`);
                let a = await L.reread(au, `${k}-au-after-upload`);
                fact(`${k}-au-after-upload`, {status: statusText(a), buttons: a.buttons, revisions: rowsOf(a, 'Revisions Uploaded')});
                check(`${k}.upload-button`, `after the first file: is "Upload revisions" still offered (${k === 'rs' ? 'new-round variant: gone' : 'same round: stays'})`, {buttons: a.buttons, status: statusText(a)}, k === 'rs' ? !a.buttons.includes('Upload revisions') : a.buttons.includes('Upload revisions'));
                a = await L.openAuthor(au, s.id, `${k}-au-after-upload-reloaded`);
                check(`${k}.upload-button.reloaded`, '(after a reload) the same', {buttons: a.buttons, status: statusText(a)}, k === 'rs' ? !a.buttons.includes('Upload revisions') : a.buttons.includes('Upload revisions'));
                e = await L.openEditorial(ed, s.id, `${k}-ed-submitted`);
                check(`${k}.submitted`, `a revised file newer than the decision: "${after}"`, statusText(e), eq(lines(e), [after]));
                if (k === 'rs') {
                    const ai = await L.openAuthor(au, s.id, `${k}-au-panel-upload`);
                    const wf = new P.WorkflowPage(au.page, j.J);
                    await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
                    const dlg = P.uploadWizardDialog(au.page);
                    const opened = await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}).then(() => true, () => false);
                    const tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
                    await snap(au.page, `${k}-au-panel-upload-window`);
                    check(`${k}.panel-upload`, 'the Revisions Uploaded panel\'s own "Upload" still opens the same wizard', {opened, tabs, before: ai.buttons}, opened && eq(tabs, ['1. Upload File', '2. Review Details', '3. Confirm']));
                    await dlg.getByRole('link', {name: 'Cancel'}).click().catch(() => {});
                    await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                }
                const t1 = await L.taskRows(au, `${k}-au-tasks-after-upload`);
                fact(`${k}-tasks-after-upload`, t1.rows.filter((r) => r.includes(s.title)));
                e = await L.openEditorial(ed, s.id, `${k}-ed-before-delete`);
                await deleteRevision(ed, f);
                e = await L.reread(ed, `${k}-ed-after-delete`);
                fact(`${k}-after-delete-same-page`, {status: statusText(e), revisions: rowsOf(e, 'Revisions Uploaded')});
                e = await L.openEditorial(ed, s.id, `${k}-ed-after-delete-reloaded`);
                check(`${k}.flip-back`, `the file deleted: the box reads "${before}" again (read after a reload)`, {status: statusText(e), revisions: rowsOf(e, 'Revisions Uploaded')}, eq(lines(e), [before]));
                const t2 = await L.taskRows(au, `${k}-au-tasks-after-delete`);
                const mine = t2.rows.filter((r) => r.includes(s.title));
                check(`${k}.task`, 'the author\'s revisions task does not come back after the delete (A9)', {before: t0.rows.filter((r) => r.includes(s.title)), afterUpload: t1.rows.filter((r) => r.includes(s.title)), afterDelete: mine}, true);
                a = await L.openAuthor(au, s.id, `${k}-au-after-delete`);
                check(`${k}.au-button-after-delete`, 'the author\'s "Upload revisions" after the delete', {buttons: a.buttons, status: statusText(a)}, a.buttons.includes('Upload revisions'));
            });
        }
    };

    // ===========================================================================================
    // Rule 6: back from Copyediting ("Cancel Copyediting"): which sentence the round reads.
    parts.status4 = async () => {
        const j = await journal('f', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const back = async (s, label) => {
            const e = await L.openEditorial(ed, s.id, `${label}-copyediting`);
            fact(`${label}-copyediting`, {title: e.title, actions: e.actionButtons});
            await decide(ed, 'Cancel Copyediting', 'Cancel Copyediting', `${label}-cancel-copyediting`);
            await L.openEditorial(ed, s.id, `${label}-landing`);
            return L.reread(ed, `${label}-back`);
        };
        await sect('none', async () => {
            const s = await seed(j, 'n0', {decisions: [FIRST, 'accept'], participants: asEditor(j)});
            const e = await back(s, 'n0');
            check('back.none', 'moved back from Copyediting, a round with no reviewers reads "Waiting for reviewers to be assigned."', {title: e.title, status: statusText(e)}, eq(lines(e), ['Waiting for reviewers to be assigned.']));
        });
        await sect('underway', async () => {
            const s = await seed(j, 'n1', {decisions: [FIRST, 'accept'], participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            const e = await back(s, 'n1');
            check('back.underway', 'moved back, a review underway: "Awaiting responses from reviewers."', {title: e.title, status: statusText(e)}, eq(lines(e), ['Awaiting responses from reviewers.']));
        });
        await sect('confirmed', async () => {
            const s = await seed(j, 'n2', {decisions: [FIRST, 'accept'], participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'completed'}]})]});
            let e = await back(s, 'n2');
            check('back.unread', 'moved back, the round\'s review submitted and unread: "New reviews have been submitted."', {title: e.title, status: statusText(e)}, eq(lines(e), ['New reviews have been submitted.']));
            await L.editorReadReview(ed, j.n.rv1, {label: 'n2-read-review'});
            e = await L.openEditorial(ed, s.id, 'n2-confirmed');
            check('back.returned', 'moved back, every review completed and confirmed: "Returned back to review."', {title: e.title, status: statusText(e)}, eq(lines(e), ['Returned back to review.']));
            const au = await L.actor(app, j.u.au, j.J);
            const a = await L.openAuthor(au, s.id, 'n2-au-confirmed');
            check('back.author', 'the author\'s box reads the same', {author: statusText(a), editor: statusText(e)}, statusText(a) === statusText(e));
        });
        // The review confirmed before the Accept, then the return: the one order that keeps the stored status.
        await sect('confirmed-first', async () => {
            const s = await seed(j, 'n3', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'completed'}]})]});
            await L.openEditorial(ed, s.id, 'n3-unread');
            await L.editorReadReview(ed, j.n.rv1, {label: 'n3-read-review'});
            let e = await L.openEditorial(ed, s.id, 'n3-confirmed');
            fact('n3-before-accept', statusText(e));
            await decide(ed, 'Accept Submission', 'Accept Submission', 'n3-accept');
            e = await back(s, 'n3');
            check('back.confirmed-first', 'every review confirmed before the Accept, then "Cancel Copyediting": "Returned back to review."', {title: e.title, status: statusText(e)}, eq(lines(e), ['Returned back to review.']));
            const au = await L.actor(app, j.u.au, j.J);
            const a = await L.openAuthor(au, s.id, 'n3-au-back');
            check('back.confirmed-first.author', 'the author\'s box reads the same', {author: statusText(a), editor: statusText(e)}, statusText(a) === statusText(e));
        });
    };

    // ===========================================================================================
    // Rule 8: the review-files window on Round 1 and Round 2; the assigned Section Editor drives it.
    parts.files = async () => {
        const j = await journal('g', BASIC);
        const se = await L.actor(app, j.u.se, j.J);
        const sePart = [{username: j.u.se, role: 'sectionEditor'}];
        const filesDlg = (page) => page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
        const filesInfo = (page) => filesDlg(page).last().evaluate((d) => {
            const vis = (e) => e.getClientRects().length > 0;
            const boxes = [...d.querySelectorAll('input[type=checkbox]')];
            return {
                title: [...d.querySelectorAll('h1,h2,h3')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean),
                rows: boxes.filter((b) => b.name && b.name.startsWith('selectedFiles')).filter(vis).map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160)})),
                allRows: [...d.querySelectorAll('tbody tr')].filter(vis).map((tr) => (tr.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean),
                showAll: boxes.filter((b) => !(b.name || '').startsWith('selectedFiles')).map((b) => ({checked: b.checked, label: (b.closest('label') || b.parentElement)?.innerText.trim().slice(0, 120)})),
                links: [...d.querySelectorAll('a')].filter(vis).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 20),
            };
        });
        const readDialog = async (label) => {
            const fi = await filesInfo(se.page);
            await snap(se.page, label);
            fact(label, fi);
            return fi;
        };
        const close = async () => { await filesDlg(se.page).getByRole('link', {name: 'Cancel'}).click().catch(() => {}); await filesDlg(se.page).first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {}); };
        await sect('round1', async () => {
            const s = await seed(j, 'f1', {participants: sePart, files: [{file: 'article.pdf'}], reviewRounds: [round({reviewers: [], files: [{file: 'notes.md'}]})]});
            let info = await L.openEditorial(se, s.id, 'f1-round1');
            check('f1.panel', 'the panel headed "Files for Review" lists the round\'s file', rowsOf(info, 'Files for Review'), has(rowsOf(info, 'Files for Review'), 'notes.md'));
            let dlg = await P.openReviewFilesDialog(se.page);
            let fi = await readDialog('f1-dialog-open');
            check('f1.title', 'the window is "Current Review Files For Round 1", listing the round\'s own file with a checkbox', fi, has(fi.title, 'Current Review Files For Round 1') && fi.rows.length === 1 && fi.rows[0].row.includes('notes.md'));
            check('f1.mirror', 'the round\'s own file arrives unticked although the panel lists it (A7, the checkboxes do not mirror the panel)', fi.rows, fi.rows.length === 1 && fi.rows[0].checked === false);
            await P.showFilesFromAllStages(se.page, dlg);
            await dlg.getByRole('row').filter({hasText: 'article.pdf'}).first().waitFor({timeout: 30000}).catch(() => {});
            fi = await readDialog('f1-dialog-all');
            check('f1.all', 'ticking "Show files from all accessible workflow stages." adds the Submission-stage file under a row naming "Submission"', fi, has(fi.allRows, 'article.pdf') && fi.allRows.some((r) => /^Submission\b/.test(r)));
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().check();
            await P.confirmReviewFilesDialog(se.page, dlg);
            const sc = await snap(se.page, 'f1-after-tick');
            check('f1.notice', 'confirming reports "Review files updated."', sc.notices, has(sc.notices, 'Review files updated.'));
            info = await L.reread(se, 'f1-round1-two');
            check('f1.added', 'the ticked file joins the round\'s panel', rowsOf(info, 'Files for Review'), has(rowsOf(info, 'Files for Review'), 'article.pdf') && has(rowsOf(info, 'Files for Review'), 'notes.md'));
            await se.page.getByText('Review files updated.').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            dlg = await P.openReviewFilesDialog(se.page);
            fi = await readDialog('f1-dialog-reopened');
            const tickedRow = fi.rows.find((r) => r.row.includes('article.pdf'));
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().uncheck();
            await P.confirmReviewFilesDialog(se.page, dlg);
            const sc2 = await snap(se.page, 'f1-after-untick');
            info = await L.reread(se, 'f1-round1-after-untick');
            const same = rowsOf(info, 'Files for Review');
            info = await L.openEditorial(se, s.id, 'f1-round1-after-untick-reloaded');
            check('f1.untick', 'unticking a listed file and confirming: "Review files updated.", and the panel lists it exactly as before (same page and after a reload)', {box: tickedRow, notice: sc2.notices, samePage: same, reloaded: rowsOf(info, 'Files for Review')}, has(sc2.notices, 'Review files updated.') && has(same, 'article.pdf') && has(rowsOf(info, 'Files for Review'), 'article.pdf'));
        });
        await sect('round2', async () => {
            const s = await seed(j, 'f2', {decisions: [FIRST, 'newExternalReviewRound'], participants: sePart, files: [{file: 'article.pdf'}], reviewRounds: [round({reviewers: [], files: [{file: 'notes.md'}]})]});
            let info = await L.openEditorial(se, s.id, 'f2-landing');
            check('f2.lands', 'opening a submission in review lands on the current round: "Round 2"', {title: info.title, menu: info.menu}, info.title === roundTitle(2));
            check('f2.menu', 'the stage entry expands into one entry per round', info.menu, has(info.menu, 'Review Round 1') && has(info.menu, 'Review Round 2'));
            check('f2.panel', 'Round 2\'s panel does not list Round 1\'s file', rowsOf(info, 'Files for Review'), !has(rowsOf(info, 'Files for Review'), 'notes.md'));
            let dlg = await P.openReviewFilesDialog(se.page);
            let fi = await readDialog('f2-dialog-open');
            check('f2.title', 'the window is "Current Review Files For Round 2" and lists no file of its own yet', fi, has(fi.title, 'Current Review Files For Round 2') && fi.rows.length === 0);
            await P.showFilesFromAllStages(se.page, dlg);
            await dlg.getByRole('row').filter({hasText: 'article.pdf'}).first().waitFor({timeout: 30000}).catch(() => {});
            fi = await readDialog('f2-dialog-all');
            check('f2.all', 'show-all adds the Submission-stage file and never Round 1\'s review file', fi, has(fi.allRows, 'article.pdf') && !has(fi.allRows, 'notes.md'));
            const up = L.txtNamed(`${s.tag}-r2.txt`);
            await P.uploadInReviewFilesDialog(se.page, dlg, {genre: GENRE, file: up});
            fi = await readDialog('f2-dialog-uploaded');
            check('f2.upload', 'a file uploaded from the window is listed under the review stage\'s row; Round 1\'s file is not', fi, has(fi.allRows, up.name) && !has(fi.allRows, 'notes.md'));
            await P.reviewFilesCheckbox(dlg, up.name).first().check();
            await P.confirmReviewFilesDialog(se.page, dlg);
            info = await L.reread(se, 'f2-round2-after');
            fact('f2-panel-after', rowsOf(info, 'Files for Review'));
            const r1 = await L.selectMenu(se, 'Review Round 1', 'f2-round1');
            await se.page.getByText('Review files updated.').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            dlg = await P.openReviewFilesDialog(se.page);
            fi = await readDialog('f2-round1-dialog');
            check('f2.control', '(control) Round 1\'s window lists Round 1\'s own file', {title: fi.title, rows: fi.rows, panel: rowsOf(r1, 'Files for Review')}, has(fi.title, 'Current Review Files For Round 1') && fi.rows.some((r) => r.row.includes('notes.md')));
            await close();
        });
    };

    // ===========================================================================================
    // Register A6 on both apps, then Rule 2: a new Round 2 after the cancel.
    parts.a6 = async () => {
        const j = await journal('h', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const s = await seed(j, 'a6', {participants: asEditor(j), decisions: [FIRST, 'resubmit'], reviewRounds: [round({reviewers: [{username: j.u.rv2, status: 'accepted'}]})]});
        const f = L.txtNamed(`${s.tag}-revised.txt`);
        await sect('a6', async () => {
            let info = await L.openEditorial(ed, s.id, 'a6-requested');
            const wf = new P.WorkflowPage(ed.page, j.J);
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
            await P.uploadViaWizard(ed.page, {genre: GENRE, file: f});
            info = await L.openEditorial(ed, s.id, 'a6-submitted');
            fact('a6-before-round2', statusText(info));
            await decide(ed, 'Create New Review Round', null, 'a6-newround');
            info = await L.reread(ed, 'a6-round2');
            fact('a6-round2', {title: info.title, menu: info.menu, actions: info.actionButtons});
            await decide(ed, 'Cancel Review Round', 'Cancel Review Round', 'a6-cancel');
            info = await L.reread(ed, 'a6-restored');
            check('a6', 'A6: after Round 2 is cancelled, the restored Round 1 reads "Awaiting responses from reviewers." although its revision request stands and the revised file is still listed', {title: info.title, status: statusText(info), revisions: rowsOf(info, 'Revisions Uploaded')},
                eq(info.status, {heading: 'Round 1 Status', lines: ['Awaiting responses from reviewers.']}) && has(rowsOf(info, 'Revisions Uploaded'), f.name));
            info = await L.openEditorial(ed, s.id, 'a6-restored-reloaded');
            check('a6.reloaded', '(after a reload) the same', statusText(info), eq(lines(info), ['Awaiting responses from reviewers.']));
            await decide(ed, 'Create New Review Round', null, 'a6-newround-again');
            info = await L.reread(ed, 'a6-round2-again');
            check('renumber', 'a new round after the cancel is "Review Round 2" again; rounds are numbered from 1 without gaps', {title: info.title, menu: info.menu.filter((m) => /^Review Round/.test(m))}, info.title === roundTitle(2) && eq(info.menu.filter((m) => /^Review Round/.test(m)), ['Review Round 1', 'Review Round 2']));
        });
    };

    // ===========================================================================================
    // Actors rows "Read a completed review" (fn v2) and "Open the editor's letters", on both apps.
    parts.v2 = async () => {
        const roles = [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']];
        const J = tag('u26vk1v');
        const u = Object.fromEntries(roles.map(([k]) => [k, `${J}${k}`]));
        const n = Object.fromEntries(roles.map(([k, g, f]) => [k, `${g} ${f}`]));
        await app.api.createContext({tag: J, review: {defaultReviewMode: 'open'}, users: roles.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]}))});
        const j = {J, u, n};
        fact('journal-v', J);
        const s = await seed(j, 'v', {participants: asEditor(j), reviewRounds: [round({reviewers: [{username: u.rv1, status: 'accepted'}]})]});
        const ed = await L.actor(app, u.ed, J);
        const au = await L.actor(app, u.au, J);
        const rv = await L.actor(app, u.rv1, J);
        const authorSees = (ai) => ({reviewers: rowsOf(ai, 'Reviewers'), readReview: ai.buttons.filter((b) => b === 'Read Review').length, status: statusText(ai)});
        const readAsAuthor = async (label) => {
            const row = au.page.getByRole('row').filter({hasText: n.rv1}).first();
            await row.getByRole('button', {name: 'Read Review', exact: true}).click();
            const win = au.page.getByRole('dialog').filter({has: au.page.locator('form#readReviewForm')});
            await win.locator('form#readReviewForm').waitFor({timeout: 45000});
            await idle(au.page);
            await L.settled(au.page, win.locator('form#readReviewForm')).catch(() => {});
            // Read without the attachments section (register A3: nothing of that section is recorded).
            const data = await win.last().evaluate((d) => {
                const vis = (e) => e.getClientRects().length > 0;
                const whole = (d.textContent || '').replace(/\s+/g, ' ').trim();
                const cut = whole.indexOf('Reviewer Files');
                return {title: [...d.querySelectorAll('h1,h2')].filter(vis).map((h) => h.innerText.trim()).filter(Boolean), text: (cut >= 0 ? whole.slice(0, cut) : whole).slice(0, 900), inputs: d.querySelectorAll('textarea, input[type=text]').length};
            });
            L.record(`${L.state.part}-${label}`, data);
            await shotSafe(au.page, label);
            await win.getByRole('button', {name: 'Close', exact: true}).first().click();
            await win.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            return data;
        };
        const shotSafe = (page, label) => L.shot(page, `${L.state.part}-${label}`).catch(() => {});
        let ai;
        await sect('underway', async () => {
            ai = await L.openAuthor(au, s.id, 'au-underway');
            check('underway', 'an open review accepted, not submitted: no reviewers list in the author view', authorSees(ai), ai.headings.every((h) => !/Reviewers/.test(h)) && !rowsOf(ai, 'Reviewers'));
        });
        await sect('submit', async () => {
            // The reviewer's wizard; a press has no recommendation list at step 3.
            const page = rv.page;
            await page.goto(`/index.php/${J}/reviewer/submission/${s.id}`);
            const save = page.getByRole('button', {name: 'Save and continue', exact: true});
            const step3 = page.getByRole('button', {name: 'Continue to Step #3'});
            const submit = page.getByRole('button', {name: 'Submit Review', exact: true});
            await submit.or(step3).or(save).filter({visible: true}).first().waitFor({timeout: 45000});
            if (await save.filter({visible: true}).count()) {
                const privacy = page.locator('input[name="privacyConsent"]').filter({visible: true});
                if (await privacy.count()) await privacy.check();
                await save.filter({visible: true}).first().click();
            }
            await step3.or(submit).filter({visible: true}).first().waitFor({timeout: 45000});
            if (await step3.filter({visible: true}).count()) await step3.filter({visible: true}).first().click();
            await submit.filter({visible: true}).waitFor({timeout: 45000});
            await idle(page);
            const type = async (selector, text) => {
                const iframe = page.locator(selector).first();
                await iframe.waitFor({timeout: 30000});
                const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
                await page.waitForFunction((eid) => { const m = window.tinyMCE || window.tinymce; return !!(m && m.get(eid) && m.get(eid).initialized); }, id, {timeout: 30000});
                const body = iframe.contentFrame().locator('body');
                await body.click();
                await body.pressSequentially(text);
            };
            await type('iframe[id^="comments"]:not([id^="commentsPrivate"])', 'Shared remark for the author.');
            await type('iframe[id^="commentsPrivate"]', 'Private remark for the editor.');
            const sel = page.locator('select[name="recommendation"], select[name="reviewerRecommendationId"]').filter({visible: true});
            fact('recommendation-list', (await sel.count()) ? await sel.first().evaluate((x) => [...x.options].map((o) => o.text.trim())) : 'none on the screen');
            if (await sel.count()) await sel.first().selectOption({label: 'Accept Submission'});
            await snap(page, 'rv-step3');
            await submit.filter({visible: true}).click();
            await page.getByRole('button', {name: 'OK', exact: true}).click();
            await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 45000});
            ai = await L.openAuthor(au, s.id, 'au-submitted');
            check('submitted', 'submitted, no editor has confirmed it: the author lists the reviewer with "Read Review"', authorSees(ai), has(rowsOf(ai, 'Reviewers'), n.rv1) && authorSees(ai).readReview === 1);
            const w = await readAsAuthor('au-read-before-confirm');
            fact('author-window-before-confirm', w);
            check('window', `the window is titled "Review: ${s.title}", names the reviewer, "Completed:"; ${omp ? 'no "Recommendation:" line' : '"Recommendation:"'}; the shared remark only; nothing to type`, w,
                has(w.title, `Review: ${s.title}`) && w.text.includes(n.rv1) && /Completed:/.test(w.text) && (omp ? !/Recommendation:/.test(w.text) : /Recommendation:\s*Accept Submission/.test(w.text)) && w.text.includes('Shared remark for the author.') && !w.text.includes('Private remark for the editor.') && w.inputs === 0);
        });
        await sect('confirm', async () => {
            await L.openEditorial(ed, s.id, 'ed-before-confirm');
            const win = await L.editorReadReview(ed, n.rv1, {label: 'ed-read-review'});
            fact('editor-window', {title: win.title, buttons: win.buttons, kind: win.kind});
            check('editor.window', `the editor's "Read Review" window is titled "Review: ${s.title}" and confirms with "Confirm"`, {title: win.title, buttons: win.buttons}, has(win.title, `Review: ${s.title}`) && has(win.buttons, 'Confirm') && win.text.includes('Private remark for the editor.'));
            ai = await L.openAuthor(au, s.id, 'au-confirmed');
            const w = await readAsAuthor('au-read-after-confirm');
            check('after-confirm', 'after the editor\'s "Confirm" nothing changes for the author', {list: authorSees(ai), text: w.text.slice(0, 200)}, has(rowsOf(ai, 'Reviewers'), n.rv1) && w.text.includes('Shared remark for the author.'));
        });
        await sect('letters', async () => {
            ai = await L.openAuthor(au, s.id, 'au-no-letter');
            check('letters.none', 'with no letter from an editor yet, the author view has no "Notifications" list', ai.headings, !has(ai.headings, 'Notifications'));
            await L.openEditorial(ed, s.id, 'ed-before-request');
            await requestRevisions(ed, {newRound: false}, 'letter');
            ai = await L.openAuthor(au, s.id, 'au-letter');
            const heading = au.page.getByRole('heading', {name: 'Notifications', exact: true});
            const list = au.page.locator('div').filter({has: heading}).last();
            const items = await list.getByRole('listitem').allInnerTexts().then((x) => x.map((y) => flat(y, 200)));
            check('letters.list', 'the "Notifications" list holds the decision letter as a subject line and a date', items, items.length === 1 && /\d{4}-\d{2}-\d{2}/.test(items[0]));
            const link = list.getByRole('listitem').first().locator('a, button').first();
            const subject = flat(await link.innerText());
            await link.click();
            const win = au.page.getByRole('dialog').filter({hasText: subject}).last();
            await win.waitFor({timeout: 30000}); await idle(au.page);
            const sc = await snap(au.page, 'au-letter-open');
            const boxes = await win.locator('textarea:visible, input[type=text]:visible, [contenteditable=true]:visible').count();
            const btns = await win.locator('button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)));
            check('letters.open', 'the letter opens read-only in a side window: no box to type in, no reply control', {subject, boxes, buttons: btns, text: flat(sc.text.dialog, 300)}, boxes === 0 && !btns.some((b) => /Reply|Send/i.test(b)));
            await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        });
        await sect('anonymous', async () => {
            const k = await journal('w', BASIC);
            const c = await seed(k, 'c', {participants: asEditor(k), reviewRounds: [round({reviewers: [{username: k.u.rv1, status: 'completed'}]})]});
            const au2 = await L.actor(app, k.u.au, k.J);
            const ci = await L.openAuthor(au2, c.id, 'anon-au');
            check('control', '(control) an anonymous review submitted: the author sees no reviewers list', {headings: ci.headings, reviewers: rowsOf(ci, 'Reviewers')}, !rowsOf(ci, 'Reviewers') && ci.buttons.every((b) => b !== 'Read Review'));
        });
    };

    // ===========================================================================================
    // Rule 4's past-round texts, in review and after the Accept (Rules 1, 3, 4).
    parts.past = async () => {
        const j = await journal('k', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        await sect('in-review', async () => {
            const s = await seed(j, 'p1', {decisions: [FIRST, 'newExternalReviewRound'], participants: asEditor(j)});
            const cur = await L.openEditorial(ed, s.id, 'p1-current');
            check('p1.current', 'the current round (Round 2) is headed "Round 2 Status"', statusText(cur), !!cur.status && cur.status.heading === 'Round 2 Status');
            const r1 = await L.selectMenu(ed, 'Review Round 1', 'p1-round1');
            check('p1.past', 'a past round, headed plain "Status", reads "The submission has been advanced to the next round of review"', statusText(r1), eq(r1.status, {heading: 'Status', lines: ['The submission has been advanced to the next round of review']}));
            const a = await L.openAuthor(au, s.id, 'p1-au-current');
            const ar1 = await L.selectMenu(au, 'Review Round 1', 'p1-au-round1');
            check('p1.author', 'the author\'s past-round box is the editor\'s', {author: statusText(ar1), editor: statusText(r1), current: statusText(a)}, statusText(ar1) === statusText(r1));
        });
        await sect('accepted', async () => {
            const s = await seed(j, 'p2', {decisions: [FIRST, 'newExternalReviewRound', 'accept'], participants: asEditor(j)});
            await L.openEditorial(ed, s.id, 'p2-landing');
            const r2 = await L.selectMenu(ed, 'Review Round 2', 'p2-round2');
            check('p2.last', 'the last round after the Accept reads "The submission is currently in the Copyediting stage." under "Status"', statusText(r2), eq(r2.status, {heading: 'Status', lines: ['The submission is currently in the Copyediting stage.']}));
            const r1 = await L.selectMenu(ed, 'Review Round 1', 'p2-round1');
            check('p2.past', 'an earlier round after the Accept reads "The submission advanced to the next review round, was accepted, and is currently in the Copyediting stage."', statusText(r1), eq(r1.status, {heading: 'Status', lines: ['The submission advanced to the next review round, was accepted, and is currently in the Copyediting stage.']}));
            check('p2.rounds', 'every round stays listed in the menu after the stage is left', r1.menu.filter((m) => /^Review Round/.test(m)), eq(r1.menu.filter((m) => /^Review Round/.test(m)), ['Review Round 1', 'Review Round 2']));
        });
    };

    // ===========================================================================================
    // Rule 2 (Round 1 opens with the decision that sends to review) and the recommend-only rows (Actors 52-53).
    parts.send = async () => {
        const j = await journal('m', BASIC);
        const ed = await L.actor(app, j.u.ed, j.J);
        await sect('send', async () => {
            const s = await seed(j, 's0', {decisions: [], reviewRounds: [], participants: asEditor(j)});
            const i = await L.openEditorial(ed, s.id, 'send-submission');
            fact('submission-actions', i.actionButtons);
            const label = omp ? 'Send to External Review' : 'Send for Review';
            check('send.offered', `the Submission stage offers "${label}"`, i.actionButtons, has(i.actionButtons, label));
            await decide(ed, label, label, 'send');
            const r = await L.reread(ed, 'send-round1');
            check('send.round1', 'the decision opens Round 1: the menu holds "Review Round 1" and the box reads "Waiting for reviewers to be assigned."', {title: r.title, menu: r.menu, status: statusText(r)}, r.title === roundTitle(1) && has(r.menu, 'Review Round 1') && eq(lines(r), ['Waiting for reviewers to be assigned.']));
        });
        await sect('sole', async () => {
            const s = await seed(j, 'so', {participants: [{username: j.u.se, role: 'sectionEditor', recommendOnly: true}], reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            const se = await L.actor(app, j.u.se, j.J);
            const i = await L.openEditorial(se, s.id, 'sole-se');
            check('sole.buttons', 'a recommending editor with no deciding editor on the stage gets no recommendation buttons and no decision buttons', i.actionButtons, !(i.actionButtons || []).length);
            check('sole.box', 'the "Recommendation" box carries the guard text', i.recommendation, /You can not make a recommendation until an editor is assigned with permission to record a decision\./.test(i.recommendation || ''));
            const d = await seed(j, 'sd', {participants: [...asEditor(j), {username: j.u.se, role: 'sectionEditor', recommendOnly: true}], reviewRounds: [round({reviewers: [{username: j.u.rv1, status: 'accepted'}]})]});
            const e = await L.openEditorial(ed, d.id, 'sole-ed-before');
            check('rec.control', 'the deciding editor sees no "Recommendation" box before a recommendation is recorded', e.recommendation, !e.recommendation);
            const si = await L.openEditorial(se, d.id, 'sole-se-with-ed');
            check('rec.buttons', 'with a deciding editor assigned the recommending editor gets "Recommend Revisions", "Recommend Accept", "Recommend Decline" and no decision button', si.actionButtons, eq(si.actionButtons, ['Recommend Revisions', 'Recommend Accept', 'Recommend Decline']));
        });
    };

    for (const name of PARTS) {
        if (!parts[name]) { log(`unknown part ${name}`); continue; }
        if (isOps && name !== 'ops') continue;
        if (!isOps && name === 'ops') continue;
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
