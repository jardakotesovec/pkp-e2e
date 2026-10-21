// U63 OMP5 issue walk: a press imports its own Native XML export of a book in a series, and the "Results"
// tab lists "Warnings encountered:", "Publication", "Unknown element sequence".
// PKP's default dataset (a dataset fleet), OMP, `publicknowledge`, as rvaca, through the screens:
//   Tools › Import/Export › "Native XML Plugin" › "Export": book 14 "From Bricks to Brains …" (series
//   "Psychology"), "Export Submissions", "Download Exported File"; "Import": that file, "Import".
//   Control: the same for book 5 "Bomb Canada …" (no series).
// Modes (argument after the script):
//   (none)  the Steps, then the control
//   nb      neighbour of the fix: book 14's file with its series path changed to one the press lacks
//           (`h21dseries`) and its <sequence> to 7, imported: the press gains that series (rule OMP3); with
//           the fix its order is the file's 7, without it 0; no "Unknown element sequence" with the fix.
// Each run changes the dataset: reset the fleet first.
//   npm run fleet-prep -- --feature issues-h21d --dataset 4 --apps omp --reset
//   bin/app-lock.sh shared omp -- env PROBE_FEATURE=issues-h21d PROBE_AGENT=h21d PROBE_RUN=walk \
//       node bin/probe.js omp shared/playwright/checks/issues/omp-native-import-series-sequence-warning/walk.js
//   3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, PROBE_FEATURE=issues-h21d-3_5, PROBE_RUN=r35.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, sql, outFile, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || process.env.WALK_MODE || 'walk';
const MANAGER = 'rvaca';
const SERIES_BOOK = {id: 14, title: 'From Bricks to Brains'};
const PLAIN_BOOK = {id: 5, title: 'Bomb Canada and Other Unkind Remarks'};
const REPO = path.resolve(__dirname, '../../../../..');

const maxSub = (app) => Number(sql(app, 'select coalesce(max(submission_id), 0) from submissions'));
function newBooks(app, mark) {
    const rows = sql(app, `select s.submission_id, p.series_id, (select path from series se where se.series_id = p.series_id),
        (select count(*) from publication_formats pf where pf.publication_id = p.publication_id)
        from submissions s join publications p on p.submission_id = s.submission_id where s.submission_id > ${mark} order by 1`);
    return String(rows || '').split('\n').filter(Boolean).map((r) => {
        const [sub, seriesId, seriesPath, formats] = r.split('|');
        return {sub: Number(sub), seriesId: seriesId ? Number(seriesId) : null, seriesPath: seriesPath || null, formats: Number(formats)};
    });
}
/** The "Results" panel's lines after "Warnings encountered:" (the plugin lists warnings, then errors). */
const warnings = (panel) => {
    const t = String(panel || '');
    const i = t.indexOf('Warnings encountered:');
    return i < 0 ? null : t.slice(i, i + 400);
};

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const f = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE};
    try { f.lib = execFileSync('git', ['-C', path.resolve(REPO, app.root, 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(); } catch (e) { /* not a checkout */ }
    try { f.app_sha = execFileSync('git', ['-C', path.resolve(REPO, app.root), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(); } catch (e) { /* not a checkout */ }
    const log = serverLog(app);
    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    const errs = L.scriptErrors(page);
    const w = L.watch(page);
    const step = async (name, fn) => {
        const from = log.mark();
        try { f[name] = await fn(); } catch (e) { f[name] = {error: L.flat(e.stack, 900)}; await L.snap(page, `omp5-${MODE}-${name}-error`).catch(() => {}); }
        const s = log.since(from);
        if (s && s.length) (f.serverLog = f.serverLog || {})[name] = s.slice(0, 8).map((l) => L.flat(l, 240));
    };
    /** Export one book on the "Export" tab, then import the file (edited by `edit` when given) on "Import". */
    const roundTrip = async (book, label, edit) => {
        const o = {book: book.id};
        await L.openNative(app, page);
        const ex = await L.exportOne(page, book.title);
        o.export = {tabs: ex.res.tabs, panel: L.flat(ex.res.panel, 300), file: ex.file};
        let xml = ex.xml;
        o.seriesBlock = L.flat((xml.match(/<series>[\s\S]*?<\/series>/) || [null])[0], 600);
        if (edit) { xml = edit(xml); o.seriesBlockEdited = L.flat((xml.match(/<series>[\s\S]*?<\/series>/) || [null])[0], 600); }
        const file = outFile(`omp5-${label}.xml`);
        fs.writeFileSync(file, xml);
        await L.openNative(app, page);
        const mark = maxSub(app);
        const m = w.seen.length;
        const imp = await L.importFile(page, file);
        o.import = {uploaded: imp.uploaded.status, tabs: imp.tabs, panel: imp.panel, requests: w.seen.slice(m)};
        o.warnings = warnings(imp.panel);
        o.unknownSequenceLines = (String(imp.panel || '').match(/Unknown element sequence/g) || []).length;
        o.snap = await L.snap(page, `omp5-${label}-results`);
        o.newBooks = newBooks(app, mark);
        return o;
    };
    try {
        await step('signIn', async () => { await signIn(page, MANAGER, {contextPath: app.contextPath}); return 'ok'; });
        if (MODE === 'nb') {
            await step('nbUnknownSeries', async () => {
                const before = sql(app, "select count(*) from series where path = 'h21dseries'");
                const o = await roundTrip(SERIES_BOOK, 'nb-unknown-series', (xml) => xml
                    .replace(/(<series>[\s\S]*?<path>)[^<]*(<\/path>)/, '$1h21dseries$2')
                    .replace(/(<series>[\s\S]*?<sequence>)[^<]*(<\/sequence>)/, '$17$2'));
                o.seriesBefore = Number(before);
                o.seriesAfter = sql(app, "select series_id || '|' || seq from series where path = 'h21dseries'") || null;
                return o;
            });
        } else {
            await step('steps', () => roundTrip(SERIES_BOOK, 'series-book'));
            await step('control', () => roundTrip(PLAIN_BOOK, 'plain-book'));
        }
    } finally {
        w.stop();
        f.scriptErrors = errs;
        record(`omp5-${MODE}`, f);
        console.log('[omp5]', JSON.stringify(f, null, 1).slice(0, 9000));
        await close();
    }
});
