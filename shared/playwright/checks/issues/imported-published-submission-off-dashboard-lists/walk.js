// Issue report U63 A26 (docs/issues/U63-A26-imported-published-submission-off-dashboard-lists.md):
// a published submission exported and imported with the Native XML Plugin is on neither the Dashboard's
// "Published" nor its "Active submissions".
// On PKP's default dataset (a dataset fleet, harness.md "Dataset fleets"), context `publicknowledge`, as `rvaca`.
//
// Modes (H21F_MODE):
//   walk (default)  the report's Steps on the published submission (OJS 17, OMP 5, OPS 2):
//                   Tools › Import/Export › "Native XML Plugin" › export tab, tick, export, download;
//                   "Import" tab, upload, "Import"; Dashboard "Published", "Active submissions", the search
//                   box by the copy's number; the copy's public page.
//   nb              the neighbour: the same export and import of a submission in Production, not published
//                   (OJS 5, OMP 4, OPS 1); its copy must stay in Production, under "Active submissions" only.
//   file            a file made elsewhere, imported on the "Import" tab: H21F_FILE names it, `{app}` standing for
//                   the app (a 3.5 export of the same submission, which carries no version_stage), then steps 7-10.
//   nover           steps 1-5, then the exported file imported with its publications' version_stage,
//                   version_major and version_minor attributes left out (optional in pkp-native.xsd), then steps 6-10.
//   title           read only, after a walk mode left a copy: the side menu's "Search submissions" by a phrase of
//                   the title (the way round after a bulk import).
//   cli             the reach: the published submission exported and imported on the server's command line
//                   (`php tools/importExport.php NativeImportExportPlugin export|import …`, as `admin`), then
//                   the Dashboard read as in walk (steps 7-8).
// Each mode records what it sees and never throws on the state a fix brings.
//
// Mutates the fleet's dataset: reset before each run (one app per locked call on main).
//   npm run fleet-prep -- --feature issues-h21f --dataset 8 --reset
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-h21f PROBE_AGENT=h21f node bin/probe.js ojs \
//       shared/playwright/checks/issues/imported-published-submission-off-dashboard-lists/walk.js
//   3.5: PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21f-3_5 --dataset 8 --reset
//        PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21f-3_5 PROBE_AGENT=h21f node bin/probe.js all …/walk.js
// Facts: .reports/<feature>/h21f/a26-<mode>[-<run>]-<app>.json, snapshots beside it.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, sql, outFile, serverLog} = require('../../../probe');
const L = require('./lib');

const REPO = path.resolve(__dirname, '../../../../..');
const MODE = process.env.H21F_MODE || 'walk';
const SUB = {
    cli: null,
    walk: {
        ojs: {id: 17, title: 'Antimicrobial, heavy metal resistance and plasmid profile', page: 'article/view'},
        omp: {id: 5, title: 'Bomb Canada and Other Unkind Remarks in the American Media', page: 'catalog/book'},
        ops: {id: 2, title: 'The Facets Of Job Satisfaction', page: 'preprint/view'},
    },
    nb: {
        ojs: {id: 5, title: 'Genetic transformation of forest trees'},
        omp: {id: 4, title: 'How Canadians Communicate'},
        ops: {id: 1, title: 'The influence of lactation on the quantity and quality of cashmere production'},
    },
}[['cli', 'file', 'nover', 'title'].includes(MODE) ? 'walk' : MODE];
const PHRASE = {ojs: 'Antimicrobial, heavy metal', omp: 'Bomb Canada', ops: 'Facets Of Job Satisfaction'};

const state = (app, id) => {
    const q = (v) => sql(app, `select 'stage ' || s.stage_id || ', status ' || s.status || ', current publication status ' || p.status${v}
        from submissions s join publications p on p.publication_id = s.current_publication_id where s.submission_id = ${id}`);
    // publications.version_stage is main's (pkp/pkp-lib#10669); 3.5 has no such column
    try { return q(" || ', version_stage ' || coalesce(p.version_stage, '-')"); } catch (e) { return q(''); }
};
const ENTITY = {ojs: 'article', omp: 'monograph', ops: 'preprint'};
/** The plugin's command line, as the team runs it from the app's directory; per-file skip lines and notices dropped. */
function cli(app, args) {
    const env = {...process.env, PKP_CONFIG_FILE: path.resolve(REPO, app.configFile)};
    let out, code = 0;
    try {
        out = execFileSync('php', ['tools/importExport.php', 'NativeImportExportPlugin', ...args], {cwd: path.resolve(REPO, app.root), env, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
    } catch (e) { code = e.status; out = `${e.stdout || ''}${e.stderr || ''}`; }
    const kept = String(out).split('\n').filter((l) => l.trim() && !/^- The submission file \d+ was skipped/.test(l) && !/^PHP (Notice|Deprecated):\s+tempnam/.test(l));
    return {cmd: `php tools/importExport.php NativeImportExportPlugin ${args.map((a) => (a.includes('/') ? path.basename(a) : a)).join(' ')}`, exit: code, output: kept.slice(0, 20).map((l) => L.flat(l, 240))};
}
const decisions = (app, id) => sql(app, `select decision || '@stage' || stage_id from edit_decisions where submission_id = ${id} order by edit_decision_id`);

async function titleSearch(app) {
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
        const r = await L.searchView(app, page, PHRASE[app.name]);
        r.copies = sql(app, "select submission_id || ':' || stage_id || '/' || status from submissions order by 1 desc limit 3");
        r.snap = await L.snap(page, 'a26-title-09-search');
        record('a26-title', r);
        console.log('[a26]', JSON.stringify(r));
    } finally { await close(); }
}

forEachApp(async (app) => {
    if (MODE === 'title') return titleSearch(app);
    const S = SUB[app.name];
    const f = {mode: MODE, app: app.name, line: app.line || 'main', dataset: app.dataset, source: S.id, lib: null};
    try { f.lib = execFileSync('git', ['-C', path.resolve(REPO, app.root, 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(); } catch (e) { /* not a checkout */ }
    f.sourceState = state(app, S.id);
    const mark = Number(sql(app, 'select coalesce(max(submission_id), 0) from submissions'));
    const log = serverLog(app);
    const {page, close} = await launch(app);
    page.setDefaultTimeout(20_000);
    const errs = L.scriptErrors(page);
    const w = L.watch(page);
    const step = async (name, fn) => {
        const from = log.mark();
        try { f[name] = await fn(); } catch (e) { f[name] = {error: L.flat(e.stack, 900)}; await L.snap(page, `a26-${MODE}-${name}-error`).catch(() => {}); }
        const s = log.since(from);
        if (s && s.length) (f.serverLog = f.serverLog || {})[name] = s.slice(0, 8).map((l) => L.flat(l, 240));
    };
    const file = outFile(`a26-${MODE}-export.xml`);
    try {
        if (MODE === 'cli') {
            f.cliExport = cli(app, ['export', file, app.contextPath, ENTITY[app.name], String(S.id)]);
            f.cliImport = fs.existsSync(file) ? cli(app, ['import', file, app.contextPath, 'admin']) : 'no file';
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
        }
        if (MODE === 'file') {
            const src = path.resolve(REPO, String(process.env.H21F_FILE || '').replace('{app}', app.name));
            fs.copyFileSync(src, file);
            f.fileFrom = path.basename(src);
            f.fileVersionAttrs = (fs.readFileSync(file, 'utf8').match(/version_stage=/g) || []).length;
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await L.openNative(app, page);
        }
        // Steps 1-5: sign in, the tool, export and download
        if (!['cli', 'file'].includes(MODE)) await step('s1to5Export', async () => {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await L.openNative(app, page);
            const ex = await L.exportOne(app, page, S.title);
            fs.writeFileSync(file, ex.xml);
            const node = (ex.xml.match(/<(article|monograph|preprint)\s[^>]*>/) || [])[0] || null;
            return {download: ex.file, tabs: ex.res.tabs, panel: L.flat(ex.res.panel, 300), submissionNode: L.flat(node, 400),
                publicationNodes: (ex.xml.match(/<publication\s[^>]*>/g) || []).map((n) => L.flat(n, 300)), snap: await L.snap(page, `a26-${MODE}-05-exported`)};
        });
        if (MODE === 'nover' && fs.existsSync(file)) {
            const x = fs.readFileSync(file, 'utf8');
            fs.writeFileSync(file, x.replace(/<publication\s[^>]*>/g, (t) => t.replace(/\s+version_(stage|major|minor)="[^"]*"/g, '')));
            f.fileVersionAttrs = (fs.readFileSync(file, 'utf8').match(/version_stage=/g) || []).length;
        }
        // Step 6: import
        if (MODE !== 'cli') await step('s6Import', async () => {
            if (!fs.existsSync(file)) return 'no file';
            const m = w.seen.length;
            const imp = await L.importFile(page, file);
            return {uploaded: imp.uploaded, tabs: imp.tabs, panel: imp.panel, requests: w.seen.slice(m), snap: await L.snap(page, `a26-${MODE}-06-import-results`)};
        });
        const copy = Number(sql(app, `select coalesce(min(submission_id), 0) from submissions where submission_id > ${mark}`)) || null;
        f.copy = copy;
        f.newSubmissions = Number(sql(app, `select count(*) from submissions where submission_id > ${mark}`));
        if (copy) {
            f.copyState = state(app, copy);
            f.copyDecisions = decisions(app, copy) || '(none)';
            f.sourceDecisions = decisions(app, S.id) || '(none)';
        }
        // Steps 7-8: the Dashboard's views, from the side menu
        f.views = {};
        for (const view of ['Published', 'Active submissions']) {
            await step(`view${view.replace(/\W/g, '')}`, async () => {
                const v = await L.readView(app, page, view);
                v.lists = {copy: copy ? v.rowIds.includes(String(copy)) : null, source: v.rowIds.includes(String(S.id))};
                v.snap = await L.snap(page, `a26-${MODE}-07-${view.replace(/\W/g, '').toLowerCase()}`);
                f.views[view] = v;
                return {heading: v.heading, lists: v.lists};
            });
        }
        // Step 9: the side menu's search box, by the copy's number
        if (copy && MODE !== 'cli') await step('s9Search', async () => {
            const r = await L.searchView(app, page, String(copy));
            r.found = r.rowIds.includes(String(copy));
            r.snap = await L.snap(page, `a26-${MODE}-09-search`);
            return r;
        });
        // Step 10: the copy's public page (published only)
        if (copy && S.page && MODE !== 'cli') await step('s10PublicPage', async () => {
            const resp = await page.goto(app.url(`/index.php/${app.contextPath}/${S.page}/${copy}`));
            await L.sleep(500);
            return {status: resp && resp.status(), title: await page.title(), snap: await L.snap(page, `a26-${MODE}-10-public-page`)};
        });
    } finally {
        w.stop();
        f.scriptErrors = errs;
        record(`a26-${MODE}`, f);
        console.log('[a26]', JSON.stringify(f, null, 1).slice(0, 8000));
        await close();
    }
});
