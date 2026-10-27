// U13 claim check I27B (housekeeping 2026-10-27): the incidental row "the article page's 'Downloads'
// chart and Word galley downloads" (beside U64 A17). Rule 17 says what the chart counts as a download
// is Statistics' (U64). This drive puts the U64 I23E walk behind the default theme's chart on PKP's
// default test dataset, OJS (main and stable-3_5_0) and OPS (main; steps 0 and 2–6 the same):
//   0. rvaca (journal manager): Settings › Website › Appearance › Theme, "Usage statistics display
//      options" set to "Use bar type of the chart for usage statistics display.", Save (read on the
//      page and after a reload); then a signed-out read of the article page's chart (the control:
//      nothing processed yet);
//   1. rvaca adds a "Word" galley (article.docx) to submission 1's unpublished version 1.1 and
//      publishes it (helpers of ../../U64/I23E/lib.js);
//   2. signed out, an ordinary browser: the article page (chart read), "Word" downloaded, then
//      "PDF Version 2" opened in its viewer;
//   3. the next day's "Usage statistics file loader task" (nextDay() in ../../U64/I23E/lib.js);
//   4. signed out: the article page's chart (read A: as the reader meets it the day after);
//   5. admin: Administration › "Delete Data Caches"; signed out: the chart again (read B), and once
//      more after a reload;
//   6. rvaca: Statistics › "Articles" (the row, its getMany item) and the chart's "Files" line.
// Also read on the way: step 0 leaves the Theme tab once with "line" ticked and unsaved (the "Setup" tab
// and back, then another page); each chart read presses the "All time" / "Last 12 months" button when
// the chart has one (main, more than 12 months: OPS with OPS_DATE=2025-06-01 reaches it).
// OPS step 1: rvaca backdates submission 1's never-posted version on "Preprint entry" ("Date Published"
// OPS_DATE, default 2026-10-01: the chart counts from the first version's date, and the loader dates the
// visits yesterday), adds the "Word" galley (component "Preprint Text") and posts it.
// Other files: ../../U64/I23E/lib.js and ../../U64/I23E/article.docx (required, not copied). No PART;
// outputs are the agent folder's (record/outFile names carry PROBE_RUN).
// The drive changes the dataset: reset the fleet before each run.
// Run (main):  npm run fleet-prep -- --feature issues-cc27b --dataset 3 --reset
//              bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc27b PKP_E2E_DATASET=3 PROBE_NOTES_FEATURE=U13 \
//                  PROBE_AGENT=cc27b PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U13/I27B/i27b.js
//              (OPS: the same with `shared ops` and `node bin/probe.js ops`; one app per lock call)
// Run (3.5):   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc27b-3_5 --dataset 3 --reset
//              PKP_E2E_LINE=stable-3_5_0 bin/app-lock.sh shared ojs -- env PKP_E2E_LINE=stable-3_5_0 \
//                  PROBE_FEATURE=issues-cc27b-3_5 PKP_E2E_DATASET=3 PROBE_NOTES_FEATURE=U13 PROBE_AGENT=cc27b \
//                  PROBE_RUN=s1 node bin/probe.js ojs shared/playwright/checks/U13/I27B/i27b.js
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, usageLog, serverLog, sql, idle} = require('../../../probe');
const {T, sleep, flat, rel, READER_UA, slimLines, addGalleyToLatestVersion, publishLatestVersion, nextDay} = require('../../U64/I23E/lib');

const SUBMISSION = 1;
// OJS: submission 1 (published, version 1.1 unpublished); OPS: submission 1 (Production, never posted, one PDF galley).
const ITEM = {ojs: {page: 'article/view/mwandenga', galleyRe: /\/article\/view\/[^/]+\/[^/]+/, title: 'Signalling Theory Dividends'},
    ops: {page: 'preprint/view/1', galleyRe: /\/preprint\/view\/[^/]+\/[^/]+/, title: 'The influence of lactation'}};
const OPS_DATE = process.env.OPS_DATE || '2026-10-01';
const MANAGER = process.env.MANAGER || 'rvaca';
const FILE = path.join(__dirname, '../../U64/I23E/article.docx');
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

/** The article page's "Downloads" section as the page holds it: heading, sentence, canvas, the data and the drawn chart. */
async function readChart(page) {
    return page.evaluate((id) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const canvas = document.querySelector('canvas.usageStatsGraph, canvas[data-object-type]');
        const section = canvas ? canvas.closest('section.downloads_chart, section') : null;
        const heading = section ? section.querySelector('h2, h3') : null;
        const unavailable = document.querySelector('.usageStatsUnavailable');
        const S = typeof pkpUsageStats === 'undefined' ? null : pkpUsageStats;
        const data = S && S.data && S.data.Submission ? S.data.Submission[id] || null : null;
        let drawn = null;
        if (canvas && typeof Chart !== 'undefined' && Chart.getChart) {
            const c = Chart.getChart(canvas);
            if (c) drawn = {type: c.config.type, labels: c.data.labels, datasets: c.data.datasets.map((d) => ({label: d.label, data: d.data}))};
        }
        const toggle = [...document.querySelectorAll('button')].filter((b) => /All time|Last year/i.test(b.innerText)).map(t);
        return {heading: t(heading), canvas: !!canvas, canvasAttrs: canvas ? {type: canvas.dataset.objectType, id: canvas.dataset.objectId} : null,
            unavailable: unavailable ? {text: t(unavailable), visible: !!unavailable.offsetParent} : null,
            data, chartType: S && S.config ? S.config.chartType : null, drawn, toggle};
    }, SUBMISSION).catch((e) => ({err: flat(e.message, 200)}));
}

/** A signed-out reader's read of the article page and its chart, in a fresh browser. */
async function chartRead(app, name, {reload = false} = {}) {
    const {page, close} = await launch(app);
    try {
        await asReader(page);
        await page.goto(app.url(`/index.php/${app.contextPath}/en/${ITEM[app.name].page}`));
        await idle(page).catch(() => {});
        await sleep(1500);
        record(name, await screen(page));
        await shot(page, name).catch(() => {});
        const out = {first: await readChart(page)};
        // main: past 12 months of data the chart adds a button ("All time" / "Last 12 months"); press it both ways.
        const toggle = page.locator('button.usageStatsToggle');
        if (await toggle.count()) {
            await loc(page, 'Article page: the chart\'s "All time" / "Last 12 months" button', toggle);
            out.toggle = [];
            for (let i = 0; i < 2; i++) {
                await toggle.click();
                await sleep(600);
                out.toggle.push({button: flat(await toggle.innerText()), chart: await readChart(page)});
                record(`${name}-toggle${i + 1}`, await screen(page));
            }
        }
        if (reload) {
            await page.reload();
            await idle(page).catch(() => {});
            await sleep(1500);
            record(`${name}-reload`, await screen(page));
            out.reload = await readChart(page);
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

/** Signed out: the article page, the "Word" galley's download, then "PDF Version 2" in its viewer. */
async function readerVisits(page, app) {
    const out = {};
    await page.goto(app.url(`/index.php/${app.contextPath}/en/${ITEM[app.name].page}`));
    await idle(page).catch(() => {});
    await sleep(1000);
    record('reader-article-page', await screen(page));
    out.chart = await readChart(page);
    out.galleyLinks = await page.locator('a.obj_galley_link').evaluateAll((as) => as.map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href')})));
    const word = page.locator('a.obj_galley_link', {hasText: /^\s*Word\s*$/}).first();
    const dl = page.waitForEvent('download', {timeout: T}).catch(() => null);
    await word.click();
    const d = await dl;
    out.word = d ? {file: d.suggestedFilename(), url: rel(d.url())} : null;
    await sleep(1500);
    await page.goto(app.url(`/index.php/${app.contextPath}/en/${ITEM[app.name].page}`));
    await idle(page).catch(() => {});
    const pdf = page.locator('a.obj_galley_link', {hasText: /^\s*PDF\b/}).first();
    out.pdfLabel = flat(await pdf.innerText().catch(() => null), 60);
    await pdf.click();
    await page.waitForURL(ITEM[app.name].galleyRe, {timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(4000);
    out.pdfUrl = rel(page.url());
    record('reader-pdf-viewer', await screen(page));
    return out;
}

// ---- OPS step 1 -------------------------------------------------------------------------------
const opsFrame = (page, app) => {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    return new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Preprint'}});
};
const opsPubId = (app) => Number(sql(app, `select publication_id from publications where submission_id = ${SUBMISSION} order by publication_id limit 1`));

/** "Preprint entry": "Date Published" typed, "Save"; read on the page and after a reload. */
async function opsBackdate(page, app) {
    const out = {};
    const frame = opsFrame(page, app);
    await frame.gotoEditorial(SUBMISSION, {menuKey: `publication_${opsPubId(app)}_titleAbstract`});
    await idle(page);
    const open = async () => {
        const l = page.getByRole('link', {name: 'Preprint entry', exact: true}).last();
        await l.waitFor({state: 'visible', timeout: T});
        await l.click();
        await idle(page);
        await page.locator('input[name="datePublished"]').first().waitFor({timeout: T});
        await sleep(800);
    };
    await open();
    record('ops-entry-before', await screen(page));
    const date = page.locator('input[name="datePublished"]').first();
    out.before = await date.inputValue().catch(() => null);
    await date.fill(OPS_DATE);
    await date.press('Tab').catch(() => {});
    const w = page.waitForResponse((x) => /\/publications\/\d+/.test(x.url()) && ['POST', 'PUT'].includes(x.request().method()), {timeout: T}).catch(() => null);
    await page.getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await w;
    out.save = r ? r.status() : null;
    await idle(page);
    await sleep(800);
    record('ops-entry-saved', await screen(page));
    out.after = await date.inputValue().catch(() => null);
    out.stored = sql(app, `select date_published from publications where publication_id = ${opsPubId(app)}`);
    return out;
}

/** "Galleys": "Add galley", label "Word", the upload window (component "Preprint Text", article.docx). */
async function opsAddGalley(page, app) {
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const galleys = new GalleyManager(page, opsFrame(page, app));
    await galleys.open(SUBMISSION, opsPubId(app));
    const before = await galleys.labels();
    await galleys.addGalley({label: 'Word', component: 'Preprint Text', file: FILE, name: 'article.docx'});
    await idle(page);
    const after = await galleys.labels();
    record('ops-galleys', await screen(page));
    return {before, after};
}

/** The header's "Post" (after "Post the preprint" when the stage offers it), then the confirmation's "Post". */
async function opsPost(page, app) {
    const out = {};
    await opsFrame(page, app).gotoEditorial(SUBMISSION, {menuKey: `publication_${opsPubId(app)}_titleAbstract`});
    await idle(page);
    await sleep(800);
    const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
    const postControl = page.getByRole('button', {name: 'Post', exact: true});
    await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
    if (await stageAction.isVisible()) await stageAction.click();
    await postControl.first().waitFor({state: 'visible', timeout: T});
    out.button = flat(await postControl.first().innerText().catch(() => null));
    await postControl.first().click();
    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
    await confirm.waitFor({state: 'visible', timeout: T});
    await idle(page);
    for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
        const x = confirm.locator(sel);
        if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(val).catch(() => {});
    }
    out.window = flat(await confirm.innerText().catch(() => null), 600);
    record('ops-post-window', await screen(page));
    const posted = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
    const r = await posted;
    out.publish = r ? r.status() : null;
    await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    record('ops-posted', await screen(page));
    out.stored = sql(app, `select status, date_published from publications where publication_id = ${opsPubId(app)}`);
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

/** Statistics › "Articles" as the manager: the row, the page's own getMany item, and the chart's "Files" line. */
async function readStats(page, app) {
    const R = {};
    const got = page.waitForResponse((r) => /\/api\/v1\/stats\/publications\?/.test(r.url()), {timeout: T}).catch(() => null);
    await page.goto(app.url(`/index.php/${app.contextPath}/en/stats/publications/publications`));
    const r = await got;
    await idle(page).catch(() => {});
    await sleep(1000);
    R.request = r ? {url: decodeURIComponent(rel(r.url())).slice(0, 300), status: r.status()} : null;
    const body = r ? await r.json().catch(() => null) : null;
    const TITLE = ITEM[app.name].title;
    const item = body && body.items ? body.items.find((i) => i.publication && JSON.stringify(i.publication).includes(TITLE)) : null;
    R.getManyItem = item ? {...item, publication: {id: item.publication.id}} : null;
    R.range = flat(await page.locator('.pkpDateRange__current').first().innerText().catch(() => null), 80);
    const table = await page.locator('.pkpStats__panel table').first().evaluate((tbl) => ({
        head: [...tbl.querySelectorAll('thead th')].map((th) => th.innerText.replace(/\s+/g, ' ').trim()),
        rows: [...tbl.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
    })).catch((e) => ({err: flat(e.message, 120)}));
    R.head = table.head;
    R.row = (table.rows || []).find((cells) => cells.some((c) => c.includes(TITLE))) || null;
    record('stats-articles', await screen(page));
    const tl = page.waitForResponse((x) => /\/api\/v1\/stats\/publications\/timeline/.test(x.url()), {timeout: 15_000}).catch(() => null);
    const filesBtn = page.getByRole('button', {name: 'Files', exact: true}).first();
    if (await filesBtn.count()) {
        await filesBtn.click();
        const t = await tl;
        if (t) {
            const j = await t.json().catch(() => null);
            R.filesTimeline = {url: decodeURIComponent(rel(t.url())).slice(0, 300), status: t.status(), nonZero: Array.isArray(j) ? j.filter((p) => p.value) : j};
        }
        await idle(page).catch(() => {});
        record('stats-articles-files-chart', await screen(page));
    }
    return R;
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i27b.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name === 'omp') {
        fact(app.name, 'OJS and OPS only (a press has no article page; its book page chart is U69\'s)');
        return;
    }
    const facts = {app: app.name, line: app.line || 'main', submission: SUBMISSION, manager: MANAGER};
    const {table, id} = app.contextTables;
    const contextId = Number(sql(app, `select ${id} from ${table} where path = 'publicknowledge'`));
    facts.publications = sql(app, `select publication_id, status, date_published from publications where submission_id = ${SUBMISSION} order by publication_id`);
    const slog = serverLog(app);
    const sFrom = slog.mark();
    try {
        // 0. The bar chart on, then the control read.
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
        facts.chart0 = await step(facts, 'chart0', () => chartRead(app, 'chart-0-control'));
        fact('chart0 (bar on, nothing processed)', facts.chart0);

        // 1. The "Word" galley on version 1.1, published.
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER);
                if (app.name === 'ops') {
                    facts.date = await step(facts, 'ops date', () => opsBackdate(page, app));
                    facts.galleys = await step(facts, 'add galley', () => opsAddGalley(page, app));
                } else {
                    facts.galleys = await step(facts, 'add galley', () => addGalleyToLatestVersion(page, app, SUBMISSION, {label: 'Word', component: 'Article Text', file: FILE, name: 'article.docx'}));
                }
                const pub = await step(facts, 'publish', () => (app.name === 'ops' ? opsPost(page, app) : publishLatestVersion(page, app, SUBMISSION)));
                facts.publish = pub && {button: pub.button, publish: pub.publish};
                fact('galleys / publish', {galleys: facts.galleys, publish: facts.publish});
                await signOut(page);
            } finally {
                await close();
            }
        }

        // 2. The reader: "Word", then "PDF Version 2".
        const ulog = usageLog(app, {contextId});
        const uFrom = ulog.mark();
        {
            const {page, close} = await launch(app);
            try {
                await asReader(page);
                facts.reader = await step(facts, 'reader', () => readerVisits(page, app));
                fact('reader', facts.reader);
            } finally {
                await close();
            }
        }
        await sleep(1000);
        facts.usageLines = slimLines(ulog.since(uFrom)).filter((e) => Number(e.submissionId) === SUBMISSION);
        fact('usage lines', facts.usageLines);

        // 3. The next day's loader.
        facts.nextDay = await step(facts, 'next day', () => nextDay(app));
        fact('next day', facts.nextDay && {files: facts.nextDay.files, lines: facts.nextDay.lines, loaderError: facts.nextDay.loaderError, jobs: facts.nextDay.jobs});
        facts.metrics = sql(app, `select assoc_type, file_type, representation_id, submission_file_id, date, metric from metrics_submission
            where submission_id = ${SUBMISSION} order by assoc_type, file_type`);
        fact('metrics_submission (assoc_type | file_type | galley | file | date | metric)', facts.metrics);

        // 4. Read A: the chart the day after, as the reader meets it.
        facts.chartA = await step(facts, 'chartA', () => chartRead(app, 'chart-a-after-loader', {reload: true}));
        fact('chartA (after the loader)', facts.chartA);

        // 5. "Delete Data Caches", then read B.
        facts.clear = await step(facts, 'clear', () => deleteDataCaches(app));
        fact('delete data caches', facts.clear);
        facts.chartB = await step(facts, 'chartB', () => chartRead(app, 'chart-b-after-clear', {reload: true}));
        fact('chartB (after Delete Data Caches)', facts.chartB);

        // 6. Statistics › "Articles".
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER);
                facts.stats = await step(facts, 'stats', () => readStats(page, app));
                fact('stats', facts.stats);
            } finally {
                await close();
            }
        }
    } finally {
        facts.serverErrors = slog.since(sFrom).slice(0, 20);
        fact('server errors', facts.serverErrors);
        record('i27b', facts);
    }
});
