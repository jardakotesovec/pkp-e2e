// Issue report docs/issues/U41-A31-api-contributor-edit-without-type-empties-contributor.md (U41 A31): on `main`,
// a program that edits a contributor through the REST API without naming "contributorType" gets 200 and the
// contributor's names, email, country and affiliations erased, even when it resends the affiliations.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// contributor of lib.js CASES (OJS 7 Domatilia Sokoloff, OMP 1 Arthur Clark, OPS 1 Carlo Corino):
//   steps (default)
//     S0  `api_key_secret` set in the fleet's config; Profile > "API Key" > "Create API Key"; the key.
//     S1  screens: "Contributors", "Edit" on the contributor, "Close". GET the contributor.
//     S2  PUT {givenName, affiliations as the GET gave them} with the key (no contributorType).
//     S3  screens: reload, "Contributors" (the row), "Edit" on it.
//     C1  the control, on lib.js CONTROLS (OJS 6 Dana Phillips, OMP 2 Alvin Finkel, OPS 4 Diaga Diouf): S2's
//         PUT with contributorType as read added; screens as S3. (3.5 has no contributor types: S2 there is the
//         same request, and C1 is skipped.)
//   neighbour (runs alone; what the fix must leave alone):
//     N1  on CASES: screens: "Edit", given name changed, "Save" (the form's own edit); reload, "Edit".
//     N2  on CONTROLS: PUT {contributorType: "ORGANIZATION", organizationName} (a type change must still clear
//         the person's names), then GET.
//   published (runs alone): on lib.js PUBLISHED (OJS 17, OMP 5, OPS 2, each published): the item's public page
//         (P1), the same edit as S2 with the given name "<given> Test" (P2), the public page again (P3).
// Each outcome is read in the answer, in the stored rows and on the "Edit" form. The kit builds nothing.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-contributor-edit-without-type-empties-contributor/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour), with fix.diff applied or not.
const {forEachApp, launch, signIn, record, serverLog, screen, shot} = require('../../../probe');
const K = require('./lib.js');

const mode = process.argv[2] || 'steps';

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
            await part('S1', async () => fact('S1 form', await K.readForm(page, wf, c, 'a31-S1', run)));
            const g = K.curl('GET', c.url, token);
            const typed = !!(g.json && 'contributorType' in g.json);
            fact('S1 GET', {status: g.status, contributorType: g.json && g.json.contributorType, givenName: g.json && g.json.givenName, affiliations: g.json && g.json.affiliations});
            await part('S2', async () => {
                const body = {givenName: {...g.json.givenName, en: `${c.given} h21b`}, affiliations: g.json.affiliations};
                fact('S2 body', body);
                fact('S2 PUT', K.answer(K.curl('PUT', c.url, token, body)));
                fact('S2 stored', K.stored(app, c.id));
            });
            await part('S3', async () => fact('S3 form', await K.readForm(page, wf, c, 'a31-S3', run)));
            if (typed) {
                await part('C1', async () => {
                    const gy = K.curl('GET', y.url, token);
                    const body = {contributorType: gy.json.contributorType, givenName: {...gy.json.givenName, en: `${y.given} h21b`}, affiliations: gy.json.affiliations};
                    fact('C1 body', body);
                    fact('C1 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                    fact('C1 stored', K.stored(app, y.id));
                    fact('C1 form', await K.readForm(page, wf, y, 'a31-C1', run));
                });
            }
        } else if (mode === 'neighbour') {
            await part('N1', async () => {
                await page.reload();
                await K.openContributors(wf, page, c.sub);
                const dlg = await K.openEdit(page, wf, c);
                await dlg.locator('input[name="givenName-en"]').fill(`${c.given} h21b form`);
                fact('N1 Save', await K.pressSave(page, dlg));
                fact('N1 stored', K.stored(app, c.id));
                fact('N1 form', await K.readForm(page, wf, c, 'a31-N1', run));
            });
            await part('N2', async () => {
                const body = {contributorType: 'ORGANIZATION', organizationName: {en: 'h21b Research Group'}};
                fact('N2 body', body);
                fact('N2 PUT', K.answer(K.curl('PUT', y.url, token, body)));
                const gy = K.curl('GET', y.url, token);
                fact('N2 GET', {status: gy.status, contributorType: gy.json && gy.json.contributorType, organizationName: gy.json && gy.json.organizationName, givenName: gy.json && gy.json.givenName, familyName: gy.json && gy.json.familyName});
                fact('N2 stored', K.stored(app, y.id));
            });
        } else if (mode === 'published') {
            // the same edit on a published item's contributor (an editor may edit a published version), and the
            // item's public page before and after
            const pc = K.resolve(app, 'published');
            fact('P0 contributor', pc);
            const pub = app.url(`/index.php/${app.contextPath}/${pc.page}`);
            const readPage = async (key) => {
                await page.goto(pub);
                await page.waitForLoadState('domcontentloaded');
                const text = await page.locator('body').innerText();
                record(`a31-${key}-page${run}`, await screen(page));
                await shot(page, `a31-${key}-page${run}`);
                return {url: pub, family: text.includes(pc.family), given: text.includes(pc.given), institution: text.includes(pc.institution)};
            };
            await part('P1', async () => fact('P1 public page', await readPage('P1')));
            await part('P2', async () => {
                const g = K.curl('GET', pc.url, token);
                const typed = !!(g.json && 'contributorType' in g.json);
                const body = {givenName: {...g.json.givenName, en: `${pc.given} Test`}};
                fact('P2 body', body);
                fact('P2 PUT', K.answer(K.curl('PUT', pc.url, token, body)));
                fact('P2 stored', K.stored(app, pc.id));
            });
            await part('P3', async () => fact('P3 public page', await readPage('P3')));
        }
    } finally {
        fact('server log', log.since(from).slice(-12).map((l) => K.flat(l, 300)));
        record(`a31-${mode}-facts${run}`, facts);
        await close();
    }
});
