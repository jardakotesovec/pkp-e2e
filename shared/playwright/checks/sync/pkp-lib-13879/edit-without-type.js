// Fix check — pkp/pkp-lib#13877 on `main`, its fix PR pkp/pkp-lib#13879 (bozana `13877-main`,
// `ebbc7ea9b5` on `8096e67cd2`; PR review, 2026-11-25). The 3.5 half is
// checks/sync/pkp-lib-13877/put-without-affiliations.js.
//
// Steps, through the REST API as the journal's manager, on one submission's contributors:
//   person  added with an email and "Alpha University"; `PUT` with only `givenName` (no type, no
//           affiliations), then `affiliations: []` (U41 A30 and A31's person);
//   org     an organization with an email, a country and "Org Institute"; `PUT` with only `email`
//           (A31's organization: before, a 500 and an unreadable submission);
//   anon    an anonymous contributor; `PUT` with only `country`, then with `contributorType: ANONYMOUS`
//           as the form sends it (A31's anonymous; the server log of the latter);
//   switch  a person with "Beta College" switched to ANONYMOUS with the type sent (affiliations go);
//   typenull a person `PUT` with `contributorType: null` and a given name;
//   post    `POST` with no `contributorType` (the issue: "This field is required.", no warning), and a
//           person `POST` without `affiliations` and `orcid` (200, no warning).
// Each step keeps its status, the answer's errors, the read-back (type, names, email, country,
// affiliations) and the server-log lines written during it; a final `GET …/submissions/{id}` checks
// the submission still reads.
//
// Fleet: the `sync` fleet, freshly reset (a scratch journal, its manager and one submission):
//   npm run fleet-prep -- --feature sync --reset --apps ojs
//   PROBE_FEATURE=sync PROBE_AGENT=r13879 PROBE_RUN=<base|head> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13879/edit-without-type.js
// The base is `lib/pkp` at `8096e67cd2`, the head at `ebbc7ea9b5` (`git checkout` inside it, then back).
//
// Reads fixed when: person keeps "Alpha University" (same id), its type, its email, and takes the
// new given name; `[]` removes them; org answers 200 with its name kept and the new email; anon
// keeps the type and takes the country; the POST without a type answers 400 on `contributorType`;
// no step logs a warning; the submission reads 200.
//
// Read 2026-11-25 (OJS, fresh resets): at the base `8096e67cd2` the person's edits answer 400
// `email: This field is required.`, the organization's 500 `Author::getFullName(): Return value must
// be of type string, null returned` and the submission then reads 500, the anonymous one loses its
// email and country, each with `Undefined array key "contributorType"`; at the head every step
// reads fixed, but `anon-1-country-only`, `anon-2-typed` and `switch-2-to-anonymous` each log
// `foreach() argument must be of type array|object, null given` (`PKPSubmissionController.php:1961`:
// `removeIrrelevantContributorTypeData()` sets `affiliations` to null for ANONYMOUS); with
// `fix-anonymous-affiliations.diff` applied on the head (PROBE_RUN=fix) no step logs anything and the
// switch still removes "Beta College".
//
// Facts: edit-without-type-<run>-<app>.json.
const {forEachApp, launch, signIn, idle, record, apiAs, sql, tag, serverLog} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';

forEachApp(async (app) => {
    const t = tag('r13879');
    const facts = {run: RUN, line: app.line, libPkp: null, steps: {}};
    facts.libPkp = require('child_process').execFileSync('git', ['-C', `${app.root}/lib/pkp`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Contributor type ${t}`});
    const submissionId = S.submissionId;
    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${submissionId}`));
    const log = serverLog(app);
    const {page, close} = await launch(app);
    const base = `submissions/${submissionId}/publications/${publicationId}/contributors`;
    const call = async (method, path, body) => {
        const from = log.mark();
        const r = await apiAs(page, method, path, body);
        let json = null;
        try { json = await r.json(); } catch (e) { json = null; }
        await new Promise((res) => setTimeout(res, 300));
        return {status: r.status(), json, log: log.since(from).map((l) => l.replace(/^\[[^\]]*\]\s*/, '').slice(0, 220)).slice(0, 6)};
    };
    const read = async (id) => {
        const r = await call('GET', `${base}/${id}`);
        const a = r.json || {};
        return {status: r.status, contributorType: a.contributorType, givenName: a.givenName, familyName: a.familyName, organizationName: a.organizationName,
            email: a.email, country: a.country, affiliations: (a.affiliations || []).map((x) => ({id: x.id, name: x.name}))};
    };
    const step = async (name, method, path, body, id) => {
        const r = await call(method, path, body);
        const newId = id || (r.json && r.json.id);
        facts.steps[name] = {status: r.status, errors: r.status >= 400 ? r.json : undefined, readBack: newId && r.status < 500 ? await read(newId) : null, log: r.log};
        return newId;
    };
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${submissionId}`));
        await idle(page);
        const roles = ((await call('GET', base)).json.items || [])[0].contributorRoles.map((r) => r.id);
        const add = async (name, body) => step(name, 'POST', base, {contributorRoles: roles, ...body});

        const p = await add('person-0-add', {contributorType: 'PERSON', givenName: {en: 'Pat'}, familyName: {en: 'Person'}, email: `${t}p@mail.test`, country: 'CA'});
        await step('person-1-set-affiliation', 'PUT', `${base}/${p}`, {contributorType: 'PERSON', affiliations: [{authorId: p, name: {en: 'Alpha University'}}]}, p);
        await step('person-2-given-only', 'PUT', `${base}/${p}`, {givenName: {en: 'Patricia'}}, p);
        await step('person-3-empty-list', 'PUT', `${base}/${p}`, {affiliations: []}, p);

        const o = await add('org-0-add', {contributorType: 'ORGANIZATION', organizationName: {en: 'Wipe Org'}, email: `${t}o@mail.test`, country: 'CA'});
        await step('org-1-set-affiliation', 'PUT', `${base}/${o}`, {contributorType: 'ORGANIZATION', affiliations: [{authorId: o, name: {en: 'Org Institute'}}]}, o);
        await step('org-2-email-only', 'PUT', `${base}/${o}`, {email: `${t}o2@mail.test`}, o);

        const n = await add('anon-0-add', {contributorType: 'ANONYMOUS', email: `${t}n@mail.test`, country: 'CA'});
        await step('anon-1-country-only', 'PUT', `${base}/${n}`, {country: 'DE'}, n);
        await step('anon-2-typed', 'PUT', `${base}/${n}`, {contributorType: 'ANONYMOUS', country: 'FR'}, n);

        const w = await add('switch-0-add', {contributorType: 'PERSON', givenName: {en: 'Sam'}, familyName: {en: 'Switch'}, email: `${t}w@mail.test`, country: 'CA'});
        await step('switch-1-set-affiliation', 'PUT', `${base}/${w}`, {contributorType: 'PERSON', affiliations: [{authorId: w, name: {en: 'Beta College'}}]}, w);
        await step('switch-2-to-anonymous', 'PUT', `${base}/${w}`, {contributorType: 'ANONYMOUS', email: `${t}w@mail.test`, country: 'CA'}, w);

        await step('typenull-1', 'PUT', `${base}/${p}`, {contributorType: null, givenName: {en: 'Nully'}}, p);

        await step('post-no-type', 'POST', base, {contributorRoles: roles, givenName: {en: 'No'}, familyName: {en: 'Type'}, email: `${t}x@mail.test`, country: 'CA'});
        await add('post-person-no-affiliations', {contributorType: 'PERSON', givenName: {en: 'Ben'}, familyName: {en: 'Second'}, email: `${t}b@mail.test`, country: 'CA'});

        const sub = await call('GET', `submissions/${submissionId}`);
        facts.submissionRead = {status: sub.status, log: sub.log};
    } finally {
        record(`edit-without-type-${RUN}`, facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
