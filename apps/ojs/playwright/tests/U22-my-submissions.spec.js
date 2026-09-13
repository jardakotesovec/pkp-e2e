// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * My Submissions (author dashboard) — OJS suite, one test per canonical
 * scenario the spec runs on OJS (scenarios 1–3 and 5 common; scenario 4 is
 * OJS/OMP-only). Scenario 3 carries the OJS-specific "Scheduled for
 * publication" feeder (Rule 7d: issue scheduling).
 * Spec: docs/specs/U22-my-submissions.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 ❓
 * (S4 asserts the review counter exactly as scenario 4 states it; if the
 * ruling reverses, the spec and the assertion move together), A2 ❓ (S3
 * declines from the Submission stage, so a declined-during-review row is
 * read neither way), A3 ❓, A4 ❓, A5 ❓ (S1's old link points at a submitted
 * submission only), OMP1 ❓, OPS1 ❓, OPS2 🐞 (other apps' territory).
 * The spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S2, S4 and S5 isolate on scratch journals with throwaway
 * users (sidebar badge counts and landings need a list only the test
 * controls); S1 runs the roster's author-only accounts and manager on
 * publicknowledge; S3 mints a throwaway author via a helper context and
 * seeds their submissions in publicknowledge (issue scheduling needs the
 * seeded issues), so every count is scoped to that author's own list. The
 * mailbox reads (S2, S3) are before/after counts on the throwaway author's
 * own address, the "after" bounded by the response that would have carried
 * the mail. Waits are event-based (auto-wait on rows, headings and badges);
 * no hard-coded sleeps. Everything runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {
    uploadViaWizard,
    uploadWizardDialog,
    uploadWizardSteps,
    uploadWizardTitles,
    inMemoryFile,
} = require('../pages/ReviewStagePages.js');

const JOURNAL = 'publicknowledge';
const WORKFLOW_HEADING = /^Workflow:/;

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('my submissions', () => {
    test('S1: track and open a submission', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Submission" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view, with the "My Submissions as Author" group in
        // the sidebar (Rules 1, 3). The sign-in fixture caches cookies at
        // the site login and asserts nothing about where sign-in lands, so
        // the landing is read through the retired submission-list address,
        // which forwards the same way (fn-s1).
        const page = await (await asUser('author.alex')).newPage();
        const mySub = new MySubmissionsPage(page, JOURNAL);
        await mySub.gotoRetiredListAddress();
        await expect(page).toHaveURL(/\/dashboard\/mySubmissions/);
        await mySub.expectViewHeading('Active submissions');
        await expect(mySub.menuGroupLink()).toBeVisible();

        // The row shows the submission's ID, the authors-and-title line, and
        // the current stage in a bubble (Rule 4); its Editorial Activity
        // cell is empty while the submission awaits the editorial team's
        // first move (Rule 7e; the Stage cell's text is the positive control
        // that the row's cells are being read).
        const row = await mySub.findRowByTag(tag);
        await expect(row).toContainText(String(submissionId));
        await expect(row).toContainText(`arta${tag}`);
        await expect(row).toContainText('Author');
        await expect(mySub.stageCell(row)).toHaveText(/^\s*Submission\s*$/);
        await expect(mySub.activityCell(row)).toHaveText(/^\s*$/);

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
        // submission's workflow panel already open (Rule 3).
        await mySub.gotoOldAuthorDashboardLink(submissionId);
        await page.waitForURL(
            (url) =>
                url.pathname.includes('/dashboard/mySubmissions') &&
                url.searchParams.get('workflowSubmissionId') === String(submissionId),
            {waitUntil: 'commit', timeout: 30_000}
        );
        await mySub.expectWorkflowOpen();
        await expect(mySub.workflowDialog()).toContainText(`arta${tag}`);
        await expect(mySub.workflowDialog()).toContainText(String(submissionId));
        await expect(mySub.workflowAccessDenied()).toHaveCount(0);
        await mySub.closeWorkflow();

        // The same link in a second author's browser: an access-denied page
        // and no workflow panel (Rule 3; the owner's open panel above is
        // the positive control).
        const beaPage = await (await asUser('author.bea')).newPage();
        const beaSub = new MySubmissionsPage(beaPage, JOURNAL);
        await beaSub.gotoOldAuthorDashboardLink(submissionId);
        await expect(beaSub.workflowAccessDenied()).toBeVisible({timeout: 30_000});
        await expect(beaPage.getByRole('heading', {name: WORKFLOW_HEADING})).toHaveCount(0);
        await expect(beaPage.getByRole('dialog')).toHaveCount(0);

        // Control: a Journal Manager who does not author types the list's
        // address: the access-denied page, no list, no sidebar (Actors row
        // 1; the author's list above is the positive control).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerSub = new MySubmissionsPage(managerPage, JOURNAL);
        await managerPage.goto(managerSub.url());
        await expect(managerSub.accessDenied()).toBeVisible({timeout: 30_000});
        await expect(managerPage.getByRole('heading', {name: /^Active submissions/})).toHaveCount(0);
        await expect(managerSub.sideNav()).toHaveCount(0);
        await expect(managerPage.getByRole('table')).toHaveCount(0);
    });

    test('S2: resume and clean up drafts', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch journal so the list and its badges hold only this test's
        // rows: two drafts and one submitted control.
        const author = `${tag}au`;
        const mailTo = `${author}@mail.test`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: mailTo, roles: ['author']},
            ],
        });
        const draftA = await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        const draftB = await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: `subm${tag}`,
        });

        // fn-s2 seeding: the scenario API has no saved-step key, so the
        // first draft's wizard is walked to "Details" and saved there with
        // "Save for Later" before the list is opened.
        const page = await (await asUser(author)).newPage();
        const wizard = new SubmissionWizardPage(page, tag);
        await wizard.goto(draftA.submissionId);
        await wizard.saveForLaterAt('Details');

        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The "Incomplete submissions" view holds the two drafts and not the
        // submitted submission (Rule 2); each draft row wears the
        // "Incomplete" stage bubble, offers "Complete submission" and has no
        // "View" (Rules 4, 6; the submitted row's "View" on the Active view
        // below is the positive control).
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 2);
        for (const title of [`drafta${tag}`, `draftb${tag}`]) {
            const row = mySub.row(title);
            await expect(row).toBeVisible();
            await expect(mySub.stageCell(row)).toHaveText(/^\s*Incomplete\s*$/);
            await expect(mySub.completeSubmissionButton(row)).toBeVisible();
            await expect(mySub.viewButton(row)).toHaveCount(0);
        }
        await expect(mySub.row(`subm${tag}`)).toHaveCount(0);

        // "Complete submission" on the saved draft reopens the wizard at
        // "Details", the step saved with "Save for Later" (Rule 6).
        await mySub.completeSubmissionButton(mySub.row(`drafta${tag}`)).click();
        await wizard.expectLoaded();
        expect(page.url()).toContain(`id=${draftA.submissionId}`);
        await wizard.expectStep('Details');

        // Back on the list, "Complete submission" on the other draft, only
        // to note the address its wizard opens at; then back again.
        await mySub.goto();
        await mySub.openView('Incomplete submissions');
        await mySub.completeSubmissionButton(mySub.row(`draftb${tag}`)).click();
        await wizard.expectLoaded();
        expect(page.url()).toContain(`id=${draftB.submissionId}`);
        const draftBWizardAddress = page.url();
        await mySub.goto();

        // "Active submissions" holds drafts and the submitted row together,
        // one submission appearing in several views (Rule 2).
        await mySub.expectViewHeading('Active submissions', 3);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toBeVisible();
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();
        await mySub.expectViewCount('Incomplete submissions', 2);

        // Enter the draft-deletion selection mode: checkboxes appear on
        // draft rows only, the submitted row gets none (Rule 9), and the
        // delete button stays disabled until something is selected.
        await mySub.enterBulkDeleteSelection();
        await expect(mySub.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.bulkDeleteButton()).toBeDisabled();

        // Tick the other draft and delete it through the confirm dialog.
        // The mailbox is counted before, and again after the delete
        // request has answered (the request that would have carried a
        // mail), so the silence claim is a bounded before/after count.
        const mailBefore = await pkpMail.count({to: mailTo});
        await mySub.checkRowCheckbox(mySub.row(`draftb${tag}`));
        await expect(mySub.bulkDeleteButton()).toBeEnabled();
        await mySub.bulkDeleteButton().click();
        const dialog = mySub.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone.'
        );
        await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        const deleted = page.waitForResponse(
            (r) =>
                /\/_submissions\b/.test(r.url()) &&
                ['POST', 'DELETE'].includes(r.request().method()) &&
                r.status() < 400,
            {timeout: 30_000}
        );
        await dialog.getByRole('button', {name: 'Confirm', exact: true}).click();
        await deleted;

        // The draft is gone and the heading and sidebar counts drop in place
        // — no reload (Rules 9, 10).
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0, {timeout: 30_000});
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await mySub.expectViewHeading('Active submissions', 2);
        await mySub.expectViewCount('Incomplete submissions', 1);
        await mySub.expectViewCount('Active submissions', 2);

        // The deleted draft: listed under neither "Active submissions" nor
        // "Incomplete submissions", nothing on the list offers to restore
        // it (the surviving draft's "Complete submission" is the positive
        // control that row actions are being read), and no email arrived
        // in the author's mailbox (Side effects).
        await expect(page.getByRole('button', {name: /restore|undo/i})).toHaveCount(0);
        await expect(mySub.completeSubmissionButton(mySub.row(`drafta${tag}`))).toBeVisible();
        await mySub.openView('Incomplete submissions');
        await mySub.expectViewHeading('Incomplete submissions', 1);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toHaveCount(0);
        await expect(page.getByRole('button', {name: /restore|undo/i})).toHaveCount(0);
        expect(await pkpMail.count({to: mailTo})).toBe(mailBefore);

        // Control: the submitted row had no checkbox and is still listed
        // after the delete (Actors row 6, Rule 9).
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 2);
        await expect(mySub.row(`subm${tag}`)).toBeVisible();
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();

        // Its wizard address, noted above, no longer opens the wizard (Side
        // effects; the same address opened it before the delete, the
        // positive control): the bare not-found page instead.
        await page.goto(draftBWizardAddress);
        await expect(wizard.notFoundHeading()).toBeVisible({timeout: 30_000});
        await expect(page.getByRole('heading', {name: /Make a Submission/})).toHaveCount(0);
        await expect(page.locator('.pkpSteps')).toHaveCount(0);
    });

    test('S3: browse the views and search', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        // A throwaway author (minted via a helper context) whose submissions
        // are seeded in publicknowledge — the per-author list scopes every
        // count, and the seeded issues feed the OJS "Scheduled for
        // publication" view (Rule 7d). The other author's submission is
        // author.alex's, on the same journal (fn-s3).
        const author = `${tag}au`;
        const mailTo = `${author}@mail.test`;
        await ojsApi.createContext({
            tag: `${tag}h`,
            users: [
                {username: author, givenName: 'Vera', familyName: 'Views', email: mailTo, roles: ['author']},
            ],
        });
        const toProduction = ['skipExternalReview', 'sendToProduction'];
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `puba${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `pubb${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `sched${tag}`,
            decisions: toProduction, published: true,
            issue: {volume: 2, number: 1, year: 2015},
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `decl${tag}`,
            decisions: ['initialDecline'],
        });
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: author, title: `copy${tag}`,
            decisions: ['skipExternalReview'],
        });
        const other = `other${tag}`;
        await ojsApi.createSubmission({
            tag, context: JOURNAL, submitter: 'author.alex', title: other,
        });

        const mailBefore = await pkpMail.count({to: mailTo});
        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, JOURNAL);
        await mySub.goto();

        // Walk the sidebar's view entries: each opens the list under that
        // view's heading with its count, and the entry's badge carries the
        // same number (Rules 1, 2). In every view the other author's
        // submission is absent, read once the view's own rows (or its "No
        // Items") are on screen (Actors row 2).
        const views = [
            ['Active submissions', 1, `copy${tag}`],
            ['Revisions requested', 0, null],
            ['Revisions submitted', 0, null],
            ['Incomplete submissions', 0, null],
            ['Scheduled for publication', 1, `sched${tag}`],
            ['Published', 2, `puba${tag}`],
            ['Declined', 1, `decl${tag}`],
        ];
        for (const [name, count, expectedRow] of views) {
            await mySub.openView(name);
            await mySub.expectViewHeading(name, count);
            await mySub.expectViewCount(name, count);
            if (expectedRow) {
                await expect(mySub.row(expectedRow)).toBeVisible({timeout: 30_000});
            } else {
                await expect(mySub.emptyState()).toBeVisible({timeout: 30_000});
            }
            await expect(mySub.row(other)).toHaveCount(0);
        }

        // "Active submissions": the submission in Copyediting, its activity
        // cell reading "Copyedited Files Uploaded: 0" (Rules 2, 7c).
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 1);
        const copyRow = mySub.row(`copy${tag}`);
        await expect(copyRow).toBeVisible();
        await expect(mySub.stageCell(copyRow)).toHaveText(/^\s*Copyediting\s*$/);
        await expect(mySub.activityCell(copyRow)).toHaveText(/^\s*Copyedited Files Uploaded: 0\s*$/);

        // The issue-scheduled submission sits under "Scheduled for
        // publication" with its activity cell naming the issue (Rule 7d —
        // OJS-specific feeder).
        await mySub.openView('Scheduled for publication');
        await mySub.expectViewHeading('Scheduled for publication', 1);
        const schedRow = mySub.row(`sched${tag}`);
        await expect(schedRow).toBeVisible();
        await expect(mySub.stageCell(schedRow)).toHaveText(/^\s*Scheduled\s*$/);
        await expect(mySub.activityCell(schedRow)).toHaveText(
            /^\s*To be published in issue Vol\. 2 No\. 1 \(2015\)\s*$/
        );

        // The published submissions under "Published" (Rule 2).
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await expect(mySub.row(`puba${tag}`)).toBeVisible();
        await expect(mySub.row(`pubb${tag}`)).toBeVisible();

        // The declined one under "Declined", with its "Declined" stage
        // bubble and an empty activity cell (Rules 2, 4, 7e; the scheduled
        // row's filled cell above is the positive control).
        await mySub.openView('Declined');
        await mySub.expectViewHeading('Declined', 1);
        const declRow = mySub.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(mySub.stageCell(declRow)).toHaveText(/^\s*Declined\s*$/);
        await expect(mySub.activityCell(declRow)).toHaveText(/^\s*$/);

        // A view holding nothing shows "No Items" (Rule 4; fn-s3 names
        // "Revisions requested" on OJS).
        await mySub.openView('Revisions requested');
        await mySub.expectViewHeading('Revisions requested', 0);
        await expect(mySub.emptyState()).toBeVisible();

        // Search narrows the current view to the typed title; the heading
        // keeps the view's name and count (Rule 5).
        await mySub.openView('Published');
        await mySub.searchFor(`puba${tag}`);
        await expect(mySub.row(`puba${tag}`)).toBeVisible({timeout: 30_000});
        await expect(mySub.row(`pubb${tag}`)).toHaveCount(0);
        await mySub.expectViewHeading('Published', 1);

        // "Filters": the panel offers the days-since-last-activity filter
        // and, the seeded journal having them, the section, categories and
        // issue filters; "Assigned To Editor" is not among them (Rule 5;
        // the present fields are the positive control).
        const filters = await mySub.openFilters();
        await expect(mySub.filterField('Days since last activity')).toBeVisible();
        await expect(mySub.filterField('Section')).toBeVisible();
        await expect(mySub.filterField('Categories')).toBeVisible();
        await expect(mySub.filterField('Issues')).toBeVisible();
        await expect(filters.getByText('Assigned To Editor')).toHaveCount(0);
        await mySub.closeFilters();

        // The author's mailbox: nothing arrived through any of the above
        // (Side effects): the count is the one taken before the walk.
        expect(await pkpMail.count({to: mailTo})).toBe(mailBefore);

        // Control: searching the other author's title on "Active
        // submissions" finds no row (the list narrows to nothing), while
        // the author's own Copyediting title is found the same way (Actors
        // row 2, Rule 5).
        await mySub.openView('Active submissions');
        await mySub.searchFor(other);
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(mySub.emptyState()).toBeVisible({timeout: 30_000});
        await expect(mySub.row(other)).toHaveCount(0);
        await mySub.searchFor(`copy${tag}`);
        await expect(mySub.row(`copy${tag}`)).toBeVisible({timeout: 30_000});
        await mySub.expectViewHeading('Active submissions', 1);
    });

    test('S4: act on a revision request', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // The first scratch journal, at the default review type
        // (double-anonymous), with a throwaway author and two reviewers:
        // the revision-request submission (round 1 revisions requested, one
        // reviewer accepted) and the under-review one (two reviewers, one
        // accepted, one completed). The second scratch journal has its
        // default review type set to Open and one submission whose single
        // reviewer has completed (fn-s4).
        const author = `${tag}au`;
        const reviewerOne = `${tag}rv`;
        const reviewerTwo = `${tag}rw`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
                {username: reviewerOne, givenName: 'Rex', familyName: 'Reviewer', email: `${reviewerOne}@mail.test`, roles: ['externalReviewer']},
                {username: reviewerTwo, givenName: 'Rita', familyName: 'Reviewer', email: `${reviewerTwo}@mail.test`, roles: ['externalReviewer']},
            ],
        });
        await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: `Revise ${tag}`,
            decisions: ['sendExternalReview', 'requestRevisions'],
            reviewRounds: [{reviewers: [{username: reviewerOne, status: 'accepted'}]}],
        });
        await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: `Underreview ${tag}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [
                {username: reviewerOne, status: 'accepted'},
                {username: reviewerTwo, status: 'completed'},
            ]}],
        });
        const openTag = `${tag}o`;
        const openAuthor = `${openTag}au`;
        const openReviewer = `${openTag}rv`;
        await ojsApi.createContext({
            tag: openTag,
            review: {defaultReviewMode: 'open'},
            users: [
                {username: openAuthor, givenName: 'Ola', familyName: 'Author', email: `${openAuthor}@mail.test`, roles: ['author']},
                {username: openReviewer, givenName: 'Olga', familyName: 'Reviewer', email: `${openReviewer}@mail.test`, roles: ['externalReviewer']},
            ],
        });
        await ojsApi.createSubmission({
            tag: openTag,
            context: openTag,
            submitter: openAuthor,
            title: `Openreview ${openTag}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: openReviewer, status: 'completed'}]}],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // The submission lists under "Revisions requested"; its activity
        // cell reads "Revision requested" with "Submit revisions" (Rules 2,
        // 7a).
        await mySub.expectViewCount('Revisions requested', 1);
        await mySub.expectViewCount('Revisions submitted', 0);
        await mySub.openView('Revisions requested');
        const row = mySub.row(`Revise ${tag}`);
        await expect(row).toBeVisible();
        await expect(mySub.activityCell(row)).toContainText('Revision requested');
        await expect(mySub.submitRevisionsButton(row)).toBeVisible();

        // "Submit revisions" opens the upload dialog directly: three steps,
        // "Upload File", "Review Details" and "Confirm", and no title of its
        // own (the step tabs are the positive control that the dialog's
        // text is read); a small text file named after the run's tag goes
        // through them via the shared helper (Rule 7a).
        await mySub.submitRevisionsButton(row).click();
        const dialog = uploadWizardDialog(page);
        await expect(uploadWizardSteps(dialog)).toHaveText([
            /1\. Upload File/,
            /2\. Review Details/,
            /3\. Confirm/,
        ]);
        await expect(uploadWizardTitles(dialog)).toHaveCount(0);
        await uploadViaWizard(page, {file: inMemoryFile(`revision${tag}.txt`)});

        // Back on the list without a reload: the submission now sits under
        // "Revisions submitted", the sidebar badges have moved with it, and
        // its activity cell shows the review progress counter, "Review
        // update 0/1", not a "revisions submitted" message (Rules 7a, 7b,
        // 10; the counter is register ❓ A1, asserted as the spec's current
        // text). Control: the delivered row no longer offers "Submit
        // revisions" (Rule 7a).
        await mySub.expectViewCount('Revisions requested', 0);
        await mySub.expectViewCount('Revisions submitted', 1);
        await mySub.openView('Revisions submitted');
        const rowAfter = mySub.row(`Revise ${tag}`);
        await expect(rowAfter).toBeVisible();
        await expect(mySub.reviewCounter(rowAfter)).toHaveText(/Review update 0\/1/);
        await expect(mySub.activityCell(rowAfter)).not.toContainText(/revisions? submitted/i);
        await expect(mySub.submitRevisionsButton(rowAfter)).toHaveCount(0);
        await expect(rowAfter.getByText('Revision requested')).toHaveCount(0);

        // Under review, nothing asked: under "Active submissions" the second
        // submission's cell reads "Review update 1/2" and shows no
        // "Reviewers assigned:" row, the reviews not being open (Rule 7b;
        // the open journal's avatar row below is the positive control).
        await mySub.openView('Active submissions');
        const underReview = mySub.row(`Underreview ${tag}`);
        await expect(underReview).toBeVisible();
        await expect(mySub.reviewCounter(underReview)).toHaveText(/Review update 1\/2/);
        await expect(mySub.reviewersAssignedLabel(underReview)).toHaveCount(0);
        await expect(mySub.reviewerAvatars(underReview)).toHaveCount(0);

        // A completed open review: on the journal whose default review type
        // is Open, the cell reads "Review update 1/1" with a "Reviewers
        // assigned:" row of one avatar; the avatar's popover names the
        // reviewer and the review type (Rule 7b).
        const openPage = await (await asUser(openAuthor)).newPage();
        const openSub = new MySubmissionsPage(openPage, openTag);
        await openSub.goto();
        await openSub.expectViewHeading('Active submissions', 1);
        const openRow = openSub.row(`Openreview ${openTag}`);
        await expect(openRow).toBeVisible();
        await expect(openSub.reviewCounter(openRow)).toHaveText(/Review update 1\/1/);
        await expect(openSub.reviewersAssignedLabel(openRow)).toBeVisible();
        await expect(openSub.reviewerAvatars(openRow)).toHaveCount(1);
        const popover = await openSub.openReviewerPopover(openRow);
        await expect(popover).toContainText('Olga Reviewer');
        await expect(popover.getByText('Open', {exact: true}).first()).toBeAttached();
        await openSub.closeActivityPopover(openRow);
    });

    test('S5: landing for an account holding other roles too', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // A scratch journal with four throwaway accounts: three holding two
        // roles each and the author-only control (fn-s5). The sign-in
        // fixture caches cookies at the site login, so each landing is read
        // through the retired submission-list address, which forwards the
        // same way as the journal's own login (Rule 3, fn-c).
        const authorReviewer = `${tag}ar`;
        const authorEditor = `${tag}ae`;
        const editorReviewer = `${tag}er`;
        const authorOnly = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: authorReviewer, givenName: 'Ann', familyName: 'Authorreviewer', roles: ['author', 'externalReviewer']},
                {username: authorEditor, givenName: 'Abe', familyName: 'Authoreditor', roles: ['author', 'sectionEditor']},
                {username: editorReviewer, givenName: 'Eve', familyName: 'Editorreviewer', roles: ['sectionEditor', 'externalReviewer']},
                {username: authorOnly, givenName: 'Ada', familyName: 'Author', roles: ['author']},
            ],
        });

        // Author and Reviewer: the reviewer dashboard, with the "My
        // Submissions as Author" group still in the sidebar (Rule 3).
        const arPage = await (await asUser(authorReviewer)).newPage();
        const arSub = new MySubmissionsPage(arPage, tag);
        await arSub.gotoRetiredListAddress();
        await expect(arPage).toHaveURL(/\/dashboard\/reviewAssignments/);
        await expect(arPage.getByRole('heading', {level: 1})).toHaveText(/Action Required by me/);
        await expect(arSub.menuGroupLink()).toBeVisible();

        // Author and Section Editor: the Dashboard, with the author group
        // still in the sidebar (Rule 3).
        const aePage = await (await asUser(authorEditor)).newPage();
        const aeSub = new MySubmissionsPage(aePage, tag);
        await aeSub.gotoRetiredListAddress();
        await expect(aePage).toHaveURL(/\/dashboard\/editorial/);
        await expect(aePage.getByRole('heading', {level: 1})).toHaveText(/Assigned to me/);
        await expect(aeSub.menuGroupLink()).toBeVisible();

        // Section Editor and Reviewer: the Dashboard (Rule 3).
        const erPage = await (await asUser(editorReviewer)).newPage();
        const erSub = new MySubmissionsPage(erPage, tag);
        await erSub.gotoRetiredListAddress();
        await expect(erPage).toHaveURL(/\/dashboard\/editorial/);
        await expect(erPage.getByRole('heading', {level: 1})).toHaveText(/Assigned to me/);

        // Control: the author-only account lands on My Submissions, as in
        // scenario 1 (Rule 3).
        const auPage = await (await asUser(authorOnly)).newPage();
        const auSub = new MySubmissionsPage(auPage, tag);
        await auSub.gotoRetiredListAddress();
        await expect(auPage).toHaveURL(/\/dashboard\/mySubmissions/);
        await auSub.expectViewHeading('Active submissions');
        await expect(auSub.menuGroupLink()).toBeVisible();
    });
});
