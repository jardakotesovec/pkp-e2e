// U22 A8: deleting an unpublished submission with DELETE {context}/api/v1/submissions/{id} (a request
// no screen sends) answers a server error, though the submission is deleted; a published one answers
// 200 with its record. Takes the steps of docs/issues/U22-A8-api-submission-delete-server-error.md on
// PKP's default test dataset, in OJS, OMP and OPS, as the dataset's editor dbarnes.
//
//   walk (the report's steps 1-7):
//     PROBE_FEATURE=issues-h21a PROBE_AGENT=h21a node bin/probe.js all shared/playwright/checks/issues/api-submission-delete-server-error/walk.js
//   neighbour (the fix must leave the request's refusal alone: the submission's own author sends the
//   same DELETE and is refused, nothing is deleted; and the editor's reading of the submission, the
//   record the workflow fetches and its version entries, stays as it was):
//     PROBE_RUN=nb-in PROBE_FEATURE=issues-h21a PROBE_AGENT=h21a node bin/probe.js all …/walk.js neighbour
//   on stable-3_5_0:
//     PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21a-3_5 PROBE_AGENT=h21a node bin/probe.js all …/walk.js
//
// Each step records rather than throws once the request is sent, so a fixed app is read too.
const {forEachApp, launch, signIn, record, idle, sql, serverLog} = require('../../../probe');
const H = require('./lib.js');

const MODE = process.argv[2] || 'walk';
const EDITOR = 'dbarnes';
// The unpublished submission (and its author account) and the published one, per app.
const CASES = {
    ojs: {unpublished: {id: 16, author: 'rrossi'}, published: {id: 17}},
    omp: {unpublished: {id: 10, author: 'jbrower'}, published: {id: 14}},
    ops: {unpublished: {id: 1, author: 'ccorino'}, published: {id: 19}},
};

forEachApp(async (app) => {
    const ctx = app.contextPath;
    const line = app.line || 'main';
    const cases = CASES[app.name];
    const out = {mode: MODE, line, app: app.name};
    const step = (name, data) => { out[name] = data; record(`h21a-${MODE}`, out); };
    const inDb = (id) => sql(app, `select count(*) from submissions where submission_id = ${id}`).trim()
        + ' submission row, ' + sql(app, `select count(*) from publications where submission_id = ${id}`).trim() + ' publication rows';
    const {page, close} = await launch(app);
    try {
        // 1. Sign in as the editor and open the dashboard.
        await signIn(page, EDITOR);
        await H.openDashboard(page, ctx);
        step('s1-landing', page.url());

        if (MODE === 'neighbour') {
            const c = cases.unpublished;
            step('n-editor-workflow-before', await H.workflowVersionLabels(page, ctx, c.id));
            step('n-editor-record-before', await H.send(page, 'GET', c.id));
            await signIn(page, c.author);
            await page.goto(`/index.php/${ctx}/en/dashboard/mySubmissions`);
            await idle(page);
            const log = serverLog(app), from = log.mark();
            step('n-author-request', await H.send(page, 'DELETE', c.id));
            step('n-author-log', log.since(from));
            step('n-author-db-after', inDb(c.id));
            await signIn(page, EDITOR);
            step('n-editor-workflow-after', await H.workflowVersionLabels(page, ctx, c.id));
            step('n-editor-record-after', await H.send(page, 'GET', c.id));
            return;
        }

        // Steps 2-4 for the unpublished submission, 5-7 for the published one, all typed in the
        // console of the dashboard page step 1 lands on. The rows are read as evidence only.
        for (const [n, kind] of [[2, 'unpublished'], [5, 'published']]) {
            const c = cases[kind];
            step(`s${n}-${kind}-get`, await H.send(page, 'GET', c.id));
            step(`s${n}-${kind}-db-before`, inDb(c.id));
            const log = serverLog(app), from = log.mark();
            step(`s${n + 1}-${kind}-delete`, await H.send(page, 'DELETE', c.id));
            step(`s${n + 1}-${kind}-log`, log.since(from));
            step(`s${n + 2}-${kind}-get-again`, await H.send(page, 'GET', c.id));
            step(`s${n + 2}-${kind}-db-after`, inDb(c.id));
        }
    } catch (e) {
        step('error', String(e && e.stack || e).slice(0, 1500));
        throw e;
    } finally {
        await close();
    }
});
