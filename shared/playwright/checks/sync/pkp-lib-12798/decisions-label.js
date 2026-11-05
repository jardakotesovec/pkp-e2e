// pkp/pkp-lib#12798 (rr12798 S1, 2026-09-26): the decisions API label of a recorded "Move to Review"
// (BackFromCopyediting) after the review round it reopened is cancelled. Fixed when the
// second read still says "Move to Review". Run: PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js ojs <this file>
const {forEachApp, launch, signIn, record, idle, tag} = require('../../../probe');

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('rr12798');
    const ctx = await app.api.createContext({tag: T, users: [
        {username: `${T}mgr`, roles: ['manager'], givenName: 'Meg', familyName: `Mgr${T}`},
        {username: `${T}aut`, roles: ['author'], givenName: 'Au', familyName: `Thor${T}`},
    ]});
    const sub = await app.api.createSubmission({tag: `${T}s`, context: T, submitter: `${T}aut`, title: `RR12798 S1 ${T}`,
        decisions: ['sendExternalReview', 'accept', 'backFromCopyediting']});
    const out = {tag: T, ctx: {id: ctx.id || ctx.contextId, path: T}, seed: sub};
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${T}mgr`, {contextPath: T});
        // The browser session, not an API key: dataset fleets carry no api_key_secret (2026-11-05).
        await page.goto(app.url(`/index.php/${T}/dashboard/editorial`));
        await idle(page);
        const csrf = await page.evaluate(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken);
        out.csrf = !!csrf;
        const api = {get: (u) => page.request.get(app.url(u)), post: (u, o) => page.request.post(app.url(u), {...o, headers: {'X-Csrf-Token': csrf}}), dispose: async () => {}};
        const base = `/index.php/${T}/api/v1`;
        const sid = sub.submissionId || sub.id || (sub.submission && sub.submission.id);
        out.submissionId = sid;
        const j = async (r) => ({status: r.status(), body: await r.json().catch(async () => (await r.text()).slice(0, 400))});
        const decs = (b) => Array.isArray(b) ? b.map((d) => ({id: d.id, decision: d.decision, stageId: d.stageId, reviewRoundId: d.reviewRoundId, label: d.label})) : b;
        const s0 = await j(await api.get(`${base}/submissions/${sid}`));
        out.before = {stageId: s0.body.stageId, reviewRounds: (s0.body.reviewRounds || []).map((r) => ({id: r.id, round: r.round, stageId: r.stageId, status: r.status})),
            availableEditorialDecisions: s0.body.availableEditorialDecisions};
        const d0 = await j(await api.get(`${base}/submissions/${sid}/decisions`));
        out.decisionsBefore = {status: d0.status, rows: decs(d0.body)};
        const rr = out.before.reviewRounds.find((r) => r.stageId === 3);
        const c = await j(await api.post(`${base}/submissions/${sid}/decisions`, {data: {decision: 31, reviewRoundId: rr && rr.id}}));
        out.cancel = {status: c.status, body: c.body && c.body.label !== undefined ? {decision: c.body.decision, label: c.body.label} : c.body};
        const s1 = await j(await api.get(`${base}/submissions/${sid}`));
        out.after = {stageId: s1.body.stageId, reviewRounds: (s1.body.reviewRounds || []).map((r) => ({id: r.id, round: r.round, stageId: r.stageId}))};
        const d1 = await j(await api.get(`${base}/submissions/${sid}/decisions`));
        out.decisionsAfter = {status: d1.status, rows: decs(d1.body)};
        record('s1', out);
        console.log(JSON.stringify(out, null, 1));
        await api.dispose();
    } finally {
        await close();
    }
});
