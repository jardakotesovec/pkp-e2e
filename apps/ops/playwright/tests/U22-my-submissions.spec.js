// @ts-check
/**
 * @file playwright/tests/U22-my-submissions.spec.js
 *
 * My Submissions (author dashboard) — OPS suite, one test per canonical
 * scenario the spec runs on OPS (common scenarios 1–3 in OPS's own context)
 * plus ONE absence test for scenario 4, which is {OJS OMP}-only ("On a
 * preprint server there is no review, so this scenario has no analogue").
 * The absence test also asserts the reduced author view roster (spec Rule 2:
 * OPS carries Active submissions / Scheduled for publication / Published /
 * Declined only), each silence bounded by the same sidebar's four present
 * entries as positive controls.
 *
 * OPS divergences asserted as the spec's current text:
 * - OPS1 ❓ (register): no "Incomplete submissions" view; drafts sit under
 *   "Active submissions" with a "Production" stage bubble. S2 asserts the
 *   placement and bubble, the absence test the missing view — if the OPS1
 *   ruling flips (view restored, bubble relabeled), the spec and these
 *   assertions move together.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - OPS2 🐞 (draft deletion offered but confirming always refused): never
 *   asserted either way. S2 exercises the surrounding behavior the spec
 *   states plainly — the selection mode, draft-only checkboxes, the
 *   disabled-until-selected delete button, the confirm dialog's OFFER, and
 *   the Cancel path (ticks dropped, nothing deleted) — but never presses
 *   "Confirm": neither a successful deletion nor the refusal is contract
 *   while the finding is open.
 * - A3 ❓: S3's "Scheduled for publication (0)" is arithmetic over this
 *   test's own seeding, not an assertion that no feeder exists on OPS.
 * - A1/A2 ❓ (review progress counters): no review ever runs on OPS, so the
 *   cells never arise; nothing to assert or park.
 * - Rule 3's landing-precedence combinations and the old author-dashboard
 *   link forward, and the access-denied page for a roleless account, are not
 *   canonical scenarios of this spec. S1 exercises the landing rule through
 *   the retired submissions address (an author-only account forwards to My
 *   Submissions). Rule 3's journal-vs-site login split (the sign-in landing
 *   is context-login behavior; the site login page lands on the site index
 *   on a multi-server install) is likewise not asserted: the auth fixture
 *   signs in once on the site login page purely to cache cookies, asserting
 *   nothing about where sign-in lands.
 * - Rule 5's Filters panel is Submissions dashboard machinery; only the
 *   search box is scenario'd here. Rule 7c/7d activity cells have no OPS
 *   analogue (no copyediting stage; the issue condition makes 7d OJS-only).
 * - Rule 9's grayed-out menu state (no draft rows on the page) has no
 *   canonical scenario; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. S2 and S3 isolate on scratch preprint servers with
 * throwaway authors (sidebar badge counts need a list only the test
 * controls); S1 and the absence test ride author.alex's own rows in
 * publicknowledge, scoped by tag search. S2 additionally seeds its resume
 * step through the wizard's own "Save for Later" (spec fn-s2 — the wizard
 * resumes only at a SAVED step, and the scenario API has no saved-step
 * knob). The list itself sends no mail
 * (spec Side effects), so there are no Mailpit assertions. Waits are
 * event-based (auto-wait on rows, headings and badges) — no hard-coded
 * sleeps. Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
// The OPS extension of the shared POM: same list mechanics, OPS-shaped
// workflow-panel anchors (the author panel has no "Workflow:" heading).
const {MySubmissionsPage} = require('../pages/MySubmissionsPage.js');
const {
    expectWizardOpen,
    expectStep,
    STEPS,
    wizardUrl,
    continueTo,
    saveForLater,
} = require('../pages/SubmissionWizardPages.js');

const SERVER = 'publicknowledge';

/** The OPS author's whole view roster (spec Rule 2), in sidebar order. */
const OPS_VIEWS = [
    'Active submissions',
    'Scheduled for publication',
    'Published',
    'Declined',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u22${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('my submissions', () => {
    test('S1: track and open a preprint', {tag: '@smoke'}, async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Title deliberately avoids the word "Production" so the stage
        // bubble's label can be asserted from the row text unambiguously.
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: 'author.alex',
            title: `arta${tag}`,
        });

        // An author-only account lands on My Submissions, "Active
        // submissions" view (Rule 3 — exercised through the retired
        // submission-list address, which forwards the same way).
        const page = await (await asUser('author.alex')).newPage();
        await page.goto(`/index.php/${SERVER}/submissions`);
        await page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        const mySub = new MySubmissionsPage(page, SERVER);
        await mySub.expectViewHeading('Active submissions');

        // The row shows the preprint's ID, the authors-and-title line, and
        // its current stage in a bubble — on a preprint server every
        // submission sits at Production (Rule 4).
        const row = await mySub.findRowByTag(tag);
        await expect(row).toContainText(String(submissionId));
        await expect(row).toContainText(`arta${tag}`);
        await expect(row).toContainText('Author');
        await expect(row).toContainText('Production');

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
    });

    test('S2: resume drafts and the deletion flow up to its confirm dialog', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // A scratch preprint server so the list and its badges hold only this
        // test's rows: two drafts and one submitted control.
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const draftA = await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `drafta${tag}`, submitted: false,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `draftb${tag}`, submitted: false,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `subm${tag}`,
        });

        // fn-s2 seeding: give draftA a deterministic resume step — the wizard
        // resumes at the last step saved with "Save for Later"; a step merely
        // continued past is not remembered (Rule 6), and the scenario API has
        // no saved-step knob. Walk draftA's wizard to Details and save there.
        const page = await (await asUser(author)).newPage();
        await page.goto(wizardUrl(tag, draftA.submissionId));
        await expectWizardOpen(page);
        await continueTo(page, STEPS.details);
        await saveForLater(page);

        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // OPS1 divergence, asserted as the spec's current text: the drafts
        // sit under "Active submissions" alongside the submitted row (no
        // Incomplete view — the roster is the absence test's territory);
        // each draft row wears the "Production" stage bubble, offers
        // "Complete submission" and no "View" (Rules 4 and 6). The submitted
        // row's "View" is the positive control for the no-"View" claim.
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.expectViewCount('Active submissions', 3);
        for (const title of [`drafta${tag}`, `draftb${tag}`]) {
            const row = mySub.row(title);
            await expect(row).toBeVisible();
            await expect(row).toContainText('Production');
            await expect(mySub.completeSubmissionButton(row)).toBeVisible();
            await expect(mySub.viewButton(row)).toHaveCount(0);
        }
        await expect(mySub.viewButton(mySub.row(`subm${tag}`))).toBeVisible();
        await expect(mySub.completeSubmissionButton(mySub.row(`subm${tag}`))).toHaveCount(0);

        // "Complete submission" reopens the submission wizard at the step
        // last saved with "Save for Later" — Details, saved above (Rule 6).
        await mySub.completeSubmissionButton(mySub.row(`drafta${tag}`)).click();
        await expectWizardOpen(page);
        await expectStep(page, STEPS.details);
        expect(page.url()).toContain(`id=${draftA.submissionId}`);

        // Back on the list: enter the draft-deletion selection mode (Rule 9
        // — the flow is offered end to end on a preprint server; the confirm
        // press itself is register 🐞 OPS2 and is never taken).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.enterBulkDeleteSelection();

        // Checkboxes appear on draft rows only — the submitted row gets none
        // (positive control: both draft rows carry one) — and the delete
        // button stays disabled until something is selected.
        await expect(mySub.row(`drafta${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toBeVisible();
        await expect(mySub.row(`subm${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.bulkDeleteButton()).toBeDisabled();

        // Tick a draft — the delete button enables — and open the confirm
        // dialog: the offer the spec states plainly.
        await mySub.checkRowCheckbox(mySub.row(`draftb${tag}`));
        await expect(mySub.bulkDeleteButton()).toBeEnabled();
        await mySub.bulkDeleteButton().click();
        const dialog = mySub.bulkDeleteConfirmDialog();
        await expect(dialog).toBeVisible({timeout: 30_000});
        await expect(dialog).toContainText(
            'Are you sure you want to delete the selected items? This action cannot be undone.'
        );
        await expect(dialog.getByRole('button', {name: 'Confirm', exact: true})).toBeVisible();

        // Cancel in the dialog leaves selection mode entirely — ticks
        // dropped, nothing deleted (Rule 9): the selection-mode buttons and
        // checkboxes are gone, both drafts still listed, counts unchanged.
        await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(dialog).toHaveCount(0, {timeout: 30_000});
        await expect(mySub.bulkDeleteButton()).toHaveCount(0);
        await expect(mySub.row(`draftb${tag}`).getByRole('checkbox')).toHaveCount(0);
        await expect(mySub.row(`drafta${tag}`)).toBeVisible();
        await expect(mySub.row(`draftb${tag}`)).toBeVisible();
        await mySub.expectViewHeading('Active submissions', 3);
        await mySub.expectViewCount('Active submissions', 3);
    });

    test('S3: browse the views and search', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        // A scratch preprint server (badge counts need a list only this test
        // feeds) with a throwaway author: two posted preprints and one
        // declined. Continuous posting needs no issue; the decline is the
        // whole OPS decision roster's negative outcome.
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            users: [
                {username: author, givenName: 'Vera', familyName: 'Views', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `puba${tag}`, published: true,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `pubb${tag}`, published: true,
        });
        await opsApi.createSubmission({
            tag, context: tag, submitter: author, title: `decl${tag}`,
            decisions: ['decline'],
        });

        const page = await (await asUser(author)).newPage();
        const mySub = new MySubmissionsPage(page, tag);
        await mySub.goto();

        // Walk the sidebar's view entries — OPS's four (Rule 2): each badge
        // carries the count its view holds after seeding.
        const expectedCounts = [
            ['Active submissions', 0],
            ['Scheduled for publication', 0],
            ['Published', 2],
            ['Declined', 1],
        ];
        for (const [name, count] of expectedCounts) {
            await mySub.expectViewCount(name, count);
        }

        // A view holding nothing shows "No Items".
        await mySub.openView('Active submissions');
        await mySub.expectViewHeading('Active submissions', 0);
        await expect(page.getByText('No Items')).toBeVisible();

        // The posted preprints under "Published".
        await mySub.openView('Published');
        await mySub.expectViewHeading('Published', 2);
        await expect(mySub.row(`puba${tag}`)).toBeVisible();
        await expect(mySub.row(`pubb${tag}`)).toBeVisible();

        // The declined one under "Declined", with its "Declined" stage
        // bubble.
        await mySub.openView('Declined');
        await mySub.expectViewHeading('Declined', 1);
        const declRow = mySub.row(`decl${tag}`);
        await expect(declRow).toBeVisible();
        await expect(declRow).toContainText('Declined');

        // Search narrows the current view to the typed title; the heading
        // keeps the view's name and count (Rule 5).
        await mySub.openView('Published');
        await mySub.searchFor(`puba${tag}`);
        await expect(mySub.row(`puba${tag}`)).toBeVisible({timeout: 30_000});
        await expect(mySub.row(`pubb${tag}`)).toHaveCount(0);
        await mySub.expectViewHeading('Published', 1);
    });

    test('S4 absence {OPS}: reduced view roster, no revisions surface', async ({asUser, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        // Scenario 4 ("Act on a revision request") is {OJS OMP} — a preprint
        // server has no review, so it has no analogue here (spec Rule 2 /
        // OPS1). One submitted preprint gives every silence its positive
        // control row.
        await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: 'author.alex',
            title: `abs${tag}`,
        });

        const page = await (await asUser('author.alex')).newPage();
        const mySub = new MySubmissionsPage(page, SERVER);
        await mySub.goto();

        // The sidebar's author group carries exactly OPS's four views
        // (positive controls, asserted first so the absences are bounded by
        // a rendered menu)…
        await mySub.openView('Active submissions');
        for (const name of OPS_VIEWS) {
            await expect(mySub.viewLink(name)).toBeVisible();
        }
        // …and none of the three views a journal's author would have: no
        // revisions views (no review stage) and no "Incomplete submissions"
        // (OPS1 — drafts sit inside "Active submissions", S2).
        await expect(mySub.viewLink('Revisions requested')).toHaveCount(0);
        await expect(mySub.viewLink('Revisions submitted')).toHaveCount(0);
        await expect(mySub.viewLink('Incomplete submissions')).toHaveCount(0);

        // A submitted preprint's row offers "View" (positive control) and no
        // revisions affordance of any kind — no "Submit revisions" button,
        // no "Revision requested" alert (Rule 7a is {OJS OMP}).
        const row = await mySub.findRowByTag(tag);
        await expect(mySub.viewButton(row)).toBeVisible();
        await expect(mySub.submitRevisionsButton(row)).toHaveCount(0);
        await expect(row.getByText('Revision requested')).toHaveCount(0);
    });
});
