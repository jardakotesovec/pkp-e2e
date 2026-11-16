// U36 A7 issue walk: the Author's "Upload" above "Revisions Uploaded" shows on a review round that
// asks for no revisions, and its window refuses them. On PKP's default test dataset (a dataset
// fleet, harness.md "Dataset fleets"), journal or press `publicknowledge`. The kit builds nothing.
// A preprint server has no review rounds: not walked.
//
// MODE=walk (default):
//   OJS submission 7 (author dsokoloff; round 1, reviews ready); OMP submission 2 (afinkel;
//   external review round 1) and submission 17 (msmith; internal review round 1):
//   1 sign in as the author; 2 open the submission from "My Submissions"; 3 read what stands under
//   the round and above "Revisions Uploaded"; 4 press "Upload" above the list.
//   Control, OJS submission 13 (lkumiega), whose round 1 asks for revisions in the dataset: the
//   same steps. Accepted-round control: OJS 3 (ckwantes) and OMP 7 (dkennepohl), both in
//   copyediting, their external review round chosen in the workflow menu: "Upload" opens the wizard.
// MODE=nb, the neighbour alone (with a fix in and out), every step recorded, none throwing:
//   OJS 13 as lkumiega: both buttons, "Upload" takes u36n16h-revision.txt through the wizard, both
//     buttons again (revisions submitted).
//   OJS 10: dbarnes records "Request Revisions" with a new round ("Resubmit for Review"); jnovak:
//     both buttons, "Upload" takes a file, both buttons again (resubmission submitted).
//   OJS 13 again: dbarnes records "Create New Review Round"; lkumiega: round 1 and round 2.
//   OJS 3 as ckwantes (copyediting; round 1 accepted): the buttons, and what "Upload" opens.
//   OJS 2: dbarnes records "Decline Submission"; ccorino on the declined round (also MODE=declined, alone).
//   OJS 7 and OMP 2 as dbarnes: the editor's "Upload" above the list opens the wizard.
//   OMP 16: dbarnes records "Request Revisions"; mpower: both buttons, "Upload" opens the wizard.
//   OMP 11 as jlockehart (copyediting): the internal review round, sent on to external review.
//   OMP 12: dbarnes records "Accept Submission" from internal review; lelder on that round.
//
// Reset first:  npm run fleet-prep -- --feature issues-n16h --dataset 2 --reset
// Run (main):   PROBE_FEATURE=issues-n16h PROBE_AGENT=n16h node bin/probe.js ojs,omp shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-n16h-3_5 --dataset 2 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-n16h-3_5 PROBE_AGENT=n16h node bin/probe.js ojs,omp shared/playwright/checks/issues/author-revisions-upload-offered-then-refused/walk.js
// Facts: .reports/<feature>/<agent>/a7-facts-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record, idle} = require('../../../probe');
const A = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const FILE = 'u36n16h-revision.txt';
const CASES = {
    ojs: {
        component: 'Article Text',
        walk: [{key: 'noRevisions', id: 7, author: 'dsokoloff'}, {key: 'control', id: 13, author: 'lkumiega'}, {key: 'acceptedControl', id: 3, author: 'ckwantes', accepted: true}],
        nb: {requested: {id: 13, author: 'lkumiega'}, newRound: {id: 13, author: 'lkumiega'}, resubmit: {id: 10, author: 'jnovak'}, accepted: {id: 3, author: 'ckwantes'}, declined: {id: 2, author: 'ccorino'}, editor: {id: 7}},
    },
    omp: {
        component: 'Book Manuscript',
        walk: [{key: 'noRevisionsExternal', id: 2, author: 'afinkel'}, {key: 'noRevisionsInternal', id: 17, author: 'msmith'}, {key: 'acceptedControl', id: 7, author: 'dkennepohl', accepted: true}],
        nb: {request: {id: 16, author: 'mpower'}, sentOn: {id: 11, author: 'jlockehart', stageId: 2}, acceptedInternal: {id: 12, author: 'lelder'}, editor: {id: 2}},
    },
};

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) { console.log(`[a7 ${app.name}] no review rounds: not walked`); return; }
    const o = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    const rounds = A.watchRounds(page);
    let n = 0;
    const snap = async (name) => {
        const data = await screen(page).catch((e) => ({url: page.url(), error: A.flat(e.message)}));
        const id = `a7-${MODE}-${String(++n).padStart(2, '0')}-${name}`;
        record(id, data);
        await shot(page, id).catch(() => {});
        return data;
    };
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {threw: A.flat(e.message, 400)}; await snap(`${key}-threw`).catch(() => {}); }
        console.log(`[a7 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 1800));
        return o[key];
    };
    // Sign in as `user`, open the submission and read what the round's page offers; then press
    // "Upload" above the list when it is there and say what opened.
    const look = (key, user, id, {author = true, round = null, pressIt = true} = {}) => step(key, async () => {
        await signIn(page, user);
        await A.openWorkflow(page, app, id, {author, round});
        const out = {user, submission: id, stored: A.storedRounds(app, id), ...(await A.offers(page))};
        out.rounds = rounds.last();
        await snap(`${key}-page`);
        if (pressIt && out.upload) {
            out.pressed = await A.press(page, A.uploadButton(page));
            await snap(`${key}-upload-window`);
            await A.openWorkflow(page, app, id, {author, round}); // leave the window behind
            out.rowsAfter = (await A.offers(page)).rows;
        }
        return out;
    });
    // The signed-in author's "Upload" above the list takes FILE through the wizard.
    const authorUpload = (key) => step(key, () => A.uploadThrough(page, A.uploadButton(page), c.component, A.smallFile(FILE)));
    // dbarnes records "Request Revisions" on the submission, with or without a new round.
    const request = (key, id, newRound) => step(key, async () => {
        const R = require('../../../../../apps/omp/playwright/pages/ReviewStagePages.js'); // the decision wizard is the same on a journal
        await signIn(page, 'dbarnes');
        await A.openWorkflow(page, app, id);
        await R.requestRevisions(page, R.workflowModal(page), {newRound});
        await snap(`${key}-recorded`);
        return {recorded: true, stored: A.storedRounds(app, id)};
    });
    // dbarnes records the decision `label` from the submission's current round ("Create New Review
    // Round", "Decline Submission", "Accept Submission") through its wizard.
    const decide = (key, id, label) => step(key, async () => {
        const R = require('../../../../../apps/omp/playwright/pages/ReviewStagePages.js');
        await signIn(page, 'dbarnes');
        await A.openWorkflow(page, app, id);
        if (label === R.DECISIONS.newRound) await R.createNewReviewRound(page, R.workflowModal(page));
        else {
            await R.decisionButton(R.workflowModal(page), label).click();
            // A one-step wizard ("Decline Submission") shows "Record Decision" only once its email loads.
            await page.getByRole('button', {name: /^(Continue|Record Decision)$/}).first().waitFor({timeout: 60_000});
            await R.walkDecisionWizard(page);
        }
        await snap(`${key}-recorded`);
        return {recorded: label, stored: A.storedRounds(app, id)};
    });
    try {
        if (MODE === 'walk') {
            for (const s of c.walk) {                                                              // 1–4
                // An accepted round: the submission is in copyediting, so its external review round is chosen in the workflow menu.
                const round = s.accepted ? A.storedRounds(app, s.id).filter((r) => r.stageId === 3).pop() : null;
                await look(s.key, s.author, s.id, {round});
            }
        } else if (MODE === 'declined') {
            // The declined round alone (OJS): dbarnes records "Decline Submission" on 2; ccorino on that round.
            const nb = c.nb;
            if (nb.declined) {
                await decide('declineDecision', nb.declined.id, 'Decline Submission');
                const round = A.storedRounds(app, nb.declined.id).pop();
                await look('declined', nb.declined.author, nb.declined.id, {round});
            }
        } else if (MODE === 'nb') {
            const nb = c.nb;
            if (nb.requested) {
                await look('requested', nb.requested.author, nb.requested.id, {pressIt: false});
                if (o.requested && o.requested.upload) await authorUpload('requestedUpload');
                await look('requestedAfterUpload', nb.requested.author, nb.requested.id);
            }
            if (nb.newRound) {
                await decide('newRoundDecision', nb.newRound.id, 'Create New Review Round');
                const rs = A.storedRounds(app, nb.newRound.id);
                await look('newRoundEarlier', nb.newRound.author, nb.newRound.id, {round: rs[0]});
                await look('newRoundLatest', nb.newRound.author, nb.newRound.id, {round: rs[rs.length - 1]});
            }
            if (nb.resubmit) {
                await request('resubmitDecision', nb.resubmit.id, true);
                await look('resubmit', nb.resubmit.author, nb.resubmit.id, {pressIt: false});
                if (o.resubmit && o.resubmit.upload) await authorUpload('resubmitUpload');
                await look('resubmitAfterUpload', nb.resubmit.author, nb.resubmit.id);
            }
            if (nb.accepted) {
                const round = A.storedRounds(app, nb.accepted.id).pop();
                await look('accepted', nb.accepted.author, nb.accepted.id, {round});
            }
            if (nb.declined) {
                await decide('declineDecision', nb.declined.id, 'Decline Submission');
                const round = A.storedRounds(app, nb.declined.id).pop();
                await look('declined', nb.declined.author, nb.declined.id, {round});
            }
            if (nb.acceptedInternal) {
                await decide('acceptInternalDecision', nb.acceptedInternal.id, 'Accept Submission');
                const round = A.storedRounds(app, nb.acceptedInternal.id).find((r) => r.stageId === 2);
                await look('acceptedInternal', nb.acceptedInternal.author, nb.acceptedInternal.id, {round});
            }
            if (nb.sentOn) {
                const round = A.storedRounds(app, nb.sentOn.id).find((r) => r.stageId === nb.sentOn.stageId);
                await look('sentOn', nb.sentOn.author, nb.sentOn.id, {round});
            }
            if (nb.request) {
                await request('requestDecision', nb.request.id, false);
                await look('requestedOnPress', nb.request.author, nb.request.id);
            }
            await look('editor', 'dbarnes', nb.editor.id, {author: false});
        }
    } catch (e) {
        o.error = A.flat(e.stack || e.message, 800);
        await snap('error').catch(() => {});
    } finally {
        record(`a7-facts-${MODE}`, o);
        console.log(`[a7 ${app.name} ${MODE}] facts`, JSON.stringify(o).slice(0, 8000));
        await idle(page).catch(() => {});
        await close();
    }
});
