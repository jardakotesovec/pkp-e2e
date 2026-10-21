// Issue report docs/issues/U41-A32-api-contributor-read-empty-flags-refused.md (U41 A32): a program that reads a
// contributor through the REST API and sends the record back with one change is refused, "This field must be
// true or false.", for the empty ORCID-request flag the read itself gave (on a press in 3.5 also the empty
// volume-editor flag); nothing is saved.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// contributor of lib.js CASES (OJS 7 Domatilia Sokoloff, OMP 1 Arthur Clark, OPS 1 Carlo Corino):
//   steps (default)
//     S0  `api_key_secret` set in the fleet's config; Profile > "API Key" > "Create API Key"; the key.
//     S1  GET the contributor: its null fields.
//     S2  PUT the record as read with the given name changed; on `main` its contributorRoles as their ids
//         (the objects the read lists answer a server error: the sibling report on contributorRoles).
//     S3  screens: "Contributors", "Edit" on the contributor.
//     C1  the control, on lib.js CONTROLS (OJS 6 Dana Phillips, OMP 2 Alvin Finkel, OPS 4 Diaga Diouf): S2's
//         PUT without the fields whose value is null.
//   neighbour (runs alone; what the fix must leave alone), on CONTROLS:
//     N1  PUT {givenName, orcidVerificationRequested: "maybe"} (and on a press in 3.5 isVolumeEditor: "maybe"):
//         a value that is not true, false or empty must stay refused.
//     N2  on CASES: screens: "Edit", given name changed, "Save" (the form's own edit).
// Each outcome is read in the answer, in the stored rows and on the "Edit" form. The kit builds nothing.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-contributor-read-empty-flags-refused/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour), with fix.diff applied or not.
const {forEachApp, launch, signIn, record, serverLog} = require('../../../probe');
const K = require('./lib.js');

const mode = process.argv[2] || 'steps';

/** The record as read, ready to send back: the roles as their ids where the record lists them as objects. */
function asSent(json) {
    const body = {...json};
    if (Array.isArray(body.contributorRoles)) body.contributorRoles = body.contributorRoles.map((r) => (r && typeof r === 'object' ? r.id : r));
    return body;
}

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const facts = {app: app.name, line: app.line || 'main', mode, run: process.env.PROBE_RUN || null};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${K.flat(JSON.stringify(v), 1800)}`);
    };
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    const part = async (key, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`${key} error`, K.flat(e.message, 500));
        }
    };
    const wf = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: app.name === 'ops' ? 'Preprint' : 'Publication'}});
    const c = K.resolve(app);
    const y = K.resolve(app, true);
    fact('contributors', {case: c, control: y});
    fact('stored at start', {case: K.stored(app, c.id), control: K.stored(app, y.id)});
    try {
        fact('S0 api_key_secret', K.setApiKeySecret(app));
        await signIn(page, 'dbarnes');
        let token = null;
        await part('S0', async () => {
            token = await K.createApiKey(page, app);
            fact('S0 API key', token ? `${token.length} characters` : null);
        });
        if (!token) return;

        if (mode === 'steps') {
            const g = K.curl('GET', c.url, token);
            fact('S1 GET', {status: g.status, nullKeys: g.json && Object.keys(g.json).filter((k) => g.json[k] === null), contributorRoles: g.json && g.json.contributorRoles});
            record(`a32f-S1-get${run}`, g.json);
            await part('S2', async () => {
                const body = asSent(g.json);
                body.givenName = {...g.json.givenName, en: `${c.given} h21b`};
                fact('S2 body (keys)', Object.keys(body));
                fact('S2 PUT', K.answer(K.curl('PUT', c.url, token, body)));
                fact('S2 stored', K.stored(app, c.id));
            });
            await part('S3', async () => fact('S3 form', await K.readForm(page, wf, c, 'a32f-S3', run)));
            await part('C1', async () => {
                const gy = K.curl('GET', y.url, token);
                const body = Object.fromEntries(Object.entries(asSent(gy.json)).filter(([, v]) => v !== null));
                body.givenName = {...gy.json.givenName, en: `${y.given} h21b`};
                fact('C1 left out', Object.keys(gy.json).filter((k) => gy.json[k] === null));
                fact('C1 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                fact('C1 stored', K.stored(app, y.id));
            });
        } else if (mode === 'neighbour') {
            await part('N1', async () => {
                const gy = K.curl('GET', y.url, token);
                const body = {givenName: {...gy.json.givenName, en: `${y.given} h21b`}, affiliations: gy.json.affiliations, orcidVerificationRequested: 'maybe'};
                if ('contributorType' in gy.json) body.contributorType = gy.json.contributorType;
                if ('isVolumeEditor' in gy.json) body.isVolumeEditor = 'maybe';
                fact('N1 body', body);
                fact('N1 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                fact('N1 stored', K.stored(app, y.id));
            });
            await part('N2', async () => {
                await page.reload();
                await K.openContributors(wf, page, c.sub);
                const dlg = await K.openEdit(page, wf, c);
                await dlg.locator('input[name="givenName-en"]').fill(`${c.given} h21b form`);
                fact('N2 Save', await K.pressSave(page, dlg));
                fact('N2 stored', K.stored(app, c.id));
            });
        }
    } finally {
        fact('server log', log.since(from).slice(-12).map((l) => K.flat(l, 300)));
        record(`a32f-${mode}-facts${run}`, facts);
        await close();
    }
});
