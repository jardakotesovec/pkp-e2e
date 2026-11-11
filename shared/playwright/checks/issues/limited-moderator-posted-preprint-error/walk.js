// Kept walk of issue report docs/issues/U34-OPS3-limited-moderator-posted-preprint-error.md (U34 OPS3).
// On PKP's default test dataset: as `dbarnes`, limit Stephanie Berardo (`sberardo`) to
// recommendations on a published submission, on its "Production" entry (OPS preprint 2 and OJS submission 1 through
// Participants › "Edit"; OMP book 14, which she is not assigned to, through Participants ›
// "Assign"); then as `sberardo` open it from the Dashboard's "Published" view ("View") and by its
// address; then, as the control, `dbarnes` opens it.
//
// `neighbour` as argument walks only the neighbour instead (no limit on the posted preprint), on
// the preprint server alone:
// - `sberardo`, not limited, opens posted preprint 5: "Return to Workflow" must stay offered;
// - `dbarnes` opens posted preprint 2: the same;
// - `dbarnes` limits `sberardo` on preprint 1 (Production) and she opens it: no decision offered
//   ("Post the preprint" alone), which the fix must leave as it is.
//
// Reset first:  npm run fleet-prep -- --feature issues-ir1111c --dataset 6 --reset
// Run (main):   PROBE_FEATURE=issues-ir1111c PROBE_AGENT=ir1111c node bin/probe.js all shared/playwright/checks/issues/limited-moderator-posted-preprint-error/walk.js [neighbour]
// 3.5:          prefix both with PKP_E2E_LINE=stable-3_5_0 (feature issues-ir1111c-3_5), PROBE_RUN=r35
const {forEachApp, launch, signIn, signOut, serverLog, record} = require('../../../probe');
const L = require('./lib.js');

const P = 'ops3-';
const neighbour = process.argv.slice(2).includes('neighbour');

async function asModerator(page, app, c) {
    const out = {};
    await signIn(page, 'sberardo', {contextPath: app.contextPath});
    out.dashboard = await L.openFromPublished(page, app, c.submissionId, c.title);
    if (out.dashboard.rowFound) {
        out.dashboard.workflow = await L.readWorkflow(page, `${P}${app.name}-sberardo-view`);
    }
    out.address = {api: await L.openByAddress(page, app, c.submissionId)};
    out.address.workflow = await L.readWorkflow(page, `${P}${app.name}-sberardo-address`);
    await signOut(page);
    return out;
}

forEachApp(async (app) => {
    const c = L.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, mode: neighbour ? 'neighbour' : 'walk'};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        if (neighbour) {
            if (app.name !== 'ops') {
                facts.skipped = 'the neighbour is the preprint server\'s';
            } else {
                await signIn(page, 'sberardo', {contextPath: app.contextPath});
                facts.unlimitedPosted = {api: await L.openByAddress(page, app, c.posted)};
                facts.unlimitedPosted.workflow = await L.readWorkflow(page, `${P}nb-sberardo-posted-${c.posted}`);
                await signOut(page);
                await signIn(page, 'dbarnes', {contextPath: app.contextPath});
                facts.managerPosted = {api: await L.openByAddress(page, app, c.submissionId)};
                facts.managerPosted.workflow = await L.readWorkflow(page, `${P}nb-dbarnes-posted-${c.submissionId}`);
                facts.limitProduction = await L.limitByEdit(page, app, c.production);
                await signOut(page);
                await signIn(page, 'sberardo', {contextPath: app.contextPath});
                facts.limitedProduction = {api: await L.openByAddress(page, app, c.production)};
                facts.limitedProduction.workflow = await L.readWorkflow(page, `${P}nb-sberardo-limited-production-${c.production}`);
                await signOut(page);
            }
        } else {
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            facts.limit = c.assigned
                ? await L.limitByEdit(page, app, c.submissionId)
                : await L.assignLimited(page, app, c.submissionId, c.role);
            await signOut(page);
            facts.moderator = await asModerator(page, app, c);
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            facts.control = {api: await L.openByAddress(page, app, c.submissionId)};
            facts.control.workflow = await L.readWorkflow(page, `${P}${app.name}-dbarnes-control`);
            await signOut(page);
        }
        facts.serverLog = log.since(from);
        record(P + (neighbour ? 'neighbour' : 'walk') + '-' + app.name, facts);
    } catch (error) {
        facts.error = String(error.stack || error).slice(0, 1500);
        facts.serverLog = log.since(from);
        record(P + (neighbour ? 'neighbour' : 'walk') + '-' + app.name, facts);
        throw error;
    } finally {
        await close();
    }
});
