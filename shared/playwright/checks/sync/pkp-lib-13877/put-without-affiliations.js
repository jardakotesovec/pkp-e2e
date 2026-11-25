// Fix check — pkp/pkp-lib#13877 (a contributor `PUT` without `affiliations` deletes the
// contributor's affiliations; on stable-3_5_0 also `Undefined array key "affiliations"` and a
// `foreach()` warning), its first fix PR pkp/pkp-lib#13878 (`stable-3_5_0`, bozana, 2026-11-25).
//
// Steps, through the REST API as the journal's manager (the screens always send the key):
//   1. `PUT …/publications/{p}/contributors/{a}` with `affiliations: [{authorId, name: {en: "Alpha
//      University"}}]` → stored (the setup);
//   2. the same `PUT` with only `givenName` changed, no `affiliations` key → read back;
//   3. a `PUT` with `affiliations: []` → read back (the issue: an empty list still removes them);
//   4. a `POST …/contributors` with no `affiliations` (and no `orcid`) key → status, read back.
// The server log lines written during each step are kept with it.
//
// Fleet: a campaign fleet, freshly reset (a scratch journal, its manager and one submission):
//   PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature sync-3_5 --reset --apps ojs
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=sync-3_5 PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13877/put-without-affiliations.js
// The base is the checkout's `lib/pkp`; the head is the same with `lib/pkp` at the PR's commit
// (`git checkout 2448d0c37a` inside it, then back). 3.5 only: on `main` a `POST` needs
// `contributorType` and contributor roles, and #13878 does not reach `main`.
//
// Reads fixed when: step 2's read-back keeps "Alpha University" with step 1's id, step 3's is [],
// step 4 answers 200, and no step logs a warning. At 3.5 `c12634c45a` (the base) step 2 reads []
// with `Undefined array key "affiliations"` and `foreach() argument must be of type array|object`.
//
// Facts: put-without-affiliations-<app>.json.
const {forEachApp, launch, signIn, idle, record, apiAs, sql, tag, serverLog} = require('../../../probe');

forEachApp(async (app) => {
    const t = tag('r13877');
    const facts = {line: app.line, libPkp: null, steps: {}};
    facts.libPkp = require('child_process').execFileSync('git', ['-C', `${app.root}/lib/pkp`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Affiliations ${t}`});
    const submissionId = S.submissionId;
    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${submissionId}`));
    const authorId = Number(sql(app, `select author_id from authors where publication_id = ${publicationId} order by seq, author_id limit 1`));
    const contextId = Number(sql(app, `select journal_id from journals where path = '${t}'`));
    const authorGroup = Number(sql(app, `select user_group_id from user_groups where context_id = ${contextId} and role_id = 65536 order by user_group_id limit 1`));
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const base = `submissions/${submissionId}/publications/${publicationId}/contributors`;
    const read = async (id) => {
        const r = await apiAs(page, 'GET', `${base}/${id}`);
        const a = await r.json();
        return {status: r.status(), givenName: a.givenName, affiliations: (a.affiliations || []).map((x) => ({id: x.id, name: x.name}))};
    };
    const step = async (name, method, path, body, id) => {
        const from = log.mark();
        const r = await apiAs(page, method, path, body);
        let json = null;
        try { json = await r.json(); } catch (e) { json = null; }
        const newId = id || (json && json.id);
        facts.steps[name] = {status: r.status(), errors: r.status() >= 400 ? json : undefined, readBack: newId ? await read(newId) : null, log: log.since(from)};
        return newId;
    };
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${submissionId}`));
        await idle(page);
        await step('1-setup', 'PUT', `${base}/${authorId}`, {affiliations: [{authorId, name: {en: 'Alpha University'}}]}, authorId);
        await step('2-put-without-key', 'PUT', `${base}/${authorId}`, {givenName: {en: 'Adah'}}, authorId);
        await step('3-put-empty-list', 'PUT', `${base}/${authorId}`, {affiliations: []}, authorId);
        await step('4-post-without-key', 'POST', base, {givenName: {en: 'Ben'}, familyName: {en: 'Second'}, email: `${t}b2@mail.test`, country: 'CA', userGroupId: authorGroup, includeInBrowse: true});
    } finally {
        record('put-without-affiliations', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
