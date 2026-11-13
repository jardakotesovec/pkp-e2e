// U26 "Review stage & rounds", claim check chunk K13b (housekeeping 2026-11-13), driven on `main`:
// the claims the 3.5 build-out corrected in its copy of the spec
// (lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md, diffed against
// docs/specs/U26-review-stage-and-rounds.md), each read on main's OJS and OMP; OPS for Rule 17's
// preprint address and as the read-only control (no review stage).
//
// Run (the slot's campaign fleet up, `.reports/U26/fleet.json`), each run under the app lock:
//
//   PROBE_RUN=r1 PROBE_FEATURE=U26 PROBE_AGENT=ccK13b PROBE_NOTES_FEATURE=U26 ONLY=ojs \
//     bin/app-lock.sh shared ojs,omp -- node bin/probe.js all shared/playwright/checks/U26/K13b/k13b.js
//   (then ONLY=omp, and ONLY=ops PARTS=ops; PROBE_RUN=r2 for the second, independent run)
//
// PARTS picks parts (comma list; default every part; OPS runs `ops` only). Every part builds its own
// scratch journal or press with throwaway accounts; nothing on `publicknowledge` or the roster is
// touched. Needs Mailpit (`mail`, `rev`). Helper: ./lib.js (and apps/ojs/playwright/pages/
// ReviewStagePages.js, whose screens the press shares). No other script, env part or file is read.
//
//   fc      Actors "Choose the files under review" / "Open the review stage": the assigned Funding
//           Coordinator's files window (tick, OK, same page and reload) and "Add Reviewer", no
//           decision buttons; A5: Copyeditor, Layout Editor, Proofreader placed on the submission by
//           the seed; the Assign roster; a Section editor as the sub-editor-level control
//   del     Actors "Delete the submission", Rule 11's declined roster per level (Site Administrator,
//           Journal/Press manager, Journal/Press editor, Section/Series editor), "Delete"'s question,
//           its "Cancel" (same page, reload), its "Confirm" pressed by the Editor
//   labels  Rules 2-4 on a press and a journal: the Submission stage's buttons, the review entry and
//           title, a skipped review ("Accept and Skip Review") read on its review entries; OMP1
//   acc     Rule 5 "Submission accepted.": the round's box after a seeded and an on-screen Accept
//   back    Rules 5-6 "Returned back to review.": back from Copyediting with the review confirmed
//           before the Accept, unread at the return (then confirmed), confirmed after the Accept
//   rec     Rule 6: recommendations against reviewer facts (underway, none, unread; 0, 1, 2 recorded)
//   rev     Rule 5 / Actors: a revision the editor files (both revision paths); Side effects: the
//           upload window's header "Close" after the attach; A11 its "Cancel"; A13/A14 the My
//           Submissions row after an author upload (both paths)
//   mail    Side effects "Revised Version Uploaded": recipients per group, sender, the throttle (a
//           page reload, a fresh sign-in, an editor assigned after the notice, a day-old notice)
//   files   Rule 8 / A7: untick + OK, then what "Add Reviewer" and the reviewer's page offer
//   choice  Rule 11: "Request Revisions"' window closed with the other choice ticked and reopened
//           (same page, then after a reload)
//   sugg    Settings "Reviewer suggestions enabled": the panel per submission and per view, setting off
//   ops     Rule 17: the old author address on all three apps (where the workflow opens)
//
// Outputs: .reports/U26/ccK13b/<part>-<screen>-<run>-<app>.json (+ .png, + -info.json, the dialog as
// data) and per part `<part>-checks-<run>-<app>.json` (one row per claim: claim, what the screen gave,
// `same`). Overdue states are not needed here; the email log is backdated with sql() in `mail` (no
// scenario key sets a notice's age).
const path = require('path');
const L = require('./lib');
const {forEachApp, tag, check, fact, sect, snap, flat, log, idle, statusText, rowsOf, lines, has, eq, sleep, note} = L;

const ALL = ['fc', 'del', 'labels', 'acc', 'back', 'rec', 'rev', 'mail', 'files', 'choice', 'sugg', 'ops'];
const PARTS = process.env.PARTS && process.env.PARTS !== 'all' ? process.env.PARTS.split(',') : ALL;
const REVISED = 'Revised Version Uploaded';
const LOG_REVISED = 536870913; // SubmissionEmailLogEventType::AUTHOR_NOTIFY_REVISED_VERSION
const DECISIONS = ['Request Revisions', 'Accept Submission', 'Create New Review Round', 'Cancel Review Round', 'Decline Submission'];
const BACK = /^(Cancel Copyediting|Move to Review|Send back to Review)$/;

forEachApp(async (app) => {
    const isOPS = app.name === 'ops';
    const isOMP = app.name === 'omp';
    const P = require(path.join(L.REPO, 'apps/ojs/playwright/pages/ReviewStagePages.js'));
    const SEND = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
    const R = (o = {}) => (isOMP ? {stage: 'external', ...o} : o);
    const GENRE = isOMP ? 'Book Manuscript' : 'Article Text';
    const STAGE = isOMP ? 'External Review' : 'Review';
    const EDITOR_GROUP = isOMP ? 'Press editor' : 'Journal editor';
    const sql = (q) => L.sql(app, q).split('\n').filter(Boolean);
    const mailTo = (u) => `${u}@mail.test`;
    const countRevised = (u, since) => app.mail.count({to: mailTo(u), subject: REVISED, since});
    async function pollCount(u, want, since, ms = 20000) {
        const end = Date.now() + ms; let c = 0;
        while (Date.now() < end) { c = await countRevised(u, since); if (c >= want) return c; await sleep(500); }
        return c;
    }
    async function journal(prefix, people, extra = {}) {
        const J = tag(`u26ccK13b${prefix}`);
        const u = {}; const n = {};
        for (const [k, g, f] of people) { u[k] = `${J}${k}`; n[k] = `${g} ${f}`; }
        await app.api.createContext({tag: J, context: {contactName: `Contact ${J}`, contactEmail: `${J}c@mail.test`}, ...extra,
            users: people.map(([k, g, f, role]) => ({username: u[k], givenName: g, familyName: f, roles: [role]}))});
        fact(`journal-${prefix}`, J);
        return {J, u, n};
    }
    async function seed(j, suffix, {decisions, reviewRounds = [{reviewers: []}], participants, submitter, files, reviewerSuggestions} = {}) {
        const t = `${j.J}${suffix}`;
        const spec = {tag: t, context: j.J, submitter: submitter || j.u.au, title: `Submission ${t}`};
        if (!isOPS) { spec.decisions = decisions || SEND; spec.reviewRounds = reviewRounds.map((x) => R(x)); }
        if (participants) spec.participants = participants;
        if (files) spec.files = files;
        if (reviewerSuggestions) spec.reviewerSuggestions = reviewerSuggestions;
        const r = await app.api.createSubmission(spec);
        fact(`seed-${suffix}`, {id: r.submissionId, rounds: r.reviewRounds});
        return {id: r.submissionId, title: `Submission ${t}`, tag: t};
    }
    const ED = (j, k = 'ed') => ({username: j.u[k], role: 'editor'});
    const dialogText = async (page) => flat(await page.locator('[role=dialog]').first().innerText({timeout: 5000}).catch(() => page.locator('body').innerText().catch(() => '')), 3000);
    /** The upload window's first step: component and file attached, the window left open. */
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
        await au.page.getByRole('button', {name: button, exact: true}).first().click();
        await P.uploadViaWizard(au.page, {genre: GENRE, file});
        return L.reread(au, `${label}-after`);
    }
    async function editorUpload(ed, file, label) {
        const wf = new P.WorkflowPage(ed.page, ed.ctx);
        await wf.panel('Revisions Uploaded').getByRole('button', {name: 'Upload', exact: true}).click();
        await P.uploadViaWizard(ed.page, {genre: GENRE, file});
        return L.reread(ed, label);
    }

    const parts = {};

    // ===============================================================================================
    parts.fc = async () => {
        const people = [['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['fc', 'Fern', 'Fundly', 'funding'],
            ['ce', 'Cora', 'Copyly', 'copyeditor'], ['le', 'Lev', 'Layoutly', 'layoutEditor'], ['pr', 'Pia', 'Proofly', 'proofreader'],
            ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer'], ['rv2', 'Robin', 'Revtwo', 'externalReviewer']];
        if (!isOMP) people.push(['ge', 'Gil', 'Guestly', 'guestEditor']);
        const j = await journal('f', people);
        const participants = [ED(j), {username: j.u.se, role: 'sectionEditor'}, {username: j.u.fc, role: 'funding'},
            {username: j.u.ce, role: 'copyeditor'}, {username: j.u.le, role: 'layoutEditor'}, {username: j.u.pr, role: 'proofreader'}];
        let s;
        try {
            s = await seed(j, 'x', {participants, files: [{file: 'article.pdf'}], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}], files: [{file: 'notes.md'}]}]});
        } catch (e) {
            fact('seed-x-refused', flat(e.message, 600));
            s = await seed(j, 'y', {participants: participants.slice(0, 3), files: [{file: 'article.pdf'}], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}], files: [{file: 'notes.md'}]}]});
        }
        fact('assignments', sql(`select u.username, sa.user_group_id, (select string_agg(stage_id::text, ',') from user_group_stage ugs where ugs.user_group_id = sa.user_group_id) from stage_assignments sa join users u on u.user_id = sa.user_id where sa.submission_id = ${s.id} order by 1`));
        const seen = {};
        for (const k of ['fc', 'se', 'ce', 'le', 'pr']) {
            await sect(`open-${k}`, async () => {
                const a = await L.actor(app, j.u[k], j.J);
                const info = await L.openEditorial(a, s.id, `${k}-round`);
                const text = await dialogText(a.page);
                seen[k] = {title: info.title, status: statusText(info), actions: info.actionButtons, buttons: info.buttons, menu: info.menu,
                    refused: /You don't currently have access to that stage of the workflow/.test(text), text: text.slice(0, 300)};
                fact(`open-${k}`, seen[k]);
                if (k === 'fc' && has(info.buttons, 'Upload/Select Files')) {
                    const dlg = await P.openReviewFilesDialog(a.page);
                    await snap(a.page, 'fc-files-dialog');
                    await P.showFilesFromAllStages(a.page, dlg);
                    const box = P.reviewFilesCheckbox(dlg, 'article.pdf').first();
                    await box.waitFor({timeout: 20000});
                    await snap(a.page, 'fc-files-dialog-all');
                    await box.check();
                    await P.confirmReviewFilesDialog(a.page, dlg);
                    const same = await L.reread(a, 'fc-files-after');
                    const re = await L.openEditorial(a, s.id, 'fc-files-reloaded');
                    check('fc.files', 'Actors (3.5 copy): the assigned Funding Coordinator\'s "Upload/Select Files", a ticked file joins the round with "Review files updated."',
                        {notices: same.notices, samePage: rowsOf(same, 'Files for Review'), reloaded: rowsOf(re, 'Files for Review')},
                        has(same.notices, 'Review files updated.') && has(rowsOf(same, 'Files for Review'), 'article.pdf') && has(rowsOf(re, 'Files for Review'), 'article.pdf'));
                }
                if (k === 'fc' && has(info.buttons, 'Add Reviewer')) {
                    // The Coordinator's "Add Reviewer": the window as it opens, a search, then a pick from the list.
                    await L.openEditorial(a, s.id, 'fc-before-add');
                    await a.page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                    const modal = a.page.getByRole('dialog').filter({has: a.page.locator('.listPanel--selectReviewer')});
                    const search = modal.locator('.listPanel--selectReviewer input.pkpSearch__input');
                    await search.waitFor({timeout: 30000});
                    await idle(a.page); await sleep(1500);
                    const errorDlg = a.page.locator('[data-cy="dialog"]').filter({hasText: 'does not have access'});
                    const w0 = await snap(a.page, 'fc-add-reviewer-opened');
                    const opened = {error: await errorDlg.count(), dialog: flat(w0.text && w0.text.dialog, 600)};
                    if (opened.error) await errorDlg.getByRole('button', {name: 'OK'}).first().click().catch(() => {});
                    // First a pick straight from the list as it opened (no search).
                    const pick0 = modal.getByRole('button', {name: `Select ${j.n.rv2}`, exact: true}).first();
                    const pick0Visible = await pick0.isVisible().catch(() => false);
                    let direct = {pick0Visible};
                    if (pick0Visible) {
                        await pick0.click();
                        await idle(a.page); await sleep(2000);
                        const wd = await snap(a.page, 'fc-add-reviewer-direct-pick');
                        const submit0 = modal.getByRole('button', {name: 'Add Reviewer', exact: true});
                        direct.formShown = await submit0.isVisible().catch(() => false);
                        direct.error = await errorDlg.count();
                        direct.dialog = flat(wd.text && wd.text.dialog, 500);
                        if (direct.formShown) {
                            await modal.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\S/}).waitFor({timeout: 30000}).catch(() => {});
                            await sleep(1000);
                            await submit0.click();
                            await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                            await idle(a.page);
                            const wa = await snap(a.page, 'fc-add-reviewer-direct-after');
                            direct.after = {notices: wa.notices, dialog: flat(wa.text && wa.text.dialog, 300)};
                        }
                        if (direct.error) await errorDlg.getByRole('button', {name: 'OK'}).first().click().catch(() => {});
                    }
                    opened.direct = direct;
                    if (!(await modal.isVisible().catch(() => false))) {
                        await L.openEditorial(a, s.id, 'fc-before-search');
                        await a.page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                        await search.waitFor({timeout: 30000});
                        await idle(a.page); await sleep(1000);
                    }
                    await search.fill(j.n.rv2); await search.press('Enter');
                    await idle(a.page); await sleep(1500);
                    const w1 = await snap(a.page, 'fc-add-reviewer-searched');
                    const searched = {error: await errorDlg.count(), dialog: flat(w1.text && w1.text.dialog, 600)};
                    if (searched.error) await errorDlg.getByRole('button', {name: 'OK'}).first().click().catch(() => {});
                    await sleep(500);
                    const pick = modal.getByRole('button', {name: `Select ${j.n.rv2}`, exact: true}).first();
                    const pickable = await pick.isVisible().catch(() => false);
                    let added = null;
                    if (pickable) {
                        await pick.click();
                        await idle(a.page); await sleep(2000);
                        const w2 = await snap(a.page, 'fc-add-reviewer-picked');
                        const submit = modal.getByRole('button', {name: 'Add Reviewer', exact: true});
                        added = {formShown: await submit.isVisible().catch(() => false), dialog: flat(w2.text && w2.text.dialog, 400)};
                        if (added.formShown) {
                            await modal.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\S/}).waitFor({timeout: 30000}).catch(() => {});
                            await sleep(1000);
                            await submit.click();
                            await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                            await idle(a.page);
                        }
                    }
                    await modal.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                    const same = await L.reread(a, 'fc-add-reviewer-after');
                    const re = await L.openEditorial(a, s.id, 'fc-add-reviewer-reloaded');
                    fact('fc-add-reviewer', {opened, searched, pickable, added, notices: same.notices, reviewers: rowsOf(re, 'Reviewers')});
                    check('fc.addReviewer', 'Actors (3.5 copy): the Funding Coordinator\'s "Add Reviewer" works (a reviewer added to the round)', {opened, searched, pickable, reviewers: rowsOf(re, 'Reviewers')}, has(rowsOf(re, 'Reviewers'), j.n.rv2));
                }
                await a.close();
            });
        }
        check('fc.offers', 'Actors (3.5 copy): the Funding Coordinator opens the round, is offered "Upload/Select Files" and "Add Reviewer", no decision buttons',
            seen.fc, !!seen.fc && has(seen.fc.buttons, 'Upload/Select Files') && has(seen.fc.buttons, 'Add Reviewer') && !(seen.fc.actions || []).some((b) => DECISIONS.includes(b)));
        check('a5.other-means', 'A5 (3.5 copy): Copyeditor, Layout Editor, Proofreader placed on the submission by other means see only "You don\'t currently have access to that stage of the workflow."',
            Object.fromEntries(['ce', 'le', 'pr'].map((k) => [k, seen[k] && {refused: seen[k].refused, title: seen[k].title, menu: seen[k].menu}])), ['ce', 'le', 'pr'].every((k) => seen[k] && seen[k].refused));
        await sect('roster', async () => {
            const ed = await L.actor(app, j.u.ed, j.J);
            await L.openEditorial(ed, s.id, 'ed-round');
            await ed.page.getByRole('button', {name: 'Assign', exact: true}).click();
            const modal = ed.page.getByRole('dialog').filter({has: ed.page.locator('select[name="filterUserGroupId"]')});
            await modal.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
            const roster = await modal.locator('select[name="filterUserGroupId"] option').allInnerTexts().then((x) => x.map((y) => flat(y)));
            await snap(ed.page, 'ed-assign-roster');
            fact('assign-roster', roster);
            check('roster.jm', 'Side effects (3.5 copy): the stage\'s assignment dialog offers no Journal/Press manager group', roster, !roster.some((r) => /manager/i.test(r)));
        });
        fact('group-roles', sql(`select ug.role_id, s.setting_value from user_groups ug join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' and s.locale = 'en' where ug.context_id = (select ${app.contextTables ? app.contextTables.id : 'journal_id'} from ${app.contextTables ? app.contextTables.table : 'journals'} where path = '${j.J}') order by 1, 2`));
    };

    // ===============================================================================================
    parts.del = async () => {
        const j = await journal('d', [['mgr', 'Mona', 'Managerly', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'],
            ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const p = [ED(j), {username: j.u.se, role: 'sectionEditor'}];
        const D1 = await seed(j, 'd1', {decisions: [...SEND, 'decline'], participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'invited'}]}]});
        const D2 = await seed(j, 'd2', {decisions: [...SEND, 'decline'], participants: p, reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'invited'}]}]});
        const got = {};
        const who = {};
        await sect('roster', async () => {
            for (const [k, user] of [['admin', 'admin'], ['mgr', j.u.mgr], ['ed', j.u.ed], ['se', j.u.se]]) {
                who[k] = await L.actor(app, user, j.J);
                const info = await L.openEditorial(who[k], D1.id, `${k}-declined`);
                got[k] = {actions: info.actionButtons, status: statusText(info)};
            }
            fact('declined-buttons', got);
            check('declined.ed', 'Rule 11 main: a Journal/Press editor gets no "Delete" (only JM and SA); 3.5 copy: "Revert Decline" and "Delete"', got.ed.actions, !has(got.ed.actions, 'Delete'));
            check('declined.mgr', 'Rule 11: Journal/Press manager gets "Revert Decline" and "Delete"', got.mgr.actions, eq(got.mgr.actions, ['Revert Decline', 'Delete']));
            check('declined.admin', 'Rule 11: Site Administrator gets "Revert Decline" and "Delete"', got.admin.actions, eq(got.admin.actions, ['Revert Decline', 'Delete']));
            check('declined.se', 'Rule 11: Section/Series editor gets "Revert Decline" alone', got.se.actions, eq(got.se.actions, ['Revert Decline']));
            check('declined.status', 'Rule 5: the box reads "Submission declined."', got.ed.status, /Submission declined\.$/.test(got.ed.status));
        });
        const deleter = (got.ed && has(got.ed.actions, 'Delete')) ? 'ed' : 'mgr';
        await sect('cancel', async () => {
            const a = who[deleter];
            await L.openEditorial(a, D1.id, `${deleter}-before-delete`);
            const n0 = a.nativeDialogs.length;
            await a.page.getByRole('button', {name: 'Delete', exact: true}).click();
            const conf = a.page.getByRole('dialog').filter({hasText: /delete/i}).last();
            await conf.waitFor({timeout: 30000});
            await idle(a.page);
            const cs = await snap(a.page, `${deleter}-delete-question`);
            const cbuttons = await conf.locator('button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)));
            fact('delete-question', {by: deleter, text: flat(cs.text && cs.text.dialog, 400), buttons: cbuttons, native: a.nativeDialogs.slice(n0)});
            await conf.getByRole('button', {name: /^(Cancel|No)$/}).first().click();
            await sleep(800);
            const same = await L.reread(a, `${deleter}-after-cancel`);
            const re = await L.openEditorial(a, D1.id, `${deleter}-after-cancel-reloaded`);
            check('delete.cancel', '3.5 copy: "Cancel" leaves the submission as it was (same page and reload)', {same: same.actionButtons, reloaded: re.actionButtons, status: statusText(re)}, eq(re.actionButtons, got[deleter].actions) && eq(same.actionButtons, got[deleter].actions));
        });
        await sect('confirm', async () => {
            const a = who[deleter];
            await L.openEditorial(a, D2.id, `${deleter}-d2-before`);
            await a.page.getByRole('button', {name: 'Delete', exact: true}).click();
            const conf = a.page.getByRole('dialog').filter({hasText: /delete/i}).last();
            await conf.waitFor({timeout: 30000});
            await conf.getByRole('button', {name: /^(Confirm|Yes|OK)$/}).first().click();
            await sleep(1500); await idle(a.page);
            const sc = await snap(a.page, `${deleter}-d2-after-confirm`);
            const row = sql(`select count(*) from submissions where submission_id = ${D2.id}`);
            fact('delete-confirm', {by: deleter, url: sc.url, notices: sc.notices, dialogOpen: !!(sc.text && sc.text.dialog), stored: row});
            check('delete.confirm', `(sweep) "Delete" › "Confirm" by the ${deleter} removes the submission`, {stored: row, notices: sc.notices}, row[0] === '0');
        });
    };

    // ===============================================================================================
    parts.labels = async () => {
        const j = await journal('l', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author']]);
        const S0 = await seed(j, 's0', {decisions: [], reviewRounds: [], participants: [ED(j)]});
        const S1 = await seed(j, 's1', {participants: [ED(j)]});
        let S2 = null;
        try { S2 = await seed(j, 's2', {decisions: ['skipExternalReview'], reviewRounds: [], participants: [ED(j)]}); } catch (e) { fact('seed-s2-refused', flat(e.message, 600)); }
        const ed = await L.actor(app, j.u.ed, j.J);
        await sect('submission-stage', async () => {
            const i = await L.openEditorial(ed, S0.id, 's0-submission');
            fact('s0', {title: i.title, actions: i.actionButtons, menu: i.menu});
            check('rule2.send', isOMP ? 'Rule 2 (3.5 copy): the press\'s Submission stage offers "Send to External Review" beside "Send to Internal Review"' : 'Rule 2: the journal\'s Submission stage offers "Send for Review"',
                i.actionButtons, isOMP ? has(i.actionButtons, 'Send to External Review') && has(i.actionButtons, 'Send to Internal Review') : has(i.actionButtons, 'Send for Review'));
            fact('s0-skip-button', (i.actionButtons || []).filter((b) => /Skip/.test(b)));
        });
        await sect('round', async () => {
            const i = await L.openEditorial(ed, S1.id, 's1-round');
            fact('s1', {title: i.title, menu: i.menu});
            check('rule3.entry', `Rule 3: the menu entry reads "${STAGE}" with "Review Round 1"; the title "Workflow: ${STAGE} (Round 1)"`, {title: i.title, menu: i.menu}, i.title === `Workflow: ${STAGE} (Round 1)` && i.menu.includes(STAGE) && has(i.menu, 'Review Round 1'));
        });
        if (S2) {
            await sect('skipped', async () => {
                const i = await L.openEditorial(ed, S2.id, 's2-landing');
                fact('s2-landing', {title: i.title, menu: i.menu});
                const entries = isOMP ? ['Internal Review', 'External Review'] : ['Review'];
                for (const e of entries) {
                    const r = await L.selectMenu(ed, e, `s2-ed-${e.replace(/\s/g, '')}`);
                    fact(`s2-ed-${e}`, {title: r.title, status: statusText(r), headings: r.headings});
                    check(`rule4.skipped.${e}`, `Rule 4 (3.5 copy; OMP1): a submission that skipped review, its "${e}" entry reads "The ${e} stage has not yet been initiated."`, statusText(r), has(lines(r), `The ${e} stage has not yet been initiated.`));
                }
                const au = await L.actor(app, j.u.au, j.J);
                await L.openAuthor(au, S2.id, 's2-au-landing');
                const r = await L.selectMenu(au, STAGE, 's2-au-review');
                fact('s2-au', {title: r.title, status: statusText(r)});
            });
        }
    };

    // ===============================================================================================
    parts.acc = async () => {
        const j = await journal('a', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const A1 = await seed(j, 'a1', {decisions: [...SEND, 'accept'], participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const A2 = await seed(j, 'a2', {participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        await sect('seeded', async () => {
            const l = await L.openEditorial(ed, A1.id, 'a1-ed-landing');
            const r = await L.selectMenu(ed, 'Review Round 1', 'a1-ed-round1');
            await L.openAuthor(au, A1.id, 'a1-au-landing');
            const ra = await L.selectMenu(au, 'Review Round 1', 'a1-au-round1');
            fact('a1', {landing: l.title, ed: statusText(r), au: statusText(ra), actions: r.actionButtons});
            check('accepted.seeded', 'Rule 5 main: after Accept the round reads "Submission accepted."; 3.5 copy: never, "The submission is currently in the Copyediting stage."', {ed: statusText(r), au: statusText(ra)}, has(lines(r), 'Submission accepted.'));
        });
        await sect('onscreen', async () => {
            await L.openEditorial(ed, A2.id, 'a2-ed-before');
            await L.decide(P, ed, 'Accept Submission', 'a2-accept');
            const same = await L.reread(ed, 'a2-ed-after-accept');
            const r = await L.selectMenu(ed, 'Review Round 1', 'a2-ed-round1');
            await L.openEditorial(ed, A2.id, 'a2-ed-reloaded');
            const r2 = await L.selectMenu(ed, 'Review Round 1', 'a2-ed-round1-reloaded');
            fact('a2', {landing: same.title, samePage: statusText(r), reloaded: statusText(r2), stored: sql(`select status from review_rounds where submission_id = ${A2.id}`)});
            check('accepted.onscreen', 'Rule 5 main: after an on-screen Accept the round reads "Submission accepted."', {samePage: statusText(r), reloaded: statusText(r2)}, has(lines(r2), 'Submission accepted.'));
        });
    };

    // ===============================================================================================
    parts.back = async () => {
        const j = await journal('b', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const B1 = await seed(j, 'b1', {participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const B2 = await seed(j, 'b2', {decisions: [...SEND, 'accept'], participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const B3 = await seed(j, 'b3', {decisions: [...SEND, 'accept'], participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const back = async (s, label) => {
            const e = await L.openEditorial(ed, s.id, `${label}-copyediting`);
            fact(`${label}-copyediting`, {title: e.title, actions: e.actionButtons});
            await L.decide(P, ed, BACK, `${label}-back`);
            await L.openEditorial(ed, s.id, `${label}-landing`);
            return L.reread(ed, `${label}-returned`);
        };
        await sect('confirmed-first', async () => {
            await L.openEditorial(ed, B1.id, 'b1-unread');
            fact('b1-read', await L.editorReadReview(P, ed, j.n.rv1, {label: 'b1-review-details'}));
            const c = await L.openEditorial(ed, B1.id, 'b1-confirmed');
            await L.decide(P, ed, 'Accept Submission', 'b1-accept');
            const e = await back(B1, 'b1');
            const a = await L.openAuthor(au, B1.id, 'b1-au-returned');
            fact('b1', {beforeAccept: statusText(c), returned: statusText(e), author: statusText(a), title: e.title});
            check('returned.confirmed-first', 'Rule 5: confirmed before the Accept, then back from Copyediting: "Returned back to review."', statusText(e), eq(lines(e), ['Returned back to review.']));
            // Reading the confirmed review again after the return.
            fact('b1-reread', await L.editorReadReview(P, ed, j.n.rv1, {confirm: false, label: 'b1-review-details-again'}));
            const same = await L.reread(ed, 'b1-after-reread');
            const re = await L.openEditorial(ed, B1.id, 'b1-after-reread-reloaded');
            fact('b1-after-reread', {samePage: statusText(same), reloaded: statusText(re)});
            check('returned.reread', '3.5 copy: reading a review after the return replaces "Returned back to review." with a reviewer-derived sentence', statusText(re), !has(lines(re), 'Returned back to review.'));
        });
        await sect('unread-at-return', async () => {
            const e = await back(B2, 'b2');
            fact('b2-returned', {status: statusText(e), title: e.title});
            check('returned.unread', '3.5 copy: back from Copyediting with the review unread: "New reviews have been submitted."', statusText(e), eq(lines(e), ['New reviews have been submitted.']));
            fact('b2-read', await L.editorReadReview(P, ed, j.n.rv1, {label: 'b2-review-details'}));
            const same = await L.reread(ed, 'b2-confirmed-samepage');
            const re = await L.openEditorial(ed, B2.id, 'b2-confirmed-reloaded');
            fact('b2-confirmed', {samePage: statusText(same), reloaded: statusText(re)});
            check('returned.confirmed-after', 'Rule 5 main: once every review is completed and confirmed after the return, "Returned back to review." shows', statusText(re), eq(lines(re), ['Returned back to review.']));
        });
        await sect('confirmed-after-accept', async () => {
            await L.openEditorial(ed, B3.id, 'b3-copyediting-first');
            await L.selectMenu(ed, 'Review Round 1', 'b3-round1');
            fact('b3-read', await L.editorReadReview(P, ed, j.n.rv1, {label: 'b3-review-details'}));
            const e = await back(B3, 'b3');
            fact('b3-returned', statusText(e));
            check('returned.confirmed-after-accept', 'review confirmed on the past round after the Accept, then back: "Returned back to review."', statusText(e), eq(lines(e), ['Returned back to review.']));
        });
    };

    // ===============================================================================================
    parts.rec = async () => {
        const j = await journal('r', [['ed', 'Edda', 'Editorly', 'editor'], ['rec', 'Remy', 'Recommendly', 'sectionEditor'], ['rec2', 'Rina', 'Recotwo', 'sectionEditor'],
            ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const RO = (k) => ({username: j.u[k], role: 'sectionEditor', recommendOnly: true});
        const P1 = await seed(j, 'p1', {participants: [ED(j), RO('rec'), RO('rec2')], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        const P2 = await seed(j, 'p2', {participants: [ED(j), RO('rec')], reviewRounds: [{reviewers: []}]});
        const P4 = await seed(j, 'p4', {participants: [ED(j), RO('rec')], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'completed'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const rec = await L.actor(app, j.u.rec, j.J);
        const rec2 = await L.actor(app, j.u.rec2, j.J);
        const recommend = async (a, s, label) => {
            const i = await L.openEditorial(a, s.id, `${label}-before`);
            fact(`${label}-buttons`, i.actionButtons);
            await L.decide(P, a, 'Recommend Accept', label);
        };
        await sect('underway', async () => {
            const e0 = await L.openEditorial(ed, P1.id, 'p1-ed-none');
            await recommend(rec, P1, 'p1-rec1');
            const e1 = await L.openEditorial(ed, P1.id, 'p1-ed-one');
            await recommend(rec2, P1, 'p1-rec2');
            const e2 = await L.openEditorial(ed, P1.id, 'p1-ed-two');
            fact('p1', {none: statusText(e0), one: statusText(e1), two: statusText(e2), box1: e1.recommendation, box2: e2.recommendation});
            check('rec.underway.none', '3.5 copy: a review underway, no recommendation in: "Awaiting responses from reviewers."', statusText(e0), eq(lines(e0), ['Awaiting responses from reviewers.']));
            check('rec.underway.one', '3.5 copy: a review underway, one of two recommendations in: "New editorial recommendations have been submitted."', statusText(e1), eq(lines(e1), ['New editorial recommendations have been submitted.']));
            check('rec.underway.two', 'a review underway, both in: "All recommendations are in and a decision is needed."', statusText(e2), eq(lines(e2), ['All recommendations are in and a decision is needed.']));
        });
        await sect('no-reviewer', async () => {
            const e0 = await L.openEditorial(ed, P2.id, 'p2-ed-none');
            await recommend(rec, P2, 'p2-rec');
            const e1 = await L.openEditorial(ed, P2.id, 'p2-ed-one');
            fact('p2', {pending: statusText(e0), recorded: statusText(e1), box: e1.recommendation});
            check('rec.none.pending', 'Rule 6 main: no reviewer, recommendation pending: "Waiting for reviewers to be assigned."', statusText(e0), eq(lines(e0), ['Waiting for reviewers to be assigned.']));
            check('rec.none.recorded', '3.5 copy: no reviewer, the only recommendation in: "All recommendations are in and a decision is needed."', statusText(e1), eq(lines(e1), ['All recommendations are in and a decision is needed.']));
        });
        await sect('unread', async () => {
            const e0 = await L.openEditorial(ed, P4.id, 'p4-ed-none');
            await recommend(rec, P4, 'p4-rec');
            const e1 = await L.openEditorial(ed, P4.id, 'p4-ed-one');
            fact('p4', {pending: statusText(e0), recorded: statusText(e1)});
            check('rec.unread.pending', 'an unread review, recommendation pending: "New reviews have been submitted."', statusText(e0), eq(lines(e0), ['New reviews have been submitted.']));
            check('rec.unread.recorded', '3.5 copy: an unread review, the recommendation in: "All recommendations are in and a decision is needed."', statusText(e1), eq(lines(e1), ['All recommendations are in and a decision is needed.']));
        });
    };

    // ===============================================================================================
    parts.rev = async () => {
        const j = await journal('v', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const done = [{reviewers: [{username: j.u.rv1, status: 'completed'}]}];
        const E1 = await seed(j, 'e1', {decisions: [...SEND, 'requestRevisions'], participants: [ED(j)], reviewRounds: done});
        const E2 = await seed(j, 'e2', {decisions: [...SEND, 'resubmit'], participants: [ED(j)], reviewRounds: done});
        const U1 = await seed(j, 'u1', {decisions: [...SEND, 'requestRevisions'], participants: [ED(j)], reviewRounds: done});
        const U2 = await seed(j, 'u2', {decisions: [...SEND, 'requestRevisions'], participants: [ED(j)], reviewRounds: done});
        const U3 = await seed(j, 'u3', {decisions: [...SEND, 'resubmit'], participants: [ED(j)], reviewRounds: done});
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        for (const [s, k, want] of [[E1, 'e1', 'Revisions have been submitted and a decision is needed.'], [E2, 'e2', 'Revisions submitted. A new review round needs to be created.']]) {
            await sect(`editor-${k}`, async () => {
                const b = await L.openEditorial(ed, s.id, `${k}-ed-before`);
                const same = await editorUpload(ed, L.txtNamed(`${s.tag}-ed.txt`), `${k}-ed-after-upload`);
                const re = await L.openEditorial(ed, s.id, `${k}-ed-reloaded`);
                fact(`${k}`, {before: statusText(b), samePage: statusText(same), reloaded: statusText(re), rows: rowsOf(re, 'Revisions Uploaded')});
                check(`filed.${k}`, `Rule 5 (3.5 copy): a revision the editor files flips the round to "${want}"`, {samePage: statusText(same), reloaded: statusText(re)}, eq(lines(re), [want]) && eq(lines(same), [want]));
            });
        }
        await sect('close', async () => {
            const since = new Date(Date.now() - 2000);
            const f = L.txtNamed(`${U1.tag}-closed.txt`);
            await L.openAuthor(au, U1.id, 'u1-au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = await attach(au.page, f);
            const n0 = au.nativeDialogs.length;
            await dlg.getByRole('button', {name: 'Close', exact: true}).first().click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(800);
            const same = await L.reread(au, 'u1-au-closed');
            const re = await L.openAuthor(au, U1.id, 'u1-au-closed-reloaded');
            const e = await L.openEditorial(ed, U1.id, 'u1-ed-after');
            const m = await app.mail.find({to: mailTo(j.u.ed), subject: REVISED, since, timeoutMs: 20000}).catch(() => null);
            const row = await L.myRow(au, U1.title, 'u1-au-mysubmissions');
            fact('u1', {dialogs: au.nativeDialogs.slice(n0), samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded'), editor: statusText(e), mail: m && {subject: m.Subject, from: m.From}, myRow: row});
            check('close.question', 'Side effects (3.5 copy): the header "Close" after the attach first asks "The data on this form has changed. Do you wish to continue without saving?"', au.nativeDialogs.slice(n0), au.nativeDialogs.slice(n0).some((d) => /The data on this form has changed/.test(d.message)));
            check('close.keeps', 'Side effects: the file stays (same page and after a reload) and the email stands', {same: rowsOf(same, 'Revisions Uploaded'), re: rowsOf(re, 'Revisions Uploaded'), mail: !!m}, has(rowsOf(same, 'Revisions Uploaded'), f.name) && has(rowsOf(re, 'Revisions Uploaded'), f.name) && !!m);
            check('a14.row', 'A14 (3.5 copy): the author\'s My Submissions row reads "Review update" with a count', row.text, /Review update \d+\/\d+/.test(row.text || ''));
        });
        await sect('a11', async () => {
            const since = new Date(Date.now() - 2000);
            const f = L.txtNamed(`${U2.tag}-cancelled.txt`);
            await L.openAuthor(au, U2.id, 'u2-au-before');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = await attach(au.page, f);
            const controls = await dlg.locator('a:visible, button:visible').allInnerTexts().then((x) => x.map((y) => flat(y)).filter(Boolean));
            const m = await app.mail.find({to: mailTo(j.u.ed), subject: REVISED, since, timeoutMs: 20000}).catch(() => null);
            const n0 = au.nativeDialogs.length;
            await dlg.getByRole('link', {name: 'Cancel'}).click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(800);
            const same = await L.reread(au, 'u2-au-after-cancel');
            const re = await L.openAuthor(au, U2.id, 'u2-au-after-cancel-reloaded');
            const e = await L.openEditorial(ed, U2.id, 'u2-ed-after-cancel');
            await sleep(1500);
            const count = await countRevised(j.u.ed, since);
            fact('u2', {controls, mailAtAttach: !!m, dialogs: au.nativeDialogs.slice(n0), notices: same.notices, samePage: rowsOf(same, 'Revisions Uploaded'), reloaded: rowsOf(re, 'Revisions Uploaded'),
                editor: statusText(e), mails: count, rows: sql(`select count(*) from submission_files where submission_id = ${U2.id} and file_stage = 15`)});
            check('a11.file', 'A11: "Cancel" removes the file ("No Items", same page and reload), the box back to "Revisions have been requested.", one email stands',
                {same: rowsOf(same, 'Revisions Uploaded'), re: rowsOf(re, 'Revisions Uploaded'), editor: statusText(e), count}, eq(rowsOf(re, 'Revisions Uploaded'), ['No Items']) && eq(lines(e), ['Revisions have been requested.']) && count === 1);
            check('a11.silent', 'A11 (3.5 copy): "Cancel" asks nothing and shows no notice', {dialogs: au.nativeDialogs.slice(n0), notices: same.notices}, au.nativeDialogs.length === n0 && !(same.notices || []).length);
        });
        await sect('resubmit-row', async () => {
            await authorUpload(au, U3.id, L.txtNamed(`${U3.tag}-rev.txt`), 'u3-au');
            const row = await L.myRow(au, U3.title, 'u3-au-mysubmissions');
            fact('u3-row', row);
            check('a13.row', 'A13 (3.5 copy): after the new-round upload the My Submissions row reads "Review update" with a count', row.text, /Review update \d+\/\d+/.test(row.text || ''));
        });
    };

    // ===============================================================================================
    parts.mail = async () => {
        const people = [['mgr', 'Mona', 'Managerly', 'manager'], ['mgrp', 'Mira', 'Managerpart', 'manager'], ['ed', 'Edda', 'Editorly', 'editor'],
            ['ed2', 'Eddie', 'Unassigned', 'editor'], ['ed3', 'Edna', 'Later', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'],
            ['fc', 'Fran', 'Funderly', 'funding'], ['au', 'Avery', 'Authorly', 'author']];
        if (!isOMP) people.push(['ge', 'Gene', 'Guestly', 'guestEditor']);
        const j = await journal('m', people);
        const part = [ED(j), {username: j.u.se, role: 'sectionEditor'}, {username: j.u.fc, role: 'funding'}, {username: j.u.mgrp, role: 'manager'}];
        if (!isOMP) part.push({username: j.u.ge, role: 'guestEditor'});
        const s = await seed(j, 'm', {decisions: [...SEND, 'requestRevisions'], participants: part});
        const assigned = isOMP ? ['ed', 'se'] : ['ed', 'se', 'ge'];
        const lastLogin = () => sql(`select username, coalesce(to_char(date_last_login, 'HH24:MI:SS'), 'null') from users where username like '${j.J}%' order by 1`);
        // The Section editor signs in now, before any notice; later they only reload a page.
        const se = await L.actor(app, j.u.se, j.J);
        await L.openEditorial(se, s.id, 'se-before');
        const ed = await L.actor(app, j.u.ed, j.J);
        const au = await L.actor(app, j.u.au, j.J);
        const since = new Date(Date.now() - 2000);
        fact('login-start', lastLogin());
        await sect('attach', async () => {
            await L.openEditorial(ed, s.id, 'ed-requested');
            await L.openAuthor(au, s.id, 'au-requested');
            await au.page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
            const dlg = await attach(au.page, L.txtNamed(`${s.tag}-rev1.txt`));
            const got = {};
            for (const k of assigned) {
                const m = await app.mail.find({to: mailTo(j.u[k]), subject: REVISED, since, timeoutMs: 20000}).catch(() => null);
                got[k] = m ? {subject: m.Subject, from: `${m.From && m.From.Name} <${m.From && m.From.Address}>`} : null;
            }
            const none = {};
            for (const k of ['mgr', 'mgrp', 'ed2', 'fc']) none[k] = await countRevised(j.u[k], since);
            fact('first-notice', {got, none, participantsPanel: null});
            check('l.recipients', `Side effects: the assigned ${assigned.join(', ')} get "${REVISED}" at the attach`, got, assigned.every((k) => got[k]));
            check('l.sender', 'sent under the author\'s own name and address', got, assigned.every((k) => got[k] && got[k].from === `${j.n.au} <${mailTo(j.u.au)}>`));
            check('l.not-jm-fc', 'Side effects (3.5 copy): no notice to a Journal/Press manager (seeded as a participant or not), an unassigned editor, the assigned Funding Coordinator', none, Object.values(none).every((c) => c === 0));
            await dlg.getByRole('button', {name: 'Close', exact: true}).first().click();
            await dlg.first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            const pi = await L.openEditorial(ed, s.id, 'ed-participants');
            fact('participants-panel', flat(pi.text, 1500));
        });
        await sect('throttle', async () => {
            await P.assignParticipant(ed.page, {group: EDITOR_GROUP, name: j.n.ed3, searchName: j.u.ed3});
            await L.reread(ed, 'ed-after-assign');
            await sleep(1500);
            // The Section editor reloads a page in the session opened before the notice.
            await se.page.reload(); await idle(se.page);
            await L.openEditorial(se, s.id, 'se-reloaded');
            fact('login-after-se-reload', lastLogin());
            await authorUpload(au, s.id, L.txtNamed(`${s.tag}-rev2.txt`), 'au-second');
            await sleep(3000);
            const after2 = {};
            for (const k of [...assigned, 'ed3']) after2[k] = await countRevised(j.u[k], since);
            fact('after-second', after2);
            await sleep(1500);
            await L.actor(app, j.u.ed, j.J);
            await sleep(1500);
            fact('login-after-ed-signin', lastLogin());
            await authorUpload(au, s.id, L.txtNamed(`${s.tag}-rev3.txt`), 'au-third');
            const after3 = {ed: await pollCount(j.u.ed, 2, since)};
            for (const k of [...assigned.filter((x) => x !== 'ed'), 'ed3']) after3[k] = await countRevised(j.u[k], since);
            fact('after-third', after3);
            check('l.throttle', 'a further upload within the day: nothing to an editor already notified who has not signed in since', after2, assigned.every((k) => after2[k] === 1));
            check('l.reload', '3.5 copy: a page reload is not a sign-in (the Section editor who reloaded is not notified again)', after3.se, after3.se === 1);
            check('l.signin', 'after the Editor signs in again, a further upload notifies that Editor', after3.ed, after3.ed === 2);
            check('l.later', '3.5 copy: an editor assigned after the notice, never signed in since, gets nothing', {after2: after2.ed3, after3: after3.ed3}, after2.ed3 === 0 && after3.ed3 === 0);
            const moved = sql(`update email_log set date_sent = date_sent - interval '2 days' where assoc_id = ${s.id} and event_type = ${LOG_REVISED} returning log_id`);
            fact('log-backdated', moved);
            await authorUpload(au, s.id, L.txtNamed(`${s.tag}-rev4.txt`), 'au-fourth');
            const after4 = {se: await pollCount(j.u.se, 2, since)};
            for (const k of [...assigned.filter((x) => x !== 'se'), 'ed3']) after4[k] = await countRevised(j.u[k], since);
            fact('after-fourth', after4);
            check('l.day', '3.5 copy: once the last notice is a day old, the next upload emails every assigned editor (ed3 included)', after4,
                after4.se === 2 && after4.ed3 === 1 && assigned.every((k) => after4[k] === after3[k] + 1));
            fact('email-log', sql(`select to_char(date_sent, 'MM-DD HH24:MI:SS'), recipients from email_log where assoc_id = ${s.id} and event_type = ${LOG_REVISED} order by log_id`));
        });
    };

    // ===============================================================================================
    parts.files = async () => {
        const j = await journal('i', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const s = await seed(j, 'i', {participants: [ED(j)], files: [{file: 'article.pdf'}], reviewRounds: [{reviewers: [], files: [{file: 'notes.md'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const filesDlg = (page) => page.getByRole('dialog').filter({hasText: /Current Review Files For Round/});
        const boxes = (page) => filesDlg(page).last().evaluate((d) => [...d.querySelectorAll('input[type=checkbox]')]
            .filter((b) => b.name && b.name.startsWith('selectedFiles') && b.getClientRects().length > 0)
            .map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)})));
        await sect('untick', async () => {
            await L.openEditorial(ed, s.id, 'ed-round');
            let dlg = await P.openReviewFilesDialog(ed.page);
            await P.showFilesFromAllStages(ed.page, dlg);
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().waitFor({timeout: 20000});
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().check();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const t1 = await L.reread(ed, 'ed-ticked');
            dlg = await P.openReviewFilesDialog(ed.page);
            const ticked = await boxes(ed.page);
            // Untick every box that reads ticked (the seeded round file `notes.md` arrives ticked; a file
            // ticked in from the Submission stage reads unticked again on reopening: A7).
            await P.reviewFilesCheckbox(dlg, 'article.pdf').first().uncheck();
            await P.reviewFilesCheckbox(dlg, 'notes.md').first().uncheck();
            await P.confirmReviewFilesDialog(ed.page, dlg);
            const same = await L.reread(ed, 'ed-unticked');
            const re = await L.openEditorial(ed, s.id, 'ed-unticked-reloaded');
            dlg = await P.openReviewFilesDialog(ed.page);
            const again = await boxes(ed.page);
            await snap(ed.page, 'dialog-reopened');
            await filesDlg(ed.page).getByRole('link', {name: 'Cancel'}).click().catch(() => {});
            await filesDlg(ed.page).first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            fact('untick', {tickedPanel: rowsOf(t1, 'Files for Review'), ticked, notices: same.notices, samePage: rowsOf(same, 'Files for Review'), reloaded: rowsOf(re, 'Files for Review'), reopened: again,
                db: sql(`select sf.submission_file_id, sf.file_stage, sf.viewable from review_round_files rrf join submission_files sf on sf.submission_file_id = rrf.submission_file_id where rrf.submission_id = ${s.id} order by 1`)});
            check('a7.untick', 'A7: untick + OK reports "Review files updated." and the panel lists the file as before', {notices: same.notices, re: rowsOf(re, 'Files for Review')}, has(same.notices, 'Review files updated.') && has(rowsOf(re, 'Files for Review'), 'article.pdf'));
        });
        await sect('reviewer', async () => {
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
            await modal.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\S/}).waitFor({timeout: 30000}).catch(() => {});
            await sleep(1500); await idle(page);
            const formFiles = await modal.evaluate((d) => [...d.querySelectorAll('input[type=checkbox]')].filter((b) => /selectedFiles/.test(b.name || '') && b.getClientRects().length > 0)
                .map((b) => ({checked: b.checked, row: (b.closest('tr')?.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120)})));
            await snap(page, 'add-reviewer-form');
            fact('add-reviewer-files', formFiles);
            check('a7.form', 'A7 (3.5 copy): the "Add Reviewer" form lists the unticked files, ticked', formFiles, ['article.pdf', 'notes.md'].every((f) => formFiles.some((x) => x.row.includes(f) && x.checked)));
            await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page);
            const rv1 = await L.actor(app, j.u.rv1, j.J);
            const txt = await L.reviewerToStep3(rv1, s.id);
            await snap(rv1.page, 'rv1-step3');
            fact('reviewer-files', {pdf: txt.includes('article.pdf'), notes: txt.includes('notes.md'),
                grants: sql(`select rf.submission_file_id from review_files rf join review_assignments ra on ra.review_id = rf.review_id where ra.submission_id = ${s.id} order by 1`)});
            check('a7.reviewer', 'A7 (3.5 copy): the reviewer added after the untick is given the files (their page lists them)', {pdf: txt.includes('article.pdf'), notes: txt.includes('notes.md')}, txt.includes('article.pdf') && txt.includes('notes.md'));
        });
    };

    // ===============================================================================================
    parts.choice = async () => {
        const j = await journal('c', [['ed', 'Edda', 'Editorly', 'editor'], ['au', 'Avery', 'Authorly', 'author'], ['rv1', 'Rhea', 'Revone', 'externalReviewer']]);
        const s = await seed(j, 'c', {participants: [ED(j)], reviewRounds: [{reviewers: [{username: j.u.rv1, status: 'accepted'}]}]});
        const ed = await L.actor(app, j.u.ed, j.J);
        const NEW = 'Revisions will be subject to a new round of peer reviews.';
        await sect('reopen', async () => {
            await L.openEditorial(ed, s.id, 'ed-round');
            let c = await L.openChoice(ed, 'choice-first');
            const first = c.radios;
            await c.modal.getByRole('radio', {name: NEW}).check();
            const closer = c.modal.getByRole('button', {name: /^(Close|Cancel)$/}).first();
            const closedWith = flat(await closer.innerText().catch(() => null)) || await closer.getAttribute('aria-label');
            await closer.click();
            await c.modal.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await sleep(700);
            c = await L.openChoice(ed, 'choice-reopened');
            const reopened = c.radios;
            await c.modal.getByRole('button', {name: /^(Close|Cancel)$/}).first().click();
            await sleep(700);
            await L.openEditorial(ed, s.id, 'ed-reloaded');
            c = await L.openChoice(ed, 'choice-after-reload');
            const reloaded = c.radios;
            await c.modal.getByRole('button', {name: /^(Close|Cancel)$/}).first().click();
            fact('choice', {first, closedWith, reopened, reloaded, buttons: c.buttons, dialogs: ed.nativeDialogs.slice()});
            const ticked = (r) => (r.find((x) => x.checked) || {}).label;
            check('choice.first', 'Rule 11: "Revisions will not be subject…" preselected when the window first opens', first, /will not be subject/.test(ticked(first) || ''));
            check('choice.reopened', '3.5 copy: closed and reopened without leaving the page, the window shows the choice last ticked', reopened, ticked(reopened) === NEW);
            check('choice.reloaded', 'after a reload the window opens on the preselected choice again', reloaded, /will not be subject/.test(ticked(reloaded) || ''));
        });
    };

    // ===============================================================================================
    parts.sugg = async () => {
        const people = [['ed', 'Edda', 'Editorly', 'editor'], ['se', 'Sena', 'Sectionly', 'sectionEditor'], ['au', 'Avery', 'Authorly', 'author']];
        const jy = await journal('sy', people, {review: {reviewerSuggestionEnabled: true}});
        const jn = await journal('sn', people);
        const A = await seed(jy, 'with', {participants: [ED(jy), {username: jy.u.se, role: 'sectionEditor'}],
            reviewerSuggestions: [{givenName: 'Sugg', familyName: 'Gested', email: `${jy.J}sugg@mail.test`, affiliation: 'K13b University', suggestionReason: 'K13b suggestion reason.'}]});
        const B = await seed(jy, 'none', {participants: [ED(jy)]});
        const C = await seed(jn, 'off', {participants: [ED(jn)]});
        const read = async (a, s, label, author) => {
            const info = author ? await L.openAuthor(a, s.id, label) : await L.openEditorial(a, s.id, label);
            const ptext = await a.page.evaluate(() => {
                const h = [...document.querySelectorAll('[role=dialog] h3')].find((x) => /Reviewers Suggested by Author/i.test(x.textContent));
                if (!h) return null;
                let box = h.parentElement;
                for (let i = 0; i < 4 && box && box.innerText.trim().length < h.innerText.trim().length + 10; i++) box = box.parentElement;
                return box ? box.innerText.replace(/\s+/g, ' ').trim().slice(0, 600) : null;
            });
            return {panel: (info.headings || []).filter((h) => /Suggested/i.test(h)), panelText: ptext, named: (ptext || '').includes('Sugg Gested'), reason: (ptext || '').includes('K13b suggestion reason.'), affiliation: (ptext || '').includes('K13b University'), title: info.title};
        };
        await sect('read', async () => {
            const ed = await L.actor(app, jy.u.ed, jy.J);
            const se = await L.actor(app, jy.u.se, jy.J);
            const au = await L.actor(app, jy.u.au, jy.J);
            const edn = await L.actor(app, jn.u.ed, jn.J);
            const got = {edWith: await read(ed, A, 'ed-with'), seWith: await read(se, A, 'se-with'), auWith: await read(au, A, 'au-with', true),
                edNone: await read(ed, B, 'ed-none'), edOff: await read(edn, C, 'ed-off')};
            fact('sugg', got);
            check('sugg.with', 'Settings: enabled, a submission with a suggestion: the editorial round carries "Reviewers Suggested by Author" (name, affiliation, reason)', got.edWith, got.edWith.panel.length > 0 && got.edWith.named && got.edWith.reason);
            check('sugg.none', 'Settings main ("adds a panel to the stage"): enabled, a submission without suggestions shows the panel too', got.edNone, got.edNone.panel.length > 0);
            check('sugg.author', '3.5 copy: the author\'s view never shows it', got.auWith, got.auWith.panel.length === 0);
            check('sugg.off', 'control: setting off, no panel', got.edOff, got.edOff.panel.length === 0);
        });
    };

    // ===============================================================================================
    parts.ops = async () => {
        const j = await journal('o', [['au', 'Avery', 'Authorly', 'author'], ['mgr', 'Mona', 'Managerly', 'manager']]);
        const s = isOPS ? await seed(j, 'o', {decisions: [], reviewRounds: []}) : await seed(j, 'o', {});
        const au = await L.actor(app, j.u.au, j.J);
        await sect('old-address', async () => {
            await au.page.goto(`/index.php/${j.J}/user/profile`);
            await au.page.goto(`/index.php/${j.J}/authorDashboard/submission/${s.id}`);
            await idle(au.page);
            await au.page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 45000}).catch(() => {});
            const info = await L.reread(au, 'au-old-address');
            fact('old-address', {url: au.page.url().replace(app.baseURL, ''), title: info.title, headings: info.headings.slice(0, 12), menu: info.menu});
            check('rule17', `Rule 17: the old author address lands on My Submissions with the workflow open${isOPS ? ' (3.5 copy: on "Title & Abstract")' : ''}`, {url: au.page.url().replace(app.baseURL, ''), title: info.title, headings: (info.headings || []).slice(0, 4)},
                /mySubmissions/.test(au.page.url()) && (info.headings || []).some((h) => /Workflow:|Preprint:/.test(h)) && (!isOPS || (info.headings || []).some((h) => /Title & Abstract/.test(h))));
        });
    };

    // ===============================================================================================
    for (const part of PARTS) {
        if (!parts[part]) continue;
        if (isOPS && part !== 'ops') continue;
        L.startPart(part);
        log(`== ${app.name} ${part}`);
        try { await parts[part](); } catch (e) { check(`${part}.FAILED`, 'the part runs', String(e.stack || e).slice(0, 900), false); }
        L.endPart();
        await L.closeActors();
    }
});
