// U65 incidental I27D: a double quote after a backslash in a value breaks the
// line it sits on in every CSV download. Drives, as a scratch Journal (Press,
// Server) Manager, every CSV download the app has on `main`:
//   - Statistics › "Users" › "Export" › "Export" (three apps; U65 Fields "The
//     exported file", Rule 17);
//   - Statistics › "Reports": "Articles Report", "Review Report",
//     "Subscriptions Report" (OJS), "Monograph Report", "Review Report" (OMP);
//     the preprint server's page is recorded (it offers none, OPS3);
//   - Statistics › "Articles" ("Monographs", "Preprints") › "Download Report" ›
//     "Download Articles" ("Download Monographs", "Download Preprints"), the
//     stats "Download Report" files of U64.
// Each file carries two shapes of one value: the breakout `I27D\",split`
// (a backslash, a double quote, a comma) and the control `Plain "q", ok` (a
// plain double quote and a comma), as a contributor's and an account's given
// name, a reviewer's given name and review comments, a subscriber's given name
// and a published title. Every file is saved through the kit's `outFile()`
// and read by Python's csv module (`rfc4180.py`, beside this file, run as
// `python3 -I`), whose rows are set against the file's own header line.
// The run also leaves the export window once with a box unticked (the sweep's
// "left with something changed" read).
//
// Run (two runs, each seeding its own scratch context):
//   PROBE_RUN=r1 PROBE_FEATURE=U65 PROBE_AGENT=ccI27D node bin/probe.js all shared/playwright/checks/U65/I27D/i27d.js
//   PROBE_RUN=r2 PROBE_FEATURE=U65 PROBE_AGENT=ccI27D node bin/probe.js all shared/playwright/checks/U65/I27D/i27d.js
// Needs: python3 on the PATH; no other script or env part. Outputs land in
// .reports/U65/ccI27D/: facts-<run>-<app>.json (every file's header width,
// the marked rows' widths and cells), the files themselves (`<kind>-<run>-<app>.csv`),
// the screens (`<screen>-<run>-<app>.json/.png`) and the run record.
// Scratch contexts only; publicknowledge is not touched.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outFile} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const BREAK = 'I27D\\",split'; // I27D\",split
const PLAIN = 'Plain "q", ok';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/** Python's csv reader over a saved file: `{bom, physicalLines, rows: [{n, cells}]}`. */
function rfc4180(file) {
    const out = execFileSync('python3', ['-I', path.join(__dirname, 'rfc4180.py'), file], {encoding: 'utf8'});
    return JSON.parse(out);
}

/** Set a file's rows against its header lines; the rows that carry either marker. */
function judge(parsed, {headerAt}) {
    const rows = parsed.rows;
    const headers = headerAt(rows); // [{index, n}] — each header row and the rows it heads
    const out = [];
    for (let h = 0; h < headers.length; h++) {
        const from = headers[h].index + 1;
        const to = h + 1 < headers.length ? headers[h + 1].index - 1 : rows.length;
        for (let i = from; i < to; i++) {
            const r = rows[i];
            if (!r || r.n === 0 || (r.n === 1 && r.cells[0] === '')) continue;
            const joined = r.cells.join('␟');
            const kind = joined.includes('split') ? 'breakout' : joined.includes('Plain') ? 'control' : 'other';
            out.push({row: i, kind, headerWidth: headers[h].n, width: r.n, match: r.n === headers[h].n, cellsWithMarker: r.cells.map((c, k) => [k, c]).filter(([, c]) => /I27D|Plain|split/.test(c))});
        }
    }
    return {
        bom: parsed.bom,
        physicalLines: parsed.physicalLines,
        logicalRows: rows.length,
        headers: headers.map((x) => ({index: x.index, n: x.n, first: (rows[x.index].cells || []).slice(0, 4)})),
        rows: out,
        breakoutRows: out.filter((r) => r.kind === 'breakout').map((r) => ({width: r.width, headerWidth: r.headerWidth, cells: r.cellsWithMarker})),
        controlRows: out.filter((r) => r.kind === 'control').map((r) => ({width: r.width, headerWidth: r.headerWidth, cells: r.cellsWithMarker})),
        otherRowsMismatched: out.filter((r) => r.kind === 'other' && !r.match).length,
    };
}
const firstRowHeader = (rows) => [{index: 0, n: rows[0].n}];
// The stats files: parameter lines, an empty line, the header, the rows.
const statsHeader = (rows) => {
    let i = rows.findIndex((r) => r.n === 0 || (r.n === 1 && r.cells[0] === ''));
    while (i >= 0 && i < rows.length && (rows[i].n === 0 || (rows[i].n === 1 && rows[i].cells[0] === ''))) i++;
    return [{index: i < 0 ? 0 : i, n: rows[i < 0 ? 0 : i].n}];
};
// The subscriptions file: "Individual Subscriptions", header, rows, empty, "Institutional Subscriptions", header, rows.
const subsHeaders = (rows) => {
    const out = [];
    rows.forEach((r, i) => {
        if (r.n === 1 && /Subscriptions$/.test(r.cells[0]) && rows[i + 1]) out.push({index: i + 1, n: rows[i + 1].n});
    });
    return out;
};

forEachApp(async (app) => {
    const A = app.name;
    const isOJS = A === 'ojs';
    const isOMP = A === 'omp';
    const isOPS = A === 'ops';
    const {UserStatsPage, EditorialReportsPage} = require(path.join(REPO, 'shared/playwright/pages/EditorialStatsPages.js'));
    const {StatsPage} = require(path.join(REPO, 'shared/playwright/pages/UsageStatsPages.js'));
    const facts = {app: A, line: app.line, values: {breakout: BREAK, control: PLAIN}};
    const save = () => record('facts', facts);
    async function step(name, fn) {
        try {
            facts[name] = await fn();
        } catch (e) {
            facts[name] = {error: flat((e && e.stack) || e, 900)};
        }
        save();
        console.log(`[${A}] ${name}: ${JSON.stringify(facts[name]).slice(0, 600)}`);
    }
    async function snap(page, name) {
        await idle(page).catch(() => {});
        const s = await screen(page);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    /** Save a download through outFile() and read it with Python's csv. */
    async function keep(download, kind, headerAt) {
        const file = outFile(`${kind}.csv`);
        await download.saveAs(file);
        return {name: download.suggestedFilename(), saved: path.basename(file), ...judge(rfc4180(file), {headerAt})};
    }

    // ---- seed ----------------------------------------------------------------
    const J = tag('u65i27d');
    const U = (k) => `${J}${k}`;
    const users = [
        {username: U('mgr'), roles: ['manager'], givenName: 'Mgr', familyName: 'Seven'},
        {username: U('au'), roles: ['author'], givenName: BREAK, familyName: 'Breakout'},
        {username: U('ap'), roles: ['author'], givenName: PLAIN, familyName: 'Control'},
    ];
    if (!isOPS) {
        const rr = isOMP ? ['externalReviewer', 'internalReviewer'] : ['externalReviewer'];
        users.push({username: U('rv'), roles: rr, givenName: BREAK, familyName: 'Reviewer'});
        users.push({username: U('rp'), roles: rr, givenName: PLAIN, familyName: 'Reviewer'});
    }
    if (isOJS) {
        users.push({username: U('sb'), roles: ['reader'], givenName: BREAK, familyName: 'Subscriber'});
        users.push({username: U('sp'), roles: ['reader'], givenName: PLAIN, familyName: 'Subscriber'});
    }
    const body = {tag: J, context: {acronym: 'I27D'}, users};
    if (isOMP) body.series = [{path: 'one', title: 'Series One'}];
    else body.sections = isOJS ? [{abbrev: 'ART', title: 'Articles'}] : [{abbrev: 'PRE', title: 'Preprints'}];
    if (isOJS) {
        body.issues = [{volume: 1, number: 1, year: 2026, published: true}];
        body.subscriptionTypes = [{name: 'I27D Individual', cost: 10, currency: 'USD', duration: 12}];
        body.subscriptions = [{user: U('sb'), type: 'I27D Individual'}, {user: U('sp'), type: 'I27D Individual'}];
    }
    await step('seed', async () => {
        const res = await app.api.createContext(body);
        const place = isOMP ? {series: 'one'} : {section: isOJS ? 'ART' : 'PRE'};
        const pub = isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const subs = {};
        const sub = async (key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: U(key), context: J, ...place, ...spec});
                subs[key] = {id: r.submissionId};
            } catch (e) {
                subs[key] = {error: flat(e.message, 600)};
            }
        };
        const review = (who, comments) => ({username: U(who), status: 'completed', comments});
        await sub('s1', {submitter: U('au'), title: 'I27D breakout submission',
            contributors: [{givenName: BREAK, familyName: 'Coauthor', email: `${U('co1')}@mail.test`, country: 'DE'}],
            ...(isOPS ? {} : {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [review('rv', `Comment ${BREAK}`)]}]})});
        await sub('s2', {submitter: U('ap'), title: 'I27D control submission',
            contributors: [{givenName: PLAIN, familyName: 'Coauthor', email: `${U('co2')}@mail.test`, country: 'DE'}],
            ...(isOPS ? {} : {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [review('rp', `Comment ${PLAIN}`)]}]})});
        await sub('p1', {submitter: U('au'), title: `Stats ${BREAK} title`, published: true, ...pub, usage: [{daysAgo: 2, abstractViews: 3}]});
        await sub('p2', {submitter: U('ap'), title: `Stats ${PLAIN} title`, published: true, ...pub, usage: [{daysAgo: 2, abstractViews: 2}]});
        return {context: J, contextId: res.contextId, subs};
    });
    if (facts.seed.error) return;

    // ---- Statistics › "Users" › "Export" ---------------------------------------
    await step('usersExport', async () => {
        const {page, close} = await launch(app);
        const dialogs = [];
        page.on('dialog', (d) => {
            dialogs.push({type: d.type(), message: d.message()});
            d.accept().catch(() => {});
        });
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const users = new UserStatsPage(page, J);
            await users.goto();
            await snap(page, 'users');
            await loc(page, 'Users: the Export button', users.exportButton);
            const win = await users.openExport();
            await snap(page, 'users-export-window');
            const boxes = await win.boxStates();
            const arrived = page.waitForEvent('download', {timeout: 30_000});
            await win.exportButton.click();
            const file = await keep(await arrived, 'users-export', firstRowHeader);
            await sleep(800);
            const after = await snap(page, 'users-after-export');
            // The window left once with a box unticked: open, untick the first, go to "Reports".
            const win2 = await users.openExport();
            const firstLabel = (await win2.boxStates())[0][0];
            await win2.box(firstLabel).setChecked(false);
            await page.goto(app.url(`/index.php/${J}/stats/reports`));
            await idle(page);
            await sleep(2000);
            const left = await snap(page, 'reports-after-leaving-export-window');
            return {boxes: boxes.length, file, windowOpenAfterExport: (await win.dialog.count()) > 0 && (await win.dialog.isVisible().catch(() => false)),
                afterExportUrl: after.url, leftWithUnticked: {box: firstLabel, landed: left.url, dialogs: [...dialogs], notices: left.notices}};
        } finally {
            await close();
        }
    });

    // ---- Statistics › "Reports" ----------------------------------------------------
    const REPORTS = isOJS ? [['Articles Report', 'articles', firstRowHeader], ['Review Report', 'reviews', firstRowHeader], ['Subscriptions Report', 'subscriptions', subsHeaders]]
        : isOMP ? [['Monograph Report', 'monographs', firstRowHeader], ['Review Report', 'reviews', firstRowHeader]] : [];
    await step('reportsPage', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const rp = new EditorialReportsPage(page, J);
            await rp.goto();
            const s = await snap(page, 'reports');
            await loc(page, 'Reports: the report links', rp.links);
            return {links: (await rp.links.allInnerTexts()).map((t) => flat(t, 60)), main: flat(s.text.main, 600)};
        } finally {
            await close();
        }
    });
    for (const [link, kind, headerAt] of REPORTS) {
        // A fresh browser per file (patterns.md "Downloads").
        await step(kind, async () => {
            const {page, close} = await launch(app);
            try {
                await signIn(page, U('mgr'), {contextPath: J});
                const rp = new EditorialReportsPage(page, J);
                await rp.goto();
                const before = page.url();
                const arrived = page.waitForEvent('download', {timeout: 60_000});
                await rp.link(link).click();
                const file = await keep(await arrived, kind, headerAt);
                await sleep(800);
                const after = await snap(page, `reports-after-${kind}`);
                return {file, pageStayed: after.url === before || after.url.endsWith('/stats/reports')};
            } finally {
                await close();
            }
        });
    }

    // ---- Statistics › "Articles" › "Download Report" (U64) --------------------
    await step('statsDownload', async () => {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'), {contextPath: J});
            const stats = new StatsPage(page, J, 'articles');
            await stats.goto();
            await sleep(1000);
            const s = await snap(page, 'stats-works');
            const listed = (await stats.itemRows.allInnerTexts().catch(() => [])).map((t) => flat(t, 160));
            const win = await stats.openDownload();
            await snap(page, 'stats-download-window');
            const button = isOJS ? 'Download Articles' : isOMP ? 'Download Monographs' : 'Download Preprints';
            await loc(page, `Download window: ${button}`, win.dialog.getByRole('button', {name: button, exact: true}));
            const arrived = page.waitForEvent('download', {timeout: 60_000});
            await win.dialog.getByRole('button', {name: button, exact: true}).click();
            const file = await keep(await arrived, 'stats-works', statsHeader);
            await sleep(800);
            await snap(page, 'stats-works-after-download');
            return {heading: flat(await stats.heading.innerText().catch(() => ''), 60), listed, file, main: flat(s.text.main, 400)};
        } finally {
            await close();
        }
    });
    if (A === 'ojs') note('I27D: Statistics › "Users" › "Export" and the stats "Download Report" buttons are read with `page.waitForEvent(\'download\')` then `download.saveAs(outFile(...))`; the report links download at once from the Reports page, one fresh launch() per file.');
});
