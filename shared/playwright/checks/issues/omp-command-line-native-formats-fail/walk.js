// U63 OMP6 issue walk: from the server's command line a press's Native XML import fails on any book with a
// publication format, and once the press's ONIX details are filled its export of such a book fails too.
// PKP's default dataset (a dataset fleet), OMP, `publicknowledge`; book 5 "Bomb Canada …" (published, one
// format "PDF"). The command line runs from the OMP directory as the team runs it (`admin` imports);
// the screens are driven as rvaca.
//   1 CLI export of book 5 (bomb.xml)            2 CLI import of bomb.xml
//   3 web "Import" of bomb.xml (control)         4 Settings › Press › "Masthead": the four ONIX details saved
//   5 CLI export of book 5 again (bomb2.xml)     6 web "Export" of book 5 (control; its file has an ONIX <Product>)
//   7 CLI import of bomb2.xml, or of the web file when 5 wrote none (the ONIX product's import path)
// Modes (argument after the script):
//   (none)  the steps above
//   nb      neighbour of the fix, the screens' own path through the changed filters: ONIX details saved,
//           web "Export" of book 5, web "Import" of that file; the copy's format and its ONIX codes read back.
// Each run changes the dataset: reset the fleet first.
//   npm run fleet-prep -- --feature issues-h21d --dataset 4 --apps omp --reset
//   bin/app-lock.sh shared omp -- env PROBE_FEATURE=issues-h21d PROBE_AGENT=h21d PROBE_RUN=walk \
//       node bin/probe.js omp shared/playwright/checks/issues/omp-command-line-native-formats-fail/walk.js
//   3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, PROBE_FEATURE=issues-h21d-3_5, PROBE_RUN=r35.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, sql, outFile, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'walk';
const MANAGER = 'rvaca';
const BOOK = {id: 5, title: 'Bomb Canada and Other Unkind Remarks'};
const ONIX = {publisher: 'h21d Press', location: 'Vancouver', codeType: 'Proprietary (01)', codeValue: 'h21d-01'};
const REPO = path.resolve(__dirname, '../../../../..');

const maxSub = (app) => Number(sql(app, 'select coalesce(max(submission_id), 0) from submissions'));
function newBooks(app, mark) {
    const rows = sql(app, `select s.submission_id, s.status, p.publication_id,
        (select count(*) from publication_formats pf where pf.publication_id = p.publication_id),
        (select string_agg(coalesce(pf.entry_key, '') || '/' || coalesce(pf.product_composition_code, ''), ',') from publication_formats pf where pf.publication_id = p.publication_id),
        (select count(*) from identification_codes ic join publication_formats pf on pf.publication_format_id = ic.publication_format_id where pf.publication_id = p.publication_id)
        from submissions s join publications p on p.submission_id = s.submission_id where s.submission_id > ${mark} order by 1`);
    return String(rows || '').split('\n').filter(Boolean).map((r) => {
        const [sub, status, pub, formats, codes, idCodes] = r.split('|');
        return {sub: Number(sub), status: Number(status), pub: Number(pub), formats: Number(formats), formatCodes: codes || null, identificationCodes: Number(idCodes)};
    });
}
const source = (app) => newBooks(app, BOOK.id - 1).find((b) => b.sub === BOOK.id) || null;

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const f = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: MODE};
    try { f.lib = execFileSync('git', ['-C', path.resolve(REPO, app.root, 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(); } catch (e) { /* not a checkout */ }
    try { f.app_sha = execFileSync('git', ['-C', path.resolve(REPO, app.root), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(); } catch (e) { /* not a checkout */ }
    f.onixBefore = sql(app, "select string_agg(setting_name || '=' || setting_value, ', ' order by setting_name) from press_settings where setting_name in ('publisher','location','codeType','codeValue','contactName','contactEmail') and coalesce(locale, '') in ('', 'en')") || '(none)';
    f.source = source(app);
    const log = serverLog(app);
    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    const errs = L.scriptErrors(page);
    const w = L.watch(page);
    const step = async (name, fn) => {
        const from = log.mark();
        try { f[name] = await fn(); } catch (e) { f[name] = {error: L.flat(e.stack, 900)}; await L.snap(page, `omp6-${MODE}-${name}-error`).catch(() => {}); }
        const s = log.since(from);
        if (s && s.length) (f.serverLog = f.serverLog || {})[name] = s.slice(0, 8).map((l) => L.flat(l, 240));
    };
    const cliExport = (file) => {
        if (fs.existsSync(file)) fs.unlinkSync(file);
        const r = L.cli(app, ['export', file, app.contextPath, 'monograph', String(BOOK.id)]);
        return {...r, file: fs.existsSync(file) ? L.fileFacts(fs.readFileSync(file, 'utf8')) : 'not written'};
    };
    const cliImport = (file) => {
        const mark = maxSub(app);
        const r = L.cli(app, ['import', file, app.contextPath, 'admin']);
        return {...r, newBooks: newBooks(app, mark)};
    };
    const webImport = async (file, label) => {
        await L.openNative(app, page);
        const mark = maxSub(app);
        const m = w.seen.length;
        const imp = await L.importFile(page, file);
        return {tabs: imp.tabs, panel: imp.panel, requests: w.seen.slice(m), snap: await L.snap(page, `omp6-${label}`), newBooks: newBooks(app, mark)};
    };
    const webExport = async (file, label) => {
        await L.openNative(app, page);
        const ex = await L.exportOne(page, BOOK.title);
        fs.writeFileSync(file, ex.xml);
        return {tabs: ex.res.tabs, panel: L.flat(ex.res.panel, 300), file: L.fileFacts(ex.xml), snap: await L.snap(page, `omp6-${label}`)};
    };
    const masthead = async () => {
        await L.fillOnixDetails(page, app.contextPath, ONIX);
        const snap = await L.snap(page, `omp6-${MODE}-masthead-saved`);
        return {snap, stored: sql(app, "select string_agg(setting_name || '=' || setting_value, ', ' order by setting_name) from press_settings where setting_name in ('publisher','location','codeType','codeValue')")};
    };
    try {
        await step('signIn', async () => { await signIn(page, MANAGER, {contextPath: app.contextPath}); return 'ok'; });
        if (MODE === 'nb') {
            const web = outFile('omp6-nb-web-export.xml');
            await step('nb1Masthead', masthead);
            await step('nb2WebExport', () => webExport(web, 'nb-web-export'));
            await step('nb3WebImport', () => (fs.existsSync(web) ? webImport(web, 'nb-web-import') : 'no file'));
        } else {
            const fileA = outFile('omp6-bomb.xml');
            const fileB = outFile('omp6-bomb2.xml');
            const fileC = outFile('omp6-web-export.xml');
            await step('s1CliExport', () => cliExport(fileA));
            await step('s2CliImport', () => (fs.existsSync(fileA) ? cliImport(fileA) : 'no file'));
            await step('s3WebImport', () => (fs.existsSync(fileA) ? webImport(fileA, 'walk-web-import') : 'no file'));
            await step('s4Masthead', masthead);
            await step('s5CliExportOnix', () => cliExport(fileB));
            await step('s6WebExportOnix', () => webExport(fileC, 'walk-web-export'));
            await step('s7CliImportOnix', () => {
                const file = fs.existsSync(fileB) ? fileB : fileC;
                return {file: path.basename(file), ...cliImport(file)};
            });
        }
    } finally {
        w.stop();
        f.scriptErrors = errs;
        record(`omp6-${MODE}`, f);
        console.log('[omp6]', JSON.stringify(f, null, 1).slice(0, 12000));
        await close();
    }
});
