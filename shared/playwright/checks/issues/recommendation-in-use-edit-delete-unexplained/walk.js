// Issue walk: U29 A15. A "Reviewer Recommendations" table left open while a reviewer submits a review
// choosing one of its entries still offers that entry's "Edit" and "Delete"; both then fail with a
// message that does not say why (the edit window: "An unexpected error has occurred. …"; the delete:
// a raw "##api.406.notAcceptable##").
//
// OJS only: a press has no "Reviewer Recommendations" tab (spec U29 OMP1) and a preprint server has no
// review stage, so the script returns on the other apps.
//
// Starts from PKP's default test dataset (docs/process/dataset.md), journal `publicknowledge`:
//   rvaca     Journal Manager
//   jjanssen  Reviewer, request on submission 12 not yet answered
//   "Accept Submission", one of the six starting entries, chosen on no review of the dataset
//
// Modes (MODE=…), each on a freshly reset dataset:
//   walk       (default) the report's Steps 1-10: two tabs of the manager's table opened, "Edit" and
//              "Delete" on "Accept Submission" left open, jjanssen submits submission 12's review with
//              it, then "Save" (tab 1) and "Yes" (tab 2), then a reload
//   neighbour  the fix's neighbour: an entry no review uses is edited ("Resubmit Elsewhere") and
//              deleted ("See Comments") as before
//
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<agent> [MODE=neighbour] [PROBE_RUN=<r>] \
//      node bin/probe.js ojs shared/playwright/checks/issues/recommendation-in-use-edit-delete-unexplained/walk.js
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, sql, serverLog} = require('../../../probe');

// A suite page object is required inside forEachApp's fn, never at the top (patterns.md "The app bag").
const STAGE_PAGES = path.resolve(__dirname, '../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');

const MODE = process.env.MODE || 'walk';
const RUN = process.env.PROBE_RUN || 'r0';
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const MANAGER = 'rvaca';
const REVIEWER = 'jjanssen';
const SUB = 12;
const ENTRY = 'Accept Submission';
const RENAMED = `${ENTRY} u29n16f`;
const NB_EDIT = 'Resubmit Elsewhere';
const NB_DELETE = 'See Comments';

function fact(key, value) {
    record(`a15-${MODE}-facts`, {[key]: value}, {merge: true});
    console.log(`[a15 ${MODE} ${RUN}] [${key}]`, JSON.stringify(value).slice(0, 1500));
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[a15] ${app.name}: no reviewer recommendations on this app, nothing to drive`);
        return;
    }
    const cu = (p = '') => app.url(`/index.php/${app.contextPath}${p}`);
    const db = (q) => { try { return sql(app, q).split('\n').filter(Boolean); } catch (e) { return [`ERROR ${flat(e.message, 200)}`]; } };
    // Evidence only, never a step: the stored entries and the reviews that chose one.
    const stored = (label) => fact(`stored.${label}`, {
        entries: db(`SELECT r.reviewer_recommendation_id, r.status, s.setting_value FROM reviewer_recommendations r JOIN reviewer_recommendation_settings s USING (reviewer_recommendation_id) WHERE s.locale = 'en' AND s.setting_name = 'title' ORDER BY 1`),
        chosen: db(`SELECT ra.review_id, ra.submission_id, ra.reviewer_recommendation_id, ra.date_completed IS NOT NULL FROM review_assignments ra WHERE ra.reviewer_recommendation_id IS NOT NULL ORDER BY 1`),
    });
    const log = serverLog(app);
    const logFrom = log.mark();

    const traffic = [];
    const watch = (pg, who) => pg.on('response', async (r) => {
        const u = r.url();
        if (!/reviewers\/recommendations/.test(u)) return;
        const e = {at: Date.now(), who, method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, url: strip(u).slice(0, 160), status: r.status()};
        if (e.method !== 'GET') e.body = flat(await r.text().catch(() => ''), 400);
        traffic.push(e);
    });
    const since = (t0) => traffic.filter((e) => e.at >= t0).map(({at, ...e}) => e);

    let n = 0;
    async function snap(page, name) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), screenError: flat(e.message, 200)}; }
        const id = `a15-${MODE}-${String(++n).padStart(2, '0')}-${name}`;
        record(id, s);
        await shot(page, id).catch(() => {});
        return s;
    }
    const dlg = (page) => page.locator('[role="dialog"]:visible').last();
    const waitModal = async (page) => {
        await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 10000}).catch(() => {});
        await idle(page);
    };

    // ------------------------------------------------ the manager's table (Settings › Workflow › Review)
    const recRoot = (page) => page.locator('[data-cy="reviewer-recommendation-manager"]');
    async function openTable(page) {
        await page.goto(cu('/en/management/settings/workflow'));
        await idle(page);
        await page.locator('#review-button').click();
        await idle(page);
        await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).first().click();
        await recRoot(page).locator('tbody tr').first().waitFor({timeout: T});
        await idle(page);
    }
    const table = (page) => recRoot(page).evaluate((root) => [...root.querySelectorAll('tbody tr')].map((tr) => ({
        title: (tr.querySelector('th, td') || {}).innerText?.trim(),
        active: tr.querySelector('input[type=checkbox]')?.checked ?? null,
        menu: [...tr.querySelectorAll('button')].some((b) => (b.getAttribute('aria-label') || b.innerText).trim() === 'More Actions'),
    }))).catch((e) => `ERROR ${flat(e.message, 200)}`);
    const row = (page, title) => recRoot(page).locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})}).first();
    /** "More Actions" on a row, then the item; returns false (recorded, not thrown) when either is missing. */
    async function menuItem(page, title, item) {
        const btn = row(page, title).getByRole('button', {name: 'More Actions'});
        if (!(await btn.count())) return {menu: false};
        await btn.click();
        const menu = page.locator('[data-reka-menu-content][role="menu"]');
        await menu.waitFor({timeout: 5000}).catch(() => {});
        const items = (await menu.locator('[role="menuitem"]').allInnerTexts()).map((x) => x.trim());
        const it = menu.locator('[role="menuitem"]').filter({hasText: new RegExp(`^\\s*${item}\\s*$`)}).first();
        if (!(await it.count())) { await page.keyboard.press('Escape'); return {menu: true, items, item: false}; }
        await it.click();
        await waitModal(page);
        return {menu: true, items, item: true};
    }
    const titleBox = (page) => dlg(page).locator('input[name="title-en"]').first();

    const mgr = await launch(app);
    mgr.page.setDefaultTimeout(T);
    await signIn(mgr.page, MANAGER, {contextPath: app.contextPath});
    await idle(mgr.page).catch(() => {});

    if (MODE === 'neighbour') {
        const A = mgr.page;
        watch(A, 'tab1');
        stored('nb-start');
        await openTable(A);
        fact('nb.table0', await table(A));
        // an unused entry, edited
        let t0 = Date.now();
        const e = await menuItem(A, NB_EDIT, 'Edit');
        fact('nb.edit.menu', e);
        if (e.item) {
            await titleBox(A).waitFor({timeout: T});
            await titleBox(A).fill(`${NB_EDIT} u29n16f`);
            await dlg(A).getByRole('button', {name: 'Save', exact: true}).last().click();
            await sleep(2000); await idle(A);
        }
        const s1 = await snap(A, 'nb-edited');
        fact('nb.edit', {windowOpen: await A.locator('input[name="title-en"]:visible').count(), notices: s1.notices, table: await table(A), traffic: since(t0)});
        // an unused entry, deleted
        t0 = Date.now();
        const d = await menuItem(A, NB_DELETE, 'Delete');
        fact('nb.delete.menu', d);
        let asked = null;
        if (d.item) {
            asked = flat(await dlg(A).innerText().catch(() => ''), 300);
            await dlg(A).getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(2000); await idle(A);
        }
        const s2 = await snap(A, 'nb-deleted');
        fact('nb.delete', {asked, dialogOpen: await A.locator('[role="dialog"]:visible').count(), dialogText: flat(await dlg(A).innerText().catch(() => ''), 300), notices: s2.notices, table: await table(A), traffic: since(t0)});
        stored('nb-end');
        fact('serverLog', log.since(logFrom));
        return;
    }

    // ================================================ walk: the report's Steps
    stored('start');
    // Steps 1-2: tab 1, the table
    const A = mgr.page;
    watch(A, 'tab1');
    await openTable(A);
    const s0 = await snap(A, 'step2-table');
    fact('step2.table', await table(A));
    // Step 3: tab 2, the same page
    const B = await mgr.context.newPage();
    B.setDefaultTimeout(T);
    watch(B, 'tab2');
    await openTable(B);
    // Step 4: tab 1, "Edit" on the entry, title changed, not saved
    fact('step4.menu', await menuItem(A, ENTRY, 'Edit'));
    await titleBox(A).waitFor({timeout: T}).catch(() => {});
    await titleBox(A).fill(RENAMED).catch((e) => fact('step4.fillFailed', flat(e.message, 200)));
    await snap(A, 'step4-edit-open');
    fact('step4.window', flat(await dlg(A).innerText().catch(() => ''), 300));
    // Step 5: tab 2, "Delete" on the entry, the question left open
    fact('step5.menu', await menuItem(B, ENTRY, 'Delete'));
    await snap(B, 'step5-delete-open');
    fact('step5.asked', flat(await dlg(B).innerText().catch(() => ''), 300));

    // Steps 6-7: the reviewer, in a browser of her own, submits submission 12's review with the entry
    const rv = await launch(app);
    rv.page.setDefaultTimeout(T);
    await signIn(rv.page, REVIEWER, {contextPath: app.contextPath});
    await idle(rv.page).catch(() => {});
    const RS = require(STAGE_PAGES);
    try {
        await RS.performReview(rv.page, app.contextPath, SUB, {recommendation: ENTRY, comments: 'u29n16f review comment.'});
        fact('step7.submitted', true);
    } catch (e) {
        fact('step7.FAILED', flat(e.stack || e, 800));
    }
    await snap(rv.page, 'step7-review-submitted');
    stored('after-review');

    // Step 8: tab 1, "Save"
    let t0 = Date.now();
    await dlg(A).getByRole('button', {name: 'Save', exact: true}).last().click().catch((e) => fact('step8.clickFailed', flat(e.message, 200)));
    await sleep(2500); await idle(A);
    const s8 = await snap(A, 'step8-saved');
    fact('step8', {windowOpen: await A.locator('input[name="title-en"]:visible').count(), windowHeading: flat(await dlg(A).locator('h1, h2').first().innerText().catch(() => null), 100), notices: s8.notices, table: await table(A), traffic: since(t0)});

    // Step 9: tab 2, "Yes"
    t0 = Date.now();
    await dlg(B).getByRole('button', {name: 'Yes', exact: true}).click().catch((e) => fact('step9.clickFailed', flat(e.message, 200)));
    await sleep(2500); await idle(B);
    const s9 = await snap(B, 'step9-yes');
    fact('step9', {dialogOpen: await B.locator('[role="dialog"]:visible').count(), dialogText: flat(await dlg(B).innerText().catch(() => ''), 400), notices: s9.notices, table: await table(B), traffic: since(t0)});
    stored('after-steps');

    // Step 10: tab 1 reloaded
    await A.reload(); await idle(A);
    await openTable(A);
    await snap(A, 'step10-reloaded');
    fact('step10.table', await table(A));
    fact('step10.menu', await menuItem(A, ENTRY, 'Edit'));
    fact('traffic.all', traffic.map(({at, ...e}) => e));
    fact('serverLog', log.since(logFrom));
    void s0;
});
