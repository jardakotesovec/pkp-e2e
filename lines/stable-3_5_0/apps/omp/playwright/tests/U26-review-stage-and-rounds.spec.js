// @ts-check
/**
 * @file lines/stable-3_5_0/apps/omp/playwright/tests/U26-review-stage-and-rounds.spec.js
 *
 * U26 — Review stage & rounds, the OMP suite of stable-3_5_0 (spec:
 * lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md). One test
 * per canonical scenario the spec runs on a press: common scenarios 1–12 in
 * OMP vocabulary (press, monograph, External Review — glossary
 * substitution), OMP-specific scenario 13 (skip-internal entry) and
 * scenario 15 (the review minimum, OJS and OMP). Scenario 14 is OPS-only.
 * On a press the entry into External Review used throughout is the
 * Submission-stage "Send to External Review" decision (skip-internal,
 * OMP1); the Internal Review STAGE itself belongs to the Internal Review
 * stage feature (U71) and no test here touches its machinery.
 *
 * Not covered, by register ID (the spec's Coverage section is the record
 * of everything else left out): A1, A9, A10, A13, A14 (🐞); A2, A3, A4,
 * A5, A6, A7, A8, A11, A15, OMP2, OMP3 (❓).
 *
 * Seeding: scenario endpoints only; scratch submissions ride the read-only
 * `publicknowledge` press (series `monographs` auto-assigns the seeded
 * deciding editors on submit); scenario 4 uses a scratch press with
 * throwaway users because its mail assertion needs a unique throwaway
 * recipient (Mailpit is shared across fleets — never cleared, every mail
 * claim scoped by recipient address naming app + test); S11's second
 * submission sits on a scratch press too (a Series Editor who is the only
 * editorial participant, which the seeded press's auto-assignment forbids);
 * S15 runs on a scratch press created with the review minimum through the
 * context's `review` passthrough key (the seeded press keeps the default 0).
 */
const {test, expect} = require('../support/fixtures.js');
const {
    STATUS,
    DECISIONS,
    workflowModal,
    topModal,
    primaryRegion,
    actionsRegion,
    secondaryRegion,
    decisionButton,
    openEditorial,
    openAuthorView,
    minimumLine,
    expectRoundStatus,
    roundStatusBox,
    expectPlainStatus,
    awaitComposerReady,
    walkDecisionWizard,
    requestRevisions,
    completeReviewAsReviewer,
    reviewerRow,
    readReviewWindow,
    openReadReview,
    confirmReview,
    confirmReviewAsEditor,
    addReviewer,
    acceptReviewRequest,
    REVISIONS_OPTIONS,
    openRequestRevisionsChoice,
    revisionsOption,
    closeRequestRevisionsChoice,
    DecisionWorkflow,
    completeUploadWizard,
    assignParticipant,
    openTasksPanel,
    closeTopModal,
    openReviewFilesDialog,
    showAllStageFiles,
    reviewFileCheckbox,
    confirmReviewFilesDialog,
    uploadReviewFileInDialog,
    startUploadWizard,
    closeUploadWizard,
    oldAuthorDashboardUrl,
    oldReviewRoundInfoUrl,
} = require('../pages/ReviewStagePages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');

const PK = 'publicknowledge';

/**
 * The level-3 headings of an editor's External Review round, top to bottom
 * (the status box, the main column's panels, the right-hand column's
 * Participants): the screen scenario 1 opens on, and scenario 13's control.
 */
const EXTERNAL_ROUND_HEADINGS = [
    'Round 1 Status',
    'Revisions Uploaded',
    'Files for Review',
    'Reviewers',
    'Participants',
];

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/**
 * Seed a monograph on publicknowledge in series `monographs` (submit-time
 * auto-assignment enrols the seeded deciding editors — spec footnote s
 * caveat holds only on scratch presses).
 */
async function seedMonograph(ompApi, tag, {decisions = [], rounds = null, submitter = 'author.alex'} = {}) {
    const spec = {
        tag,
        context: PK,
        submitter,
        series: 'monographs',
    };
    if (decisions.length) {
        spec.decisions = decisions;
    }
    if (rounds) {
        spec.reviewRounds = rounds;
    }
    return ompApi.createSubmission(spec);
}

/**
 * A real sign-in through the login form in a fresh, state-less context (the
 * `asUser` fixture reuses a cached session, which is not a login). Closes
 * the context again: the login itself is the point.
 */
async function signInFresh(browser, baseURL, username) {
    const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
    const login = new LoginPage(await context.newPage());
    await login.goto();
    await login.signIn(username, getPassword(username));
    await context.close();
}

/** Seed straight into External Review round 1 (skip-internal entry). */
async function seedInExternalReview(ompApi, tag, {reviewers = [], extraRounds = [], extraDecisions = []} = {}) {
    return seedMonograph(ompApi, tag, {
        decisions: ['skipInternalReview', ...extraDecisions],
        rounds: [{stage: 'external', reviewers}, ...extraRounds],
    });
}

test.describe('Review stage & rounds (U26)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: Round 1 opens with the submission', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s1');
        const fileA = `msa-${tag}.txt`;
        const fileB = `msb-${tag}.txt`;
        const fileC = `msc-${tag}.txt`;
        // A throwaway Series Editor on a scratch press of the test's own:
        // "Review files updated." is a notice the server keeps for the
        // account until a page of it fetches it, and any other page of the
        // same account (a parallel test signed in as a roster persona) takes
        // it first (patterns.md parallel lesson 2). A scratch press's
        // submit assigns no editor (footnote s): `participants[]` does.
        const editor = `se${tag}`;
        const author = `au${tag}`;
        await ompApi.createContext({
            tag,
            users: [
                {username: editor, roles: ['sectionEditor']},
                {username: author, roles: ['author']},
            ],
        });
        const seeded = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            participants: [{username: editor, role: 'sectionEditor'}],
        });

        const page = await (await asUser(editor)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);

        // Two submission files for the wizard to choose from (the seed
        // carries none).
        for (const fileName of [fileA, fileB]) {
            await primaryRegion(modal)
                .getByRole('button', {name: 'Upload', exact: true})
                .first()
                .click();
            await completeUploadWizard(page, fileName);
            await expect(primaryRegion(modal).getByText(fileName).first()).toBeVisible({
                timeout: 15_000,
            });
        }

        // "Send to External Review", choosing the first file alone.
        await decisionButton(modal, 'Send to External Review').click();
        await expect(
            page.getByRole('heading', {name: /Send to External Review: Notify Authors/})
        ).toBeVisible({timeout: 15_000});
        await awaitComposerReady(page);
        await page.getByRole('button', {name: 'Continue', exact: true}).click();
        await expect(
            page.getByRole('heading', {name: 'Select Files', exact: true})
        ).toBeVisible({timeout: 15_000});
        const boxA = page.getByRole('checkbox', {name: new RegExp(fileA)});
        const boxB = page.getByRole('checkbox', {name: new RegExp(fileB)});
        await expect(boxB).toBeVisible();
        if (!(await boxA.isChecked())) {
            await boxA.check();
        }
        if (await boxB.isChecked()) {
            await boxB.uncheck();
        }
        await page.getByRole('button', {name: /Record (Editorial )?Decision/}).click();
        await expect(page.getByText('View Submission Summary')).toBeVisible({
            timeout: 30_000,
        });

        // The stage opens on Review Round 1 with the round furniture.
        const modal2 = await openEditorial(page, tag, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect(modal2.getByText('Review Round 1', {exact: true}).first()).toBeVisible();
        await expectRoundStatus(modal2, 1, STATUS.waiting);
        // The Files for Review panel lists the chosen file, not the other.
        const reviewFileRow = (name) =>
            primaryRegion(modal2).getByRole('row').filter({hasText: name});
        await expect(reviewFileRow(fileA).first()).toBeVisible();
        await expect(reviewFileRow(fileB)).toHaveCount(0);

        // "Current Review Files For Round 1": the files with checkboxes;
        // the second (Submission-stage) file is listed only once "Show files
        // from all accessible workflow stages." is ticked (finding T-omp-1).
        // Tick it and confirm. (Whether the first file's box mirrors the
        // panel is A7, asserted neither way.)
        let dialog = await openReviewFilesDialog(page, modal2);
        await expect(page.getByText('Current Review Files For Round 1')).toBeVisible();
        await expect(reviewFileCheckbox(dialog, fileA)).toBeVisible();
        await expect(reviewFileCheckbox(dialog, fileB)).toHaveCount(0);
        await showAllStageFiles(dialog, fileB);
        await reviewFileCheckbox(dialog, fileB).check();
        const notice = page.getByText('Review files updated.').first();
        await confirmReviewFilesDialog(page, modal2, dialog, [fileA, fileB]);
        await expect(notice).toBeVisible({timeout: 30_000});

        // Uploading from the dialog: the new file is listed too, and the
        // files listed before are still there (nothing here deletes). The
        // first notice is gone before the second confirm, so the second
        // read is its own notice, not the lingering first one.
        await expect(notice).toBeHidden({timeout: 30_000});
        dialog = await openReviewFilesDialog(page, modal2);
        await uploadReviewFileInDialog(page, dialog, fileC);
        await confirmReviewFilesDialog(page, modal2, dialog, [fileA, fileB, fileC]);
        await expect(notice).toBeVisible({timeout: 30_000});
        await expect(reviewFileRow(fileA).first()).toBeVisible();
        await expect(reviewFileRow(fileB).first()).toBeVisible();

        // Control: the "Review" entry holds "Review Round 1" alone (the
        // Round 1 entry above is the positive read).
        await expect(modal2.getByText('Review Round 2', {exact: true})).toHaveCount(0);
    });

    test('S2: the status line follows the reviewers', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s2');
        // Round 1 with no reviewer: the reviewer is added on screen (a
        // reviewer named in the seed leaves that search, footnote s).
        const seeded = await seedInExternalReview(ompApi, tag);

        const page = await (await asUser('manager.maya')).newPage();
        let modal = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.waiting);

        // "Add Reviewer": the box awaits the reviewer's response.
        await addReviewer(page, 'Julia Reviewer');
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.awaitingResponses);

        // Control: with the request accepted and the review not yet
        // submitted, the box still reads the same.
        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await acceptReviewRequest(juliaPage, PK, seeded.submissionId);
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.awaitingResponses);

        // The reviewer submits their review.
        await completeReviewAsReviewer(
            juliaPage,
            PK,
            seeded.submissionId,
            `Review remarks ${tag}.`
        );
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.newReviews);

        // "Read Review" on the reviewer's row opens the window titled
        // "Review: {submission title}" with the reviewer's name; its
        // "Confirm" confirms the review.
        const win = await openReadReview(page, reviewerRow(modal, 'Julia Reviewer'));
        await expect(win.getByRole('heading', {name: `Review: Submission ${tag}`, exact: true})).toBeVisible();
        await expect(win.getByRole('heading', {name: 'Julia Reviewer', exact: true})).toBeVisible();
        await confirmReview(page, win);
        modal = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.reviewsConfirmed);
    });

    test('S3: request revisions within the round', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s3');
        const seeded = await seedInExternalReview(ompApi, tag);

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await requestRevisions(page, modal, {newRound: false});

        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal2, 1, STATUS.revisionsRequested);

        // The author's task list holds a revisions task for this submission…
        const authorPage = await (await asUser('author.alex')).newPage();
        await authorPage.goto(`/index.php/${PK}/en/dashboard/mySubmissions`);
        const tasks = await openTasksPanel(authorPage);
        await expect(tasks.getByText(`Submission ${tag}`)).toBeVisible();
        await closeTopModal(authorPage);

        // …and their review stage offers the bottom "Upload revisions" button.
        const authorModal = await openAuthorView(authorPage, PK, seeded.submissionId);
        await expect(
            authorModal.getByRole('button', {name: 'Upload revisions'})
        ).toBeVisible();
    });

    test('S4: author uploads a revision', async ({browser, baseURL, ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s4');
        const file1 = `rev1-${tag}.txt`;
        const file2 = `rev2-${tag}.txt`;
        const file3 = `rev3-${tag}.txt`;
        const editor = `ed${tag}`;
        const otherEditor = `ed2${tag}`;
        const sectionEditor = `se${tag}`;
        const funding = `fc${tag}`;
        const author = `au${tag}`;
        const editorEmail = `${tag}ed@mail.test`;
        const otherEditorEmail = `${tag}ed2@mail.test`;
        const sectionEditorEmail = `${tag}se@mail.test`;
        const fundingEmail = `${tag}fc@mail.test`;
        const authorEmail = `${tag}au@mail.test`;
        const NOTICE = 'Revised Version Uploaded';
        const QUESTION = 'The data on this form has changed. Do you wish to continue without saving?';

        // Scratch press: the revised-version notices must land in unique
        // throwaway mailboxes (the roster's addresses are shared). A Press
        // Editor assigned on screen, a Series Editor and a Funding
        // Coordinator assigned in the seed (footnote s), and a second Press
        // Editor never assigned to the stage.
        await ompApi.createContext({
            tag,
            users: [
                {username: editor, roles: ['editor'], givenName: `Ed${tag}`, familyName: 'Editor', email: editorEmail},
                {username: otherEditor, roles: ['editor'], givenName: `Other${tag}`, familyName: 'Editor', email: otherEditorEmail},
                {username: sectionEditor, roles: ['sectionEditor'], givenName: `Se${tag}`, familyName: 'Seriesed', email: sectionEditorEmail},
                {username: funding, roles: ['funding'], givenName: `Fc${tag}`, familyName: 'Funder', email: fundingEmail},
                {username: author, roles: ['author'], givenName: `Au${tag}`, familyName: 'Author', email: authorEmail},
            ],
        });
        const seeded = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            decisions: ['skipInternalReview', 'requestRevisions'],
            reviewRounds: [{stage: 'external'}],
            participants: [
                {username: sectionEditor, role: 'sectionEditor'},
                {username: funding, role: 'funding'},
            ],
        });

        // Scratch presses auto-assign no editor on submit (spec footnote s):
        // the Press Editor assigns themselves to the stage through the
        // Participants panel. Their round stays open from here on.
        const editorPage = await (await asUser(editor)).newPage();
        const editorModal = await openEditorial(editorPage, tag, seeded.submissionId);
        await expectRoundStatus(editorModal, 1, STATUS.revisionsRequested);
        await assignParticipant(editorPage, editorModal, {
            group: 'Press editor',
            query: `Ed${tag}`,
            resultName: `Ed${tag} Editor`,
        });

        // The author holds a revisions task (control for its later removal).
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(`/index.php/${tag}/en/dashboard/mySubmissions`);
        const tasksBefore = await openTasksPanel(authorPage);
        await expect(tasksBefore.getByText(`Submission ${tag}`)).toBeVisible();
        await closeTopModal(authorPage);

        // "Upload revisions", first step only: attach the file, then close
        // the window through its header "Close": the browser asks, "OK".
        const authorModal = await openAuthorView(authorPage, tag, seeded.submissionId);
        await authorModal.getByRole('button', {name: 'Upload revisions'}).click();
        const wizard = await startUploadWizard(authorPage, file1);
        expect(await closeUploadWizard(authorPage, wizard)).toBe(QUESTION);
        // The Revisions Uploaded panel lists the file at once…
        await expect(
            primaryRegion(authorModal).getByText(file1).first()
        ).toBeVisible({timeout: 15_000});
        // …and after a reload.
        const authorModalReloaded = await openAuthorView(authorPage, tag, seeded.submissionId);
        await expect(
            primaryRegion(authorModalReloaded).getByText(file1).first()
        ).toBeVisible({timeout: 15_000});

        // The Editor's screen, open since before the upload, reloaded: the
        // round status flipped to its submitted partner.
        await editorPage.reload();
        const editorModal2 = workflowModal(editorPage);
        await expect(editorModal2.getByRole('heading', {name: /^Workflow:/}).first()).toBeVisible({timeout: 20_000});
        await expectRoundStatus(editorModal2, 1, STATUS.revisionsSubmitted);

        // The author's task is gone (the panel's own answer bounds the read).
        await authorPage.goto(`/index.php/${tag}/en/dashboard/mySubmissions`);
        const tasksAfter = await openTasksPanel(authorPage);
        await expect(tasksAfter.getByText(`Submission ${tag}`)).toHaveCount(0);
        await closeTopModal(authorPage);

        // Mailbox: the assigned Press Editor's and Series Editor's notices,
        // each sent under the author's own name and address (the abandoned
        // wizard recalled nothing)…
        for (const to of [editorEmail, sectionEditorEmail]) {
            const notice = await pkpMail.find({to, subject: NOTICE});
            expect(notice.From.Address).toBe(authorEmail);
            expect(notice.From.Name).toContain(`Au${tag}`);
        }
        // …and none for the assigned Funding Coordinator, bounded by the
        // Press Editor's notice read the same way.
        await pkpMail.expectNone({
            to: fundingEmail,
            subject: NOTICE,
            afterControl: {to: editorEmail, subject: NOTICE},
        });

        // A second upload the same day: both files listed, and no second
        // notice. The notice goes out inside the upload's own request
        // (spec footnote l), so the listed file bounds the count.
        const authorModal2 = await openAuthorView(authorPage, tag, seeded.submissionId);
        await authorModal2.getByRole('button', {name: 'Upload revisions'}).click();
        await completeUploadWizard(authorPage, file2);
        await expect(
            primaryRegion(authorModal2).getByText(file2).first()
        ).toBeVisible({timeout: 15_000});
        await expect(primaryRegion(authorModal2).getByText(file1).first()).toBeVisible();
        expect(await pkpMail.count({to: editorEmail, subject: NOTICE})).toBe(1);

        // After the Editor signs in: a third upload sends a fresh notice
        // (the sign-in re-arms the same-day throttle; a cached session is
        // not a sign-in).
        await signInFresh(browser, baseURL, editor);
        const authorModal3 = await openAuthorView(authorPage, tag, seeded.submissionId);
        await authorModal3.getByRole('button', {name: 'Upload revisions'}).click();
        await completeUploadWizard(authorPage, file3);
        await expect(
            primaryRegion(authorModal3).getByText(file3).first()
        ).toBeVisible({timeout: 15_000});
        await expect
            .poll(() => pkpMail.count({to: editorEmail, subject: NOTICE}), {timeout: 20_000})
            .toBe(2);

        // Control: the Series Editor not assigned to the stage has no notice
        // (bounded by the assigned editor's, read the same way).
        await pkpMail.expectNone({
            to: otherEditorEmail,
            subject: NOTICE,
            afterControl: {to: editorEmail, subject: NOTICE},
        });
    });

    test('S5: request revisions toward a new round', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s5');
        const fileName = `rev-${tag}.txt`;
        const seeded = await seedInExternalReview(ompApi, tag);

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // The choice window, closed and reopened: tick the new-round option,
        // leave through "Close", press "Request Revisions" again on the same
        // page: the window shows the new-round option ticked (and the
        // preselected one no longer).
        let choice = await openRequestRevisionsChoice(page, modal);
        await expect(revisionsOption(choice, REVISIONS_OPTIONS.sameRound)).toBeChecked();
        await choice.getByText(REVISIONS_OPTIONS.newRound).click();
        await expect(revisionsOption(choice, REVISIONS_OPTIONS.newRound)).toBeChecked();
        await closeRequestRevisionsChoice(choice);
        choice = await openRequestRevisionsChoice(page, modal);
        await expect(revisionsOption(choice, REVISIONS_OPTIONS.newRound)).toBeChecked();
        await expect(revisionsOption(choice, REVISIONS_OPTIONS.sameRound)).not.toBeChecked();

        // Keep that choice: the wizard continues as "Resubmit for Review".
        await choice.getByRole('button', {name: 'Next'}).click();
        await expect(
            page.getByRole('heading', {level: 1, name: /Resubmit for Review/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(page);

        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal2, 1, STATUS.resubmitRequested);

        // The author's Tasks panel holds "Resubmit for review." for the
        // submission; then they upload one revised file.
        const authorPage = await (await asUser('author.alex')).newPage();
        await authorPage.goto(`/index.php/${PK}/en/dashboard/mySubmissions`);
        const tasks = await openTasksPanel(authorPage);
        await expect(
            tasks.getByRole('row').filter({hasText: `Submission ${tag}`}).filter({hasText: 'Resubmit for review.'})
        ).toHaveCount(1);
        await closeTopModal(authorPage);
        const authorModal = await openAuthorView(authorPage, PK, seeded.submissionId);
        await authorModal.getByRole('button', {name: 'Upload revisions'}).click();
        await completeUploadWizard(authorPage, fileName);
        await expect(
            primaryRegion(authorModal).getByText(fileName).first()
        ).toBeVisible({timeout: 15_000});

        // Editor view: a new round is now needed.
        const modal3 = await openEditorial(page, PK, seeded.submissionId);
        await expectRoundStatus(modal3, 1, STATUS.resubmitSubmitted);

        // Working path after the first upload (A1's register entry owns the
        // vanished bottom button): the Revisions Uploaded panel's own
        // "Upload" control still opens the upload wizard.
        await primaryRegion(authorModal)
            .getByRole('button', {name: 'Upload', exact: true})
            .first()
            .click();
        const wizard = topModal(authorPage);
        await expect(wizard.getByText(/^Upload .* File$/).first()).toBeVisible({
            timeout: 15_000,
        });
        await wizard.getByRole('link', {name: 'Cancel', exact: true}).click();
    });

    test('S6: a new round', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s6');
        const fileName = `rev-${tag}.txt`;
        const seeded = await seedInExternalReview(ompApi, tag, {
            extraDecisions: ['resubmit'],
        });

        // The author's revised file is what the new-round wizard will offer.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorModal = await openAuthorView(authorPage, PK, seeded.submissionId);
        await authorModal.getByRole('button', {name: 'Upload revisions'}).click();
        await completeUploadWizard(authorPage, fileName);

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await decisionButton(modal, DECISIONS.newRound).click();
        await expect(
            page.getByRole('heading', {level: 1, name: /New Review Round/})
        ).toBeVisible({timeout: 15_000});
        // Walk to the file step: the revised file arrives already ticked.
        for (let i = 0; i < 4; i++) {
            if (
                await page
                    .getByRole('heading', {name: 'Select Files', exact: true})
                    .count()
            ) {
                break;
            }
            await awaitComposerReady(page);
            await page.getByRole('button', {name: 'Continue', exact: true}).click();
            await page.waitForTimeout(400);
        }
        const fileCheckbox = page.getByRole('checkbox', {name: new RegExp(fileName)});
        await expect(fileCheckbox).toBeChecked();
        await page.getByRole('button', {name: /Record (Editorial )?Decision/}).click();
        await expect(page.getByText('View Submission Summary')).toBeVisible({
            timeout: 30_000,
        });

        // Round 2 opens selected, waiting, with the carried file.
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 2)'})
        ).toBeVisible();
        await expect(modal2.getByText('Review Round 2', {exact: true}).first()).toBeVisible();
        await expectRoundStatus(modal2, 2, STATUS.waiting);
        await expect(
            primaryRegion(modal2).getByText(fileName).first()
        ).toBeVisible();
        // Round 2 (current) offers the decision buttons — the control for
        // their absence on the past round below.
        await expect(decisionButton(modal2, DECISIONS.requestRevisions)).toBeVisible();

        // The past round shows its panels, no decision buttons, and the note.
        await modal2.getByText('Review Round 1', {exact: true}).first().click();
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect(modal2.getByText(STATUS.advancedToNextRound)).toBeVisible();
        await expect(
            primaryRegion(modal2).getByRole('heading', {name: 'Reviewers'})
        ).toBeVisible();
        await expect(decisionButton(modal2, DECISIONS.requestRevisions)).toHaveCount(0);
        await expect(decisionButton(modal2, DECISIONS.accept)).toHaveCount(0);
    });

    test('S7: cancel a round', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s7');
        const seeded = await seedInExternalReview(ompApi, tag, {
            reviewers: [],
            extraRounds: [
                {stage: 'external', reviewers: [{username: 'reviewer.paul', status: 'invited'}]},
            ],
        });

        // Control: the invited reviewer sees the assignment in their lists.
        const paulPage = await (await asUser('reviewer.paul')).newPage();
        await paulPage.goto(`/index.php/${PK}/en/dashboard/reviewAssignments`);
        await paulPage.getByText('All assignments', {exact: true}).first().click();
        await expect(paulPage.getByText(/Showing|No Items/).first()).toBeVisible({
            timeout: 20_000,
        });
        await expect(paulPage.getByText(`Submission ${tag}`).first()).toBeVisible();

        // Cancel Round 2 (its only reviewer has not accepted).
        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: External Review (Round 2)'})
        ).toBeVisible();
        await decisionButton(modal, DECISIONS.cancelRound).click();
        await expect(
            page.getByRole('heading', {level: 1, name: /Cancel Review Round/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(page);

        // Round 2 is gone; the submission stands on Round 1.
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect(modal2.getByText('Review Round 2', {exact: true})).toHaveCount(0);

        // The withdrawn invitation left the reviewer's lists entirely.
        await paulPage.goto(`/index.php/${PK}/en/dashboard/reviewAssignments`);
        await paulPage.getByText('All assignments', {exact: true}).first().click();
        await expect(paulPage.getByText(/Showing|No Items/).first()).toBeVisible({
            timeout: 20_000,
        });
        await expect(paulPage.getByText(`Submission ${tag}`)).toHaveCount(0);

        // Cancelling Round 1 returns the submission to the Submission stage.
        const tagB = `${tag}b`;
        const seededB = await seedInExternalReview(ompApi, tagB);
        const modalB = await openEditorial(page, PK, seededB.submissionId);
        await decisionButton(modalB, DECISIONS.cancelRound).click();
        await expect(
            page.getByRole('heading', {level: 1, name: /Cancel Review Round/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(page);
        const modalB2 = await openEditorial(page, PK, seededB.submissionId);
        await expect(
            modalB2.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible();
    });

    test('S8: cancelling is blocked once a review is in', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s8');
        const seeded = await seedInExternalReview(ompApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'accepted'}],
        });
        // A second submission whose only reviewer declined the request.
        const tagB = `${tag}b`;
        const seededB = await seedInExternalReview(ompApi, tagB, {
            reviewers: [{username: 'reviewer.paul', status: 'declined'}],
        });
        // A third whose round holds a declined reviewer beside an accepted one.
        const tagC = `${tag}c`;
        const seededC = await seedInExternalReview(ompApi, tagC, {
            reviewers: [
                {username: 'reviewer.paul', status: 'declined'},
                {username: 'reviewer.julia', status: 'accepted'},
            ],
        });

        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await completeReviewAsReviewer(
            juliaPage,
            PK,
            seeded.submissionId,
            `Review remarks ${tag}.`
        );

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        // Positive control: the other decision buttons render…
        await expect(decisionButton(modal, DECISIONS.requestRevisions)).toBeVisible();
        await expect(decisionButton(modal, DECISIONS.accept)).toBeVisible();
        await expect(decisionButton(modal, DECISIONS.newRound)).toBeVisible();
        await expect(decisionButton(modal, DECISIONS.decline)).toBeVisible();
        // …while Cancel Review Round is simply absent, and nothing stands in
        // its place: the actions region holds exactly those four.
        await expect(decisionButton(modal, DECISIONS.cancelRound)).toHaveCount(0);
        await expect(actionsRegion(modal).getByRole('button')).toHaveCount(4);

        // A declined reviewer: "Cancel Review Round" is absent equally.
        const modalB = await openEditorial(page, PK, seededB.submissionId);
        await expect(decisionButton(modalB, DECISIONS.requestRevisions)).toBeVisible();
        await expect(decisionButton(modalB, DECISIONS.accept)).toBeVisible();
        await expect(decisionButton(modalB, DECISIONS.newRound)).toBeVisible();
        await expect(decisionButton(modalB, DECISIONS.decline)).toBeVisible();
        await expect(decisionButton(modalB, DECISIONS.cancelRound)).toHaveCount(0);

        // A declined reviewer beside an accepted one: the box reads the
        // accepted reviewer's sentence (the declined one is not counted),
        // and "Cancel Review Round" is absent here too, the other four
        // buttons being the positive read of the same region.
        const modalC = await openEditorial(page, PK, seededC.submissionId);
        await expectRoundStatus(modalC, 1, STATUS.awaitingResponses);
        await expect(decisionButton(modalC, DECISIONS.requestRevisions)).toBeVisible();
        await expect(decisionButton(modalC, DECISIONS.accept)).toBeVisible();
        await expect(decisionButton(modalC, DECISIONS.newRound)).toBeVisible();
        await expect(decisionButton(modalC, DECISIONS.decline)).toBeVisible();
        await expect(decisionButton(modalC, DECISIONS.cancelRound)).toHaveCount(0);
        await expect(actionsRegion(modalC).getByRole('button')).toHaveCount(4);
    });

    test('S9: accept out of review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s9');
        const seeded = await seedInExternalReview(ompApi, tag);
        // A second submission that went through two rounds and was accepted
        // from Round 2 (the new round gets no reviewer).
        const tagB = `${tag}b`;
        const seededB = await seedInExternalReview(ompApi, tagB, {
            extraDecisions: ['newExternalReviewRound', 'accept'],
        });

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await decisionButton(modal, DECISIONS.accept).click();
        await expect(
            page.getByRole('heading', {level: 1, name: /Accept Submission/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(page);

        // The submission moved to Copyediting.
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: Copyediting'})
        ).toBeVisible();

        // Selecting the review stage still shows the round, its box now
        // reporting the submission's onward stage.
        await modal2.getByText('Review Round 1', {exact: true}).first().click();
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expectPlainStatus(modal2, STATUS.inCopyediting);
        // Control: the box is headed plain "Status", no longer "Round 1 Status".
        await expect(
            primaryRegion(modal2).getByRole('heading', {name: 'Round 1 Status', exact: true})
        ).toHaveCount(0);

        // A past round after acceptance: the second submission's Round 1
        // reads the advanced-and-accepted sentence with the press's
        // Copyediting stage name, headed plain "Status".
        const modalB = await openEditorial(page, PK, seededB.submissionId);
        await expect(
            modalB.getByRole('heading', {name: 'Workflow: Copyediting'})
        ).toBeVisible();
        await modalB.getByText('Review Round 1', {exact: true}).first().click();
        await expect(
            modalB.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expectPlainStatus(modalB, STATUS.advancedAndAccepted);
        await expect(primaryRegion(modalB).getByText(STATUS.inCopyediting, {exact: true})).toHaveCount(0);

        // Accepted without review: a third monograph accepted with "Accept
        // and Skip Review" from the Submission stage sits in Copyediting;
        // its "External Review" entry reads the not-initiated sentence.
        const tagC = `${tag}c`;
        const seededC = await seedMonograph(ompApi, tagC, {decisions: ['skipExternalReview']});
        const modalC = await openEditorial(page, PK, seededC.submissionId);
        await expect(
            modalC.getByRole('heading', {name: 'Workflow: Copyediting'})
        ).toBeVisible();
        await modalC.getByRole('navigation').getByRole('link', {name: 'External Review', exact: true}).click();
        await expect(
            modalC.getByRole('heading', {name: 'Workflow: External Review'})
        ).toBeVisible({timeout: 20_000});
        await expectPlainStatus(modalC, STATUS.externalNotInitiated);
        await expect(modalC.getByText('Review Round 1', {exact: true})).toHaveCount(0);
    });

    test('S10: decline, revert, delete', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s10');
        // One reviewer accepted the request and has not submitted a review;
        // the seeded press assigns sectioneditor.ana (Series editor of
        // `monographs`) and the deciding editors on submit.
        const seeded = await seedInExternalReview(ompApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'accepted'}],
        });

        // Control: before the decline, no "Delete" stands among the Press
        // Manager's buttons (the decision buttons being the positive read).
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const mayaModal = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expectRoundStatus(mayaModal, 1, STATUS.awaitingResponses);
        await expect(decisionButton(mayaModal, DECISIONS.requestRevisions)).toBeVisible();
        await expect(decisionButton(mayaModal, DECISIONS.decline)).toBeVisible();
        await expect(decisionButton(mayaModal, DECISIONS.delete)).toHaveCount(0);
        await expect(decisionButton(mayaModal, DECISIONS.revertDecline)).toHaveCount(0);

        // "Decline Submission": the Press Manager records it.
        await decisionButton(mayaModal, DECISIONS.decline).click();
        await expect(
            mayaPage.getByRole('heading', {level: 1, name: /Decline Submission/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(mayaPage);

        // The box reads "Submission declined."; the decision buttons are
        // replaced by "Revert Decline" and "Delete".
        const mayaModal2 = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expectRoundStatus(mayaModal2, 1, STATUS.declined);
        await expect(decisionButton(mayaModal2, DECISIONS.revertDecline)).toBeVisible();
        await expect(decisionButton(mayaModal2, DECISIONS.delete)).toBeVisible();
        await expect(decisionButton(mayaModal2, DECISIONS.requestRevisions)).toHaveCount(0);
        await expect(decisionButton(mayaModal2, DECISIONS.decline)).toHaveCount(0);

        // The Series Editor's screen: "Revert Decline" alone, no "Delete".
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const anaModal = await openEditorial(anaPage, PK, seeded.submissionId);
        await expectRoundStatus(anaModal, 1, STATUS.declined);
        await expect(decisionButton(anaModal, DECISIONS.revertDecline)).toBeVisible();
        await expect(decisionButton(anaModal, DECISIONS.delete)).toHaveCount(0);
        await expect(decisionButton(anaModal, DECISIONS.requestRevisions)).toHaveCount(0);

        // "Delete", cancelled: the Press Manager's "Delete" asks "Are you
        // sure you want to permanently delete this submission?" with
        // "Confirm" and "Cancel"; "Cancel" leaves the submission as it was.
        await decisionButton(mayaModal2, DECISIONS.delete).click();
        const deleteDialog = mayaPage
            .getByRole('dialog')
            .filter({hasText: 'Are you sure you want to permanently delete this submission?'});
        await expect(deleteDialog.getByRole('button', {name: 'Confirm', exact: true})).toBeVisible({timeout: 20_000});
        await expect(deleteDialog.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await deleteDialog.getByRole('button', {name: 'Cancel', exact: true}).click();
        await expect(deleteDialog).toHaveCount(0, {timeout: 20_000});
        const mayaModalKept = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expectRoundStatus(mayaModalKept, 1, STATUS.declined);
        await expect(decisionButton(mayaModalKept, DECISIONS.revertDecline)).toBeVisible();
        await expect(decisionButton(mayaModalKept, DECISIONS.delete)).toBeVisible();
        await expect(actionsRegion(mayaModalKept).getByRole('button')).toHaveCount(2);

        // "Revert Decline" puts the submission back in review, the box
        // again reading the round's reviewer sentence.
        await decisionButton(mayaModal2, DECISIONS.revertDecline).click();
        await expect(
            mayaPage.getByRole('heading', {level: 1, name: /Revert Decline/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(mayaPage);
        const mayaModal3 = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expectRoundStatus(mayaModal3, 1, STATUS.awaitingResponses);
        await expect(decisionButton(mayaModal3, DECISIONS.requestRevisions)).toBeVisible();
        await expect(decisionButton(mayaModal3, DECISIONS.revertDecline)).toHaveCount(0);
    });

    test('S11: recommend-only round', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s11');
        // A declined reviewer is record enough for the recommendation
        // sentences (Rule 6).
        const seeded = await seedInExternalReview(ompApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'declined'}],
        });

        // Assign a Series Editor limited to recommendations.
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const mayaModal = await openEditorial(mayaPage, PK, seeded.submissionId);
        await assignParticipant(mayaPage, mayaModal, {
            group: 'Series editor',
            query: 'ravi',
            resultName: 'Ravi Section Editor',
            recommendOnly: true,
        });
        // Control: before the recommendation, the deciding editor's screen
        // shows no "Recommendation" box (the status box is the positive read).
        await expectRoundStatus(mayaModal, 1, STATUS.awaitingRecommendations);
        await expect(
            secondaryRegion(mayaModal).getByRole('heading', {name: 'Recommendation'})
        ).toHaveCount(0);

        // The recommending editor sees recommendation controls, no decisions.
        const raviPage = await (await asUser('sectioneditor.ravi')).newPage();
        const raviModal = await openEditorial(raviPage, PK, seeded.submissionId);
        await expectRoundStatus(raviModal, 1, STATUS.awaitingRecommendations);
        await expect(
            actionsRegion(raviModal).getByRole('button', {name: 'Recommend Revisions'})
        ).toBeVisible();
        await expect(
            actionsRegion(raviModal).getByRole('button', {name: 'Recommend Accept'})
        ).toBeVisible();
        await expect(
            actionsRegion(raviModal).getByRole('button', {name: 'Recommend Decline'})
        ).toBeVisible();
        await expect(decisionButton(raviModal, DECISIONS.requestRevisions)).toHaveCount(0);
        await expect(decisionButton(raviModal, DECISIONS.accept)).toHaveCount(0);
        await expect(decisionButton(raviModal, DECISIONS.decline)).toHaveCount(0);

        // They record "Accept Submission" as a recommendation.
        await actionsRegion(raviModal).getByRole('button', {name: 'Recommend Accept'}).click();
        await expect(
            raviPage.getByRole('heading', {level: 1, name: /Recommend Accept/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(raviPage);

        // The deciding editor sees the Recommendation box and the closing
        // recommendation sentence.
        const mayaModal2 = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expectRoundStatus(mayaModal2, 1, STATUS.recommendationsIn);
        const recommendationBox = secondaryRegion(mayaModal2).filter({
            hasText: 'Recommendation',
        });
        await expect(
            secondaryRegion(mayaModal2).getByRole('heading', {name: 'Recommendation'})
        ).toBeVisible();
        await expect(recommendationBox.getByText('Accept Submission')).toBeVisible();

        // Sole recommending editor: on a scratch press a throwaway Series
        // Editor, limited the same way, is the only editorial participant
        // (a scratch press assigns no editor on submit, footnote s).
        const tagB = `${tag}b`;
        const manager = `mgr${tagB}`;
        const soleEditor = `se${tagB}`;
        await ompApi.createContext({
            tag: tagB,
            users: [
                {username: manager, roles: ['manager'], givenName: `Mgr${tagB}`, familyName: 'Manager'},
                {username: soleEditor, roles: ['sectionEditor'], givenName: `Se${tagB}`, familyName: 'Editor'},
                {username: `au${tagB}`, roles: ['author'], givenName: `Au${tagB}`, familyName: 'Author'},
            ],
        });
        const seededB = await ompApi.createSubmission({
            tag: tagB,
            context: tagB,
            submitter: `au${tagB}`,
            decisions: ['skipInternalReview'],
            reviewRounds: [{stage: 'external', reviewers: []}],
        });
        const mgrPage = await (await asUser(manager)).newPage();
        const mgrModal = await openEditorial(mgrPage, tagB, seededB.submissionId);
        await assignParticipant(mgrPage, mgrModal, {
            group: 'Series editor',
            query: `Se${tagB}`,
            resultName: `Se${tagB} Editor`,
            recommendOnly: true,
        });
        // No reviewer record: the round without a reviewer reads the
        // waiting sentence, not the recommendation one (Ravi's round above,
        // with its declined reviewer, is the positive read of that sentence).
        await expectRoundStatus(mgrModal, 1, STATUS.waiting);
        await expect(
            primaryRegion(mgrModal).getByText(STATUS.awaitingRecommendations, {exact: true})
        ).toHaveCount(0);
        const solePage = await (await asUser(soleEditor)).newPage();
        const soleModal = await openEditorial(solePage, tagB, seededB.submissionId);
        // No buttons of either kind (Ravi's recommendation buttons above are
        // the positive read of the same region)…
        await expect(soleModal.getByRole('heading', {name: 'Recommendation'})).toBeVisible();
        await expectRoundStatus(soleModal, 1, STATUS.waiting);
        await expect(
            primaryRegion(soleModal).getByText(STATUS.awaitingRecommendations, {exact: true})
        ).toHaveCount(0);
        await expect(
            actionsRegion(soleModal).getByRole('button', {name: /^Recommend /})
        ).toHaveCount(0);
        await expect(decisionButton(soleModal, DECISIONS.requestRevisions)).toHaveCount(0);
        await expect(decisionButton(soleModal, DECISIONS.accept)).toHaveCount(0);
        await expect(decisionButton(soleModal, DECISIONS.decline)).toHaveCount(0);
        await expect(actionsRegion(soleModal).getByRole('button')).toHaveCount(0);
        // …and the "Recommendation" box explains why.
        await expect(
            soleModal.getByText(
                'You can not make a recommendation until an editor is assigned with permission to record a decision.'
            )
        ).toBeVisible();

        // A recommendation on a round with no reviewer: a third monograph
        // set up as the first, its round with no reviewer. The Series
        // Editor's box reads the waiting sentence; once their recommendation
        // is recorded, the deciding editor's box reads the closing
        // recommendation sentence (a recorded recommendation outranks the
        // reviewer sentences).
        const tagC = `${tag}c`;
        const seededC = await seedInExternalReview(ompApi, tagC);
        const mayaModalC = await openEditorial(mayaPage, PK, seededC.submissionId);
        await assignParticipant(mayaPage, mayaModalC, {
            group: 'Series editor',
            query: 'ravi',
            resultName: 'Ravi Section Editor',
            recommendOnly: true,
        });
        const raviModalC = await openEditorial(raviPage, PK, seededC.submissionId);
        await expectRoundStatus(raviModalC, 1, STATUS.waiting);
        await actionsRegion(raviModalC).getByRole('button', {name: 'Recommend Accept'}).click();
        await expect(
            raviPage.getByRole('heading', {level: 1, name: /Recommend Accept/})
        ).toBeVisible({timeout: 15_000});
        await walkDecisionWizard(raviPage);
        const mayaModalC2 = await openEditorial(mayaPage, PK, seededC.submissionId);
        await expectRoundStatus(mayaModalC2, 1, STATUS.recommendationsIn);
        await expect(
            primaryRegion(mayaModalC2).getByText(STATUS.waiting, {exact: true})
        ).toHaveCount(0);
    });

    test('S12: author reads an open review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s12');
        const remark = 'Shared remarks for the author.';
        // Two submissions of author.alex: the first with an open review
        // accepted and not yet submitted (made open on screen below) and a
        // decision letter; the second with a completed anonymous review.
        const seeded = await seedInExternalReview(ompApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'accepted'}],
        });
        const tagB = `${tag}b`;
        const seededB = await seedInExternalReview(ompApi, tagB, {
            reviewers: [{username: 'reviewer.paul', status: 'completed'}],
        });
        // The Reviewers panel, by its table's name (the author's view lists
        // it only once a review they may read exists).
        const reviewersList = (modal) => modal.getByRole('table', {name: 'Reviewers', exact: true});

        // Make the review OPEN (per-assignment review type — the seeded
        // default is anonymous).
        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        const row = reviewerRow(modal, 'Julia Reviewer');
        await row.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const editModal = topModal(page);
        await expect(editModal.getByText('Review Type')).toBeVisible({timeout: 20_000});
        await editModal.getByLabel('Open', {exact: true}).check();
        await editModal.getByRole('button', {name: 'OK', exact: true}).click();
        await expect(row.getByText('Open', {exact: true})).toBeVisible({timeout: 20_000});

        // The decision letter for the "Notifications" list (Rule 16).
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await requestRevisions(page, modal2, {newRound: false});

        // Fresh in review: the second submission shows only the two
        // ever-present panels; no letters, no reviewers list (not even an
        // empty one), no "Upload revisions" (no revision request there).
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorModalB = await openAuthorView(authorPage, PK, seededB.submissionId);
        await expect(
            primaryRegion(authorModalB).getByRole('heading', {name: 'Round 1 Status'})
        ).toBeVisible();
        await expect(
            primaryRegion(authorModalB).getByRole('heading', {name: 'Revisions Uploaded'})
        ).toBeVisible();
        await expect(
            authorModalB.getByRole('heading', {name: 'Review Discussions', exact: true})
        ).toBeVisible();
        await expect(authorModalB.getByRole('heading', {name: 'Notifications'})).toHaveCount(0);
        await expect(reviewersList(authorModalB)).toHaveCount(0);
        await expect(authorModalB.getByRole('button', {name: 'Read Review'})).toHaveCount(0);
        await expect(authorModalB.getByText('Paul Reviewer')).toHaveCount(0);
        await expect(authorModalB.getByRole('button', {name: 'Upload revisions'})).toHaveCount(0);

        // An open review under way: the first submission lists no reviewer
        // yet, while its letter and its "Upload revisions" button (the
        // positive reads for the absences above) are there.
        const authorModalA = await openAuthorView(authorPage, PK, seeded.submissionId);
        await expect(authorModalA.getByRole('heading', {name: 'Notifications'})).toBeVisible();
        await expect(authorModalA.getByRole('button', {name: 'Upload revisions'})).toBeVisible();
        await expect(reviewersList(authorModalA)).toHaveCount(0);
        await expect(authorModalA.getByRole('button', {name: 'Read Review'})).toHaveCount(0);
        await expect(authorModalA.getByText('Julia Reviewer')).toHaveCount(0);

        // Reviewer: the open reviewer types the shared remark in "For author
        // and editor" and submits.
        const juliaPage = await (await asUser('reviewer.julia')).newPage();
        await completeReviewAsReviewer(juliaPage, PK, seeded.submissionId, remark);

        // Submitted, not confirmed: the author's review stage already lists
        // the reviewer with "Read Review", though no editor has opened the
        // review yet (the editor's first look comes below).
        const authorModal = await openAuthorView(authorPage, PK, seeded.submissionId);
        await expect(authorModal.getByRole('button', {name: 'Upload revisions'})).toBeVisible();
        const authorRow = reviewerRow(authorModal, 'Julia Reviewer');
        await expect(authorRow).toBeVisible({timeout: 15_000});
        await expect(authorRow.getByRole('button', {name: 'Read Review', exact: true})).toBeVisible();
        const rowBefore = (await authorRow.innerText()).replace(/\s+/g, ' ').trim();
        const frame = new DecisionWorkflow(authorPage, PK).frame;
        const headingsBefore = await frame.panelHeadingLabels();

        // "Read Review": the window titled "Review: {submission title}"
        // shows the reviewer's name and the completion date, then the shared
        // remark under "Reviewer Comments" › "For author and editor". No
        // recommendation-line claim (OMP2 ❓) and nothing about attachments
        // (A3 ❓).
        await authorRow.getByRole('button', {name: 'Read Review', exact: true}).click();
        const readModal = readReviewWindow(authorPage);
        await expect(readModal.getByRole('heading', {name: `Review: Submission ${tag}`, exact: true})).toBeVisible({
            timeout: 30_000,
        });
        await expect(readModal.getByRole('heading', {name: 'Julia Reviewer', exact: true})).toBeVisible();
        await expect(readModal).toContainText(/Completed:\s*\d{4}-\d{2}-\d{2}/);
        await expect(readModal).toContainText(
            new RegExp(`Reviewer Comments\\s*For author and editor\\s*${remark.replace('.', '\\.')}`)
        );
        await readModal.getByRole('button', {name: 'Close', exact: true}).first().click();
        await expect(readModal).toHaveCount(0, {timeout: 30_000});

        // The editor confirms it: "Read Review" › "Confirm".
        const modal3 = await openEditorial(page, PK, seeded.submissionId);
        await confirmReviewAsEditor(page, modal3, 'Julia Reviewer');

        // Author: the review stage lists the reviewer with "Read Review"
        // exactly as before, and no panel was added (no panel for a response
        // to the reviews): the stage's headings are the same list.
        const authorModal2 = await openAuthorView(authorPage, PK, seeded.submissionId);
        await expect(authorRow.getByRole('button', {name: 'Read Review', exact: true})).toBeVisible({timeout: 15_000});
        await expect(authorRow).toHaveText(rowBefore, {useInnerText: true});
        await expect(authorModal2.getByRole('button', {name: 'Read Review', exact: true})).toHaveCount(1);
        await expect.poll(() => frame.panelHeadingLabels(), {timeout: 30_000}).toEqual(headingsBefore);

        // "Notifications": the decision letter as a subject line and a date;
        // it opens read-only in a side panel, the dialog named
        // "Notifications" with the subject as its heading.
        const notificationsHeading = authorModal2.getByRole('heading', {name: 'Notifications', exact: true});
        await expect(notificationsHeading).toBeVisible();
        const letterItem = authorPage
            .locator('div')
            .filter({has: authorPage.getByRole('heading', {name: 'Notifications', exact: true})})
            .last()
            .getByRole('listitem')
            .first();
        await expect(letterItem).toContainText(/\d{4}-\d{2}-\d{2}/);
        const letterLink = letterItem.locator('a').first();
        const letterSubject = (await letterLink.textContent())?.trim();
        expect(letterSubject).toBeTruthy();
        await letterLink.click();
        const letterModal = authorPage.getByRole('dialog', {name: 'Notifications', exact: true});
        await expect(letterModal.getByRole('heading', {name: letterSubject || '', exact: true})).toBeVisible({
            timeout: 30_000,
        });
        await expect(letterModal.getByRole('textbox')).toHaveCount(0);
        await letterModal.getByRole('button', {name: 'Close', exact: true}).click();
        await expect(letterModal).toBeHidden({timeout: 30_000});

        // Old addresses: the author-dashboard address lands on My
        // Submissions with the workflow open…
        await authorPage.goto(oldAuthorDashboardUrl(PK, seeded.submissionId));
        await expect(authorPage).toHaveURL(
            new RegExp(`/dashboard/mySubmissions\\?.*workflowSubmissionId=${seeded.submissionId}`)
        );
        await expect(
            workflowModal(authorPage).getByRole('heading', {name: /^Workflow:/}).first()
        ).toBeVisible({timeout: 20_000});
        // …and the old per-round address answers a bare "404 Not Found"
        // page, with and without an id.
        for (const url of [
            oldReviewRoundInfoUrl(PK, seeded.submissionId),
            oldReviewRoundInfoUrl(PK),
        ]) {
            const response = await authorPage.goto(url);
            expect(response?.status()).toBe(404);
            await expect(authorPage.getByText('404 Not Found')).toBeVisible();
            await expect(authorPage.getByRole('heading', {name: /^Workflow:/})).toHaveCount(0);
        }

        // Control: the second submission, its anonymous review completed,
        // still shows no reviewers list at all (the first's list above is
        // the positive read).
        const authorModalB2 = await openAuthorView(authorPage, PK, seededB.submissionId);
        await expect(
            primaryRegion(authorModalB2).getByRole('heading', {name: 'Revisions Uploaded'})
        ).toBeVisible();
        await expect(reviewersList(authorModalB2)).toHaveCount(0);
        await expect(authorModalB2.getByRole('button', {name: 'Read Review'})).toHaveCount(0);
        await expect(authorModalB2.getByText('Paul Reviewer')).toHaveCount(0);
    });

    test('S13: straight to External Review (skip-internal entry)', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s13');
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('manager.maya')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        // The Submission stage offers both review entries; External skips
        // the internal stage.
        await expect(decisionButton(modal, 'Send to Internal Review')).toBeVisible();
        await expect(decisionButton(modal, 'Send to External Review')).toBeVisible();
        await decisionButton(modal, 'Send to External Review').click();
        await expect(
            page.getByRole('heading', {name: /Send to External Review: Notify Authors/})
        ).toBeVisible({timeout: 15_000});
        await awaitComposerReady(page);
        await page.getByRole('button', {name: 'Continue', exact: true}).click();
        await expect(
            page.getByRole('heading', {name: 'Select Files', exact: true})
        ).toBeVisible({timeout: 15_000});
        await page.getByRole('button', {name: /Record (Editorial )?Decision/}).click();
        await expect(page.getByText('View Submission Summary')).toBeVisible({
            timeout: 30_000,
        });

        // The workflow menu shows "External Review" with "Review Round 1"
        // alone under it, selected; the page title reads "External Review
        // (Round 1)" and the box "Round 1 Status — Waiting for reviewers to
        // be assigned.".
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        const frame = new DecisionWorkflow(page, PK, {appContext: {capabilities: {hasInternalReview: true}}}).frame;
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await frame.expectSelected('Review Round 1');
        await expect.poll(() => frame.roundLabels(), {timeout: 30_000}).toEqual(['Review Round 1']);
        await expectRoundStatus(modal2, 1, STATUS.waiting);
        await expect(roundStatusBox(modal2, 1)).toHaveText(`Round 1 Status ${STATUS.waiting}`);

        // The menu also carries the separate "Internal Review" stage entry.
        await expect.poll(() => frame.stageLabels(), {timeout: 30_000}).toContain('Internal Review');
        await expect(frame.stageLink('Internal Review')).toBeVisible();

        // Control: the External Review screen is scenario 1's, nothing added
        // by the press's extra stage: the same panels and status box, and
        // the five decision buttons of a round with no reviewer.
        await frame.expectPanelHeadings(EXTERNAL_ROUND_HEADINGS);
        await expect
            .poll(() => frame.actionButtonLabels(), {timeout: 30_000})
            .toEqual([
                DECISIONS.requestRevisions,
                DECISIONS.accept,
                DECISIONS.newRound,
                DECISIONS.cancelRound,
                DECISIONS.decline,
            ]);
    });

    test('S15: a minimum of confirmed reviews', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u26s15');
        const editor = `ed${tag}`;
        const author = `au${tag}`;
        const reviewer = `rv${tag}`;
        const reviewerName = `Rev${tag} Reviewer`;
        const MINIMUM = minimumLine(2);

        // Scratch press with "Minimum Confirmed Reviews Required" at 2
        // through the context's `review` passthrough key; a throwaway
        // Press Editor, Author and External Reviewer. The editor is assigned
        // to the stage in the seed (a scratch press assigns no editor on
        // submit, footnote s); the reviewer accepted and has not submitted.
        await ompApi.createContext({
            tag,
            review: {numReviewsPerSubmission: 2},
            users: [
                {username: editor, roles: ['editor'], givenName: `Ed${tag}`, familyName: 'Editor'},
                {username: author, roles: ['author'], givenName: `Au${tag}`, familyName: 'Author'},
                {username: reviewer, roles: ['externalReviewer'], givenName: `Rev${tag}`, familyName: 'Reviewer'},
            ],
        });
        const seeded = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            decisions: ['skipInternalReview'],
            reviewRounds: [{stage: 'external', reviewers: [{username: reviewer, status: 'accepted'}]}],
            participants: [{username: editor, role: 'editor'}],
        });

        // The review underway: the minimum line, with the reviewer sentence
        // beneath it.
        const page = await (await asUser(editor)).newPage();
        let modal = await openEditorial(page, tag, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.awaitingResponses);
        await expect(roundStatusBox(modal, 1)).toHaveText(
            `Round 1 Status ${MINIMUM} ${STATUS.awaitingResponses}`
        );

        // The review submitted: the minimum line, with "New reviews have
        // been submitted." beneath it.
        const reviewerPage = await (await asUser(reviewer)).newPage();
        await completeReviewAsReviewer(reviewerPage, tag, seeded.submissionId, `Review remarks ${tag}.`);
        modal = await openEditorial(page, tag, seeded.submissionId);
        await expectRoundStatus(modal, 1, STATUS.newReviews);
        await expect(roundStatusBox(modal, 1)).toHaveText(
            `Round 1 Status ${MINIMUM} ${STATUS.newReviews}`
        );

        // "Read Review" → "Confirm": the box reads the minimum line
        // alone; "All reviews are confirmed and a decision is needed." does
        // not appear (nor the minimum's own "confirmed" sentence: one of two).
        await confirmReviewAsEditor(page, modal, reviewerName);
        modal = await openEditorial(page, tag, seeded.submissionId);
        await expect(roundStatusBox(modal, 1).getByText(MINIMUM, {exact: true})).toBeVisible();
        await expect(roundStatusBox(modal, 1).getByText(STATUS.reviewsConfirmed, {exact: true})).toHaveCount(0);
        await expect(roundStatusBox(modal, 1).getByText(STATUS.minimumConfirmed, {exact: true})).toHaveCount(0);
        await expect(roundStatusBox(modal, 1)).toHaveText(`Round 1 Status ${MINIMUM}`);

        // Control: on the seeded press (minimum 0) a confirmed review reads
        // "All reviews are confirmed and a decision is needed." with no
        // minimum line (S2's end state, reached the same way).
        const tagB = `${tag}b`;
        const seededB = await seedInExternalReview(ompApi, tagB, {
            reviewers: [{username: 'reviewer.paul', status: 'completed'}],
        });
        const mayaPage = await (await asUser('manager.maya')).newPage();
        let mayaModal = await openEditorial(mayaPage, PK, seededB.submissionId);
        await expectRoundStatus(mayaModal, 1, STATUS.newReviews);
        await confirmReviewAsEditor(mayaPage, mayaModal, 'Paul Reviewer');
        mayaModal = await openEditorial(mayaPage, PK, seededB.submissionId);
        await expectRoundStatus(mayaModal, 1, STATUS.reviewsConfirmed);
        await expect(
            roundStatusBox(mayaModal, 1).getByText(/Minimum number of confirmed reviews required/)
        ).toHaveCount(0);
        await expect(roundStatusBox(mayaModal, 1)).toHaveText(
            `Round 1 Status ${STATUS.reviewsConfirmed}`
        );
    });
});
