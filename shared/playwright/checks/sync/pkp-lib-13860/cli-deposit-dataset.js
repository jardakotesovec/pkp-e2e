// Kept check of the PR review of pkp-lib#13860, round 2: cli-deposit.js on PKP's dataset (dataset fleets), for the
// lines without the `_test` API (3.4), and the jobs.php backports (pkp-lib#13885, #13886): the worker is started
// with the bare `--stop-when-empty` and a 120 s timeout, so a worker that ignores the flag shows as `workerHung`.
//   PKP_E2E_LINE=stable-3_4_0 npm run fleet-prep -- --feature sync-dep --dataset 1 --reset --apps ojs,ops
//   PROBE_FEATURE=sync-dep PROBE_AGENT=dep34 node bin/probe.js ojs,ops shared/playwright/checks/sync/pkp-lib-13860/cli-deposit-dataset.js
// Per agency (OJS: Crossref, then DataCite; OPS: Crossref) cli-deposit.php `setup` turns DOIs and the agency on for
// the dataset's context and picks a published work (the n-th by id), then queues "Deposit DOIs", the worker runs it
// (the test config's dead-port proxy fails the deposit), and `read` prints the DOI's status and settings.
// STUB=<httpStatus> runs the job in cli-deposit.php's process with the agency's answer stubbed instead of queueing it
// for the worker (3.4 catches only an answer with a response; a connection error fails the job there).
// No assertions: the session judges (status 4 "Error" with a `<agency>_failedMsg` row, and the worker's exit).
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, record} = require('../../../probe');

const DRIVER = path.resolve(__dirname, 'cli-deposit.php');

function php(app, args, timeout) {
    return execFileSync('php', args, {
        cwd: path.resolve(app.root),
        env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.configFile)},
        encoding: 'utf8',
        timeout,
    }).trim();
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('cli-deposit-dataset.js runs on a dataset fleet (fleet-prep --dataset)');
    const agencies = app.name === 'ojs' ? ['crossrefplugin', 'dataciteplugin'] : ['crossrefplugin'];
    for (const [n, agency] of agencies.entries()) {
        const ctx = app.contextPath;
        const setup = JSON.parse(php(app, [DRIVER, 'setup', ctx, agency, String(n)]));
        const sid = String(setup.submissionId);
        const STUB = process.env.STUB;
        const before = JSON.parse(php(app, STUB ? [DRIVER, 'stub', ctx, sid, STUB] : [DRIVER, 'dispatch', ctx, sid]));
        const started = Date.now();
        let worker = '';
        let workerHung = false;
        if (!STUB) try {
            worker = php(app, ['lib/pkp/tools/jobs.php', 'work', '--stop-when-empty'], 120000);
        } catch (e) {
            workerHung = e.code === 'ETIMEDOUT' || e.signal === 'SIGTERM';
            worker = String(e.stdout || '') + String(e.message || '').slice(0, 300);
        }
        const workerSeconds = Math.round((Date.now() - started) / 1000);
        const after = JSON.parse(php(app, [DRIVER, 'read', ctx, sid]));
        record(`deposit-${agency}`, {ctx, sid, setup, before, workerHung, workerSeconds, worker, after});
        console.log(`[${app.name} ${agency}]`, JSON.stringify({sid, agencyNow: setup.agencyNow, agencyUsed: before.agency, handled: before.handled, schemaHasFailedMsg: before.schemaHasFailedMsg, workerHung, workerSeconds,
            status: after.dois.map((x) => x.status), settings: after.doiSettings.map((x) => `${x.setting_name}: ${String(x.setting_value).slice(0, 90)}`), failedJobs: after.failedJobs}));
    }
});
