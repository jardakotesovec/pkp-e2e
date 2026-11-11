// U29 claim check I33 (housekeeping, an incidentals row of 2026-11-10; Rule 18 and register A6).
// OJS only: a press and a preprint server have no reviewer recommendations (spec OMP1; OPS has no review
// stage), so the script returns on the other apps.
//
// On PKP's default dataset (dataset.md), context `publicknowledge`, review 19 (jjanssen, submission 13
// "Hydrologic Connectivity …", round 1, "Revisions Required", entry id 2, also chosen on reviews 15 and 20).
// Accounts: rvaca (Journal Manager), dbarnes (Journal editor, for the new round), jjanssen (Reviewer).
//
// Phases, one process, in this order (PHASES=… narrows; the later ones need the earlier ones' state):
//   base     rvaca: Settings › Workflow › Review › "Reviewer Recommendations" (the menus); jjanssen: the
//            "Completed" list and the completed review's own page (step 4, then step 3); rvaca: Tools ›
//            Import/Export › "Native XML Plugin" › "Export Articles", submission 13: file E1
//   deact1   rvaca: untick "Revisions Required", "Yes"; jjanssen's page again; file E2; dbarnes: the
//            Reviewers row of jjanssen, its "More Actions" › "Review Details" window (A6, the control; a
//            thanked review has no "Read Review") and that window's "Download" › "… (XML)" file
//   react1   rvaca: tick it again, "Yes"; jjanssen's page again; file E3
//   round2   dbarnes: "Create New Review Round" on submission 13 (no reviewer added: the reviewer's page
//            gains the "Previous Reviews" box once her round is not the last); jjanssen: that box,
//            "Read Round 1 Review" (the review history)
//   deact2   rvaca: untick, "Yes"; jjanssen: "Read Round 1 Review" again; rvaca: tick, "Yes"; jjanssen: again
//   race     rvaca: "Add Recommendation" "I33 later used <run>"; tab A: its "More Actions" › "Edit", the name
//            changed and left unsaved; tab B: its "More Actions" › "Delete", the question left open;
//            jjanssen: her pending request on submission 12 accepted and submitted with that entry; tab A:
//            "Save"; tab B: "Yes";
//            both tabs read again and after a reload; the edit window left with a change unsaved
// The browser's own requests to `reviewers/recommendations` and `reviews/history` are kept with their
// answers (status and body); no request is built by hand.
//
// Mutates the dataset fleet: reset before each run, two runs (r1, r2):
//   npm run reset:ojs -- --dataset 2
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=inc-U29 PROBE_AGENT=cc1111c PROBE_RUN=r1 \
//       node bin/probe.js ojs shared/playwright/checks/U29/I33/i33.js
// Facts: .reports/inc-U29/cc1111c/i33-facts-<run>-ojs.json, snapshots i33-<nn>-<name>-<run>-ojs.json beside it,
// export files i33-export-E<n>-<run>-ojs.xml (outFile). No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
// A suite page object is required inside forEachApp's fn, never at the top (patterns.md "The app bag").
const STAGE_PAGES = path.resolve(__dirname, '../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, sql, outFile} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['base', 'deact1', 'react1', 'round2', 'deact2', 'race'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',').map((s) => s.trim());
const on = (p) => PHASES.includes(p);
const T = 30_000;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SUB = 13;
const RACE_SUB = 12; // jjanssen r1 "not responded" in the dataset (dataset.md)
const SUB_TITLE = 'Hydrologic Connectivity in the Edwards Aquifer';
const REC = 'Revisions Required';
const MANAGER = 'rvaca';
const EDITOR = 'dbarnes';
const REVIEWER = 'jjanssen';
const REVIEWER_NAME = 'Julie Janssen';
const CUSTOM = `I33 later used ${RUN}`;

function fact(key, value) {
    record('i33-facts', {[key]: value}, {merge: true});
    console.log(`[i33 ${RUN} +${Math.round((Date.now() - T0) / 1000)}s] [${key}]`, JSON.stringify(value).slice(0, 1800));
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[i33 ${RUN}] ${app.name}: no reviewer recommendations on this app, nothing to drive`);
        return;
    }
    const db = (q) => { try { return sql(app, q).split('\n').filter(Boolean); } catch (e) { return [`ERROR ${flat(e.message, 200)}`]; } };
    const cu = (p = '') => app.url(`/index.php/${app.contextPath}${p}`);
    const stored = (label) => fact(`stored.${label}`, {
        entries: db(`SELECT r.reviewer_recommendation_id, r.status, s.setting_value FROM reviewer_recommendations r JOIN reviewer_recommendation_settings s USING (reviewer_recommendation_id) WHERE s.locale = 'en' AND s.setting_name = 'title' ORDER BY 1`),
        reviews: db(`SELECT ra.review_id, u.username, ra.submission_id, ra.round, ra.reviewer_recommendation_id, ra.date_completed IS NOT NULL FROM review_assignments ra JOIN users u ON u.user_id = ra.reviewer_id WHERE ra.reviewer_recommendation_id IS NOT NULL OR ra.submission_id IN (${SUB}, ${RACE_SUB}) ORDER BY 1`),
    });

    // Three browsers: the manager (two tabs in phase race), the editor, the reviewer.
    const B = {};
    const traffic = [];
    async function open(key) {
        if (B[key]) return B[key];
        const b = await launch(app);
        b.page.setDefaultTimeout(T);
        const watch = (pg, tab) => pg.on('response', async (r) => {
            const u = r.url();
            if (!/reviewers\/recommendations|reviews\/history|NativeImportExportPlugin\/export/.test(u)) return;
            const e = {at: Date.now(), who: key, tab, method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, url: strip(u).slice(0, 200), status: r.status()};
            if (!/NativeImportExportPlugin/.test(u)) {
                const body = await r.text().catch(() => '');
                if (/reviews\/history/.test(u)) {
                    // the window's own data: the title it prints, and the stored choice behind it
                    try { const j = JSON.parse(body); e.recommendation = j.recommendation; e.reviewerRecommendationId = j.reviewAssignment?.reviewerRecommendationId ?? '(absent)'; } catch (x) { e.body = flat(body, 300); }
                } else e.body = flat(body, 1500);
            }
            traffic.push(e);
        });
        watch(b.page, 'A');
        b.watch = watch;
        B[key] = b;
        return b;
    }
    const since = (t0, who) => traffic.filter((e) => e.at >= t0 && (!who || e.who === who)).map(({at, ...e}) => e);

    let snapN = 0;
    async function snap(page, name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), text: {}, screenError: flat(e.message, 200)}; }
        if (extra) s.facts = extra;
        const n = `i33-${String(++snapN).padStart(2, '0')}-${name}`;
        record(n, s);
        await shot(page, n).catch(() => {});
        return {name: `${n}-${RUN}-${app.name}`, s};
    }
    async function phase(name, fn) {
        if (!on(name)) return;
        const t0 = Date.now();
        console.log(`[i33 ${RUN}] == ${name}`);
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1500));
            for (const k of Object.keys(B)) await snap(B[k].page, `zz-failed-${name}-${k}`).catch(() => {});
        }
        fact(`${name}.traffic`, since(t0));
    }
    const go = async (page, url) => { const r = await page.goto(url).catch((e) => ({err: flat(e.message, 200)})); await idle(page).catch(() => {}); return r; };
    const dlg = (page) => page.locator('[role="dialog"]:visible').last();
    const waitModal = async (page) => { await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 10000}).catch(() => {}); await idle(page); };

    // ------------------------------------------------------------ the manager's table
    const recRoot = (page) => page.locator('[data-cy="reviewer-recommendation-manager"]');
    async function openRecTab(page) {
        await go(page, cu('/en/dashboard/editorial'));
        await go(page, cu('/en/management/settings/workflow'));
        await page.locator('#review-button').click(); await idle(page);
        await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).first().click();
        await recRoot(page).locator('tbody tr').first().waitFor({timeout: T});
        await idle(page);
    }
    const recTable = (page) => recRoot(page).evaluate((root) => ({
        columns: [...root.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...root.querySelectorAll('tbody tr')].map((tr) => ({
            title: (tr.querySelector('th, td') || {}).innerText?.trim(),
            checked: tr.querySelector('input[type=checkbox]')?.checked ?? null,
            buttons: [...tr.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
        })),
    }));
    const recRow = (page, title) => recRoot(page).locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})}).first();
    async function tick(page, title, want) {
        const row = recRow(page, title);
        const before = await row.locator('input[type=checkbox]').isChecked();
        await row.locator('input[type=checkbox]').click();
        await waitModal(page);
        const asked = flat(await dlg(page).innerText().catch(() => ''), 300);
        await dlg(page).getByRole('button', {name: 'Yes', exact: true}).click();
        await page.waitForFunction(({title, want}) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === title && tr.querySelector('input[type=checkbox]')?.checked === want), {title, want}, {timeout: 10000}).catch(() => {});
        await idle(page);
        return {before, asked, after: await row.locator('input[type=checkbox]').isChecked().catch(() => null)};
    }
    async function menuOf(page, title) {
        const btn = recRow(page, title).getByRole('button', {name: 'More Actions'});
        if (!(await btn.count())) return {present: false};
        await btn.click();
        await page.locator('[data-reka-menu-content][role="menu"]').waitFor({timeout: 5000}).catch(() => {});
        const items = (await page.locator('[data-reka-menu-content][role="menu"] [role="menuitem"]').allInnerTexts()).map((x) => x.trim());
        return {present: true, items};
    }
    async function closeMenu(page) {
        const m = page.locator('[data-reka-menu-content][role="menu"]');
        if (await m.count()) { await m.first().press('Escape').catch(() => {}); await sleep(300); }
    }

    // ------------------------------------------------------------ the reviewer's pages
    /** jjanssen's own page of submission 13 (step N when given), what its "Recommendation" list holds. */
    async function reviewerPage(page, label, step) {
        await go(page, cu(`/en/reviewer/submission/${SUB}${step ? `?step=${step}` : ''}`));
        await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"], main .ui-tabs-loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page); await sleep(800);
        const s = await snap(page, label);
        const out = {snap: s.name, url: strip(page.url()),
            heading: flat(await page.locator('main h1').first().innerText().catch(() => null), 200),
            tabs: await page.locator('main [role=tab]').evaluateAll((ts) => ts.map((t) => `${t.innerText.trim()}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}${t.getAttribute('aria-disabled') === 'true' ? ' (disabled)' : ''}`)).catch(() => []),
        };
        const sel = page.locator('main select#reviewerRecommendationId:visible, main select[name="reviewerRecommendationId"]:visible').first();
        if (await sel.count()) {
            out.recommendationList = await sel.evaluate((s) => ({disabled: s.disabled, selected: s.options[s.selectedIndex]?.text.trim() ?? null, options: [...s.options].map((o) => o.text.trim())}));
            await loc(page, 'Reviewer page step 3: "Recommendation" list (completed review)', sel);
        }
        const panel = page.locator('main [role=tabpanel]:visible').first();
        out.panel = flat(await panel.innerText().catch(() => null), 1500);
        out.recommendationLines = (await panel.innerText().catch(() => '')).split('\n').map((l, i, a) => (/Recommendation/i.test(l) ? flat(`${l} ⏎ ${a[i + 1] || ''}`, 200) : null)).filter(Boolean);
        return out;
    }
    async function completedList(page, label) {
        await go(page, cu('/en/dashboard/reviewAssignments?currentViewId=reviewer-assignments-completed'));
        await page.locator('main table tbody tr td, main :text("No Items")').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(500);
        const s = await snap(page, label);
        return {snap: s.name, rows: (await page.locator('main table tbody tr').allInnerTexts().catch(() => [])).map((x) => flat(x, 300))};
    }
    /** The round-2 page's "Previous Reviews" box and its "Read Round 1 Review" window. */
    async function roundHistory(page, label) {
        const t0 = Date.now();
        await go(page, cu(`/en/reviewer/submission/${SUB}`));
        const box = page.locator('div').filter({has: page.getByRole('heading', {name: 'Previous Reviews', exact: true})}).last();
        await box.waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        const s0 = await snap(page, `${label}-page`);
        const out = {pageSnap: s0.name, box: flat(await box.innerText().catch(() => null), 400)};
        const btn = box.getByRole('button', {name: 'Read Round 1 Review'});
        out.buttons = await btn.count();
        if (!out.buttons) return out;
        await loc(page, 'Reviewer page: "Previous Reviews" › "Read Round 1 Review"', btn);
        await btn.click();
        const d = page.getByRole('dialog').last();
        await d.waitFor({timeout: T});
        await page.waitForFunction(() => { const ds = document.querySelectorAll('[role="dialog"]'); const l = ds[ds.length - 1]; return !!l && l.innerText.length > 150; }, null, {timeout: T}).catch(() => {});
        await idle(page); await sleep(800);
        const s = await snap(page, `${label}-window`);
        const text = s.s.text?.dialog || (await d.innerText().catch(() => ''));
        out.windowSnap = s.name;
        out.windowTitle = flat(await d.locator('h1, h2').first().innerText().catch(() => null), 200);
        out.recommendationLines = text.split('\n').map((l, i, a) => (/Recommendation/i.test(l) ? flat(`${l} ⏎ ${a[i + 1] || ''} ⏎ ${a[i + 2] || ''}`, 220) : null)).filter(Boolean);
        out.windowText = flat(text, 1500);
        out.history = since(t0).filter((e) => /reviews\/history/.test(e.url)).map(({who, tab, ...e}) => e);
        await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(700);
        return out;
    }

    // ------------------------------------------------------------ the Native XML Plugin
    async function exportSub(page, label) {
        const t0 = Date.now();
        await go(page, cu('/en/management/importexport/plugin/NativeImportExportPlugin'));
        await page.locator('#importExportTabs').waitFor({timeout: 20000});
        const s0 = await snap(page, `${label}-plugin`);
        await page.getByRole('tab', {name: 'Export Articles', exact: true}).first().click();
        const tab = page.locator('#exportSubmissions-tab');
        await tab.locator('.listPanel__item, .listPanel__empty').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        let item = tab.locator('.listPanel__item').filter({hasText: SUB_TITLE});
        if (!(await item.count())) {
            const search = tab.locator('input[type=search]').first();
            await search.fill('Hydrologic'); await search.press('Enter');
            await sleep(1200); await idle(page);
            item = tab.locator('.listPanel__item').filter({hasText: SUB_TITLE});
        }
        const s1 = await snap(page, `${label}-list`);
        await item.first().locator('input[type=checkbox]').check();
        const before = await page.locator('#importExportTabs > ul [role="tab"]').count();
        await tab.getByRole('button', {name: 'Export Articles', exact: true}).click();
        for (let i = 0; i < 40; i++) { await sleep(500); if ((await page.locator('#importExportTabs > ul [role="tab"]').count()) > before && await page.getByRole('button', {name: 'Download Exported File'}).isVisible().catch(() => false)) break; }
        await idle(page);
        const s2 = await snap(page, `${label}-result`);
        const dl = page.waitForEvent('download', {timeout: 20000}).catch((e) => ({err: flat(e.message, 120)}));
        await page.getByRole('button', {name: 'Download Exported File'}).first().click().catch(() => {});
        const d = await dl;
        const out = {pluginSnap: s0.name, listSnap: s1.name, resultSnap: s2.name};
        if (d && !d.err) {
            const xml = fs.readFileSync(await d.path(), 'utf8');
            const f = outFile(`i33-export-${label}.xml`);
            fs.writeFileSync(f, xml);
            out.file = f.replace(/^.*\/\.reports\//, '.reports/');
            out.bytes = xml.length;
            out.recommendationMentions = (xml.match(/[^<>]{0,60}(recommendation|Revisions Required|peer-review)[^<>]{0,60}/gi) || []).slice(0, 10);
            out.reviewElements = [...new Set((xml.match(/<[a-z_:-]*review[a-z_:-]*/gi) || []))];
            out.topElements = [...new Set((xml.match(/<[a-z_:-]+/gi) || []))].slice(0, 60);
        } else out.download = d;
        out.requests = since(t0).filter((e) => /NativeImportExportPlugin/.test(e.url));
        return out;
    }

    // ------------------------------------------------------------ the editor's window (A6 control)
    async function readReview(page, label) {
        await go(page, cu(`/en/dashboard/editorial?workflowSubmissionId=${SUB}`));
        await page.getByRole('heading', {name: /^Workflow:/}).waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(800);
        // the review stage, round 1 (the workflow opens on the current stage)
        const r1 = page.getByRole('link', {name: 'Review Round 1', exact: true});
        if (await r1.count()) { await r1.first().click().catch(() => {}); await idle(page); await sleep(600); }
        const row = page.locator('[role="dialog"] table tbody tr').filter({hasText: REVIEWER_NAME}).first();
        const out = {row: flat(await row.innerText().catch(() => null), 300)};
        const s0 = await snap(page, `${label}-reviewers`);
        out.rowSnap = s0.name;
        const btn = row.getByRole('button', {name: 'Read Review', exact: true});
        if (await btn.count()) { out.opener = 'Read Review'; await btn.click(); } else {
            // a thanked review (the dataset's) has no "Read Review": its row menu's "Review Details" opens the window
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.locator('[data-reka-menu-content][role="menu"]').waitFor({timeout: 5000}).catch(() => {});
            out.menu = (await page.locator('[data-reka-menu-content][role="menu"] [role="menuitem"]').allInnerTexts()).map((x) => x.trim());
            const item = page.locator('[data-reka-menu-content][role="menu"] [role="menuitem"]').filter({hasText: /^\s*Review Details\s*$/});
            if (!(await item.count())) { await closeMenu(page); return out; }
            out.opener = 'More Actions › Review Details';
            await item.first().click();
        }
        const d = page.getByRole('dialog', {name: /^Review Details:/});
        await d.waitFor({timeout: T}).catch(() => {});
        await d.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role="dialog"]')].pop(); return x && !/Loading/.test(x.innerText); }, null, {timeout: T}).catch(() => {});
        await idle(page); await sleep(1200);
        const s = await snap(page, `${label}-window`);
        const text = s.s.text?.dialog || '';
        out.windowSnap = s.name;
        out.recommendationLines = text.split('\n').map((l, i, a) => (/Recommendation/i.test(l) ? flat(`${l} ⏎ ${a[i + 1] || ''} ⏎ ${a[i + 2] || ''}`, 220) : null)).filter(Boolean);
        // the window's "Download Review Form" › "Editor Form Shows All Review Sections (XML)": the file the
        // incidentals row's `peer-review-recommendation` element lives in (PKPReviewController::generateXML)
        const x = {};
        const menuBtn = d.locator('button').filter({hasText: /^\s*Download/}).first();
        x.button = flat(await menuBtn.innerText({timeout: 5000}).catch(() => ''), 80);
        await menuBtn.click({timeout: 5000}).catch((e) => { x.menuClick = flat(e.message, 160); });
        await sleep(800);
        x.items = (await page.locator('[role="menuitem"]:visible').allInnerTexts().catch(() => [])).map((y) => flat(y, 80));
        const item = page.locator('[role="menuitem"]:visible').filter({hasText: /XML/}).last();
        x.pressed = flat(await item.innerText({timeout: 5000}).catch(() => ''), 80);
        const arrived = page.waitForEvent('download', {timeout: 15000}).catch((e) => ({err: flat(e.message, 100)}));
        await item.click({timeout: 5000}).catch((e) => { x.itemClick = flat(e.message, 160); });
        const dl = await arrived;
        if (dl && !dl.err) {
            const xml = fs.readFileSync(await dl.path(), 'utf8');
            const f = outFile(`i33-reviewform-${label}.xml`);
            fs.writeFileSync(f, xml);
            x.file = f.replace(/^.*\/\.reports\//, '.reports/');
            x.recommendation = (xml.match(/peer-review-recommendation[\s\S]{0,200}?<\/meta-value>/) || [null])[0];
        } else x.download = dl;
        out.reviewFormXml = x;
        await idle(page); await sleep(500);
        if (await d.isVisible().catch(() => false)) {
            await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(700);
        }
        return out;
    }

    try {
        stored('start');
        const mg = await open('mg');
        await signIn(mg.page, MANAGER, {contextPath: app.contextPath}); await idle(mg.page).catch(() => {});
        const rv = await open('rv');
        await signIn(rv.page, REVIEWER, {contextPath: app.contextPath}); await idle(rv.page).catch(() => {});

        // ======================================================== base
        await phase('base', async () => {
            await openRecTab(mg.page);
            const s = await snap(mg.page, 'base-table');
            const table = await recTable(mg.page);
            await loc(mg.page, 'Reviewer Recommendations table', recRoot(mg.page).locator('table'));
            const menus = {};
            for (const r of table.rows) { menus[r.title] = await menuOf(mg.page, r.title); await closeMenu(mg.page); }
            fact('base.table', {snap: s.name, ...table, menus});
            fact('base.completedList', await completedList(rv.page, 'base-rv-completed'));
            fact('base.reviewerPage', await reviewerPage(rv.page, 'base-rv-page'));
            fact('base.reviewerStep3', await reviewerPage(rv.page, 'base-rv-step3', 3));
            fact('base.export', await exportSub(mg.page, 'E1'));
        });

        // ======================================================== deact1
        await phase('deact1', async () => {
            await openRecTab(mg.page);
            const t = await tick(mg.page, REC, false);
            const s = await snap(mg.page, 'deact1-table');
            fact('deact1.tick', {...t, snap: s.name, table: await recTable(mg.page), notices: s.s.notices});
            stored('deact1');
            fact('deact1.completedList', await completedList(rv.page, 'deact1-rv-completed'));
            fact('deact1.reviewerPage', await reviewerPage(rv.page, 'deact1-rv-page'));
            fact('deact1.reviewerStep3', await reviewerPage(rv.page, 'deact1-rv-step3', 3));
            fact('deact1.export', await exportSub(mg.page, 'E2'));
            const ed = await open('ed');
            await signIn(ed.page, EDITOR, {contextPath: app.contextPath}); await idle(ed.page).catch(() => {}); ed.signed = true;
            fact('deact1.readReview', await readReview(ed.page, 'deact1-ed'));
        });

        // ======================================================== react1
        await phase('react1', async () => {
            await openRecTab(mg.page);
            const t = await tick(mg.page, REC, true);
            const s = await snap(mg.page, 'react1-table');
            fact('react1.tick', {...t, snap: s.name});
            fact('react1.reviewerStep3', await reviewerPage(rv.page, 'react1-rv-step3', 3));
            fact('react1.export', await exportSub(mg.page, 'E3'));
            if (B.ed) fact('react1.readReview', await readReview(B.ed.page, 'react1-ed'));
        });

        // ======================================================== round2
        await phase('round2', async () => {
            const ed = await open('ed');
            if (!ed.signed) { await signIn(ed.page, EDITOR, {contextPath: app.contextPath}); await idle(ed.page).catch(() => {}); ed.signed = true; }
            const RS = require(STAGE_PAGES);
            const wf = new RS.WorkflowPage(ed.page, app.contextPath);
            await wf.gotoEditorial(SUB);
            await idle(ed.page); await sleep(800);
            const s0 = await snap(ed.page, 'round2-ed-workflow');
            const decisions = (await ed.page.locator('[role="dialog"] button').allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
            fact('round2.workflow', {snap: s0.name, buttons: decisions.slice(0, 40)});
            await RS.createNewReviewRound(ed.page, wf, 2);
            await idle(ed.page);
            await idle(ed.page); await sleep(800);
            const s1 = await snap(ed.page, 'round2-ed-round2');
            fact('round2.created', {snap: s1.name});
            stored('round2');
            fact('round2.history', await roundHistory(rv.page, 'round2-rv-history'));
        });

        // ======================================================== deact2
        await phase('deact2', async () => {
            await openRecTab(mg.page);
            fact('deact2.tick', await tick(mg.page, REC, false));
            stored('deact2');
            fact('deact2.history', await roundHistory(rv.page, 'deact2-rv-history'));
            await openRecTab(mg.page);
            fact('react2.tick', await tick(mg.page, REC, true));
            fact('react2.history', await roundHistory(rv.page, 'react2-rv-history'));
        });

        // ======================================================== race
        await phase('race', async () => {
            const A = mg.page;
            await openRecTab(A);
            await recRoot(A).getByRole('button', {name: 'Add Recommendation', exact: true}).click();
            await waitModal(A);
            let d = dlg(A);
            await d.locator('input[name="title-en"]').first().waitFor({timeout: T});
            await d.locator('input[name="title-en"]').first().fill(CUSTOM);
            await d.locator('select[name="type"]').first().selectOption({label: 'Revisions Requested'});
            await d.getByRole('button', {name: 'Save', exact: true}).last().click();
            await A.waitForFunction((t) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === t), CUSTOM, {timeout: 15000}).catch(() => {});
            await idle(A); await sleep(600);
            const s0 = await snap(A, 'race-added');
            fact('race.added', {snap: s0.name, menu: await menuOf(A, CUSTOM)});
            await closeMenu(A);
            stored('race-added');

            // tab A: the edit window, name changed, unsaved
            await menuOf(A, CUSTOM);
            await A.locator('[data-reka-menu-content][role="menu"] [role="menuitem"]').filter({hasText: /^\s*Edit\s*$/}).first().click();
            await waitModal(A);
            d = dlg(A);
            await d.locator('input[name="title-en"]').first().waitFor({timeout: T});
            await d.locator('input[name="title-en"]').first().fill(`${CUSTOM} renamed`);
            const sA = await snap(A, 'race-A-edit-open');
            fact('race.A.open', {snap: sA.name, title: flat(await d.locator('h1, h2').first().innerText().catch(() => null), 100)});

            // tab B: the delete question, open
            const Bp = await mg.context.newPage();
            Bp.setDefaultTimeout(T);
            mg.watch(Bp, 'B');
            await openRecTab(Bp);
            await menuOf(Bp, CUSTOM);
            await Bp.locator('[data-reka-menu-content][role="menu"] [role="menuitem"]').filter({hasText: /^\s*Delete\s*$/}).first().click();
            await waitModal(Bp);
            const sB = await snap(Bp, 'race-B-delete-open');
            fact('race.B.open', {snap: sB.name, asked: flat(await dlg(Bp).innerText().catch(() => ''), 300)});

            // the reviewer submits the round-2 review with the new entry
            const RS = require(STAGE_PAGES);
            const tR = Date.now();
            await RS.performReview(rv.page, app.contextPath, RACE_SUB, {recommendation: CUSTOM, comments: `I33 ${RUN} review comment.`});
            const sR = await snap(rv.page, 'race-rv-submitted');
            fact('race.reviewer', {snap: sR.name, ms: Date.now() - tR});
            stored('race-used');

            // tab A: "Save"
            let t0 = Date.now();
            await dlg(A).getByRole('button', {name: 'Save', exact: true}).last().click();
            await sleep(2500); await idle(A);
            const sA2 = await snap(A, 'race-A-saved');
            fact('race.A.save', {snap: sA2.name, windowOpen: await A.locator('input[name="title-en"]:visible').count(), windowText: flat(await dlg(A).innerText().catch(() => ''), 600), notices: sA2.s.notices, errors: await A.locator('.pkpFieldError, .pkpFormPage__status, .pkpFormErrors, [role="alert"]').allInnerTexts().catch(() => []), traffic: since(t0, 'mg')});
            // tab B: "Yes"
            t0 = Date.now();
            await dlg(Bp).getByRole('button', {name: 'Yes', exact: true}).click();
            await sleep(2500); await idle(Bp);
            const sB2 = await snap(Bp, 'race-B-deleted');
            fact('race.B.yes', {snap: sB2.name, dialogOpen: await Bp.locator('[role="dialog"]:visible').count(), dialogText: flat(await dlg(Bp).innerText().catch(() => ''), 300), notices: sB2.s.notices, table: await recTable(Bp).catch(() => null), traffic: since(t0, 'mg')});
            stored('race-after');

            // tab A: the edit window left with the change unsaved (its "Close")
            if (await A.locator('input[name="title-en"]:visible').count()) {
                await dlg(A).getByRole('button', {name: 'Close'}).first().click().catch(() => {});
                await sleep(2500); await idle(A);
            }
            const sA3 = await snap(A, 'race-A-closed');
            fact('race.A.closed', {snap: sA3.name, table: await recTable(A).catch(() => null), notices: sA3.s.notices});
            // both read again after a reload
            await A.reload(); await idle(A);
            await openRecTab(A);
            const sA4 = await snap(A, 'race-A-reloaded');
            fact('race.A.reloaded', {snap: sA4.name, table: await recTable(A), menu: await menuOf(A, CUSTOM)});
            await closeMenu(A);
            await Bp.reload(); await idle(Bp);
            await openRecTab(Bp);
            const sB4 = await snap(Bp, 'race-B-reloaded');
            fact('race.B.reloaded', {snap: sB4.name, table: await recTable(Bp)});
            stored('end');
        });
    } finally {
        fact('traffic.all', traffic.map(({at, ...e}) => e).slice(0, 120));
        note(`[cc1111c I33 ojs ${RUN}] Reviewer Recommendations: rows are [data-cy="reviewer-recommendation-manager"] tbody tr; the row menu is getByRole('button', {name: 'More Actions'}) and its items [data-reka-menu-content][role="menu"] [role="menuitem"]. The reviewer's "Previous Reviews" box appears only on a later round's page (a round that is not the submission's last); its "Read Round 1 Review" window fetches GET reviews/history/{submissionId}/{reviewRoundId}.`);
    }
});
