// U23 A19 issue walk (docs/issues/U23-A19-dashboard-loaded-announced-before-list.md): the editorial
// dashboard's screen-reader region says "Loaded" the moment a new list is asked for, before its
// rows arrive, and says nothing when the page opens at an address that names its view (a reload).
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), context
// `publicknowledge`, as `dbarnes`. The kit builds nothing. The region `#announcer` is watched from
// page load (lib.js announcerLogInit: the ui-library one of the two `id="announcer"` elements), as the steps' developer-tools Elements panel does, and the
// network is throttled to DevTools' "Slow 4G" from step 2 to the reload, as the steps do. The
// init-script observer also catches the sign-in landing, which step 3's snippet cannot (it runs later).
//
// MODE=walk (default): 1 sign in as dbarnes (lands on "Assigned to me"); 2 throttle "Slow 4G";
//   3 run the report's console snippet (lib.js SNIPPET); 4 sidebar "Published"; 5 search "a" + Enter;
//   6 click the "ID" header; 7 no throttling, reload, wait 3 s.
// MODE=nb, the neighbour alone (with a fix in and out), changes nothing, every step recorded, none
//   throwing: the number of list requests and of sidebar count requests when the dashboard opens
//   at `?currentViewId=active`, and after "Published" is chosen in the sidebar (the fix must add
//   no list request and keep the counts' reloads as they are).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/dashboard-loaded-announced-before-list/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, with the 3.5 fleet's feature.
// Facts: .reports/<feature>/<id>/a19-facts-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, screen, shot, record, idle, loc} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.env.MODE || 'walk';

forEachApp(async (app) => {
    const o = {app: app.name, line: app.line || 'main', mode: MODE};
    const {page, close} = await launch(app);
    await page.addInitScript(H.announcerLogInit);
    const reqs = H.watchRequests(page);
    const cdp = await page.context().newCDPSession(page);
    const step = async (key, fn) => {
        try { o[key] = await fn(); } catch (e) { o[key] = {threw: String(e.message).slice(0, 400)}; }
        console.log(`[a19 ${app.name} ${MODE}] ${key}`, JSON.stringify(o[key]).slice(0, 1500));
        record(`a19-${MODE}-${key}`, await screen(page).catch(() => ({url: page.url()})));
        await shot(page, `a19-${MODE}-${key}`).catch(() => {});
        return o[key];
    };
    const act = async (fn, extraMs) => {
        const from = reqs.mark();
        await fn();
        await H.listSettled(page, reqs, from, extraMs);
        const out = H.summarize(from, await H.announcerSince(page, from), reqs.since(from));
        return {url: H.path(page.url()), ...out, after: await H.listNow(page)};
    };
    // The sidebar's view entry, as EditorialDashboardPage.viewLink() finds it.
    const published = () => page.locator('a[href*="dashboard/editorial"]').filter({has: page.getByText('Published', {exact: true})});
    try {
        if (MODE === 'nb') {
            await step('signin', async () => {
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                await idle(page);
                return {url: H.path(page.url())};
            });
            await step('openActive', () => act(async () => {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?currentViewId=active`));
            }, 3000));
            await step('choosePublished', () => act(async () => {
                await published().click();
            }, 3000));
        } else {
            await step('s1signin', () => act(async () => {                                       // 1
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            }, 2000));
            await step('s2throttle', async () => { await H.throttle(cdp, H.SLOW_4G); return {throttle: 'Slow 4G', ...H.SLOW_4G}; }); // 2
            const consoleLines = [];
            page.on('console', (m) => { if (/region:|list request sent/.test(m.text())) consoleLines.push(m.text()); });
            const snip = async () => { const out = consoleLines.splice(0); return out; };
            await step('s3snippet', async () => { await page.evaluate(H.SNIPPET); return {pasted: true}; }); // 3
            await step('s3published', async () => {                                             // 4
                await loc(page, 'sidebar "Published" link', published());
                const r = await act(() => published().click());
                return {...r, snippet: await snip()};
            });
            await step('s4search', async () => {                                                // 5
                const box = page.getByPlaceholder('Search submissions, ID, authors, keywords, etc.', {exact: true});
                await loc(page, 'in-page search box', box);
                await box.fill('a');
                const r = await act(() => box.press('Enter'));
                return {...r, snippet: await snip()};
            });
            await step('s5sortId', async () => {                                                // 6
                const id = page.getByRole('columnheader', {name: /^ID\b/}).getByRole('button');
                await loc(page, '"ID" column header button', id);
                const r = await act(() => id.click());
                return {...r, snippet: await snip()};
            });
            await step('s6reload', async () => {                                                // 7
                await H.throttle(cdp, null);
                return act(() => page.reload(), 3000);
            });
        }
    } finally {
        await H.throttle(cdp, null).catch(() => {});
        record(`a19-facts-${MODE}`, o);
        await idle(page).catch(() => {});
        await close();
    }
});
