// PR review check — pkp/pkp-lib#13593 on `main`: pkp-lib#13620 + ojs#5985. The PR adds
//   GET {submissionId}/{reviewRoundId}/authorResponse/{responseId}             (assigned authors and editors, managers, admins)
//   PUT {submissionId}/{reviewRoundId}/authorResponse/{responseId}/completion  {markAs: completed|reverted} (assigned editors, managers, admins)
// on the journal's `reviews` API, `dateCompleted`, `dateReverted` and `statusChangedByUser` in the response's data,
// and lists a round's response in the open peer review record (`peerReviews/open/submissions/{id}`) only when it
// is public and completed (U30 A10's fix rides along: a response that is not public stays out).
//
// On PKP's default test dataset (a dataset fleet, freshly reset before each run), OJS only. The round is set up on
// screen with the kept walk of U30 A10 (its lib.js): on submission 1's Review round 1 the editor dbarnes makes the
// reviews public (MODE=public: all three; MODE=mixed: Aisla McCrae's only), the three reviewers submit, dbarnes marks
// them complete, requests the response, amwandenga submits it. Then, by API with each user's session:
//   12 the record signed out (no completion yet)
//   13 GET as dbarnes (manager), dbuskins (assigned section editor), amwandenga (assigned author), minoue (section
//      editor not assigned), ccorino (author of another submission), amccrae (reviewer), signed out; mismatched ids
//   14 PUT completion refused: amwandenga, minoue, a bad markAs, another submission's round
//   15 PUT completed by dbuskins; the record; GET as amwandenga
//   16 PUT reverted by dbarnes; the record
//   17 PUT completed again by dbarnes; the record
// At the PR base the two routes do not exist (the requests answer 404) and the record lists the response from step 12.
// Facts go to <MODE>-<app>.json; no assertions.
//
//   npm run fleet-prep -- --feature pr13593 --dataset 1 --reset --apps ojs
//   PROBE_FEATURE=pr13593 PROBE_AGENT=<id> MODE=public|mixed node bin/probe.js ojs \
//       shared/playwright/checks/sync/pkp-lib-13620/completion.js
const {request: pwRequest} = require('@playwright/test');
const {forEachApp, launch, signIn, signOut, record, serverLog, sql} = require('../../../probe');
const L = require('../../issues/public-review-data-unpublic-author-response/lib');

const MODE = process.env.MODE || 'public';
const SUB = 1, ROUND = 1, OTHER_SUB = 2;
const AUTHOR = {user: 'amwandenga', name: 'Alan Mwandenga'};
const REVIEWERS = [
    {user: 'amccrae', name: 'Aisla McCrae', comment: 'pr13593 public review by Aisla McCrae'},
    {user: 'jjanssen', name: 'Julie Janssen', comment: 'pr13593 review by Julie Janssen'},
    {user: 'agallego', name: 'Adela Gallego', comment: 'pr13593 review by Adela Gallego'},
];
const RESPONSE = 'pr13593 our response to the three reviews';

forEachApp(async (app) => {
    if (app.name !== 'ojs') { console.log(`[c] ${app.name}: OJS only`); return; }
    const out = {app: app.name, dataset: app.dataset, mode: MODE, startedAt: new Date().toISOString(), steps: {}};
    const {page, close} = await launch(app);
    const log = serverLog(app);
    async function step(name, fn) {
        const from = log.mark();
        try { out.steps[name] = await fn(); }
        catch (e) { out.steps[name] = {failed: L.flat(e.stack || e.message, 900)}; }
        const errs = log.since(from);
        if (errs.length) out.steps[name] = {...out.steps[name], serverErrors: errs.slice(0, 5).map((x) => L.flat(x, 400))};
        console.log(`[c] ${name}:`, JSON.stringify(out.steps[name]).slice(0, 700));
        return out.steps[name];
    }
    // Every API call runs with the session of the user signed in on `page` (or none).
    async function api(user, method, p, data) {
        let ctx = null, csrf = null;
        if (user) {
            await signIn(page, user, {contextPath: app.contextPath});
            await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard`));
            csrf = await page.evaluate(() => window.pkp && pkp.currentUser && pkp.currentUser.csrfToken).catch(() => null);
        } else {
            ctx = await pwRequest.newContext({baseURL: app.baseURL});
        }
        const req = user ? page.request : ctx;
        const url = user ? app.url(`/index.php/${app.contextPath}/api/v1/${p}`) : `/index.php/${app.contextPath}/api/v1/${p}`;
        const r = await req.fetch(url, {method, data, headers: csrf ? {'X-Csrf-Token': csrf} : {}});
        const text = await r.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) { /* not json */ }
        if (ctx) await ctx.dispose();
        if (user) await signOut(page);
        const keep = json && typeof json === 'object' && 'id' in json
            ? {id: json.id, reviewRoundId: json.reviewRoundId, isPublic: json.isPublic, dateCompleted: json.dateCompleted,
                dateReverted: json.dateReverted, statusChangedByUser: json.statusChangedByUser, response: json.response && L.plain(Object.values(json.response)[0])}
            : (json || L.flat(text, 200));
        return {as: user || 'signed out', request: `${method} ${p}`, status: r.status(), body: keep};
    }
    async function openRecord() {
        const res = await L.signedOutGet(app, `api/v1/peerReviews/open/submissions/${SUB}`);
        const rounds = (res.json && res.json.reviewRounds) || [];
        return {status: res.status, rounds: rounds.map((r) => ({roundId: r.roundId, reviews: (r.reviews || []).length,
            authorResponse: r.authorResponse ? {id: r.authorResponse.id, isPublic: r.authorResponse.isPublic,
                dateCompleted: r.authorResponse.dateCompleted, response: L.plain(Object.values(r.authorResponse.response || {})[0])} : null}))};
    }

    try {
        const rid = L.roundId(app, SUB, ROUND);
        const otherRid = L.roundId(app, OTHER_SUB, 1);
        out.ids = {rid, otherRid};
        const publicOnes = MODE === 'mixed' ? REVIEWERS.slice(0, 1) : REVIEWERS;
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        for (const r of publicOnes) await step(`2 public ${r.user}`, () => L.makePublic(page, app, SUB, rid, r.name).then((x) => ({checked: x.publicBoxChecked})));
        await signOut(page);
        for (const r of REVIEWERS) {
            await signIn(page, r.user, {contextPath: app.contextPath});
            await step(`3 review ${r.user}`, () => L.submitReview(page, app, SUB, r.comment).then(() => ({submitted: true})));
            await signOut(page);
        }
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        for (const r of REVIEWERS) await step(`4 complete ${r.user}`, () => L.readAndComplete(page, app, SUB, rid, r.name).then(() => ({done: true})));
        await step('5 request', async () => { await L.openRound(page, app, SUB, rid); return L.sendRequest(page, app).then((x) => ({post: x.post})); });
        await signOut(page);
        await signIn(page, AUTHOR.user, {contextPath: app.contextPath});
        await step('6 respond', () => L.respond(page, app, SUB, rid, AUTHOR.name, RESPONSE).then((x) => ({post: x.post})));
        await signOut(page);
        const resp = Number(sql(app, `SELECT response_id FROM review_round_author_responses WHERE review_round_id = ${rid}`));
        out.ids.response = resp;
        const base = `reviews/${SUB}/${rid}/authorResponse/${resp}`;

        await step('12 record, not completed', openRecord);
        for (const u of ['dbarnes', 'dbuskins', AUTHOR.user, 'minoue', 'ccorino', 'amccrae', null]) await step(`13 GET ${u || 'signed out'}`, () => api(u, 'GET', base));
        await step('13 GET other submission round', () => api('dbarnes', 'GET', `reviews/${SUB}/${otherRid}/authorResponse/${resp}`));
        await step('13 GET round under other submission', () => api('dbarnes', 'GET', `reviews/${OTHER_SUB}/${rid}/authorResponse/${resp}`));
        await step('14 PUT author', () => api(AUTHOR.user, 'PUT', `${base}/completion`, {markAs: 'completed'}));
        await step('14 PUT minoue', () => api('minoue', 'PUT', `${base}/completion`, {markAs: 'completed'}));
        await step('14 PUT bad markAs', () => api('dbarnes', 'PUT', `${base}/completion`, {markAs: 'published'}));
        await step('14 PUT other round', () => api('dbarnes', 'PUT', `reviews/${SUB}/${otherRid}/authorResponse/${resp}/completion`, {markAs: 'completed'}));
        await step('14 record after refusals', openRecord);
        await step('15 PUT completed dbuskins', () => api('dbuskins', 'PUT', `${base}/completion`, {markAs: 'completed'}));
        await step('15 record', openRecord);
        await step('15 GET author', () => api(AUTHOR.user, 'GET', base));
        await step('15 db row', async () => ({rows: sql(app, `SELECT response_id, date_completed IS NOT NULL AS completed, date_reverted IS NOT NULL AS reverted FROM review_round_author_responses WHERE response_id = ${resp}`)}));
        await step('16 PUT reverted dbarnes', () => api('dbarnes', 'PUT', `${base}/completion`, {markAs: 'reverted'}));
        await step('16 record', openRecord);
        await step('17 PUT completed dbarnes', () => api('dbarnes', 'PUT', `${base}/completion`, {markAs: 'completed'}));
        await step('17 record', openRecord);
    } finally {
        out.finishedAt = new Date().toISOString();
        record(MODE, out);
        await close();
    }
});
