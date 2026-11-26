// Kept check of the PR review of pkp-lib#13860 (crossref-ojs#124, ojs#6106, ojs#6107, crossref-ops#81,
// crossref-ops#82): a DOI deposit that fails while the command-line worker runs the queue
// (job_runner Off, `php lib/pkp/tools/jobs.php work`) keeps the agency's error message in doi_settings.
// Run at the PR heads (and at the tips for the before-evidence):
//   PROBE_FEATURE=sync PROBE_AGENT=dep node bin/probe.js ojs,ops shared/playwright/checks/sync/pkp-lib-13860/cli-deposit.js
//   (PKP_E2E_LINE=stable-3_5_0 in front for 3.5)
// One scratch journal or server per agency (OJS: Crossref and DataCite; OPS: Crossref), DOIs on for
// publications, one submitted work, which cli-deposit.php publishes. It then queues the "Deposit DOIs" job, the worker runs it, the test
// config's dead-port proxy makes the deposit fail, and cli-deposit.php reads the DOI's status and settings.
// No assertions: the session judges (the facts are status 4 "Error" and a `<agency>_failedMsg` row).
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, record, tag} = require('../../../probe');

function php(app, args) {
    const root = path.resolve(app.root);
    return execFileSync('php', args, {
        cwd: root,
        env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.configFile)},
        encoding: 'utf8',
    }).trim();
}

const AGENCY = {
    crossrefplugin: {depositorName: 'Dep Depositor', depositorEmail: 'dep.depositor@mail.test', username: 'dep-user', password: 'dep-pass'},
    dataciteplugin: {username: 'DEP.USER', password: 'dep-pass'},
};

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const agencies = app.name === 'ojs' ? ['crossrefplugin', 'dataciteplugin'] : ['crossrefplugin'];
    for (const agency of agencies) {
        const T = tag(`dep${agency.slice(0, 2)}`);
        const mgr = `${T}mgr`;
        await app.api.createContext({
            tag: T,
            users: [{username: mgr, roles: ['manager'], givenName: 'Dana', familyName: 'Depositor'}],
            enableDois: true, doiPrefix: '10.1234', enabledDoiTypes: ['publication'],
            ...(app.name === 'ojs' ? {publisherInstitution: 'Deposit Press', onlineIssn: '1234-5679', issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}),
            plugins: {[agency]: {enabled: true, settings: AGENCY[agency]}},
            registrationAgency: agency,
        });
        const S = await app.api.createSubmission({tag: `${T}w`, context: T, submitter: mgr, title: `Deposit from the worker ${T}`, submitted: true});
        const sid = String(S.submissionId ?? S.id);
        const before = JSON.parse(php(app, [path.resolve(__dirname, 'cli-deposit.php'), 'dispatch', T, sid]));
        const worker = php(app, ['lib/pkp/tools/jobs.php', 'work', '--stop-when-empty=1']);
        const after = JSON.parse(php(app, [path.resolve(__dirname, 'cli-deposit.php'), 'read', T, sid]));
        record(`deposit-${agency}`, {T, sid, before, worker, after});
        console.log(`[${app.name} ${agency}]`, JSON.stringify({queued: before.queued, agencyUsed: before.agency, worker: worker.slice(-600), after}, null, 1));
    }
});
