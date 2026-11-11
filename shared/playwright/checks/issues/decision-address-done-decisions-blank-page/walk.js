// Kept walk for docs/issues/U34-A13-decision-address-done-decisions-blank-page.md (spec U34, register A13).
// On PKP's default test dataset, the decision page's address typed by an editor the page admits:
//   the production-stage submission's workflow opened and its ordinary decision button pressed (the control:
//   the decision page opens); in the address that button opened, the decision changed to 33 ("Move to Done")
//   and 35 ("Return to Done"), then the submission number changed to a published one at Done (Production on
//   3.5) and the decision to 34 ("Return to Workflow"). On the preprint server the assigned Moderator too.
// The kit builds nothing; the server log lines are evidence beside the screens.
// WALK_MODE=neighbour runs only the neighbour check for a fix trial: the control addresses still open the
// wizard, and on OJS the recommend-only Section Editor (sberardo, submission 1) is still refused.
// Run:
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/issues/decision-address-done-decisions-blank-page/walk.js
//   (3.5: PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 in front, the 3.5 fleet's feature)
const {forEachApp, launch, signIn, record, shot, serverLog, note} = require('../../../probe');
const K = require('./lib.js');

const MODE = process.env.WALK_MODE || 'steps';
// production: a submission at Production; done: a published one (Done on main); control: an ordinary
// decision of the production stage the page opens.
const CTRL = {ojs: /^(Move|Back) To Copyediting$/i, omp: /^(Move|Back) To Copyediting$/i, ops: /^Decline Submission$/i};
const CASES = {
    ojs: {production: 5, done: 1, control: 29, users: ['dbarnes'], refused: {user: 'sberardo', id: 1, decision: 34}},
    omp: {production: 4, done: 14, control: 29, users: ['dbarnes']},
    ops: {production: 1, done: 2, control: 8, users: ['dbarnes', 'sberardo']},
};

forEachApp(async (app) => {
    const c = CASES[app.name];
    const line = app.line || 'main';
    const facts = {app: app.name, line, mode: MODE, visits: []};
    const log = serverLog(app);
    const {page} = await launch(app);
    let n = 0;
    const visit = async (user, label, id, decision, base = null) => {
        const mark = log.mark();
        let out;
        try {
            out = await K.typed(page, app, id, decision, base);
        } catch (e) {
            out = {threw: K.flat(e.message, 300)};
            note(`U34 A13 walk (${app.name}, ${line}, ${MODE}): ${label} threw: ${K.flat(e.message, 200)}`);
        }
        await new Promise((r) => setTimeout(r, 500));
        out.serverLog = log.since(mark).slice(0, 6).map((l) => K.flat(l, 400));
        const id_ = `a13-${MODE}-${String(++n).padStart(2, '0')}-${user}-${label}`;
        record(id_, out.screen || out);
        await shot(page, id_).catch(() => {});
        delete out.screen;
        const row = {user, label, ...out};
        facts.visits.push(row);
        console.log(`[a13 ${app.name} ${line} ${MODE}] ${user} ${label}`, JSON.stringify({status: row.status, url: row.url, title: row.title, h1: row.h1, wizard: row.wizard, htmlLength: row.htmlLength, body: K.flat(row.bodyText, 160), log: row.serverLog}));
    };
    try {
        for (const user of c.users) {
            await signIn(page, user);
            if (MODE === 'neighbour') {
                await visit(user, `control-${c.production}-d${c.control}`, c.production, c.control);
                continue;
            }
            // Step 2: the workflow's own decision button opens the decision page; its address is the base.
            let base = null;
            try {
                await K.openWorkflow(page, app, c.production);
                const pressed = await K.pressDecision(page, CTRL[app.name]);
                const id_ = `a13-${MODE}-${String(++n).padStart(2, '0')}-${user}-pressed-${c.production}`;
                await shot(page, id_).catch(() => {});
                record(id_, pressed);
                facts.visits.push({user, label: `pressed-${c.production}`, ...pressed});
                console.log(`[a13 ${app.name} ${line} ${MODE}] ${user} pressed`, JSON.stringify(pressed));
                if (pressed.onPage) base = pressed.url;
            } catch (e) {
                note(`U34 A13 walk (${app.name}, ${line}): pressing the control threw: ${K.flat(e.message, 200)}`);
            }
            if (!base) await visit(user, `control-${c.production}-d${c.control}`, c.production, c.control);
            await visit(user, `move-to-done-${c.production}-d33`, c.production, 33, base);
            await visit(user, `return-to-done-${c.production}-d35`, c.production, 35, base);
            await visit(user, `return-to-workflow-${c.done}-d34`, c.done, 34, base);
        }
        if (MODE === 'neighbour' && c.refused) {
            await signIn(page, c.refused.user);
            await visit(c.refused.user, `refused-${c.refused.id}-d${c.refused.decision}`, c.refused.id, c.refused.decision);
        }
    } finally {
        record(`a13-${MODE}-facts`, facts);
    }
});
