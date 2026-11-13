// Configurations run — OJS OAI-PMH on MySQL 8.0 / MariaDB 10.11: an article published in no issue
// has no datestamp of its own (U19 A26; ci-triage C-U19-1; the red tests U19 S3 and S5).
//
// `APP\oai\ojs\OAIDAO::getRecordsRecordSetQuery()` writes a record's datestamp as
// `GREATEST(a.last_modified, i.last_modified, p.last_modified)` over a LEFT JOIN to `issues`. With no
// issue `i.last_modified` is NULL, and MySQL's and MariaDB's GREATEST then answers NULL (PostgreSQL's
// skips NULLs). The NULL datestamp becomes `OAIUtils::UTCDate(strtotime(null))` = the moment of the
// request, so the record's datestamp moves with every request; `whereDate(NULL, '>=', …)` is never
// true, so every list given `from` or `until` leaves the article out; and Identify's
// "earliestDatestamp" (the first row by `last_modified`, NULLs first on MySQL) is the request time.
//
// Builds, through the campaign's seeding API (state the screens make as: Issues › "Create Issue",
// "Publish Issue"; an article published with "Don't Assign To An Issue" chosen in the publish window,
// and one published into the issue): a scratch journal with one published issue, the article
// "Nowhere Article" published in no issue and the control "Issue Article" published in the issue.
// Then reads the journal's OAI address as a harvester does (plain HTTP GETs):
//   1. ListIdentifiers (no dates), twice, 3 s apart: each record's datestamp;
//   2. ListIdentifiers with from=<today> and with until=<today>;
//   3. Identify's earliestDatestamp.
//
//   PKP_E2E_LINE=mysql npm run reset:ojs && PKP_E2E_LINE=mysql npm run fleet-prep -- --feature cfgrun --apps ojs
//   PKP_E2E_LINE=mysql npm run probe-servers -- --start --app ojs
//   PKP_E2E_LINE=mysql PROBE_FEATURE=cfgrun PROBE_AGENT=cfgoai node bin/probe.js ojs shared/playwright/checks/sync/cfg-oai-datestamp-no-issue/walk.js
// (`mariadb` likewise; on the usual PostgreSQL fleet it is the control: every read below holds.)
//
// Reads fixed when: "Nowhere Article" keeps one datestamp across the two reads (its publish time, not
// the request's), both dated lists hold both articles, and earliestDatestamp is the earlier of the
// two records' datestamps. At OJS 3c99722dc8 / pkp-lib ad75b174f0 on MySQL 8.0.46 and MariaDB 10.11.19: the datestamp is
// the request's time at each read, from= and until= list only "Issue Article", earliestDatestamp is
// the request's time.
//
// Facts: walk-ojs.json.
const {forEachApp, record, tag} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/** One OAI GET; the headers (identifier, datestamp) and the error code, read from the XML. */
async function oai(app, path, query) {
    const url = app.url(`/index.php/${path}/oai?${new URLSearchParams(query)}`);
    const res = await fetch(url);
    const xml = await res.text();
    const headers = [...xml.matchAll(/<header[^>]*>\s*<identifier>([^<]+)<\/identifier>\s*<datestamp>([^<]+)<\/datestamp>/g)]
        .map((m) => ({identifier: m[1], datestamp: m[2]}));
    const error = (xml.match(/<error code="([^"]+)"/) || [])[1] || null;
    const earliest = (xml.match(/<earliestDatestamp>([^<]+)<\/earliestDatestamp>/) || [])[1] || null;
    return {status: res.status, at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), headers, error, earliest};
}

forEachApp(async (app) => {
    const t = tag('cfgoai');
    const ctx = await app.api.createContext({
        tag: t,
        users: [{username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']}],
        issues: [{volume: 1, number: 1, year: 2026, published: true}],
    });
    const nowhere = await app.api.createSubmission({tag: `${t}n`, context: t, submitter: `${t}au`, title: 'Nowhere Article', published: true});
    const inIssue = await app.api.createSubmission({tag: `${t}i`, context: t, submitter: `${t}au`, title: 'Issue Article', published: true,
        issue: {volume: 1, number: 1, year: 2026}});
    const idOf = (s) => new RegExp(`/${s.submissionId}$`);
    const pick = (answer, s) => answer.headers.find((h) => idOf(s).test(h.identifier)) || null;
    const facts = {line: app.line, journal: t, issues: ctx.issues, nowhere: nowhere.submissionId, inIssue: inIssue.submissionId};

    await sleep(2000);
    const first = await oai(app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
    await sleep(3000);
    const second = await oai(app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
    facts.undated = [first, second].map((a) => ({requestAt: a.at, nowhere: pick(a, nowhere), inIssue: pick(a, inIssue)}));
    const from = await oai(app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: today()});
    const until = await oai(app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', until: today()});
    facts.from = {error: from.error, nowhere: pick(from, nowhere), inIssue: pick(from, inIssue)};
    facts.until = {error: until.error, nowhere: pick(until, nowhere), inIssue: pick(until, inIssue)};
    const identify = await oai(app, t, {verb: 'Identify'});
    facts.identify = {requestAt: identify.at, earliestDatestamp: identify.earliest};

    const [a, b] = facts.undated;
    facts.reads = {
        nowhereDatestampMoves: !!(a.nowhere && b.nowhere && a.nowhere.datestamp !== b.nowhere.datestamp),
        fromListsNowhere: !!facts.from.nowhere,
        untilListsNowhere: !!facts.until.nowhere,
        fromListsControl: !!facts.from.inIssue,
        earliestIsRecordStamp: [a.nowhere, a.inIssue].filter(Boolean).map((h) => h.datestamp).sort()[0] === facts.identify.earliestDatestamp,
    };
    record('walk', facts);
    console.log(JSON.stringify(facts, null, 1));
});
