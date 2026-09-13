// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * U22 — My Submissions (author dashboard), OMP suite (spec:
 * docs/specs/U22-my-submissions.md). One test per canonical scenario the
 * spec runs on a press, in OMP vocabulary (press, monograph, series, Press
 * Manager, Series Editor): the common scenarios 1–3 and 5, and scenario 4
 * {OJS OMP} with its {OMP} bullet (the Internal Review round). OJS's
 * issue-scheduling feeder for "Scheduled for publication" has no press
 * analogue; S3 walks that view at zero and asserts nothing about why.
 *
 * Not covered, by register ID (the spec's Coverage section is the record
 * of everything else left out): A1 (S4 asserts the post-upload and
 * under-review counters exactly as scenario 4 states them; the register's
 * question is whether the counter SHOULD be author-visible), A2, A3, A4,
 * A5, OMP1 (S3 asserts the Filters panel's present field and the absent
 * "Assigned To Editor" only, never the missing series filter), OPS1 and
 * OPS2 (the OPS suite's territory).
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S1 rides publicknowledge as author.alex (with author.bea
 * and manager.maya signed in through the fixture for its denial legs);
 * S2–S5 isolate on scratch presses with throwaway users, because sidebar
 * badge counts and landings need a list only the test controls. S2 seeds
 * its resume step through the wizard itself ("Save for Later" on
 * "Details", fn-s2). Mailpit reads (S2, S3) are scoped by the throwaway
 * author's address (PRINCIPLES A8) and taken as a before/after count
 * settled by the scenario's own list read. Waits are event-based
 * (auto-wait on rows, headings, badges, dialogs and the landing URL) — no
 * hard-coded sleeps. Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {
    STEPS,
    wizardUrl,
    expectWizardOpen,
    expectStep,
    continueTo,
    saveForLater,
} = require('../pages/SubmissionWizardPages.js');
const {completeStandaloneUploadWizard, oldAuthorDashboardUrl} = require('../pages/ReviewStagePages.js');

const PRESS = 'publicknowledge';
const ROLE_DENIED = 'The current role does not have access to this operation.';
const STAGE_DENIED = "You don't currently have access to that stage of the workflow.";
const DAYS_FILTER = 'Days since last activity';
const EDITOR_FILTER = 'Assigned To Editor';
const VIEWS = [
    'Active submissions',
    'Revisions requested',
    'Revisions submitted',
    'Incomplete submissions',
    'Scheduled for publication',
    'Published',
    'Declined',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway user spec for the context scenario. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/*
 * Row cells, until the shared MySubmissionsPage gains them (the OJS author
 * owns that file during this revision). `getByRole('cell')` skips the
 * "Submissions" column, which renders as the row's header cell, so the
 * cells run ID · Stage · Editorial Activity · Actions.
 */
const titleCell = (row) => row.getByRole('rowheader');
const stageCell = (row) => row.getByRole('cell').nth(1);
const activityCell = (row) => row.getByRole('cell').nth(2);
const actionsCell = (row) => row.getByRole('cell').nth(3);

/** The "Reviewers assigned:" line of a row's activity cell (Rule 7b). */
const reviewersAssignedLine = (row) => activityCell(row).getByText('Reviewers assigned:');
/** The avatar buttons of that line. */
const reviewerAvatars = (row) => activityCell(row).getByRole('button');
/** The open avatar popover inside the row. */
const activityPopover = (row) => row.locator('[id^="headlessui-popover-panel"]');

/** The Filters side panel (its wrapper reports visibility: hidden; anchor on Apply). */
const filtersModal = (page) =>
    page
        .locator('[data-cy="active-modal"]')
        .filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})});

async function openFilters(page) {
    await page.getByRole('button', {name: 'Filters', exact: true}).click();
    const modal = filtersModal(page);
    await expect(modal.getByRole('button', {name: 'Apply Filters', exact: true})).toBeVisible({
        timeout: 30_000,
    });
    return modal;
}

async function closeFilters(page) {
    await page.keyboard.press('Escape');
    await expect(filtersModal(page)).toHaveCount(0, {timeout: 30_000});
}

/** The three-step upload dialog "Submit revisions" opens (Rule 7a). */
const uploadDialog = (page) =>
    page.getByRole('dialog').filter({has: page.getByRole('tab', {name: '1. Upload File'})});

/** The backend sidebar. */
const sideNav = (page) => page.locator('#app-nav');

/** Open the retired list address and wait for the landing it forwards to (Rule 3). */
async function landThrough(page, contextPath, landingPath) {
    await page.goto(`/index.php/${contextPath}/submissions`);
    await page.waitForURL((url) => url.pathname.includes(landingPath), {waitUntil: 'commit'});
}

/** The access-denied page with the given sentence, and no backend sidebar. */
async function expectAccessDenied(page, sentence) {
    await expect(page.getByText(sentence)).toBeVisible({timeout: 30_000});
    await expect(sideNav(page)).toHaveCount(0);
    await expect(page.getByRole('heading', {name: /^Workflow:/})).toHaveCount(0);
}

test.describe('My submissions (U22)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: track and open a submission', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Submission" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PRESS,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view, with the sidebar group (Rules 1, 3) — reached
        // through the retired submission-list address, which forwards the
        // same way (fn-s1: the sign-in fixture caches cookies at the site
        // login).
        const page = await (await asUser('author.alex')).newPage();
        await landThrough(page, PRESS, '/dashboard/mySubmissions');
        const mySub = new MySubmissionsPage(page, PRESS);
        await mySub.expectViewHeading('Active submissions');
        await expect(mySub.menuGroupLink()).toBeVisible();

        // The row shows the monograph's ID, the authors-and-title line, and
        // the current stage in a bubble; its Editorial Activity cell is
        // empty while the monograph awaits the editorial team's first move
        // (Rules 4, 7e; the stage bubble is the non-empty control).
        const row = await mySub.findRowByTag(tag);
        await expect(row.getByRole('cell').first()).toHaveText(String(submissionId));
        await expect(titleCell(row)).toContainText('Author');
        await expect(titleCell(row)).toContainText(`arta${tag}`);
        await expect(stageCell(row)).toHaveText('Submission');
        await expect(activityCell(row)).toHaveText(/^\s*$/);
        await expect(actionsCell(row)).toHaveText('View');

        // "View" opens the workflow as a panel over the list; the address
        // records which submission is open (Rule 8).
        const urlBefore = page.url();
        await mySub.viewButton(row).click();
        await mySub.expectWorkflowOpen();
        expect(page.url()).toContain(`workflowSubmissionId=${submissionId}`);

        // Close it — the list is back at the exact address it left.
        await mySub.closeWorkflow();
        await expect(row).toBeVisible();
        expect(page.url()).toBe(urlBefore);

        // The old author-dashboard link: My Submissions opens with that
        // monograph's workflow panel already open (Rule 3).
        await page.goto(oldAuthorDashboardUrl(PRESS, submissionId));
        await page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        await mySub.expectWorkflowOpen();
        expect(new URL(page.url()).searchParams.get('workflowSubmissionId')).toBe(String(submissionId));
        await mySub.closeWorkflow();
        await mySub.expectViewHeading('Active submissions');

        // The same link in a second author's browser: an access-denied page
        // (Rule 3; fn-c's wording).
        const beaPage = await (await asUser('author.bea')).newPage();
        await beaPage.goto(oldAuthorDashboardUrl(PRESS, submissionId));
        await expectAccessDenied(beaPage, STAGE_DENIED);

        // Control: a Press Manager who does not author types the list's
        // address: the access-denied page (Actors row 1; fn-a's wording).
        const managerPage = await (await asUser('manager.maya')).newPage();
        await managerPage.goto(`/index.php/${PRESS}/dashboard/mySubmissions`);
        await expectAccessDenied(managerPage, ROLE_DENIED);
        await expect(managerPage.getByRole('heading', {name: /^Active submissions/})).toHaveCount(0);
    });

    test('S2: resume and clean up drafts', async ({asUser, ompApi, pkpMail}, testInfo) => {
        const tag = makeTag('s2', testInfo);
        // A scratch press so the list and its badges hold only this test's
        // rows: two drafts and one submitted control.
        const author = `${tag}au`;
        const authorEmail = `${author}@mail.test`;
        await ompApi.createContext({
            tag,
            users: [user(author, 'Ada', 'Author', ['author'])],
        });
        const draftA = await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        const draftB = await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `subm${tag}`,
        });

        // The saved draft (fn-s2): the first draft's wizard, continued to
        // "Details" and saved there with "Save for Later" — the scenario API
        // has no saved-step key.
        const page = await (await asUser(author)).newPage();
        await page.goto(wizardUrl(tag, draftA.submissionId));
        await expectWizardOpen(page);
        await expectStep(page, STEPS.files);
        await continueTo(page, STEPS.details);
        await saveForLater(page);

        // The author's mailbox before anything is done from the list.
        const mailBefore = await pkpMail.count({to: authorEmail});

        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // "Incomplete submissions" lists the two drafts and not the
        // submitted monograph; each draft row wears the "Incomplete" stage
        // bubble, offers "Complete submission" and has no "View" (Rules 2,
        // 4, 6; the submitted row's "View" below is the positive control).
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 2);
        for (const title of [`drafta${tag}`, `draftb${tag}`]) {
            const row = mySub.row(title);
            await expect(row).toBeVisible();
            await expect(stageCell(row)).toHaveText('Incomplete');
            await expect(mySub.completeSubmissionButton(row)).toBeVisible();
            await expect(mySub.viewButton(row)).toHaveCount(0);
            await expect(actionsCell(row)).toHaveText(/^\s*$/);
        }
        await expect(mySub.row(`subm${tag}`)).toHaveCount(0);

        // "Complete submission" on the saved draft: the wizard reopens at
        // "Details" (Rule 6).
        await mySub.completeSubmissionButton(mySub.row(`drafta${tag}`)).click();
        await expectWizardOpen(page);
        expect(page.url()).toContain(`id=${draftA.submissionId}`);
        await expectStep(page, STEPS.details);

        // Return; "Complete submission" on the other draft, only to note the
        // address its wizard opens at (the positive control for the
        // post-delete read); return again.
        await mySub.goto();
        await mySub.openView('Incomplete submissions');
        await mySub.completeSubmissionButton(mySub.row(`draftb${tag}`)).click();
        await expectWizardOpen(page);
        const draftBWizardAddress = page.url();
        expect(draftBWizardAddress).toContain(`submission?id=${draftB.submissionId}`);

        // "Active submissions": draft and submitted rows sit together, the
        // drafts listed here as well as under "Incomplete submissions"
        // (Rule 2).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 3);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toBeVisible();
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();

        // "More Actions" → "Delete Incomplete Submissions": a checkbox on
        // each draft row and none on the submitted row; the delete button
        // stays disabled until something is selected (Rule 9).
        await mySub.enterBulkDeleteSelection();
        await expect(mySub.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.bulkDeleteButton()).toBeDisabled();

        // Tick the other draft, then the button above the list and
        // "Confirm" in the "Confirm Delete of Incomplete Submissions" dialog.
        await mySub.checkRowCheckbox(mySub.row(`draftb${tag}`));
        await expect(mySub.bulkDeleteButton()).toBeEnabled();
        await mySub.bulkDeleteButton().click();
        const dialog = mySub.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone.'
        );
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();

        // The draft is gone and the heading and sidebar counts drop in place
        // — no reload (Rules 9, 10).
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await mySub.expectViewHeading('Active submissions', 2);
        await mySub.expectViewCount('Active submissions', 2);
        await mySub.expectViewCount('Incomplete submissions', 1);

        // The deleted draft: under neither "Active submissions" nor
        // "Incomplete submissions", nothing on the list offers to restore it
        // (the More Actions menu still holds its delete entry as the
        // control), and no email has arrived in the author's mailbox (Side
        // effects; the count is settled by the list reads above).
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 1);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0);
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 2);
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0);
        await mySub.moreActionsButton().click();
        await expect(mySub.bulkDeleteMenuItem()).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('menuitem', {name: /restore|undo/i})).toHaveCount(0);
        // Dismiss the menu with a click outside it (a headlessui menu
        // ignores Escape while focus stays on its button).
        await mySub.heading().click();
        await expect(mySub.bulkDeleteMenuItem()).toBeHidden({timeout: 30_000});
        await expect(page.getByRole('button', {name: /restore|undo/i})).toHaveCount(0);
        expect(await pkpMail.count({to: authorEmail})).toBe(mailBefore);

        // Its wizard address: the wizard no longer opens (Side effects; the
        // same address opened it before the delete, above).
        await page.goto(draftBWizardAddress);
        await page.waitForLoadState('load');
        await expect(page.getByRole('heading', {name: /Make a Submission/})).toHaveCount(0);
        await expect(page.locator('.pkpSteps__buttons')).toHaveCount(0);
        await expect(page).not.toHaveTitle(/Make a Submission/);

        // Control: the submitted row had no checkbox and is still listed
        // after the delete (Actors row 6, Rule 9).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 2);
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();
    });

    test('S3: browse the views and search', async ({asUser, ompApi, pkpMail}, testInfo) => {
        const tag = makeTag('s3', testInfo);
        // A scratch press with a throwaway author holding two published
        // monographs, one declined from the Submission stage (fn-s3: pre-
        // review, so its cell stays clear of A2's counter) and one in
        // Copyediting, beside a second throwaway author's submitted
        // monograph as the control. No press route feeds "Scheduled for
        // publication" (A3); "Revisions requested" is the empty-view
        // control the footnote names.
        const author = `${tag}au`;
        const authorEmail = `${author}@mail.test`;
        const other = `${tag}bu`;
        await ompApi.createContext({
            tag,
            users: [
                user(author, 'Vera', 'Views', ['author']),
                user(other, 'Otto', 'Other', ['author']),
            ],
        });
        const toProduction = ['skipExternalReview', 'sendToProduction'];
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `puba${tag}`,
            decisions: toProduction, published: true,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `pubb${tag}`,
            decisions: toProduction, published: true,
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `copy${tag}`,
            decisions: ['skipExternalReview'],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: other, title: `other${tag}`,
        });

        const mailBefore = await pkpMail.count({to: authorEmail});
        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The sidebar's view entries: each opens the list under that view's
        // heading with its count, and the badge carries the same number
        // (Rules 1, 2). The other author's monograph counts nowhere.
        const expectedCounts = {
            'Active submissions': 1,
            'Revisions requested': 0,
            'Revisions submitted': 0,
            'Incomplete submissions': 0,
            'Scheduled for publication': 0,
            'Published': 2,
            'Declined': 1,
        };
        for (const name of VIEWS) {
            await mySub.openView(name);
            await mySub.expectViewHeading(name, expectedCounts[name]);
            await mySub.expectViewCount(name, expectedCounts[name]);
        }

        // "Active submissions": the monograph in Copyediting, its cell
        // reading "Copyedited Files Uploaded: 0" (Rules 2, 7c).
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 1);
        const copyRow = mySub.row(`copy${tag}`);
        await expect(copyRow).toBeVisible();
        await expect(stageCell(copyRow)).toHaveText('Copyediting');
        await expect(activityCell(copyRow)).toHaveText('Copyedited Files Uploaded: 0');

        // "Published": the two published monographs (Rule 2).
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await expect(mySub.row(`puba${tag}`)).toBeVisible();
        await expect(mySub.row(`pubb${tag}`)).toBeVisible();

        // "Declined": the declined monograph with its "Declined" stage
        // bubble and an empty Editorial Activity cell (Rules 2, 4, 7e; the
        // Copyediting cell above is the non-empty control).
        await mySub.openView('Declined');
        await mySub.expectViewHeading('Declined', 1);
        const declRow = mySub.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(stageCell(declRow)).toHaveText('Declined');
        await expect(activityCell(declRow)).toHaveText(/^\s*$/);

        // A view holding nothing: "No Items" (Rule 4; fn-s3 names
        // "Revisions requested" on a press).
        await mySub.openView('Revisions requested');
        await mySub.expectViewHeading('Revisions requested', 0);
        await expect(page.getByRole('cell', {name: 'No Items', exact: true})).toBeVisible();

        // The search box on "Published": the first published title narrows
        // the list to that monograph alone, the heading count following
        // (Rule 5).
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await mySub.searchFor(`puba${tag}`);
        await expect(mySub.row(`puba${tag}`)).toBeVisible({timeout: 30_000});
        await expect(mySub.row(`pubb${tag}`)).toHaveCount(0);
        await mySub.expectViewHeading('Published', 1);

        // "Filters": the panel offers the days-since-last-activity filter;
        // a scratch press has no categories, and "Assigned To Editor" is not
        // among the fields (Rule 5; the present field is the control).
        const filters = await openFilters(page);
        await expect(filters.getByText(DAYS_FILTER, {exact: true})).toBeVisible();
        await expect(filters.getByRole('slider', {name: DAYS_FILTER})).toBeVisible();
        await expect(filters.getByText(EDITOR_FILTER)).toHaveCount(0);
        await expect(filters.getByRole('combobox', {name: EDITOR_FILTER})).toHaveCount(0);
        await expect(filters.getByText('Categories')).toHaveCount(0);
        await closeFilters(page);

        // The author's mailbox: nothing has arrived through any of the
        // above (Side effects; the count is settled by the list reads).
        expect(await pkpMail.count({to: authorEmail})).toBe(mailBefore);

        // Control: the other author's monograph is listed under none of the
        // views (the counts above sum without it), and searching its title
        // on "Active submissions" finds no row (Actors row 2, Rule 5; the
        // search of the author's own title above is the positive control).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 1);
        await mySub.searchFor(`other${tag}`);
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(mySub.row(`other${tag}`)).toHaveCount(0);
        await expect(page.getByRole('cell', {name: 'No Items', exact: true})).toBeVisible();
    });

    test('S4: act on a revision request', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s4', testInfo);
        // The first scratch press, at the default review type (fn-s4): a
        // throwaway author, two external reviewers and an internal one; the
        // revision-request monograph (External Review round 1, revisions
        // requested, one accepted reviewer), the internal-round one
        // (Internal Review round 1, revisions requested, the internal
        // reviewer accepted) and the under-review one (two reviewers, one
        // accepted, one completed).
        const author = `${tag}au`;
        const revA = `${tag}ra`;
        const revB = `${tag}rb`;
        const revInt = `${tag}ri`;
        await ompApi.createContext({
            tag,
            users: [
                user(author, 'Ada', 'Author', ['author']),
                user(revA, 'Rex', 'Reviewer', ['externalReviewer']),
                user(revB, 'Rita', 'Reviewer', ['externalReviewer']),
                user(revInt, 'Ira', 'Internal', ['internalReviewer']),
            ],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `rev${tag}`,
            decisions: ['skipInternalReview', 'requestRevisions'],
            reviewRounds: [{stage: 'external', reviewers: [{username: revA, status: 'accepted'}]}],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `intl${tag}`,
            decisions: ['sendInternalReview', 'requestRevisionsInternal'],
            reviewRounds: [{stage: 'internal', reviewers: [{username: revInt, status: 'accepted'}]}],
        });
        await ompApi.createSubmission({
            tag, context: tag, submitter: author, title: `under${tag}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [{
                stage: 'external',
                reviewers: [{username: revA, status: 'accepted'}, {username: revB, status: 'completed'}],
            }],
        });
        // The second scratch press, default review type Open, with one
        // monograph whose single reviewer has completed.
        const openTag = `${tag}o`;
        const openAuthor = `${openTag}au`;
        const openReviewer = `${openTag}rv`;
        await ompApi.createContext({
            tag: openTag,
            review: {defaultReviewMode: 'open'},
            users: [
                user(openAuthor, 'Olga', 'Open', ['author']),
                user(openReviewer, 'Omar', 'Openreviewer', ['externalReviewer']),
            ],
        });
        await ompApi.createSubmission({
            tag: openTag, context: openTag, submitter: openAuthor, title: `open${openTag}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [{stage: 'external', reviewers: [{username: openReviewer, status: 'completed'}]}],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // "Revisions requested": the monograph is listed (beside the
        // internal-round one); its stage bubble names the external round and
        // its cell reads "Revision requested" with "Submit revisions"
        // (Rules 2, 4, 7a).
        await mySub.expectViewCount('Revisions requested', 2);
        await mySub.expectViewCount('Revisions submitted', 0);
        await mySub.openView('Revisions requested');
        await mySub.expectViewHeading('Revisions requested', 2);
        const row = mySub.row(`rev${tag}`);
        await expect(row).toBeVisible();
        await expect(stageCell(row)).toHaveText('External Review (Round 1)');
        await expect(activityCell(row)).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(row)).toBeVisible();

        // "Submit revisions": the upload dialog opens directly, with three
        // steps and no title of its own (its header's heading stays empty)
        // (Rule 7a); upload a file through them.
        await mySub.submitRevisionsButton(row).click();
        const dialog = uploadDialog(page);
        await expect(dialog.getByRole('tab', {name: '1. Upload File'})).toBeVisible({timeout: 20_000});
        await expect(dialog.getByRole('tab', {name: '2. Review Details'})).toBeVisible();
        await expect(dialog.getByRole('tab', {name: '3. Confirm'})).toBeVisible();
        await expect(dialog.getByRole('tablist').getByRole('tab')).toHaveCount(3);
        const dialogTitle = dialog.getByRole('heading', {level: 1, includeHidden: true});
        await expect(dialogTitle).toHaveCount(1);
        await expect(dialogTitle).toHaveText(/^\s*$/);
        await expect(dialogTitle).toBeHidden();
        await completeStandaloneUploadWizard(page, `rev-${tag}.txt`);

        // Back on the list without a reload: the monograph now sits under
        // "Revisions submitted", the badges have moved with it, and its
        // cell shows the review progress counter, not a "revisions
        // submitted" message (Rules 7a, 7b, 10; A1 asserted as the scenario
        // states it).
        await mySub.expectViewCount('Revisions requested', 1);
        await mySub.expectViewCount('Revisions submitted', 1);
        await mySub.openView('Revisions submitted');
        await mySub.expectViewHeading('Revisions submitted', 1);
        const rowAfter = mySub.row(`rev${tag}`);
        await expect(rowAfter).toBeVisible();
        await expect(activityCell(rowAfter)).toContainText('Review update 0/1');
        await expect(activityCell(rowAfter).getByText(/revisions? (submitted|requested)/i)).toHaveCount(0);
        // Control: the delivered row no longer offers "Submit revisions".
        await expect(mySub.submitRevisionsButton(rowAfter)).toHaveCount(0);
        await expect(actionsCell(rowAfter)).toHaveText('View');

        // A press's Internal Review round {OMP}: the further monograph is
        // listed under "Revisions requested" with the same cell and button;
        // uploading the same way moves it under "Revisions submitted" with
        // the counter (Rule 7a; fn-g).
        await mySub.openView('Revisions requested');
        await mySub.expectViewHeading('Revisions requested', 1);
        const intlRow = mySub.row(`intl${tag}`);
        await expect(intlRow).toBeVisible();
        await expect(stageCell(intlRow)).toHaveText('Internal Review (Round 1)');
        await expect(activityCell(intlRow)).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(intlRow)).toBeVisible();
        await mySub.submitRevisionsButton(intlRow).click();
        await expect(uploadDialog(page).getByRole('tab', {name: '1. Upload File'})).toBeVisible({
            timeout: 20_000,
        });
        await completeStandaloneUploadWizard(page, `int-${tag}.txt`);
        await mySub.expectViewCount('Revisions requested', 0);
        await mySub.expectViewCount('Revisions submitted', 2);
        await mySub.openView('Revisions submitted');
        await mySub.expectViewHeading('Revisions submitted', 2);
        const intlAfter = mySub.row(`intl${tag}`);
        await expect(intlAfter).toBeVisible();
        await expect(activityCell(intlAfter)).toContainText('Review update 0/1');
        await expect(mySub.submitRevisionsButton(intlAfter)).toHaveCount(0);

        // Under review, nothing asked: the second monograph's cell reads
        // "Review update 1/2" and shows no "Reviewers assigned:" row — a
        // review that is not open never shows its reviewer (Rule 7b; the
        // open press below is the positive control for the row).
        await mySub.openView('Active submissions');
        const underRow = mySub.row(`under${tag}`);
        await expect(underRow).toBeVisible();
        await expect(stageCell(underRow)).toHaveText('External Review (Round 1)');
        await expect(activityCell(underRow)).toHaveText('Review update 1/2');
        await expect(reviewersAssignedLine(underRow)).toHaveCount(0);
        await expect(reviewerAvatars(underRow)).toHaveCount(0);

        // A completed open review: on the Open press the cell reads "Review
        // update 1/1" with a "Reviewers assigned:" row of one avatar, whose
        // popover names the reviewer and the review type (Rule 7b).
        const openPage = await (await asUser(openAuthor)).newPage();
        const openSub = new MySubmissionsPage(openPage, openTag);
        await openSub.goto();
        const openRow = openSub.row(`open${openTag}`);
        await expect(openRow).toBeVisible();
        await expect(activityCell(openRow)).toContainText('Review update 1/1');
        await expect(reviewersAssignedLine(openRow)).toBeVisible();
        await expect(reviewerAvatars(openRow)).toHaveCount(1);
        await reviewerAvatars(openRow).click();
        const popover = activityPopover(openRow);
        await expect(popover).toBeVisible({timeout: 30_000});
        await expect(popover).toContainText('Omar Openreviewer');
        await expect(popover).toContainText('Open');
    });

    test('S5: landing for an account holding other roles too', async ({asUser, ompApi}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        // A scratch press with the three two-role accounts and the author-
        // only control (fn-s5; OMP's `sectionEditor` is the Series Editor
        // group). Each session is cached at the site login by the fixture,
        // so every landing is read through the retired list address, which
        // forwards the same way (Rule 3).
        const authorReviewer = `${tag}ar`;
        const authorEditor = `${tag}as`;
        const editorReviewer = `${tag}sr`;
        const authorOnly = `${tag}ao`;
        await ompApi.createContext({
            tag,
            users: [
                user(authorReviewer, 'Ann', 'Authrev', ['author', 'externalReviewer']),
                user(authorEditor, 'Bo', 'Authed', ['author', 'sectionEditor']),
                user(editorReviewer, 'Cy', 'Edrev', ['sectionEditor', 'externalReviewer']),
                user(authorOnly, 'Di', 'Authonly', ['author']),
            ],
        });

        // Author and Reviewer: the reviewer dashboard, with the "My
        // Submissions as Author" group still in the sidebar.
        const arPage = await (await asUser(authorReviewer)).newPage();
        await landThrough(arPage, tag, '/dashboard/reviewAssignments');
        await expect(arPage.getByRole('heading', {name: /^Action Required by me \(\d+\)/})).toBeVisible({
            timeout: 30_000,
        });
        await expect(sideNav(arPage)).toContainText('My Assignments as Reviewer');
        await expect(sideNav(arPage)).toContainText('My Submissions as Author');

        // Author and Series Editor: the Dashboard, the author group still in
        // the sidebar.
        const aePage = await (await asUser(authorEditor)).newPage();
        await landThrough(aePage, tag, '/dashboard/editorial');
        await expect(aePage.getByRole('heading', {name: /^Assigned to me \(\d+\)/})).toBeVisible({
            timeout: 30_000,
        });
        await expect(sideNav(aePage)).toContainText('Editor Dashboard');
        await expect(sideNav(aePage)).toContainText('My Submissions as Author');

        // Series Editor and Reviewer: the Dashboard (no Author role, so no
        // author group: the negative that pairs with the two above).
        const erPage = await (await asUser(editorReviewer)).newPage();
        await landThrough(erPage, tag, '/dashboard/editorial');
        await expect(erPage.getByRole('heading', {name: /^Assigned to me \(\d+\)/})).toBeVisible({
            timeout: 30_000,
        });
        await expect(sideNav(erPage)).toContainText('Editor Dashboard');
        await expect(sideNav(erPage)).toContainText('My Assignments as Reviewer');
        await expect(sideNav(erPage)).not.toContainText('My Submissions as Author');

        // Control: the author-only account lands on My Submissions, as in
        // scenario 1.
        const aoPage = await (await asUser(authorOnly)).newPage();
        await landThrough(aoPage, tag, '/dashboard/mySubmissions');
        const mySub = new MySubmissionsPage(aoPage, tag);
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(mySub.menuGroupLink()).toBeVisible();
        await expect(sideNav(aoPage)).not.toContainText('Editor Dashboard');
        await expect(sideNav(aoPage)).not.toContainText('My Assignments as Reviewer');
    });
});
