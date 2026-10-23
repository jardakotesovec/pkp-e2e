// U64 claim check I23E (housekeeping 2026-10-23): the incidental row "Word galley downloads in an
// article's 'File Views'". Rule 1 sorts a galley's file view "into PDF, HTML or Other"; the code
// stores a .doc/.docx download as a fourth type (STATISTICS_FILE_TYPE_DOC) that the "Articles"
// page's per-type filters have no case for. This drive takes it through the screens on PKP's
// default test dataset (OJS; OMP and OPS share the lib/pkp code and are read there):
//   1. rvaca (journal manager) adds a "Word" galley (article.docx, beside this script) to
//      submission 1's unpublished version 1.1 and publishes that version;
//   2. signed out, an ordinary browser opens the article's page, downloads "Word", then opens
//      "PDF Version 2" in its viewer (the control: a PDF file view of the same article);
//   3. the next day's "Usage statistics file loader task" (nextDay() in lib.js moves today's
//      usage log one day back into the loader's stage folder and runs the app's own task and
//      job queue);
//   4. rvaca: Statistics › "Articles" (the row, the page's own getMany answer), the chart's
//      "Files" switch (its timeline answer), "Download Report" › "Download Articles" and
//      "Download Files", and GET /api/v1/stats/publications/1 (no screen calls it).
// Other files: lib.js (helpers), article.docx (the Word galley). No PART; outputs are the
// agent folder's (record/outFile names carry PROBE_RUN).
// The drive changes the dataset: reset the fleet before each run.
// Run (main):  npm run fleet-prep -- --feature issues-cc23e --dataset 7 --reset
//              PROBE_FEATURE=issues-cc23e PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U64 PROBE_AGENT=cc23e PROBE_RUN=r1 \
//                  node bin/probe.js ojs shared/playwright/checks/U64/I23E/i23e.js
// Run (3.5):   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-cc23e-3_5 --dataset 7 --reset
//              PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=issues-cc23e-3_5 PKP_E2E_DATASET=7 PROBE_NOTES_FEATURE=U64 \
//                  PROBE_AGENT=cc23e PROBE_RUN=s1 node bin/probe.js ojs shared/playwright/checks/U64/I23E/i23e.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, usageLog, serverLog, sql, outFile, idle} = require('../../../probe');
const {T, sleep, flat, rel, READER_UA, slimLines, addGalleyToLatestVersion, publishLatestVersion, nextDay} = require('./lib');

const SUBMISSION = 1;
const URL_PATH = 'mwandenga';
const TITLE = 'Signalling Theory Dividends';
const MANAGER = process.env.MANAGER || 'rvaca';
const FILE = path.join(__dirname, 'article.docx');
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

/** Signed out: the article's page, the "Word" galley's download, then "PDF Version 2" in its viewer. */
async function readerVisits(page, app) {
    const out = {};
    const files = [];
    page.context().on('response', (r) => {
        if (!/\/article\/(view|download)\//.test(r.url())) return;
        files.push({url: rel(r.url()).slice(0, 160), status: r.status(), type: flat(r.headers()['content-type'], 80),
            disposition: flat(r.headers()['content-disposition'], 120)});
    });
    await page.goto(app.url(`/index.php/${app.contextPath}/article/view/${URL_PATH}`));
    await idle(page).catch(() => {});
    record('reader-article-page', await screen(page));
    await shot(page, 'reader-article-page').catch(() => {});
    out.galleyLinks = await page.locator('a.obj_galley_link').evaluateAll((as) => as.map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href'), cls: a.className})));
    out.galleyLinks = out.galleyLinks.map((l) => ({...l, href: rel(l.href)}));
    // Word: a download (no viewer handles a .docx).
    const word = page.locator('a.obj_galley_link', {hasText: /^\s*Word\s*$/}).first();
    const dl = page.waitForEvent('download', {timeout: T}).catch(() => null);
    await word.click();
    const d = await dl;
    out.word = d ? {file: d.suggestedFilename(), url: rel(d.url()), bytes: await d.path().then((p) => (p ? fs.statSync(p).size : null)).catch(() => null)} : null;
    await sleep(1500);
    out.afterWordUrl = rel(page.url());
    // Control: "PDF Version 2" in its viewer, which loads the file in a frame.
    await page.goto(app.url(`/index.php/${app.contextPath}/article/view/${URL_PATH}`));
    await idle(page).catch(() => {});
    const pdf = page.locator('a.obj_galley_link', {hasText: /^\s*PDF\b/}).first();
    out.pdfLabel = flat(await pdf.innerText().catch(() => null), 60);
    await pdf.click();
    await page.waitForURL(/\/article\/view\/[^/]+\/[^/]+/, {timeout: T}).catch(() => {});
    await idle(page).catch(() => {});
    await sleep(4000);
    out.pdfUrl = rel(page.url());
    record('reader-pdf-viewer', await screen(page));
    out.fileResponses = files;
    return out;
}

/** Statistics › "Articles" as the manager sees it, the chart's "Files", the two downloads, the single-article API. */
async function readStats(page, app, submissionId) {
    const R = {};
    const got = page.waitForResponse((r) => /\/api\/v1\/stats\/publications\?/.test(r.url()), {timeout: T}).catch(() => null);
    await page.goto(app.url(`/index.php/${app.contextPath}/stats/publications/publications`));
    const r = await got;
    await idle(page).catch(() => {});
    await sleep(1000);
    R.request = r ? {url: decodeURIComponent(rel(r.url())).slice(0, 300), status: r.status()} : null;
    const body = r ? await r.json().catch(() => null) : null;
    R.getManyItem = body && body.items ? (body.items.find((i) => i.publication && i.publication.id === submissionId) || body.items.find((i) => JSON.stringify(i).includes(TITLE)) || null) : null;
    if (R.getManyItem && R.getManyItem.publication) R.getManyItem = {...R.getManyItem, publication: {id: R.getManyItem.publication.id}};
    R.getManyItemsMax = body ? body.itemsMax : null;
    R.range = flat(await page.locator('.pkpDateRange__current').first().innerText().catch(() => null), 80);
    const table = await page.locator('.pkpStats__panel table').first().evaluate((tbl) => ({
        head: [...tbl.querySelectorAll('thead th')].map((th) => th.innerText.replace(/\s+/g, ' ').trim()),
        rows: [...tbl.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
    })).catch((e) => ({err: flat(e.message, 120)}));
    R.head = table.head;
    R.rows = table.rows;
    R.row = (table.rows || []).find((cells) => cells.some((c) => c.includes(TITLE))) || null;
    record('stats-articles', await screen(page));
    await shot(page, 'stats-articles').catch(() => {});

    // The chart's "Files" switch: the timeline the page asks for.
    const tl = page.waitForResponse((x) => /\/api\/v1\/stats\/publications\/timeline/.test(x.url()), {timeout: 15_000}).catch(() => null);
    const filesBtn = page.getByRole('button', {name: 'Files', exact: true}).first();
    R.filesButton = await filesBtn.count();
    if (R.filesButton) {
        await filesBtn.click();
        const t = await tl;
        if (t) {
            const j = await t.json().catch(() => null);
            R.filesTimeline = {url: decodeURIComponent(rel(t.url())).slice(0, 300), status: t.status(),
                nonZero: Array.isArray(j) ? j.filter((p) => p.value) : j};
        }
        await idle(page).catch(() => {});
        record('stats-articles-files-chart', await screen(page));
    }

    // "Download Report": "Download Articles", then "Download Files".
    R.downloads = {};
    for (const name of ['Download Articles', 'Download Files']) {
        const dlg = page.getByRole('dialog').filter({hasText: 'Download a CSV'});
        if (!(await dlg.isVisible().catch(() => false))) {
            await page.getByRole('button', {name: 'Download Report', exact: true}).click();
            await dlg.waitFor({state: 'visible', timeout: T});
            record('stats-download-window', await screen(page));
        }
        const dlP = page.waitForEvent('download', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name, exact: true}).click();
        const d = await dlP;
        if (d) {
            const p = await d.path().catch(() => null);
            const text = p ? fs.readFileSync(p, 'utf8') : '';
            if (p) fs.copyFileSync(p, outFile(`${name === 'Download Files' ? 'download-files' : 'download-articles'}.csv`));
            const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
            const headAt = lines.findIndex((l) => /^"?(ID|Article ID|Preprint ID|Monograph ID)"?,/.test(l));
            R.downloads[name] = {file: d.suggestedFilename(), head: headAt >= 0 ? lines[headAt] : null,
                lines: lines.filter((l) => l.includes(TITLE) || /\.docx|\.pdf/i.test(l)).slice(0, 12)};
        } else {
            R.downloads[name] = null;
        }
        await sleep(800);
    }

    // GET /api/v1/stats/publications/{id}: no screen calls it (the Frame's direct check), as the manager.
    // Asked twice: with no dates (the endpoint's defaults) and with the page's own range.
    const range = /dateStart=([\d-]+)&dateEnd=([\d-]+)/.exec((R.request && R.request.url) || '');
    const single = (query) => page.evaluate(async ({id, query}) => {
        const base = window.pkp && pkp.context && pkp.context.apiBaseUrl;
        if (!base) return {err: 'no apiBaseUrl'};
        const res = await fetch(`${base}stats/publications/${id}${query}`, {headers: {'X-Csrf-Token': pkp.currentUser.csrfToken}});
        let j = null;
        try { j = await res.json(); } catch (e) { j = null; }
        if (j && j.publication) j.publication = {id: j.publication.id};
        return {query, status: res.status, body: j};
    }, {id: submissionId, query}).catch((e) => ({err: flat(e.message, 200)}));
    R.single = await single('');
    R.singleRange = range ? await single(`?dateStart=${range[1]}&dateEnd=${range[2]}`) : null;
    return R;
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('i23e.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'ojs') {
        fact(app.name, 'OJS only (OMP and OPS read in the code: the same lib/pkp LogUsageEvent and PKPStatsPublicationService)');
        return;
    }
    const facts = {app: app.name, line: app.line || 'main', submission: SUBMISSION, manager: MANAGER};
    const contextId = Number(sql(app, "select journal_id from journals where path = 'publicknowledge'"));
    const slog = serverLog(app);
    const sFrom = slog.mark();
    try {
        facts.metricsBefore = sql(app, 'select count(*) from metrics_submission');
        // 1. The manager adds the "Word" galley to version 1.1 and publishes it.
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER);
                facts.galleys = await step(facts, 'add galley', () => addGalleyToLatestVersion(page, app, SUBMISSION, {label: 'Word', component: 'Article Text', file: FILE, name: 'article.docx'}));
                fact('galleys', facts.galleys);
                const pub = await step(facts, 'publish', () => publishLatestVersion(page, app, SUBMISSION));
                facts.publish = pub && {button: pub.button, publish: pub.publish};
                fact('publish', facts.publish);
                await signOut(page);
            } finally {
                await close();
            }
        }
        facts.wordGalley = sql(app, `select g.galley_id, g.submission_file_id, f.mimetype, p.status from publication_galleys g join publications p on p.publication_id = g.publication_id
            join submission_files sf on sf.submission_file_id = g.submission_file_id join files f on f.file_id = sf.file_id where p.submission_id = ${SUBMISSION} and g.label = 'Word'`);
        fact('word galley (galley | submission file | mimetype | publication status)', facts.wordGalley);

        // 2. Signed out, an ordinary browser: "Word", then "PDF Version 2".
        const ulog = usageLog(app, {contextId});
        const uFrom = ulog.mark();
        {
            const {page, close} = await launch(app);
            try {
                // An ordinary browser's name on every request: setExtraHTTPHeaders alone left the
                // page navigations (the article page, the Word download) on HeadlessChrome, a
                // robot the loader drops (s1 of 2026-10-23); CDP's override covers them too.
                const cdp = await page.context().newCDPSession(page);
                await cdp.send('Network.setUserAgentOverride', {userAgent: READER_UA});
                await page.context().setExtraHTTPHeaders({'User-Agent': READER_UA});
                facts.reader = await step(facts, 'reader', () => readerVisits(page, app));
                fact('reader', facts.reader);
            } finally {
                await close();
            }
        }
        await sleep(1000);
        facts.usageLines = slimLines(ulog.since(uFrom)).filter((e) => Number(e.submissionId) === SUBMISSION);
        facts.robotLines = facts.usageLines.filter((e) => /Headless/i.test(e.ua || '')).length;
        fact('usage lines', facts.usageLines);

        // 3. The next day's loader.
        facts.nextDay = await step(facts, 'next day', () => nextDay(app));
        fact('next day', facts.nextDay && {files: facts.nextDay.files, lines: facts.nextDay.lines, loader: facts.nextDay.loader, loaderError: facts.nextDay.loaderError, jobs: facts.nextDay.jobs, left: facts.nextDay.left});
        facts.metrics = sql(app, `select assoc_type, file_type, representation_id, submission_file_id, to_char(date, 'YYYY-MM-DD'), metric from metrics_submission
            where submission_id = ${SUBMISSION} order by assoc_type, file_type`);
        fact('metrics_submission (submission 1: assoc_type | file_type | galley | file | date | metric)', facts.metrics);

        // 4. The manager reads the figures.
        {
            const {page, close} = await launch(app);
            try {
                await signIn(page, MANAGER);
                facts.stats = await step(facts, 'stats', () => readStats(page, app, SUBMISSION));
                fact('stats', facts.stats);
            } finally {
                await close();
            }
        }
    } finally {
        facts.serverErrors = slog.since(sFrom).slice(0, 20);
        fact('server errors', facts.serverErrors);
        record('i23e', facts);
    }
});
