// U26 claim check, chunk K13a: the housekeeping session's incidental rows of 2026-11-13 for the
// review-stage spec (docs/tracking/incidentals.md, feature U26), driven on `main`.
//
// Row 1 (OJS, OMP): Rule 9 (Revisions Uploaded), register A1 and note i: what the Author's
// "Upload" above "Revisions Uploaded" and the bottom "Upload revisions" button offer and open on
// each round state, and the editor's own "Upload" there. A scratch context `t` with ed (Journal /
// Press editor, manager level), se (Section Editor, on the stage), au (the submitter), rv1..rv4
// (external reviewers). Submissions (seeded; `up` phase):
//   N  round 1, no reviewer                      author: offers, press "Upload"; editor: offers,
//                                                press "Upload", pick a component, leave by "Close"
//   C  round 1, rv1 completed (no decision)      author: offers, press "Upload"
//   A  rv1 completed, accepted (Copyediting)     author on the review round: offers, press "Upload",
//                                                an upload there (same page, then reopened)
//   Q  rv1 completed, requestRevisions           author: both buttons pressed (what each opens),
//                                                an upload through "Upload revisions" (same page,
//                                                then reopened), a second through "Upload"; the
//                                                file rows' menus for author and editor
//   R  rv1 completed, resubmit (new round asked) author: the same, the A1 path
//   E  rv1 completed, requestRevisions           (`del` phase) note i: the editor's "Upload" files a
//                                                revision for the author, the row's menu, "Delete"
//                                                and its question (same page, then reopened)
// Row 2 (OJS, OMP): register A4 and Rule 5/6's reviewer-record sentences (`cancel` phase):
//   X1 rv1 accepted, then "Cancel Reviewer"      box read by ed (same page, reopened), se, au;
//                                                the editorial dashboard's row
//   X2 rv1, rv2 accepted, both cancelled         box read by ed (after the first and the second)
//   X3 rv1 declined (seeded), rv2 accepted then cancelled
//   D  rv1 declined (seeded)                     A4's own case
//   U  rv1 invited, then "Unassign Reviewer"     the zero-record control
//   N  (above)                                   "Waiting for reviewers to be assigned."
// OPS (`ops` phase): the read-only control: no review rounds, the author's workflow carries neither
// "Revisions Uploaded" nor "Upload revisions".
//
//   PROBE_RUN=r1 PROBE_FEATURE=U26 PROBE_AGENT=ccK13a bin/app-lock.sh shared ojs,omp -- node bin/probe.js all shared/playwright/checks/U26/K13a/k13a.js
//   PROBE_RUN=r2 …  (the second, independent run: its own scratch context)
//   PHASES=up,del,cancel,ops (default all; acc: submission A alone, which `up` includes).
//   Requires the helper libraries of three issue walks under ../../issues/ (author-revisions-upload-
//   offered-then-refused, author-update-file-details-offered-then-refused, change-file-keeps-first-
//   upload); no other script runs first and no file is read between runs. Facts land in
//   .reports/U26/ccK13a/k13a-facts-<run>-<app>.json, snapshots as k13a-<nn>-<label>-<run>-<app>.json.
//   2026-11-13 runs: r1, r2 on all three apps (r1 on ojs before `acc` and `del` existed); r3 PHASES=acc on
//   ojs; d1, d2 PHASES=del on ojs, omp.
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag} = require('../../../probe');
const A = require('../../issues/author-revisions-upload-offered-then-refused/lib.js');
const L = require('../../issues/author-update-file-details-offered-then-refused/lib.js');
const W = require('../../issues/change-file-keeps-first-upload/lib.js');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['up', 'del', 'cancel', 'ops'];
const on = (p) => PHASES.includes(p);
const RUN = process.env.PROBE_RUN || 'r0';
const T = 60_000;
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 600));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[k13a ${RUN}]`, ...a);

/** Every visible "… Status" box of the open workflow: its heading and its whole text. */
const statusOf = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    return [...document.querySelectorAll('[role="dialog"] h2, [role="dialog"] h3')].filter(vis)
        .filter((h) => /Status$/.test(h.innerText.trim()))
        .map((h) => { const b = h.closest('div.border') || h.parentElement; return {heading: h.innerText.trim(), text: b.innerText.replace(/\s+/g, ' ').trim().slice(0, 400)}; });
});
/** The "Revisions Uploaded" panel's whole text (heading, description, buttons, rows). */
const panelText = async (page) => flat(await page.locator('div')
    .filter({has: page.getByRole('heading', {name: A.LIST, exact: true, level: 3})})
    .filter({has: A.listTable(page)}).last().innerText().catch(() => null), 500);

forEachApp(async (app) => {
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const facts = {app: app.name, run: RUN, line: app.line || 'main'};
    const fact = (k, v) => { facts[k] = v; log(app.name, k, JSON.stringify(v).slice(0, 1500)); };
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { (facts.nativeDialogs = facts.nativeDialogs || []).push({type: d.type(), message: flat(d.message(), 200), at: page.url().slice(-120)}); await d.accept().catch(() => {}); });
    let n = 0;
    const snap = async (label) => {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: flat(e.message, 200)}; }
        const id = `k13a-${String(++n).padStart(2, '0')}-${label}`;
        record(id, s);
        await shot(page, id).catch(() => {});
        return {name: id, s};
    };
    const sect = async (name, fn) => {
        try { await fn(); } catch (e) { fact(`${name}-FAILED`, flat(e.stack || e.message, 1200)); await snap(`${name}-failed`).catch(() => {}); }
    };

    try {
        const t = tag('u26ccK13a');
        const u = (k) => `${t}${k}`;
        const appx = {...app, contextPath: t};
        const signInAs = async (k) => { await signIn(page, u(k), {contextPath: t}); await idle(page); };

        if (isOPS) {
            if (!on('ops')) return;
            await sect('ops', async () => {
                await app.api.createContext({tag: t, context: {contactName: `Contact ${t}`, contactEmail: `${t}c@mail.test`}, users: [
                    {username: u('mgr'), roles: ['manager']}, {username: u('au'), roles: ['author']}]});
                let refused = null;
                try { await app.api.createSubmission({tag: `${t}x`, context: t, submitter: u('au'), reviewRounds: [{reviewers: []}]}); } catch (e) { refused = flat(e.message, 300); }
                fact('ops-reviewRounds-key', refused || 'accepted');
                const s = await app.api.createSubmission({tag: `${t}p`, context: t, submitter: u('au'), title: `OPS control ${t}`});
                for (const [who, view] of [['au', 'mySubmissions'], ['mgr', 'editorial']]) {
                    await signInAs(who);
                    await page.goto(app.url(`/index.php/${t}/en/dashboard/${view}?workflowSubmissionId=${s.submissionId}`));
                    await page.locator('[data-cy="sidemodal-header"]').first().waitFor({timeout: T});
                    await idle(page);
                    const sn = await snap(`ops-${who}-workflow`);
                    fact(`ops-${who}`, {snap: sn.name, revisionsUploaded: await page.getByRole('heading', {name: A.LIST, exact: true}).count(),
                        uploadRevisions: await A.uploadRevisionsButton(page).count(), status: await statusOf(page), dialog: flat(sn.s.text && sn.s.text.dialog, 900)});
                }
                await signOut(page);
            });
            return;
        }

        // ------------------------------------------------------------------ seed
        const names = {ed: ['Eda', 'Editorson'], se: ['Seth', 'Sectionson'], au: ['Alex', 'Authorson'],
            rv1: ['Rhea', 'Oneview'], rv2: ['Remy', 'Twoview'], rv3: ['Rosa', 'Threeview'], rv4: ['Ravi', 'Fourview']};
        const full = (k) => names[k].join(' ');
        await app.api.createContext({
            tag: t,
            context: {contactName: `Contact ${t}`, contactEmail: `${t}c@mail.test`},
            users: [
                {username: u('ed'), roles: ['editor'], givenName: names.ed[0], familyName: names.ed[1]},
                {username: u('se'), roles: ['sectionEditor'], givenName: names.se[0], familyName: names.se[1]},
                {username: u('au'), roles: ['author'], givenName: names.au[0], familyName: names.au[1]},
                ...['rv1', 'rv2', 'rv3', 'rv4'].map((k) => ({username: u(k), roles: ['externalReviewer'], givenName: names[k][0], familyName: names[k][1]})),
            ],
        });
        fact('context', t);
        const send = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
        const stage = isOMP ? {stage: 'external'} : {};
        const comp = isOMP ? 'Book Manuscript' : 'Article Text';
        const rv = (k, status) => ({username: u(k), status});
        const parts = [{username: u('ed'), role: 'editor'}, {username: u('se'), role: 'sectionEditor'}];
        const subs = {};
        const seed = async (key, decisions, reviewers) => {
            try {
                const s = await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`, context: t, submitter: u('au'), title: `${key} review ${t}`,
                    files: [{file: 'article.pdf'}], decisions: [...send, ...decisions], reviewRounds: [{...stage, files: [{file: 'notes.md'}], reviewers}], participants: parts});
                subs[key] = {id: s.submissionId, rounds: s.reviewRounds, title: `${key} review ${t}`};
                log(app.name, `seed ${key} #${s.submissionId}`, JSON.stringify(s.reviewRounds));
            } catch (e) { fact(`seed-${key}-refused`, flat(e.message, 600)); }
        };
        await seed('N', [], []);
        if (on('up')) {
            await seed('C', [], [rv('rv1', 'completed')]);
            await seed('Q', ['requestRevisions'], [rv('rv1', 'completed')]);
            await seed('R', ['resubmit'], [rv('rv1', 'completed')]);
        }
        if (on('del')) await seed('E', ['requestRevisions'], [rv('rv1', 'completed')]);
        if (on('up') || on('acc')) await seed('A', ['accept'], [rv('rv1', 'completed')]);
        if (on('cancel')) {
            await seed('X1', [], [rv('rv1', 'accepted')]);
            await seed('X2', [], [rv('rv1', 'accepted'), rv('rv2', 'accepted')]);
            await seed('X3', [], [rv('rv1', 'declined'), rv('rv2', 'accepted')]);
            await seed('D', [], [rv('rv1', 'declined')]);
            await seed('U', [], [rv('rv1', 'invited')]);
        }
        fact('subs', Object.fromEntries(Object.entries(subs).map(([k, s]) => [k, s.id])));
        const round1 = (s) => (s.rounds && s.rounds[0] ? {id: s.rounds[0].id, stageId: s.rounds[0].stageId} : null);

        // Sign in as `who`, open `s` (author view when `author`), read what the round offers; press
        // "Upload" above the list when `pressIt` and say what opened, then reopen the workflow.
        const look = async (key, who, s, {author = true, round = null, pressIt = false} = {}) => {
            await signInAs(who);
            await A.openWorkflow(page, appx, s.id, {author, round});
            const out = {who, sub: s.id, ...(await A.offers(page)), status: await statusOf(page), panel: await panelText(page), stored: A.storedRounds(app, s.id)};
            out.snap = (await snap(`${key}-page`)).name;
            if (pressIt && out.upload) {
                out.pressed = await A.press(page, A.uploadButton(page));
                out.pressedSnap = (await snap(`${key}-upload-window`)).name;
                await A.openWorkflow(page, appx, s.id, {author, round});
                out.rowsAfter = (await A.offers(page)).rows;
            }
            fact(key, out);
            return out;
        };
        // On the open workflow: what the page offers and the box, read again (same page or after reopening).
        const reread = async (key, label) => {
            const out = {...(await A.offers(page)), status: await statusOf(page), panel: await panelText(page)};
            out.snap = (await snap(label)).name;
            fact(key, out);
            return out;
        };

        // ------------------------------------------------------------------ row 1: the uploads
        if (on('up')) {
            await sect('N', async () => {
                const N = subs.N;
                await look('N-author', 'au', N, {pressIt: true});
                await loc(page, 'author view: "Upload" above "Revisions Uploaded"', A.uploadButton(page));
                await look('N-editor', 'ed', N, {author: false, pressIt: true});
                // The editor's wizard left with a component chosen, nothing uploaded, by the header's "Close".
                await A.uploadButton(page).first().click();
                await W.uploadBox(page).waitFor({state: 'attached', timeout: T});
                await idle(page);
                const sel = W.wizard(page).locator('select[id^="genreId"]');
                await sel.selectOption({label: comp});
                const before = await W.stepOne(page);
                const d0 = (facts.nativeDialogs || []).length;
                await W.wizard(page).getByRole('button', {name: /^Close/}).first().click();
                await W.wizard(page).waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
                await idle(page); await sleep(800);
                const left = await snap('N-editor-wizard-left');
                fact('N-editor-leave', {stepOne: before, dialogs: (facts.nativeDialogs || []).slice(d0), wizardStillOpen: await W.wizard(page).isVisible().catch(() => false),
                    notices: left.s.notices, rows: (await A.offers(page)).rows, snap: left.name});
            });
            await sect('C', async () => { await look('C-author', 'au', subs.C, {pressIt: true}); });
        }
        if (on('up') || on('acc')) {
            await sect('A', async () => {
                const round = round1(subs.A);
                const o = await look('A-author', 'au', subs.A, {round, pressIt: true});
                if (o.upload) {
                    // What an upload there leaves: read on the same page, then reopened.
                    fact('A-author-upload', await L.editorUpload(page, A.LIST, comp, L.smallFile('k13a-a-after-accept.txt')));
                    await reread('A-after-upload-samepage', 'A-after-upload-samepage');
                    await A.openWorkflow(page, appx, subs.A.id, {author: true, round});
                    await reread('A-after-upload-reopened', 'A-after-upload-reopened');
                }
                await look('A-editor', 'ed', subs.A, {author: false, round});
                fact('A-files', L.stored(app, subs.A.id));
            });
        }
        if (on('up')) {
            for (const key of ['Q', 'R']) {
                await sect(key, async () => {
                    const s = subs[key];
                    const first = `k13a-${key.toLowerCase()}-first.txt`;
                    const second = `k13a-${key.toLowerCase()}-second.txt`;
                    const o = await look(`${key}-author`, 'au', s, {pressIt: true});
                    if (o.uploadRevisions) {
                        const p = await A.press(page, A.uploadRevisionsButton(page));
                        const sn = await snap(`${key}-author-uploadrevisions-window`);
                        fact(`${key}-author-uploadrevisions-pressed`, {...p, snap: sn.name});
                        await A.openWorkflow(page, appx, s.id, {author: true});
                        fact(`${key}-first-upload`, await A.uploadThrough(page, A.uploadRevisionsButton(page), comp, L.smallFile(first)));
                        await reread(`${key}-after-first-samepage`, `${key}-after-first-samepage`);
                        await A.openWorkflow(page, appx, s.id, {author: true});
                        await reread(`${key}-after-first-reopened`, `${key}-after-first-reopened`);
                    }
                    if ((await A.offers(page)).upload) {
                        const p = await A.press(page, A.uploadButton(page));
                        const sn = await snap(`${key}-author-panel-upload-after-first`);
                        fact(`${key}-author-panel-upload-after-first`, {...p, snap: sn.name});
                        await A.openWorkflow(page, appx, s.id, {author: true});
                        fact(`${key}-second-upload`, await L.editorUpload(page, A.LIST, comp, L.smallFile(second)));
                        await reread(`${key}-after-second-samepage`, `${key}-after-second-samepage`);
                        await A.openWorkflow(page, appx, s.id, {author: true});
                        await reread(`${key}-after-second-reopened`, `${key}-after-second-reopened`);
                        fact(`${key}-author-row-menu`, await L.rowMenu(page, A.LIST, first).catch((e) => `threw ${flat(e.message, 120)}`));
                    }
                    const e = await look(`${key}-editor`, 'ed', s, {author: false});
                    if (e.rows && e.rows.length) fact(`${key}-editor-row-menu`, await L.rowMenu(page, A.LIST, first).catch((x) => `threw ${flat(x.message, 120)}`));
                    fact(`${key}-files`, L.stored(app, s.id));
                });
            }
        }

        // Note i: the editor files a revision through the panel's "Upload" on the author's behalf, then
        // deletes it from the row's menu (read on the same page, then reopened).
        if (on('del')) {
            await sect('E', async () => {
                const s = subs.E;
                const file = 'k13a-e-editor.txt';
                await look('E-editor', 'ed', s, {author: false});
                fact('E-editor-upload', await L.editorUpload(page, A.LIST, comp, L.smallFile(file)));
                await reread('E-after-upload-samepage', 'E-after-upload-samepage');
                await A.openWorkflow(page, appx, s.id);
                await reread('E-after-upload-reopened', 'E-after-upload-reopened');
                fact('E-editor-row-menu', await L.rowMenu(page, A.LIST, file));
                fact('E-files-before-delete', L.stored(app, s.id));
                const del = await L.deleteRow(page, A.LIST, file);
                fact('E-delete', del);
                await reread('E-after-delete-samepage', 'E-after-delete-samepage');
                await A.openWorkflow(page, appx, s.id);
                await reread('E-after-delete-reopened', 'E-after-delete-reopened');
                fact('E-files-after-delete', L.stored(app, s.id));
                await look('E-author', 'au', s);
            });
        }

        // ------------------------------------------------------------------ row 2: cancelled reviewers
        if (on('cancel')) {
            const rrow = (k) => page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: full(k)}).first();
            const act = async (k, entry) => {
                const r = rrow(k);
                await r.waitFor({timeout: T});
                await r.getByRole('button', {name: /More Actions/}).first().click();
                await page.getByRole('menuitem').first().waitFor({timeout: 10_000});
                const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
                if (!items.includes(entry)) { await r.getByRole('button', {name: /More Actions/}).first().click().catch(() => {}); return {items, absent: true}; }
                await page.getByRole('menuitem', {name: entry, exact: true}).click();
                const formId = entry === 'Cancel Reviewer' ? 'cancelReviewForm' : 'unassignReviewerForm';
                const m = page.getByRole('dialog').filter({has: page.locator(`form#${formId}`)}).last();
                await m.waitFor({timeout: T});
                await idle(page); await sleep(1500);
                await m.getByRole('button', {name: entry, exact: true}).click();
                await m.locator(`form#${formId}`).waitFor({state: 'hidden', timeout: 20_000}).catch(() => log(`${entry} window still open`));
                await idle(page); await sleep(1500);
                return {items, row: await rrow(k).count() ? flat(await rrow(k).innerText(), 200) : '(no row)'};
            };
            const readBox = async (key, who, s, {author = false} = {}) => {
                await signInAs(who);
                await A.openWorkflow(page, appx, s.id, {author});
                const out = {who, status: await statusOf(page), reviewers: await page.getByRole('table', {name: 'Reviewers', exact: true}).locator('tbody tr').allInnerTexts().then((r) => r.map((x) => flat(x, 160))).catch(() => null)};
                out.snap = (await snap(key)).name;
                fact(key, out);
                return out;
            };
            await sect('N-box', async () => { await readBox('N-box-ed', 'ed', subs.N); });
            await sect('D', async () => {
                await readBox('D-box-ed', 'ed', subs.D);
                await readBox('D-box-au', 'au', subs.D, {author: true});
            });
            await sect('U', async () => {
                await readBox('U-box-before', 'ed', subs.U);
                fact('U-unassign', await act('rv1', 'Unassign Reviewer'));
                await reread('U-box-samepage', 'U-box-samepage');
                await readBox('U-box-reopened', 'ed', subs.U);
            });
            await sect('X1', async () => {
                await readBox('X1-box-before', 'ed', subs.X1);
                fact('X1-cancel', await act('rv1', 'Cancel Reviewer'));
                await reread('X1-box-samepage', 'X1-box-samepage');
                await readBox('X1-box-reopened-ed', 'ed', subs.X1);
                await readBox('X1-box-se', 'se', subs.X1);
                await readBox('X1-box-au', 'au', subs.X1, {author: true});
                // The editorial dashboard's row of the submission (U23's "Editorial Activity" cell).
                await signInAs('ed');
                await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?currentViewId=active`));
                await idle(page);
                const row = page.getByRole('row').filter({hasText: subs.X1.title}).first();
                await row.waitFor({timeout: T}).catch(() => {});
                const sn = await snap('X1-dashboard');
                fact('X1-dashboard-row', {row: flat(await row.innerText().catch(() => null), 400), snap: sn.name});
            });
            await sect('X2', async () => {
                await readBox('X2-box-before', 'ed', subs.X2);
                fact('X2-cancel-rv1', await act('rv1', 'Cancel Reviewer'));
                await readBox('X2-box-one-cancelled', 'ed', subs.X2);
                fact('X2-cancel-rv2', await act('rv2', 'Cancel Reviewer'));
                await reread('X2-box-samepage', 'X2-box-samepage');
                await readBox('X2-box-both-cancelled', 'ed', subs.X2);
            });
            await sect('X3', async () => {
                await readBox('X3-box-before', 'ed', subs.X3);
                fact('X3-cancel-rv2', await act('rv2', 'Cancel Reviewer'));
                await readBox('X3-box-after', 'ed', subs.X3);
            });
            fact('round-status-stored', Object.fromEntries(['N', 'D', 'U', 'X1', 'X2', 'X3'].filter((k) => subs[k]).map((k) => [k, A.storedRounds(app, subs[k].id)])));
        }
        await signOut(page).catch(() => {});
    } catch (e) {
        fact('error', flat(e.stack || e.message, 1200));
        await snap('error').catch(() => {});
    } finally {
        record('k13a-facts', facts);
        await idle(page).catch(() => {});
        await close();
    }
});
