// Issue report U19 A26 (docs/issues/U19-A26-oai-datestamp-no-issue-mysql.md): on MySQL 8.0 and
// MariaDB 10.11, an OJS article published in no issue has no OAI-PMH datestamp of its own.
//
// Preconditions, seeded through the campaign's seeding API (what the Steps' preconditions list:
// a new journal, "Enable OAI" on as on every new journal, its Journal Manager, one published
// issue "Vol. 1 No. 1 (2026)", two submissions sent to production, "Nowhere Article" and
// "Issue Article"). Then, through the screens as the Steps say:
//   1. the Journal Manager publishes "Nowhere Article" with "Don't Assign To An Issue";
//   2. publishes "Issue Article" with "Assign To Current/Back Issue" › "Vol. 1 No. 1 (2026)";
//   3. opens ListIdentifiers in the browser, then again 3 s later (each record's datestamp);
//   4. opens it with from=<today>, then until=<today>;
//   5. opens Identify (earliestDatestamp).
// MODE=nb (the fix trial's neighbour, run alone): the path the fix must leave alone, an article
// published in an issue whose issue changed after it. A journal with a published issue and
// "Neighbour Article" published into it (seeded); the Manager saves the issue's "Issue Data"
// unchanged 3 s later (Issues › "Back Issues" › "Edit" › "Issue Data" › "Save"); the record's
// datestamp must be the issue's save time, and from=<today> must list it.
//
// MODE=wayround: an article seeded as published in no issue is unpublished and published again
// into the issue on screen (the way round for an article already published). MODE=nullpub: an
// article in the issue whose publications.last_modified is set to NULL by SQL, as the 3.2
// upgrade can leave it (a check of the fix's reach, not a Step).
//
//   PKP_E2E_LINE=mysql npm run fleet-prep -- --feature cfg-n17b-my --apps ojs --reset
//   PKP_E2E_LINE=mysql bin/app-lock.sh shared ojs -- env PKP_E2E_LINE=mysql PROBE_FEATURE=cfg-n17b-my PROBE_AGENT=n17b \
//       node bin/probe.js ojs shared/playwright/checks/issues/oai-datestamp-no-issue-mysql/walk.js
// (`mariadb` likewise; on PostgreSQL, the usual `main` fleet without PKP_E2E_LINE, the control.)
//
// Reads fixed when (facts.reads): nowhereDatestampMoves false, fromListsNowhere and
// untilListsNowhere true, earliestIsRecordStamp true; in MODE=nullpub datestampMoves false and
// fromListsArticle true; in MODE=nb issueDateCounts and fromListsNeighbour true with the fix in
// and out.
const {forEachApp, launch, signIn, record, tag, sql, serverLog, shot} = require('../../../probe');
const {sleep, today, publishFromWorkflow, unpublishAndRepublishInIssue, openOai, pick, saveIssueData} = require('./lib');

const ISSUE = {volume: 1, number: 1, year: 2026};
const ISSUE_NAME = 'Vol. 1 No. 1 (2026)';
const MODE = process.env.MODE || 'walk';
const run = process.env.PROBE_RUN || '';
const name = (n) => (run ? `${n}-${run}` : n);

function dbStamps(app, submissionId) {
    try {
        return sql(app, `select a.last_modified, p.last_modified, i.last_modified, p.issue_id, GREATEST(a.last_modified, i.last_modified, p.last_modified) from submissions a join publications p on p.publication_id = a.current_publication_id left join issues i on i.issue_id = p.issue_id where a.submission_id = ${submissionId}`);
    } catch (e) {
        return `sql failed: ${e.message.slice(0, 200)}`;
    }
}

async function seedJournal(app, t) {
    return app.api.createContext({
        tag: t,
        users: [
            {username: `${t}mgr`, givenName: 'Mona', familyName: 'Manager', email: `${t}mgr@mail.test`, roles: ['manager']},
            {username: `${t}au`, givenName: 'Ada', familyName: 'Author', email: `${t}au@mail.test`, roles: ['author']},
        ],
        issues: [{...ISSUE, published: true}],
    });
}

forEachApp(async (app) => {
    const t = tag('u19n17b');
    const log = serverLog(app, {match: /error|exception|fatal|warning|deprecated|\[5\d\d\]/i});
    const from = log.mark();
    await seedJournal(app, t);
    const facts = {line: app.line, mode: MODE, run, journal: t};
    const {page, close} = await launch(app);
    const steps = {};
    const rec = (n, data) => { steps[n] = data; };
    rec.prefix = `${name(MODE)}-`;
    const sub_rec = (k) => Object.assign((n, d) => rec(`${k}-${n}`, d), {prefix: `${name(MODE)}-${k}-`});
    try {
        if (MODE === 'wayround' || MODE === 'nullpub') {
            // wayround: an article already published in no issue (seeded as the publish window's
            // "Don't Assign To An Issue" leaves it) is unpublished and published again into the
            // issue on screen; does a dated list then hold it?
            // nullpub: an article published in the issue whose version's own last change is empty,
            // as the 3.2 upgrade leaves a version it copied from a submission with no
            // last_modified (pkp-lib#6807's repair covered submissions and issues, not
            // publications). The state is set by SQL; a check of the fix's reach, not a Step.
            const art = await app.api.createSubmission({tag: `${t}w`, context: t, submitter: `${t}au`, title: MODE === 'wayround' ? 'Nowhere Article' : 'Upgraded Article', published: true, ...(MODE === 'nullpub' ? {issue: ISSUE} : {})});
            facts.article = art.submissionId;
            if (MODE === 'nullpub') {
                facts.nulled = sql(app, `update publications set last_modified = NULL where publication_id = (select current_publication_id from submissions where submission_id = ${art.submissionId})`);
            } else {
                await signIn(page, `${t}mgr`, {contextPath: t});
                facts.before = pick(await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: today()}), art.submissionId);
                facts.wayround = await unpublishAndRepublishInIssue(page, app, t, art.submissionId, /Vol\. 1 No\. 1 \(2026\)/, sub_rec('w'));
            }
            await sleep(2000);
            const first = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
            await sleep(3000);
            const second = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
            const dated = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: today()});
            const records = await openOai(page, app, t, {verb: 'ListRecords', metadataPrefix: 'oai_dc'});
            facts.list = [first, second].map((a) => ({responseDate: a.responseDate, article: pick(a, art.submissionId), all: a.headers}));
            facts.from = {article: pick(dated, art.submissionId), error: dated.error};
            facts.listRecordsScreen = records.screen.slice(0, 500);
            facts.db = dbStamps(app, art.submissionId);
            const [a, b] = facts.list;
            facts.reads = {
                datestampMoves: !!(a.article && b.article && a.article.datestamp !== b.article.datestamp),
                fromListsArticle: !!facts.from.article,
            };
        } else if (MODE === 'nb') {
            const nb = await app.api.createSubmission({tag: `${t}nb`, context: t, submitter: `${t}au`, title: 'Neighbour Article', published: true, issue: ISSUE});
            facts.neighbour = nb.submissionId;
            await sleep(3000);
            await signIn(page, `${t}mgr`, {contextPath: t});
            facts.issueSave = await saveIssueData(page, t, ISSUE_NAME).catch((e) => ({error: e.message.slice(0, 300)}));
            await sleep(1500);
            const list = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
            const dated = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: today()});
            facts.list = {at: list.at, neighbour: pick(list, nb.submissionId), error: list.error};
            facts.from = {neighbour: pick(dated, nb.submissionId), error: dated.error};
            facts.db = dbStamps(app, nb.submissionId);
            const stamp = facts.list.neighbour && facts.list.neighbour.datestamp;
            const s = facts.issueSave || {};
            const sec = (x) => Math.floor(Date.parse(x) / 1000);
            facts.reads = {
                issueDateCounts: !!(stamp && s.before && sec(stamp) >= sec(s.before) - 1 && sec(stamp) <= sec(s.after) + 1),
                fromListsNeighbour: !!facts.from.neighbour,
            };
        } else {
            const sub = (title, k) => app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: `${t}au`, title, decisions: ['skipExternalReview', 'sendToProduction']});
            const nowhere = await sub('Nowhere Article', 'n');
            const inIssue = await sub('Issue Article', 'i');
            facts.nowhere = nowhere.submissionId;
            facts.inIssue = inIssue.submissionId;
            await signIn(page, `${t}mgr`, {contextPath: t});
            facts.step1 = await publishFromWorkflow(page, app, t, nowhere.submissionId, {choice: "Don't Assign To An Issue"}, sub_rec('1'));
            facts.step2 = await publishFromWorkflow(page, app, t, inIssue.submissionId, {choice: 'Assign To Current/Back Issue', issue: /Vol\. 1 No\. 1 \(2026\)/}, sub_rec('2'));
            await sleep(2000);
            const readFrom = log.mark();
            const first = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
            await shot(page, `${name('walk')}-3-list`).catch(() => {});
            await sleep(3000);
            const second = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc'});
            facts.step3 = [first, second].map((a) => ({requestAt: a.at, responseDate: a.responseDate, status: a.status, nowhere: pick(a, nowhere.submissionId), inIssue: pick(a, inIssue.submissionId)}));
            rec('3-list-screen', first.screen);
            const f = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', from: today()});
            const u = await openOai(page, app, t, {verb: 'ListIdentifiers', metadataPrefix: 'oai_dc', until: today()});
            facts.step4 = {
                from: {url: f.url, error: f.error, nowhere: pick(f, nowhere.submissionId), inIssue: pick(f, inIssue.submissionId)},
                until: {url: u.url, error: u.error, nowhere: pick(u, nowhere.submissionId), inIssue: pick(u, inIssue.submissionId)},
            };
            rec('4-from-screen', f.screen);
            const id = await openOai(page, app, t, {verb: 'Identify'});
            facts.step5 = {requestAt: id.at, responseDate: id.responseDate, earliestDatestamp: id.earliest};
            rec('5-identify-screen', id.screen);
            facts.readLog = log.since(readFrom).slice(0, 10);
            facts.db = {nowhere: dbStamps(app, nowhere.submissionId), inIssue: dbStamps(app, inIssue.submissionId)};
            const [a, b] = facts.step3;
            facts.reads = {
                nowhereDatestampMoves: !!(a.nowhere && b.nowhere && a.nowhere.datestamp !== b.nowhere.datestamp),
                nowhereStampIsRequestTime: !!(a.nowhere && a.nowhere.datestamp === a.responseDate),
                fromListsNowhere: !!facts.step4.from.nowhere,
                untilListsNowhere: !!facts.step4.until.nowhere,
                fromListsControl: !!facts.step4.from.inIssue,
                earliestIsRecordStamp: [a.nowhere, a.inIssue].filter(Boolean).map((h) => h.datestamp).sort()[0] === facts.step5.earliestDatestamp,
            };
        }
    } finally {
        facts.serverLog = log.since(from).slice(0, 20);
        record(name(MODE), {facts, steps});
        console.log(JSON.stringify(facts, null, 1));
        await close();
    }
});
