// @ts-check
/**
 * @file playwright/tests/U30-author-response-absence.spec.js
 *
 * U30 — Author response to reviews
 * (docs/specs/U30-author-response-to-reviews.md): the OPS ABSENCE test, the
 * preprint-server part of spec scenario 7 {OMP OPS}. A preprint server has
 * no review stage, so no round exists to respond to (spec Purpose, an
 * install fact): a preprint's Production stage shows no "Author Response"
 * table, and the request page's Rule 14 address shows the access-denied
 * page, "A workflow stage was not specified." for the Preprint Server
 * Manager and a Moderator, "The current role does not have access to this
 * operation." for the Author (spec footnote a). Per RUNBOOK multi-app rule
 * 3 the whole feature costs this ONE absence test on the preprint server,
 * with a positive control per assertion (PRINCIPLES M4, M6).
 *
 * Deliberately NOT covered here (and why):
 * - Scenarios 1–6 (the table, the request page reached from "Request
 *   Response", the email's reviewer blocks, the author's window, editing
 *   and deleting, the minimum, who may request): OJS-only screens; the OJS
 *   suite covers them.
 * - The press part of scenario 7 (the External Review stage, the decision
 *   email's button, the typed page's control): the OMP suite's.
 * - The stage-5 variant of the typed address ("Invalid review round.",
 *   footnote a): the scenario types stage 3 only.
 * - Register OMP1 (🐞): a press surface; nothing to assert or park on OPS.
 *
 * Seeding: the seeded preprint server `publicknowledge`, one submitted
 * preprint by `author.alex` (spec footnote s: on OPS the scenario API
 * refuses `reviewRounds`). A seeded preprint lands on Production; the
 * section's Moderators (`sectioneditor.ana` among them) are assigned by the
 * real submit path. `manager.maya` is the Preprint Server Manager. No
 * setting and no roster account is changed.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');

const SERVER = 'publicknowledge';
const MANAGER = 'manager.maya';
const MODERATOR = 'sectioneditor.ana';
const AUTHOR = 'author.alex';

/** The access-denied page (the app redirects there; HTTP 200 at the end). */
const DENIED_PATH = /user\/authorizationDenied/;
const STAGE_REQUIRED = {
    url: /user\/authorizationDenied\?message=user\.authorization\.workflowStageRequired/,
    text: 'A workflow stage was not specified.',
};
const ROLE_DENIED = {
    url: /user\/authorizationDenied\?message=user\.authorization\.roleBasedAccessDenied/,
    text: 'The current role does not have access to this operation.',
};

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}opsw${testInfo.parallelIndex}${rand}`;
}

/** The Rule 14 address typed with the scenario's stage 3, round 1 (no `ret`). */
function requestPageUrl(submissionId) {
    return `/index.php/${SERVER}/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=1&submissionId=${submissionId}`;
}

function workflowFor(page, appContext) {
    return new WorkflowPage(page, SERVER, {appContext, labels: {publicationGroup: 'Preprint'}});
}

/**
 * Nothing of the feature on the workflow screen: no "Author Response"
 * table, heading or card, none of its buttons. Every read is bounded by
 * the caller having already seen the stage's own panels render (M4).
 */
async function expectNoAuthorResponse(dialog) {
    await expect(dialog.getByRole('table', {name: 'Author Response'})).toHaveCount(0);
    await expect(dialog.getByRole('heading', {name: 'Author Response', exact: true})).toHaveCount(0);
    await expect(dialog.getByRole('button', {name: 'Request Response', exact: true})).toHaveCount(0);
    await expect(dialog.getByRole('button', {name: 'Submit Response', exact: true})).toHaveCount(0);
    await expect(dialog.getByRole('button', {name: 'View Submitted Response', exact: true})).toHaveCount(0);
}

/**
 * The typed Rule 14 address shows the access-denied page with the given
 * sentence, and nothing of the "Request Author Response" page. The
 * sentence's own visibility bounds the absence reads; the caller has just
 * proved the session live on the preprint's workflow screen.
 */
async function expectDeniedRequestPage(page, submissionId, {url, text}) {
    await page.goto(requestPageUrl(submissionId));
    await page.waitForURL(DENIED_PATH, {waitUntil: 'commit'});
    await expect(page).toHaveURL(url);
    await expect(page.getByText(text, {exact: true})).toBeVisible();
    await expect(page.getByRole('heading', {name: 'Request Author Response'})).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Submit Request', exact: true})).toHaveCount(0);
    await expect(page.getByRole('textbox', {name: 'Subject'})).toHaveCount(0);
}

test.describe('Author response to reviews (U30) — OPS absence', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(180_000));

    test('scenario 7 {OPS}: no "Author Response" on a preprint, the request page address is denied', async ({opsApi, asUser, appContext}, testInfo) => {
        const tag = makeTag(testInfo, 'u30s7');

        // A submitted preprint: it lands on Production (stage 5) with no
        // review round at all.
        const seeded = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: AUTHOR,
            title: `Preprint ${tag}`,
        });
        expect(seeded.stageId).toBe(5);
        expect(seeded.reviewRounds).toEqual([]);

        // Preprint Server Manager: the preprint's Production stage. Controls:
        // the stage's own controls render — the bubble and heading, the
        // posting and declining actions, the stage's discussions panel — and
        // the Workflow group lists Production alone.
        const managerPage = await (await asUser(MANAGER)).newPage();
        const manager = workflowFor(managerPage, appContext);
        await manager.gotoEditorial(seeded.submissionId);
        await manager.expectStage('Production');
        await manager.expectStageHeading('Production');
        await expect(manager.actionButton('Post the preprint')).toBeVisible();
        await expect(manager.actionButton('Decline Submission')).toBeVisible();
        await expect(manager.dialog().getByRole('heading', {name: 'Production Tasks & Discussions'})).toBeVisible();
        expect(await manager.stageLabels()).toEqual(['Production']);
        // No review entry of any kind in the menu (no round exists)…
        await expect(manager.menu().getByRole('link', {name: /review/i})).toHaveCount(0);
        // …and no "Author Response" table on the stage.
        await expectNoAuthorResponse(manager.dialog());

        // The Rule 14 address (stage 3, round 1): "A workflow stage was not
        // specified."
        await expectDeniedRequestPage(managerPage, seeded.submissionId, STAGE_REQUIRED);

        // Moderator: the same Production stage (assigned by the submit path;
        // the same controls), no table; the same address shows the same page.
        const moderatorPage = await (await asUser(MODERATOR)).newPage();
        const moderator = workflowFor(moderatorPage, appContext);
        await moderator.gotoEditorial(seeded.submissionId);
        await moderator.expectStage('Production');
        await moderator.expectStageHeading('Production');
        await expect(moderator.actionButton('Post the preprint')).toBeVisible();
        await expect(moderator.dialog().getByRole('heading', {name: 'Production Tasks & Discussions'})).toBeVisible();
        await expectNoAuthorResponse(moderator.dialog());
        await expectDeniedRequestPage(moderatorPage, seeded.submissionId, STAGE_REQUIRED);

        // Preprint Author: the preprint's own view opens on Production (the
        // session is live: the bubble and the header's "Library" button), with
        // no "Author Response" card; the same address shows "The current role
        // does not have access to this operation.".
        const authorPage = await (await asUser(AUTHOR)).newPage();
        const author = workflowFor(authorPage, appContext);
        await author.gotoAuthor(seeded.submissionId);
        await author.expectStage('Production');
        await expect(author.headerButton('Library')).toBeVisible();
        await expectNoAuthorResponse(author.dialog());
        await expect(authorPage.getByText('Submit Your Response to Reviewer Feedback')).toHaveCount(0);
        await expectDeniedRequestPage(authorPage, seeded.submissionId, ROLE_DENIED);
    });
});
