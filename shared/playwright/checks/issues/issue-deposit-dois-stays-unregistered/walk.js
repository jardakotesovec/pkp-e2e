// Issue report docs/issues/U45-OJS4-issue-deposit-dois-stays-unregistered.md (U45 OJS4):
// "Deposit DOIs" on ticked issues ("Issues" tab of the DOIs page) queues the
// deposits and shows "Items successfully submitted for deposit", but the
// issues' DOIs keep their status. Takes the report's Steps through the
// screens on OJS (the only app with issues), on a dataset fleet freshly reset
// to PKP's default test dataset, with the report's precondition
// `[queues] job_runner = Off` set in the fleet's config (lib.js holdQueue):
//   1.   sign in as `dbarnes`
//   2.   Plugins: tick "Crossref Manager Plugin"
//   3.   DOIs › Setup: prefix 10.1234, tick "Issues", Save
//   4.   DOIs › Registration: "Crossref", depositor name and email, Save
//   5.   DOIs page, "Issues": "Assign DOIs" on issue 1 "Vol. 1 No. 2 (2014)"
//   6.   "Articles": "Assign DOIs" on submission 17
//   7.   "Issues": tick issue 1, "Deposit DOIs" (the finding)
//   8.   reload, "Issues", expand the issue
//   9.   "Articles": tick submission 17, "Deposit DOIs" (the control)
// After the steps it runs the queue once (the kit's drainJobs) and reads both
// rows again: what the deposits' end leaves (on a test install they cannot
// connect, U45 A18).
// AGENCY=datacite takes the same steps with "DataCite Manager Plugin" and
// "DataCite" (the queued DepositIssue then meets U45 OJS2 on main).
// WALK=again, run alone: steps 1 to 5 and 7, then the issue ticked and
// "Deposit DOIs" pressed once more, then its expanded view's "Deposit DOI(s)".
// WALK=default, run alone, with `job_runner = On` as the dataset ships it:
// steps 1 to 5 and 7, then what the page reads at once and on later loads.
// AFTER=all presses "Deposit All" at the end of the steps, after the queue ran.
// WALK=twice, run alone: steps 1 to 5 and 7, then "Deposit All" while the
// issue's deposit is still queued (a second DepositIssue for the same issue).
// WALK=nb is the neighbour check, run alone (steps 1 to 5, then):
//   a. "Issues": tick issue 1 and the unpublished issue 2, "Deposit DOIs":
//      refused whole, nothing queued, nothing marked
//   b. "Deposit All": issue 1 reads "Submitted", one DepositIssue queued
// Run (reset the fleet first):
//   npm run fleet-prep -- --feature issues-rc --dataset 6 --reset
//   PROBE_FEATURE=issues-rc PROBE_AGENT=rc node bin/probe.js ojs shared/playwright/checks/issues/issue-deposit-dois-stays-unregistered/walk.js
// On 3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, feature issues-rc-3_5, PROBE_RUN=r35.
const {forEachApp, launch, signIn, screen, shot, record, sql, drainJobs} = require('../../../probe');
const {flat, holdQueue, releaseQueue, queueFacts, depositJobs, storedDois, rowState, depositTicked, depositFromPanel} = require('./lib.js');

const T = 30_000;
const WALK = process.env.WALK || 'steps';
const AG = process.env.AGENCY || 'crossref';
const AGENCY = {
    crossref: {plugin: 'crossrefplugin', label: 'Crossref', fields: {depositorName: 'Public Knowledge Project', depositorEmail: 'dbarnes@mailinator.com'}},
    datacite: {plugin: 'dataciteplugin', label: 'DataCite', fields: {username: 'u45rc'}},
};
const ISSUE = 1; // "Vol. 1 No. 2 (2014)", published
const UNPUBLISHED = 2; // "Vol. 2 No. 1 (2015)"
const ARTICLE = 17; // "Antimicrobial, heavy metal resistance …", published

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[walk] ${app.name}: no issues, no surface; skipped`);
        return;
    }
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const {DoiSettings, DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
    const {expect} = require('@playwright/test');
    const agency = AGENCY[AG];
    const ctx = app.contextPath;
    const pre = `ojs4-${WALK}-${AG}`;
    const facts = {app: app.name, line: app.line || 'main', walk: WALK, agency: AG, run: process.env.PROBE_RUN || null};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1500)}`);
    };

    fact('0 job_runner', WALK === 'default' ? releaseQueue(app) : holdQueue(app));
    const {page, close} = await launch(app);
    try {
        await recordNotices(page);
        // 1
        await signIn(page, 'dbarnes', {contextPath: ctx});
        const settings = new DoiSettings(page, ctx);
        const dois = new DoisPage(page, ctx);
        const issueRow = dois.row(ISSUE, 'issue');
        const articleRow = dois.row(ARTICLE);

        // 2
        await settings.gotoPlugins(agency.plugin);
        await settings.setPluginEnabled(agency.plugin, true);
        fact('2 plugin on', await settings.pluginBox(agency.plugin).isChecked());

        // 3
        await settings.goto('Setup');
        fact('3 kinds before', await settings.kinds());
        await settings.prefixBox().fill('10.1234');
        await settings.kindBox('Issues').check();
        const r3 = await settings.save(settings.setup);
        fact('3 setup save', {status: r3.status()});

        // 4
        await settings.goto('Registration');
        await settings.chooseAgency(agency.label);
        for (const [name, value] of Object.entries(agency.fields)) {
            await expect(settings.field(name)).toBeVisible({timeout: T});
            await settings.field(name).fill(value);
        }
        const r4 = await settings.save(settings.registration);
        await settings.goto('Setup');
        fact('4 registration save', {status: r4.status(), kindsAfter: await settings.kinds()});

        // 5
        await dois.goto();
        await dois.openTab('Issues');
        await issueRow.waitFor({timeout: T});
        fact('5 issues tab rows', await dois.rowNames());
        const a5 = await dois.runBulk('Assign DOIs', [ISSUE], {type: 'issue', list: 'issues'});
        fact('5 issue assigned', {status: a5.status(), ...(await rowState(dois, issueRow, ISSUE))});

        // "Deposit All" › "Deposit all DOIs", then the page opened again on "Issues".
        const depositAll = async () => {
            await dois.depositAllButton().click();
            const win = dois.dialog('Deposit all DOIs');
            await win.waitFor({timeout: T});
            const acted = page.waitForResponse((r) => /\/api\/v1\/dois\/depositAll/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
            await win.getByRole('button', {name: 'Deposit all DOIs', exact: true}).click();
            const response = await acted;
            await win.waitFor({state: 'hidden', timeout: T}).catch(() => {});
            await page.waitForTimeout(1500);
            await dois.goto();
            await dois.openTab('Issues');
            return {status: response.status()};
        };

        if (WALK === 'again') {
            // step 7, then the same action once more, then the expanded issue's "Deposit DOI(s)"
            const d7 = await depositTicked(page, dois, [ISSUE], 'issue');
            fact('g1 issue deposit', {...d7, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            await dois.reload();
            await dois.openTab('Issues');
            const again = await depositTicked(page, dois, [ISSUE], 'issue');
            fact('g2 ticked and deposited again', {...again, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            await dois.reload();
            await dois.openTab('Issues');
            const panel = await depositFromPanel(page, dois, issueRow, ISSUE);
            record(`${pre}-g3-after-panel-deposit`, await screen(page));
            fact('g3 the panel button', {...panel, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            return;
        }

        if (WALK === 'default') {
            // job_runner On, as the dataset ships it: step 7, then what the page reads at once and on later loads
            const pressed = Date.now();
            const since = () => Math.round((Date.now() - pressed) / 100) / 10;
            const d7 = await depositTicked(page, dois, [ISSUE], 'issue');
            record(`${pre}-d1-after-issue-deposit`, await screen(page));
            fact('d1 at once', {seconds: since(), ...d7, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), jobs: depositJobs(sql, app), failed: queueFacts(sql, app).failed, dois: storedDois(sql, app)});
            const loads = [];
            for (let i = 0; i < 12; i++) {
                await dois.reload();
                await dois.openTab('Issues');
                const jobs = depositJobs(sql, app);
                loads.push({seconds: since(), issueBadge: flat(await dois.rowBadge(issueRow).innerText()), jobs, failed: queueFacts(sql, app).failed.length});
                if (jobs.length === 0) break;
                await page.waitForTimeout(5000);
            }
            fact('d2 page loads', loads);
            record(`${pre}-d3-issue-expanded`, await screen(page));
            fact('d3 after the deposit ran', {seconds: since(), issue: await rowState(dois, issueRow, ISSUE), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            return;
        }

        if (WALK === 'twice') {
            // step 7, then "Deposit All" while the issue's deposit is still queued
            const d7 = await depositTicked(page, dois, [ISSUE], 'issue');
            fact('t1 issue deposit', {...d7, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            const all = await depositAll();
            record(`${pre}-t2-after-deposit-all`, await screen(page));
            fact('t2 deposit all', {status: all.status, issue: await rowState(dois, issueRow, ISSUE), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            return;
        }

        if (WALK === 'nb') {
            // a. the published issue and the unpublished one, ticked together
            const unpublishedRow = dois.row(UNPUBLISHED, 'issue');
            fact('a unpublished issue row', (await unpublishedRow.count()) ? await rowState(dois, unpublishedRow, UNPUBLISHED) : 'not listed');
            const da = await depositTicked(page, dois, [ISSUE, UNPUBLISHED], 'issue');
            record(`${pre}-a-after-mixed-deposit`, await screen(page));
            await dois.goto();
            await dois.openTab('Issues');
            fact('a mixed deposit', {...da, issue: await rowState(dois, issueRow, ISSUE), ...queueFacts(sql, app), dois: storedDois(sql, app)});

            // b. "Deposit All"
            const rb = await depositAll();
            record(`${pre}-b-after-deposit-all`, await screen(page));
            fact('b deposit all', {status: rb.status, issue: await rowState(dois, issueRow, ISSUE), ...queueFacts(sql, app), dois: storedDois(sql, app)});
            return;
        }

        // 6
        await dois.openTab('Articles');
        await articleRow.waitFor({timeout: T});
        const a6 = await dois.runBulk('Assign DOIs', [ARTICLE]);
        fact('6 article assigned', {status: a6.status(), ...(await rowState(dois, articleRow, ARTICLE, {expand: false}))});

        // 7
        await dois.openTab('Issues');
        const d7 = await depositTicked(page, dois, [ISSUE], 'issue');
        const s7 = await screen(page);
        record(`${pre}-7-after-issue-deposit`, s7);
        await shot(page, `${pre}-7-after-issue-deposit`).catch(() => {});
        fact('7 issue deposit', {...d7, issueBadge: flat(await dois.rowBadge(issueRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});

        // 8
        await dois.reload();
        await dois.openTab('Issues');
        await dois.expand(issueRow, ISSUE);
        record(`${pre}-8-issue-expanded`, await screen(page));
        await shot(page, `${pre}-8-issue-expanded`).catch(() => {});
        fact('8 after reload', {issue: await rowState(dois, issueRow, ISSUE)});
        await dois.openTab('Articles');
        fact('8 article before its deposit', await rowState(dois, articleRow, ARTICLE, {expand: false}));

        // 9 (the control)
        const d9 = await depositTicked(page, dois, [ARTICLE], 'submission');
        record(`${pre}-9-after-article-deposit`, await screen(page));
        fact('9 article deposit', {...d9, articleBadge: flat(await dois.rowBadge(articleRow).innerText()), ...queueFacts(sql, app), dois: storedDois(sql, app)});
        await dois.reload();
        fact('9 after reload', {article: await rowState(dois, articleRow, ARTICLE)});

        // After the steps: the queue is run once, and both rows read again.
        const drained = await drainJobs(app).catch((e) => `drainJobs: ${e.message}`);
        await dois.goto();
        const articleAfter = await rowState(dois, articleRow, ARTICLE);
        await dois.openTab('Issues');
        const issueAfter = await rowState(dois, issueRow, ISSUE);
        await dois.expand(issueRow, ISSUE);
        record(`${pre}-after-queue-issue-expanded`, await screen(page));
        fact('after the queue ran', {issue: issueAfter, article: articleAfter, ...queueFacts(sql, app), dois: storedDois(sql, app),
            drained: flat(typeof drained === 'string' ? drained : JSON.stringify(drained), 300)});

        // AFTER=all: "Deposit All" once the deposits have failed (does it take the issue again?)
        if (process.env.AFTER === 'all') {
            const all = await depositAll();
            fact('after "Deposit All"', {status: all.status, issue: await rowState(dois, issueRow, ISSUE), queued: queueFacts(sql, app).queued, dois: storedDois(sql, app)});
        }
    } finally {
        record(`${pre}-facts`, facts);
        await close();
    }
});
