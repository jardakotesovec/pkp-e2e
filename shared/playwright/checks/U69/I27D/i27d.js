// U69 claim check I27D (housekeeping 2026-10-27): the incidental row "the book page's 'Downloads' chart"
// (U69 Rule 20, 20a), the OMP twin of the U13 claim check I27B (../../U13/I27B/i27b.js), on PKP's default
// test dataset, OMP `main` and `stable-3_5_0`:
//   0. seed: book 14 ("From Bricks to Brains") gets its first (only) version's date_published moved back to
//      OLD_DATE (default 2025-06-01) in the database, so one book spans more than twelve months and one
//      (book 5, "Bomb Canada", published on the dataset's build day) does not. A seed, not a screen step
//      (the chart reads the stored date of the first version). Nothing else is seeded.
//   1. rvaca (Press manager): Settings › Website › Appearance › Theme, "Usage statistics display options"
//      set to "Use bar type of the chart for usage statistics display.", Save (read on the page and after a
//      reload; then left once with "line" ticked and unsaved: the "Setup" tab and back, then another page);
//   2. signed out: book 5's and book 14's pages (the control read: nothing processed; the first opening,
//      which fills the chart's kept copy), the "All time" / "Last 12 months" button pressed both ways where
//      there is one; a chapter page (no chart);
//   3. signed out, an ordinary browser: book 5's first file opened (its view page), book 14's chapter 1 PDF
//      (a "Book Manuscript" file) and the side column's first file (a supplementary component, "Table" or
//      "Other") opened;
//   4. the next day's "Usage statistics file loader task" (nextDay() in ../../U64/I23E/lib.js);
//   5. signed out: both books' charts again (read A, and after a reload);
//   6. admin: Administration › "Delete Data Caches"; signed out: both charts again (read B, after a reload,
//      the button pressed both ways).
// Every chart read also lists the page's headings in document order (visible or screen-reader only) and the
// canvas's role, label and fallback content.
// Other files: ../../U64/I23E/lib.js (required, not copied). No PART; outputs are the agent folder's
// (record/outFile names carry PROBE_RUN). The drive changes the dataset: reset the fleet before each run.
// Run (main):  npm run fleet-prep -- --feature issues-cc27d --dataset 7 --reset
//              bin/app-lock.sh shared omp -- env PROBE_FEATURE=issues-cc27d PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U69 \
//                  PROBE_AGENT=cc27d PROBE_RUN=r1 node bin/probe.js omp shared/playwright/checks/U69/I27D/i27d.js
// Run (3.5):   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc27d-3_5 --dataset 7 --reset
//              PKP_E2E_LINE=stable-3_5_0 bin/app-lock.sh shared omp -- env PKP_E2E_LINE=stable-3_5_0 \
//                  PROBE_FEATURE=issues-cc27d-3_5 PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U69 PROBE_AGENT=cc27d \
//                  PROBE_RUN=s1 node bin/probe.js omp shared/playwright/checks/U69/I27D/i27d.js
// (a second run as r2 / s2 after another reset; any dataset number works with its own feature name)
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, usageLog, serverLog, sql, idle} = require('../../../probe');
const {T, sleep, flat, rel, READER_UA, slimLines, nextDay} = require('../../U64/I23E/lib');

const BOOK_NEW = 5;
const BOOK_OLD = 14;
const OLD_DATE = process.env.OLD_DATE || '2025-06-01';
const MANAGER = process.env.MANAGER || 'rvaca';
const fact = (k, v) => console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 3000)}`);

async function step(facts, name, fn) {
    try {
        return await fn();
    } catch (e) {
        facts[`ERR ${name}`] = flat(e && e.message, 600);
        fact(`ERR ${name}`, facts[`ERR ${name}`]);
        return null;
    }
}

/** An ordinary browser's name on every request (HeadlessChrome is a robot the loader drops). */
async function asReader(page) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.setUserAgentOverride', {userAgent: READER_UA});
    await page.context().setExtraHTTPHeaders({'User-Agent': READER_UA});
}

/** The book page's "Downloads" section as the page holds it, plus the page's headings and the canvas's text alternative. */
async function readChart(page, id) {
    return page.evaluate((id) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const canvas = document.querySelector('canvas.usageStatsGraph');
        const section = canvas ? canvas.closest('section') : null;
        const heading = section ? section.querySelector('h2, h3') : null;
        const unavailable = document.querySelector('.usageStatsUnavailable');
        const S = typeof pkpUsageStats === 'undefined' ? null : pkpUsageStats;
        const data = S && S.data && S.data.Submission ? S.data.Submission[id] || null : null;
        let drawn = null;
        if (canvas && typeof Chart !== 'undefined' && Chart.getChart) {
            const c = Chart.getChart(canvas);
            if (c) drawn = {type: c.config.type, labels: c.data.labels, n: c.data.labels.length,
                datasets: c.data.datasets.map((d) => ({label: d.label, data: d.data, total: d.data.reduce((a, b) => a + Number(b || 0), 0)}))};
        }
        const toggle = [...document.querySelectorAll('button.usageStatsToggle')].map(t);
        const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => {
            const cs = getComputedStyle(h);
            const hidden = cs.display === 'none' || cs.visibility === 'hidden';
            return {tag: h.tagName, text: (h.textContent || '').replace(/\s+/g, ' ').trim(), cls: h.className || '', srOnly: /pkp_screen_reader/.test(h.className), hidden};
        });
        const canvasA11y = canvas ? {role: canvas.getAttribute('role'), ariaLabel: canvas.getAttribute('aria-label'),
            ariaLabelledby: canvas.getAttribute('aria-labelledby'), title: canvas.getAttribute('title'), fallback: canvas.innerHTML.trim(),
            describedby: canvas.getAttribute('aria-describedby')} : null;
        return {heading: t(heading), canvas: !!canvas, canvasA11y,
            unavailable: unavailable ? {text: t(unavailable), visible: !!unavailable.offsetParent} : null,
            data, chartType: S && S.config ? S.config.chartType : null, drawn, toggle, headings};
    }, id).catch((e) => ({err: flat(e.message, 200)}));
}

/** A signed-out reader's read of one book page and its chart, in a fresh browser. */
async function chartRead(app, book, name, {reload = false} = {}) {
    const {page, close} = await launch(app);
    try {
        await asReader(page);
        await page.goto(app.url(`/index.php/${app.contextPath}/en/catalog/book/${book}`));
        await idle(page).catch(() => {});
        await sleep(1500);
        record(name, await screen(page));
        await shot(page, name).catch(() => {});
        const out = {first: await readChart(page, book)};
        const toggle = page.locator('button.usageStatsToggle');
        if (await toggle.count()) {
            await loc(page, 'Book page: the chart\'s "All time" / "Last 12 months" button', toggle);
            out.toggle = [];
            for (let i = 0; i < 2; i++) {
                await toggle.click();
                await sleep(600);
                out.toggle.push({button: flat(await toggle.innerText()), chart: await readChart(page, book)});
                record(`${name}-toggle${i + 1}`, await screen(page));
                if (i === 0) await shot(page, `${name}-toggle1`).catch(() => {});
            }
        }
        if (reload) {
            await page.reload();
            await idle(page).catch(() => {});
            await sleep(1500);
            record(`${name}-reload`, await screen(page));
            out.reload = await readChart(page, book);
        }
        return out;
    } finally {
        await close();
    }
}

/** Settings › Website › Appearance › Theme: the stats field, then the bar choice saved, read on the page and after a reload. */
async function setBarChart(page, app) {
    const out = {};
    const panel = () => page.locator('[role="tabpanel"]#theme').first();
    const field = () => panel().locator('.pkpFormField').filter({hasText: /Usage statistics display options/}).first();
    const readField = () => field().evaluate((f) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        return {label: t(f.querySelector('legend, .pkpFormFieldLabel, label')),
            options: [...f.querySelectorAll('input[type=radio]')].map((i) => ({value: i.value, checked: i.checked, label: t(i.closest('label'))}))};
    }).catch((e) => ({err: flat(e.message, 200)}));
    const open = async () => {
        await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/website`));
        await idle(page);
        for (const id of ['appearance', 'theme']) {
            const b = page.locator(`#${id}-button`).first();
            await b.waitFor({timeout: T});
            if ((await b.getAttribute('aria-selected')) !== 'true') { await b.click(); await idle(page); }
        }
        await panel().getByRole('radio').first().waitFor({timeout: T});
        await sleep(400);
    };
    await open();
    record('theme-before', await screen(page));
    await loc(page, 'Appearance › Theme: the "Usage statistics display options" field', field());
    out.before = await readField();
    await panel().getByRole('radio', {name: /^Use bar type/}).check();
    const w = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
    await panel().getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await w;
    out.save = r ? {url: rel(r.url()).slice(0, 160), status: r.status()} : null;
    await idle(page);
    await sleep(800);
    record('theme-saved', await screen(page));
    out.afterSave = await readField();
    await open();
    record('theme-saved-reload', await screen(page));
    out.afterReload = await readField();
    // Left once with a change unsaved: "line" ticked, then the "Setup" tab and back, then another page.
    const dialogs = [];
    const onDialog = (d) => { dialogs.push({type: d.type(), message: d.message()}); d.accept().catch(() => {}); };
    page.on('dialog', onDialog);
    await panel().getByRole('radio', {name: /^Use line type/}).check();
    await page.locator('#setup-button').first().click().catch(() => {});
    await idle(page);
    await sleep(800);
    record('theme-unsaved-setup-tab', await screen(page));
    await page.locator('#theme-button').first().click().catch(() => {});
    await idle(page);
    await sleep(600);
    out.unsavedBackOnTab = await readField();
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/context`)).catch((e) => { out.leaveError = flat(e.message, 200); });
    await idle(page).catch(() => {});
    page.off('dialog', onDialog);
    out.leaveDialogs = dialogs;
    out.stored = sql(app, "select setting_value from plugin_settings where plugin_name = 'defaultthemeplugin' and setting_name = 'displayStats'");
    await open();
    out.afterLeave = await readField();
    return out;
}

/** Signed out: open a book page, then the file link `pick` chooses (its view page). */
async function openFile(page, app, book, pick, name) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/catalog/book/${book}`));
    await idle(page).catch(() => {});
    const link = pick(page);
    const out = {text: flat(await link.innerText().catch(() => null), 80), href: rel(await link.getAttribute('href').catch(() => null))};
    await link.click();
    await page.waitForURL(/\/catalog\/view\//, {timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(3000);
    out.url = rel(page.url());
    record(name, await screen(page));
    return out;
}

/** Administration › "Delete Data Caches" as the site administrator. */
async function deleteDataCaches(app) {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        await page.goto(app.url('/index.php/index/en/admin'));
        await idle(page);
        record('admin', await screen(page));
        const btn = page.getByRole('button', {name: 'Delete Data Caches', exact: true});
        await loc(page, 'Administration: Delete Data Caches', btn);
        const [r] = await Promise.all([page.waitForResponse((x) => x.url().includes('clearDataCache'), {timeout: T}).catch(() => null), btn.click()]);
        await page.waitForLoadState('load');
        await idle(page);
        record('admin-after-clear', await screen(page));
        return {status: r ? r.status() : null, url: rel(page.url())};
    } finally {
        await close();
    }
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i27d.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'omp') {
        fact(app.name, 'OMP only (the article and preprint pages are U13 I27B\'s, ../../U13/I27B/i27b.js)');
        return;
    }
    const facts = {app: app.name, line: app.line || 'main', books: [BOOK_NEW, BOOK_OLD], oldDate: OLD_DATE, manager: MANAGER};
    const contextId = Number(sql(app, "select press_id from presses where path = 'publicknowledge'"));
    const pubOf = (b) => Number(sql(app, `select current_publication_id from submissions where submission_id = ${b}`));
    facts.publicationsBefore = sql(app, `select submission_id, publication_id, status, date_published from publications where submission_id in (${BOOK_NEW}, ${BOOK_OLD}) order by 1, 2`);
    // 0. Seed: book 14's first version backdated.
    sql(app, `update publications set date_published = '${OLD_DATE}' where publication_id = ${pubOf(BOOK_OLD)}`);
    facts.publicationsAfter = sql(app, `select submission_id, publication_id, status, date_published from publications where submission_id in (${BOOK_NEW}, ${BOOK_OLD}) order by 1, 2`);
    facts.chapter = sql(app, `select chapter_id from submission_chapters where publication_id = ${pubOf(BOOK_OLD)} order by seq limit 1`);
    fact('publications', {before: facts.publicationsBefore, after: facts.publicationsAfter, chapter: facts.chapter});
    const slog = serverLog(app);
    const sFrom = slog.mark();
    try {
        // 1. The bar chart on.
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER);
                facts.theme = await step(facts, 'theme', () => setBarChart(page, app));
                fact('theme', facts.theme);
                await signOut(page);
            } finally {
                await close();
            }
        }
        // 2. The control reads (first openings) and a chapter page.
        facts.chart0 = {};
        for (const b of [BOOK_NEW, BOOK_OLD]) {
            facts.chart0[b] = await step(facts, `chart0 ${b}`, () => chartRead(app, b, `chart-0-control-b${b}`));
            fact(`chart0 book ${b}`, facts.chart0[b]);
        }
        facts.chapterPage = await step(facts, 'chapter page', async () => {
            const {page, close} = await launch(app);
            try {
                await page.goto(app.url(`/index.php/${app.contextPath}/en/catalog/book/${BOOK_OLD}/chapter/${facts.chapter}`));
                await idle(page).catch(() => {});
                record('chapter-page', await screen(page));
                return {url: rel(page.url()), chart: await readChart(page, BOOK_OLD)};
            } finally {
                await close();
            }
        });
        fact('chapter page', facts.chapterPage && {url: facts.chapterPage.url, canvas: facts.chapterPage.chart.canvas, heading: facts.chapterPage.chart.heading});

        // 3. The reader's file openings.
        const ulog = usageLog(app, {contextId});
        const uFrom = ulog.mark();
        {
            const {page, close} = await launch(app);
            try {
                await asReader(page);
                facts.reader = {};
                facts.reader.b5 = await step(facts, 'reader b5', () => openFile(page, app, BOOK_NEW, (p) => p.locator('a.cmp_download_link').first(), 'reader-b5-file'));
                facts.reader.b14chapter = await step(facts, 'reader b14 chapter', () => openFile(page, app, BOOK_OLD,
                    (p) => p.locator('.item.chapters a.cmp_download_link').first(), 'reader-b14-chapter-file'));
                facts.reader.b14supp = await step(facts, 'reader b14 supplementary', () => openFile(page, app, BOOK_OLD,
                    (p) => p.locator('.item.files a.cmp_download_link').first(), 'reader-b14-supp-file'));
                fact('reader', facts.reader);
            } finally {
                await close();
            }
        }
        await sleep(1000);
        facts.usageLines = slimLines(ulog.since(uFrom)).filter((e) => [BOOK_NEW, BOOK_OLD].includes(Number(e.submissionId)));
        fact('usage lines', facts.usageLines);

        // 4. The next day's loader.
        facts.nextDay = await step(facts, 'next day', () => nextDay(app));
        fact('next day', facts.nextDay && {files: facts.nextDay.files, lines: facts.nextDay.lines, loaderError: facts.nextDay.loaderError, jobs: facts.nextDay.jobs});
        facts.metrics = sql(app, `select submission_id, assoc_type, file_type, submission_file_id, date, metric from metrics_submission
            where submission_id in (${BOOK_NEW}, ${BOOK_OLD}) order by submission_id, assoc_type, file_type`);
        fact('metrics_submission (book | assoc_type | file_type | file | date | metric)', facts.metrics);

        // 5. Read A.
        facts.chartA = {};
        for (const b of [BOOK_NEW, BOOK_OLD]) {
            facts.chartA[b] = await step(facts, `chartA ${b}`, () => chartRead(app, b, `chart-a-after-loader-b${b}`, {reload: true}));
            fact(`chartA book ${b}`, facts.chartA[b]);
        }

        // 6. "Delete Data Caches", then read B.
        facts.clear = await step(facts, 'clear', () => deleteDataCaches(app));
        fact('delete data caches', facts.clear);
        facts.chartB = {};
        for (const b of [BOOK_NEW, BOOK_OLD]) {
            facts.chartB[b] = await step(facts, `chartB ${b}`, () => chartRead(app, b, `chart-b-after-clear-b${b}`, {reload: true}));
            fact(`chartB book ${b}`, facts.chartB[b]);
        }
    } finally {
        facts.serverErrors = slog.since(sFrom).slice(0, 20);
        fact('server errors', facts.serverErrors);
        record('i27d', facts);
    }
});
