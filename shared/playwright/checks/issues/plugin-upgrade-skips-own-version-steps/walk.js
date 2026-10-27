// Issue report docs/issues/U62-A11-plugin-upgrade-skips-own-version-steps.md (U62 A11): the report's
// Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"). The packages are built by ./lib.js (product `hkq27b`).
//   (default)  as `admin`, Settings › Website › "Plugins": "Upload A New Plugin" hkq27b 1.0.0.0; the
//              row's "Upgrade" with 1.0.1.0, "Save"; then step 5's query (the hkq27b tables).
//   neighbour  (the fix's check, runs alone): the same 1.0.0.0 and 1.0.1.0, then "Upgrade" again with
//              1.0.2.0, whose steps are limited to 1.0.0.x, 1.0.1.x and 3.0+: from 1.0.1.0 only the
//              1.0.1.x step (and the unconditioned one) is meant to run; the core version rows stay.
// The walk writes checkouts/<app>/plugins/generic/hkq27b and hkq27b_* tables: hold the app's checkout
// (bin/app-lock.sh shared <app>) for its whole length; the script removes both at its end.
//
// Run (main):   npm run fleet-prep -- --feature issues-q27b --dataset 4 --reset   (before each walk)
//               bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q27b PROBE_AGENT=q27b node bin/probe.js ojs shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/walk.js [neighbour]
// 3.5:          the same with PKP_E2E_LINE=stable-3_5_0, feature issues-q27b-3_5, PROBE_RUN=r35.
// Facts: .reports/<feature>/q27b/a11-facts[-<run>]-<app>.json; screens a11-*.
const {forEachApp, launch, signIn, record, outDir, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'steps';

forEachApp(async (app) => {
    const fact = (k, v) => {
        record('a11-facts', {[k]: v}, {merge: true});
        console.log('[a11]', app.name, app.line || 'main', k, JSON.stringify(v).slice(0, 700));
    };
    const pkg = L.buildPackages(outDir());
    fact('mode', MODE);
    fact('before', {folders: L.ourFolders(app), tables: L.ourTables(app), core: L.coreVersions(app)});
    const log = serverLog(app);
    const {page, close} = await launch(app);
    try {
        // 1: sign in as admin. 2: Settings › Website, "Plugins".
        await signIn(page, 'admin');
        const w = await L.openWebsitePlugins(page, app.contextPath);
        const list = w.list;
        await L.snap(page, 'a11-01-plugins');
        // 3: "Upload A New Plugin" 1.0.0.0.
        let from = log.mark();
        fact('install100', await L.sendPackage(page, list, 'upload', pkg.v100));
        fact('install100.versions', L.pluginVersions(app));
        fact('install100.serverLog', log.since(from));
        await L.snap(page, 'a11-02-installed');
        // 4: the row's "Upgrade" with 1.0.1.0, "Save".
        from = log.mark();
        fact('upgrade101', await L.sendPackage(page, list, 'upgrade', pkg.v101));
        fact('upgrade101.serverLog', log.since(from));
        fact('upgrade101.versions', L.pluginVersions(app));
        fact('upgrade101.folder', L.folderRelease(app));
        await L.snap(page, 'a11-03-upgraded');
        // 5: the query.
        fact('upgrade101.tables', L.ourTables(app));
        fact('upgrade101.ran', L.ran(app, '1.0.1.0'));
        fact('upgrade101.core', L.coreVersions(app));
        if (MODE === 'neighbour') {
            // From 1.0.1.0 to 1.0.2.0: only the unconditioned and the 1.0.1.x steps are meant to run.
            from = log.mark();
            fact('upgrade102', await L.sendPackage(page, list, 'upgrade', pkg.v102));
            fact('upgrade102.serverLog', log.since(from));
            fact('upgrade102.versions', L.pluginVersions(app));
            fact('upgrade102.folder', L.folderRelease(app));
            fact('upgrade102.ran', L.ran(app, '1.0.2.0'));
            fact('upgrade102.core', L.coreVersions(app));
            await L.snap(page, 'a11-04-upgraded-102');
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1200));
    } finally {
        await close().catch(() => {});
        fact('cleanup', {folders: L.removeOurFolders(app), tables: L.dropOurTables(app), gitPlugins: L.gitPlugins(app)});
    }
});
