// K1 one-off (harness premise): a context seeded through `plugins.urnpubidplugin` without `urnCheckNo` versus with
// `urnCheckNo: false`; the article's "Identifiers" page of each, and the fields the screen's own form GET answers.
const {forEachApp, launch, signIn, idle, record, shot, tag} = require('../../../probe');
forEachApp(async (app) => {
    if (app.name === 'ops') return;
    const out = {};
    for (const [k, extra] of [['without', {}], ['with', {urnCheckNo: false}]]) {
        const t = tag(`u44k1n${k[0]}`);
        const C = await app.api.createContext({tag: t, users: [{username: `${t}mg`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}],
            plugins: {urnpubidplugin: {enabled: true, settings: {enablePublicationURN: true, urnPrefix: 'urn:nbn:de:0000-', urnSuffix: 'customId', urnResolver: 'https://nbn-resolving.de/', urnNamespace: 'urn:nbn:de', ...extra}}}});
        const sub = await app.api.createSubmission({tag: `${t}s`, context: C.path, submitter: `${t}au`});
        const {page, close} = await launch(app);
        const got = [];
        page.on('response', async (r) => { if (/_components\/identifier/.test(r.url())) { const j = await r.json().catch(() => null); got.push({status: r.status(), fields: j ? (j.fields || []).map((f) => f.name) : null}); } });
        try {
            await signIn(page, `${t}mg`, {contextPath: C.path}); await idle(page);
            await page.goto(app.url(`/index.php/${C.path}/dashboard/editorial?workflowSubmissionId=${sub.submissionId}&workflowMenuKey=publication_${sub.publicationId}_identifiers`));
            await idle(page); await page.waitForTimeout(2500); await idle(page);
            await shot(page, `urnseed-${k}`);
            out[k] = got;
        } finally { await close(); }
    }
    record('urn-seed-checkno', out);
    console.log(app.name, JSON.stringify(out));
});
