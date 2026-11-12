// U26 "Review stage & rounds" on stable-3_5_0: claim check chunk K2 (spec body Rules 10-17, register
// A8, the retired A12 and OJS1). Spec: lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md.
//
// Run (the 3.5 fleets up: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature U26-stable-3_5_0):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=U26-stable-3_5_0 PROBE_AGENT=ccK2 PROBE_RUN=s1 PARTS=past,decisions \
//       node bin/probe.js omp lines/stable-3_5_0/shared/playwright/checks/U26-stable-3_5_0/K2/k2.js
//
// PROBE_RUN names the run (s1, then s2: every fact is read twice, each run on its own scratch journals or
// presses). PARTS picks the parts (default all; a part takes one to four minutes, so run two or three per
// call). Apps: OJS and OMP for every part; OPS runs `old` only (a preprint server has no review stage).
// Every part builds its own scratch context with throwaway accounts; nothing on `publicknowledge` or the
// seeded roster is touched. Needs Mailpit (`past` reads the invitation sent from a past round).
//
//   past       Rule 10 / A8: a past round's decision buttons, panels and their controls; a reviewer added
//              and a file uploaded there; read as the deciding editor, a Section editor and the Author
//   decisions  Rule 11: the button roster per reviewer state and per permission level (Journal editor,
//              Section editor, Journal manager, Site Administrator), "Request Revisions"' choice window
//              (left once with the other choice ticked), the declined state, "Delete" and "Revert Decline"
//   rounds     Rule 12: "Create New Review Round" (its file step), "Cancel Review Round" on Round 2 (the
//              reviewer's lists, the restored round, the files) and on Round 1 (back to Submission)
//   rec        Rule 13: recommend-only editors, the "Recommendation" box, the three sentences
//   author     Rules 14-16 (+ v1, v2, retired A12 and OJS1): the author's view per round and state, an
//              open and an anonymous review, a form review, the "Notifications" list
//   old        Rule 17 and footnote o: the old addresses and the two legacy grids' own addresses, every
//              form and reader; on OPS the preprint's. Lives in old.js (required from here).
//
// Outputs: .reports/U26-stable-3_5_0/ccK2/<part>-<screen>-<run>-<app>.json (+ .png), and per part
// `<part>-checks-<run>-<app>.json`: one row per claim read, what the spec says, what the screen gave,
// `same`. Helpers: ./lib.js (and ../W1/lib.js, the version's apps/ojs/playwright/pages/ReviewStagePages.js).
const path = require('path');
const L = require('../W1/lib');
const K = require('./lib');
const {forEachApp, check, fact, sect, snap, flat, log, idle, statusText, rowsOf, note} = L;
const {DECISIONS, RECOMMEND, has, eq, sleep, bits, journal, seed, finishDecision, decide, promoteBoxes, openChoice,
    reviewerDo, reviewerLists, authorReadReview, authorSees} = K;

const ALL = ['past', 'decisions', 'rounds', 'rec', 'author', 'old'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const CANCEL_RESTRICTION = 'Can only cancel review round if no associated reviewer has any completed or submitted review available.';

forEachApp(async (app) => {
    const B = bits(app);
    const {P, GENRE, SEND} = B;
    const parts = {};
    const asEd = (j) => [{username: j.u.ed, role: 'editor'}];
    const sql = (q) => L.sql(app, q).split('\n').filter(Boolean);
    const dialogText = async (a) => flat(await a.page.locator('[role=dialog]').first().innerText().catch(() => ''), 4000);

    // ===========================================================================================
    // Rule 10 / A8: a past round.
    parts.past = async () => {
        const j = await journal(app, 'p');
        const s = await seed(app, j, 'p', {decisions: [...SEND, 'newExternalReviewRound'],
            reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}],
            participants: [...asEd(j), {username: j.u.se, role: 'sectionEditor'}]});
        const f = L.txtNamed(`${s.tag}-past.txt`);
        const ed = await L.actor(app, j.u.ed, j.J);
        const wf = new P.WorkflowPage(ed.page, j.J);
        const t0 = new Date(Date.now() - 2000);
        let r1, r2;
        await sect('read', async () => {
            r2 = await L.openEditorial(ed, s.id, 'ed-round2');
            fact('round2', {title: r2.title, menu: r2.menu, status: statusText(r2), actions: r2.actionButtons});
            check('current.buttons', 'the current round shows the five decision buttons', r2.actionButtons, eq(r2.actionButtons, DECISIONS));
            r1 = await L.selectMenu(ed, 'Review Round 1', 'ed-round1');
            fact('round1', {title: r1.title, status: statusText(r1), headings: r1.headings, buttons: r1.buttons, actions: r1.actionButtons, tables: r1.tables});
            check('past.buttons', 'a past round shows no decision button', r1.actionButtons, !(r1.actionButtons || []).some((b) => DECISIONS.includes(b)) && !(r1.buttons || []).some((b) => DECISIONS.includes(b)));
            check('past.panels', 'a past round shows its own reviewers (rv1) and its file panels', {reviewers: rowsOf(r1, 'Reviewers'), tables: (r1.tables || []).map((t) => t.name)}, has(rowsOf(r1, 'Reviewers'), j.n.rv1) && rowsOf(r1, 'Files for Review') !== null && rowsOf(r1, 'Revisions Uploaded') !== null);
            check('past.controls', 'the panels keep Upload, Upload/Select Files, Add Reviewer, Assign', r1.buttons, ['Upload', 'Upload/Select Files', 'Add Reviewer', 'Assign'].every((b) => (r1.buttons || []).includes(b)));
        });
        await sect('files-dialog', async () => {
            const dlg = await P.openReviewFilesDialog(ed.page);
            const title = await dlg.locator('h1,h2,h3').allInnerTexts().catch(() => []);
            await snap(ed.page, 'ed-round1-files-dialog');
            fact('past-files-dialog', {title: title.map((x) => flat(x)), text: flat(await dlg.innerText().catch(() => ''), 600)});
            await dlg.getByRole('link', {name: 'Cancel'}).click().catch(() => dlg.getByRole('button', {name: 'Close', exact: true}).first().click());
            await dlg.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(600);
        });
        await sect('assign-window', async () => {
            await ed.page.getByRole('button', {name: 'Assign', exact: true}).click();
            const modal = ed.page.getByRole('dialog').filter({has: ed.page.locator('select[name="filterUserGroupId"]')});
            await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
            await idle(ed.page);
            await snap(ed.page, 'ed-round1-assign');
            fact('past-assign-roster', await modal.locator('select[name="filterUserGroupId"] option').allInnerTexts().then((x) => x.map((y) => flat(y))));
            await modal.getByRole('link', {name: 'Cancel'}).click().catch(() => modal.getByRole('button', {name: 'Close', exact: true}).first().click());
            await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(600);
        });
        await sect('act', async () => {
            await P.addReviewer(ed.page, j.n.rv2);
            r1 = await L.reread(ed, 'ed-round1-reviewer');
            check('a8.reviewer.same-page', 'A8: a reviewer added on the past round lands in that round (same page)', rowsOf(r1, 'Reviewers'), has(rowsOf(r1, 'Reviewers'), j.n.rv2));
            await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
            await P.uploadViaWizard(ed.page, {genre: GENRE, file: f});
            r1 = await L.reread(ed, 'ed-round1-file');
            check('a8.file.same-page', 'A8: a file uploaded on the past round lands in its Revisions Uploaded (same page)', rowsOf(r1, 'Revisions Uploaded'), has(rowsOf(r1, 'Revisions Uploaded'), f.name));
            check('a8.status', 'A8: the past round still reads "The submission has been advanced to the next round of review"', statusText(r1), eq(r1.status, {heading: 'Status', lines: ['The submission has been advanced to the next round of review']}));
            r2 = await L.openEditorial(ed, s.id, 'ed-round2-after');
            check('a8.round2', 'A8: Round 2\'s panels stay empty', {reviewers: rowsOf(r2, 'Reviewers'), revisions: rowsOf(r2, 'Revisions Uploaded')}, eq(rowsOf(r2, 'Reviewers'), ['No Items']) && eq(rowsOf(r2, 'Revisions Uploaded'), ['No Items']));
            r1 = await L.selectMenu(ed, 'Review Round 1', 'ed-round1-reloaded');
            check('a8.reload', 'A8: after a reload, Round 1 still lists the added reviewer and the file', {reviewers: rowsOf(r1, 'Reviewers'), revisions: rowsOf(r1, 'Revisions Uploaded')}, has(rowsOf(r1, 'Reviewers'), j.n.rv2) && has(rowsOf(r1, 'Revisions Uploaded'), f.name));
            fact('rounds-db', sql(`select review_round_id, round, status from review_rounds where submission_id = ${s.id} order by round`));
            fact('assignments-db', sql(`select review_id, review_round_id, round, date_notified is not null as notified from review_assignments where submission_id = ${s.id} order by review_id`));
            let m = null;
            try { m = await app.mail.find({to: `${j.u.rv2}@mail.test`, since: t0, timeoutMs: 20000}); } catch (e) { m = null; }
            fact('a8-invitation-mail', m ? {subject: m.Subject, from: m.From && m.From.Address} : null);
            check('a8.live', 'A8: the invitation is live: the reviewer is mailed and lists the request', m ? m.Subject : null, !!m);
            const rv2 = await L.actor(app, j.u.rv2, j.J);
            const lists = await reviewerLists(rv2, 'rv2');
            fact('a8-rv2-lists', lists);
            check('a8.rv-list', 'A8: the reviewer\'s "Action Required by me" lists the request', lists['reviewer-action-required'], has(lists['reviewer-action-required'], s.title));
        });
        await sect('levels', async () => {
            const se = await L.actor(app, j.u.se, j.J);
            await L.openEditorial(se, s.id, 'se-round2');
            const x = await L.selectMenu(se, 'Review Round 1', 'se-round1');
            check('se.past', 'a Section editor on the past round: no decision buttons; the panel controls stay', {actions: x.actionButtons, buttons: x.buttons}, !(x.buttons || []).some((b) => DECISIONS.includes(b)) && ['Upload', 'Add Reviewer'].every((b) => (x.buttons || []).includes(b)));
            const au = await L.actor(app, j.u.au, j.J);
            const a2 = await L.openAuthor(au, s.id, 'au-round2');
            const a1 = await L.selectMenu(au, 'Review Round 1', 'au-round1');
            fact('author-rounds', {round2: authorSees(a2), round1: authorSees(a1), menu: a1.menu});
        });
    };

    // ===========================================================================================
    // Rule 11: the decision buttons.
    parts.decisions = async () => {
        const j = await journal(app, 'd');
        const p = [...asEd(j), {username: j.u.se, role: 'sectionEditor'}];
        const S = {};
        S.inv = await seed(app, j, 'inv', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'invited'}]}]});
        S.none = await seed(app, j, 'none', {participants: p});
        S.dec = await seed(app, j, 'dec', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'declined'}]}]});
        S.acc = await seed(app, j, 'acc', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        S.done = await seed(app, j, 'done', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        S.mix = await seed(app, j, 'mix', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv2, status: 'declined'}, {username: j.u.rv3, status: 'invited'}]}]});
        S.declined = await seed(app, j, 'declined', {decisions: [...SEND, 'decline'], participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'invited'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        await sect('roster', async () => {
            for (const k of ['inv', 'none', 'dec', 'acc', 'done', 'mix']) {
                const info = await L.openEditorial(ed, S[k].id, `ed-${k}`);
                const text = await dialogText(ed);
                fact(`ed-${k}`, {status: statusText(info), actions: info.actionButtons, reviewers: rowsOf(info, 'Reviewers')});
                if (k === 'inv') {
                    // Which decision button is drawn as the primary one (the ui-library's primary class).
                    const styles = await ed.page.locator('[data-cy="workflow-action-items"] button').evaluateAll((bs) => bs.map((b) => ({label: b.innerText.trim(), primary: /(^|\s)bg-primary(\s|$)|isPrimary/.test(b.className), cls: b.className.replace(/\s+/g, ' ').slice(0, 160)})));
                    fact('action-styles', styles);
                    check('highlighted', '"Accept Submission" is the highlighted (primary) one, and the only one', styles, styles.filter((x) => x.primary).map((x) => x.label).join() === 'Accept Submission');
                }
                const offered = ['inv', 'none'].includes(k);
                check(`roster.${k}`, offered ? 'the five decision buttons, "Cancel Review Round" among them' : '"Cancel Review Round" absent, the other four offered',
                    info.actionButtons, eq(info.actionButtons, offered ? DECISIONS : DECISIONS.filter((d) => d !== 'Cancel Review Round')));
                if (!offered) check(`nothing.${k}`, 'nothing stands in the button\'s place (no "Cancel Review Round" text, no restriction text)', {cancelText: /Cancel Review Round/.test(text), restriction: text.includes(CANCEL_RESTRICTION)}, !/Cancel Review Round/.test(text) && !text.includes(CANCEL_RESTRICTION));
            }
        });
        await sect('levels', async () => {
            const who = {se: await L.actor(app, j.u.se, j.J), mgr: await L.actor(app, j.u.mgr, j.J), admin: await L.actor(app, 'admin', j.J)};
            for (const [k, a] of Object.entries(who)) {
                const i1 = await L.openEditorial(a, S.inv.id, `${k}-inv`);
                const i2 = await L.openEditorial(a, S.done.id, `${k}-done`);
                fact(`${k}-buttons`, {inv: i1.actionButtons, done: i2.actionButtons, invStatus: statusText(i1)});
                check(`level.${k}`, `${k}: the same roster as the Journal editor (five on an unanswered round, four once a review is in)`, {inv: i1.actionButtons, done: i2.actionButtons}, eq(i1.actionButtons, DECISIONS) && eq(i2.actionButtons, DECISIONS.filter((d) => d !== 'Cancel Review Round')));
            }
        });
        await sect('choice', async () => {
            await L.openEditorial(ed, S.acc.id, 'ed-acc-choice');
            let c = await openChoice(ed, 'choice-open');
            fact('choice-open', {radios: c.radios, buttons: c.buttons});
            check('choice.radios', '"Require New Review Round": "Revisions will not be subject…" preselected, "Revisions will be subject…" second',
                c.radios, c.radios.length === 2 && c.radios[0].label === 'Revisions will not be subject to a new round of peer reviews.' && c.radios[0].checked && c.radios[1].label === 'Revisions will be subject to a new round of peer reviews.' && !c.radios[1].checked);
            // Left once with the other choice ticked, then opened again.
            await c.modal.getByRole('radio', {name: 'Revisions will be subject to a new round of peer reviews.'}).check();
            const closer = c.modal.getByRole('button', {name: /^(Cancel|Close)$/}).first();
            const closeLabel = flat(await closer.innerText().catch(() => null));
            await closer.click();
            await c.modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(700);
            await idle(ed.page);
            await snap(ed.page, 'choice-after-close');
            c = await openChoice(ed, 'choice-reopened');
            fact('choice-reopened', {closedWith: closeLabel, radios: c.radios, dialogs: ed.nativeDialogs.slice()});
            await c.modal.getByRole('radio', {name: 'Revisions will be subject to a new round of peer reviews.'}).check();
            await c.modal.getByRole('button', {name: 'Next', exact: true}).click();
            await ed.page.waitForURL(/decision\/record/, {timeout: 45000});
            await ed.page.getByRole('heading', {level: 1}).first().waitFor({timeout: 45000});
            await idle(ed.page);
            const h1 =flat(await ed.page.getByRole('heading', {level: 1}).first().innerText().catch(() => null));
            await snap(ed.page, 'choice-newround-wizard');
            check('choice.newround', 'the new-round choice continues under the wizard name "Resubmit for Review"', h1, /^Resubmit for Review/.test(h1 || ''));
            await L.openEditorial(ed, S.acc.id, 'ed-acc-after-wizard-left');
            c = await openChoice(ed, 'choice-again');
            await c.modal.getByRole('button', {name: 'Next', exact: true}).click();
            await ed.page.waitForURL(/decision\/record/, {timeout: 45000});
            await ed.page.getByRole('heading', {level: 1}).first().waitFor({timeout: 45000});
            await idle(ed.page);
            const h2 = flat(await ed.page.getByRole('heading', {level: 1}).first().innerText().catch(() => null));
            await snap(ed.page, 'choice-plain-wizard');
            check('choice.plain', 'the preselected choice continues under "Request Revisions"', h2, /^Request Revisions/.test(h2 || ''));
            fact('choice-wizard-dialogs', ed.nativeDialogs.slice());
        });
        await sect('declined', async () => {
            const who = {ed, se: await L.actor(app, j.u.se, j.J), mgr: await L.actor(app, j.u.mgr, j.J), admin: await L.actor(app, 'admin', j.J)};
            const got = {};
            for (const [k, a] of Object.entries(who)) {
                const info = await L.openEditorial(a, S.declined.id, `${k}-declined`);
                got[k] = {actions: info.actionButtons, status: statusText(info)};
            }
            fact('declined-buttons', got);
            check('declined.se', 'declined, Section editor: "Revert Decline" alone', got.se.actions, eq(got.se.actions, ['Revert Decline']));
            check('declined.ed', 'declined, Journal editor (manager-level): "Revert Decline" and "Delete"', got.ed.actions, eq(got.ed.actions, ['Revert Decline', 'Delete']));
            check('declined.mgr', 'declined, Journal manager: "Revert Decline" and "Delete"', got.mgr.actions, eq(got.mgr.actions, ['Revert Decline', 'Delete']));
            check('declined.admin', 'declined, Site Administrator: "Revert Decline" and "Delete"', got.admin.actions, eq(got.admin.actions, ['Revert Decline', 'Delete']));
            // "Delete", answered "Cancel"/"No"
            await L.openEditorial(ed, S.declined.id, 'ed-declined-again');
            await ed.page.getByRole('button', {name: 'Delete', exact: true}).click();
            const conf = ed.page.getByRole('dialog').filter({hasText: /delete/i}).last();
            await conf.waitFor({timeout: 30000});
            await idle(ed.page);
            const cs = await snap(ed.page, 'ed-delete-confirm');
            const cbuttons = await conf.locator('button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)));
            fact('delete-confirm', {text: flat(cs.text && cs.text.dialog, 400), buttons: cbuttons});
            await conf.getByRole('button', {name: /^(Cancel|No)$/}).first().click();
            await sleep(700);
            const after = await L.openEditorial(ed, S.declined.id, 'ed-declined-after-cancel');
            check('delete.cancel', 'answering the delete question "Cancel" leaves the submission declined, its buttons in place', after.actionButtons, eq(after.actionButtons, ['Revert Decline', 'Delete']));
            // "Revert Decline" as the Section editor
            await L.openEditorial(who.se, S.declined.id, 'se-declined-before-revert');
            await decide(app, who.se, 'Revert Decline', 'revert');
            const rv = await L.reread(who.se, 'se-reverted');
            fact('reverted', {status: statusText(rv), actions: rv.actionButtons});
            check('revert', 'Revert Decline restores the decision buttons (the round\'s one reviewer unanswered: all five)', rv.actionButtons, eq(rv.actionButtons, DECISIONS));
        });
    };

    // ===========================================================================================
    // Rule 12: creating and cancelling rounds.
    parts.rounds = async () => {
        const j = await journal(app, 'r');
        const rs = await seed(app, j, 'rs', {decisions: [...SEND, 'resubmit'], participants: asEd(j),
            reviewRounds: [{files: [{file: 'notes.md'}], reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        const r1 = await seed(app, j, 'r1', {participants: asEd(j), reviewRounds: [{files: [{file: 'notes.md'}], reviewers: [{username: j.u.rv3, status: 'invited'}]}]});
        const r0 = await seed(app, j, 'r0', {participants: asEd(j), reviewRounds: [{reviewers: []}]});
        const f = L.pdfNamed(`${rs.tag}-revised.pdf`);
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        let info;
        await sect('create', async () => {
            await L.openAuthor(au, rs.id, 'au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            await P.uploadViaWizard(au.page, {genre: GENRE, file: f});
            info = await L.openEditorial(ed, rs.id, 'ed-revised');
            fact('before-create', {status: statusText(info), files: rowsOf(info, 'Files for Review'), revisions: rowsOf(info, 'Revisions Uploaded')});
            const offered = [];
            await ed.page.getByRole('button', {name: 'Create New Review Round', exact: true}).click();
            await finishDecision(app, ed, 'newround', {onStep: async (i) => { const b = await promoteBoxes(ed.page); if (b.length) offered.push({step: i + 1, boxes: b}); }});
            fact('newround-file-step', offered);
            const box = offered.flatMap((o) => o.boxes).find((b) => b.label.includes(f.name));
            check('create.ticked', 'the wizard offers the previous round\'s revised file, already ticked', offered, !!box && box.checked === true);
            info = await L.reread(ed, 'ed-round2');
            fact('round2', {title: info.title, menu: info.menu, status: statusText(info), files: rowsOf(info, 'Files for Review'), reviewers: rowsOf(info, 'Reviewers'), revisions: rowsOf(info, 'Revisions Uploaded'), actions: info.actionButtons});
            check('create.round2', 'Round 2 opens: "Review Round 2" in the menu, the box "Round 2 Status — Waiting for reviewers to be assigned.", no reviewer, the carried file under review',
                {menu: info.menu, status: statusText(info), reviewers: rowsOf(info, 'Reviewers'), files: rowsOf(info, 'Files for Review')},
                has(info.menu, 'Review Round 2') && eq(info.status, {heading: 'Round 2 Status', lines: ['Waiting for reviewers to be assigned.']}) && eq(rowsOf(info, 'Reviewers'), ['No Items']) && has(rowsOf(info, 'Files for Review'), f.name));
            const p1 = await L.selectMenu(ed, 'Review Round 1', 'ed-round1-past');
            check('create.past', 'Round 1 becomes a past round (no decision buttons, "Status" box), its reviewer and revised file kept', {status: statusText(p1), actions: p1.actionButtons, reviewers: rowsOf(p1, 'Reviewers'), revisions: rowsOf(p1, 'Revisions Uploaded')},
                !(p1.buttons || []).some((b) => DECISIONS.includes(b)) && p1.status && p1.status.heading === 'Status' && has(rowsOf(p1, 'Reviewers'), j.n.rv1) && has(rowsOf(p1, 'Revisions Uploaded'), f.name));
        });
        await sect('cancel2', async () => {
            info = await L.selectMenu(ed, 'Review Round 2', 'ed-round2-again');
            await P.addReviewer(ed.page, j.n.rv2);
            info = await L.reread(ed, 'ed-round2-invited');
            const rv2 = await L.actor(app, j.u.rv2, j.J);
            const before = await reviewerLists(rv2, 'rv2-before');
            fact('rv2-before', before);
            const filesBefore = sql(`select count(*) from submission_files where submission_id = ${rs.id}`);
            const linksBefore = sql(`select count(*) from review_round_files where submission_id = ${rs.id}`);
            await L.openEditorial(ed, rs.id, 'ed-before-cancel');
            await decide(app, ed, 'Cancel Review Round', 'cancel2');
            info = await L.reread(ed, 'ed-after-cancel');
            fact('after-cancel', {title: info.title, menu: info.menu, status: statusText(info), revisions: rowsOf(info, 'Revisions Uploaded'), files: rowsOf(info, 'Files for Review'), reviewers: rowsOf(info, 'Reviewers')});
            check('cancel.lands', 'the submission lands on Round 1; "Review Round 2" is gone from the menu', {title: info.title, menu: info.menu}, /Round 1\)$/.test(info.title || '') && !has(info.menu, 'Review Round 2') && has(info.menu, 'Review Round 1'));
            check('cancel.a6', 'A6: the restored round\'s box no longer recalls the revision request (reads a reviewer sentence)', statusText(info), info.status && !/[Rr]evision/.test(info.status.lines.join(' ')));
            const reloaded = await L.openEditorial(ed, rs.id, 'ed-after-cancel-reloaded');
            fact('after-cancel-reloaded', {title: reloaded.title, status: statusText(reloaded)});
            const after = await reviewerLists(rv2, 'rv2-after');
            fact('rv2-after', after);
            check('cancel.reviewer', 'the withdrawn invitation vanishes from every list of the reviewer\'s', after, Object.values(after).every((rows) => !has(rows, rs.title)));
            check('cancel.reviewer.control', '(control) the reviewer listed it before', before['reviewer-assignments-all'], has(before['reviewer-assignments-all'], rs.title));
            const filesAfter = sql(`select count(*) from submission_files where submission_id = ${rs.id}`);
            const linksAfter = sql(`select count(*) from review_round_files where submission_id = ${rs.id}`);
            fact('files-db', {filesBefore, filesAfter, linksBefore, linksAfter, rounds: sql(`select review_round_id, round from review_rounds where submission_id = ${rs.id}`)});
            check('cancel.files', 'the files stay in the submission\'s records (submission_files rows unchanged; the round\'s links gone)', {filesBefore, filesAfter, linksBefore, linksAfter}, eq(filesBefore, filesAfter) && Number(linksAfter[0]) < Number(linksBefore[0]));
            const dlg = await P.openReviewFilesDialog(ed.page);
            await P.showFilesFromAllStages(ed.page, dlg);
            await snap(ed.page, 'ed-after-cancel-files-all');
            fact('after-cancel-files-dialog', flat(await dlg.innerText().catch(() => ''), 900));
            await dlg.getByRole('link', {name: 'Cancel'}).click().catch(() => dlg.getByRole('button', {name: 'Close', exact: true}).first().click());
        });
        await sect('cancel1', async () => {
            const rv3 = await L.actor(app, j.u.rv3, j.J);
            const before = await reviewerLists(rv3, 'rv3-before');
            info = await L.openEditorial(ed, r1.id, 'ed-r1-before');
            await decide(app, ed, 'Cancel Review Round', 'cancel1');
            info = await L.reread(ed, 'ed-r1-after');
            fact('r1-after', {title: info.title, menu: info.menu, status: statusText(info), actions: info.actionButtons, headings: info.headings});
            check('cancel1.lands', 'Round 1 cancelled: the submission is back on the Submission stage, no round entry left', {title: info.title, menu: info.menu}, /Submission$/.test(info.title || '') && !has(info.menu, 'Review Round'));
            const after = await reviewerLists(rv3, 'rv3-after');
            check('cancel1.reviewer', 'the invitation is gone from the reviewer\'s lists (listed before)', {before: before['reviewer-assignments-all'], after}, has(before['reviewer-assignments-all'], r1.title) && Object.values(after).every((rows) => !has(rows, r1.title)));
            fact('r1-files-db', sql(`select count(*) from submission_files where submission_id = ${r1.id}`));
        });
        await sect('cancel0', async () => {
            await L.openEditorial(ed, r0.id, 'ed-r0-before');
            const steps = await decide(app, ed, 'Cancel Review Round', 'cancel0');
            check('cancel0.steps', 'a reviewerless round\'s cancel wizard has the author step only', steps, steps.length === 1 && !steps.some((x) => /Reviewers/.test(x)));
            const info0 = await L.reread(ed, 'ed-r0-after');
            fact('r0-after', {title: info0.title, menu: info0.menu});
        });
    };

    // ===========================================================================================
    // Rule 13: recommendations.
    parts.rec = async () => {
        const j = await journal(app, 'c');
        const p = [...asEd(j), {username: j.u.se, role: 'sectionEditor'},
            {username: j.u.rec, role: 'sectionEditor', recommendOnly: true}, {username: j.u.rec2, role: 'sectionEditor', recommendOnly: true}];
        const A = await seed(app, j, 'reca', {participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'declined'}]}]});
        const S = await seed(app, j, 'recs', {participants: [{username: j.u.rec, role: 'sectionEditor', recommendOnly: true}], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'declined'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const rec = await L.actor(app, j.u.rec, j.J);
        const rec2 = await L.actor(app, j.u.rec2, j.J);
        const se = await L.actor(app, j.u.se, j.J);
        let x;
        await sect('before', async () => {
            x = await L.openEditorial(rec, A.id, 'rec-before');
            fact('rec-before', {actions: x.actionButtons, buttons: x.buttons, status: statusText(x), recommendation: x.recommendation});
            check('rec.buttons', 'a recommending editor sees the three recommendation buttons, no decision button', x.actionButtons, eq(x.actionButtons, RECOMMEND));
            check('rec.status1', 'the box reads "Awaiting recommendations from editors."', statusText(x), x.status && eq(x.status.lines, ['Awaiting recommendations from editors.']));
            x = await L.openEditorial(ed, A.id, 'ed-before');
            fact('ed-before', {actions: x.actionButtons, status: statusText(x), recommendation: x.recommendation});
            check('ed.nobox', 'before any recommendation the deciding editor has no "Recommendation" box', x.recommendation, x.recommendation === null);
        });
        await sect('first', async () => {
            await L.openEditorial(rec, A.id, 'rec-before-press');
            await decide(app, rec, 'Recommend Accept', 'recommend-accept');
            x = await L.reread(rec, 'rec-after');
            fact('rec-after', {actions: x.actionButtons, buttons: x.buttons, status: statusText(x), recommendation: x.recommendation});
            x = await L.openEditorial(ed, A.id, 'ed-after-one');
            fact('ed-after-one', {status: statusText(x), recommendation: x.recommendation, actions: x.actionButtons});
            check('rec.status2', 'one of two recorded: "New editorial recommendations have been submitted."', statusText(x), x.status && eq(x.status.lines, ['New editorial recommendations have been submitted.']));
            check('ed.box1', 'the deciding editor\'s "Recommendation" box lists "Accept Submission", no further detail', x.recommendation, /^Recommendation\s*Accept Submission$/i.test(x.recommendation || ''));
            const y = await L.openEditorial(se, A.id, 'se-after-one');
            fact('se-after-one', {recommendation: y.recommendation, actions: y.actionButtons});
            check('se.box1', 'a deciding Section editor sees the same box', y.recommendation, /Accept Submission/.test(y.recommendation || ''));
        });
        await sect('second', async () => {
            await L.openEditorial(rec2, A.id, 'rec2-before');
            await decide(app, rec2, 'Recommend Decline', 'recommend-decline');
            x = await L.openEditorial(ed, A.id, 'ed-after-two');
            fact('ed-after-two', {status: statusText(x), recommendation: x.recommendation});
            check('rec.status3', 'all recorded: "All recommendations are in and a decision is needed."', statusText(x), x.status && eq(x.status.lines, ['All recommendations are in and a decision is needed.']));
            check('ed.box2', 'the box lists both recommendations', x.recommendation, /Accept Submission/.test(x.recommendation || '') && /Decline Submission/.test(x.recommendation || ''));
        });
        await sect('sole', async () => {
            x = await L.openEditorial(rec, S.id, 'rec-sole');
            fact('rec-sole', {actions: x.actionButtons, buttons: x.buttons, recommendation: x.recommendation, status: statusText(x)});
            check('sole.buttons', 'the only editorial participant, recommend-only: no buttons at all', {actions: x.actionButtons, buttons: x.buttons}, !(x.buttons || []).some((b) => RECOMMEND.includes(b) || DECISIONS.includes(b)));
            check('sole.box', 'the "Recommendation" box reads "You can not make a recommendation until an editor is assigned with permission to record a decision."', x.recommendation, (x.recommendation || '').includes('You can not make a recommendation until an editor is assigned with permission to record a decision.'));
        });
    };

    // ===========================================================================================
    // Rules 14-16: the author's view, reading reviews, the "Notifications" list.
    parts.author = async () => {
        const FORM = 'K2 review form';
        const j = await journal(app, 'a', {review: {defaultReviewMode: 'open'}, reviewForms: [{title: {en: FORM}, elements: [
            {question: {en: 'K2 shown question'}, type: 'smalltextfield', included: true},
            {question: {en: 'K2 hidden question'}, type: 'smalltextfield', included: false},
        ]}]});
        const S = await seed(app, j, 'open', {participants: asEd(j)});
        const F = await seed(app, j, 'form', {participants: asEd(j), reviewRounds: [{reviewers: [{username: j.u.rv3, status: 'accepted', reviewForm: FORM}]}]});
        const A = await seed(app, j, 'acc', {decisions: [...SEND, 'accept'], participants: asEd(j), reviewRounds: [{reviewers: [{username: j.u.rv4, status: 'completed'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const rv1 = await L.actor(app, j.u.rv1, j.J);
        const rv2 = await L.actor(app, j.u.rv2, j.J);
        const SHARED = `Shared remark ${S.tag}.`, PRIVATE = `Editor-only remark ${S.tag}.`;
        let ai, v;
        await sect('fresh', async () => {
            ai = await L.openAuthor(au, S.id, 'au-fresh');
            v = authorSees(ai); fact('au-fresh', {...v, buttons: ai.buttons});
            check('fresh.present', 'fresh in review: the Revisions Uploaded panel with its upload button, and the discussions', v, v.revisionsPanel && v.panelUpload && v.discussions.length > 0);
            check('fresh.absent', 'fresh in review: no "Notifications" list, no reviewers list, not even an empty one', v, !v.notifications && v.reviewers === null && v.readReview === 0);
            // The panel's "Upload" on a round where no revisions were requested: what it does.
            const n0 = au.nativeDialogs.length;
            await au.page.getByRole('button', {name: 'Upload', exact: true}).click();
            await sleep(1500); await idle(au.page);
            const dlg = P.uploadWizardDialog(au.page);
            const opened = await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 15000}).then(() => true, () => false);
            const sc = await snap(au.page, 'au-fresh-upload-pressed');
            fact('fresh-upload-press', {wizardOpened: opened, notices: sc.notices, dialogs: au.nativeDialogs.slice(n0), dialogText: flat(sc.text && sc.text.dialog, 400)});
            if (opened) {
                await P.uploadFirstStepOnly(au.page, {genre: GENRE, file: L.txtNamed(`${S.tag}-fresh.txt`)}).catch((e) => fact('fresh-upload-attach-failed', flat(e.message, 300)));
                const after = await L.reread(au, 'au-fresh-after-upload');
                fact('fresh-upload-after', {rows: rowsOf(after, 'Revisions Uploaded'), notices: (await snap(au.page, 'au-fresh-after-upload-notices')).notices});
                const re = await L.openAuthor(au, S.id, 'au-fresh-after-upload-reloaded');
                fact('fresh-upload-after-reload', {rows: rowsOf(re, 'Revisions Uploaded'), status: statusText(re)});
            } else {
                await au.page.getByRole('dialog').last().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            }
            const ei = await L.openEditorial(ed, S.id, 'ed-fresh');
            fact('ed-fresh', {headings: ei.headings, buttons: ei.buttons, status: statusText(ei), revisions: rowsOf(ei, 'Revisions Uploaded')});
        });
        await sect('reviews', async () => {
            await L.openEditorial(ed, S.id, 'ed-add');
            await P.addReviewer(ed.page, j.n.rv1, {method: 'Open'});
            await P.addReviewer(ed.page, j.n.rv2, {method: 'Anonymous Reviewer/Anonymous Author'});
            const ei = await L.reread(ed, 'ed-two-reviewers');
            fact('ed-reviewers', rowsOf(ei, 'Reviewers'));
            await reviewerDo(rv1, S.id, {submit: false});
            ai = await L.openAuthor(au, S.id, 'au-open-underway');
            v = authorSees(ai); fact('au-open-underway', v);
            check('underway', 'an open review accepted, not submitted: no reviewers list at all', v, v.reviewers === null && v.readReview === 0);
            await reviewerDo(rv1, S.id, {comments: SHARED, privateComments: PRIVATE, label: 'rv1-step3'});
            ai = await L.openAuthor(au, S.id, 'au-open-submitted');
            v = authorSees(ai); fact('au-open-submitted', v);
            check('submitted.listed', 'an open review is listed as soon as the reviewer submits it, before any editor opened it, with "Read Review"', v, has(v.reviewers, j.n.rv1) && v.readReview === 1);
            const cols = await au.page.getByRole('table', {name: 'Reviewers', exact: true}).locator('thead th').allInnerTexts().then((x) => x.map((y) => flat(y))).catch(() => null);
            const panelButtons = await au.page.locator('div').filter({has: au.page.getByRole('heading', {name: 'Reviewers', exact: true, level: 3})}).last().locator('button:visible').allInnerTexts().then((x) => x.map((y) => flat(y))).catch(() => null);
            fact('au-reviewers-columns', {cols, panelButtons});
            check('author.columns', 'the author\'s reviewers list: columns reviewer / type / actions, no status column, no add button', {cols, panelButtons}, !!cols && cols.length === 3 && !has(panelButtons, 'Add Reviewer'));
            // The grid's `reviewRead` operation: sent by no author screen (footnote j). Checked directly as
            // the Author, before any editor opened the review, the way the editor's "Confirm" posts it.
            const ra = sql(`select review_id, review_round_id, considered, date_considered from review_assignments where submission_id = ${S.id} and reviewer_id = (select user_id from users where username = '${j.u.rv1}')`)[0].split('|');
            const token = await au.page.evaluate(() => (window.pkp && window.pkp.currentUser && window.pkp.currentUser.csrfToken) || null);
            const resp = await au.page.request.post(`/index.php/${j.J}/$$$call$$$/grid/users/reviewer/author-reviewer-grid/review-read`, {form: {submissionId: String(S.id), stageId: '3', reviewRoundId: ra[1], reviewAssignmentId: ra[0], csrfToken: token || ''}});
            const body = await resp.text();
            const after = sql(`select considered, date_considered from review_assignments where review_id = ${ra[0]}`);
            fact('author-review-read', {status: resp.status(), body: flat(body, 300), tokenRead: !!token, before: ra.slice(2), after});
            check('author.reviewRead', 'the Author role does not hold the grid\'s reviewRead: refused, the assignment unchanged', {status: resp.status(), body: flat(body, 200), before: ra.slice(2), after},
                /"status":\s*false/.test(body) && after[0] === `${ra[2]}|${ra[3]}`);
            const w = await authorReadReview(au, j.n.rv1, 'au-read-review-early');
            fact('au-read-review-early', w);
            check('window.title', 'the window is titled "Review: {submission title}"', w.title, has(w.title, `Review: ${S.title}`));
            check('window.first', 'first: the reviewer\'s name, "Completed:" date, and (journal) "Recommendation:"', w.text,
                w.text.includes(j.n.rv1) && /Completed:\s*\d{4}-\d{2}-\d{2}/.test(w.text) && (B.isOMP ? !/Recommendation:/.test(w.text) : /Recommendation:\s*Accept Submission/.test(w.text)));
            check('window.second', 'second: "Reviewer Comments" › "For author and editor" with the shared remark; the editor-only remark absent', w.text,
                /Reviewer Comments/.test(w.text) && /For author and editor/.test(w.text) && w.text.includes(SHARED) && !w.text.includes(PRIVATE));
            check('window.third', 'third: a section for files the reviewer attached ("Reviewer Files"; its listing not read, A3)', w.hasFilesHeading, w.hasFilesHeading);
            check('ojs1.retired', 'OJS1 stays retired: the window shows the review text', w.text.includes(SHARED), w.text.includes(SHARED));
            await reviewerDo(rv2, S.id, {comments: `Anonymous remark ${S.tag}.`, label: 'rv2-step3'});
            ai = await L.openAuthor(au, S.id, 'au-anon-submitted');
            v = authorSees(ai); fact('au-anon-submitted', v);
            check('anon.submitted', 'an anonymous review submitted never appears', v.reviewers, has(v.reviewers, j.n.rv1) && !has(v.reviewers, j.n.rv2) && v.readReview === 1);
        });
        await sect('confirm', async () => {
            await L.openEditorial(ed, S.id, 'ed-before-confirm');
            const w1 = await L.editorReadReview(ed, j.n.rv1, {label: 'ed-read-review-rv1'});
            fact('ed-read-review-rv1', {title: w1.title, buttons: w1.buttons, confirmLabel: w1.confirmLabel, kind: w1.kind});
            const w2 = await L.editorReadReview(ed, j.n.rv2, {label: 'ed-read-review-rv2'});
            fact('ed-read-review-rv2', {title: w2.title, buttons: w2.buttons, kind: w2.kind});
            const ei = await L.openEditorial(ed, S.id, 'ed-confirmed');
            fact('ed-confirmed', {status: statusText(ei), reviewers: rowsOf(ei, 'Reviewers')});
            ai = await L.openAuthor(au, S.id, 'au-confirmed');
            v = authorSees(ai); fact('au-confirmed', v);
            check('confirm.nothing', 'the editor\'s "Confirm" changes nothing on the author\'s screen (rv1 listed, rv2 not)', v.reviewers, has(v.reviewers, j.n.rv1) && !has(v.reviewers, j.n.rv2) && v.readReview === 1);
            const w = await authorReadReview(au, j.n.rv1, 'au-read-review-confirmed');
            check('confirm.window', 'the window reads the same after the editor confirmed', w.text.includes(SHARED) && !w.text.includes(PRIVATE), w.text.includes(SHARED) && !w.text.includes(PRIVATE));
        });
        await sect('letter', async () => {
            await L.openEditorial(ed, S.id, 'ed-before-request');
            const c = await openChoice(ed, 'request-choice');
            await c.modal.getByRole('button', {name: 'Next', exact: true}).click();
            await finishDecision(app, ed, 'request');
            const ei = await L.reread(ed, 'ed-requested');
            fact('v1-ed-requested', {headings: ei.headings, buttons: ei.buttons, status: statusText(ei)});
            ai = await L.openAuthor(au, S.id, 'au-requested');
            v = authorSees(ai); fact('v1-au-requested', {...v, buttons: ai.buttons});
            check('v1.requested', 'a round with revisions requested: nothing about a response to the reviews, on either screen', {editor: ei.buttons, author: ai.buttons, headings: [...ei.headings, ...ai.headings]},
                ![...ei.buttons, ...ai.buttons, ...ei.headings, ...ai.headings].some((x) => /[Rr]espon[sd]/.test(x)));
            check('letters.appear', 'once a letter was sent, the "Notifications" list appears', v.notifications, v.notifications);
            const heading = au.page.getByRole('heading', {name: 'Notifications', exact: true});
            const list = au.page.locator('div').filter({has: heading}).last();
            const items = await list.getByRole('listitem').allInnerTexts().then((x) => x.map((y) => flat(y, 200)));
            check('letters.rows', 'each row is a subject line and a date', items, items.length === 1 && /\d{4}-\d{2}-\d{2}/.test(items[0]));
            const link = list.getByRole('listitem').first().locator('a, button').first();
            const subject = flat(await link.innerText());
            await link.click();
            const win = au.page.getByRole('dialog').filter({hasText: subject.replace(/\s*\d{4}-\d{2}-\d{2}.*$/, '').slice(0, 40)}).last();
            await win.waitFor({timeout: 30000}); await idle(au.page); await sleep(500);
            const sc = await snap(au.page, 'au-letter-open');
            const boxes = await win.locator('textarea:visible, input[type=text]:visible, [contenteditable=true]:visible, select:visible').count();
            const ctrls = await win.locator('button:visible, a:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean));
            fact('letter-window', {subject, editable: boxes, controls: ctrls, text: flat(sc.text && sc.text.dialog, 700)});
            check('letters.open', 'clicking one opens the full letter read-only in a side panel', {editable: boxes, controls: ctrls}, boxes === 0 && !ctrls.some((x) => /Reply|Send|Save/.test(x)));
            await win.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(700);
        });
        await sect('a12', async () => {
            ai = await L.openAuthor(au, S.id, 'au-a12-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = P.uploadWizardDialog(au.page);
            await dlg.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
            const g = L.txtNamed(`${S.tag}-a12.txt`);
            await P.uploadFirstStepOnly(au.page, {genre: GENRE, file: g});
            ai = await L.reread(au, 'au-a12-same-page');
            const same = rowsOf(ai, 'Revisions Uploaded');
            ai = await L.openAuthor(au, S.id, 'au-a12-reloaded');
            const re = rowsOf(ai, 'Revisions Uploaded');
            fact('a12', {samePage: same, reloaded: re, dialogs: au.nativeDialogs.slice()});
            check('a12.retired', 'A12 stays retired: the window closed at its file step leaves the file listed (same page and after a reload)', {samePage: same, reloaded: re}, has(same, g.name) && has(re, g.name));
        });
        await sect('form', async () => {
            const rv3 = await L.actor(app, j.u.rv3, j.J);
            await reviewerDo(rv3, F.id, {formAnswers: ['Answer for the author', 'Answer for the editor'], label: 'rv3-form-step3'});
            ai = await L.openAuthor(au, F.id, 'au-form');
            v = authorSees(ai); fact('au-form', v);
            const w = await authorReadReview(au, j.n.rv3, 'au-read-review-form');
            fact('au-read-review-form', w);
            check('form.shown', 'form review: the question marked for authors with its answer; the other question absent', {text: w.text, inputs: w.inputs},
                w.text.includes('K2 shown question') && !w.text.includes('K2 hidden question') && (w.text.includes('Answer for the author') || w.inputs.some((x) => x.value.includes('Answer for the author'))) && !w.inputs.some((x) => x.value.includes('Answer for the editor')) && !w.text.includes('Answer for the editor'));
        });
        await sect('accepted', async () => {
            let x = await L.openEditorial(ed, A.id, 'ed-acc-landing');
            fact('acc-landing', {title: x.title, menu: x.menu});
            x = await L.selectMenu(ed, 'Review Round 1', 'ed-acc-round1');
            fact('v1-ed-accepted', {headings: x.headings, buttons: x.buttons, status: statusText(x)});
            let y = await L.openAuthor(au, A.id, 'au-acc-landing');
            y = await L.selectMenu(au, 'Review Round 1', 'au-acc-round1');
            const w = authorSees(y);
            fact('v1-au-accepted', {...w, buttons: y.buttons});
            check('v1.accepted', 'an accepted round: nothing about a response to the reviews, on either screen', {editor: x.buttons, author: y.buttons},
                ![...x.buttons, ...y.buttons, ...x.headings, ...y.headings].some((z) => /[Rr]espon[sd]/.test(z)));
        });
    };

    parts.old = async () => require('./old')(app, L, K);

    const run = app.name === 'ops' ? PARTS.filter((p) => p === 'old') : PARTS;
    for (const name of run) {
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
