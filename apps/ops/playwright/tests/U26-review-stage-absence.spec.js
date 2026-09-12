// @ts-check
/**
 * @file playwright/tests/U26-review-stage-absence.spec.js
 *
 * Review stage & rounds — OPS suite, the ABSENCE test only, spec scenario
 * 14. OPS installs no review stage: a preprint server's workflow goes
 * straight from submission to Production (spec footnote p, an install
 * fact), so scenarios 1–13 carry badges that exclude a preprint server and
 * the whole feature costs this ONE test, with a positive control per
 * absence. Spec: docs/specs/U26-review-stage-and-rounds.md; its Coverage
 * section is the record of everything else left out.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 🐞, OJS1 🐞, A9 🐞, A10 🐞 (review-stage surfaces that do not exist
 *   on a preprint server).
 * - A2 ❓, A3 ❓, A4 ❓, A5 ❓, A6 ❓, A7 ❓, A8 ❓, OMP2 ❓, OMP3 ❓, OMP1 ✅
 *   (journal and press review surfaces; nothing to assert or park here).
 *
 * Seeding: a scratch preprint server + one submitted preprint via the
 * scenario endpoints (throwaway manager/author). `publicknowledge` and the
 * seeded roster are not touched. No hard-coded waits; runs in the parallel
 * `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');

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
        // author; one seeded (submitted, unposted) preprint — on OPS it lands
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
    });
});
