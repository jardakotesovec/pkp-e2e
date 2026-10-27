// Issue report docs/issues/U64-A17-word-downloads-missing-from-article-statistics.md (spec U64, A17):
// a reader's download of a Word file (.doc, .docx) is counted in no column of Statistics › "Articles"
// ("Monographs", "Preprints"), not "File Views", "Other" or "Total", while the chart's "Files" and
// "Download Files" count it. Takes the report's Steps on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"), as `rvaca` (the manager of each context):
//   OJS  submission 1 "Signalling Theory Dividends" (unpublished version 1.1): Publication › "Galleys" ›
//        "Add galley" "Word" (Article Text, article.docx), "Publish"; signed out, the article's page:
//        "Word" (saved), then "PDF Version 2" (the viewer).
//   OMP  submission 5 "Bomb Canada and Other Unkind Remarks in the American Media" (published):
//        "Publication Formats" › "Add publication format" "Word", its "Change File" (Book Manuscript,
//        article.docx), "Set Terms" "Open Access", "Awaiting Approval" › "OK", "Not Available" › "OK";
//        signed out, the book's page: "Word" (saved). (Book 5's "PDF" format holds a chapter's file alone, listed under the chapter.)
//   OPS  submission 1 "The influence of lactation …" (Production, not posted): Preprint › "Galleys" ›
//        "Add galley" "Word" (Preprint Text, article.docx), "Preprint entry" "Date Published" set to
//        yesterday (the page's chart starts on it), "Post"; signed out, the preprint's page:
//        "Word" (saved), then "PDF" (the viewer).
//   Then the night (nextDay() in lib.js: the day's usage log moved one day back into the loader's
//   stage folder, the app's own "Usage statistics file loader task" and job queue run), and `rvaca`
//   reads Statistics › the items' page: the row, the chart's "Files", "Download Report" › the items'
//   and the files' spreadsheets, and GET /api/v1/stats/publications/{id} (no screen calls it).
//   Last (steps mode), `rvaca` sets Settings › Website › Appearance › Theme "Usage statistics display
//   options" to "Use bar type …" and a signed-out reader opens the item's page: its "Downloads" chart
//   counts the Word download (fact 7-chart: data.total, the drawn bars).
// MODE=nb (OJS alone; the fix's neighbour, walked with the fix in and out): galleys "Word" (.docx,
// Article Text), "Text" (notes-hkq23j.txt, Article Text: an "Other" file) and "Data" (data-hkq23j.csv,
// "Data Set": a supplementary file) added to version 1.1 and published; the reader presses "Word",
// "Text" and "PDF Version 2". "Data" is not pressed: the article's page lists it under its supplementary
// links (a.obj_galley_link_supplementary), which fileLinks() in lib.js does not read. With the fix
// "Other" counts the Word and the text file (2); without it, the text file alone (1).
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run (main):   PROBE_FEATURE=<feature> PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/word-downloads-missing-from-article-statistics/walk.js
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature <feature>-3_5 --dataset <n> --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=<feature>-3_5 PROBE_AGENT=<agent> node bin/probe.js all shared/playwright/checks/issues/word-downloads-missing-from-article-statistics/walk.js
// Facts: <outDir>/{walk,nb}-facts[-<run>]-<app>.json
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, usageLog, serverLog, sql} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.MODE || 'steps';
const MANAGER = 'rvaca';
const WORD = path.join(__dirname, 'article.docx');
const ITEMS = {
    ojs: {id: 1, title: 'Signalling Theory Dividends', pdf: 'PDF Version 2'},
    // Book 5's own "PDF" format holds one chapter's file, which the book's page lists under that chapter,
    // not among the book's formats: no "PDF" to press beside "Word".
    omp: {id: 5, title: 'Bomb Canada and Other Unkind Remarks in the American Media', pdf: null},
    ops: {id: 1, title: 'The influence of lactation on the quantity and quality of cashmere production', pdf: 'PDF'},
};

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (MODE === 'nb' && app.name !== 'ojs') return;
    const it = ITEMS[app.name];
    const factsName = MODE === 'nb' ? 'nb-facts' : 'walk-facts';
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, item: it.id};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name} ${k}] ${JSON.stringify(v).slice(0, 2500)}`);
    };
    const step = async (k, fn) => {
        try {
            fact(k, await fn());
        } catch (e) {
            fact(`ERR ${k}`, L.flat(e && e.message, 600));
        }
    };
    const contextId = Number(sql(app, `select ${app.name === 'ojs' ? 'journal_id from journals' : app.name === 'omp' ? 'press_id from presses' : 'server_id from servers'} where path = 'publicknowledge'`));
    const slog = serverLog(app);
    const sFrom = slog.mark();
    try {
        // 1. The manager adds the Word file and publishes.
        const galleys = MODE === 'nb'
            ? [
                {label: 'Word', component: 'Article Text', file: WORD, name: 'article.docx'},
                {label: 'Text', component: 'Article Text', file: path.join(__dirname, 'notes-hkq23j.txt'), name: 'notes-hkq23j.txt'},
                {label: 'Data', component: 'Data Set', file: path.join(__dirname, 'data-hkq23j.csv'), name: 'data-hkq23j.csv'},
            ]
            : [{label: 'Word', component: app.name === 'ops' ? 'Preprint Text' : 'Article Text', file: WORD, name: 'article.docx'}];
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER, {contextPath: app.contextPath});
                if (app.name === 'ojs') {
                    for (const g of galleys) await step(`1-add galley ${g.label}`, () => L.addGalleyToLatestVersion(page, app, it.id, g));
                    await step('2-publish', async () => {
                        const p = await L.publishLatestVersion(page, app, it.id);
                        return {button: p.button, publish: p.publish};
                    });
                } else if (app.name === 'ops') {
                    await step('1-add galley Word', async () => {
                        const gm = await L.openGalleys(page, app, it.id);
                        await gm.addGalley(galleys[0]);
                        return {labels: await gm.labels()};
                    });
                    // The page's chart starts on the posting date; nextDay() dates the downloads to yesterday.
                    await step('2a-date published', () => L.setDatePublished(page, app, it.id, L.yesterday()));
                    await step('2-post', () => L.post(page));
                } else {
                    await step('1-add format Word', () => L.addFormatFile(page, app, {submissionId: it.id, formatName: 'Word', file: WORD, fileName: 'article.docx'}));
                }
                await signOut(page);
            } finally {
                await close();
            }
        }
        fact('stored files', sql(app, `select sf.submission_file_id, sf.assoc_type, sf.assoc_id, sf.genre_id, f.mimetype, f.path from submission_files sf join files f on f.file_id = sf.file_id
            where sf.submission_id = ${it.id} and sf.file_stage = 10 order by 1`));

        // 2. Signed out, an ordinary browser: the Word file (and the other files), then the PDF.
        const ulog = usageLog(app, {contextId});
        const uFrom = ulog.mark();
        {
            const {page, close} = await launch(app);
            try {
                // Every request carries an ordinary browser's name (CDP: setExtraHTTPHeaders alone leaves
                // page navigations and downloads on HeadlessChrome, which the loader drops as a robot).
                const cdp = await page.context().newCDPSession(page);
                await cdp.send('Network.setUserAgentOverride', {userAgent: L.READER_UA});
                await page.context().setExtraHTTPHeaders({'User-Agent': L.READER_UA});
                await step('3-reader', () => L.readerVisits(page, app, it.id, [...galleys.map((g) => g.label), it.pdf].filter(Boolean)));
            } finally {
                await close();
            }
        }
        await L.sleep(1000);
        fact('usage lines', L.slimLines(ulog.since(uFrom)).filter((e) => Number(e.submissionId) === it.id));

        // 3. The night.
        await step('4-next day', async () => {
            const n = await L.nextDay(app);
            return {files: n.files, lines: n.lines, loader: n.loader, loaderError: n.loaderError, jobs: n.jobs, left: n.left};
        });
        fact('metrics_submission (assoc_type | file_type | galley/format | file | date | metric)', sql(app, `select assoc_type, file_type, representation_id, submission_file_id, to_char(date, 'YYYY-MM-DD'), metric
            from metrics_submission where submission_id = ${it.id} order by assoc_type, file_type`));

        // 4. The manager reads the figures.
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER, {contextPath: app.contextPath});
                await step('5-stats', () => L.readStats(page, app, it.id, it.title));
                // 6. The item page's "Downloads" chart turned on (off in the dataset, so this is its first
                // opening and it reads the processed figures, not a day-old kept copy).
                if (MODE === 'steps') await step('6-theme bar chart', () => L.setBarChart(page, app));
            } finally {
                await close();
            }
        }
        if (MODE === 'steps') {
            const {page, close} = await launch(app);
            try {
                const cdp = await page.context().newCDPSession(page);
                await cdp.send('Network.setUserAgentOverride', {userAgent: L.READER_UA});
                await page.context().setExtraHTTPHeaders({'User-Agent': L.READER_UA});
                await step('7-chart', () => L.chartVisit(page, app, it.id));
            } finally {
                await close();
            }
        }
    } finally {
        fact('server errors', slog.since(sFrom).slice(0, 20));
        record(factsName, facts);
    }
});
