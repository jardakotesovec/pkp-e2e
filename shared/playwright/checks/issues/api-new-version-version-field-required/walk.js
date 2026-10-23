// Issue report docs/issues/U49-A17-api-new-version-version-field-required.md (U49 A17): a version created through the
// REST API (POST …/submissions/{id}/publications) with the fields the API reference lists is refused with
// {"version":["This field is required."]} on `main`, where a publication has no `version` any more; sent with any
// number, the request goes through and the number is dropped. No screen sends this request.
//
// On a dataset fleet freshly reset to PKP's default test dataset, as `dbarnes` on `publicknowledge`, the
// published submission of lib.js CASES (OJS 17, OMP 14, OPS 2):
//   steps (default)
//     S0  `api_key_secret` set in the fleet's config; Profile › "API Key" › "Create API Key".
//     S1  screens: the submission's workflow, its side menu (the versions).
//     S2  GET the submission's current publication (title, abstract, section / series; is there a `version`?).
//     S3  POST …/publications with that title, abstract and section / series, nothing else.
//     S4  the same with "version": 2 (3.5: the current version + 1).
//     S5  GET the publication S4 created: its `version`, versionStage, versionMajor/Minor, versionString.
//     S6  screens: the workflow again, its side menu.
//   neighbour (runs alone, from a fresh reset; what the fix must leave alone):
//     N1  screens: "Create New Version" (Major Revision), which sends POST …/publications/{id}/version.
//     N2  POST …/publications with "version": 2 (a client written for 3.5): still accepted, the number ignored.
//     N3  POST …/publications without the title (all apps) and without sectionId (OJS, OPS): still refused.
//     N4  PUT …/publications/{N2's id} with a new title alone.
// The kit builds nothing: everything is the dataset's, the screens' or the requests above.
//
// Reset first:  npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run:          PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js <app|all> shared/playwright/checks/issues/api-new-version-version-field-required/walk.js [steps|neighbour]
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
            await shot(page, `a17-${key}-error${run}`).catch(() => {});
        }
    };
    const api = (p) => app.url(`/index.php/${app.contextPath}/api/v1/${p}`);
    let token = null;
    let current = null;
    const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
    const pick = (j) => j && {id: j.id, hasVersionKey: Object.prototype.hasOwnProperty.call(j, 'version'), version: j.version, versionStage: j.versionStage, versionMajor: j.versionMajor, versionMinor: j.versionMinor, versionString: j.versionString, publicationStatus: j.status};

    /** A create request: the current version's title, abstract and section / series, then `extra`, less `drop`. */
    const addPublication = (key, extra = {}, drop = []) => {
        const body = {title: current.title, abstract: current.abstract, [sectionKey]: current[sectionKey], ...extra};
        for (const k of drop) delete body[k];
        const before = K.versions(app, c.id);
        const from = log.mark();
        const r = K.curl('POST', api(`submissions/${c.id}/publications`), token, body);
        const after = K.versions(app, c.id);
        fact(key, {sent: Object.keys(body), extra, answer: r.status === 200 ? {status: 200, body: pick(r.json)} : K.answer(r), versions: `${before.length} → ${after.length}`, newest: after[after.length - 1], serverLog: log.since(from).map(K.logHead)});
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
        fact('S2 GET current publication', {submission: sub.status, currentPublicationId: pid, publication: pub && pub.status, title: current && current.title, [sectionKey]: current && current[sectionKey], ...pick(current)});
    };
    const menu = async (key) => {
        fact(`${key} side menu`, await K.workflowMenu(page, app, c.id, idle));
        fact(`${key} stored versions`, K.versions(app, c.id));
        record(`a17-${key}-workflow${run}`, await screen(page));
        await shot(page, `a17-${key}-workflow${run}`);
    };
    const versionNumber = () => (legacy ? {version: (current.version || 1) + 1} : {version: 2});

    try {
        if (mode === 'steps') {
            await part('S0', setup);
            if (!token || !current) return;
            await part('S1', () => menu('S1'));
            await part('S3', async () => addPublication('S3 POST title, abstract, section only'));
            let created = null;
            await part('S4', async () => {
                const r = addPublication(`S4 POST with "version": ${versionNumber().version}`, versionNumber());
                created = r.json && r.json.id;
            });
            if (created) {
                await part('S5', async () => {
                    const r = K.curl('GET', api(`submissions/${c.id}/publications/${created}`), token);
                    fact('S5 GET new publication', {status: r.status, ...pick(r.json)});
                });
            }
            await part('S6', () => menu('S6'));
        } else if (mode === 'neighbour') {
            await part('N0', setup);
            if (!token || !current) return;
            const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
            const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: c.group}});
            await part('N1', async () => {
                await K.workflowMenu(page, app, c.id, idle);
                fact('N1 "Create New Version"', await K.createVersion(page, frame, 'Major Revision'));
                fact('N1 stored versions', K.versions(app, c.id));
                record(`a17-N1-created${run}`, await screen(page));
                await shot(page, `a17-N1-created${run}`);
            });
            let created = null;
            await part('N2', async () => {
                const r = addPublication('N2 POST with "version": 2', versionNumber());
                created = r.json && r.json.id;
            });
            await part('N3', async () => {
                addPublication('N3 POST without title', {}, ['title']);
                if (c.required) addPublication(`N3 POST without ${c.required}`, {}, [c.required]);
            });
            if (created) {
                await part('N4', async () => {
                    const from = log.mark();
                    const r = K.curl('PUT', api(`submissions/${c.id}/publications/${created}`), token, {title: {...current.title, en: `${current.title.en} hkq23n`}});
                    fact('N4 PUT title alone', {status: r.status, title: r.json && r.json.title && r.json.title.en, body: r.status === 200 ? undefined : K.answer(r), serverLog: log.since(from).map(K.logHead)});
                });
            }
        }
    } finally {
        record(`a17-${mode}${run}`, facts);
        await close();
    }
});
