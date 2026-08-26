// @ts-check
/**
 * @file playwright/tests/U23-submissions-dashboard.spec.js
 *
 * Submissions dashboard (editorial) — OPS suite, one test per canonical
 * scenario the spec runs on OPS: common scenarios 1–7 and 10–12 in OPS's own
 * context (Preprint Server Manager, Moderator, "Assigned to Moderator", the
 * single Production stage) plus the OPS-specific scenario 15 (the reduced
 * dashboard). Scenarios 8–9 are {OJS OMP} (needs-editor triage and review
 * activity — no submission-stage triage and no review stage exists on a
 * preprint server), 13 is {OJS} (issues) and 14 is {OMP} (two review stages):
 * per the spec's flags these are not implemented here; the OPS absence
 * coverage the spec calls for IS scenario 15 — its roster test asserts each
 * missing view entry with the six present entries as positive controls, and
 * its empty-activity-cell assertion (no "Assign Editor"/"Assign Reviewers"
 * button ever renders on a fresh preprint's row) is bounded by the same
 * row's "View" button as the positive control.
 *
 * Register findings never asserted (IDs from the spec's Findings register):
 * - A5 🐞 (un-sorting leaves a stale sort in the address): S7 exercises only
 *   the descending → ascending header states the spec records as working and
 *   never clicks a sorted header the third time.
 * - A2 ❓ ("Complete submission" hands an editor the author's wizard): the
 *   affordance is not asserted either way. S12 asserts the safe half of
 *   Rule 9c — a draft row offers no "View" (positive control: the submitted
 *   row's "View") — and the selection-mode machinery only.
 * - A3 ❓ (the conflict notice always says "Journal Manager"): S10 asserts
 *   the conflict row by the notice's stable prefix ("You cannot access this
 *   submission") and the row's buttonlessness, never pinning the role
 *   wording the finding questions.
 * - A1 ❓ (no path back to declined submissions for assigned editors): S11
 *   asserts the spec's CURRENT text — Moderators have no "Declined" entry
 *   and their global search is the way back (Rule 7). If the product ruling
 *   flips, the spec and these assertions move together.
 * - A4/A6/A7 ❓/🐞 and OMP1 ❓ concern review indicators and a press's series
 *   filter — neither state is constructible on OPS; nothing to assert or
 *   park.
 *
 * Deliberately NOT covered besides the above:
 * - The monthly outstanding-tasks email: OPS schedules no such task (spec
 *   Side effects — an install fact, not screen-reachable); the dashboard
 *   itself sends no mail, so the suite has no Mailpit assertions.
 * - The access-denied page for non-editorial roles and the role-precedence
 *   landing matrix (spec table row a / U22 territory): not canonical
 *   scenarios here. S1 exercises the landing through the retired
 *   {server}/submissions address, which forwards a manager to
 *   dashboard/editorial (Rule 4).
 * - Rule 9's review/copyediting/scheduled-issue branches and Rule 10
 *   entirely ({OJS OMP}/{OJS}); Rule 9b's declined cell IS asserted (S11,
 *   "Declined during the Production stage." — OPS's only decline source).
 * - Filter fields beyond OPS's scratch-server set ("Assigned to Moderator" +
 *   "Days since last activity"): a one-section server offers no Section
 *   field and an uncategorized one no Categories field (Fields table), so
 *   S5 asserts the two fields OPS's own setup yields; the days-slider
 *   filter itself is not driven (seeded submissions cannot be backdated —
 *   the "Assigned to Moderator" filter carries the narrowing claim).
 * - S7's "Days" sort asserts the address only: every seeded row shares one
 *   idle time, so no observable reorder exists to assert.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S1–S5, S7 and S10–S12 isolate on scratch preprint servers
 * with throwaway users (badge counts and rosters need lists only the test
 * controls); S6 and S15 ride manager.maya's journal-wide view of
 * publicknowledge, scoped by tag search. Waits are event-based (auto-wait on
 * rows, headings, badges and URL predicates) — no hard-coded sleeps.
 * Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../pages/MySubmissionsPage.js');

const SERVER = 'publicknowledge';

/** The OPS editorial view roster (spec Rule 2), in sidebar order. */
const OPS_EDITORIAL_VIEWS = [
    'Assigned to me',
    'Active submissions',
    'All in production stage',
    'Scheduled for publication',
    'Published',
    'Declined',
];

/** The {OJS OMP} view entries a preprint server never offers (Rule 2). */
const ABSENT_VIEWS = [
    'Needs editor',
    'All in submission stage',
    'Needs reviews',
    'Awaiting reviews',
    'Reviews submitted',
    'Reviews overdue',
    'Author revisions submitted',
    'All in review stage',
    'All in copyediting stage',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u23${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** Throwaway-user shorthand for scratch-server seeding. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

test.describe('submissions dashboard (editorial)', () => {
    test('S1: land and walk the views', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // A scratch server so every badge holds only this test's rows: one
        // active, two posted, one declined preprint.
        const mgr = `${tag}mg`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `acta${tag}`});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `puba${tag}`, published: true});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `pubb${tag}`, published: true});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `decl${tag}`, decisions: ['decline']});

        // A manager lands on the editorial dashboard, "Assigned to me" view —
        // exercised through the retired submission-list address, which
        // forwards there (Rule 4).
        const page = await (await asUser(mgr)).newPage();
        await page.goto(`/index.php/${tag}/submissions`);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        const dash = new EditorialDashboardPage(page, tag);
        await dash.expectViewHeading('Assigned to me');

        // The sidebar's "Editor Dashboard" group, with the global search box
        // at its top and one entry per view, each badge carrying its count.
        await expect(dash.menuGroupLink()).toBeVisible();
        await expect(dash.globalSearchBox()).toBeVisible();
        const expectedCounts = [
            ['Assigned to me', 0],
            ['Active submissions', 1],
            ['All in production stage', 1],
            ['Scheduled for publication', 0],
            ['Published', 2],
            ['Declined', 1],
        ];
        for (const [name, count] of expectedCounts) {
            await dash.expectViewCount(name, count);
        }

        // Walk the entries — each opens the list under its own heading with
        // its count; a view holding nothing shows "No Items" (Rule 5).
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`acta${tag}`)).toBeVisible();
        await dash.openView('Scheduled for publication');
        await dash.expectViewHeading('Scheduled for publication', 0);
        await expect(page.getByText('No Items')).toBeVisible();
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 2);
        await dash.openView('Declined');
        await dash.expectViewHeading('Declined', 1);
        await expect(dash.row(`decl${tag}`)).toBeVisible();
    });

    test('S2: assigned-only scope for Moderators', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch server holding two preprints: one with the Moderator
        // assigned, one untouched.
        const mgr = `${tag}mg`;
        const mod = `${tag}md`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(mod, 'Mira', 'Moderator', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `mine${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `other${tag}`});

        // The Moderator sees only the assigned preprint — every view, every
        // badge (Rule 3).
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto();
        const modCounts = [
            ['Assigned to me', 1],
            ['Active submissions', 1],
            ['All in production stage', 1],
            ['Scheduled for publication', 0],
            ['Published', 0],
        ];
        for (const [name, count] of modCounts) {
            await modDash.expectViewCount(name, count);
        }
        await modDash.openView('Active submissions');
        await expect(modDash.row(`mine${tag}`)).toBeVisible();
        await expect(modDash.row(`other${tag}`)).toHaveCount(0);

        // The unassigned preprint appears nowhere — not even in their global
        // search (Rule 7's scope), bounded by the same search finding the
        // assigned one as the positive control.
        await modDash.globalSearch(`other${tag}`);
        await modDash.expectViewHeading('Search Results', 0);
        await expect(modPage.getByText('No Items')).toBeVisible();
        await expect(modDash.row(`other${tag}`)).toHaveCount(0);
        await modDash.globalSearch(`mine${tag}`);
        await modDash.expectViewHeading('Search Results', 1);
        await expect(modDash.row(`mine${tag}`)).toBeVisible();

        // A manager checking the same journal sees both — while their own
        // "Assigned to me" lists only their own assignments: none (Rule 2).
        const mgrPage = await (await asUser(mgr)).newPage();
        const mgrDash = new EditorialDashboardPage(mgrPage, tag);
        await mgrDash.goto();
        await mgrDash.expectViewHeading('Assigned to me', 0);
        await mgrDash.openView('Active submissions');
        await mgrDash.expectViewHeading('Active submissions', 2);
        await expect(mgrDash.row(`mine${tag}`)).toBeVisible();
        await expect(mgrDash.row(`other${tag}`)).toBeVisible();
    });

    test('S3: search within a view', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const mgr = `${tag}mg`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        for (const title of [`arta${tag}`, `artb${tag}`, `artc${tag}`]) {
            await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title});
        }

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 3);

        // The search narrows the CURRENT view — the heading keeps the view's
        // name, the count follows, and the phrase shows as a chip (Rule 6).
        await dash.searchFor(`arta${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`arta${tag}`)).toBeVisible();
        await expect(dash.row(`artb${tag}`)).toHaveCount(0);
        await expect(dash.searchChip(`arta${tag}`)).toBeVisible();

        // The chip's X restores the full view.
        await dash.clearSearchChip();
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`artb${tag}`)).toBeVisible();
        await expect(dash.searchChip(`arta${tag}`)).toHaveCount(0);

        // Switching views drops the phrase too.
        await dash.searchFor(`artb${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await dash.openView('All in production stage');
        await dash.expectViewHeading('All in production stage', 3);
        await expect(dash.searchChip(`artb${tag}`)).toHaveCount(0);
    });

    test('S4: global search finds a declined preprint', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const mgr = `${tag}mg`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `acta${tag}`});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `decl${tag}`, decisions: ['decline']});

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        // Start from a non-default view; its in-page search box is the
        // positive control for the box disappearing on Search Results.
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 0);
        await expect(dash.searchBox()).toBeVisible();

        // The sidebar's box searches everything — declined preprints
        // included — and opens the "Search Results" view with the phrase as
        // a chip; the in-page search box is gone there (Rule 7).
        await dash.globalSearch(`decl${tag}`);
        await dash.expectViewHeading('Search Results', 1);
        await expect(dash.row(`decl${tag}`)).toBeVisible();
        await expect(dash.searchChip(`decl${tag}`)).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Clearing the phrase returns to the view the search started from.
        await dash.clearSearchChip();
        await dash.expectViewHeading('Published', 0);
    });

    test('S5: filter the list; the Moderator panel has no assigned-to field', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // One preprint assigned to the Moderator, one not — the
        // "Assigned to Moderator" filter narrows between them. A scratch OPS
        // server has one section and no categories, so the panel offers
        // exactly this field plus "Days since last activity" (Fields table).
        const mgr = `${tag}mg`;
        const mod = `${tag}md`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(mod, 'Mira', 'Moderator', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `mine${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `other${tag}`});

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 2);

        // The manager's Filters panel: "Assigned to Moderator" (the OPS
        // label of "Assigned To Editor") and "Days since last activity". The
        // suggest list offers nothing until a name is typed.
        const panel = await dash.openFilters();
        await expect(panel.getByText('Assigned to Moderator')).toBeVisible();
        await expect(page.getByRole('option')).toHaveCount(0);
        const suggest = panel.getByRole('combobox');
        await suggest.click();
        await suggest.pressSequentially('Mira', {delay: 25});
        await page.getByRole('option', {name: /Mira Moderator/}).click();
        await panel.getByRole('button', {name: 'Apply Filters', exact: true}).click();

        // Applying closes the panel, narrows the view, and puts a chip above
        // the table (Rule 8).
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`mine${tag}`)).toBeVisible();
        await expect(dash.row(`other${tag}`)).toHaveCount(0);
        await expect(dash.filterChipButton('Assigned to Moderator: Mira Moderator')).toBeVisible();

        // "Clear Filters" restores the view.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 2);
        await expect(dash.row(`other${tag}`)).toBeVisible();
        await expect(dash.filterChipButton('Assigned to Moderator')).toHaveCount(0);

        // The Moderator's panel has no "Assigned to Moderator" field — the
        // days field, present for them too, is the positive control.
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto();
        const modPanel = await modDash.openFilters();
        await expect(modPanel.getByText('Days since last activity')).toBeVisible();
        await expect(modPanel.getByText('Assigned to Moderator')).toHaveCount(0);
        await expect(modPanel.getByRole('combobox')).toHaveCount(0);
    });

    test('S6: "View" opens the workflow in place and the address follows', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await opsApi.createSubmission({
            tag, context: SERVER, submitter: 'author.alex', title: `open${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(page, SERVER);
        await dash.goto();
        await dash.openView('Active submissions');
        const row = await dash.findRowByTag(tag);
        const urlBefore = page.url();

        // "View" opens the workflow as a panel over the list; the address
        // records which submission is open (Rule 11).
        await dash.viewButton(row).click();
        await dash.expectWorkflowOpen();
        expect(page.url()).toContain(`workflowSubmissionId=${submissionId}`);

        // Reloading that address reopens the panel.
        await page.reload();
        await dash.expectWorkflowOpen();

        // Closing returns to the list at the exact address it left.
        await dash.closeWorkflow();
        await expect(dash.row(tag)).toBeVisible();
        expect(page.url()).toBe(urlBefore);
    });

    test('S7: sort and page', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const mgr = `${tag}mg`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // 31 preprints: one over the 30-row page size (Rule 5). The paging
        // leg rides the same seeding as the sort legs.
        const seeded = [];
        for (let i = 1; i <= 31; i++) {
            const {submissionId} = await opsApi.createSubmission({
                tag, context: tag, submitter: `${tag}au`, title: `t${i}x${tag}`,
            });
            seeded.push({submissionId, title: `t${i}x${tag}`});
        }
        const byIdMax = seeded.reduce((a, b) => (a.submissionId > b.submissionId ? a : b));
        const byIdMin = seeded.reduce((a, b) => (a.submissionId < b.submissionId ? a : b));

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 31);

        // Click "ID": rows order descending and the address records the sort
        // (Rule 4/5).
        await dash.sortButton('ID').click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('sortColumn') === 'id' &&
                url.searchParams.get('sortDirection') === 'descending',
            {waitUntil: 'commit'}
        );
        await expect(dash.dataRows().first()).toContainText(byIdMax.title);

        // Click again: the sort flips to ascending, address following.
        await dash.sortButton('ID').click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('sortColumn') === 'id' &&
                url.searchParams.get('sortDirection') === 'ascending',
            {waitUntil: 'commit'}
        );
        await expect(dash.dataRows().first()).toContainText(byIdMin.title);

        // "Days" sorts the same way (the address is the observable claim:
        // every seeded row shares one idle time, so no reorder is visible).
        await dash.sortButton('Days').click();
        await page.waitForURL(
            (url) => url.searchParams.get('sortColumn') === 'lastActivity',
            {waitUntil: 'commit'}
        );

        // Back to the ID-ascending sort for a deterministic page split.
        await dash.sortButton('ID').click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('sortColumn') === 'id' &&
                url.searchParams.get('sortDirection') === 'descending',
            {waitUntil: 'commit'}
        );

        // 31 rows page at 30, with pager controls under the list; page 2
        // shows the rest — and which page is showing is never part of the
        // address (Rule 4; the sort clicks above are the positive control
        // for the address otherwise following the list state).
        await expect(dash.pager()).toBeVisible();
        await expect(dash.dataRows()).toHaveCount(30);
        const urlBeforePaging = page.url();
        await dash.pager().getByRole('button', {name: /Next/}).click();
        await expect(dash.dataRows()).toHaveCount(1);
        // Descending sort → page 2 holds the lowest ID.
        await expect(dash.dataRows().first()).toContainText(byIdMin.title);
        await dash.expectViewHeading('Active submissions', 31);
        expect(page.url()).toBe(urlBeforePaging);
    });

    test('S10: the conflict row for a manager-author', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        // A Manager+Author combo account with one authored preprint, plus an
        // unrelated preprint as the positive "View" control.
        const combo = `${tag}ma`;
        await opsApi.createContext({
            tag,
            users: [
                user(combo, 'Mel', 'Managerauthor', ['manager', 'author']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: combo, title: `confl${tag}`});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `ctrl${tag}`});

        const page = await (await asUser(combo)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 2);

        // Their own authored preprint's row shows the conflict notice and
        // offers no buttons at all (Rule 9a; the notice's role wording is
        // open ❓ A3 and deliberately not pinned).
        const conflictRow = dash.row(`confl${tag}`);
        await expect(conflictRow).toContainText('You cannot access this submission');
        await expect(conflictRow).toContainText('My Submissions');
        await expect(conflictRow.getByRole('button')).toHaveCount(0);

        // Ordinary rows around it keep their "View" (positive control).
        await expect(dash.viewButton(dash.row(`ctrl${tag}`))).toBeVisible();

        // The same preprint sits normally under their author list.
        await page.goto(`/index.php/${tag}/dashboard/mySubmissions`);
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.expectViewHeading('Active submissions');
        await expect(mySub.menuGroupLink()).toBeVisible();
        const authorRow = mySub.row(`confl${tag}`);
        await expect(authorRow).toBeVisible();
        await expect(mySub.viewButton(authorRow)).toBeVisible();
    });

    test('S11: declined out of the Moderator\'s sight', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s11', testInfo);
        // Two preprints assigned to the Moderator; the manager side declines
        // one (seeded — the decline itself is decision-feature territory).
        const mgr = `${tag}mg`;
        const mod = `${tag}md`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(mod, 'Mira', 'Moderator', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `decl${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
            decisions: ['decline'],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `ctrl${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
        });

        // The manager finds it under "Declined": the activity cell reads
        // "Declined during the {stage} stage." — Production, the preprint
        // server's one stage — and the row keeps its "View" (Rule 9b).
        const mgrPage = await (await asUser(mgr)).newPage();
        const mgrDash = new EditorialDashboardPage(mgrPage, tag);
        await mgrDash.goto();
        await mgrDash.openView('Declined');
        await mgrDash.expectViewHeading('Declined', 1);
        const declRow = mgrDash.row(`decl${tag}`);
        await expect(declRow).toContainText('Declined during the Production stage.');
        await expect(mgrDash.viewButton(declRow)).toBeVisible();

        // The Moderator's sidebar has no "Declined" entry (their "Published"
        // entry is the positive control) and the declined preprint is gone
        // from every view of theirs — only the still-active assignment
        // remains.
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto();
        await expect(modDash.viewLink('Published')).toBeVisible();
        await expect(modDash.viewLink('Declined')).toHaveCount(0);
        const modCounts = [
            ['Assigned to me', 1],
            ['Active submissions', 1],
            ['All in production stage', 1],
            ['Scheduled for publication', 0],
            ['Published', 0],
        ];
        for (const [name, count] of modCounts) {
            await modDash.expectViewCount(name, count);
        }
        await modDash.openView('Active submissions');
        await expect(modDash.row(`ctrl${tag}`)).toBeVisible();
        await expect(modDash.row(`decl${tag}`)).toHaveCount(0);

        // Their global search still finds it (Rule 7 — the ⚠ A1 state as
        // the spec currently records it).
        await modDash.globalSearch(`decl${tag}`);
        await modDash.expectViewHeading('Search Results', 1);
        await expect(modDash.row(`decl${tag}`)).toBeVisible();
    });

    test('S12: bulk-delete incomplete preprints; no "More Actions" for Moderators', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        // Two incomplete preprints by different authors plus one submitted
        // control (fn-s15: the manager's Confirm leg succeeds on OPS).
        const mgr = `${tag}mg`;
        const mod = `${tag}md`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(mod, 'Mira', 'Moderator', ['sectionEditor']),
                user(`${tag}aa`, 'Ada', 'Author', ['author']),
                user(`${tag}ab`, 'Bo', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}aa`, title: `drafta${tag}`, submitted: false});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}ab`, title: `draftb${tag}`, submitted: false});
        await opsApi.createSubmission({
            tag, context: tag, submitter: `${tag}aa`, title: `subm${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
        });

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 3);

        // Draft rows offer no "View" (Rule 9c's safe half; the submitted
        // row's "View" is the positive control — the "Complete submission"
        // affordance is open ❓ A2 and not asserted either way).
        await expect(dash.viewButton(dash.row(`drafta${tag}`))).toHaveCount(0);
        await expect(dash.viewButton(dash.row(`subm${tag}`))).toBeVisible();

        // "More Actions" → "Delete Incomplete Submissions" enters selection
        // mode: checkboxes on the two incomplete rows only, the delete
        // button disabled until something is ticked (Rule 12).
        await dash.enterBulkDeleteSelection();
        await expect(dash.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteButton()).toBeDisabled();

        // Tick both, delete, confirm — both are gone and the heading and
        // badge counts drop in place, no reload (Rules 12–13).
        await dash.checkRowCheckbox(dash.row(`drafta${tag}`));
        await dash.checkRowCheckbox(dash.row(`draftb${tag}`));
        await expect(dash.bulkDeleteButton()).toBeEnabled();
        await dash.bulkDeleteButton().click();
        const dialog = dash.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone. Please confirm to proceed.'
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(dash.row(`drafta${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(dash.row(`draftb${tag}`)).toHaveCount(0);
        await expect(dash.row(`subm${tag}`)).toBeVisible();
        await dash.expectViewHeading('Active submissions', 1);
        await dash.expectViewCount('Active submissions', 1);

        // A Moderator's dashboard shows no "More Actions" button at all —
        // the neighboring controls (Filters, the search box) are the
        // positive controls.
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto('?currentViewId=active');
        await expect(modDash.filtersButton()).toBeVisible();
        await expect(modDash.searchBox()).toBeVisible();
        await expect(modDash.moreActionsButton()).toHaveCount(0);
    });

    test('S15 {OPS}: the reduced dashboard', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s15', testInfo);
        // A fresh preprint in the seeded server; its row is both the
        // empty-activity-cell subject and the positive control (its "View").
        await opsApi.createSubmission({
            tag, context: SERVER, submitter: 'author.alex', title: `abs${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(page, SERVER);
        await dash.goto();

        // The sidebar group offers exactly the six OPS views (positive
        // controls, asserted first so the absences are bounded by a rendered
        // menu)…
        await expect(dash.menuGroupLink()).toBeVisible();
        for (const name of OPS_EDITORIAL_VIEWS) {
            await expect(dash.viewLink(name)).toBeVisible();
        }
        // …and none of the review, copyediting or needs-editor views a
        // journal's manager would have (Rule 2).
        for (const name of ABSENT_VIEWS) {
            await expect(dash.viewLink(name)).toHaveCount(0);
        }

        // A fresh preprint's activity cell is empty: no "Assign Editor", no
        // "Assign Reviewers" — the row's one button is its "View" (Rule 9i).
        await dash.openView('Active submissions');
        const row = await dash.findRowByTag(tag);
        await expect(row).toContainText('Production');
        await expect(dash.viewButton(row)).toBeVisible();
        await expect(row.getByRole('button')).toHaveCount(1);
        await expect(row.getByRole('button', {name: 'Assign Editor'})).toHaveCount(0);
        await expect(row.getByRole('button', {name: 'Assign Reviewers'})).toHaveCount(0);
    });
});
