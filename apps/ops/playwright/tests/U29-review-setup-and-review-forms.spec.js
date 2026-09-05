// @ts-check
/**
 * @file playwright/tests/U29-review-setup-and-review-forms.spec.js
 *
 * U29 — Review setup & review forms (docs/specs/U29-review-setup-and-review-forms.md):
 * the OPS ABSENCE test, spec scenario 12. A preprint server has no review
 * stage (spec footnote p), so Settings › Workflow carries no "Review" tab:
 * its tabs are "Submission", "Preprint Server Library", "Emails" and
 * "Tasks and Discussions", and the journal's typed Review-tab address
 * lands on the same page with "Submission" › "Disable Submissions" open
 * and the typed address unchanged. Per RUNBOOK multi-app rule 3 the whole
 * feature costs this ONE absence test, with a positive control per
 * assertion (PRINCIPLES M4): the same tab list, read the same way, holds
 * the four installed tabs; the same page shows the "Disable Submissions"
 * form. The tooling side (footnote p) is bounded the same way: the
 * scratch server seeds through `POST scenarios/context` first, then the
 * same call with a `review` key (and with a `reviewForms` key) is refused.
 *
 * Deliberately NOT covered here (and why):
 * - The entire feature — the "Setup" form and its downstream effects, the
 *   "Reviewer Guidance" boxes and the anonymity link, review forms and
 *   their items, the reviewer's step 3, reviewer recommendations (spec
 *   scenarios 1–11, Rules 1–20): none of these screens exist on OPS. The
 *   OJS and OMP suites own them.
 * - The spec's Findings register entries (A1–A6, OMP3): OJS/OMP surfaces;
 *   no OPS counterpart, nothing to assert or park here.
 * - Which roles reach Settings (the Actors table): Roles-configuration
 *   territory; the Preprint Server Manager the scenario names is enough.
 *
 * Seeding: a scratch preprint server with a throwaway Preprint Server
 * Manager via the scenario endpoint (the seeded `publicknowledge` server
 * and its roster are not touched).
 */
const {test, expect} = require('../support/fixtures.js');

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

/** The Workflow tabs a preprint server installs, in screen order. */
const OPS_WORKFLOW_TABS = ['Submission', 'Preprint Server Library', 'Emails', 'Tasks and Discussions'];

/** The journal's Review › Setup address, as its side tab writes it. */
const REVIEW_HASH = '#review/reviewSetup';

test.describe('review setup & review forms (U29) — OPS absence', () => {
    test('scenario 12 {OPS}: no Review tab on a preprint server', async ({asUser, pkpApi}) => {
        const tag = makeTag('u29s12');
        const manager = `m${tag}`;

        // Scratch preprint server with the throwaway manager. This call is
        // also the positive control for the tooling refusals below: the
        // same endpoint, the same shape, accepted without the review keys.
        await pkpApi.createContext({
            tag,
            users: [{username: manager, roles: ['manager']}],
        });

        // ── Tooling: the review keys are refused on OPS (footnote p) ────────
        // `pkpApi` throws on any non-2xx with the status and body in the
        // message; the sentence names the missing review stage.
        await expect(
            pkpApi.createContext({tag: `${tag}r`, review: {defaultReviewMode: 1}})
        ).rejects.toThrow(/400[\s\S]*OPS has no review stage/);
        await expect(
            pkpApi.createContext({tag: `${tag}f`, reviewForms: [{title: 'Form A'}]})
        ).rejects.toThrow(/400[\s\S]*OPS has no review stage/);

        // ── Preprint Server Manager: Settings › Workflow ────────────────────
        const page = await (await asUser(manager)).newPage();
        const workflow = await page.goto(`/index.php/${tag}/management/settings/workflow`);
        expect(workflow && workflow.status()).toBe(200);

        // Positive control: the main tab list renders the four installed
        // tabs, in order. The side tabs of the open "Submission" tab are
        // tabs too, so the main list is the first tablist on the page.
        const mainTabs = page.getByRole('tablist').first().getByRole('tab');
        await expect(mainTabs).toHaveText(OPS_WORKFLOW_TABS);
        // …and no tab anywhere on the page is "Review" (bounded by the same
        // page having just rendered its four main tabs).
        await expect(page.getByRole('tab', {name: 'Review', exact: true})).toHaveCount(0);

        // ── The journal's Review-tab address, typed on the server ───────────
        // The same page, "Submission" › "Disable Submissions" selected, the
        // hash left as typed — no redirect.
        await page.goto(`/index.php/${tag}/management/settings/workflow${REVIEW_HASH}`);
        await expect(mainTabs).toHaveText(OPS_WORKFLOW_TABS);
        expect(new URL(page.url()).hash).toBe(REVIEW_HASH);
        await expect(page.getByRole('tab', {name: 'Submission', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', {name: 'Disable Submissions', exact: true})).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', {name: 'Review', exact: true})).toHaveCount(0);

        // Control: "Disable Submissions" shows its form — the one box, its
        // sentence and the Save button, in the visible panel.
        const panel = page.locator('[role="tabpanel"]:visible').last();
        await expect(panel.getByRole('checkbox', {name: 'Disable Submissions'})).toBeVisible();
        await expect(panel.getByText('Prevent users from submitting new preprints to the server.')).toBeVisible();
        await expect(panel.getByRole('button', {name: 'Save', exact: true})).toBeVisible();
    });
});
