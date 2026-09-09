// @ts-check
/**
 * @file playwright/tests/U23-submissions-dashboard.spec.js
 *
 * Submissions dashboard (editorial) — OPS suite, one test per canonical
 * scenario the spec runs on a preprint server: common scenarios 1–7, 10–12
 * and 16 in OPS's own vocabulary (Preprint Server Manager, Moderator,
 * "Assigned to Moderator", the single Production stage) plus the
 * OPS-specific scenario 15 (the reduced dashboard). Scenarios 8, 9, 13 and
 * 14 carry badges that exclude a preprint server, as does scenario 11's
 * "Needs editor" bullet; scenario 15 is where OPS asserts the absent views.
 * Spec: docs/specs/U23-submissions-dashboard.md; its Coverage section is
 * the record of everything else left out.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 ❓ (S11 asserts the roster facts as written), A2 ❓ (S12 and S15
 *   assert the "Complete submission" button's presence only, never press
 *   it), A3 ❓ (S10 asserts the conflict notice by wording-neutral
 *   fragments), A7 ❓, A8 ❓, OMP1 ❓.
 * - A4 🐞, A6 🐞 (review popovers: no review stage here), A5 🐞 (S7 never
 *   makes the third, un-sorting click).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. Tests that assert counts or sidebar badges isolate on
 * scratch preprint servers with throwaway users; S6, S15 and S16 run on
 * publicknowledge and scope every claim by the seed tag through the list's
 * own search, bounded by the heading count. Absence assertions carry
 * same-shape positive controls. Mailbox reads are scoped by the scenario's
 * own throwaway recipients (PRINCIPLES A8) and settled by the scenario's
 * last list read. No hard-coded waits. Everything runs in the parallel
 * `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../pages/MySubmissionsPage.js');

const SERVER = 'publicknowledge';
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const BULK_DELETE_CONFIRM =
    'Are you sure you want to delete the selected items? This action cannot be undone. Please confirm to proceed.';
const COLUMNS = ['ID', 'Submissions', 'Stage', 'Days', 'Editorial Activity', 'Actions'];
const DAYS_FILTER = 'Days since last activity';
/** The OPS label of the "Assigned To Editor" filter field (Fields table). */
const ASSIGNED_FILTER = 'Assigned to Moderator';

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

        // Landing: a manager lands on the editorial dashboard, "Assigned to
        // me" view — exercised through the retired submission-list address,
        // which forwards there (Rule 4).
        const page = await (await asUser(mgr)).newPage();
        await page.goto(`/index.php/${tag}/submissions`);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        const dash = new EditorialDashboardPage(page, tag);
        await dash.expectViewHeading('Assigned to me', 0);

        // The sidebar's "Editor Dashboard" group, with the "Search
        // submissions" box at its top and one entry per view, each badge
        // carrying its count (Rule 1).
        await expect(dash.menuGroupLink()).toBeVisible();
        await expect(dash.globalSearchBox()).toBeVisible();
        await expect(dash.globalSearchBox()).toHaveAccessibleName(/^Search submissions/);
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

        // The table: the heading names the view with its count over the six
        // columns; a Stage cell names the stage in plain text with a small
        // colored dot beside it (Rule 5; "Production" is the preprint
        // server's one stage).
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        for (const name of COLUMNS) {
            await expect(dash.columnHeader(name)).toBeVisible();
        }
        await expect(dash.columnHeader('Status')).toHaveCount(0); // positive control for the name match
        const activeRow = dash.row(`acta${tag}`);
        await expect(activeRow).toBeVisible();
        await expect(dash.stageCell(activeRow)).toHaveText(/^\s*Production\s*$/);
        await expect(dash.stageDot(activeRow)).toBeVisible();

        // The views: open each entry in turn — each opens the list under its
        // own heading with its count; a view holding nothing shows a single
        // "No Items" row (Rules 2, 5).
        await dash.openView('All in production stage');
        await dash.expectViewHeading('All in production stage', 1);
        await expect(dash.row(`acta${tag}`)).toBeVisible();
        await dash.openView('Scheduled for publication');
        await dash.expectViewHeading('Scheduled for publication', 0);
        await expect(page.getByText('No Items')).toBeVisible();
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 2);
        await expect(dash.row(`puba${tag}`)).toBeVisible();
        await expect(dash.row(`acta${tag}`)).toHaveCount(0);
        await dash.openView('Declined');
        await dash.expectViewHeading('Declined', 1);
        await expect(dash.row(`decl${tag}`)).toBeVisible();
        // Control: the landing view's badge reads 0 and it shows "No Items".
        await dash.openView('Assigned to me');
        await dash.expectViewHeading('Assigned to me', 0);
        await expect(page.getByText('No Items')).toBeVisible();
        await expect(dash.row(`acta${tag}`)).toHaveCount(0);
    });

    test('S2: assigned-only scope for Moderators', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch server holding three preprints: one with the Moderator
        // assigned, one untouched, one submitted by the Moderator's own
        // account (the submit enrols them as an author, as the wizard does;
        // fn-s2). No reviewer leg: a preprint server has no reviewers.
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
        await opsApi.createSubmission({tag, context: tag, submitter: mod, title: `own${tag}`});

        // Every view: only the assigned preprint is listed; the unassigned
        // one and the one they authored appear in no view (Rule 3).
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto();
        const modViews = [
            ['Assigned to me', 1],
            ['Active submissions', 1],
            ['All in production stage', 1],
            ['Scheduled for publication', 0],
            ['Published', 0],
        ];
        for (const [name, count] of modViews) {
            await modDash.openView(name);
            await modDash.expectViewHeading(name, count);
            await modDash.expectViewCount(name, count);
            await expect(modDash.row(`other${tag}`)).toHaveCount(0);
            await expect(modDash.row(`own${tag}`)).toHaveCount(0);
            if (count > 0) {
                await expect(modDash.row(`mine${tag}`)).toBeVisible();
            }
        }

        // Global search: Rule 7 applies Rule 3's scope, so the unassigned
        // and the authored preprint each return "Search Results (0)";
        // positive control: the same search finds the assigned one.
        for (const title of [`other${tag}`, `own${tag}`]) {
            await modDash.globalSearch(title);
            await modDash.expectViewHeading('Search Results', 0);
            await expect(modPage.getByText('No Items')).toBeVisible();
            await expect(modDash.row(title)).toHaveCount(0);
        }
        await modDash.globalSearch(`mine${tag}`);
        await modDash.expectViewHeading('Search Results', 1);
        await expect(modDash.row(`mine${tag}`)).toBeVisible();

        // The submission they authored sits under their "My Submissions as
        // Author" sidebar group.
        const modMySub = new MySubmissionsPage(modPage, tag);
        await modMySub.goto();
        await expect(modMySub.menuGroupLink()).toBeVisible();
        await expect(modMySub.row(`own${tag}`)).toBeVisible();
        await expect(modMySub.row(`other${tag}`)).toHaveCount(0);

        // Control: the manager's "Active submissions" lists all three, while
        // their own "Assigned to me" lists only their assignments — none
        // (Rule 2).
        const mgrPage = await (await asUser(mgr)).newPage();
        const mgrDash = new EditorialDashboardPage(mgrPage, tag);
        await mgrDash.goto();
        await mgrDash.expectViewHeading('Assigned to me', 0);
        await mgrDash.expectViewCount('Assigned to me', 0);
        await mgrDash.openView('Active submissions');
        await mgrDash.expectViewHeading('Active submissions', 3);
        for (const title of [`mine${tag}`, `other${tag}`, `own${tag}`]) {
            await expect(mgrDash.row(title)).toBeVisible();
        }
    });

    test('S3: search within a view', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const mgr = `${tag}mg`;
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(author, 'Ada', 'Author', ['author']),
            ],
        });
        for (const title of [`arta${tag}`, `artb${tag}`, `artc${tag}`]) {
            await opsApi.createSubmission({tag, context: tag, submitter: author, title});
        }
        await opsApi.createSubmission({tag, context: tag, submitter: author, title: `pubs${tag}`, published: true});

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 3);

        // The search box narrows the CURRENT view — the heading keeps the
        // view's name, the count follows, and the phrase shows as a chip
        // (Rule 6).
        await expect(dash.searchBox()).toHaveAccessibleName(/Search submissions, ID, authors, keywords, etc\./);
        await dash.searchFor(`arta${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`arta${tag}`)).toBeVisible();
        await expect(dash.row(`artb${tag}`)).toHaveCount(0);
        await expect(dash.searchChip(`arta${tag}`)).toBeVisible();

        // The chip's X restores the full view, the count with it.
        await dash.clearSearchChip();
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`artb${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toHaveCount(0);

        // A filter on top of the search: the filter's chip joins the search
        // chip, "Clear Filters" appears beside them, and the list holds only
        // the rows matching both (a 30-day floor on today's rows: none,
        // fn-s3).
        await dash.searchFor(`arta${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await dash.openFilters();
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await expect(dash.searchChip(`arta${tag}`)).toBeVisible();
        await expect(dash.filterChip(DAYS_FILTER)).toBeVisible();
        await expect(dash.clearFiltersButton()).toBeVisible();
        await dash.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // Switching views drops both chips and empties the search box; back
        // on "Active submissions" the full view shows (Rules 6, 8).
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 1);
        await expect(dash.row(`pubs${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toHaveCount(0);
        await expect(dash.filterChip(DAYS_FILTER)).toHaveCount(0);
        await expect(dash.clearFiltersButton()).toHaveCount(0);
        await expect(dash.searchBox()).toHaveValue('');
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.searchBox()).toHaveValue('');

        // Control: the in-page box narrows the current view and never
        // reaches beyond it: the posted preprint's title finds nothing on
        // "Active submissions".
        await dash.searchFor(`pubs${tag}`);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // Mailbox: none of the above sent an email (Side effects). The
        // scenario's recipients are its own throwaway accounts (A8); the
        // heading read above is the settled end of the last action.
        expect(await pkpMail.count({to: `${mgr}@mail.test`})).toBe(0);
        expect(await pkpMail.count({to: `${author}@mail.test`})).toBe(0);
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
        // One declined preprint plus one active as noise (fn-s4).
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `decl${tag}`, decisions: ['decline']});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `acta${tag}`});

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        // Start the search from a non-default view (fn-s4); its in-page
        // search box is the positive control for the box disappearing on
        // Search Results.
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.searchBox()).toBeVisible();

        // The sidebar's box searches everything — declined preprints
        // included — and opens the "Search Results" view with the row's
        // Stage cell reading "Declined", the phrase as a chip, and no
        // in-page search box (Rule 7).
        await dash.globalSearch(`decl${tag}`);
        await dash.expectViewHeading('Search Results', 1);
        const declRow = dash.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(dash.stageCell(declRow)).toHaveText(/^\s*Declined\s*$/);
        await expect(dash.searchChip(`decl${tag}`)).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Filters on the results: a filter chip joins the phrase chip, the
        // list keeps only the results idle for 30 days or more (none of
        // today's rows), and the view is still "Search Results".
        await dash.openFilters();
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await expect(dash.filterChip(DAYS_FILTER)).toBeVisible();
        await expect(dash.searchChip(`decl${tag}`)).toBeVisible();
        await dash.expectViewHeading('Search Results', 0);
        await expect(declRow).toHaveCount(0);

        // Clearing the phrase alone: the view stays "Search Results", the
        // filter chip still active.
        await dash.clearSearchChip();
        await expect(dash.searchChip()).toHaveCount(0);
        await dash.expectViewHeading('Search Results');
        await expect(dash.filterChip(DAYS_FILTER)).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Clearing the filter too: the page returns to "Active submissions",
        // the view the search started from, with its in-page box back.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`acta${tag}`)).toBeVisible();
        await expect(dash.filterChip(DAYS_FILTER)).toHaveCount(0);
        await expect(dash.searchBox()).toBeVisible();

        // Control: only the sidebar's search reaches a declined preprint
        // from here: the in-page box finds nothing.
        await dash.searchFor(`decl${tag}`);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();
    });

    test('S5: filter the list; the Moderator panel has no assigned-to field', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // Two fresh preprints (the idle one cannot be seeded: a 30-day floor
        // leaves nothing, fn-s5) and one posted, so "Published" has a full
        // list after the view switch. A scratch OPS server has one section
        // and no categories, so the manager's panel offers exactly
        // "Assigned to Moderator" and "Days since last activity" (Fields).
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
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `acta${tag}`});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `actb${tag}`});
        await opsApi.createSubmission({tag, context: tag, submitter: `${tag}au`, title: `pubs${tag}`, published: true});

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 2);

        // "Filters": a side panel titled "Filters" with "Days since last
        // activity", "Clear Filters" and "Apply Filters" (Rule 8).
        let modal = await dash.openFilters();
        await expect(modal.getByText('Filters', {exact: true}).first()).toBeVisible();
        await expect(modal.getByText(DAYS_FILTER)).toBeVisible();
        await expect(modal.getByRole('button', {name: 'Clear Filters', exact: true})).toBeVisible();
        await expect(modal.getByRole('button', {name: 'Apply Filters', exact: true})).toBeVisible();

        // Applying a Days value closes the panel, narrows the view (both
        // rows are fresh, so nothing stays), the count follows, and a chip
        // shows above the table with "Clear Filters" beside it.
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await expect(dash.filterChip(DAYS_FILTER)).toBeVisible();
        await expect(dash.clearFiltersButton()).toBeVisible();
        await dash.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // "Clear Filters" restores the view.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 2);
        await expect(dash.row(`actb${tag}`)).toBeVisible();
        await expect(dash.filterChip(DAYS_FILTER)).toHaveCount(0);

        // Switching views: apply the same filter again, then open
        // "Published": the chip is gone and the view shows its full list.
        await dash.openFilters();
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await expect(dash.filterChip(DAYS_FILTER)).toBeVisible();
        await dash.expectViewHeading('Active submissions', 0);
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 1);
        await expect(dash.row(`pubs${tag}`)).toBeVisible();
        await expect(dash.filterChip(DAYS_FILTER)).toHaveCount(0);
        await expect(dash.clearFiltersButton()).toHaveCount(0);

        // "Assigned to Moderator" (the OPS label of "Assigned To Editor"):
        // the manager's panel lists the field, and its suggest list offers
        // nothing until a name is typed (positive control: a typed name
        // brings the Moderator up as an option).
        modal = await dash.openFilters();
        await expect(modal.getByText(ASSIGNED_FILTER)).toBeVisible();
        const assignedField = dash.filterSuggestField(ASSIGNED_FILTER);
        await assignedField.click();
        await expect(dash.suggestOptions()).toHaveCount(0);
        await assignedField.pressSequentially('Mira', {delay: 25});
        await expect(dash.suggestOptions().filter({hasText: 'Mira Moderator'})).toBeVisible();
        await expect(dash.suggestOptions()).toHaveCount(1);

        // Control: the Moderator's panel has no "Assigned to Moderator"
        // field, while the Days field is there.
        const modPage = await (await asUser(mod)).newPage();
        const modDash = new EditorialDashboardPage(modPage, tag);
        await modDash.goto();
        const modPanel = await modDash.openFilters();
        await expect(modPanel.getByText(DAYS_FILTER)).toBeVisible();
        await expect(modPanel.getByText(ASSIGNED_FILTER)).toHaveCount(0);
        await expect(modDash.filterSuggestField(ASSIGNED_FILTER)).toHaveCount(0);
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

        // Control: reloading the address after closing brings the bare
        // list, no panel.
        await page.reload();
        await expect(dash.row(tag)).toBeVisible({timeout: 30_000});
        await expect(dash.workflowNavEntry()).toHaveCount(0);
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
        // every seeded row shares one idle time, so no reorder is visible;
        // fn-s7).
        await dash.sortButton('Days').click();
        await page.waitForURL(
            (url) => url.searchParams.get('sortColumn') === 'lastActivity',
            {waitUntil: 'commit'}
        );

        // Back to the ID sort for a deterministic page split.
        await dash.sortButton('ID').click();
        await page.waitForURL(
            (url) =>
                url.searchParams.get('sortColumn') === 'id' &&
                url.searchParams.get('sortDirection') === 'descending',
            {waitUntil: 'commit'}
        );

        // Control: reloading the sorted address brings the rows back in the
        // same order.
        await page.reload();
        await dash.expectViewHeading('Active submissions', 31);
        await expect(dash.dataRows().first()).toContainText(byIdMax.title);

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

        // The manager finds it under "Declined": the Stage cell reads
        // "Declined", the activity cell "Declined during the {stage}
        // stage." — Production, the preprint server's one stage — and the
        // row keeps its "View" (Rule 9b).
        const mgrPage = await (await asUser(mgr)).newPage();
        const mgrDash = new EditorialDashboardPage(mgrPage, tag);
        await mgrDash.goto();
        await mgrDash.openView('Declined');
        await mgrDash.expectViewHeading('Declined', 1);
        const declRow = mgrDash.row(`decl${tag}`);
        await expect(mgrDash.stageCell(declRow)).toHaveText(/^\s*Declined\s*$/);
        await expect(declRow).toContainText('Declined during the Production stage.');
        await expect(mgrDash.viewButton(declRow)).toBeVisible();

        // The Moderator's sidebar has no "Declined" entry (their "Published"
        // entry is the positive control; no "Needs editor" leg — a preprint
        // server has that view for nobody, S15) and the declined preprint
        // is gone from every view of theirs — only the still-active
        // assignment remains.
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
            await modDash.openView(name);
            await modDash.expectViewHeading(name, count);
            await modDash.expectViewCount(name, count);
            await expect(modDash.row(`decl${tag}`)).toHaveCount(0);
            if (count > 0) {
                await expect(modDash.row(`ctrl${tag}`)).toBeVisible();
            }
        }

        // Their global search still finds it, with "View" (Rule 7 — the
        // ⚠ A1 state as the spec currently records it).
        await modDash.globalSearch(`decl${tag}`);
        await modDash.expectViewHeading('Search Results', 1);
        await expect(modDash.row(`decl${tag}`)).toBeVisible();
        await expect(modDash.viewButton(modDash.row(`decl${tag}`))).toBeVisible();

        // Control: the manager's own group offers "Declined".
        await expect(mgrDash.viewLink('Declined')).toBeVisible();
    });

    test('S12: bulk-delete incomplete preprints; no "More Actions" for Moderators', async ({asUser, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        // Two incomplete preprints by different authors plus one submitted
        // control (fn-s12; the manager's Confirm leg succeeds on OPS, fn-m).
        const mgr = `${tag}mg`;
        const mod = `${tag}md`;
        const authorA = `${tag}aa`;
        const authorB = `${tag}ab`;
        await opsApi.createContext({
            tag,
            users: [
                user(mgr, 'Greta', 'Manager', ['manager']),
                user(mod, 'Mira', 'Moderator', ['sectionEditor']),
                user(authorA, 'Ada', 'Author', ['author']),
                user(authorB, 'Bo', 'Author', ['author']),
            ],
        });
        await opsApi.createSubmission({tag, context: tag, submitter: authorA, title: `drafta${tag}`, submitted: false});
        await opsApi.createSubmission({tag, context: tag, submitter: authorB, title: `draftb${tag}`, submitted: false});
        await opsApi.createSubmission({
            tag, context: tag, submitter: authorA, title: `subm${tag}`,
            participants: [{username: mod, role: 'sectionEditor'}],
        });

        const page = await (await asUser(mgr)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto('?currentViewId=active');
        await dash.expectViewHeading('Active submissions', 3);

        // The incomplete rows: each has its Stage cell reading "Production"
        // (a preprint server has no "Incomplete" label, Rule 5), offers
        // "Complete submission" (A2: presence only) and has no "View"; the
        // submitted row has "View" (Rule 9c).
        const rowA = dash.row(`drafta${tag}`);
        const rowB = dash.row(`draftb${tag}`);
        const rowKeep = dash.row(`subm${tag}`);
        for (const row of [rowA, rowB]) {
            await expect(dash.stageCell(row)).toHaveText(/^\s*Production\s*$/);
            await expect(dash.completeSubmissionButton(row)).toBeVisible();
            await expect(dash.viewButton(row)).toHaveCount(0);
        }
        await expect(dash.viewButton(rowKeep)).toBeVisible();
        await expect(dash.completeSubmissionButton(rowKeep)).toHaveCount(0);

        // "More Actions" → "Delete Incomplete Submissions" puts the list in
        // selection mode: a checkbox on the two incomplete rows only,
        // "Delete Incomplete Submissions" and "Cancel" above, the delete
        // button disabled until a row is ticked (Rule 12).
        await expect(await dash.openMoreActions()).toBeEnabled();
        await dash.bulkDeleteMenuItem().click();
        await expect(dash.bulkDeleteButton()).toBeVisible({timeout: 30_000});
        await expect(dash.bulkDeleteCancelButton()).toHaveText(/^\s*Cancel\s*$/);
        await expect(rowA.getByRole('checkbox')).toBeVisible();
        await expect(rowB.getByRole('checkbox')).toBeVisible();
        await expect(rowKeep.getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteButton()).toBeDisabled();

        // Delete: tick both and press the button: the confirm dialog reads
        // its sentence; "Confirm" removes both rows, and the badges and the
        // heading total drop without a reload (Rules 12–13).
        await dash.checkRowCheckbox(rowA);
        await expect(dash.bulkDeleteButton()).toBeEnabled();
        await dash.checkRowCheckbox(rowB);
        await dash.bulkDeleteButton().click();
        const dialog = dash.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(BULK_DELETE_CONFIRM);
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(rowA).toHaveCount(0, {timeout: 30_000});
        await expect(rowB).toHaveCount(0);
        await expect(rowKeep).toBeVisible();
        await dash.expectViewHeading('Active submissions', 1);
        await dash.expectViewCount('Active submissions', 1);
        await dash.expectViewCount('All in production stage', 1);

        // "More Actions" afterwards: with no incomplete row left on the
        // page, "Delete Incomplete Submissions" is grayed out (the entry was
        // enabled above, the positive control).
        await expect(await dash.openMoreActions()).toBeDisabled();
        await dash.closeMoreActions();

        // The author's own list: signed in as one of the drafts' authors, My
        // Submissions no longer lists it (on OPS drafts sit under "Active
        // submissions"; positive control: their submitted one is still
        // there), and no email about the deletion arrived in their mailbox
        // (the list read is the settled end of the deletion).
        const authorPage = await (await asUser(authorA)).newPage();
        const mySub = new MySubmissionsPage(authorPage, tag);
        await mySub.goto();
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 1);
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.row(`drafta${tag}`)).toHaveCount(0);
        expect(await pkpMail.count({to: `${authorA}@mail.test`})).toBe(0);
        expect(await pkpMail.count({to: `${authorB}@mail.test`})).toBe(0);

        // Control: a Moderator's dashboard shows no "More Actions" button at
        // all — the neighboring controls (Filters, the search box) are the
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
        // A fresh preprint in the seeded server (its row is both the
        // empty-activity-cell subject and the positive control, its "View")
        // and two incomplete ones by different authors for the cleanup leg
        // (fn-s15).
        await opsApi.createSubmission({tag, context: SERVER, submitter: 'author.alex', title: `abs${tag}`});
        await opsApi.createSubmission({tag, context: SERVER, submitter: 'author.alex', title: `drafta${tag}`, submitted: false});
        await opsApi.createSubmission({tag, context: SERVER, submitter: 'author.bea', title: `draftb${tag}`, submitted: false});

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

        // The fresh preprint's activity cell is empty: no "Assign Editor",
        // no "Assign Reviewers" — the row's one button is its "View" (Rule
        // 9i; the control).
        await dash.openView('Active submissions');
        await dash.searchFor(tag);
        const row = dash.row(`abs${tag}`);
        await expect(row).toBeVisible({timeout: 30_000});
        await expect(dash.stageCell(row)).toHaveText(/^\s*Production\s*$/);
        await expect(dash.activityCell(row)).toHaveText(/^\s*$/);
        await expect(dash.viewButton(row)).toBeVisible();
        await expect(row.getByRole('button')).toHaveCount(1);
        await expect(dash.assignEditorButton(row)).toHaveCount(0);
        await expect(dash.assignReviewersButton(row)).toHaveCount(0);

        // Bulk cleanup: the flow of scenario 12 runs the same on the seeded
        // server, the incomplete rows' Stage cell reading "Production".
        const rowA = dash.row(`drafta${tag}`);
        const rowB = dash.row(`draftb${tag}`);
        await dash.expectViewHeading('Active submissions', 3);
        for (const draft of [rowA, rowB]) {
            await expect(dash.stageCell(draft)).toHaveText(/^\s*Production\s*$/);
            await expect(dash.completeSubmissionButton(draft)).toBeVisible();
            await expect(dash.viewButton(draft)).toHaveCount(0);
        }
        await dash.enterBulkDeleteSelection();
        await expect(row.getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteButton()).toBeDisabled();
        await dash.checkRowCheckbox(rowA);
        await dash.checkRowCheckbox(rowB);
        await expect(dash.bulkDeleteButton()).toBeEnabled();
        await dash.bulkDeleteButton().click();
        const dialog = dash.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(BULK_DELETE_CONFIRM);
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(rowA).toHaveCount(0, {timeout: 30_000});
        await expect(rowB).toHaveCount(0);
        await expect(row).toBeVisible();
        await dash.expectViewHeading('Active submissions', 1);
    });

    test('S16: refused at the address', async ({asUser}) => {
        test.slow();
        // The seeded server's Author-only account (fn-s16) types the
        // editorial dashboard's address by hand: the access-denied page, a
        // plain page, shows its sentence and no dashboard.
        const authorPage = await (await asUser('author.alex')).newPage();
        await authorPage.goto(`/index.php/${SERVER}/dashboard/editorial`);
        await expect(authorPage.getByText(ACCESS_DENIED)).toBeVisible({timeout: 30_000});
        await expect(authorPage.getByRole('heading', {name: /^Assigned to me/})).toHaveCount(0);
        await expect(authorPage.locator('#app-nav')).toHaveCount(0);
        await expect(authorPage.getByRole('dialog')).toHaveCount(0);

        // Control: the Preprint Server Manager at the same address gets the
        // dashboard.
        const mgrPage = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(mgrPage, SERVER);
        await dash.goto();
        await dash.expectViewHeading('Assigned to me');
        await expect(mgrPage.getByText(ACCESS_DENIED)).toHaveCount(0);
        await expect(dash.menuGroupLink()).toBeVisible();
    });
});
