// U27 A57 issue walk: a "Drop-down box" question of a review form that the reviewer left blank reads,
// after the submit, as the question's first option in the editor's Review Details window and in both
// XML exports. A radio-button question left blank (the control) reads unanswered.
// Issue report: docs/issues/U27-A57-review-form-blank-drop-down-reads-first-option.md.
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), journal or press
// `publicknowledge`. The kit builds nothing: the review form is made on screen, as the Steps say.
// A preprint server has no review: not walked. Helpers: ./lib.js.
//
// MODE=steps (default), OJS submission 7 / OMP submission 16:
//   1-3  `dbarnes`: Settings › Workflow › "Review" › "Review Forms": "Create Review Form" "u27hk27a review
//        form"; "Edit" › "Form Items": "u27hk27a drop-down" (Drop-down box: "u27hk27a Low", "u27hk27a High")
//        and "u27hk27a radio" (Radio buttons: "u27hk27a Yes", "u27hk27a No"); the row's "Active" box, "OK"
//   4    the workflow, Aisla McCrae's [Al Zacharia's] row "Edit", "Review Form" = the form, "OK"
//   5-6  `amccrae` [`alzacharia`]: accept, step 3, both questions left blank, (OJS) "Accept Submission", submit
//   7    `dbarnes`: the workflow, "Read Review" on Paul Hudson's [Adela Gallego's] free-form review,
//        "Download Review Form" › "Editor Form Shows All Review Sections (PDF)", the window closed (the
//        XML entries need the install's temporary files folder, which the first review PDF makes: A49)
//   8    the workflow, "Read Review" on the reviewer's row: the answer under each question
//   9    "Download Review Form" › "Editor Form Shows All Review Sections (XML)": the file's text
//   10   "Download Review Form" › "Author-Only Sections Displayed (XML)": the file's text
// MODE=nb, the neighbour alone (fix in and out): steps 1-5, then the reviewer chooses "u27hk27a Low"
//   (the first option, the value the fix must keep) and "u27hk27a Yes"; steps 7-10 read them.
// After step 10 (both modes) the stored response rows are read from the database (evidence, not a step).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   bin/app-lock.sh shared ojs,omp -- env PROBE_FEATURE=<feature> PROBE_AGENT=<id> \
//                 node bin/probe.js all shared/playwright/checks/issues/review-form-blank-drop-down-reads-first-option/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, with the 3.5 fleet's feature.
// Facts: .reports/<feature>/<id>/a57-facts-<mode>[-<run>]-<app>.json; downloads a57-dl-<label>[-<run>]-<app>.xml
const {forEachApp, launch, signIn, screen, shot, record, idle, serverLog, sql} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'steps';
const FORM = 'u27hk27a review form';
const DROP = 'u27hk27a drop-down';
const DROP_OPTIONS = ['u27hk27a Low', 'u27hk27a High'];
const RADIO = 'u27hk27a radio';
const RADIO_OPTIONS = ['u27hk27a Yes', 'u27hk27a No'];

forEachApp(async (app) => {
    const c = L.CASES[app.name];
    if (!c) { console.log(`[a57 ${app.name}] no review: not walked`); return; }
    const o = {app: app.name, line: app.line || 'main', mode: MODE, submission: c.id};
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const snap = async (label) => { record(label, await screen(page).catch((e) => ({error: L.flat(e.message)}))); await shot(page, label).catch(() => {}); };
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) {
            o[key] = {threw: L.flat(e.message, 400)};
            await snap(`a57-${MODE}-${key}-threw`);
        }
        console.log(`[a57 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 2500));
        return o[key];
    };
    const chosen = MODE === 'nb' ? {dropDown: DROP_OPTIONS[0], radio: RADIO_OPTIONS[0]} : {dropDown: null, radio: null};
    try {
        await step('form', async () => {                                                                                        // 1-3
            await signIn(page, 'dbarnes');
            return L.createActiveReviewForm(page, app, {title: FORM, items: [
                {question: DROP, type: 'Drop-down box', options: DROP_OPTIONS},
                {question: RADIO, type: 'Radio buttons (you can only choose one)', options: RADIO_OPTIONS},
            ]});
        });
        await step('given', async () => L.giveReviewForm(page, app, c.id, c.reviewer.name, FORM));                              // 4
        await step('review', async () => {                                                                                      // 5-6
            await signIn(page, c.reviewer.username);
            const r = await L.openStep3(page, app, c.id);
            await snap(`a57-${MODE}-6-step3`);
            Object.assign(r, await L.answerChoices(page, app, {dropQuestion: DROP, radioQuestion: RADIO, ...chosen, recommendation: 'Accept Submission'}));
            await snap(`a57-${MODE}-6-submitted`);
            return r;
        });
        await step('tempFolder', async () => {                                                                                  // 7
            await signIn(page, 'dbarnes');
            await L.openWorkflow(page, app, c.id);
            const r = await L.openReviewDetails(page, c.control.name);
            r.download = await L.download(page, app, 'editorPdf', `${MODE}-control-editorPdf`, {log});
            await L.pressErrorOk(page);
            await L.closeOpenMenu(page);
            await L.closeReviewDetails(page);
            return r;
        });
        await step('details', async () => {                                                                                     // 8
            await L.openWorkflow(page, app, c.id);
            const r = await L.openReviewDetails(page, c.reviewer.name);
            await snap(`a57-${MODE}-7-review-details`);
            const text = await L.reviewDetails(page).innerText().catch(() => '');
            r.dropDown = L.answerUnder(text, DROP, [RADIO]);
            r.radio = L.answerUnder(text, RADIO, [DROP]);
            r.windowText = L.flat(text, 1200);
            return r;
        });
        await step('editorXml', async () => { const r = await L.download(page, app, 'editorXml', `${MODE}-editorXml`, {log}); await L.pressErrorOk(page); await L.closeOpenMenu(page); return r; });   // 9
        await step('authorXml', async () => { const r = await L.download(page, app, 'authorXml', `${MODE}-authorXml`, {log}); await L.pressErrorOk(page); await L.closeOpenMenu(page); return r; });   // 10
        await step('stored', async () => {
            const rows = sql(app, `SELECT e.review_form_element_id, e.element_type, r.response_type, r.response_value
                FROM review_form_elements e JOIN review_forms f ON f.review_form_id = e.review_form_id
                JOIN review_form_settings fs ON fs.review_form_id = f.review_form_id AND fs.setting_name = 'title' AND fs.setting_value = '${FORM}'
                LEFT JOIN review_form_responses r ON r.review_form_element_id = e.review_form_element_id
                ORDER BY e.seq, e.review_form_element_id`);
            return {rows: String(rows).split('\n').filter(Boolean)};
        });
    } finally {
        record(`a57-facts-${MODE}`, o);
        await idle(page).catch(() => {});
        await close();
    }
});
