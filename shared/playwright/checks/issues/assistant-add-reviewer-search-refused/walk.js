// U27 A51 issue walk (docs/issues/U27-A51-assistant-add-reviewer-search-refused.md): a Funding
// coordinator assigned to a submission gets the Add Reviewer window, but its search, filters and
// further pages answer "The current role does not have access to this operation.". On PKP's default
// test dataset (a dataset fleet, harness.md "Dataset fleets"), journal or press `publicknowledge`.
// The kit builds nothing. A preprint server has no review: not walked. Every step is recorded and
// none throws, so the same script reads the state a fix brings (no error, the list narrowed).
//
// MODE=walk (default), OJS submission 7 / OMP submission 16:
//   admin gives svogt "Funding coordinator" (Administration > Hosted Journals/Presses > Settings
//   wizard > Users > Edit User); dbarnes assigns Sarah Vogt as Funding coordinator; svogt opens the
//   workflow, "Add Reviewer"; "Julie"/"Catherine" + Enter; "OK"; "Clear search phrase"; "OK";
//   "Filters" > "Add filter: Rated at least"; "OK"; "Clear filter: Rated at least"; "OK"; "Select
//   Julie Janssen"/"Select Catherine Turner", "Add Reviewer"; the rows after a reload. Then 22
//   accounts register on the context's Register page with the reviewer box ticked (u27n16j01..22);
//   svogt's "Add Reviewer" again: the page bar, "Next", "OK". Control: dbarnes's "Add Reviewer":
//   "Next", then the search.
// PART=pages takes only the further-pages group (the registrations, svogt's "Next", the control),
//   on a fleet the setup steps have already run on.
// MODE=nb, the neighbours alone (with a fix in and out): rvaca (manager, not assigned) and {OJS}
//   dbuskins (assigned Section editor): "Add Reviewer", the search, "Filters" > "Add filter: Rated
//   at least", "Clear filter: Rated at least"; then the window closed without adding.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs,omp shared/playwright/checks/issues/assistant-add-reviewer-search-refused/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, with the 3.5 fleet's feature.
// Facts: .reports/<feature>/<id>/a51-facts-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const TAG = 'u27n16j';
const EXTRA = 22;
const PART = process.env.PART || 'all';

forEachApp(async (app) => {
    const c = H.CASES[app.name];
    if (!c) { console.log(`[a51 ${app.name}] no review: not walked`); return; }
    const o = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    const since = H.watchListing(page);
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {threw: H.flat(e.message, 500)}; }
        console.log(`[a51 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 1500));
        record(`a51-${MODE}-${key}`, await screen(page).catch(() => ({url: page.url()})));
        await shot(page, `a51-${MODE}-${key}`).catch(() => {});
        record(`a51-facts-${MODE}`, o);
        return o[key];
    };
    const removeFilter = async () => {
        const b = H.modalOf(page).locator('button.pkpFilter__remove').first();
        if (!(await b.isVisible().catch(() => false))) return {shown: false, list: await H.listRead(page)};
        const label = H.flat(await b.innerText().catch(() => null), 80);
        return {shown: true, label, ...(await H.act(page, since, () => b.click({timeout: 5000}).catch(() => {})))};
    };
    /** The search and filter part of the window for the signed-in user; adds the pick when `add`. */
    const searchAndFilter = async (who, {add}) => {
        await step(`${who}Open`, () => H.openAddReviewer(page, app, c.id, since));
        await step(`${who}Search`, () => H.search(page, since, c.search));
        await step(`${who}SearchOk`, () => H.okError(page));
        await step(`${who}Clear`, () => H.clearSearch(page, since));
        await step(`${who}ClearOk`, () => H.okError(page));
        await step(`${who}FilterOn`, () => H.addFilter(page, since));
        await step(`${who}FilterOnOk`, () => H.okError(page));
        await step(`${who}FilterOff`, removeFilter);
        await step(`${who}FilterOffOk`, () => H.okError(page));
        if (add) {
            await step(`${who}Add`, () => H.selectAndAdd(page, c.pick));
            await step(`${who}Rows`, async () => {
                await page.goto('about:blank');
                await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${c.id}`));
                await page.getByRole('table', {name: 'Reviewers', exact: true}).waitFor({timeout: H.T}).catch(() => {});
                await H.sleep(1500);
                return {rows: await H.reviewerRows(page)};
            });
        } else {
            await step(`${who}Closed`, async () => ({closed: await H.closeWindow(page)}));
        }
    };
    try {
        if (MODE === 'nb') {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await searchAndFilter('nbManager', {add: false});
            if (c.sectionEditor) {
                await signIn(page, c.sectionEditor, {contextPath: app.contextPath});
                await searchAndFilter('nbSectionEditor', {add: false});
            }
        } else {
            if (PART !== 'pages') {
            await step('setupRole', async () => {                                       // 1
                await signIn(page, 'admin');
                return H.giveRoleAsAdmin(page, app, {username: 'svogt', role: 'Funding coordinator'});
            });
            await step('setupAssign', async () => {                                     // 2-3
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                return H.assignAs(page, app, c.id, {role: 'Funding coordinator', personName: 'Sarah Vogt'});
            });
            await signIn(page, 'svogt', {contextPath: app.contextPath});               // 4
            await searchAndFilter('fc', {add: true});                                   // 5-11
            }
            await step('register', async () => {                                       // further pages: precondition
                const out = [];
                for (let i = 1; i <= EXTRA; i++) {
                    const n = String(i).padStart(2, '0');
                    const username = `${TAG}${n}`;
                    out.push(await H.registerReviewer(page, app, {givenName: `Pat${n}`, familyName: 'Pagerly', affiliation: TAG, email: `${username}@mailinator.com`, username, password: `${username}${username}`}));
                }
                return {registered: out.filter((x) => !x.errors.length).length, first: out[0], last: out[out.length - 1], failed: out.filter((x) => x.errors.length)};
            });
            await signIn(page, 'svogt', {contextPath: app.contextPath});
            await step('fcPagesOpen', () => H.openAddReviewer(page, app, c.id, since));  // 12
            await step('fcNext', () => H.next(page, since));
            await step('fcNextOk', () => H.okError(page));
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});             // control
            await step('edPagesOpen', () => H.openAddReviewer(page, app, c.id, since));
            await step('edNext', () => H.next(page, since));
            await step('edSearch', () => H.search(page, since, c.search));
            await step('edClosed', async () => ({closed: await H.closeWindow(page)}));
        }
    } finally {
        record(`a51-facts-${MODE}`, o);
        await close();
    }
});
