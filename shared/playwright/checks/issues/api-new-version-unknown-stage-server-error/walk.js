// Issue report docs/issues/U49-A14-api-new-version-unknown-stage-server-error.md (U49 A14): a version created
// through the REST API (POST …/submissions/{id}/publications) with a version stage the app does not have fails
// with a server error instead of a refusal. Latent on screen: "Create New Version" offers only the app's stages.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// published submission of lib.js CASES (OJS 17, OMP 14, OPS 2):
//   steps (default)
//     S0  `api_key_secret` set in the fleet's config; Profile › "API Key" › "Create API Key".
//     S1  screens: the submission's workflow, its side menu (the versions).
//     S2  GET the submission and its current publication (title, abstract, section / series).
//     S3  POST …/publications with that title, abstract and section, version 2, versionMajor 2, versionMinor 0 and
//         versionStage "XYZ"; the answer, the server log, the versions before and after.
//     S4  the same with each journal stage the app does not have (OPS: "PMUR", "VoR").
//     S5  control: the same with the app's own stage (OJS/OMP "VoR", OPS "AO").
//     S6  screens: the workflow again, its side menu.
//     S7  reach (main): PUT …/publications/{S5's id} with versionStage "XYZ" alone; then with versionIsMinor;
//         then PUT …/publications/{S5's id}/version with "XYZ" and versionIsMinor (the controller's own check).
//     On 3.5 (no stage fields) S3-S5 send `version: n+1` with the same versionStage values; S7 is skipped.
//   neighbour (runs alone, from a fresh reset; what the fix must leave alone): screens "Create New Version"
//         (Major Revision) and the new version's "Publish" / "Post" (a journal's "Review Publishing Details"
//         saves the version stage through the edit request); then the API: POST …/publications with
//         versionStage omitted, null and each of the app's own stages; PUT …/publications/{id} of an
//         unpublished one with a new title alone, with versionStage null, and with the app's own stage and
//         versionIsMinor.
// The kit builds nothing: everything is the dataset's, the screens' or the requests above.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-new-version-unknown-stage-server-error/walk.js [steps|neighbour]
// Fix trial:    PROBE_RUN=fix (steps), nb-in / nb-out (neighbour). Lines: PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35.
const {forEachApp, launch, signIn, screen, shot, record, idle, serverLog} = require('../../../probe');
const K = require('./lib.js');

const mode = process.argv[2] || 'steps';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const line = app.line || 'main';
    const legacy = line !== 'main';
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const c = K.CASES[app.name];
    const facts = {app: app.name, line, mode, run: process.env.PROBE_RUN || null, submission: c.id};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${line} ${k}: ${K.flat(JSON.stringify(v), 1600)}`);
    };
    const log = serverLog(app);
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const part = async (key, fn) => {
        try {
            await fn();
        } catch (e) {
            fact(`${key} error`, K.flat(e.message, 500));
            await shot(page, `a14-${key}-error${run}`).catch(() => {});
        }
    };
    const api = (p) => app.url(`/index.php/${app.contextPath}/api/v1/${p}`);
    let token = null;
    let current = null;
    const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';

    /** A new-version POST with the current version's title, abstract and section, and `stage`. */
    const addVersion = (key, stage) => {
        // `version` is a required property of the publication schema although main stores no such field (the
        // POST answers 400 "This field is required." without it), so the request carries it as on 3.5.
        const body = legacy ? {version: (current.version || 1) + 1} : {version: 2, versionMajor: 2, versionMinor: 0};
        if (stage !== undefined) body.versionStage = stage;
        body[sectionKey] = current[sectionKey];
        body.title = current.title;
        body.abstract = current.abstract;
        const before = K.versions(app, c.id);
        const from = log.mark();
        const r = K.curl('POST', api(`submissions/${c.id}/publications`), token, body);
        const lines = log.since(from).map(K.logHead);
        const after = K.versions(app, c.id);
        fact(key, {versionStage: stage === undefined ? '(omitted)' : stage, sent: Object.keys(body), answer: K.answer(r), versions: `${before.length} → ${after.length}`, newest: after[after.length - 1], serverLog: lines});
        return r;
    };
    /** A PUT with `body` on publication `pid` (`suffix` '' or '/version'). */
    const put = (key, pid, body, suffix = '') => {
        const from = log.mark();
        const r = K.curl('PUT', api(`submissions/${c.id}/publications/${pid}${suffix}`), token, body);
        fact(key, {sent: body, path: `…/publications/${pid}${suffix}`, answer: K.answer(r), serverLog: log.since(from).map(K.logHead), versions: K.versions(app, c.id)});
        return r;
    };
    const setup = async () => {
        fact('S0 api_key_secret', K.setApiKeySecret(app));
        await new Promise((res) => setTimeout(res, 2500));
        await signIn(page, 'dbarnes');
        token = await K.apiKey(page, app);
        fact('S0 API key', token ? `${token.length} characters` : null);
        const sub = K.curl('GET', api(`submissions/${c.id}`), token);
        const pid = sub.json && sub.json.currentPublicationId;
        const pub = pid ? K.curl('GET', api(`submissions/${c.id}/publications/${pid}`), token) : null;
        current = pub && pub.json;
        fact('S2 GET', {submission: sub.status, currentPublicationId: pid, publication: pub && pub.status, title: current && current.title, [sectionKey]: current && current[sectionKey], versionStage: current && current.versionStage, versionString: current && current.versionString, version: current && current.version});
    };

    try {
        if (mode === 'steps') {
            await part('S0', setup);
            if (!token || !current) return;
            await part('S1', async () => {
                fact('S1 side menu', await K.workflowMenu(page, app, c.id, idle));
                fact('S1 stored versions', K.versions(app, c.id));
                record(`a14-S1-workflow${run}`, await screen(page));
                await shot(page, `a14-S1-workflow${run}`);
            });
            await part('S3', async () => addVersion('S3 POST versionStage XYZ', 'XYZ'));
            for (const stage of ['AO', 'PMUR', 'VoR'].filter((s) => !c.own.includes(s))) {
                await part(`S4 ${stage}`, async () => addVersion(`S4 POST versionStage ${stage}`, stage));
            }
            let created = null;
            await part('S5', async () => {
                const r = addVersion(`S5 POST versionStage ${c.control} (control)`, c.control);
                created = r.json && r.json.id;
            });
            await part('S6', async () => {
                fact('S6 side menu', await K.workflowMenu(page, app, c.id, idle));
                record(`a14-S6-workflow${run}`, await screen(page));
                await shot(page, `a14-S6-workflow${run}`);
            });
            if (!legacy && created) {
                await part('S7a', async () => put('S7a PUT publication versionStage XYZ alone', created, {versionStage: 'XYZ'}));
                await part('S7b', async () => put('S7b PUT publication versionStage XYZ + versionIsMinor', created, {versionStage: 'XYZ', versionIsMinor: false}));
                await part('S7c', async () => put('S7c PUT …/version versionStage XYZ + versionIsMinor', created, {versionStage: 'XYZ', versionIsMinor: false}, '/version'));
            }
        } else if (mode === 'neighbour') {
            await part('N0', setup);
            if (!token || !current) return;
            const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
            const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: c.group}});
            await part('N1', async () => {
                await K.workflowMenu(page, app, c.id, idle);
                fact('N1 "Create New Version"', await K.createVersion(page, frame, 'Major Revision'));
                fact('N1 stored versions', K.versions(app, c.id));
            });
            await part('N2', async () => {
                const ojsScreen =
                    app.name === 'ojs' ? new (require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js').PublishScreen)(page, app.contextPath) : null;
                fact(`N2 "${c.post}" requests`, await K.publishLatest(page, frame, c.post, ojsScreen));
                fact('N2 stored versions', K.versions(app, c.id));
                record(`a14-N2-published${run}`, await screen(page));
                await shot(page, `a14-N2-published${run}`);
            });
            let unpublished = null;
            await part('N3', async () => {
                addVersion('N3 POST versionStage omitted', undefined);
                addVersion('N3 POST versionStage null', null);
                for (const stage of c.own) {
                    const r = addVersion(`N3 POST versionStage ${stage}`, stage);
                    if (r.json && r.json.id) unpublished = r.json.id;
                }
            });
            if (unpublished) {
                await part('N4', async () => {
                    put('N4 PUT publication title alone', unpublished, {title: {...current.title, en: `${current.title.en} hkq23a`}});
                    put('N4 PUT publication versionStage null', unpublished, {versionStage: null});
                    put(`N4 PUT publication versionStage ${c.control} + versionIsMinor`, unpublished, {versionStage: c.control, versionIsMinor: true});
                });
            }
        }
    } finally {
        record(`a14-${mode}${run}`, facts);
        await close();
    }
});
