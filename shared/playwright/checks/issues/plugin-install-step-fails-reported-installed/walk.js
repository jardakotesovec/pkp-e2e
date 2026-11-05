// Issue report docs/issues/U62-A12-plugin-install-step-fails-reported-installed.md (U62 A12): the report's
// Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"). The packages are built by ./lib.js.
//   (default)  as `admin`, Settings › Website › "Plugins": "Upload A New Plugin" hkq05bc (the counter: its
//              step adds a row to hkq05bc_runs each time it runs), then hkq05bf (its step creates
//              hkq05bf_items and then fails); the reload; the reads of step 7.
//   filter     (not in the Steps) the same failing step in a generic plugin that carries its own empty
//              filter/filterConfig.xml (hkq05bx), and in a theme without one (hkq05by): the variants the
//              register names besides the generic plugin.
//   neighbour  (the fix's check, runs alone): the counter, then a good plugin hkq05bg (step creates
//              hkq05bg_items): it must still install and run its own step, the counter's must not run
//              again; then the counter's "Upgrade" to 1.0.1.0, whose upgrade.xml creates hkq05bc_up: the
//              upgrade path, which the fix leaves as it is.
// Every upload writes checkouts/<app>/plugins/<category>/<product>: hold the app's checkout
// (bin/app-lock.sh shared <app>) for the whole walk; the script removes folders, rows and tables at its end.
//
// Run (main):   npm run fleet-prep -- --feature issues-q05b --dataset 4 --reset   (before each walk)
//               bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q05b PROBE_AGENT=q05b node bin/probe.js ojs shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/walk.js [filter|neighbour]
// 3.5:          the same with PKP_E2E_LINE=stable-3_5_0, feature issues-q05b-3_5, PROBE_RUN=r35.
// Facts: .reports/<feature>/q05b/a12-<mode>[-<run>]-<app>.json; screens a12-*.
const path = require('path');
const {forEachApp, launch, signIn, record, outDir, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'steps';
const quiet = (lines) => lines.filter((l) => !/ \[200\]: (GET|POST) |Accepted$|Closing$|\[30\d\]: /.test(l)).map((l) => L.flat(l, 400)).slice(0, 30);

forEachApp(async (app) => {
    const facts = `a12-${MODE}`;
    const fact = (k, v) => {
        record(facts, {[k]: v}, {merge: true});
        console.log('[a12]', app.name, app.line || 'main', MODE, k, JSON.stringify(v).slice(0, 700));
    };
    const dir = path.join(outDir(), `pkg-a12-${MODE}-${app.name}`);
    require('fs').mkdirSync(dir, {recursive: true});
    const P = {
        counter: {product: 'hkq05bc', displayName: 'hkq05b Counter Plugin', kind: 'generic', step: 'count'},
        failing: {product: 'hkq05bf', displayName: 'hkq05b Half-Install Plugin', kind: 'generic', step: 'fail'},
        failingFilter: {product: 'hkq05bx', displayName: 'hkq05b Half-Install Filter Plugin', kind: 'generic', step: 'fail', filter: true},
        failingTheme: {product: 'hkq05by', displayName: 'hkq05b Half-Install Theme', kind: 'theme', step: 'fail'},
        good: {product: 'hkq05bg', displayName: 'hkq05b Good Plugin', kind: 'generic', step: 'make'},
    };
    const files = Object.fromEntries(Object.entries(P).map(([k, s]) => [k, L.build(dir, s)]));
    files.counter101 = L.build(dir, {...P.counter, version: '1.0.1.0', upgradeTable: 'hkq05bc_up'});
    const all = Object.values(P);
    fact('mode', MODE);
    fact('before', {cleanup: L.cleanup(app, all, ['hkq05bc_up']), staticPages: L.versions(app, 'staticPages'), staticPagesTable: L.table(app, 'static_pages')});
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(L.flat(e.message, 300)));
    /** One upload and the reads after it. */
    const upload = async (list, key, spec, file, via = 'upload') => {
        const from = log.mark();
        const o = await L.sendPackage(page, list, via, file, via === 'upgrade' ? L.names(spec.product).id : null);
        fact(key, o);
        fact(`${key}.after`, {
            row: await L.rowFacts(list, spec.kind, L.names(spec.product).id),
            versions: L.versions(app, spec.product),
            folder: L.folderThere(app, spec.kind, spec.product),
            items: L.table(app, `${spec.product}_items`),
            counterRuns: L.runs(app, 'hkq05bc'),
            serverLog: quiet(log.since(from)),
        });
        await L.snap(page, `a12-${MODE}-${key}`);
    };
    try {
        // 1: sign in as admin. 2: Settings › Website, "Plugins".
        await signIn(page, 'admin');
        const w = await L.openWebsitePlugins(page, app.contextPath);
        const list = w.list;
        await L.snap(page, `a12-${MODE}-01-plugins`);
        // 3, 4: the counter plugin, and its row count.
        await upload(list, 'counter', P.counter, files.counter);
        if (MODE === 'steps') {
            // 5: the plugin whose step fails partway.
            await upload(list, 'failing', P.failing, files.failing);
            // 6: reload, "Plugins" again.
            await w.reload();
            fact('failing.afterReload', await L.rowFacts(list, 'generic', L.names(P.failing.product).id));
            await L.snap(page, `a12-${MODE}-06-reloaded`);
            // 7: the reads.
            fact('step7', {versions: L.versions(app, 'hkq05bf'), items: L.table(app, 'hkq05bf_items'), counterRuns: L.runs(app, 'hkq05bc')});
        } else if (MODE === 'filter') {
            await upload(list, 'failingFilter', P.failingFilter, files.failingFilter);
            await upload(list, 'failingTheme', P.failingTheme, files.failingTheme);
            await w.reload();
            fact('afterReload', {
                failingFilter: await L.rowFacts(list, 'generic', L.names(P.failingFilter.product).id),
                failingTheme: await L.rowFacts(list, 'theme', L.names(P.failingTheme.product).id),
            });
        } else if (MODE === 'neighbour') {
            await upload(list, 'good', P.good, files.good);
            await upload(list, 'counterUpgrade', P.counter, files.counter101, 'upgrade');
            fact('counterUpgrade.upTable', L.table(app, 'hkq05bc_up'));
            await w.reload();
            fact('afterReload', {
                counter: await L.rowFacts(list, 'generic', L.names(P.counter.product).id),
                good: await L.rowFacts(list, 'generic', L.names(P.good.product).id),
            });
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1200));
        await L.snap(page, `a12-${MODE}-err`).catch(() => {});
    } finally {
        fact('pageErrors', errors);
        await close().catch(() => {});
        fact('cleanup', {plugins: L.cleanup(app, all, ['hkq05bc_up']), gitPlugins: L.gitPlugins(app)});
    }
});
