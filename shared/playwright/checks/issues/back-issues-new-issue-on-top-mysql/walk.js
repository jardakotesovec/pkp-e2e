// Issue report U50 A23 (docs/issues/U50-A23-back-issues-new-issue-on-top-mysql.md): after "Back Issues"
// is ordered, an issue with no stored place (a newly published one, or the current issue left at the
// top when "Done" is pressed) lands where the database sorts NULL: first on MySQL and MariaDB, last
// on PostgreSQL.
//
// Preconditions, seeded through the campaign's seeding API (what the Steps' preconditions list: a
// new journal, its Journal Manager, "Vol. 1 No. 1 (2024)", "Vol. 2 No. 1 (2025)" and "Vol. 3 No. 1
// (2026)" published in that order, so Vol. 3 is current, "Vol. 4 No. 1 (2027)" not published).
// MODE=walk (Steps, "A new issue"):
//   1. the Manager opens Issues › "Back Issues" (Vol. 3, 2, 1);
//   2. "Order", drags Vol. 1 to the top, "Done" (Vol. 1, 3, 2);
//   3. "Future Issues" › Vol. 4's "Publish Issue", unticks the email box, "OK";
//   4. reads "Back Issues" and, as a visitor, the journal's "Archives".
// MODE=cur (Steps, "The current issue left at the top"): step 1; "Order", drags Vol. 2 below Vol. 1,
//   leaving the current Vol. 3 at the top, "Done"; reads "Back Issues" and "Archives"; then step 3
//   and step 4.
// MODE=nb (the fix trial's neighbour check, run alone): steps 1 and 2, then Vol. 2's "Edit" › "Issue
//   Data" › "Save" unchanged (a renumbering with every issue placed); both lists must still read
//   Vol. 1, 3, 2.
//
//   PKP_E2E_LINE=mysql bin/app-lock.sh exclusive ojs -- bash -c 'npm run fleet-prep -- --feature <f> --apps ojs --reset && \
//       MODE=<walk|cur|nb> PROBE_FEATURE=<f> PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/issues/back-issues-new-issue-on-top-mysql/walk.js'
// (`mariadb` likewise; without PKP_E2E_LINE on the PostgreSQL install.)
//
// Reads fixed when (facts.reads), on every database, with the proposed fix (new issue on top):
// MODE=walk newIssueFirst and savedOrderKept true; MODE=cur doneOrderOnBackIssues,
// doneOrderOnArchive, savedOrderKept and newIssueFirst true; MODE=nb orderKept true; archiveMatches
// true in each.
const {forEachApp, launch, signIn, record, tag, screen, shot, serverLog, sql} = require('../../../probe');
const {sleep, backIssues, archive, orderAbove, orderBelow, publishIssue, saveIssueData} = require('./lib');

const V1 = 'Vol. 1 No. 1 (2024)';
const V2 = 'Vol. 2 No. 1 (2025)';
const V3 = 'Vol. 3 No. 1 (2026)';
const V4 = 'Vol. 4 No. 1 (2027)';
const MODE = process.env.MODE || 'walk';
const run = process.env.PROBE_RUN || '';
const name = (n) => (run ? `${n}-${run}` : n);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function orders(app, t) {
    try {
        return sql(app, `select o.issue_id, o.seq, i.volume, i.published from custom_issue_orders o join issues i on i.issue_id = o.issue_id join journals j on j.journal_id = o.journal_id where j.path = '${t}' order by o.seq`);
    } catch (e) {
        return `sql failed: ${e.message.slice(0, 200)}`;
    }
}

forEachApp(async (app) => {
    const t = tag('u50n17c');
    const mg = `${t}mg`;
    const log = serverLog(app, {match: /error|exception|fatal|\[5\d\d\]/i});
    const from = log.mark();
    await app.api.createContext({
        tag: t,
        users: [{username: mg, givenName: 'Mona', familyName: 'Manager', email: `${mg}@mail.test`, roles: ['manager']}],
        issues: [
            {volume: 1, number: 1, year: 2024, published: true, datePublished: '2024-03-01'},
            {volume: 2, number: 1, year: 2025, published: true, datePublished: '2025-03-01'},
            {volume: 3, number: 1, year: 2026, published: true, datePublished: '2026-03-01'},
            {volume: 4, number: 1, year: 2027},
        ],
    });
    const facts = {line: app.line, mode: MODE, run, journal: t};
    const steps = {};
    const {page, close} = await launch(app);
    const visitor = await launch(app);
    try {
        await signIn(page, mg, {contextPath: t});
        facts.step1 = await backIssues(page, t);
        steps['1-back-issues'] = await screen(page);
        // MODE=cur: the current issue (Vol. 3, at the top) is left where it is; Vol. 2 goes below Vol. 1.
        facts.orderSave = MODE === 'cur' ? await orderBelow(page, t, V2, V1) : await orderAbove(page, t, V1, facts.step1[0]);
        facts.step2 = await backIssues(page, t);
        steps['2-ordered'] = await screen(page);
        facts.dbOrdered = orders(app, t);
        if (MODE === 'nb') {
            facts.issueDataSave = await saveIssueData(page, t, V2).catch((e) => `error: ${e.message.slice(0, 300)}`);
        } else if (MODE === 'cur') {
            facts.archiveAfterDone = await archive(visitor.page, t);
            await publishIssue(page, t, V4);
            steps['3-published'] = await screen(page);
        } else {
            await publishIssue(page, t, V4);
            steps['3-published'] = await screen(page);
        }
        await sleep(500);
        facts.backIssues = await backIssues(page, t);
        steps['4-back-issues'] = await screen(page);
        await shot(page, name(`${MODE}-back-issues`));
        facts.archive = await archive(visitor.page, t);
        steps['4-archive'] = await screen(visitor.page);
        await shot(visitor.page, name(`${MODE}-archive`));
        facts.dbAfter = orders(app, t);
        facts.reads = MODE === 'nb'
            ? {orderKept: same(facts.backIssues, facts.step2), archiveMatches: same(facts.archive, facts.backIssues)}
            : MODE === 'cur'
            ? {
                // Read after "Done" (step 2 on "Back Issues", then the archive), then after Vol. 4 is published.
                doneOrderOnBackIssues: same(facts.step2, [V3, V1, V2]),
                doneOrderOnArchive: same(facts.archiveAfterDone, [V3, V1, V2]),
                currentDroppedAtDone: facts.step2[facts.step2.length - 1] === V3,
                afterPublish: facts.backIssues,
                savedOrderKept: same(facts.backIssues.filter((n) => n !== V4), [V3, V1, V2]),
                newIssueFirst: facts.backIssues[0] === V4,
                archiveMatches: same(facts.archive, facts.backIssues),
            }
            : {
                newIssueLast: facts.backIssues[facts.backIssues.length - 1] === V4,
                newIssueFirst: facts.backIssues[0] === V4,
                savedOrderKept: same(facts.backIssues.filter((n) => n !== V4), facts.step2),
                archiveMatches: same(facts.archive, facts.backIssues),
            };
    } finally {
        facts.serverLog = log.since(from).slice(0, 20);
        record(name(MODE), {facts, steps});
        console.log(JSON.stringify(facts, null, 1));
        await visitor.close();
        await close();
    }
});
