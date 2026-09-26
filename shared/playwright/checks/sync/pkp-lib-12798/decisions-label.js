// pkp/pkp-lib#12798 (rr12798 S1, 2026-09-26): the decisions API label of a recorded "Move to Review"
// (BackFromCopyediting) after the review round it reopened is cancelled. Fixed when the
// second read still says "Move to Review". Run: PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js ojs <this file>
const path = require('path');
const {request: pwRequest} = require('playwright');
const {forEachApp, launch, signIn, record, idle, settled, tag} = require('../../../probe');

async function makeKey(app, page, ctxPath) {
    await page.goto(app.url(`/index.php/${ctxPath}/user/profile`));
    await idle(page);
    await page.locator('#profileTabs > ul > li > a[name="apiSettings"]').click();
    await idle(page);
    const form = page.locator('form#apiProfileForm');
    await form.waitFor({state: 'visible', timeout: 30_000});
    const create = form.getByRole('button', {name: 'Create API Key', exact: true});
    if (await create.count()) {
        const saved = page.waitForResponse((r) => r.url().includes('profile-tab') && r.request().method() === 'POST', {timeout: 30_000});
        await create.click();
        await saved;
        await idle(page);
    }
    return settled(page, page.locator('form#apiProfileForm input[name="apiKey"]'));
}

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
        const key = await makeKey(app, page, T);
        out.keyLength = (key || '').length;
        const api = await pwRequest.newContext({baseURL: app.baseURL, extraHTTPHeaders: {Authorization: `Bearer ${key}`}});
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
