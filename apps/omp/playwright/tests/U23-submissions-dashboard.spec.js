// @ts-check
/**
 * @file playwright/tests/U23-submissions-dashboard.spec.js
 *
 * U23 — Submissions dashboard (editorial), OMP suite (spec:
 * docs/specs/U23-submissions-dashboard.md). One test per canonical scenario
 * a press runs, in OMP vocabulary (press, monograph, series, Press Manager,
 * Series Editor — glossary substitution): common scenarios 1–12 and 16 plus
 * the OMP-specific scenario 14 (one review view over the two review
 * stages). Scenario 13 is OJS-only (issues), scenario 15 OPS-only. What the
 * scenarios leave out is the spec's Coverage section.
 *
 * Deliberate non-coverage (register IDs from the spec's Findings register —
 * 🐞 findings are never asserted as contract; ❓-parked claims are not
 * coverage gaps):
 * - A4/A5/A6 (🐞): S7 clicks each sort header at most twice; no test drives
 *   a cancelled or overdue reviewer state.
 * - A1 (❓): S11 asserts only the plain claims (no "Declined" entry for a
 *   Series Editor, their global search still finding it).
 * - A2 (❓): S12 asserts "Complete submission" is offered on an incomplete
 *   row (Rule 9c) and never presses it.
 * - A3 (❓): S10 asserts the conflict notice without its role phrase.
 * - A7 (❓): reviewer indicators are asserted for the Press Manager only.
 * - OMP1 (❓): nothing is asserted about a series filter's presence or
 *   absence.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (S6 and S16 ride publicknowledge, S6 with its own tagged
 * monograph). Every other test isolates on a scratch press with throwaway
 * users, since view counts and sidebar badges need a list only the test
 * controls. Mailpit reads (S3, S12) are scoped by the throwaway addresses
 * (PRINCIPLES A8) and settled by the scenario's own list read. Waits are
 * event-based (auto-wait on rows, headings, badges, the workflow panel and
 * the list's own reload) — no hard-coded sleeps. Everything runs in the
 * parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');
const {topModal} = require('../pages/ReviewStagePages.js');
const {completeReview} = require('../pages/ReviewerAssignmentPages.js');

const PK = 'publicknowledge';
const ACCESS_DENIED = 'The current role does not have access to this operation.';
const DAYS_FILTER = 'Days since last activity';
const EDITOR_FILTER = 'Assigned To Editor';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u23${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway user spec for the context scenario. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** The press's editorial views for a Press Manager, in spec Rule 2 order. */
const MANAGER_VIEWS = [
    'Assigned to me',
    'Active submissions',
    'Needs editor',
    'All in submission stage',
    'Needs reviews',
    'Awaiting reviews',
    'Reviews submitted',
    'Reviews overdue',
    'Author revisions submitted',
    'All in review stage',
    'All in copyediting stage',
    'All in production stage',
    'Scheduled for publication',
    'Published',
    'Declined',
];

/** A Series Editor's roster: the manager's minus "Needs editor"/"Declined". */
const SUB_EDITOR_VIEWS = MANAGER_VIEWS.filter(
    (name) => name !== 'Needs editor' && name !== 'Declined'
);

/** The six column headings of the editorial table (Rule 5). */
const COLUMNS = ['ID', 'Submissions', 'Stage', 'Days', 'Editorial Activity', 'Actions'];

/** Apply the Days filter at 30 through the panel (fresh rows drop out). */
async function applyDaysFilter(dash, days = 30) {
    await dash.openFilters();
    await dash.setDaysSinceLastActivity(days);
    await dash.applyFilters();
}

test.describe('Submissions dashboard — editorial (U23)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: land and walk the views', {tag: '@smoke'}, async ({page, ompApi}, testInfo) => {
        const tag = makeTag('s1', testInfo);
        const mg = `${tag}mg`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // One submitted monograph nobody is assigned to (it populates the
        // active/needs-editor/submission-stage views) and one published.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `walk${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `pub${tag}`, published: true,
        });

        // Landing: sign in on the press's login page: the Press Manager
        // lands on the editorial dashboard, "Assigned to me" view, under
        // the sidebar's "Editor Dashboard" group with the "Search
        // submissions" box at its top (Rule 1).
        await page.goto(`/index.php/${tag}/login`);
        const login = new LoginPage(page);
        await login.signIn(mg, getPassword(mg));
        await page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        const dash = new EditorialDashboardPage(page, tag);
        await dash.expectViewHeading('Assigned to me', 0);
        await expect(dash.menuGroupLink()).toBeVisible();
        await expect(dash.globalSearchBox()).toBeVisible();

        // The table: the heading names the view with its count over the six
        // columns; a Stage cell names the stage in plain text with a colored
        // dot beside it (Rule 5).
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        for (const column of COLUMNS) {
            await expect(dash.columnHeader(column)).toBeVisible();
        }
        await expect(page.getByRole('columnheader')).toHaveCount(COLUMNS.length);
        const active = dash.row(`walk${tag}`);
        await expect(dash.stageCell(active)).toHaveText(/Submission/);
        await expect(dash.stageDot(active)).toBeVisible();

        // The views: each entry opens the list under its own heading with
        // its count; badges carry the same numbers (Rules 1–2).
        const expectedCounts = new Map([
            ['Active submissions', 1],
            ['Needs editor', 1],
            ['All in submission stage', 1],
            ['Published', 1],
        ]);
        for (const name of MANAGER_VIEWS) {
            const count = expectedCounts.get(name) ?? 0;
            await dash.expectViewCount(name, count);
            await dash.openView(name);
            await dash.expectViewHeading(name, count);
            if (name === 'Published') {
                await expect(dash.row(`pub${tag}`)).toBeVisible();
                await expect(dash.row(`walk${tag}`)).toHaveCount(0);
            }
            if (name === 'Active submissions') {
                await expect(dash.row(`walk${tag}`)).toBeVisible();
                await expect(dash.row(`pub${tag}`)).toHaveCount(0);
            }
        }

        // Control: a view whose badge reads 0 shows a single "No Items" row
        // (Rule 5) — "Declined" is the last one walked and holds nothing.
        await expect(page.getByText('No Items')).toBeVisible();
        await expect(dash.row(`walk${tag}`)).toHaveCount(0);
        await expect(dash.dataRows()).toHaveCount(1);
    });

    test('S2: assigned-only scope', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s2', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                // The Series Editor holds Author and Reviewer too (fn-s2),
                // with no series assignment, so a submit auto-assigns nobody.
                user(se, 'Sana', 'Series', ['sectionEditor', 'author', 'externalReviewer']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // One monograph with the Series Editor assigned, one untouched, one
        // they submitted themselves, one they are on as a reviewer only.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `asg${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `una${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: se, title: `aut${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `rev${tag}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [{stage: 'external', reviewers: [{username: se, status: 'invited'}]}],
        });

        // Every view: the Series Editor's views hold only the assigned
        // monograph (Rules 2–3): badge counts across the whole roster…
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        for (const name of SUB_EDITOR_VIEWS) {
            const count = ['Assigned to me', 'Active submissions', 'All in submission stage']
                .includes(name) ? 1 : 0;
            await seDash.expectViewCount(name, count);
        }
        // …no "Needs editor" (or "Declined") entry at all, while the
        // neighboring entries render (Actors table / Rule 2).
        await expect(seDash.viewLink('Needs editor')).toHaveCount(0);
        await expect(seDash.viewLink('Declined')).toHaveCount(0);
        await expect(seDash.viewLink('Active submissions')).toBeVisible();

        // …and walked, each view lists the assigned one at most; the other
        // three appear in none (the heading count bounds each absence).
        for (const name of SUB_EDITOR_VIEWS) {
            await seDash.openView(name);
            const count = ['Assigned to me', 'Active submissions', 'All in submission stage']
                .includes(name) ? 1 : 0;
            await seDash.expectViewHeading(name, count);
            if (count) {
                await expect(seDash.row(`asg${tag}`)).toBeVisible();
            }
            for (const other of ['una', 'aut', 'rev']) {
                await expect(seDash.row(`${other}${tag}`)).toHaveCount(0);
            }
        }

        // Global search: the unassigned one is out of reach (Rule 7), with
        // the assigned title as the positive control taken the same way.
        await seDash.globalSearch(`una${tag}`);
        await seDash.expectViewHeading('Search Results', 0);
        await seDash.globalSearch(`asg${tag}`);
        await seDash.expectViewHeading('Search Results', 1);
        await expect(seDash.row(`asg${tag}`)).toBeVisible();

        // The submission they authored: not in the global search either,
        // while their "My Submissions as Author" group lists it.
        await seDash.globalSearch(`aut${tag}`);
        await seDash.expectViewHeading('Search Results', 0);
        const mySub = new MySubmissionsPage(sePage, tag);
        await expect(mySub.menuGroupLink()).toBeVisible();
        await mySub.goto();
        await expect(mySub.row(`aut${tag}`)).toBeVisible();
        await expect(mySub.row(`una${tag}`)).toHaveCount(0);

        // The submission they review: the same.
        await seDash.goto();
        await seDash.globalSearch(`rev${tag}`);
        await seDash.expectViewHeading('Search Results', 0);

        // Control: the Press Manager's "Active submissions" lists all four,
        // and their own "Assigned to me" stays empty (Rules 2–3).
        const mgPage = await (await asUser(mg)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.expectViewHeading('Assigned to me', 0);
        await mgDash.expectViewCount('Active submissions', 4);
        await mgDash.openView('Active submissions');
        await mgDash.expectViewHeading('Active submissions', 4);
        for (const title of ['asg', 'una', 'aut', 'rev']) {
            await expect(mgDash.row(`${title}${tag}`)).toBeVisible();
        }
    });

    test('S3: search within a view', async ({asUser, ompApi, pkpMail}, testInfo) => {
        const tag = makeTag('s3', testInfo);
        const mg = `${tag}mg`;
        const au = `${tag}au`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(au, 'Ada', 'Author', ['author']),
            ],
        });
        for (const title of [`finda${tag}`, `findb${tag}`, `findc${tag}`]) {
            await ompApi.createSubmission({
                tag, context: tag, submitter: au, title,
            });
        }
        await ompApi.createSubmission({
            tag, context: tag, submitter: au, title: `pub${tag}`, published: true,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // The search box narrows the current view; the heading keeps the
        // view's name and the count follows; the phrase shows as a chip
        // (Rule 6).
        await dash.searchFor(`finda${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`finda${tag}`)).toBeVisible();
        await expect(dash.row(`findb${tag}`)).toHaveCount(0);
        await expect(dash.searchChip(`finda${tag}`)).toBeVisible();
        await expect(dash.searchChipClearButton()).toBeVisible();

        // The chip's X restores the full view.
        await dash.searchChipClearButton().click();
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`findb${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toHaveCount(0);

        // A filter on top of the search: the filter's chip joins the search
        // chip, "Clear Filters" appears beside them, and the list holds only
        // the rows matching both — none, since today's rows are not idle
        // (Rules 6, 8; fn-s3).
        await dash.searchFor(`finda${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await applyDaysFilter(dash);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.row(`finda${tag}`)).toHaveCount(0);
        await expect(dash.searchChip(`finda${tag}`)).toBeVisible();
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toBeVisible();
        await expect(dash.clearFiltersButton()).toBeVisible();

        // Switching views clears the phrase and the filter: open
        // "Published": both chips are gone and the search box is empty;
        // back on "Active submissions", the full view shows (Rules 6, 8).
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 1);
        await expect(dash.row(`pub${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toHaveCount(0);
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toHaveCount(0);
        await expect(dash.clearFiltersButton()).toHaveCount(0);
        await expect(dash.searchBox()).toHaveValue('');
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`finda${tag}`)).toBeVisible();
        await expect(dash.row(`findb${tag}`)).toBeVisible();
        await expect(dash.row(`findc${tag}`)).toBeVisible();

        // Control: the in-page box narrows the current view and never
        // reaches beyond it: the published monograph is not found here.
        await dash.searchFor(`pub${tag}`);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.row(`pub${tag}`)).toHaveCount(0);
        await expect(dash.dataRows()).toHaveCount(1);
        await expect(page.getByText('No Items')).toBeVisible();

        // Mailbox: none of the above sent an email (Side effects) — the
        // list read above is the settled point; the throwaway addresses
        // scope the read (PRINCIPLES A8).
        expect(await pkpMail.count({to: `${mg}@mail.test`})).toBe(0);
        expect(await pkpMail.count({to: `${au}@mail.test`})).toBe(0);
    });

    test('S4: global search', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s4', testInfo);
        const mg = `${tag}mg`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // One declined monograph plus an active one as noise.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `act${tag}`,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();

        // Start from a non-default view (fn-s4): "Active submissions" —
        // where the declined monograph is not listed, and the in-page
        // search box renders (the positive control for its absence below).
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`decl${tag}`)).toHaveCount(0);
        await expect(dash.searchBox()).toBeVisible();

        // The sidebar box finds the declined monograph on the "Search
        // Results" view, its Stage cell reading "Declined", the phrase as a
        // chip, and no in-page search box (Rule 7).
        await dash.globalSearch(`decl${tag}`);
        await dash.expectViewHeading('Search Results', 1);
        const declined = dash.row(`decl${tag}`);
        await expect(declined).toBeVisible();
        await expect(dash.stageCell(declined)).toHaveText(/Declined/);
        await expect(dash.searchChip(`decl${tag}`)).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Filters on the results: the Days filter at 30 keeps only results
        // idle that long (none today), a filter chip joins the phrase chip,
        // and the view is still "Search Results".
        await applyDaysFilter(dash);
        await dash.expectViewHeading('Search Results', 0);
        await expect(dash.row(`decl${tag}`)).toHaveCount(0);
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toBeVisible();
        await expect(dash.searchChip(`decl${tag}`)).toBeVisible();

        // Clearing the phrase alone: the view stays "Search Results", the
        // filter chip still active.
        await dash.searchChipClearButton().click();
        await expect(dash.searchChip()).toHaveCount(0);
        await dash.expectViewHeading('Search Results');
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Clearing the filter too: the page returns to "Active submissions",
        // the view the search started from, with its in-page box back.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`act${tag}`)).toBeVisible();
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toHaveCount(0);
        await expect(dash.searchBox()).toBeVisible();

        // Control: only the sidebar's search reaches a declined monograph
        // from here.
        await dash.searchFor(`decl${tag}`);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.row(`decl${tag}`)).toHaveCount(0);
    });

    test('S5: filter the list', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(se, 'Sana', 'Series', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `days${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `pub${tag}`, published: true,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);

        // "Filters": a side panel titled "Filters" with "Days since last
        // activity", "Clear Filters" and "Apply Filters" (Rule 8; this
        // scratch press has no categories, and nothing is asserted about a
        // series field, OMP1). Set the slider to 30 and apply: the panel
        // closes, the fresh monograph (0 idle days) drops out, the heading
        // count follows, and the filter's chip shows with "Clear Filters"
        // beside it (fn-s5).
        const modal = await dash.openFilters();
        await expect(modal.getByRole('heading', {name: 'Filters'}).first()).toBeVisible();
        await expect(modal.getByText(DAYS_FILTER)).toBeVisible();
        await expect(modal.getByRole('button', {name: 'Clear Filters', exact: true})).toBeVisible();
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.row(`days${tag}`)).toHaveCount(0);
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toBeVisible();
        await expect(dash.clearFiltersButton()).toBeVisible();

        // "Clear Filters" restores the view.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`days${tag}`)).toBeVisible();
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toHaveCount(0);

        // Switching views: apply the same filter again, then open
        // "Published": the chip is gone and the view shows its full list.
        await applyDaysFilter(dash);
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toBeVisible();
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 1);
        await expect(dash.row(`pub${tag}`)).toBeVisible();
        await expect(dash.filterChip(`${DAYS_FILTER}:`)).toHaveCount(0);
        await expect(dash.clearFiltersButton()).toHaveCount(0);

        // "Assigned To Editor": the manager's panel lists the field; its
        // suggest list offers nothing until a name is typed (Fields table)
        // — the typed name's suggestion is the positive control.
        const panel = await dash.openFilters();
        const editorField = dash.filterSuggestField(EDITOR_FILTER);
        await expect(editorField).toBeVisible();
        await editorField.click();
        await expect(editorField).toBeFocused();
        await expect(dash.suggestOptions()).toHaveCount(0);
        await editorField.pressSequentially('Mira', {delay: 25});
        await expect(dash.suggestOptions().filter({hasText: 'Mira Manager'})).toBeVisible();
        await panel.getByRole('button', {name: 'Clear Filters', exact: true}).click();
        await dash.closeFilters();

        // Control: a Series Editor's panel has no "Assigned To Editor"
        // field, with the neighboring field as the positive control
        // (Rule 8).
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        const seModal = await seDash.openFilters();
        await expect(seModal.getByText(DAYS_FILTER)).toBeVisible();
        await expect(seModal.getByText(EDITOR_FILTER)).toHaveCount(0);
        await expect(seDash.filterSuggestField(EDITOR_FILTER)).toHaveCount(0);
    });

    test('S6: open a monograph in place', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag, context: PK, submitter: 'author.alex', title: `open${tag}`,
            series: 'monographs',
        });

        const page = await (await asUser('editor.diana')).newPage();
        const dash = new EditorialDashboardPage(page, PK);
        await dash.goto();
        const row = await dash.findRowByTag(tag);
        const urlBefore = page.url();

        // "View" opens the workflow as a panel over the list; the address
        // records which submission is open (Rule 11).
        await dash.viewButton(row).click();
        await dash.expectWorkflowOpen();
        expect(page.url()).toContain(`workflowSubmissionId=${submissionId}`);
        const urlOpen = page.url();

        // Reload: the recorded address reopens the panel (Rule 11).
        await page.goto(urlOpen);
        await dash.expectWorkflowOpen();

        // Close: the list is back as it was left, at the address it had
        // before "View".
        await dash.closeWorkflow();
        await expect(dash.row(tag)).toBeVisible();
        expect(page.url()).toBe(urlBefore);

        // Control: reloading the address after closing brings the bare
        // list, no panel.
        await page.goto(page.url());
        await expect(dash.heading()).toBeVisible({timeout: 30_000});
        await expect(dash.row(tag)).toBeVisible();
        await expect(page.getByRole('heading', {name: /^Workflow:/})).toHaveCount(0);
        expect(page.url()).not.toContain('workflowSubmissionId');
    });

    test('S7: sort by ID and Days', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s7', testInfo);
        const mg = `${tag}mg`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        const first = await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `ida${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `idb${tag}`,
        });
        const last = await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `idc${tag}`,
        });
        expect(last.submissionId).toBeGreaterThan(first.submissionId);

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // First click on "ID": descending — the address records the sort
        // and the highest ID rises to the top (Rules 4–5). (The third,
        // switch-off click is never made — register 🐞 A5.)
        await dash.sortButton('ID').click();
        await expect(page).toHaveURL(/sortColumn=id/);
        await expect(page).toHaveURL(/sortDirection=descending/);
        await expect(dash.firstDataRow()).toContainText(`idc${tag}`);

        // Second click flips it to ascending, address following.
        await dash.sortButton('ID').click();
        await expect(page).toHaveURL(/sortDirection=ascending/);
        await expect(dash.firstDataRow()).toContainText(`ida${tag}`);

        // Control: reloading the sorted address brings the rows back in the
        // same order.
        await page.goto(page.url());
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.firstDataRow()).toContainText(`ida${tag}`);

        // The "Days" header sorts by idle time the same way (all three rows
        // share an idle time here, so only the recorded sort is asserted,
        // fn-s7).
        await dash.sortButton('Days').click();
        await expect(page).toHaveURL(/sortColumn=lastActivity/);
        await expect(page).toHaveURL(/sortDirection=descending/);
        await dash.expectViewHeading('Active submissions', 3);
    });

    test('S8: triage a new monograph', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s8', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(se, 'Sana', 'Series', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `tri${tag}`,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();

        // "Needs editor": the fresh monograph lists there and under "All in
        // submission stage", with an "Assign Editor" button in its activity
        // cell (Rules 2, 9d).
        await dash.expectViewCount('Needs editor', 1);
        await dash.expectViewCount('All in submission stage', 1);
        await dash.openView('Needs editor');
        await expect(dash.row(`tri${tag}`)).toBeVisible();
        await expect(dash.assignEditorButton(dash.row(`tri${tag}`))).toBeVisible();
        await dash.openView('All in submission stage');
        await expect(dash.row(`tri${tag}`)).toBeVisible();

        // "Assign Editor": assign a Series Editor through the "Assign
        // Participant" window (opened from the row on "Active submissions",
        // where the row stays listed afterwards).
        await dash.openView('Active submissions');
        const row = dash.row(`tri${tag}`);
        await dash.assignEditorButton(row).click();
        const dlg = topModal(page);
        await expect(dlg.getByText('Assign Participant').first()).toBeVisible({
            timeout: 20_000,
        });
        await expect(dlg.getByRole('heading', {name: 'Locate a User'})).toBeVisible();
        await dlg.getByRole('combobox').first().selectOption({label: 'Series editor'});
        await dlg.getByRole('textbox', {name: 'Search User By Name'}).fill('Series');
        await dlg.getByRole('button', {name: 'Search', exact: true}).click();
        await expect(dlg.getByText('Sana Series')).toBeVisible({timeout: 20_000});
        await dlg.getByRole('radio').first().check();
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();

        // Back on the list: the button is gone and the cell is empty (Rules
        // 9d, 9i), the row keeps its place here, and the "Needs editor"
        // badge and the heading total moved in place (Rule 13).
        await expect(dash.assignEditorButton(row)).toHaveCount(0, {timeout: 30_000});
        await expect(row).toBeVisible();
        await expect(dash.activityCell(row)).toHaveText(/^\s*$/);
        await dash.expectViewCount('Needs editor', 0);
        await dash.openView('Needs editor');
        await dash.expectViewHeading('Needs editor', 0);
        await expect(dash.row(`tri${tag}`)).toHaveCount(0);

        // Control: the row still lists under "Active submissions" and "All
        // in submission stage".
        await dash.expectViewCount('Active submissions', 1);
        await dash.expectViewCount('All in submission stage', 1);
        await dash.openView('All in submission stage');
        await dash.expectViewHeading('All in submission stage', 1);
        await expect(dash.row(`tri${tag}`)).toBeVisible();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`tri${tag}`)).toBeVisible();
    });

    test('S9: review activity at a glance', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s9', testInfo);
        const mg = `${tag}mg`;
        const r1 = `${tag}ra`;
        const r2 = `${tag}rb`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
                user(r1, 'Rita', 'Rana', ['externalReviewer']),
                user(r2, 'Rein', 'Remo', ['externalReviewer']),
            ],
        });
        // One monograph in external review with no reviewers yet…
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `rva${tag}`,
            decisions: ['skipInternalReview'],
        });
        // …and one with two review requests out.
        const withReviewers = await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `rvb${tag}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [{
                stage: 'external',
                reviewers: [
                    {username: r1, status: 'invited'},
                    {username: r2, status: 'invited'},
                ],
            }],
        });
        const AWAITING = /Awaiting Response from the reviewer/;

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('All in review stage');
        await dash.expectViewHeading('All in review stage', 2);

        // No reviewers yet: the first row's cell offers "Assign Reviewers",
        // which opens the Add Reviewer window; close it (Rule 9e).
        const bare = dash.row(`rva${tag}`);
        await dash.assignReviewersButton(bare).click();
        const addModal = topModal(page);
        await expect(
            addModal.getByRole('heading', {name: 'Locate a Reviewer'})
        ).toBeVisible({timeout: 20_000});
        await addModal.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(
            page.getByRole('heading', {name: 'Locate a Reviewer'})
        ).toHaveCount(0, {timeout: 20_000});

        // Two requests out: the second row's cell shows two countdown
        // indicators, and the submission lists under "Awaiting reviews"
        // (Rules 2, 10); "Reviews submitted" holds nothing yet.
        const busy = dash.row(`rvb${tag}`);
        const awaiting = dash.activityIndicator(busy, AWAITING);
        await expect(awaiting).toHaveCount(2);
        await expect(dash.activityIndicator(bare, AWAITING)).toHaveCount(0);
        await dash.expectViewCount('Awaiting reviews', 1);
        await dash.expectViewCount('Reviews submitted', 0);

        // A popover: it names the reviewer, the review type and the status,
        // with "Edit Due Date", "View details" and "Unassign" (Rule 10).
        await awaiting.first().click();
        await expect(busy.getByText(/Rana|Remo/).first()).toBeVisible();
        await expect(busy.getByText('Anonymous Reviewer/Anonymous Author')).toBeVisible();
        await expect(busy.getByRole('button', {name: 'Edit Due Date'})).toBeVisible();
        await expect(busy.getByRole('button', {name: 'View details'})).toBeVisible();
        await expect(busy.getByRole('button', {name: 'Unassign'})).toBeVisible();

        // "View details": the window the workflow's Reviewers panel opens
        // for that reviewer appears; close it: the list reloads (Rule 10).
        await busy.getByRole('button', {name: 'View details'}).click();
        const details = dash.reviewDetailsDialog();
        await expect(details).toBeVisible({timeout: 20_000});
        await expect(details.getByText(/Rana|Remo/).first()).toBeVisible();
        const reloaded = dash.listReload();
        await details.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(details).toHaveCount(0, {timeout: 20_000});
        await reloaded;
        await dash.expectViewHeading('All in review stage', 2);
        await expect(dash.activityIndicator(dash.row(`rvb${tag}`), AWAITING)).toHaveCount(2);

        // Reviewer: one of the two accepts and submits their review.
        const reviewerPage = await (await asUser(r2)).newPage();
        await completeReview(reviewerPage, tag, withReviewers.submissionId, {
            comment: `Review comment ${tag}`,
        });

        // The completed review: that reviewer's indicator is now a done
        // mark whose popover reads "Review completed on {date}" with "View
        // unread recommendation"; the submission now lists under "Reviews
        // submitted" too.
        await dash.goto();
        await dash.openView('All in review stage');
        await dash.expectViewCount('Reviews submitted', 1);
        await dash.expectViewCount('Awaiting reviews', 1);
        const busyAfter = dash.row(`rvb${tag}`);
        const done = dash.activityIndicator(busyAfter, /Review completed on/);
        await expect(done).toHaveCount(1);
        await done.click();
        await expect(busyAfter.getByText('Remo').first()).toBeVisible();
        const unread = busyAfter.getByRole('button', {name: 'View unread recommendation'});
        await expect(unread).toBeVisible();
        await expect(busyAfter.getByRole('button', {name: 'View recommendation', exact: true})).toHaveCount(0);

        // Press it and close the window that opens: reopened, the popover
        // offers "View recommendation".
        await unread.click();
        const readWindow = topModal(page);
        const readClose = readWindow.getByRole('button', {name: 'Close', exact: true}).first();
        await expect(readClose).toBeVisible({timeout: 20_000});
        const reloadedAgain = dash.listReload();
        await readClose.click();
        await reloadedAgain;
        await page.keyboard.press('Escape');
        const doneAgain = dash.activityIndicator(dash.row(`rvb${tag}`), /Review completed on/);
        await expect(doneAgain).toHaveCount(1);
        await doneAgain.click();
        const rowAgain = dash.row(`rvb${tag}`);
        await expect(rowAgain.getByRole('button', {name: 'View recommendation', exact: true})).toBeVisible();
        await expect(rowAgain.getByRole('button', {name: 'View unread recommendation'})).toHaveCount(0);
        await page.keyboard.press('Escape');

        // Control: the other reviewer's indicator is still a countdown ring
        // whose popover reads "Awaiting Response from the reviewer".
        const stillAwaiting = dash.activityIndicator(dash.row(`rvb${tag}`), AWAITING);
        await expect(stillAwaiting).toHaveCount(1);
        await stillAwaiting.click();
        await expect(dash.row(`rvb${tag}`).getByText('Rana').first()).toBeVisible();
        await expect(dash.row(`rvb${tag}`).getByRole('button', {name: 'Unassign'})).toBeVisible();
    });

    test('S10: the conflict row', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s10', testInfo);
        const ma = `${tag}ma`;
        await ompApi.createContext({
            tag,
            users: [
                user(ma, 'Mona', 'Managerauthor', ['manager', 'author']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // Their own monograph, plus another author's as the control row.
        await ompApi.createSubmission({
            tag, context: tag, submitter: ma, title: `own${tag}`,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `oth${tag}`,
        });

        const page = await (await asUser(ma)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.gotoView('active');
        await dash.expectViewHeading('Active submissions', 2);

        // Their own row shows the conflict notice and offers no buttons at
        // all — no "View", no "Assign Editor" (Rule 9a; the notice's fixed
        // role wording is register ❓ A3 and is not asserted).
        const own = dash.row(`own${tag}`);
        await expect(own).toContainText('You cannot access this submission');
        await expect(own).toContainText('go to "My Submissions"');
        await expect(own.getByRole('button')).toHaveCount(0);
        await expect(dash.viewButton(own)).toHaveCount(0);
        await expect(dash.assignEditorButton(own)).toHaveCount(0);

        // The ordinary row beside it keeps both (positive controls).
        const oth = dash.row(`oth${tag}`);
        await expect(dash.viewButton(oth)).toBeVisible();
        await expect(dash.assignEditorButton(oth)).toBeVisible();

        // The same monograph sits normally under "My Submissions as
        // Author" (scenario 10).
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions');
        await expect(mySub.row(`own${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`own${tag}`))).toBeVisible();
    });

    test("S11: declined out of the Series Editor's sight", async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s11', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(se, 'Sana', 'Series', ['sectionEditor']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // The Series Editor's assigned monograph, declined at the
        // Submission stage (fn-s11).
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `dcl${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
            decisions: ['initialDecline'],
        });

        // Press Manager: "Declined" lists it with its Stage cell reading
        // "Declined", its activity cell naming the stage by its plain name,
        // and the row keeping "View" (Rules 2, 9b).
        const mgPage = await (await asUser(mg)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.expectViewCount('Declined', 1);
        await mgDash.openView('Declined');
        const row = mgDash.row(`dcl${tag}`);
        await expect(row).toBeVisible();
        await expect(mgDash.stageCell(row)).toHaveText(/Declined/);
        await expect(mgDash.activityCell(row)).toContainText('Declined during the Submission stage.');
        await expect(mgDash.viewButton(row)).toBeVisible();

        // Series Editor: their group has no "Declined" entry (register ❓
        // A1's plain claim) and no "Needs editor" entry, and the monograph
        // is gone from every one of their views (Rule 2)…
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        await expect(seDash.viewLink('Declined')).toHaveCount(0);
        await expect(seDash.viewLink('Needs editor')).toHaveCount(0);
        await expect(seDash.viewLink('Active submissions')).toBeVisible();
        for (const name of SUB_EDITOR_VIEWS) {
            await seDash.expectViewCount(name, 0);
        }
        await seDash.openView('Active submissions');
        await seDash.expectViewHeading('Active submissions', 0);
        await expect(seDash.row(`dcl${tag}`)).toHaveCount(0);

        // …while their global search still finds it, with "View" (Rule 7).
        await seDash.globalSearch(`dcl${tag}`);
        await seDash.expectViewHeading('Search Results', 1);
        await expect(seDash.row(`dcl${tag}`)).toBeVisible();
        await expect(seDash.viewButton(seDash.row(`dcl${tag}`))).toBeVisible();

        // Control: the Press Manager's own group offers "Declined" and
        // "Needs editor".
        await expect(mgDash.viewLink('Declined')).toBeVisible();
        await expect(mgDash.viewLink('Needs editor')).toBeVisible();
    });

    test('S12: bulk-delete incomplete monographs', async ({asUser, ompApi, pkpMail}, testInfo) => {
        const tag = makeTag('s12', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        const aa = `${tag}aa`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(se, 'Sana', 'Series', ['sectionEditor']),
                user(aa, 'Ada', 'Author', ['author']),
                user(`${tag}ab`, 'Bea', 'Author', ['author']),
            ],
        });
        // Two incomplete monographs by different authors + one submitted.
        await ompApi.createSubmission({
            tag, context: tag, submitter: aa, title: `bda${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}ab`, title: `bdb${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: aa, title: `bdc${tag}`,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // The incomplete rows: each has its Stage cell reading "Incomplete",
        // offers "Complete submission" (Rule 9c; register ❓ A2, offered but
        // never pressed) and has no "View"; the submitted row has "View".
        for (const title of [`bda${tag}`, `bdb${tag}`]) {
            const row = dash.row(title);
            await expect(dash.stageCell(row)).toHaveText(/Incomplete/);
            await expect(dash.completeSubmissionButton(row)).toBeVisible();
            await expect(dash.viewButton(row)).toHaveCount(0);
        }
        const submitted = dash.row(`bdc${tag}`);
        await expect(dash.stageCell(submitted)).toHaveText(/Submission/);
        await expect(dash.viewButton(submitted)).toBeVisible();
        await expect(dash.completeSubmissionButton(submitted)).toHaveCount(0);

        // "More Actions" → "Delete Incomplete Submissions": selection mode,
        // a checkbox on the two incomplete rows only, the delete button
        // disabled until a row is ticked (Rule 12).
        await dash.enterBulkDeleteSelection();
        await expect(dash.row(`bda${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`bdb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`bdc${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteCancelButton()).toBeVisible();
        await expect(dash.bulkDeleteButton()).toBeDisabled();

        // Delete: tick both, delete, confirm — both are gone and the badges
        // and the heading total drop in place (Rules 12–13).
        await dash.checkRowCheckbox(dash.row(`bda${tag}`));
        await dash.checkRowCheckbox(dash.row(`bdb${tag}`));
        await expect(dash.bulkDeleteButton()).toBeEnabled();
        await dash.bulkDeleteButton().click();
        const dialog = dash.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone. Please confirm to proceed.'
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await expect(dash.row(`bda${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(dash.row(`bdb${tag}`)).toHaveCount(0);
        await expect(dash.row(`bdc${tag}`)).toBeVisible();
        await dash.expectViewHeading('Active submissions', 1);
        await dash.expectViewCount('Active submissions', 1);
        await dash.expectViewCount('Needs editor', 1);

        // "More Actions" afterwards: with no incomplete row left on the
        // page, "Delete Incomplete Submissions" is grayed out (Rule 12).
        const grayed = await dash.openMoreActions();
        await expect(grayed).toBeDisabled();
        await dash.closeMoreActions();

        // The author's own list: signed in as one of the drafts' authors,
        // My Submissions no longer lists it (their submitted monograph is
        // the positive control), and no email about the deletion arrived
        // (Side effects; the list read is the settled point, the throwaway
        // address the scope, PRINCIPLES A8).
        const aaPage = await (await asUser(aa)).newPage();
        const mySub = new MySubmissionsPage(aaPage, tag);
        await mySub.goto();
        await mySub.expectViewCount('Incomplete submissions', 0);
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 0);
        await expect(mySub.row(`bda${tag}`)).toHaveCount(0);
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 1);
        await expect(mySub.row(`bdc${tag}`)).toBeVisible();
        await expect(mySub.row(`bda${tag}`)).toHaveCount(0);
        expect(await pkpMail.count({to: `${aa}@mail.test`})).toBe(0);

        // Control: a Series Editor's dashboard shows no "More Actions"
        // button at all, with the neighboring controls as positive
        // controls (Rule 12 / fn-s12).
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        await expect(seDash.filtersButton()).toBeVisible();
        await expect(seDash.searchBox()).toBeVisible();
        await expect(seDash.moreActionsButton()).toHaveCount(0);
    });

    test('S14: one review view, two review stages', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s14', testInfo);
        const mg = `${tag}mg`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        // One monograph in Internal Review, another in External Review, no
        // reviewers on either round (fn-s14).
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `int${tag}`,
            decisions: ['sendInternalReview'],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `ext${tag}`,
            decisions: ['skipInternalReview'],
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();

        // "All in review stage" spans both review stages (Rule 2 /
        // scenario 14) — one entry, both monographs, each with its stage
        // in the Stage cell.
        await dash.expectViewCount('All in review stage', 2);
        await dash.openView('All in review stage');
        await dash.expectViewHeading('All in review stage', 2);
        const internal = dash.row(`int${tag}`);
        const external = dash.row(`ext${tag}`);
        await expect(dash.stageCell(internal)).toHaveText(/Internal Review/);
        await expect(dash.stageCell(external)).toHaveText(/External Review/);

        // The internal one's activity cell offers "Assign Reviewers", like
        // the external one's (Rule 9e).
        await expect(dash.assignReviewersButton(internal)).toBeVisible();
        await expect(dash.assignReviewersButton(external)).toBeVisible();

        // Control: the sidebar offers no separate entry for either review
        // stage, while the neighboring entries render.
        await expect(dash.viewLink('All in review stage')).toBeVisible();
        await expect(dash.viewLink('All in copyediting stage')).toBeVisible();
        for (const absent of ['All in internal review stage', 'All in external review stage',
            'Internal Review', 'External Review', 'All in peer review']) {
            await expect(dash.viewLink(absent)).toHaveCount(0);
        }
        await expect(dash.sideNav().locator('a[href*="dashboard/editorial"]')
            .filter({hasText: /review stage/i})).toHaveCount(1);
    });

    test('S16: refused at the address', async ({asUser}) => {
        // The address: a signed-in Author-only account types the editorial
        // dashboard's address: the access-denied page shows (Actors row 1;
        // fn-s16).
        const authorPage = await (await asUser('author.alex')).newPage();
        await authorPage.goto(`/index.php/${PK}/dashboard/editorial`);
        await expect(authorPage.getByText(ACCESS_DENIED)).toBeVisible({timeout: 30_000});
        await expect(authorPage.getByRole('heading', {name: /^Assigned to me/})).toHaveCount(0);
        await expect(authorPage.locator('#app-nav')).toHaveCount(0);

        // Control: a Press Manager at the same address opens the dashboard.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(managerPage, PK);
        await dash.goto();
        await dash.expectViewHeading('Assigned to me');
        await expect(dash.menuGroupLink()).toBeVisible();
        await expect(managerPage.getByText(ACCESS_DENIED)).toHaveCount(0);
    });
});
