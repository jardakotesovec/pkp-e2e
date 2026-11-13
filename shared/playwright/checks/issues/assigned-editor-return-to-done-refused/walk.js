// Kept walk of issue report docs/issues/U24-A15-assigned-editor-return-to-done-refused.md
// (U24 A15), on PKP's default test dataset: an editor assigned to a published submission (OJS
// `dbarnes` Journal editor on submission 1, OMP `dbarnes` Press editor on book 14, OPS
// `dbuskins` Moderator on preprint 2) opens it, presses "Return to Workflow" › "Confirm", then
// "Return to Done" › "Confirm", "OK" on what opens, reloads. Control: the Journal / Press /
// Preprint Server manager `rvaca`, not assigned, presses "Return to Done" › "Confirm" (when the
// submission is still out of Done).
//
// `neighbour` as argument walks only what the fix must leave alone: `rvaca` presses "Return to
// Workflow" › "Confirm", then "Return to Done" › "Confirm" (both must move the submission); on
// OJS `sberardo` (Section editor "Only allowed to recommend") then reads the header of the
// returned submission 1, which must offer no "Return to Done".
//
// Reset first:  npm run fleet-prep -- --feature issues-n13c --dataset 1 --reset
// Run (main):   PROBE_FEATURE=issues-n13c PROBE_AGENT=n13c bin/app-lock.sh shared ojs,omp,ops -- \
//                 node bin/probe.js all shared/playwright/checks/issues/assigned-editor-return-to-done-refused/walk.js [neighbour]
// 3.5:          prefix both with PKP_E2E_LINE=stable-3_5_0 (feature issues-n13c-3_5), PROBE_RUN=r35
const {forEachApp, launch, signIn, signOut, serverLog, record} = require('../../../probe');
const L = require('./lib.js');

const P = 'a15-';
const neighbour = process.argv.slice(2).includes('neighbour');
const CASES = {
    ojs: {sid: 1, editor: 'dbarnes'},
    omp: {sid: 14, editor: 'dbarnes'},
    ops: {sid: 2, editor: 'dbuskins'},
};

forEachApp(async (app) => {
    const c = CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: neighbour ? 'neighbour' : 'walk'};
    const name = P + (neighbour ? 'neighbour' : 'walk');
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        const actor = neighbour ? 'rvaca' : c.editor;
        await signIn(page, actor, {contextPath: app.contextPath});
        await L.open(page, app, c.sid);
        facts.actor = actor;
        facts.headerOnOpen = await L.readHeader(page, app);
        facts.returnToWorkflow = await L.pressAndConfirm(page, app, c.sid, 'Return to Workflow', `${P}${actor}-rtw`);
        facts.returnToDone = await L.pressAndConfirm(page, app, c.sid, 'Return to Done', `${P}${actor}-rtd`);
        await signOut(page);
        if (!neighbour) {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await L.open(page, app, c.sid);
            facts.control = {headerOnOpen: await L.readHeader(page, app)};
            facts.control.returnToDone = await L.pressAndConfirm(page, app, c.sid, 'Return to Done', `${P}control-rvaca-rtd`);
            await signOut(page);
        } else if (app.name === 'ojs') {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            await L.open(page, app, c.sid);
            facts.rvacaAgain = await L.pressAndConfirm(page, app, c.sid, 'Return to Workflow', `${P}nb-rvaca-rtw2`);
            await signOut(page);
            await signIn(page, 'sberardo', {contextPath: app.contextPath});
            await L.open(page, app, c.sid);
            facts.limitedAfterReturn = await L.readHeader(page, app);
            await signOut(page);
        }
        facts.serverLog = log.since(from);
        record(name, facts);
    } catch (error) {
        facts.error = String(error.stack || error).slice(0, 1500);
        facts.serverLog = log.since(from);
        record(name, facts);
        throw error;
    } finally {
        await close();
    }
});
