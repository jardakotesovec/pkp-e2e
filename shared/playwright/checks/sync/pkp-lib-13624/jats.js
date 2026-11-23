// PR review — jatsTemplate#128 (in ojs#5986) for pkp/pkp-lib#11972: the generated JATS of a
// submission with an organization and an anonymous contributor, both without an email.
// Reads fixed when: no <email> element (empty or not) in either one's <contrib>, and the
// server log has no deprecation or warning for the request.
//   PROBE_FEATURE=sync PROBE_AGENT=r13624 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13624/jats.js
// Facts: jats-<app>.json.
const {forEachApp, launch, signIn, idle, record, apiAs, sql, tag, serverLog} = require('../../../probe');

forEachApp(async (app) => {
    const t = tag('j13624');
    const facts = {};
    await app.api.createContext({tag: t,
        users: [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}]});
    const S = await app.api.createSubmission({tag: `${t}s`, context: t, submitter: `${t}au`, title: `JATS email ${t}`});
    const sid = S.submissionId;
    const pid = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sid}`));
    const base = `submissions/${sid}/publications/${pid}`;
    const log = serverLog(app);
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        const list = await (await apiAs(page, 'GET', `${base}/contributors`)).json();
        const roles = ((list.items || list)[0].contributorRoles || []).map((r) => r.id);
        for (const body of [{contributorType: 'ORGANIZATION', organizationName: {en: 'Org Without Email'}, country: 'CA'}, {contributorType: 'ANONYMOUS'}]) {
            const r = await apiAs(page, 'POST', `${base}/contributors`, {contributorRoles: roles, ...body});
            facts[body.contributorType] = r.status();
        }
        const from = log.mark();
        const r = await apiAs(page, 'GET', `${base}/jats`);
        const j = await r.json().catch(() => null);
        const xml = (j && (j.jatsContent || '')) || '';
        facts.status = r.status();
        facts.isDefault = j && j.isDefaultContent;
        facts.contribs = (xml.match(/<contrib [\s\S]*?<\/contrib>/g) || []).map((c) => c.replace(/\s+/g, ' '));
        facts.emailElements = xml.match(/<email[^>]*\/>|<email[^>]*>[^<]*<\/email>/g);
        facts.log = log.since(from);
    } finally {
        record('jats', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
