// Issue report docs/issues/U64-A19-counter-r5-earliest-date-skips-month-after-31st.md (U64 A19): the
// report's Steps to reproduce, walked on PKP's default test dataset (a dataset fleet, harness.md
// "Dataset fleets"). The kit builds nothing and no SQL writes: everything is made through the screens.
//
// Steps (OJS, OMP, OPS):
//   1. `admin` › Administration › Hosted Journals (Presses, Servers) › "Create Journal" (…):
//      "u64r Journal" (Press, Server), path `u64r`, saved. The creator becomes its Journal manager.
//   2. Make a Submission to `u64r` as `admin`, through the whole wizard.
//   3. Its workflow › "Publication Settings" (OMP "Catalog Entry", OPS "Preprint entry"; OJS 3.5
//      "Issue"): "Publication Date" (OMP "Date Published", OPS "Date Posted") 2027-01-31, "Save".
//   4. Statistics › "Counter R5" of `u64r`, "Edit" on "Platform Master Report (PR)": the line under
//      "Start Date" and the date filled into it.
//   Control (C1): the same date box 2027-01-28, "Save", step 4 again.
// Each step records the state it finds rather than throwing, so the same script reads the fix.
//
// Reset first:  npm run fleet-prep -- --feature issues-cr1 --dataset 1 --reset
// Run (main):   PROBE_FEATURE=issues-cr1 PROBE_AGENT=cr1 node bin/probe.js all shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cr1-3_5 --dataset 1 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-cr1-3_5 PROBE_AGENT=cr1 node bin/probe.js all shared/playwright/checks/issues/counter-r5-earliest-date-skips-month-after-31st/walk.js
// Facts: .reports/<feature>/cr1/facts[-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record, idle, sql} = require('../../../probe');
const H = require('../section-editors-not-assigned-second-journal/lib.js');
const C = require('../counter-report-tsv-comma-separated/lib');
const {openCounterR5} = require('../section-editor-counter-r5-error-while-restricted/lib');

const CTX = 'u64r';
const PR = 'Platform Master Report (PR)';
const DATE = '2027-01-31';
const CONTROL_DATE = '2027-01-28';

/** The workflow's publication page that holds the date box, by its side-menu name. */
function entryName(app) {
    if (app.name === 'omp') return 'Catalog Entry';
    if (app.name === 'ops') return /^Preprint [Ee]ntry$/;
    return app.line === 'stable-3_5_0' ? 'Issue' : 'Publication Settings';
}

/** On the open workflow: the date box of the publication page typed, "Save". */
async function setDate(page, app, date) {
    const name = entryName(app);
    const link = page.getByRole('link', {name, exact: typeof name === 'string'}).first();
    if (!(await link.isVisible().catch(() => false))) {
        const group = page.getByRole('link', {name: 'Publication', exact: true}).first();
        if (await group.isVisible().catch(() => false)) await group.click().catch(() => {});
        await H.sleep(400);
    }
    await link.click();
    await idle(page).catch(() => {});
    const box = page.locator('input[name="datePublished"]').last();
    await box.waitFor({state: 'visible', timeout: H.T});
    await H.sleep(600);
    const form = page.locator('form').filter({has: box}).last();
    const label = H.flat(await form.locator(`label[for="${await box.getAttribute('id')}"]`).first().innerText().catch(() => null), 80);
    const before = await box.inputValue();
    await box.fill(date);
    const saved = page.waitForResponse((r) => /\/publications\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: H.T});
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    const r = await saved;
    const body = await r.json().catch(() => ({}));
    await idle(page).catch(() => {});
    return {page: typeof name === 'string' ? name : String(name), label, before, typed: date, save: r.status(), stored: body.datePublished};
}

/** Statistics › "Counter R5", "Edit" on PR: the start date's box and the line under it; the window closed again. */
async function readStart(page, app) {
    const opened = await openCounterR5(page, app, CTX);
    const win = await C.editReport(page, PR);
    const line = await win.dialog.locator('input[name="begin_date"]').evaluate((el) => {
        const field = el.closest('.pkpFormField');
        return field ? (field.querySelector('.pkpFormField__description') || {}).textContent || '' : '';
    }).catch((e) => `error: ${e.message}`);
    const out = {warning: opened.warning, start: win.start, end: win.end, startLine: H.flat(line, 200)};
    await C.closeWindow(page, win.dialog);
    return out;
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset n)');
    const w = H.WORDS[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, run: process.env.PROBE_RUN || null, steps: {}};
    const {page, close} = await launch(app);
    const bad = [];
    page.on('response', (r) => r.status() >= 500 && bad.push(`${r.status()} ${C.rel(r.url())}`));
    page.on('pageerror', (e) => bad.push(`pageerror ${H.flat(e.message, 200)}`));
    try {
        // 1
        await signIn(page, 'admin');
        facts.steps.create = await C.attempt(() => H.createContext(page, app, {name: `u64r ${w.noun}`, initials: 'U64R', path: CTX, email: 'u64r@mailinator.com'}));
        // 2
        const id = await H.beginSubmission(page, app, CTX, {title: `u64r ${w.noun.toLowerCase()} article`, section: w.section});
        facts.steps.submission = {id, problems: await C.attempt(() => H.completeSubmission(page, app, CTX, id, {}))};
        // 3
        await H.openWorkflow(page, app, CTX, id);
        facts.steps.date = await C.attempt(() => setDate(page, app, DATE));
        record('03-date-saved', await screen(page));
        facts.stored = sql(app, `select p.publication_id, p.status, p.date_published from publications p join submissions s using (submission_id) join ${app.name === 'ojs' ? 'journals' : app.name === 'omp' ? 'presses' : 'servers'} c on c.${app.name === 'ojs' ? 'journal_id' : app.name === 'omp' ? 'press_id' : 'server_id'} = s.context_id where c.path = '${CTX}'`);
        facts.installed = sql(app, `select date_installed from versions where product_type = 'core' and current = 1`);
        // 4
        facts.steps.counter = await C.attempt(() => readStart(page, app));
        record('04-counter-start', await screen(page));
        await shot(page, '04-counter-start').catch(() => {});
        // C1
        await H.openWorkflow(page, app, CTX, id);
        facts.control = {date: await C.attempt(() => setDate(page, app, CONTROL_DATE))};
        facts.control.counter = await C.attempt(() => readStart(page, app));
        record('c1-counter-start', await screen(page));
    } catch (e) {
        facts.error = H.flat(e.stack || e.message, 800);
        record('threw', await screen(page).catch(() => null));
    } finally {
        facts.failures = bad;
        console.log(JSON.stringify(facts, null, 1));
        record('facts', facts);
        await close();
    }
});
