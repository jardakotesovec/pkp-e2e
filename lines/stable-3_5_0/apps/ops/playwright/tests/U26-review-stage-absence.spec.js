// @ts-check
/**
 * @file lines/stable-3_5_0/apps/ops/playwright/tests/U26-review-stage-absence.spec.js
 *
 * Review stage & rounds — the OPS suite of stable-3_5_0, the ABSENCE test
 * only, spec scenario 14. OPS installs no review stage: a preprint
 * server's workflow goes straight from submission to Production (spec
 * footnote p, an install fact), so scenarios 1–13 and 15 carry badges that
 * exclude a preprint server and the whole feature costs this ONE test, with
 * a positive control per absence, plus the old author-dashboard addresses
 * typed by the preprint's Author (Rule 17).
 * Spec: lines/stable-3_5_0/docs/specs/U26-review-stage-and-rounds.md
 *
 * Deliberately NOT covered (register IDs; the spec's Coverage section is
 * the record of everything else left out):
 * - 🐞 A1, A9, A10, A13, A14.
 * - ❓ A2, A3, A4, A5, A6, A7, A8, A11, A15, OMP2, OMP3.
 * - ✅ OMP1.
 *
 * Seeding: a scratch preprint server with a throwaway manager and the
 * preprint's throwaway Author, and one submitted preprint, via the scenario
 * endpoints. `publicknowledge` and the seeded roster are not touched. No
 * hard-coded waits; runs in the parallel `ops` project.
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
        // actions, and the stage's Discussions panel (on this version its
        // legacy grid under a "Discussions" heading).
        const actionArea = workflow.locator('[data-cy="workflow-action-items"]');
        await expect(
            actionArea.getByRole('button', {name: 'Post the preprint'})
        ).toBeVisible();
        await expect(
            actionArea.getByRole('button', {name: 'Decline Submission'})
        ).toBeVisible();
        await expect(workflow.getByRole('heading', {name: 'Discussions', exact: true})).toBeVisible();

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

        // Old addresses (Rule 17), typed by the preprint's Author. The
        // author-dashboard address lands on My Submissions with the
        // preprint's workflow open on its "Title & Abstract". On this
        // version that page's form request may fail and raise an "Error"
        // window over the workflow (spec notes o, s): neither this
        // scenario's pass nor its fail, so the reads below are CSS reads
        // that hold with or without it (behind it the workflow is
        // aria-hidden, patterns.md locator pitfall 6), and nothing asserts
        // the window or its absence.
        const authorPage = await (await asUser(author)).newPage();
        await authorPage.goto(`/index.php/${tag}/authorDashboard/submission/${seeded.submissionId}`);
        await authorPage.waitForURL((u) => u.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
        await expect
            .poll(() => new URL(authorPage.url()).searchParams.get('workflowSubmissionId'), {timeout: 30_000})
            .toBe(String(seeded.submissionId));
        await expect
            .poll(() => new URL(authorPage.url()).searchParams.get('workflowMenuKey'), {timeout: 30_000})
            .toBe('publication_titleAbstract');
        const authorHeader = authorPage.locator('[data-cy="sidemodal-header"]');
        await expect(authorHeader).toBeVisible({timeout: 30_000});
        await expect(authorHeader.locator('.text-xl-medium').first()).toHaveText(
            new RegExp(`^\\s*${seeded.submissionId}\\b`),
            {timeout: 30_000}
        );
        await expect(
            authorPage.locator('[data-cy="active-modal"] h2').filter({hasText: /^\s*Preprint:\s*Title & Abstract\s*$/})
        ).toBeVisible({timeout: 30_000});

        // The old per-round tab address, with the preprint's id and without
        // one: a bare "404 Not Found" page each time, no workflow on it.
        for (const suffix of [`/${seeded.submissionId}`, '']) {
            const response = await authorPage.goto(`/index.php/${tag}/authorDashboard/reviewRoundInfo${suffix}`);
            expect(response?.status()).toBe(404);
            await expect(authorPage.locator('body')).toHaveText('404 Not Found');
            await expect(authorPage.locator('[data-cy="sidemodal-header"]')).toHaveCount(0);
        }
    });
});
