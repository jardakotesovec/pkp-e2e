// U64 incidental I27H: a published title holding `\",` (a backslash, a double
// quote, a comma) in the Statistics "Download Report" files. Drives, as a
// scratch Journal (Press, Server) Manager, on a scratch context seeded here:
//   - Statistics › "Articles" ("Monographs", "Preprints"): the page, then
//     "Download Report" and every panel of its window ("Download Articles"
//     ("Download Monographs", "Download Preprints"), "Download Files",
//     "Download Timeline"; "Geographic" is absent at the install's site level);
//   - the same with the search phrase `I27H\",split` applied (the browser
//     writes the "Search Phrase" line, the server the rows: U64 A8 vs the row);
//   - the same with the filter on a section (series) whose name holds plain
//     double quotes, `Sec "Q" two` (A8's filter-line sentence);
//   - Statistics › "Journal" ("Press", "Server") › "Download Report" ›
//     "Download Journal" ("Download Press", "Download Server"): the context's
//     own name holds the breakout too.
// Two published items: the breakout `Stats I27H\",split title` and the control
// `Stats Plain "q", ok title` (a plain quote and a comma), each with a file and
// visits two days ago. Every file is saved through the kit's `outFile()` and
// read by Python's csv module (`../../U65/I27D/rfc4180.py`, run as
// `python3 -I`), whose rows are set against the file's own header line.
//
// Run (two runs, each seeding its own scratch context; they may run at once):
//   PROBE_RUN=r1 PROBE_FEATURE=U64 PROBE_AGENT=ccI27H node bin/probe.js all shared/playwright/checks/U64/I27H/i27h.js
//   PROBE_RUN=r2 PROBE_FEATURE=U64 PROBE_AGENT=ccI27H node bin/probe.js all shared/playwright/checks/U64/I27H/i27h.js
// Needs: python3 on the PATH and shared/playwright/checks/U65/I27D/rfc4180.py;
// no other script or env part. Outputs land in .reports/U64/ccI27H/:
// facts-<run>-<app>.json (every file's parameter lines, header width, the
// marked rows' widths and cells), the files (`<kind>-<run>-<app>.csv`), the
// screens (`<screen>-<run>-<app>.json/.png`) and the run record.
// Scratch contexts only; publicknowledge is not touched.
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, tag, outFile} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const RFC = path.resolve(__dirname, '../../U65/I27D/rfc4180.py');
const BREAK = 'I27H\\",split'; // I27H\",split
const PLAIN = 'Plain "q", ok';
const QSEC = 'Sec "Q" two';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

function rfc4180(file) {
    return JSON.parse(execFileSync('python3', ['-I', RFC, file], {encoding: 'utf8'}));
}

/** Parameter lines, the empty line, the header, the rows: set every row against the header. */
function judge(parsed) {
    const rows = parsed.rows;
    const blank = (r) => r.n === 0 || (r.n === 1 && r.cells[0] === '');
    const gap = rows.findIndex(blank);
    let h = gap;
    while (h >= 0 && h < rows.length && blank(rows[h])) h++;
    const header = h >= 0 && rows[h] ? rows[h] : {n: 0, cells: []};
    const body = h >= 0 ? rows.slice(h + 1).filter((r) => !blank(r)) : [];
    const mark = (r) => {
        const j = r.cells.join('␟');
        return j.includes('split') ? 'breakout' : j.includes('Plain') ? 'control' : 'other';
    };
    return {
        bom: parsed.bom,
        physicalLines: parsed.physicalLines,
        params: (gap < 0 ? [] : rows.slice(0, gap)).map((r) => ({n: r.n, cells: r.cells})),
        emptyLineAt: gap,
        header: {n: header.n, cells: header.cells},
        rows: body.map((r) => ({kind: mark(r), width: r.n, match: r.n === header.n, cells: r.cells})),
    };
}

forEachApp(async (app) => {
    const A = app.name;
    const isOJS = A === 'ojs';
    const isOMP = A === 'omp';
    const {StatsPage} = require(path.join(REPO, 'shared/playwright/pages/UsageStatsPages.js'));
    const facts = {app: A, line: app.line, values: {breakout: BREAK, control: PLAIN, quotedSection: QSEC}};
    const save = () => record('facts', facts);
    async function step(name, fn) {
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {error: flat((e && e.stack) || e, 900)};
        }
        save();
        console.log(`[${A}] ${name}: ${JSON.stringify(facts[name]).slice(0, 700)}`);
    }
    async function snap(page, name) {
        await idle(page).catch(() => {});
        const s = await screen(page);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }

    // ---- seed ----------------------------------------------------------------
    const J = tag('u64i27h');
    const U = (k) => `${J}${k}`;
    const W = isOJS ? 'Articles' : isOMP ? 'Monographs' : 'Preprints';
    const CTX = isOJS ? 'Journal' : isOMP ? 'Press' : 'Server';
    const filterHeading = isOMP ? 'Series' : 'Sections';
    const body = {
        tag: J,
        context: {acronym: 'I27H', name: {en: `I27H ${BREAK} ${CTX}`}},
        users: [
            {username: U('mgr'), roles: ['manager'], givenName: 'Mgr', familyName: 'Seven'},
            {username: U('au'), roles: ['author'], givenName: 'Ada', familyName: 'Breakout'},
            {username: U('ap'), roles: ['author'], givenName: 'Abe', familyName: 'Control'},
        ],
        usage: [{daysAgo: 2, views: 4}],
    };
    if (isOMP) body.series = [{path: 'one', title: 'Series One'}, {path: 'two', title: QSEC}];
    else body.sections = isOJS ? [{abbrev: 'ART', title: 'Articles'}, {abbrev: 'QQ', title: QSEC}] : [{abbrev: 'PRE', title: 'Preprints'}, {abbrev: 'QQ', title: QSEC}];
    if (isOJS) body.issues = [{volume: 1, number: 1, year: 2026, published: true}];
    const files = isOMP ? {publicationFormats: [{name: 'PDF', file: 'article.pdf', genre: 'Book Manuscript'}]}
        : {galleys: [{label: 'PDF', file: isOJS ? 'article.pdf' : 'preprint.pdf'}]};
    await step('seed', async () => {
        const res = await app.api.createContext(body);
        const pub = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const subs = {};
        const sub = async (key, spec) => {
            const r = await app.api.createSubmission({tag: U(key), context: J, published: true, ...pub, ...files, ...spec});
            subs[key] = {id: r.submissionId};
        };
        await sub('p1', {submitter: U('au'), title: `Stats ${BREAK} title`, ...(isOMP ? {series: 'two'} : {section: 'QQ'}),
            usage: [{daysAgo: 2, abstractViews: 3, fileViews: [2]}]});
        await sub('p2', {submitter: U('ap'), title: `Stats ${PLAIN} title`, ...(isOMP ? {series: 'one'} : {section: isOJS ? 'ART' : 'PRE'}),
            usage: [{daysAgo: 2, abstractViews: 2, fileViews: [1]}]});
        return {context: J, contextId: res.contextId, subs};
    });
    if (facts.seed.error) return;

    /** Open the window (unless open), record it once, press a button, keep the file. */
    async function download(page, stats, button, kind, windowShot) {
        const dlg = page.getByRole('dialog').filter({hasText: 'Download a CSV'});
        let win;
        if (!(await dlg.isVisible().catch(() => false))) win = await stats.openDownload();
        else win = {dialog: dlg};
        let windowRead;
        if (windowShot) {
            const s = await snap(page, windowShot);
            windowRead = {dialog: flat(s.text.dialog, 900), buttons: (await dlg.getByRole('button').allInnerTexts()).map((t) => flat(t, 60))};
        }
        const b = dlg.getByRole('button', {name: button, exact: true});
        await loc(page, `Download window: ${button}`, b);
        const arrived = page.waitForEvent('download', {timeout: 60_000});
        await b.click();
        const dl = await arrived;
        const file = outFile(`${kind}.csv`);
        await dl.saveAs(file);
        await sleep(1000);
        const windowOpenAfter = await dlg.isVisible().catch(() => false);
        return {name: dl.suggestedFilename(), saved: path.basename(file), windowOpenAfter, ...(windowRead ? {window: windowRead} : {}), ...judge(rfc4180(file))};
    }

    // ---- Statistics › "Articles": plain, every panel ---------------------------
    await step('articles', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const stats = new StatsPage(page, J, 'articles');
            await stats.goto();
            await sleep(1000);
            const s = await snap(page, 'stats-works');
            const listed = (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
            const out = {heading: flat(await stats.heading.innerText().catch(() => ''), 60), listed, columns: (await stats.columnHeaders.allInnerTexts()).map((t) => flat(t, 40)),
                itemsOfTotal: flat(await stats.itemsOfTotal.innerText().catch(() => ''), 60), main: flat(s.text.main, 500), files: {}};
            out.files.works = await download(page, stats, `Download ${W}`, 'stats-works', 'stats-download-window');
            await snap(page, 'stats-works-after-download');
            out.files.files = await download(page, stats, 'Download Files', 'stats-files');
            out.files.timeline = await download(page, stats, 'Download Timeline', 'stats-timeline');
            await snap(page, 'stats-works-after-all-downloads');
            return out;
        } finally {
            await close();
        }
    });

    // ---- the search phrase holding the breakout ----------------------------------
    await step('search', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const stats = new StatsPage(page, J, 'articles');
            await stats.goto();
            await stats.search(BREAK);
            await sleep(800);
            const s = await snap(page, 'stats-works-searched');
            const listed = (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
            const out = {listed, itemsOfTotal: flat(await stats.itemsOfTotal.innerText().catch(() => ''), 60), boxValue: await stats.searchBox.inputValue(), main: flat(s.text.main, 400)};
            out.works = await download(page, stats, `Download ${W}`, 'stats-works-searched', 'stats-download-window-searched');
            // A search that finds both rows: one word of the titles.
            await stats.searchBox.fill('');
            await stats.search('Stats');
            await sleep(800);
            await snap(page, 'stats-works-searched-word');
            out.wordListed = (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
            out.worksWord = await download(page, stats, `Download ${W}`, 'stats-works-searched-word');
            // Which part of the breakout keeps the search from finding its own title:
            // the tag alone, the tag with its backslash, the control's own phrase (quotes, no backslash).
            out.controls = {};
            for (const [k, phrase] of [['tag', 'I27H'], ['tagBackslash', 'I27H\\'], ['quoteNoBackslash', '",split'], ['control', PLAIN]]) {
                await stats.search(phrase);
                await sleep(500);
                out.controls[k] = {phrase, itemsOfTotal: flat(await stats.itemsOfTotal.innerText().catch(() => ''), 60),
                    listed: (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 120))};
            }
            await snap(page, 'stats-works-searched-control');
            return out;
        } finally {
            await close();
        }
    });

    // ---- the filter on the section (series) with quotes in its name --------------
    await step('filter', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const stats = new StatsPage(page, J, 'articles');
            await stats.goto();
            await stats.toggleFilters();
            await sleep(500);
            const offered = (await stats.filterNames(filterHeading).allInnerTexts()).map((t) => flat(t, 80));
            await stats.pressFilter(filterHeading, QSEC);
            await sleep(800);
            await snap(page, 'stats-works-filtered');
            const listed = (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 200));
            const works = await download(page, stats, `Download ${W}`, 'stats-works-filtered', 'stats-download-window-filtered');
            return {offered, listed, works};
        } finally {
            await close();
        }
    });

    // ---- Statistics › "Journal" ("Press", "Server") ------------------------------
    await step('context', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const stats = new StatsPage(page, J, 'journal');
            await stats.goto();
            await sleep(1000);
            const s = await snap(page, 'stats-context');
            const file = await download(page, stats, `Download ${CTX}`, 'stats-context', 'stats-context-download-window');
            await snap(page, 'stats-context-after-download');
            return {heading: flat(await stats.heading.innerText().catch(() => ''), 60), main: flat(s.text.main, 500), file};
        } finally {
            await close();
        }
    });
});
