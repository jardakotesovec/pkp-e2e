// Kept walk of issue report docs/issues/U24-A14-recommending-editor-return-to-workflow-refused.md
// (U24 A14), on PKP's default test dataset.
// OJS: submission 1 "Signalling Theory Dividends" (in Done) has Stephanie Berardo (`sberardo`)
// assigned as Section editor "Only allowed to recommend" in the dataset. OMP: `dbarnes` assigns
// her to book 14 (in Done) as Series editor with that box ticked (Participants › "Assign").
// Then `sberardo` opens the submission, reads the header, presses "Return to Workflow" ›
// "Confirm", "OK" on what opens, reloads. Control: an editor without the limit (OJS `dbuskins`,
// OMP `dbarnes`) presses the same, and `sberardo` reads the header of the returned submission.
// OPS is not walked: there the limited Moderator's read of a posted preprint fails first (U34
// OPS3 report).
//
// `neighbour` as argument walks only what the fix must leave alone, with no limit set:
// OJS `sberardo` on submission 17 (assigned without the limit) and `dbuskins` on submission 1,
// OMP `dbarnes` on book 14: each is offered "Return to Workflow" and "Confirm" moves the
// submission back to Production.
//
// Reset first:  npm run fleet-prep -- --feature issues-n13c --dataset 1 --reset
// Run (main):   PROBE_FEATURE=issues-n13c PROBE_AGENT=n13c bin/app-lock.sh shared ojs,omp -- \
//                 node bin/probe.js all shared/playwright/checks/issues/recommending-editor-return-to-workflow-refused/walk.js [neighbour]
// 3.5:          prefix both with PKP_E2E_LINE=stable-3_5_0 (feature issues-n13c-3_5), PROBE_RUN=r35
const {forEachApp, launch, signIn, signOut, serverLog, record} = require('../../../probe');
const L = require('./lib.js');

const P = 'a14-';
const neighbour = process.argv.slice(2).includes('neighbour');
const CASES = {
    ojs: {sid: 1, assign: null, control: 'dbuskins', nb: [['sberardo', 17], ['dbuskins', 1]]},
    omp: {sid: 14, assign: {role: 'Series editor', person: 'Stephanie Berardo'}, control: 'dbarnes', nb: [['dbarnes', 14]]},
};

async function returnAs(page, app, user, sid, label) {
    await signIn(page, user, {contextPath: app.contextPath});
    await L.open(page, app, sid);
    const out = {user, sid, header: await L.readHeader(page, app)};
    out.press = await L.pressAndConfirm(page, app, sid, 'Return to Workflow', `${P}${label}`);
    await signOut(page);
    return out;
}

forEachApp(async (app) => {
    const c = CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: neighbour ? 'neighbour' : 'walk'};
    const name = P + (neighbour ? 'neighbour' : 'walk');
    if (!c) {
        facts.skipped = 'OPS: the limited Moderator\'s read of a posted preprint fails first (U34 OPS3)';
        record(name, facts);
        return;
    }
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        if (neighbour) {
            facts.neighbours = [];
            for (const [user, sid] of c.nb) {
                facts.neighbours.push(await returnAs(page, app, user, sid, `nb-${user}-${sid}`));
            }
        } else {
            if (c.assign) {
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                facts.assign = await L.assignLimited(page, app, c.sid, c.assign.role, c.assign.person);
                await signOut(page);
            }
            facts.limited = await returnAs(page, app, 'sberardo', c.sid, 'sberardo');
            facts.control = await returnAs(page, app, c.control, c.sid, `control-${c.control}`);
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
