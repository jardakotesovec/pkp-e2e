// Issue report docs/issues/U62-A14-plugin-upgrade-runs-replaced-install-step.md (U62 A14): the report's
// Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"). The packages are built by ./lib.js (products `u62n23i`, `u62n23ix`).
//   (default)  as `admin`, Settings › Website › "Plugins": "Upload A New Plugin" u62n23i 1.0.0.0; its
//              row's "Upgrade" with 1.0.1.0 (whose installation step adds u62n23i_tags), "Save"; step 5's
//              query; then "Upload A New Plugin" u62n23ix 1.0.0.0 and the query again (steps 6, 7).
//   neighbour  (the fix's check, runs alone): u62n23ix 1.0.0.0 uploaded, then "Upgrade" with its 1.0.1.0,
//              whose upgrade.xml names an upgrade-only migration (u62n23ix_upgraded): a plugin with no
//              installation step upgrades as before and the upgrade file's own step runs.
// The walk writes checkouts/<app>/plugins/generic/u62n23i[x], served by every fleet of the slot, and
// tables in the fleet's database: run each app as ONE exclusive command; the script removes both at
// its end.
//
// Run (main):   npm run fleet-prep -- --feature issues-n23i --dataset 3 --reset   (before each walk)
//               bin/app-lock.sh exclusive ojs -- env PROBE_FEATURE=issues-n23i PROBE_AGENT=n23i node bin/probe.js ojs shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/walk.js [neighbour]
// 3.5:          the same with PKP_E2E_LINE=stable-3_5_0 in front of both, feature issues-n23i-3_5, PROBE_RUN=r35.
// Facts: .reports/<feature>/n23i/a14-facts[-<run>]-<app>.json; screens a14-*.
const {forEachApp, launch, signIn, record, outDir, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || 'steps';

forEachApp(async (app) => {
    const fact = (k, v) => {
        record('a14-facts', {[k]: v}, {merge: true});
        console.log('[a14]', app.name, app.line || 'main', k, JSON.stringify(v).slice(0, 700));
    };
    const pkg = L.buildPackages(outDir());
    fact('mode', MODE);
    fact('before', {folders: L.ourFolders(app), tables: L.ourTables(app), versions: L.pluginVersions(app), core: L.coreVersions(app)});
    const log = serverLog(app);
    const {page, close} = await launch(app);
    try {
        // 1: sign in as admin. 2: Settings › Website, "Plugins".
        await signIn(page, 'admin');
        const w = await L.openWebsitePlugins(page, app.contextPath);
        const list = w.list;
        await L.snap(page, 'a14-01-plugins');
        let from;
        if (MODE !== 'neighbour') {
            // 3: "Upload A New Plugin" u62n23i 1.0.0.0.
            from = log.mark();
            fact('install100', await L.sendPackage(page, list, 'upload', pkg.main100, L.MAIN));
            fact('install100.serverLog', log.since(from));
            fact('install100.tables', L.ourTables(app));
            await L.snap(page, 'a14-02-installed');
            // 4: the row's "Upgrade" with 1.0.1.0, "Save".
            from = log.mark();
            fact('upgrade101', await L.sendPackage(page, list, 'upgrade', pkg.main101, L.MAIN));
            fact('upgrade101.serverLog', log.since(from));
            fact('upgrade101.versions', L.pluginVersions(app));
            fact('upgrade101.folder', L.folderRelease(app, L.MAIN));
            fact('upgrade101.core', L.coreVersions(app));
            await L.snap(page, 'a14-03-upgraded');
            // 5: the query.
            fact('step5.tables', L.ourTables(app));
            // 6: "Upload A New Plugin" u62n23ix 1.0.0.0. 7: the query again.
            from = log.mark();
            fact('installOther', await L.sendPackage(page, list, 'upload', pkg.other100, L.OTHER));
            fact('installOther.serverLog', log.since(from));
            await L.snap(page, 'a14-04-other-installed');
            fact('step7.tables', L.ourTables(app));
        } else {
            // Neighbour: a plugin with no installation step, upgraded with an upgrade file's own migration.
            from = log.mark();
            fact('nb.install100', await L.sendPackage(page, list, 'upload', pkg.other100, L.OTHER));
            fact('nb.install100.serverLog', log.since(from));
            from = log.mark();
            fact('nb.upgrade101', await L.sendPackage(page, list, 'upgrade', pkg.other101, L.OTHER));
            fact('nb.upgrade101.serverLog', log.since(from));
            fact('nb.upgrade101.versions', L.pluginVersions(app));
            fact('nb.upgrade101.folder', L.folderRelease(app, L.OTHER));
            fact('nb.upgrade101.tables', L.ourTables(app));
            fact('nb.upgrade101.core', L.coreVersions(app));
            await L.snap(page, 'a14-05-nb-upgraded');
        }
    } catch (e) {
        fact('error', L.flat(e.stack, 1200));
    } finally {
        await close().catch(() => {});
        fact('cleanup', L.cleanup(app));
    }
});
