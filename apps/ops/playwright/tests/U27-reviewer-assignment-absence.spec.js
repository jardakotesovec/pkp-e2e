// @ts-check
/**
 * @file playwright/tests/U27-reviewer-assignment-absence.spec.js
 *
 * U27 — Reviewer assignment & management
 * (docs/specs/U27-reviewer-assignment-and-management.md): the OPS ABSENCE
 * test, spec scenario 15. OPS installs no review stage and no reviewer role
 * (spec footnote p, install facts) — no "Reviewers" panel exists on any
 * preprint workflow screen, Users & Roles offers no reviewer group and the
 * server's email templates hold no reviewer-flow template — so per RUNBOOK
 * multi-app rule 3 the whole feature costs this ONE absence test, with a
 * positive control per assertion (Production's own controls render; a
 * Moderator-role search returns users; the server's own templates list).
 * The spec's Coverage section is the record of everything else left out.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as contract, a ❓ is parked, not a gap):
 * - A1 🐞, A2 🐞, A7 🐞, A8 🐞, A12 🐞, A13 🐞, A15 🐞, A16 🐞, A18 🐞,
 *   A19 🐞, A21 🐞, A22 🐞, A30 🐞, A31 🐞, A34 🐞, OMP2 🐞, OMP4 🐞, OMP6 🐞
 *   (journal and press reviewer surfaces that do not exist on a preprint
 *   server).
 * - A4 ❓, A6 ❓, A17 ❓, A23 ❓, A29 ❓, OMP5 ❓, A24 ✅, A33 ✅, A35 ✅, A3 ✅, A5 ✅, A9 ✅,
 *   A10 ✅, A11 ✅,
 *   A14 ✅, A20 ✅, A25 ✅, OMP1 ✅, OPS1 ✅ (nothing to assert or park
 *   here; OPS1 is the retired "missing unassign template" reading, whose
 *   baseline fact this test's email-templates read states).
 *
 * Seeding: a scratch preprint server (throwaway manager/moderator/author) +
 * one submitted preprint via the scenario endpoints. `publicknowledge` and
 * the seeded roster are not touched.
 */
const {test, expect} = require('../support/fixtures.js');
const {UsersRolesPage} = require('../pages/UserInvitationPages.js');

/** Single hyphenless alphanumeric token — tag conventions in patterns.md. */
function makeTag(prefix) {
    return prefix + Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 7);
}

test.describe('reviewer-assignment & management (U27) — OPS absence', () => {
    test('S15 {OPS}: no reviewer surfaces on a preprint server', async ({asUser, pkpApi}) => {
        const tag = makeTag('u27s15');
        const manager = `m${tag}`;
        const moderator = `mod${tag}`;
        const moderatorName = `Mod${tag}`;
        const author = `a${tag}`;

        // Scratch preprint server with a throwaway Preprint Server Manager, a
        // Moderator (the positive control for the role search) and an author;
        // one seeded (submitted, unposted) preprint — on OPS it lands directly
        // on the Production stage.
        await pkpApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: moderator, roles: ['sectionEditor'], givenName: moderatorName},
                {username: author, roles: ['author']},
            ],
        });
        const seeded = await pkpApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
        });

        // ── Surface 1: the preprint workflow ────────────────────────────────
        // Preprint Server Manager opens the preprint's workflow.
        const page = await (await asUser(manager)).newPage();
        await page.goto(
            `/index.php/${tag}/dashboard/editorial?workflowSubmissionId=${seeded.submissionId}`
        );

        const workflow = page.locator('[data-cy="active-modal"]');
        // Arrival: the workflow dialog opened on the Production stage (the
        // side-modal wrapper reports visibility:hidden — anchor on inner
        // content, patterns.md pitfall 5).
        await expect(
            workflow.getByRole('heading', {name: /Workflow: Production/})
        ).toBeVisible();

        // Positive control (the workflow screen demonstrably works): the
        // Production stage's own controls render — the posting and declining
        // actions, and the stage's panel area with its Discussions panel.
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

        // …and no "Reviewers" panel or reviewer control anywhere in the
        // dialog (bounded by the controls just rendered): no panel heading,
        // no Add Reviewer entry, no reviewer row machinery.
        await expect(workflow.getByText('Reviewers', {exact: true})).toHaveCount(0);
        await expect(workflow.getByRole('button', {name: 'Add Reviewer'})).toHaveCount(0);
        await expect(workflow.getByText('Reviewer status')).toHaveCount(0);

        // ── Surface 2: Users & Roles ────────────────────────────────────────
        // Users tab. Positive control: searching the Current Users list for
        // the throwaway Moderator returns them, holding the Moderator role —
        // the users surface and its role rendering demonstrably work.
        const users = new UsersRolesPage(page, tag);
        await users.goto();
        await users.searchUsers(moderatorName);
        const moderatorRow = users.userRow(moderatorName);
        await expect(moderatorRow).toBeVisible();
        await expect(moderatorRow).toContainText('Moderator');
        // No user of this server holds any reviewer role (bounded by the same
        // table having just rendered the Moderator row).
        await expect(
            page.getByRole('row').filter({hasText: /Reviewer/})
        ).toHaveCount(0);

        // Roles tab: the server's role roster offers no reviewer group.
        await page.getByRole('tab', {name: 'Roles', exact: true}).click();
        const roleRows = page.locator('#roleGridContainer tr.gridRow');
        // Positive control, taken the same way: the seeded default groups
        // list — the Moderator group's row renders.
        await expect(roleRows.filter({hasText: 'Moderator'})).toBeVisible();
        await expect(roleRows.filter({hasText: 'Preprint Server manager'})).toBeVisible();
        // …and no group row names any reviewer role (bounded by the same
        // grid's rendered rows; scoped to rows — the grid's filter select and
        // the generic "Create New Role" form carry an application-wide
        // permission-level enum that still lists "Reviewer", a recorded
        // install nuance (footnote p), not a group of this server).
        await expect(roleRows.filter({hasText: /Review/i})).toHaveCount(0);

        // ── Surface 3: the server's email templates ─────────────────────────
        // Settings › Workflow › Emails offers "Add and edit templates", which
        // opens the Manage Emails page: the list of every email the server
        // sends, one entry per email with its "Edit {name}" action.
        await page.goto(`/index.php/${tag}/management/settings/workflow#emails`);
        await page.getByRole('link', {name: 'Add and edit templates'}).click();
        await expect(page.getByRole('heading', {name: 'Manage Emails'})).toBeVisible();
        const emails = page.locator('main .listPanel__item');
        const emailTitles = page.locator('main .listPanel__itemTitle');
        // Positive control: the server's own emails list — the pending-
        // moderation acknowledgement and the moderator assignment, each with
        // its edit action.
        await expect(
            emailTitles.filter({hasText: 'Submission Acknowledgement (Pending Moderation)'})
        ).toBeVisible();
        await expect(
            emails.getByRole('button', {name: 'Edit Moderator Assigned (Auto)'})
        ).toBeVisible();
        // …and no reviewer-flow template among them (bounded by the same
        // list having just rendered): no review request, no reminder, no
        // cancel notice, nothing addressed to a reviewer. Read on the entry
        // titles, because "Reinstate Submission Declined Without Review" is
        // a decision template of the server's own.
        await expect(emailTitles.filter({hasText: /^Review /})).toHaveCount(0);
        await expect(emailTitles.filter({hasText: /Reviewer/})).toHaveCount(0);
        await expect(emailTitles.filter({hasText: /Remind/})).toHaveCount(0);
        await expect(emailTitles.filter({hasText: /Cancel/})).toHaveCount(0);
        // Nor a "Reviewer" audience: the list's "Sent From" / "Sent To"
        // filters offer the server's roles only.
        const filters = page.locator('main').getByRole('button');
        await expect(filters.filter({hasText: /^Moderator$/}).first()).toBeVisible();
        await expect(filters.filter({hasText: /^Reviewer$/})).toHaveCount(0);
    });
});
