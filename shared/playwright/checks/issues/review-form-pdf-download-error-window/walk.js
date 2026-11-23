// U27 A55 issue walk: on a review the reviewer submitted on a review form, both PDF entries of Review
// Details › "Download Review Form" open an "Error" window and no file arrives.
// Issue report: docs/issues/U27-A55-review-form-pdf-download-error-window.md.
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), journal or press
// `publicknowledge`. The kit builds nothing: the review form is made on screen, as the Steps say.
// A preprint server has no review: not walked. Helpers: ./lib.js.
//
// MODE=steps (default), OJS submission 7 / OMP submission 16:
//   1-3  `dbarnes`: Settings › Workflow › "Review" › "Review Forms": "Create Review Form" "u27n23l review
//        form"; "Edit" › "Form Items": "u27n23l comments" (Extended text box); the row's "Active" box, "OK"
//   4    the workflow, Aisla McCrae's [Al Zacharia's] row "Edit", "Review Form" = the form, "OK"
//   5-6  `amccrae` [`alzacharia`]: accept, step 3, "u27n23l answer", (OJS) "Accept Submission", submit
//   7    `dbarnes`: the workflow, the row's "Read Review"
//   8    "Download Review Form" › "Editor Form Shows All Review Sections (PDF)"
//   9    the "Error" window's "OK" (recorded, not required)
//   10   "Download Review Form" › "Author-Only Sections Displayed (PDF)" (and its "OK")
//   control: Paul Hudson's [Adela Gallego's] free-form review: "Editor Form Shows All Review Sections (PDF)"
// MODE=nb, the neighbour alone (fix in and out): as `dbarnes`, the control review's two PDF entries
//   (the free-form branch the fix must leave as it is), each PDF's text read.
// The "Error" window's text is never recorded here (only its presence and buttons).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=<feature> PROBE_AGENT=<id> \
//                 node bin/probe.js ojs shared/playwright/checks/issues/review-form-pdf-download-error-window/walk.js
//               (then omp)
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, with the 3.5 fleet's feature.
// Facts: .reports/<feature>/<id>/a55-facts-<mode>[-<run>]-<app>.json; downloads a55-dl-<label>[-<run>]-<app>.pdf
const {forEachApp, launch, signIn, screen, shot, record, idle, serverLog} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'steps';
const FORM = 'u27n23l review form';
const QUESTION = 'u27n23l comments';
const ANSWER = 'u27n23l answer';

forEachApp(async (app) => {
    const c = L.CASES[app.name];
    if (!c) { console.log(`[a55 ${app.name}] no review: not walked`); return; }
    const o = {app: app.name, line: app.line || 'main', mode: MODE, submission: c.id};
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const pdf = L.pdfReader(app);
    const snap = async (label) => { record(label, await screen(page).catch((e) => ({error: L.flat(e.message)}))); await shot(page, label).catch(() => {}); };
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) {
            o[key] = {threw: L.flat(e.message, 400)};
            await snap(`a55-${MODE}-${key}-threw`);
        }
        console.log(`[a55 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 2000));
        return o[key];
    };
    try {
        if (MODE === 'nb') {
            await step('open', async () => { await signIn(page, 'dbarnes'); await L.openWorkflow(page, app, c.id); return L.openReviewDetails(page, c.control.name); });
            await step('editorPdf', async () => { const r = await L.download(page, app, 'editorPdf', 'nb-control-editorPdf', {pdf, log}); await snap('a55-nb-control-editorPdf'); r.ok = await L.pressErrorOk(page); await L.closeOpenMenu(page); return r; });
            await step('authorPdf', async () => { const r = await L.download(page, app, 'authorPdf', 'nb-control-authorPdf', {pdf, log}); await snap('a55-nb-control-authorPdf'); r.ok = await L.pressErrorOk(page); await L.closeOpenMenu(page); return r; });
        } else {
            await step('form', async () => { await signIn(page, 'dbarnes'); return L.createActiveReviewForm(page, app, {title: FORM, items: [{question: QUESTION, type: 'Extended text box'}]}); }); // 1-3
            await step('given', async () => L.giveReviewForm(page, app, c.id, c.reviewer.name, FORM));                                                                                       // 4
            await step('review', async () => {                                                                                                                                              // 5-6
                await signIn(page, c.reviewer.username);
                const r = await L.openStep3(page, app, c.id);
                await snap('a55-6-step3');
                Object.assign(r, await L.answerAndSubmit(page, app, {question: QUESTION, answer: ANSWER, recommendation: 'Accept Submission'}));
                await snap('a55-6-submitted');
                return r;
            });
            await step('details', async () => {                                                                                                                                             // 7
                await signIn(page, 'dbarnes');
                await L.openWorkflow(page, app, c.id);
                const r = await L.openReviewDetails(page, c.reviewer.name);
                await snap('a55-7-review-details');
                r.windowText = L.flat((await L.reviewDetails(page).innerText().catch(() => '')), 800);
                return r;
            });
            await step('editorPdf', async () => { const r = await L.download(page, app, 'editorPdf', 'form-editorPdf', {pdf, log}); await snap('a55-8-editorPdf-after'); return r; }); // 8
            await step('ok1', async () => { const r = await L.pressErrorOk(page); await L.closeOpenMenu(page); await snap('a55-9-after-ok'); return r; });                              // 9
            await step('authorPdf', async () => {                                                                                                                                           // 10
                if (!(await L.reviewDetails(page).isVisible().catch(() => false))) { await L.openWorkflow(page, app, c.id); await L.openReviewDetails(page, c.reviewer.name); }
                const r = await L.download(page, app, 'authorPdf', 'form-authorPdf', {pdf, log});
                await snap('a55-10-authorPdf-after');
                r.ok = await L.pressErrorOk(page);
                await L.closeOpenMenu(page);
                return r;
            });
            await step('control', async () => {
                if (await L.reviewDetails(page).isVisible().catch(() => false)) await L.closeReviewDetails(page);
                await L.openWorkflow(page, app, c.id);
                const r = await L.openReviewDetails(page, c.control.name);
                r.download = await L.download(page, app, 'editorPdf', 'control-editorPdf', {pdf, log});
                await snap('a55-control-after');
                r.ok = await L.pressErrorOk(page);
                return r;
            });
        }
    } finally {
        record(`a55-facts-${MODE}`, o);
        await pdf.close();
        await idle(page).catch(() => {});
        await close();
    }
});
