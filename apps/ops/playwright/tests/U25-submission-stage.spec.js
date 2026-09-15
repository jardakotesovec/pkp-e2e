// @ts-check
/**
 * @file playwright/tests/U25-submission-stage.spec.js
 *
 * Submission stage — OPS suite: the preprint server's ABSENCE test only.
 * OPS runs a single-stage workflow (Production only, register OPS1), so no
 * preprint ever occupies a Submission stage and none of the spec's panels or
 * decision buttons render here. Scenarios 1–7, 10 and 11 are badged
 * {OJS OMP} and 8 {OMP}; the spec's preamble states the absence once and S9
 * is the absence scenario, so per RUNBOOK multi-app rule 3 the feature costs
 * OPS one absence test with a positive control per assertion (M4).
 * Spec: docs/specs/U25-submission-stage.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 ❓,
 * A2 ❓, A3 ❓ (journal and press states of a stage a preprint server never
 * shows), OMP1 ✅ (press routing), OPS1 ✅ (the divergence S9 asserts as the
 * spec's stated absence, never the Production stage's own behaviour, which
 * belongs to *Production stage* and *Publish, schedule & versions*). The
 * spec's Coverage section records everything else left out.
 *
 * Seeding: the test builds its own scratch preprint server + one submitted
 * preprint via the scenario endpoints (throwaway users, unique tag, M5).
 * `publicknowledge` and the seeded roster are not touched.
 */
const {test, expect} = require('../support/fixtures.js');

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

/** The preprint server's single stage entry (OPS1). */
const OPS_STAGES = ['Production'];

test.describe('submission stage (U25) — OPS absence', () => {
    test('S9 {OPS}: no Submission stage on a preprint server', async ({
        asUser,
        pkpApi,
    }) => {
        const tag = makeTag('u25s9');
        const manager = `m${tag}`;
        const author = `a${tag}`;

        // Scratch preprint server with a throwaway Preprint Server Manager
        // and author; one seeded (submitted, unposted) preprint — on OPS it
        // lands directly on the Production stage.
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
        // Arrival: the workflow dialog opened directly on the Production
        // stage — there is no Submission stage to land on (the side-modal
        // wrapper reports visibility:hidden — anchor on inner content,
        // patterns.md pitfall 5).
        await expect(
            workflow.getByRole('heading', {name: /Workflow: Production/})
        ).toBeVisible();

        // Control: the Production stage shows its own controls, "Post the
        // preprint" and "Decline Submission", so the workflow itself is
        // working. "Decline Submission" here is the Production stage's
        // decision (register OPS1) — the shared label, not a
        // Submission-stage button.
        const actionArea = workflow.locator('[data-cy="workflow-action-items"]');
        await expect(
            actionArea.getByRole('button', {name: 'Post the preprint'})
        ).toBeVisible();
        await expect(
            actionArea.getByRole('button', {name: 'Decline Submission'})
        ).toBeVisible();

        // The workflow menu: it offers Production (control, taken the same
        // way)…
        const stageMenu = workflow.getByRole('navigation');
        await expect(
            stageMenu.getByRole('link', {name: 'Production', exact: true})
        ).toBeVisible();
        // …and no "Submission" entry (the stage-1 menu label on OJS/OMP is
        // exactly "Submission").
        await expect(
            stageMenu.getByRole('link', {name: 'Submission', exact: true})
        ).toHaveCount(0);
        // …and nothing else: the stage entries under the "Workflow" group
        // are exactly ["Production"]. The side menu is a PrimeVue PanelMenu
        // whose links carry their nesting in the indentation classes
        // (`!px-7`/`!px-9` = level 2, a stage; the group itself has none),
        // the DOM facts the shared WorkflowPage documents.
        await expect
            .poll(async () =>
                stageMenu.getByRole('link').evaluateAll((anchors) => {
                    const entries = anchors.map((a) => ({
                        label: (a.textContent || '').trim(),
                        level: /!px-(10|12|14|16)\b/.test(a.className)
                            ? 3
                            : /!px-(7|9)\b/.test(a.className)
                              ? 2
                              : 1,
                    }));
                    const start = entries.findIndex(
                        (e) => e.level === 1 && e.label === 'Workflow'
                    );
                    if (start < 0) return null;
                    const out = [];
                    for (const e of entries.slice(start + 1)) {
                        if (e.level === 1) break;
                        if (e.level === 2) out.push(e.label);
                    }
                    return out;
                })
            )
            .toEqual(OPS_STAGES);

        // The Submission stage's panels render nowhere. Positive control:
        // the Production stage's discussions panel is present under its own
        // heading — so panels as such do render.
        await expect(
            workflow.getByText('Production Tasks & Discussions')
        ).toBeVisible();
        await expect(workflow.getByText('Desk Review Tasks & Discussions')).toHaveCount(0);
        await expect(workflow.getByText('Submission Files')).toHaveCount(0);

        // The decision buttons: none of the send-to-review buttons (OJS or
        // OMP variant), "Accept and Skip Review" or the "Schedule For
        // Publication" shortcut exists anywhere on the screen — the whole
        // page, not just the dialog — bounded by the same dialog having just
        // rendered its Production controls above. "Schedule For Publication"
        // is the OJS shortcut label; OPS relabels that action "Post the
        // preprint" (asserted present above).
        await expect(page.getByText('Send for Review')).toHaveCount(0);
        await expect(page.getByText('Send to External Review')).toHaveCount(0);
        await expect(page.getByText('Send to Internal Review')).toHaveCount(0);
        await expect(page.getByText('Accept and Skip Review')).toHaveCount(0);
        await expect(page.getByText('Schedule For Publication')).toHaveCount(0);
    });
});
