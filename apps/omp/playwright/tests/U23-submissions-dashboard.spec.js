// @ts-check
/**
 * @file playwright/tests/U23-submissions-dashboard.spec.js
 *
 * U23 — Submissions dashboard (editorial), OMP suite (spec:
 * docs/specs/U23-submissions-dashboard.md). One test per canonical scenario
 * a press runs, in OMP vocabulary (press, monograph, series, Press Manager,
 * Series Editor — glossary substitution): common scenarios 1–12 plus the
 * OMP-specific scenario 14 (one review view over the two review stages).
 * Scenario 13 is OJS-only (issues), scenario 15 OPS-only.
 *
 * Deliberate non-coverage (register IDs from the spec's Findings register —
 * 🐞 and ❓ findings are never asserted as contract):
 * - A4/A5/A6 🐞: S7 clicks each sort header at most twice (the third,
 *   switch-off state and its stale address are A5's territory); no test
 *   drives a cancelled or overdue reviewer state, so the misattributed
 *   cancelled popover (A4) and the "response" wording of the overdue one
 *   (A6) are never rendered.
 * - A1 ❓: S11 asserts only the spec's plain claims — no "Declined" sidebar
 *   entry for a Series Editor, all their views empty, their global search
 *   still finding the declined monograph (Rule 7). Whether they SHOULD keep
 *   a view is the open question and is asserted neither way.
 * - A2 ❓: no test presses (or asserts) "Complete submission" on the
 *   editorial dashboard; S12's incomplete rows are asserted through their
 *   checkboxes and missing "View" only (submitted row as positive control).
 * - A3 ❓: S10 asserts the conflict notice WITHOUT its role phrase ("as a
 *   Journal Manager" on a press is the open wording question).
 * - A7 ❓: reviewer indicators are asserted for the Press Manager only; what
 *   an assigned Series Editor or assistant sees is not asserted.
 * - OMP1 ❓: nothing is asserted about a series filter's presence OR
 *   absence; S5 checks only the fields the spec's table names for a press
 *   without categories (Assigned To Editor, Days since last activity).
 * - Scenario 7's paging leg (31+ rows) is dropped per spec fn-s7 (sorting
 *   is the load-bearing claim; seeding cost prohibitive).
 * - The monthly outstanding-tasks email (Side effects) has no canonical
 *   scenario and would need the scheduled-task runner (serial project);
 *   not covered here. The dashboard itself sends no mail, so the suite
 *   makes no Mailpit assertions.
 * - Rule 1's attention-colored "Reviews overdue" badge, Rule 12's
 *   grayed-out menu state on pages without incomplete rows, and Rule 11's
 *   workflow-panel CONTENT (other features' territory) have no canonical
 *   scenario and are not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (only S6 rides publicknowledge, with its own tagged
 * monograph). Every other test isolates on a scratch press with throwaway
 * users, since view counts and sidebar badges need a list only the test
 * controls. Waits are event-based (auto-wait on rows, headings, badges and
 * the workflow panel) — no hard-coded sleeps. Everything runs in the
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
        // One submitted monograph nobody is assigned to: it populates the
        // active/needs-editor/submission-stage views; the rest stay empty.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `walk${tag}`,
        });

        // Sign in on the press's login page: the Press Manager lands on the
        // editorial dashboard, "Assigned to me" view (scenario 1 / Rule 1).
        await page.goto(`/index.php/${tag}/login`);
        const login = new LoginPage(page);
        await login.signIn(mg, getPassword(mg));
        await page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        const dash = new EditorialDashboardPage(page, tag);
        await dash.expectViewHeading('Assigned to me', 0);

        // The sidebar's "Editor Dashboard" group with the "Search
        // submissions" box at its top (Rule 1).
        await expect(dash.menuGroupLink()).toBeVisible();
        await expect(dash.globalSearchBox()).toBeVisible();

        // Walk the entries: each opens the list under its own heading with
        // its count; badges carry the same numbers (Rules 1–2).
        const expectedCounts = new Map([
            ['Active submissions', 1],
            ['Needs editor', 1],
            ['All in submission stage', 1],
        ]);
        for (const name of MANAGER_VIEWS) {
            const count = expectedCounts.get(name) ?? 0;
            await dash.expectViewCount(name, count);
            if (name === 'Assigned to me') {
                continue; // the landing view, already open and asserted
            }
            await dash.openView(name);
            await dash.expectViewHeading(name, count);
        }

        // A view holding nothing shows a single "No Items" row (Rule 5) —
        // "Declined" is the last one walked and holds nothing.
        await expect(page.getByText('No Items')).toBeVisible();
        await expect(dash.row(`walk${tag}`)).toHaveCount(0);
    });

    test('S2: assigned-only scope', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s2', testInfo);
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
        // One monograph with the Series Editor assigned, one untouched.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `asg${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}au`, title: `una${tag}`,
        });

        // The Series Editor's views hold only the assigned monograph
        // (Rules 2–3): badge counts across the whole roster…
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

        // "Active submissions" lists the assigned one; the unassigned one
        // appears nowhere (the heading count bounds the absence).
        await seDash.openView('Active submissions');
        await seDash.expectViewHeading('Active submissions', 1);
        await expect(seDash.row(`asg${tag}`)).toBeVisible();
        await expect(seDash.row(`una${tag}`)).toHaveCount(0);

        // Not in their global search either (Rule 7) — with the assigned
        // title as the positive control taken the same way.
        await seDash.globalSearch(`una${tag}`);
        await seDash.expectViewHeading('Search Results', 0);
        await seDash.globalSearch(`asg${tag}`);
        await seDash.expectViewHeading('Search Results', 1);
        await expect(seDash.row(`asg${tag}`)).toBeVisible();

        // The Press Manager sees both, and their own "Assigned to me"
        // stays empty (Rules 2–3).
        const mgPage = await (await asUser(mg)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.expectViewHeading('Assigned to me', 0);
        await mgDash.expectViewCount('Active submissions', 2);
        await mgDash.openView('Active submissions');
        await expect(mgDash.row(`asg${tag}`)).toBeVisible();
        await expect(mgDash.row(`una${tag}`)).toBeVisible();
    });

    test('S3: search within a view', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s3', testInfo);
        const mg = `${tag}mg`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(`${tag}au`, 'Ada', 'Author', ['author']),
            ],
        });
        for (const title of [`finda${tag}`, `findb${tag}`, `findc${tag}`]) {
            await ompApi.createSubmission({
                tag, context: tag, submitter: `${tag}au`, title,
            });
        }

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // The search narrows the current view; the heading keeps the view's
        // name and the count follows; the phrase shows as a chip (Rule 6).
        await dash.searchFor(`finda${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`finda${tag}`)).toBeVisible();
        await expect(dash.row(`findb${tag}`)).toHaveCount(0);
        await expect(dash.contentArea().getByText('Search:', {exact: true})).toBeVisible();
        await expect(dash.searchChipClearButton()).toBeVisible();

        // The chip's X restores the full view.
        await dash.searchChipClearButton().click();
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`findb${tag}`)).toBeVisible();

        // Switching views clears the phrase (Rule 6).
        await dash.searchFor(`finda${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await dash.openView('All in submission stage');
        await dash.expectViewHeading('All in submission stage', 3);
        await expect(dash.searchBox()).toHaveValue('');
        await expect(dash.searchChipClearButton()).toHaveCount(0);
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

        // The sidebar's global search finds the declined monograph on the
        // "Search Results" view, phrase as a chip, and the in-page search
        // box disappears there (Rule 7).
        await dash.globalSearch(`decl${tag}`);
        await dash.expectViewHeading('Search Results', 1);
        await expect(dash.row(`decl${tag}`)).toBeVisible();
        await expect(dash.searchChipClearButton()).toBeVisible();
        await expect(dash.searchBox()).toHaveCount(0);

        // Clearing the chip returns to the view the search started from.
        await dash.searchChipClearButton().click();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`act${tag}`)).toBeVisible();
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

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);

        // The manager's Filters panel offers "Assigned To Editor" and "Days
        // since last activity" (Fields table; this scratch press has no
        // categories — and nothing is asserted about a series field, OMP1).
        const modal = await dash.openFilters();
        await expect(modal.getByText('Assigned To Editor')).toBeVisible();
        await expect(modal.getByText('Days since last activity')).toBeVisible();

        // Slide "Days since last activity" to 1 and apply: the freshly
        // seeded monograph (0 idle days) drops out, the panel closes, and a
        // filter chip appears (Rule 8).
        await modal.getByRole('slider').press('ArrowRight');
        await modal.getByRole('button', {name: 'Apply Filters', exact: true}).click();
        await expect(modal).toHaveCount(0, {timeout: 30_000});
        await dash.expectViewHeading('Active submissions', 0);
        await expect(dash.row(`days${tag}`)).toHaveCount(0);
        await expect(
            dash.contentArea().getByText('Days since last activity:', {exact: true})
        ).toBeVisible();

        // "Clear Filters" restores the view.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`days${tag}`)).toBeVisible();

        // A Series Editor's panel has no "Assigned To Editor" field, with
        // the neighboring field as the positive control (Rule 8).
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        const seModal = await seDash.openFilters();
        await expect(seModal.getByText('Days since last activity')).toBeVisible();
        await expect(seModal.getByText('Assigned To Editor')).toHaveCount(0);
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

        // Closing returns to the exact address the list was left at.
        await dash.closeWorkflow();
        await expect(dash.row(tag)).toBeVisible();
        expect(page.url()).toBe(urlBefore);

        // Reloading the recorded address reopens the panel (Rule 11).
        await page.goto(urlOpen);
        await dash.expectWorkflowOpen();
        await dash.closeWorkflow();
        expect(page.url()).not.toContain('workflowSubmissionId');
        await expect(dash.row(tag)).toBeVisible();
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

        // The "Days" header sorts by idle time the same way (all three rows
        // share an idle time here, so only the recorded sort is asserted).
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

        // The fresh monograph lists under "Needs editor" with an "Assign
        // Editor" button in its activity cell (Rules 2, 9d).
        await dash.expectViewCount('Needs editor', 1);
        await dash.openView('Needs editor');
        await expect(dash.row(`tri${tag}`)).toBeVisible();
        await expect(dash.assignEditorButton(dash.row(`tri${tag}`))).toBeVisible();

        // Assign a Series Editor through the "Assign Participant" window
        // (opened from the row on "Active submissions", where the row stays
        // listed afterwards).
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

        // Back on the list: the button is gone (cell quiet, Rule 9d), the
        // row keeps its place here, and the counts moved in place (Rule 13).
        await expect(dash.assignEditorButton(row)).toHaveCount(0, {timeout: 30_000});
        await expect(row).toBeVisible();
        await dash.expectViewCount('Needs editor', 0);
        await dash.openView('Needs editor');
        await dash.expectViewHeading('Needs editor', 0);
        await expect(dash.row(`tri${tag}`)).toHaveCount(0);
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

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('All in review stage');
        await dash.expectViewHeading('All in review stage', 2);

        // While the round has no reviewers, the cell offers "Assign
        // Reviewers", which opens the Add Reviewer window (Rule 9e).
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

        // With two requests out, the cell shows two countdown indicators;
        // the popover names the reviewer and the status, with "Edit Due
        // Date", "View details" and "Unassign" (Rule 10).
        const busy = dash.row(`rvb${tag}`);
        const awaiting = dash.activityIndicator(busy, /Awaiting Response from the reviewer/);
        await expect(awaiting).toHaveCount(2);
        await awaiting.first().click();
        await expect(busy.getByText(/Rana|Remo/).first()).toBeVisible();
        await expect(busy.getByRole('button', {name: 'Edit Due Date'})).toBeVisible();
        await expect(busy.getByRole('button', {name: 'View details'})).toBeVisible();
        await expect(busy.getByRole('button', {name: 'Unassign'})).toBeVisible();
        await page.keyboard.press('Escape');

        // One reviewer accepts and submits their review…
        const reviewerPage = await (await asUser(r2)).newPage();
        await completeReview(reviewerPage, tag, withReviewers.submissionId, {
            comment: `Review comment ${tag}`,
        });

        // …and their indicator turns to a done mark whose popover reads
        // "Review completed on {date}" with "View unread recommendation";
        // the other request keeps its countdown (positive control).
        await dash.goto();
        await dash.openView('All in review stage');
        const busyAfter = dash.row(`rvb${tag}`);
        const done = dash.activityIndicator(busyAfter, /Review completed on/);
        await expect(done).toHaveCount(1);
        await expect(
            dash.activityIndicator(busyAfter, /Awaiting Response from the reviewer/)
        ).toHaveCount(1);
        await done.click();
        await expect(busyAfter.getByText('Remo').first()).toBeVisible();
        await expect(
            busyAfter.getByRole('button', {name: 'View unread recommendation'})
        ).toBeVisible();
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

        // The Press Manager finds it under "Declined", its activity cell
        // naming the stage by its plain name, the row keeping "View"
        // (Rules 2, 9b).
        const mgPage = await (await asUser(mg)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.expectViewCount('Declined', 1);
        await mgDash.openView('Declined');
        const row = mgDash.row(`dcl${tag}`);
        await expect(row).toBeVisible();
        await expect(row).toContainText('Declined during the Submission stage.');
        await expect(mgDash.viewButton(row)).toBeVisible();

        // The Series Editor's sidebar has no "Declined" entry and every
        // view of theirs is empty (Rule 2 / register ❓ A1's plain claims)…
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        await expect(seDash.viewLink('Declined')).toHaveCount(0);
        await expect(seDash.viewLink('Active submissions')).toBeVisible();
        for (const name of SUB_EDITOR_VIEWS) {
            await seDash.expectViewCount(name, 0);
        }

        // …while their global search still finds it (Rule 7).
        await seDash.globalSearch(`dcl${tag}`);
        await seDash.expectViewHeading('Search Results', 1);
        await expect(seDash.row(`dcl${tag}`)).toBeVisible();
    });

    test('S12: bulk-delete incomplete monographs', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s12', testInfo);
        const mg = `${tag}mg`;
        const se = `${tag}se`;
        await ompApi.createContext({
            tag,
            users: [
                user(mg, 'Mira', 'Manager', ['manager']),
                user(se, 'Sana', 'Series', ['sectionEditor']),
                user(`${tag}aa`, 'Ada', 'Author', ['author']),
                user(`${tag}ab`, 'Bea', 'Author', ['author']),
            ],
        });
        // Two incomplete monographs by different authors + one submitted.
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}aa`, title: `bda${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}ab`, title: `bdb${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: `${tag}aa`, title: `bdc${tag}`,
        });

        const page = await (await asUser(mg)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // Selection mode: checkboxes on the two incomplete rows only, the
        // delete button disabled until something is ticked (Rule 12). The
        // incomplete rows have no "View" while the submitted one does
        // (Rule 9c leg; the "Complete submission" affordance is ❓ A2 and
        // not asserted).
        await expect(dash.viewButton(dash.row(`bdc${tag}`))).toBeVisible();
        await expect(dash.viewButton(dash.row(`bda${tag}`))).toHaveCount(0);
        await dash.enterBulkDeleteSelection();
        await expect(dash.row(`bda${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`bdb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`bdc${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteButton()).toBeDisabled();

        // Tick both, delete, confirm — both are gone and the counts drop
        // in place (Rules 12–13).
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

        // A Series Editor's dashboard shows no "More Actions" button at
        // all, with the neighboring controls as positive controls
        // (Rule 12 / fn-s12).
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
        // One monograph in Internal Review, another in External Review.
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
        // in the bubble.
        await dash.expectViewCount('All in review stage', 2);
        await dash.openView('All in review stage');
        await dash.expectViewHeading('All in review stage', 2);
        const internal = dash.row(`int${tag}`);
        const external = dash.row(`ext${tag}`);
        await expect(internal).toContainText('Internal Review');
        await expect(external).toContainText('External Review');

        // The internal round's activity cell shows its round state just as
        // the external one does (both rounds await reviewers, Rule 9e).
        await expect(dash.assignReviewersButton(internal)).toBeVisible();
        await expect(dash.assignReviewersButton(external)).toBeVisible();
    });
});
