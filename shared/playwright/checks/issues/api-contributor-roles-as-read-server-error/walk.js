// Issue report docs/issues/U41-A32-api-contributor-roles-as-read-server-error.md (U41 A32, main): a program that
// edits a contributor through the REST API and sends its "contributorRoles" as the API's own read lists them
// (objects) gets a server error ("Nested arrays may not be passed to whereIn method."), and nothing is saved.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// contributor of lib.js CASES (OJS 7 Domatilia Sokoloff, OMP 1 Arthur Clark, OPS 1 Carlo Corino):
//   steps (default)
//     S0  `api_key_secret` set in the fleet's config; Profile > "API Key" > "Create API Key"; the key.
//     S1  GET the contributor (the shape of contributorRoles). On a line without contributor roles
//         (stable-3_5_0) it records the record's keys and stops.
//     S2  PUT {contributorType, givenName, contributorRoles, affiliations}, each as read but the given name.
//     S3  screens: "Contributors", "Edit" on the contributor (and the "Contributor Roles" ticked).
//     C1  the control, on lib.js CONTROLS (OJS 6 Dana Phillips, OMP 2 Alvin Finkel, OPS 4 Diaga Diouf): S2's
//         PUT with contributorRoles as their ids.
//   neighbour (runs alone; what the fix must leave alone):
//     N1  on CASES: screens: "Edit", given name changed, "Save" (the form sends the roles as ids).
//     N2  on CONTROLS: PUT {contributorType, givenName, contributorRoles: []} (must stay refused).
//     N3  on CONTROLS: the same with contributorRoles ["AUTHOR"] and [{id: [1]}] (values that are not ids).
// Each outcome is read in the answer, in the stored rows and on the "Edit" form. The kit builds nothing.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-contributor-roles-as-read-server-error/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour), with fix.diff applied or not.
const {forEachApp, launch, signIn, record, serverLog, sql} = require('../../../probe');
const K = require('./lib.js');

const mode = process.argv[2] || 'steps';

/** The contributor's stored contributor roles (identifier), on a line that has them. */
function storedRoles(app, id) {
    if (sql(app, `select to_regclass('contributor_roles') is not null`) !== 't') return '(no table)';
    return sql(app, `select r.contributor_role_identifier from credit_contributor_roles c join contributor_roles r on r.contributor_role_id = c.contributor_role_id where c.contributor_id = ${id} order by 1`)
        .split('\n')
        .filter(Boolean);
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
    const now = (id) => ({...K.stored(app, id), roles: storedRoles(app, id)});
    fact('contributors', {case: c, control: y});
    fact('stored at start', {case: now(c.id), control: now(y.id)});
    try {
        fact('S0 api_key_secret', K.setApiKeySecret(app));
        await signIn(page, 'dbarnes');
        let token = null;
        await part('S0', async () => {
            token = await K.createApiKey(page, app);
            fact('S0 API key', token ? `${token.length} characters` : null);
        });
        if (!token) return;
        const g = K.curl('GET', c.url, token);
        fact('S1 GET', {status: g.status, contributorRoles: g.json && g.json.contributorRoles, keys: g.json && Object.keys(g.json)});
        if (!g.json || !('contributorRoles' in g.json)) return fact('S1 contributorRoles', 'absent from the record');
        const ids = (rs) => rs.map((r) => r.id);

        if (mode === 'steps') {
            await part('S2', async () => {
                const body = {contributorType: g.json.contributorType, givenName: {...g.json.givenName, en: `${c.given} h21b`}, contributorRoles: g.json.contributorRoles, affiliations: g.json.affiliations};
                fact('S2 body', body);
                fact('S2 PUT', K.answer(K.curl('PUT', c.url, token, body)));
                fact('S2 stored', now(c.id));
            });
            await part('S3', async () => fact('S3 form', await K.readForm(page, wf, c, 'a32r-S3', run)));
            await part('C1', async () => {
                const gy = K.curl('GET', y.url, token);
                const body = {contributorType: gy.json.contributorType, givenName: {...gy.json.givenName, en: `${y.given} h21b`}, contributorRoles: ids(gy.json.contributorRoles), affiliations: gy.json.affiliations};
                fact('C1 body', body);
                fact('C1 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                fact('C1 stored', now(y.id));
            });
        } else if (mode === 'neighbour') {
            await part('N1', async () => {
                await page.reload();
                await K.openContributors(wf, page, c.sub);
                const dlg = await K.openEdit(page, wf, c);
                await dlg.locator('input[name="givenName-en"]').fill(`${c.given} h21b form`);
                fact('N1 Save', await K.pressSave(page, dlg));
                fact('N1 stored', now(c.id));
            });
            await part('N2', async () => {
                const gy = K.curl('GET', y.url, token);
                const body = {contributorType: gy.json.contributorType, givenName: {...gy.json.givenName, en: `${y.given} h21b`}, contributorRoles: [], affiliations: gy.json.affiliations};
                fact('N2 body', body);
                fact('N2 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                fact('N2 stored', now(y.id));
            });
            await part('N3', async () => {
                // values that are not role ids: a role's identifier, and a record whose id is not a number
                for (const [k, roles] of [['N3a', ['AUTHOR']], ['N3b', [{id: [1]}]]]) {
                    const gy = K.curl('GET', y.url, token);
                    const body = {contributorType: gy.json.contributorType, givenName: {...gy.json.givenName, en: `${y.given} Test`}, contributorRoles: roles, affiliations: gy.json.affiliations};
                    fact(`${k} contributorRoles`, roles);
                    fact(`${k} PUT`, K.answer(K.curl('PUT', y.url, token, body)));
                    fact(`${k} stored`, now(y.id));
                }
            });
        }
    } finally {
        fact('server log', log.since(from).slice(-12).map((l) => K.flat(l, 300)));
        record(`a32r-${mode}-facts${run}`, facts);
        await close();
    }
});
