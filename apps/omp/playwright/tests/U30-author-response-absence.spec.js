// @ts-check
/**
 * @file playwright/tests/U30-author-response-absence.spec.js
 *
 * U30 — Author response to reviews
 * (docs/specs/U30-author-response-to-reviews.md): the OMP ABSENCE test, the
 * press part of spec scenario 7 {OMP OPS}. A press installs the same code
 * but shows none of it on the workflow screen (spec Purpose, an install
 * fact): neither the editor's "Author Response" table nor the author's
 * "Author Response" card appears on the External Review stage, while the
 * "Request Author Response" page still opens by its Rule 14 address. Per
 * RUNBOOK multi-app rule 3 the whole feature costs this ONE absence test on
 * the press, with a positive control per assertion (PRINCIPLES M4, M6).
 *
 * Deliberately NOT covered here (and why):
 * - Scenarios 1–6 (the table, the request page reached from "Request
 *   Response", the email's reviewer blocks, the author's window, editing
 *   and deleting, the minimum, who may request): OJS-only screens; the OJS
 *   suite covers them.
 * - The preprint-server part of scenario 7: the OPS suite's.
 * - The Internal Review stage: the same absence, under "Nothing new to test" (spec Coverage,
 *   read once 2026-09-06).
 * - Sending the request from the typed page (its A4 dead end) and the
 *   request email's own button: the scenario's control only reads the page.
 * - Register OMP1 (🐞: the decision email offers a response with nowhere to
 *   go): the verdict is not frozen. The test presses the email's button
 *   because scenario 7 prescribes it, and asserts only the install fact the
 *   Purpose states — the workflow screen shows no card and no window.
 *
 * Seeding: the seeded press, `author.alex` as submitter, `reviewer.julia`'s
 * review seeded `completed` on External Review round 1. The Request
 * Revisions decision is recorded by `editor.diana` through the wizard
 * (spec footnote s): a seeded decision sends no email, and the scenario
 * reads the decision email. Mailpit is scoped by the author's address plus
 * the seeded title (PRINCIPLES A8). `publicknowledge` and the roster are
 * not changed.
 */
const {test, expect} = require('../support/fixtures.js');
const {getEmail} = require('../../../../shared/playwright/data/users.js');
const {
    STATUS,
    openEditorial,
    workflowModal,
    expectRoundStatus,
    requestRevisions,
} = require('../pages/ReviewStagePages.js');

const PK = 'publicknowledge';
const EDITOR = 'editor.diana';
const AUTHOR = 'author.alex';
const AUTHOR_NAME = 'Alex Author';
const DECISION_SUBJECT = 'Your submission has been reviewed and we encourage you to submit revisions';

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** The seeded title carries the tag, so the decision email is found by it. */
function titleFor(tag) {
    return `Monograph ${tag}`;
}

/** The Rule 14 address of a round's "Request Author Response" page (no `ret`). */
function requestPageUrl(contextPath, submissionId, roundId) {
    return `/index.php/${contextPath}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${roundId}&submissionId=${submissionId}`;
}

/**
 * Nothing of the feature on a review stage: no "Author Response" table or
 * card, none of its buttons. Every read is bounded by the caller having
 * already seen the stage's own panels render (M4).
 */
async function expectNoAuthorResponse(modal) {
    await expect(modal.getByRole('table', {name: 'Author Response'})).toHaveCount(0);
    await expect(modal.getByRole('heading', {name: 'Author Response', exact: true})).toHaveCount(0);
    await expect(modal.getByRole('button', {name: 'Request Response', exact: true})).toHaveCount(0);
    await expect(modal.getByRole('button', {name: 'Submit Response', exact: true})).toHaveCount(0);
    await expect(modal.getByRole('button', {name: 'View Submitted Response', exact: true})).toHaveCount(0);
}

test.describe('Author response to reviews (U30) — OMP absence', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S7 {OMP}: no "Author Response" on a press, the request page still opens by address', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u30s7');
        const title = titleFor(tag);

        // A monograph in External Review round 1 with its one review in.
        const seeded = await ompApi.createSubmission({
            tag,
            context: PK,
            submitter: AUTHOR,
            series: 'monographs',
            title,
            decisions: ['sendExternalReview'],
            reviewRounds: [
                {
                    stage: 'external',
                    reviewers: [{username: 'reviewer.julia', status: 'completed', comments: `Review ${tag}`}],
                },
            ],
        });
        const round = seeded.reviewRounds[0];
        expect(round.stageId).toBe(3);

        // Press Editor: the External Review stage with the review in. Control:
        // the stage's own panels render — the Reviewers table with Julia's
        // "Review Submitted" row, the round status box, the discussions panel
        // that ends the stage.
        const editorPage = await (await asUser(EDITOR)).newPage();
        let modal = await openEditorial(editorPage, PK, seeded.submissionId);
        await expect(modal.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})).toBeVisible();
        await expectRoundStatus(modal, 1, STATUS.newReviews);
        const reviewers = modal.getByRole('table', {name: 'Reviewers'});
        await expect(reviewers).toBeVisible();
        await expect(reviewers.getByRole('row').filter({hasText: 'Julia Reviewer'})).toContainText('Review Submitted');
        await expect(modal.getByRole('heading', {name: 'Review Tasks & Discussions'})).toBeVisible();
        // No "Author Response" table follows the Reviewers panel.
        await expectNoAuthorResponse(modal);

        // Revisions requested through the wizard: the decision email goes out.
        await requestRevisions(editorPage, modal);

        // The stage again, now reading "Revisions have been requested.":
        // still no table (the absence holds whatever the round's state).
        modal = await openEditorial(editorPage, PK, seeded.submissionId);
        await expect(modal.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})).toBeVisible();
        await expectRoundStatus(modal, 1, STATUS.revisionsRequested);
        // (The wizard's "Notify Reviewers" step thanked Julia, so her row now
        // reads "Reviewer Thanked"; the row's presence is the bound here.)
        await expect(reviewers.getByRole('row').filter({hasText: 'Julia Reviewer'})).toBeVisible();
        await expect(modal.getByRole('heading', {name: 'Review Tasks & Discussions'})).toBeVisible();
        await expectNoAuthorResponse(modal);

        // Press Author: the decision email carries "Submit Author Response".
        const mail = await pkpMail.find({to: getEmail(AUTHOR), subject: DECISION_SUBJECT, contains: title});
        const href = pkpMail.extractLink((await pkpMail.fullMessage(mail.ID)).HTML, 'Submit Author Response');
        expect(href).toBeTruthy();
        expect(href).toContain('/dashboard/mySubmissions?');
        expect(href).toContain(`workflowSubmissionId=${seeded.submissionId}`);
        expect(href).toContain(`workflowMenuKey=workflow_3_${round.id}`);
        expect(href).toContain('reviewResponseAction=respond');

        // Pressing it opens the monograph's External Review stage reading
        // "Revisions have been requested." — with no "Author Response" card
        // and no window (register OMP1, as the scenario prescribes). Controls:
        // the author's own panels render, the "Notifications" list has filled
        // with the decision email's row, and the one dialog open is the
        // workflow screen itself.
        const authorPage = await (await asUser(AUTHOR)).newPage();
        await authorPage.goto(href);
        const authorModal = workflowModal(authorPage);
        await expect(authorModal.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})).toBeVisible({timeout: 20_000});
        await expectRoundStatus(authorModal, 1, STATUS.revisionsRequested);
        await expect(authorModal.getByRole('heading', {name: 'Notifications', exact: true})).toBeVisible();
        await expect(authorModal.getByRole('listitem').filter({hasText: DECISION_SUBJECT})).toBeVisible();
        await expect(authorModal.getByRole('heading', {name: 'Revisions Uploaded', exact: true})).toBeVisible();
        await expect(authorModal.getByRole('table', {name: 'Revisions Uploaded'})).toBeVisible();
        await expect(authorModal.getByRole('heading', {name: 'Review Tasks & Discussions'})).toBeVisible();
        await expectNoAuthorResponse(authorModal);
        await expect(authorPage.getByText('Submit Your Response to Reviewer Feedback')).toHaveCount(0);
        await expect(authorPage.locator('[role="dialog"]:visible')).toHaveCount(1);

        // Control: the Press Editor typing the round's address (Rule 14) gets
        // the "Request Author Response" page with the press Author in "To"
        // (reached this way it has nowhere to return to, A4; nothing is sent).
        await editorPage.goto(requestPageUrl(PK, seeded.submissionId, round.id));
        await expect(editorPage.getByRole('heading', {level: 1, name: 'Request Author Response'})).toBeVisible({timeout: 20_000});
        // The template arrives after the page's own request: the Subject
        // holding its value is the settled read.
        await expect(editorPage.getByRole('textbox', {name: 'Subject'})).toHaveValue(
            'Request For Author Response To Reviewer Feedback',
            {timeout: 20_000}
        );
        await expect(editorPage.getByText('To', {exact: true}).first()).toBeVisible();
        await expect(editorPage.getByText(AUTHOR_NAME, {exact: true})).toBeVisible();
        await expect(editorPage.getByRole('button', {name: 'Submit Request', exact: true})).toBeVisible();
        await expect(editorPage.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
    });
});
