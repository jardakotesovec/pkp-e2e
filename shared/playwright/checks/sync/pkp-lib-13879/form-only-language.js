// Fix check — pkp/pkp-lib#13879 round 3 (`8f429d1760`), the U41 A20 cause through the REST API: a
// journal with fr_CA under "Forms" only (`supportedFormLocales` [en, fr_CA], metadata [en]); as its
// manager, a person's `POST` without `organizationName`, a person's `PUT` with only a given name (with
// and without the type), an organization's `POST` and its `PUT` with only an email. Written by the
// round-1 regression reader (S1 of `.reports/sync/rr13879/suspicions.md`), kept 2026-11-25.
// Read: at `ebbc7ea9b5` each answers 400 `<field>.fr_CA: "This language is not accepted."` (the base
// takes the same path for the typed requests); at `8f429d1760` all 200, no server-log line.
// Run on the sync fleet: PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js ojs <this file>
const {forEachApp, launch, signIn, idle, record, apiAs, sql, tag, serverLog} = require('../../../probe');

forEachApp(async (app) => {
    const t = tag('rr79');
    const facts = {libPkp: require('child_process').execFileSync('git', ['-C', `${app.root}/lib/pkp`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim(), steps: {}};
    await app.api.createContext({tag: t,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en']},
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const ctxId = sql(app, `select journal_id from journals where path = '${t}'`).trim();
    facts.contextLocales = sql(app, `select setting_name, setting_value from journal_settings where journal_id = ${ctxId} and setting_name in ('supportedFormLocales','supportedSubmissionMetadataLocales','supportedLocales')`);
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `Form locales ${t}`});
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
        return {status: r.status(), json, log: log.since(from).map((l) => l.slice(0, 220)).slice(0, 6)};
    };
    const step = async (name, method, path, body) => {
        const r = await call(method, path, body);
        facts.steps[name] = {status: r.status, body: r.status >= 400 ? r.json : {id: r.json && r.json.id, contributorType: r.json && r.json.contributorType, givenName: r.json && r.json.givenName, organizationName: r.json && r.json.organizationName}, log: r.log};
        return r.json && r.json.id;
    };
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${submissionId}`));
        await idle(page);
        const list = await call('GET', base);
        const roles = (list.json.items || [])[0].contributorRoles.map((r) => r.id);
        facts.seededContributor = (list.json.items || [])[0];
        await step('person-add-untouched', 'POST', base, {contributorRoles: roles, contributorType: 'PERSON', givenName: {en: 'Pat'}, familyName: {en: 'Person'}, email: `${t}p@mail.test`, country: 'CA'});
        const p = facts.seededContributor.id;
        await step('person-put-given-only', 'PUT', `${base}/${p}`, {givenName: {en: 'Patricia'}});
        await step('person-put-given-typed', 'PUT', `${base}/${p}`, {contributorType: 'PERSON', givenName: {en: 'Patricia'}});
        await step('person-put-given-typed-orgname-en', 'PUT', `${base}/${p}`, {contributorType: 'PERSON', givenName: {en: 'Patricia'}, organizationName: {en: ''}});
        await step('org-add-untouched', 'POST', base, {contributorRoles: roles, contributorType: 'ORGANIZATION', organizationName: {en: 'Org'}, email: `${t}o@mail.test`, country: 'CA'});
        const o = await step('org-add-all-fields', 'POST', base, {contributorRoles: roles, contributorType: 'ORGANIZATION', organizationName: {en: 'Org'}, givenName: {en: ''}, familyName: {en: ''}, preferredPublicName: {en: ''}, email: `${t}o@mail.test`, country: 'CA'});
        await step('org-put-email-only', 'PUT', `${base}/${o}`, {email: `${t}o2@mail.test`});
    } finally {
        record('s1-form-locales', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
