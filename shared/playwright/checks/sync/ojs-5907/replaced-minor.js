// PR review check — pkp/pkp-lib#13469, pkp/ojs#5907 (getExportable()'s depositable filter grouped): with
// "DOI Versioning" "Yes", the daily DOAJ deposit leaves a journal's own version that a later minor
// version replaced (U63 retired A5, footnote f-a5). One journal, PKP's default test dataset; the helpers
// are the ones the DOAJ issue walks share (checks/issues/). It changes the data: reset the fleet first.
//
//   npm run fleet-prep -- --feature sync-13469-m --dataset 2 --reset --apps ojs
//   PROBE_FEATURE=sync-13469-m PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/ojs-5907/replaced-minor.js
//
//   1 (as admin) publicknowledge: Settings › Distribution › DOIs › Setup, "DOI Versioning" "Yes"
//   2 (as dbarnes) DOAJ Export Plugin › Settings: an API key and the automatic-deposit box, "Save"
//   3 Publications: submission 17 › "Mark registered"; its workflow: "Unpublish", then "Publish" (1.0 "Needs Sync")
//   4 "Create New Version" (the window's defaults: Version of Record, Minor Revision), then "Publish" on 1.1
//   5 the Publications list; the daily DOAJ task; the queue and the stored statuses; the list again
//
// Facts go to facts-replaced-minor-ojs.json; no assertions. At the PR's base a7f55c18f6 the task queued
// deposits for 1.0 and 1.1 (and for submission 1, "Not Deposited"); at the head cedaf1be16 for 1.1 and
// submission 1 only, 1.0's stored status staying `stale` (2026-10-08).
const {forEachApp, launch, signIn, screen, shot, record} = require('../../../probe');
const L = require('../../issues/doaj-deposit-takes-other-journals-articles/lib');
const V = require('../../issues/older-version-tab-current-title/lib');

const SID = 17;

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // DOAJ is OJS's alone
    if (!app.dataset) throw new Error('replaced-minor.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${L.flat(JSON.stringify(v), 1200)}`);
    };
    let n = 0;
    const snap = async (page, name) => {
        const label = `rm-${String(++n).padStart(2, '0')}-${name}`;
        record(label, await screen(page));
        await shot(page, label).catch(() => {});
        return label;
    };
    const rows17 = (list) => list.filter((r) => r[0] === String(SID));

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        fact('1 versioning', await L.versioningYes(page, app, 'publicknowledge'));

        await signIn(page, 'dbarnes');
        await L.openDoaj(page, app, 'publicknowledge');
        const save = await L.saveSettings(page, {key: 'publicknowledge-test-key', auto: true});
        await L.openDoaj(page, app, 'publicknowledge');
        fact('2 DOAJ settings', {save, after: await L.readSettings(page)});

        await L.openDoaj(page, app, 'publicknowledge', 'Publications');
        const mr = await L.markRegistered(page, SID);
        await L.openDoaj(page, app, 'publicknowledge', 'Publications');
        fact('3 mark registered', {status: mr, rows: rows17(await L.readList(page))});
        fact('3 unpublish', {status: await L.unpublish(page, app, 'publicknowledge', SID)});
        fact('3 publish', await L.publish(page, app, 'publicknowledge', SID));
        fact('3 stored', L.storedStatus(app, SID));

        await L.openWorkflow(page, app, 'publicknowledge', SID);
        const created = await V.createNewVersion(page, app);
        fact('4 create new version', {status: created.status, id: created.id, window: L.flat(created.window, 200)});
        await V.workflowFrame(page, app).gotoEditorial(SID, {menuKey: `publication_${created.id}_titleAbstract`});
        await L.sleep(1500);
        fact('4 publish 1.1', {...(await L.publish(page, app, 'publicknowledge', SID)), snap: await snap(page, 'minor-published')});
        fact('4 stored', L.storedStatus(app, SID));
        fact('4 versions', L.versions(app, SID));

        await L.openDoaj(page, app, 'publicknowledge', 'Publications');
        fact('5 list before the task', {rows: rows17(await L.readList(page)), snap: await snap(page, 'before-task')});
        fact('queue before the task', L.dbJobs(app));
        fact('5 task', L.runTask(app));
        fact('queue after the task', L.dbJobs(app));
        fact('stored after the task', L.storedStatus(app, SID));
        await L.openDoaj(page, app, 'publicknowledge', 'Publications');
        fact('5 list after the task', {rows: rows17(await L.readList(page)), snap: await snap(page, 'after-task')});
    } finally {
        record('facts-replaced-minor', facts);
        await close();
    }
});
