// Issue report docs/issues/U45-A24-doi-row-title-formatting-codes.md (U45 A24): the DOIs
// page's rows print a title's formatting as codes (`Hansen &amp; Pinto: Reason Reclaimed`,
// `… &amp; <i>shrubs</i>`), where the workflow's heading shows the title formatted. Takes the
// report's Steps through the screens on a dataset fleet freshly reset to PKP's default test
// dataset, as the dataset's `dbarnes` on `publicknowledge`. The kit builds nothing.
//
// Default mode, the Steps (OJS, OMP, OPS; the records keep the names in brackets):
//   1.   sign in as dbarnes [1-signin]
//   beside the Steps, the control: "DOIs", the row of the dataset's own "Hansen & Pinto:
//        Reason Reclaimed" (OJS 9, OPS 8; the press's dataset lists no title with "&"), which
//        the dataset stores with a bare "&" [2-dataset-row]
//   2-3. open E (OJS 5, OMP 4, OPS 1), "Publication" ("Preprint") › "Title & Abstract";
//        "Title" retyped `hkrb forest trees & shrubs`, "shrubs" put in italics with Ctrl+I,
//        "Save"; the heading over the form read [4-retitle]
//   4.   "DOIs": E's row [5-edited-row]
// `neighbour` as the argument (the fix in and out; runs alone, on a fresh dataset; each step
// records what it finds, never throwing): E's title retyped `hkrb a <b> c plain`, whose
// typed angle brackets must stay text in the row; a plain dataset title's row and its link.
// `chars` as the argument (the report's steps 5 and 6; runs alone, on a fresh dataset, no fix): E's "Title"
// retyped `hkrb it's a "quoted" title` with no formatting, "Save", E's row; then "Prefix"
// `L'` and "Subtitle" `rocks & sand`, "Save", E's row again.
// `issues` as the argument (OJS alone, the fix in and out, on a fresh dataset): the journal's
// issue rows, whose names are plain text. The dataset gives DOIs to articles only, so the
// mode first sets Settings › Distribution › "DOIs" › "Setup": "DOI Prefix" 10.1234 (the form
// refuses a save without one) and "Issues" ticked, "Save"; then "DOIs" › "Issues".
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=rb node bin/probe.js all shared/playwright/checks/issues/doi-row-title-formatting-codes/walk.js [neighbour | issues | chars]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 in front of both, the line fleet's feature, and
//               PROBE_RUN=r35 in front of the run.
// The fix:      node bin/try-fix.js apply shared/playwright/checks/issues/doi-row-title-formatting-codes/fix.diff ojs omp ops
//               (PROBE_RUN=fix, nb-in, nb-out, is-in, is-out name the trial's runs)
// Facts: .reports/<feature>/rb/a24-facts-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record, idle, sql} = require('../../../probe');
const {retypeTitle} = require('../articles-report-title-html-codes/lib');
const {retypeTitleBoxes} = require('./lib');

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('neighbour') ? 'neighbour' : ARGS.includes('issues') ? 'issues' : ARGS.includes('chars') ? 'chars' : 'steps';
const T = 30_000;
const flat = (s) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim());

// The dataset's own title with "&", listed on the DOIs page as it stands.
const AMP = {ojs: 9, ops: 8};
// The unpublished work whose title step 4 retypes.
const EDIT = {ojs: 5, omp: 4, ops: 1};
// A published work with a plain title (the neighbour's control row).
const PLAIN = {ojs: 17, omp: 14, ops: 2};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    if (MODE === 'issues' && app.name !== 'ojs') return;
    const {DoisPage, DoiSettings} = require('../../../pages/DoisPages.js');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE, run: process.env.PROBE_RUN || null, steps: {}};
    const {page, close} = await launch(app);
    const dois = new DoisPage(page, app.contextPath);
    const step = async (name, fn) => {
        try {
            facts.steps[name] = await fn();
        } catch (e) {
            facts.steps[name] = {error: e.message.split('\n')[0]};
        }
        console.log(`[fact] ${app.name} ${name}: ${flat(JSON.stringify(facts.steps[name])).slice(0, 1500)}`);
        record(`a24-${MODE}-${name}`, await screen(page).catch((e) => ({error: e.message})));
        await shot(page, `a24-${MODE}-${name}`).catch(() => {});
    };

    /** A row of the list shown: its name as text and as markup, its link, number and badge. */
    const readRow = async (id, type = 'submission') => {
        const row = dois.row(id, type);
        await row.waitFor({timeout: T});
        const link = dois.rowLink(row);
        return {
            id,
            text: flat(await link.innerText()),
            html: flat(await link.innerHTML()),
            italics: await link.locator('i, em').allInnerTexts(),
            bold: await link.locator('b, strong').allInnerTexts(),
            href: (await link.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, ''),
            target: await link.getAttribute('target'),
            actions: flat(await dois.rowActions(row).innerText()),
        };
    };

    /** The workflow's heading over the open publication page: the title as text and as markup. */
    const workflowHeading = async () => {
        const heading = page.getByRole('dialog').first().locator('.text-3xl-normal').first();
        return {text: flat(await heading.innerText()), html: flat(await heading.innerHTML())};
    };

    try {
        await step('1-signin', async () => {
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            return {url: page.url().replace(/^https?:\/\/[^/]+/, '')};
        });

        if (MODE === 'steps') {
            await step('2-dataset-row', async () => {
                await dois.goto();
                if (!AMP[app.name]) return {skipped: 'no listed dataset title with "&" on this app', rows: await dois.rowNames()};
                // What the dataset stores for that title (a read beside the step, for the Cause).
                const stored = sql(app, `select ps.setting_value from publication_settings ps join submissions s on s.current_publication_id = ps.publication_id where s.submission_id = ${AMP[app.name]} and ps.setting_name = 'title' and ps.locale = 'en'`);
                return {row: await readRow(AMP[app.name]), stored};
            });
            await step('4-retitle', async () => {
                const out = await retypeTitle(page, app, EDIT[app.name], 'hkrb forest trees & shrubs');
                out.heading = await workflowHeading();
                return out;
            });
            await step('5-edited-row', async () => {
                await dois.goto();
                return {row: await readRow(EDIT[app.name])};
            });
        } else if (MODE === 'chars') {
            await step('ch-quotes', async () => {
                const out = await retypeTitleBoxes(page, app, EDIT[app.name], {title: 'hkrb it\'s a "quoted" title'});
                out.heading = await workflowHeading();
                await dois.goto();
                out.row = await readRow(EDIT[app.name]);
                return out;
            });
            await step('ch-prefix-subtitle', async () => {
                const out = await retypeTitleBoxes(page, app, EDIT[app.name], {prefix: "L'", subtitle: 'rocks & sand'});
                out.heading = await workflowHeading();
                await dois.goto();
                out.row = await readRow(EDIT[app.name]);
                return out;
            });
        } else if (MODE === 'issues') {
            await step('is-settings', async () => {
                const settings = new DoiSettings(page, app.contextPath);
                await settings.goto('Setup');
                const before = await settings.kinds();
                await settings.prefixBox().fill('10.1234');
                await settings.kindBox('Issues').check();
                const r = await settings.pressSave(settings.setup);
                await idle(page);
                return {before, save: r.status(), after: await settings.kinds()};
            });
            await step('is-rows', async () => {
                await dois.goto();
                await dois.openTab('Issues');
                await idle(page);
                return {issue1: await readRow(1, 'issue'), issue2: await readRow(2, 'issue'), names: await dois.rowNames()};
            });
        } else {
            await step('nb-retitle', async () => {
                const out = await retypeTitle(page, app, EDIT[app.name], 'hkrb a <b> c plain');
                out.heading = await workflowHeading();
                return out;
            });
            await step('nb-rows', async () => {
                await dois.goto();
                return {typedBrackets: await readRow(EDIT[app.name]), plain: await readRow(PLAIN[app.name]), names: await dois.rowNames()};
            });
        }
    } finally {
        record(`a24-facts-${MODE}`, facts);
        await close();
    }
});
