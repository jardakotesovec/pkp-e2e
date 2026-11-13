// Configurations run — OJS Issues › "Back Issues" on MySQL 8.0 / MariaDB 10.11: once the back issues
// have been put in an order, an issue published later goes to the top of "Back Issues" and of the
// archive, where PostgreSQL puts it at the bottom (U50 A31; ci-triage C-U50-1; the red test U50 S5).
//
// `APP\issue\DAO::resequenceCustomIssueOrders()` renumbers the published issues in
// `orderBy('o.seq')` over a LEFT JOIN to `custom_issue_orders`. The issue just published has no row
// there, so its `o.seq` is NULL; MySQL and MariaDB sort NULL first, PostgreSQL last. Two issues
// published after the ordering sort among themselves in whatever order the database returns.
//
// Steps (screens, as the journal's manager; the journal and its issues are seeded through the
// campaign's API the way Issues › "Create Issue" › "Save" and "Publish Issue" make them): three
// published issues Vol. 1 (2024), Vol. 2 (2025), Vol. 3 (2026) and a future issue Vol. 4 (2027).
//   1. Issues › "Back Issues" › "Order": drag "Vol. 1 No. 1 (2024)" to the top, "Done".
//   2. "Future Issues" › Vol. 4's "Publish Issue", untick the email box, "OK".
//   3. "Back Issues" and the journal's "Archives" page: the order.
//
//   PKP_E2E_LINE=mysql npm run reset:ojs && PKP_E2E_LINE=mysql npm run fleet-prep -- --feature cfgrun --apps ojs
//   PKP_E2E_LINE=mysql npm run probe-servers -- --start --app ojs
//   PKP_E2E_LINE=mysql PROBE_FEATURE=cfgrun PROBE_AGENT=cfgiss node bin/probe.js ojs shared/playwright/checks/sync/cfg-back-issues-order/walk.js
// (`mariadb` likewise; on the usual PostgreSQL fleet it is the control.)
//
// Reads fixed when: after step 2 "Back Issues" and "Archives" both read Vol. 1, Vol. 3, Vol. 2, Vol. 4
// (the saved order kept, the new issue last), on every database. At OJS 3c99722dc8 on MySQL 8.0.46 and MariaDB 10.11.19:
// Vol. 4, Vol. 1, Vol. 3, Vol. 2 in both.
//
// Facts: walk-ojs.json; screenshots walk-back-issues-ojs.png, walk-archive-ojs.png.
const {forEachApp, launch, signIn, shot, record, tag} = require('../../../probe');
const {IssuesAdmin, IssueReader} = require('../../../pages/IssuesPages.js');

const V1 = 'Vol. 1 No. 1 (2024)';
const V4 = 'Vol. 4 No. 1 (2027)';
const clean = (list) => list.map((s) => s.replace(/\s+/g, ' ').trim());

forEachApp(async (app) => {
    const t = tag('cfgiss');
    const mg = `${t}mg`;
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
    const facts = {line: app.line, journal: t};
    const {page, close} = await launch(app);
    const visitor = await launch(app);
    try {
        await signIn(page, mg, {contextPath: t});
        const issues = new IssuesAdmin(page, t);
        const reader = new IssueReader(visitor.page, t);
        await issues.goto('Back Issues');
        facts.before = clean(await issues.names('Back Issues').allInnerTexts());

        // 1. "Order": Vol. 1 to the top, "Done".
        const ordering = issues.backOrdering();
        await ordering.start();
        await issues.dragBackIssueAbove(V1, facts.before[0]);
        await ordering.done();
        facts.ordered = clean(await issues.names('Back Issues').allInnerTexts());

        // 2. Publish Vol. 4.
        await issues.showTab('Future Issues');
        const publish = await issues.openPublish(V4);
        await publish.mailBox().uncheck();
        await publish.ok();

        // 3. The two lists.
        await issues.goto('Back Issues');
        await page.waitForTimeout(500);
        facts.backIssues = clean(await issues.names('Back Issues').allInnerTexts());
        await shot(page, 'walk-back-issues');
        await reader.gotoHome();
        await reader.pressHeader('Archives');
        facts.archive = clean(await reader.summaryTitles().allInnerTexts());
        await shot(visitor.page, 'walk-archive');

        const kept = facts.ordered;
        facts.reads = {
            newIssueLast: facts.backIssues[facts.backIssues.length - 1] === V4,
            newIssueFirst: facts.backIssues[0] === V4,
            savedOrderKept: JSON.stringify(facts.backIssues.filter((n) => n !== V4)) === JSON.stringify(kept),
            archiveMatches: JSON.stringify(facts.archive) === JSON.stringify(facts.backIssues),
        };
    } finally {
        record('walk', facts);
        console.log(JSON.stringify(facts, null, 1));
        await visitor.close();
        await close();
    }
});
