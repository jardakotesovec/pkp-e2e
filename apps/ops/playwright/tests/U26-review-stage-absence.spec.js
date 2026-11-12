// @ts-check
/**
 * @file playwright/tests/U26-review-stage-absence.spec.js
 *
 * Review stage & rounds — OPS suite, spec scenario 14 only. OPS installs no
 * review stage: a preprint server's workflow goes straight from submission
 * to Production (spec footnote p, an install fact), so scenarios 1–13 and
 * 15 carry badges that exclude a preprint server and the whole feature
 * costs this ONE test: the Preprint Server Manager's workflow with a
 * positive control per absence, and the preprint's Author typing the two
 * old author-dashboard addresses (Rule 17). Spec:
 * docs/specs/U26-review-stage-and-rounds.md; its Coverage section is the
 * record of everything else left out.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 🐞, A9 🐞, A10 🐞, A13 🐞, A14 🐞.
 * - A2 ❓, A3 ❓, A4 ❓, A5 ❓, A6 ❓, A7 ❓, A8 ❓, A11 ❓, OMP2 ❓, OMP3 ❓.
 * - OMP1 ✅.
 *
 * Seeding: a scratch preprint server with a throwaway Preprint Server
 * Manager and Author, and one submitted preprint via the scenario endpoints
 * (on OPS it lands directly on the Production stage). `publicknowledge` and
 * the seeded roster are not touched. No hard-coded waits; runs in the
 * parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

test.describe('review stage & rounds (U26) — OPS absence', () => {
    test('S14 {OPS}: no review stage on a preprint server', async ({asUser, pkpApi}) => {
        const tag = makeTag('u26s14');
        const manager = `m${tag}`;
        const author = `a${tag}`;

        // Scratch preprint server with a throwaway Preprint Server Manager and
        // Author; one seeded (submitted, unposted) preprint — on OPS it lands
        // directly on the Production stage.
        await pkpApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: author, roles: ['author']},
            ],
        });
        const seeded = await pkpApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
        });

        // Preprint Server Manager opens the preprint's workflow.
        const page = await (await asUser(manager)).newPage();
        await page.goto(
            `/index.php/${tag}/dashboard/editorial?workflowSubmissionId=${seeded.submissionId}`
        );

        const workflow = page.locator('[data-cy="active-modal"]');
        // Arrival: the workflow dialog opened, already on the Production stage
        // (the side-modal wrapper reports visibility:hidden — anchor on inner
        // content, patterns.md pitfall 5).
        await expect(
            workflow.getByRole('heading', {name: /Workflow: Production/})
        ).toBeVisible();

        // Positive control (the workflow screen demonstrably works): the
        // Production stage's own controls render — the posting and declining
        // actions, and the stage's Discussions panel.
        const actionArea = workflow.locator('[data-cy="workflow-action-items"]');
        await expect(
            actionArea.getByRole('button', {name: 'Post the preprint'})
        ).toBeVisible();
        await expect(
            actionArea.getByRole('button', {name: 'Decline Submission'})
        ).toBeVisible();
        await expect(
            workflow.locator('[data-cy="workflow-primary-items"] [data-cy="discussion-manager"]')
        ).toBeVisible();

        // The stage menu offers Production (control, taken the same way)…
        const stageMenu = workflow.locator('nav');
        await expect(stageMenu.getByText('Production', {exact: true})).toBeVisible();
        // …and no Review entry of any kind — no "Review", "Review Round N",
        // internal/external variant, anything. Bounded by the same menu having
        // just rendered its Production entry.
        await expect(stageMenu.getByText(/review/i)).toHaveCount(0);

        // No round, reviewer or review-file surface exists anywhere on the
        // screen (bounded by the dialog's rendered controls above): no round
        // status box, no review panels, no reviewers list.
        await expect(workflow.getByText(/Review Round/)).toHaveCount(0);
        await expect(workflow.getByText(/Round \d+ Status/)).toHaveCount(0);
        await expect(workflow.getByText('Files for Review')).toHaveCount(0);
        await expect(workflow.getByText('Revisions Uploaded')).toHaveCount(0);
        await expect(workflow.getByText('Reviewers', {exact: true})).toHaveCount(0);

        // Old addresses, the preprint's Author (Rule 17): the old
        // author-dashboard link lands on My Submissions with that
        // preprint's workflow open…
        const authorPage = await (await asUser(author)).newPage();
        const authorWorkflow = new WorkflowPage(authorPage, tag);
        await authorWorkflow.gotoForwarding(
            authorWorkflow.authorDashboardUrl(seeded.submissionId),
            seeded.submissionId
        );
        await expect(authorPage).toHaveURL(/\/dashboard\/mySubmissions\?/);
        expect(authorWorkflow.submissionIdFromUrl()).toBe(String(seeded.submissionId));
        await expect(authorWorkflow.dialog()).toContainText(`Submission ${tag}`);

        // …and the old per-round address answers a bare "404 Not Found"
        // page, with the preprint's id and without one: the heading is the
        // page's only text (positive control: the heading itself), and no
        // workflow opens.
        for (const suffix of [`/${seeded.submissionId}`, '']) {
            const response = await authorPage.goto(
                `/index.php/${tag}/authorDashboard/reviewRoundInfo${suffix}`
            );
            expect(response?.status()).toBe(404);
            await expect(
                authorPage.getByRole('heading', {name: '404 Not Found', exact: true})
            ).toBeVisible();
            await expect(authorPage.locator('body')).toHaveText(/^\s*404 Not Found\s*$/);
            await expect(authorPage.locator('[data-cy="sidemodal-header"]')).toHaveCount(0);
        }
    });
});
