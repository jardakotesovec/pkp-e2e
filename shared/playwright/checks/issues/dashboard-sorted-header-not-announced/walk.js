// Issue report on U23 A15 (a sorted column header on the submissions dashboard never tells a screen
// reader that the list is sorted by it, or in which direction): the report's Steps to reproduce,
// walked on PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"). The kit builds
// nothing; the walk only sorts lists, so it changes no data.
//
// Default mode, the Steps (OJS, OMP, OPS):
//   1 sign in as dbarnes   2 side menu "Active submissions"   3 read the headers
//   4 press "ID"   5 press "ID"   6 press "ID"   7 press "Days"
// `reach` as the argument (runs alone): an author's My Submissions (ccorino on OJS and OPS, afinkel
//   on OMP) and the reviewer's list (jjanssen, OJS and OMP; a preprint server has no review), "ID"
//   pressed twice on each.
// `neighbour` as the argument (the fix in and out; runs alone): the tables the fix must leave alone.
//   As dbarnes, "Active submissions": "ID" pressed once, then a search for "the" (the sort must stay
//   and keep its state, the list request keeping orderBy=id DESC), then "Days" pressed (the sort moves
//   to "Days", "ID" loses it); then the first row's "View" opens the submission's workflow, whose
//   tables have no sorting: none of their headers may carry aria-sort, and no page script may fail.
// Each step records every column header's aria-sort, the row IDs, and the ordering the list request
// asked for; page script errors and 5xx answers are recorded throughout. Nothing throws mid-walk.
// It also records Chromium's accessibility tree for the column headers (`ax`), but that tree carries
// no sort property even when aria-sort is set (walked with the fix in, 2026-10-21): read `dom`.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21q --dataset 6 --reset
// Run (main):   PROBE_FEATURE=issues-h21q PROBE_AGENT=h21q node bin/probe.js all shared/playwright/checks/issues/dashboard-sorted-header-not-announced/walk.js [reach|neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21q-3_5 --dataset 6 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21q-3_5 PROBE_AGENT=h21q node bin/probe.js all shared/playwright/checks/issues/dashboard-sorted-header-not-announced/walk.js [reach]
// Facts: .reports/<feature>/h21q/a15-<mode>.json per app (PROBE_RUN adds its tag)
const {forEachApp, launch, signIn, screen, record, idle} = require('../../../probe');

const ARGS = process.argv.slice(2);
const MODE = ARGS.includes('neighbour') ? 'neighbour' : ARGS.includes('reach') ? 'reach' : 'steps';
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const safe = (p) => Promise.resolve(p).catch((e) => ({error: flat(e.message, 300)}));

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE, steps: {}, pageErrors: [], serverErrors: []};
    const {page, close} = await launch(app);
    const listRequests = [];
    page.on('request', (r) => {
        if (r.method() === 'GET' && /\/api\/v1\/_submissions(\/(assigned|reviewerAssignments))?\?/.test(r.url())) {
            listRequests.push(r.url());
        }
    });
    page.on('pageerror', (e) => facts.pageErrors.push({url: page.url(), error: flat(e.message, 300)}));
    page.on('response', (r) => {
        if (r.status() >= 500) facts.serverErrors.push({status: r.status(), url: r.url()});
    });
    const cdp = await page.context().newCDPSession(page);
    await safe(cdp.send('Accessibility.enable'));

    // Every column header: its text, its aria-sort attribute, and what Chromium's accessibility tree
    // exposes for it (role, name, and the sort property a screen reader announces).
    const headers = async () => {
        const dom = await safe(page.locator('th').evaluateAll((els) =>
            els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), ariaSort: e.getAttribute('aria-sort'), sortable: !!e.querySelector('button')}))));
        const tree = await safe(cdp.send('Accessibility.getFullAXTree'));
        const ax = tree && tree.nodes
            ? tree.nodes
                .filter((n) => n.role && n.role.value === 'columnheader' && !n.ignored)
                .map((n) => {
                    const props = Object.fromEntries((n.properties || []).map((p) => [p.name, p.value && p.value.value]));
                    return {name: n.name && n.name.value, sort: props.sort === undefined ? null : props.sort};
                })
            : tree;
        return {dom, ax};
    };
    const rowIds = async () =>
        safe(page.locator('table tbody tr').evaluateAll((rows) =>
            rows.map((r) => (r.querySelector('td, th') ? r.querySelector('td, th').innerText.trim() : '')).slice(0, 40)));
    const ordering = (url) => {
        if (!url) return null;
        const u = new URL(url);
        return {path: u.pathname.replace(/.*\/api\/v1\//, ''), orderBy: u.searchParams.get('orderBy'), orderDirection: u.searchParams.get('orderDirection'), searchPhrase: u.searchParams.get('searchPhrase')};
    };
    const fact = async (k, extra = {}) => {
        await safe(idle(page));
        await page.waitForTimeout(300);
        const v = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), headers: await headers(), rowIds: await rowIds(), lastListRequest: ordering(listRequests[listRequests.length - 1]), ...extra};
        facts.steps[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1200)}`);
        return v;
    };
    // Press a column's sort button and wait out the list's reload.
    const press = async (k, column) => {
        const before = listRequests.length;
        const r = await safe(page.getByRole('columnheader', {name: new RegExp(`^${column}\\b`, 'i')}).getByRole('button').first().click());
        for (let i = 0; i < 50 && listRequests.length === before; i++) await page.waitForTimeout(100);
        return fact(k, {press: r && r.error ? r : 'ok', listReloaded: listRequests.length > before});
    };
    const sideNav = () => page.locator('#app-nav');
    // Sign in on the context's own login page; where it does not land on the list, open the list by its address.
    const signInTo = async (user, list) => {
        await signIn(page, user, {contextPath: app.contextPath});
        await safe(idle(page));
        facts[`landing ${user}`] = page.url();
        if (!page.url().includes(`/dashboard/${list}`)) {
            await safe(page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/${list}`)));
        }
        await safe(page.getByRole('heading', {level: 1}).waitFor({timeout: 30_000}));
        await safe(idle(page));
    };
    const openView = async (name, hrefPart) => {
        const link = sideNav().locator(`a[href*="${hrefPart}"]`).filter({has: page.getByText(name, {exact: true})}).first();
        if (!(await link.isVisible().catch(() => false))) {
            facts.sideNav = await safe(sideNav().innerText().then((t) => flat(t, 800)));
        }
        const r = await safe(link.click());
        await safe(page.getByRole('heading', {level: 1, name: new RegExp(`^${name}`)}).waitFor({timeout: 30_000}));
        await safe(page.locator('table tbody tr').first().waitFor({timeout: 30_000}));
        return r;
    };
    const editorActive = async () => {
        await signInTo('dbarnes', 'editorial');
        await fact('1 signed in as dbarnes', {heading: await safe(page.getByRole('heading', {level: 1}).innerText())});
        const r = await openView('Active submissions', 'dashboard/editorial');
        await fact('2-3 Active submissions, headers read', {open: r && r.error ? r : 'ok', heading: await safe(page.getByRole('heading', {level: 1}).innerText())});
    };

    try {
        if (MODE === 'steps') {
            await editorActive();
            record('a15-steps-active', await screen(page));
            await press('4 press ID (descending)', 'ID');
            record('a15-steps-id-descending', await screen(page));
            await press('5 press ID (ascending)', 'ID');
            record('a15-steps-id-ascending', await screen(page));
            await press('6 press ID (off)', 'ID');
            await press('7 press Days (descending)', 'Days');
            record('a15-steps-days-descending', await screen(page));
        } else if (MODE === 'reach') {
            const author = app.name === 'omp' ? 'afinkel' : 'ccorino';
            await signInTo(author, 'mySubmissions');
            await safe(page.locator('table tbody tr').first().waitFor({timeout: 30_000}));
            await fact(`r1 ${author}: My Submissions`, {heading: await safe(page.getByRole('heading', {level: 1}).innerText())});
            await press(`r2 ${author}: press ID (descending)`, 'ID');
            await press(`r3 ${author}: press ID (ascending)`, 'ID');
            record('a15-reach-my-submissions', await screen(page));
            if (app.name !== 'ops') {
                await signInTo('jjanssen', 'reviewAssignments');
                await safe(page.locator('table tbody tr').first().waitFor({timeout: 30_000}));
                await fact('r4 jjanssen: review assignments', {heading: await safe(page.getByRole('heading', {level: 1}).innerText())});
                await press('r5 jjanssen: press ID (descending)', 'ID');
                await press('r6 jjanssen: press ID (ascending)', 'ID');
                record('a15-reach-reviewer', await screen(page));
            }
        } else {
            await editorActive();
            await press('nb1 press ID (descending)', 'ID');
            const box = page.locator('#app-main').getByRole('searchbox').first();
            const before = listRequests.length;
            const typed = await safe(box.fill('the').then(() => box.press('Enter')));
            for (let i = 0; i < 50 && listRequests.length === before; i++) await page.waitForTimeout(100);
            await page.waitForTimeout(800);
            await fact('nb2 search "the" (sort kept)', {typed: typed && typed.error ? typed : 'ok'});
            await press('nb3 press Days (sort moves to Days)', 'Days');
            record('a15-neighbour-days', await screen(page));
            const view = page.locator('table tbody tr').first().getByRole('button', {name: /^View/}).first();
            const v = await safe(view.click());
            await safe(page.waitForLoadState('networkidle', {timeout: 20_000}));
            await page.waitForTimeout(1500);
            await fact('nb4 first row "View": workflow tables', {view: v && v.error ? v : 'ok'});
            record('a15-neighbour-workflow', await screen(page));
        }
    } catch (e) {
        facts.error = flat(e.stack || e.message, 800);
    } finally {
        facts.listRequests = listRequests.map(ordering);
        await safe(cdp.detach());
        record(`a15-${MODE}`, facts);
        await close();
    }
});
