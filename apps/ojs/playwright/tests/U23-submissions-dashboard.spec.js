// @ts-check
/**
 * @file playwright/tests/U23-submissions-dashboard.spec.js
 *
 * Submissions dashboard (editorial) — OJS suite, one test per canonical
 * scenario the spec runs on OJS (common scenarios 1–12 + OJS-specific 13;
 * scenario 14 is OMP-only, 15 OPS-only — they live in those apps' suites).
 * Spec: docs/specs/U23-submissions-dashboard.md.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A4/A6 🐞: S9 drives only the awaiting-response and completed reviewer
 *   states; the cancelled-by-editor and review-overdue popovers (the two
 *   mis-worded ones) are never opened, and their wording is asserted
 *   neither way.
 * - A5 🐞: S7 clicks each sortable header twice (descending, ascending) and
 *   never the third, address-desynchronizing click; the un-sort state is
 *   asserted neither way.
 * - A1 ❓: S11 asserts the current roster facts the spec records as rules
 *   (no "Declined" sidebar entry for a Section Editor; their global search
 *   still finds the declined submission) — whether editors SHOULD keep a
 *   declined view stays open.
 * - A2 ❓: no test presses "Complete submission" from the editorial
 *   dashboard or asserts its presence on another author's draft.
 * - A3 ❓: S10 asserts the conflict notice by wording-neutral fragments
 *   ("You cannot access this submission…", "My Submissions") — the
 *   role-name wording under question is asserted neither way.
 * - A7 ❓: no assistant-side indicator-count comparison is made; S9 checks
 *   indicators as a Journal Manager only.
 * - Scenario 7's paging leg (31+ rows) is dropped per the spec's own
 *   allowance (fn-s7: sorting is the load-bearing claim); pager controls
 *   are not asserted.
 * - Scenario 5's "stale submission" cannot be seeded (no scenario key sets
 *   dateLastActivity; PRINCIPLES A3 forbids a one-off builder key), so the
 *   Days filter leg asserts narrowing/chip/restore against fresh rows
 *   (filter to 30 days → empty list) rather than isolating a stale row.
 * - The monthly outstanding-tasks email (Side effects) is a scheduled-task
 *   surface with no canonical scenario — serial-scope, not covered here.
 *   The dashboard itself sends no mail, so this suite makes no Mailpit
 *   assertions.
 * - Rule 1's "Reviews overdue" badge color and Rule 10's full nine-state
 *   popover matrix are not canonical scenarios here (the reviewer-state
 *   windows themselves are U27's).
 *
 * Seeding: scenario endpoints only; publicknowledge and the 18 seeded users
 * are read-only. Tests that assert counts or sidebar badges isolate on
 * scratch journals with throwaway users; S6, S9 and S13 seed submissions in
 * publicknowledge (S13 needs the seeded issues) and scope every claim by
 * the seed tag through the list's own search, bounded by that search's
 * response or the heading count. Absence assertions carry same-shape
 * positive controls. No hard-coded waits. Everything runs in the parallel
 * `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {
    completeAssignParticipantForm,
    performReview,
} = require('../pages/ReviewStagePages.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u23${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** URL equality up to query-parameter order. */
function normalizedUrl(url) {
    const u = new URL(url);
    u.searchParams.sort();
    return `${u.origin}${u.pathname}?${u.searchParams.toString()}`;
}

test.describe('submissions dashboard', () => {
    test('S1: land and walk the views', {tag: '@smoke'}, async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        // A scratch journal so every view count is deterministic: one
        // submitted, unassigned submission.
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `arta ${tag}`,
        });

        // Sign in on the journal's login page: a Journal Manager lands on the
        // editorial dashboard, "Assigned to me" view (Rule 1; landing
        // precedence owned by U22 "Landing").
        await page.goto(`/index.php/${tag}/login`);
        const login = new LoginPage(page);
        await login.signIn(manager, manager + manager);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        const dash = new EditorialDashboardPage(page, tag);
        await dash.expectViewHeading('Assigned to me', 0);
        await expect(dash.menuGroupLink()).toBeVisible();
        // An empty view shows a single "No Items" row (Rule 5).
        await expect(page.getByText('No Items')).toBeVisible();

        // Walk the manager's full view roster (Rule 2): each sidebar entry
        // opens the list under its own heading with its count, and the
        // entry's badge carries the same number.
        const roster = [
            ['Active submissions', 1],
            ['Needs editor', 1],
            ['All in submission stage', 1],
            ['Needs reviews', 0],
            ['Awaiting reviews', 0],
            ['Reviews submitted', 0],
            ['Reviews overdue', 0],
            ['Author revisions submitted', 0],
            ['All in review stage', 0],
            ['All in copyediting stage', 0],
            ['All in production stage', 0],
            ['Scheduled for publication', 0],
            ['Published', 0],
            ['Declined', 0],
        ];
        for (const [name, count] of roster) {
            await dash.openView(name);
            await dash.expectViewHeading(name, count);
            await dash.expectViewCount(name, count);
        }
        await expect(dash.row(`arta ${tag}`)).toHaveCount(0); // still on Declined
        await dash.openView('Active submissions');
        await expect(dash.row(`arta ${tag}`)).toBeVisible();
    });

    test('S2: assigned-only scope', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const se = `${tag}se`;
        const author = `${tag}au`;
        const manager = `${tag}mg`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: se, givenName: 'Sela', familyName: 'Sectioneditor', email: `${se}@mail.test`, roles: ['sectionEditor']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
            ],
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `asg${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `uns${tag}`,
        });

        // The Section Editor: every view shows only the assigned submission
        // (Rule 3) — the unassigned one appears in none of their views.
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        const seViews = [
            ['Assigned to me', 1],
            ['Active submissions', 1],
            ['All in submission stage', 1],
            ['Needs reviews', 0],
            ['Awaiting reviews', 0],
            ['Reviews submitted', 0],
            ['Reviews overdue', 0],
            ['Author revisions submitted', 0],
            ['All in review stage', 0],
            ['All in copyediting stage', 0],
            ['All in production stage', 0],
            ['Scheduled for publication', 0],
            ['Published', 0],
        ];
        for (const [name, count] of seViews) {
            await seDash.openView(name);
            await seDash.expectViewHeading(name, count);
            await expect(seDash.row(`uns${tag}`)).toHaveCount(0);
            if (count > 0) {
                await expect(seDash.row(`asg${tag}`)).toBeVisible();
            }
        }

        // …and not in their global search either (Rule 7 applies Rule 3's
        // scope). Positive control: the same search finds the assigned one.
        await seDash.globalSearch(`uns${tag}`);
        await seDash.expectViewHeading('Search Results', 0);
        await expect(sePage.getByText('No Items')).toBeVisible();
        await seDash.globalSearch(`asg${tag}`);
        await seDash.expectViewHeading('Search Results', 1);
        await expect(seDash.row(`asg${tag}`)).toBeVisible();

        // A Journal Manager sees both, while their own "Assigned to me"
        // lists only their assignments — none here (Rule 2).
        const mgPage = await (await asUser(manager)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.expectViewCount('Assigned to me', 0);
        await mgDash.openView('Active submissions');
        await mgDash.expectViewHeading('Active submissions', 2);
        await expect(mgDash.row(`asg${tag}`)).toBeVisible();
        await expect(mgDash.row(`uns${tag}`)).toBeVisible();
    });

    test('S3: search within a view', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        for (const title of [`arta${tag}`, `artb${tag}`, `artc${tag}`]) {
            await ojsApi.createSubmission({tag, context: tag, submitter: author, title});
        }

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // The in-page search narrows the CURRENT view: the heading keeps the
        // view's name, the count follows, and the phrase shows as a chip
        // (Rule 6).
        await dash.searchFor(`arta${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`arta${tag}`)).toBeVisible();
        await expect(dash.row(`artb${tag}`)).toHaveCount(0);
        await expect(dash.searchChip()).toContainText(`arta${tag}`);

        // The chip's X restores the full view.
        await dash.clearSearchChip();
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.row(`artb${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toHaveCount(0);

        // Switching views drops the phrase too.
        await dash.searchFor(`artb${tag}`);
        await dash.expectViewHeading('Active submissions', 1);
        await dash.openView('Published');
        await dash.expectViewHeading('Published', 0);
        await expect(dash.searchChip()).toHaveCount(0);
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);
        await expect(dash.searchBox()).toHaveValue('');
    });

    test('S4: global search', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        // One declined submission (declined from the Submission stage so its
        // activity cell stays quiet — fn-s4), plus an active one as noise.
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `acta${tag}`,
        });

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        // Start the search from a non-default view (fn-s4).
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 1);
        // Positive control for the search view's missing in-page box.
        await expect(dash.searchBox()).toBeVisible();

        // The sidebar's "Search submissions" box opens the "Search Results"
        // view — declined submissions included — with the phrase as a chip
        // and no in-page search box (Rule 7).
        await dash.globalSearch(`decl${tag}`);
        await dash.expectViewHeading('Search Results', 1);
        await expect(dash.row(`decl${tag}`)).toBeVisible();
        await expect(dash.searchChip()).toContainText(`decl${tag}`);
        await expect(dash.searchBox()).toHaveCount(0);

        // Clearing the chip returns to the view the search started from.
        await dash.clearSearchChip();
        await dash.expectViewHeading('Active submissions', 1);
        await expect(dash.row(`acta${tag}`)).toBeVisible();
    });

    test('S5: filter the list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        const se = `${tag}se`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: se, givenName: 'Sela', familyName: 'Sectioneditor', email: `${se}@mail.test`, roles: ['sectionEditor']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `acta ${tag}`});
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `actb ${tag}`});

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 2);

        // The manager's Filters panel offers "Assigned To Editor" and "Days
        // since last activity" (Fields table; a one-section scratch journal
        // has no Section/Issues/Categories fields).
        const modal = await dash.openFilters();
        await expect(modal.getByText('Assigned To Editor')).toBeVisible();
        await expect(modal.getByText('Days since last activity')).toBeVisible();

        // Applying a Days value narrows the view (both rows are fresh, so a
        // 30-day floor leaves nothing), closes the panel, and puts a chip
        // above the table (Rule 8; the stale-row variant is unseedable —
        // see the header).
        await dash.setDaysSinceLastActivity(30);
        await dash.applyFilters();
        await expect(dash.filterChip('Days since last activity')).toBeVisible();
        await dash.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // "Clear Filters" restores the view.
        await dash.clearFiltersButton().click();
        await dash.expectViewHeading('Active submissions', 2);
        await expect(dash.filterChip('Days since last activity')).toHaveCount(0);

        // A Section Editor's panel has no "Assigned To Editor" field
        // (positive control: the Days field is there).
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        const seModal = await seDash.openFilters();
        await expect(seModal.getByText('Days since last activity')).toBeVisible();
        await expect(seModal.getByText('Assigned To Editor')).toHaveCount(0);
    });

    test('S6: open a submission in place', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: 'author.alex', title: `view ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(page, JOURNAL);
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

        // Closing returns to the list at the address it left.
        await dash.closeWorkflow();
        await expect(dash.row(tag)).toBeVisible();
        expect(normalizedUrl(page.url())).toBe(normalizedUrl(urlBefore));
    });

    test('S7: sort the list', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        // Seeded in order, so the returned ids ascend with the titles.
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `ida${tag}`});
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `idb${tag}`});
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `idc${tag}`});

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);
        const firstDataRow = page.locator('tbody tr').first();

        // First click on "ID": descending, recorded in the address (Rules
        // 4–5). Never a third click — the un-sort state is register A5.
        const idHeader = page.getByRole('button', {name: /^ID\s+Sort$/});
        await idHeader.click();
        await expect(page).toHaveURL(/sortColumn=id/);
        await expect(page).toHaveURL(/sortDirection=descending/);
        await expect(firstDataRow).toContainText(`idc${tag}`);

        // Second click flips to ascending, address following.
        await idHeader.click();
        await expect(page).toHaveURL(/sortDirection=ascending/);
        await expect(firstDataRow).toContainText(`ida${tag}`);

        // The "Days" header sorts by idle time the same way (all three rows
        // share today's activity date, so only the recorded sort is
        // asserted, not an order between equals).
        const daysHeader = page.getByRole('button', {name: /^Days\s+Sort$/});
        await daysHeader.click();
        await expect(page).toHaveURL(/sortColumn=lastActivity/);
        await expect(page).toHaveURL(/sortDirection=descending/);
        await daysHeader.click();
        await expect(page).toHaveURL(/sortDirection=ascending/);
    });

    test('S8: triage a new submission', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const manager = `${tag}mg`;
        const se = `${tag}se`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: se, givenName: 'Sela', familyName: 'Sectioneditor', email: `${se}@mail.test`, roles: ['sectionEditor']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        // A fresh submission nobody is assigned to (the scratch journal's
        // section has no section editors, so the wizard-parity auto-assign
        // assigns nobody).
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `tri ${tag}`});

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();

        // It lists under "Needs editor" (Rule 2) and its activity cell
        // offers "Assign Editor" (Rule 9d).
        await dash.expectViewCount('Needs editor', 1);
        await dash.openView('Active submissions');
        const row = dash.row(`tri ${tag}`);
        await expect(dash.assignEditorButton(row)).toBeVisible();

        // The button opens the "Assign Participant" window; assign the
        // Section Editor through it (the form is Stage participants').
        await dash.assignEditorButton(row).click();
        const modal = page
            .getByRole('dialog')
            .filter({has: page.locator('select[name="filterUserGroupId"]')});
        await expect(modal).toContainText('Assign Participant');
        await completeAssignParticipantForm(page, {
            group: 'Section editor',
            name: 'Sectioneditor',
            searchName: 'Sectioneditor',
        });

        // Back on the list: the button is gone (the cell goes quiet), the
        // row drops off "Needs editor", and the counts move in place — no
        // reload (Rules 9d, 13).
        await expect(dash.assignEditorButton(row)).toHaveCount(0, {timeout: 30_000});
        await expect(row).toBeVisible();
        await dash.expectViewCount('Needs editor', 0);
        await dash.expectViewCount('Active submissions', 1);
        await dash.openView('Needs editor');
        await dash.expectViewHeading('Needs editor', 0);
        await expect(page.getByText('No Items')).toBeVisible();
    });

    test('S9: review activity at a glance', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        // Two submissions in external review round 1: one with no reviewers,
        // one with two invitations out (fn-s9).
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: 'author.alex', title: `norev ${tag}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: []}],
        });
        const {submissionId: twoRevId} = await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: 'author.alex', title: `tworev ${tag}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [
                {username: 'reviewer.julia', status: 'invited'},
                {username: 'reviewer.paul', status: 'invited'},
            ]}],
        });

        const page = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(page, JOURNAL);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.searchFor(tag);
        const rowNoRev = dash.row(`norev ${tag}`);
        const rowTwoRev = dash.row(`tworev ${tag}`);
        await expect(rowNoRev).toBeVisible();
        await expect(rowTwoRev).toBeVisible();

        // No reviewers on the round yet: the cell offers "Assign Reviewers",
        // which opens the Add Reviewer window (Rule 9e).
        await expect(dash.assignReviewersButton(rowNoRev)).toBeVisible();
        await dash.assignReviewersButton(rowNoRev).click();
        const addReviewerModal = page
            .getByRole('dialog')
            .filter({has: page.locator('.listPanel--selectReviewer')});
        await expect(
            addReviewerModal.getByRole('heading', {name: 'Add Reviewer'})
        ).toBeVisible({timeout: 30_000});
        await expect(
            addReviewerModal.locator('.listPanel--selectReviewer input.pkpSearch__input')
        ).toBeVisible({timeout: 30_000});
        // The window's initial (search) face has no Cancel — close via the
        // side modal's own Close control.
        await addReviewerModal
            .getByRole('button', {name: 'Close', exact: true})
            .first()
            .click();
        await expect(addReviewerModal).toHaveCount(0, {timeout: 30_000});

        // Two requests out: two countdown indicators; the popover names the
        // reviewer and the status, with the three working buttons (Rule 10).
        const awaiting = dash.activityIndicator(rowTwoRev, /Awaiting Response from the reviewer/);
        await expect(awaiting).toHaveCount(2);
        await awaiting.first().click();
        const popover = rowTwoRev.locator('[id^="headlessui-popover-panel"]');
        await expect(popover).toContainText('Awaiting Response from the reviewer');
        await expect(popover).toContainText('Julia Reviewer');
        await expect(popover.getByRole('button', {name: 'Edit Due Date', exact: true})).toBeVisible();
        await expect(popover.getByRole('button', {name: 'View details', exact: true})).toBeVisible();
        await expect(popover.getByRole('button', {name: 'Unassign', exact: true})).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(popover).toHaveCount(0);

        // One reviewer submits: their indicator turns to a done mark whose
        // popover reads "Review completed on {date}" with "View unread
        // recommendation".
        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await performReview(juliaPage, JOURNAL, twoRevId, {});

        await page.reload();
        await expect(rowTwoRev).toBeVisible({timeout: 30_000});
        const completed = dash.activityIndicator(rowTwoRev, /Review completed on/);
        await expect(completed).toHaveCount(1);
        await expect(
            dash.activityIndicator(rowTwoRev, /Awaiting Response from the reviewer/)
        ).toHaveCount(1);
        await completed.click();
        const completedPopover = rowTwoRev.locator('[id^="headlessui-popover-panel"]');
        await expect(completedPopover).toContainText(/Review completed on/);
        await expect(
            completedPopover.getByRole('button', {name: 'View unread recommendation', exact: true})
        ).toBeVisible();
    });

    test('S10: the conflict row', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const combo = `${tag}ma`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: combo, givenName: 'Mara', familyName: 'Combo', email: `${combo}@mail.test`, roles: ['manager', 'author']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        await ojsApi.createSubmission({tag, context: tag, submitter: combo, title: `own ${tag}`});
        await ojsApi.createSubmission({tag, context: tag, submitter: author, title: `other ${tag}`});

        const page = await (await asUser(combo)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 2);

        // Their own authored submission's row shows the conflict notice and
        // offers no buttons (Rule 9a; the notice's role wording is register
        // ❓ A3 — asserted by wording-neutral fragments only).
        const rowOwn = dash.row(`own ${tag}`);
        await expect(rowOwn).toContainText('You cannot access this submission');
        await expect(rowOwn).toContainText('My Submissions');
        await expect(dash.viewButton(rowOwn)).toHaveCount(0);
        await expect(dash.assignEditorButton(rowOwn)).toHaveCount(0);

        // Ordinary rows around it keep their buttons (positive control: the
        // unassigned neighbor offers both "View" and "Assign Editor").
        const rowOther = dash.row(`other ${tag}`);
        await expect(dash.viewButton(rowOther)).toBeVisible();
        await expect(dash.assignEditorButton(rowOther)).toBeVisible();

        // The same submission sits normally under "My Submissions as
        // Author".
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();
        await expect(mySub.menuGroupLink()).toBeVisible();
        const myRow = mySub.row(`own ${tag}`);
        await expect(myRow).toBeVisible();
        await expect(mySub.viewButton(myRow)).toBeVisible();
    });

    test('S11: declined out of editors\' sight', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s11', testInfo);
        const manager = `${tag}mg`;
        const se = `${tag}se`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: se, givenName: 'Sela', familyName: 'Sectioneditor', email: `${se}@mail.test`, roles: ['sectionEditor']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        // The Section Editor's assigned submission, declined (Submission
        // stage), plus a second assigned, active one as the positive
        // control for their views.
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl ${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
            decisions: ['initialDecline'],
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `live ${tag}`,
            participants: [{username: se, role: 'sectionEditor'}],
        });

        // The manager finds it under "Declined" (Rule 9b keeps the row's
        // "View").
        const mgPage = await (await asUser(manager)).newPage();
        const mgDash = new EditorialDashboardPage(mgPage, tag);
        await mgDash.goto();
        await mgDash.openView('Declined');
        await mgDash.expectViewHeading('Declined', 1);
        const declRow = mgDash.row(`decl ${tag}`);
        await expect(declRow).toContainText('Declined during the Submission stage.');
        await expect(mgDash.viewButton(declRow)).toBeVisible();

        // The Section Editor's sidebar has no "Declined" entry (positive
        // control: their other entries render), and the submission is gone
        // from their views…
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        await expect(seDash.viewLink('Active submissions')).toBeVisible();
        await expect(seDash.viewLink('Declined')).toHaveCount(0);
        await seDash.openView('Assigned to me');
        await seDash.expectViewHeading('Assigned to me', 1);
        await expect(seDash.row(`live ${tag}`)).toBeVisible();
        await expect(seDash.row(`decl ${tag}`)).toHaveCount(0);
        await seDash.openView('Active submissions');
        await seDash.expectViewHeading('Active submissions', 1);
        await expect(seDash.row(`decl ${tag}`)).toHaveCount(0);

        // …while their global search still finds it (Rule 7 ⚠ A1 — the
        // roster fact is the spec's rule; the product question stays open).
        await seDash.globalSearch(tag);
        await seDash.expectViewHeading('Search Results', 2);
        await expect(seDash.row(`decl ${tag}`)).toBeVisible();
        await expect(seDash.row(`live ${tag}`)).toBeVisible();
    });

    test('S12: bulk-delete incomplete submissions', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        const manager = `${tag}ma`;
        const se = `${tag}se`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, givenName: 'Mara', familyName: 'Combo', email: `${manager}@mail.test`, roles: ['manager', 'author']},
                {username: se, givenName: 'Sela', familyName: 'Sectioneditor', email: `${se}@mail.test`, roles: ['sectionEditor']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        // Two incomplete submissions — one the manager's own, one another
        // author's — and a submitted control (fn-s12).
        await ojsApi.createSubmission({
            tag, context: tag, submitter: manager, title: `draftm ${tag}`, submitted: false,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafto ${tag}`, submitted: false,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `keep ${tag}`,
        });

        const page = await (await asUser(manager)).newPage();
        const dash = new EditorialDashboardPage(page, tag);
        await dash.goto();
        await dash.openView('Active submissions');
        await dash.expectViewHeading('Active submissions', 3);

        // "More Actions" → "Delete Incomplete Submissions" puts the list in
        // selection mode: checkboxes on the two incomplete rows only, and
        // the delete button disabled until something is ticked (Rule 12).
        await dash.enterBulkDeleteSelection();
        await expect(dash.row(`draftm ${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`drafto ${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(dash.row(`keep ${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(dash.bulkDeleteButton()).toBeDisabled();

        // Tick both and delete through the confirm dialog.
        await dash.checkRowCheckbox(dash.row(`draftm ${tag}`));
        await dash.checkRowCheckbox(dash.row(`drafto ${tag}`));
        await expect(dash.bulkDeleteButton()).toBeEnabled();
        await dash.bulkDeleteButton().click();
        const dialog = dash.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone. Please confirm to proceed.'
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();

        // Both are gone and the counts drop in place (Rules 12–13).
        await expect(dash.row(`draftm ${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(dash.row(`drafto ${tag}`)).toHaveCount(0);
        await expect(dash.row(`keep ${tag}`)).toBeVisible();
        await dash.expectViewHeading('Active submissions', 1);
        await dash.expectViewCount('Active submissions', 1);

        // A Section Editor's dashboard shows no "More Actions" button at
        // all (positive control: the neighboring "Filters" control renders).
        const sePage = await (await asUser(se)).newPage();
        const seDash = new EditorialDashboardPage(sePage, tag);
        await seDash.goto();
        await expect(seDash.filtersButton()).toBeVisible();
        await expect(seDash.moreActionsButton()).toHaveCount(0);
    });

    test('S13: issue filter and scheduled rows', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s13', testInfo);
        // Scheduled into the seeded unpublished issue: the builder publishes
        // through the real services, so publishing into a future issue lands
        // in the scheduled state (the fn-s13 UI caveat applies only to the
        // Schedule For Publication window, which this seed bypasses).
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: 'author.alex', title: `sched ${tag}`,
            decisions: ['skipExternalReview', 'sendToProduction'],
            published: true,
            issue: {volume: 2, number: 1, year: 2015},
        });

        const page = await (await asUser('manager.maya')).newPage();
        const dash = new EditorialDashboardPage(page, JOURNAL);
        await dash.goto();

        // It lists under "Scheduled for publication" with the "Scheduled"
        // stage bubble and the issue named in its activity cell (Rule 9h).
        await dash.openView('Scheduled for publication');
        const row = await dash.findRowByTag(tag);
        await expect(row).toContainText('Scheduled');
        await expect(row).toContainText('To be published in issue Vol. 2 No. 1 (2015)');

        // …and no longer under "Active submissions" (searched the same way;
        // the absence is bounded by the search's own response — the find
        // above is the positive control).
        await dash.openView('Active submissions');
        const filtered = page.waitForResponse(
            (r) => r.url().includes('_submissions') && r.url().includes(tag)
        );
        await dash.searchFor(tag);
        await filtered;
        await expect(dash.row(tag)).toHaveCount(0);

        // The Filters panel's "Issues" field narrows the view to that
        // issue's submissions (on top of the search phrase).
        await dash.openView('Scheduled for publication');
        await dash.findRowByTag(tag);
        let modal = await dash.openFilters();
        const issuesInput = modal.getByRole('combobox', {name: 'Issues'});
        await issuesInput.click();
        await issuesInput.pressSequentially('2015', {delay: 25});
        await modal.getByRole('option', {name: 'Vol. 2 No. 1 (2015)'}).click();
        await dash.applyFilters();
        await expect(dash.filterChip('Vol. 2 No. 1 (2015)')).toBeVisible();
        await expect(dash.row(tag)).toBeVisible();

        // The chip's X drops just that filter (Rule 8)…
        await dash.filterChip('Vol. 2 No. 1 (2015)').getByRole('button').click();
        await expect(dash.filterChip('Vol. 2 No. 1 (2015)')).toHaveCount(0);
        await expect(dash.row(tag)).toBeVisible();

        // …and filtering by the other issue excludes the row (bounded by
        // the heading count).
        modal = await dash.openFilters();
        await issuesInput.click();
        await issuesInput.pressSequentially('2014', {delay: 25});
        await modal.getByRole('option', {name: 'Vol. 1 No. 2 (2014)'}).click();
        await dash.applyFilters();
        await expect(dash.filterChip('Vol. 1 No. 2 (2014)')).toBeVisible();
        await dash.expectViewHeading('Scheduled for publication', 0);
        await expect(dash.row(tag)).toHaveCount(0);
    });
});
