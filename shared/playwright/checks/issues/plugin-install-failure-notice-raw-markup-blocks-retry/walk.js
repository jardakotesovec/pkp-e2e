// Issue report docs/issues/U62-A13-plugin-install-failure-notice-raw-markup-blocks-retry.md (U62 A13): the
// report's Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"). The package is built by ./lib.js.
//   (default)  as `admin`, Settings › Website › "Plugins": "Upload A New Plugin" hkq05bt (a theme whose step
//              creates hkq05bt_items and then fails), the read of step 4, then the same package again.
//              On OMP the theme is reported installed (U62 A12), so the steps stop there.
//   neighbour  (the fix's check, runs alone): a generic plugin whose step succeeds (hkq05bc, the counter:
//              its step creates hkq05bc_runs and adds a row) must still install and keep what its step made.
// Every upload writes checkouts/<app>/plugins/<category>/<product>: hold the app's checkout
// (bin/app-lock.sh shared <app>) for the whole walk; the script removes folders, rows and tables at its end.
//
// Run (main):   npm run fleet-prep -- --feature issues-q05b --dataset 4 --reset   (before each walk)
//               bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q05b PROBE_AGENT=q05b node bin/probe.js ojs shared/playwright/checks/issues/plugin-install-failure-notice-raw-markup-blocks-retry/walk.js [neighbour]
// 3.5:          the same with PKP_E2E_LINE=stable-3_5_0, feature issues-q05b-3_5, PROBE_RUN=r35.
// Facts: .reports/<feature>/q05b/a13-<mode>[-<run>]-<app>.json; screens a13-*.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, outDir, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'steps';
const quiet = (lines) => lines.filter((l) => !/ \[200\]: (GET|POST) |Accepted$|Closing$|\[30\d\]: /.test(l)).map((l) => L.flat(l, 600)).slice(0, 30);

forEachApp(async (app) => {
    const facts = `a13-${MODE}`;
    const fact = (k, v) => {
        record(facts, {[k]: v}, {merge: true});
        console.log('[a13]', app.name, app.line || 'main', MODE, k, JSON.stringify(v).slice(0, 900));
    };
    const dir = path.join(outDir(), `pkg-a13-${MODE}-${app.name}`);
    fs.mkdirSync(dir, {recursive: true});
    const theme = {product: 'hkq05bt', displayName: 'hkq05b Half-Install Theme', kind: 'theme', step: 'fail'};
    const counter = {product: 'hkq05bc', displayName: 'hkq05b Counter Plugin', kind: 'generic', step: 'count'};
    const files = {theme: L.build(dir, theme), counter: L.build(dir, counter)};
    const all = [theme, counter];
    fact('mode', MODE);
    fact('before', {cleanup: L.cleanup(app, all)});
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const errors = [];
    page.on('pageerror', (e) => errors.push(L.flat(e.message, 300)));
    const upload = async (list, key, spec, file) => {
        const from = log.mark();
        const o = await L.sendPackage(page, list, 'upload', file);
        fact(key, o);
        fact(`${key}.after`, {
            row: await L.rowFacts(list, spec.kind, L.names(spec.product).id),
            versions: L.versions(app, spec.product),
            folder: L.folderThere(app, spec.kind, spec.product),
            items: L.table(app, `${spec.product}_items`),
            runs: L.runs(app, spec.product),
            serverLog: quiet(log.since(from)),
        });
        await L.snap(page, `a13-${MODE}-${key}`);
        return o;
    };
    try {
        // 1: sign in as admin. 2: Settings › Website, "Plugins".
        await signIn(page, 'admin');
        const w = await L.openWebsitePlugins(page, app.contextPath);
        const list = w.list;
        await L.snap(page, `a13-${MODE}-01-plugins`);
        if (MODE === 'steps') {
            // 3: the theme; 4: its table (in `first.after.items`).
            const first = await upload(list, 'first', theme, files.theme);
            const failed = (first.notices || []).some((n) => /Installation failed/.test(n.text));
            fact('firstFailedOnScreen', failed);
            // 5: the same package again (only where step 3 showed the failure).
            if (failed) await upload(list, 'again', theme, files.theme);
            // the notice's own markup: what the page holds as text, and whether any <tt> element rendered
            fact('noticeDom', await page.locator('.app__notifications .pkpNotification').evaluateAll((els) => els.map((e) => ({tt: e.querySelectorAll('tt').length, text: e.textContent.replace(/\s+/g, ' ').trim().slice(0, 160)}))).catch(() => null));
        } else if (MODE === 'neighbour') {
            await upload(list, 'counter', counter, files.counter);
            await w.reload();
            fact('counter.afterReload', await L.rowFacts(list, 'generic', L.names(counter.product).id));
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1200));
        await L.snap(page, `a13-${MODE}-err`).catch(() => {});
    } finally {
        fact('pageErrors', errors);
        await close().catch(() => {});
        fact('cleanup', {plugins: L.cleanup(app, all), gitPlugins: L.gitPlugins(app)});
    }
});
