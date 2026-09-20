// @ts-check
/**
 * @file playwright/tests/serial/U35-stage-participants.spec.js
 *
 * Stage participants — the one OPS scenario that cannot run beside the
 * parallel suite: scenario 9 ("The Moderators assigned at submit") ticks
 * the seeded server's Moderator role's "This role is only allowed to
 * recommend a review decision…" box, a setting every worker's "Assign
 * Participant" window and every automatic assignment would see, and
 * restores it in a `finally` (PRINCIPLES A7, A9). The assignments at
 * submit happen on the seeded server alone (footnote s; app-changes row
 * 3), so the wizard submission is author.alex's on `publicknowledge`,
 * scoped by a scratch title.
 * Spec: docs/specs/U35-stage-participants.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U35-stage-participants.spec.js); this file adds only:
 * - OPS3 🐞 (the Moderators assigned at submit get no "Moderator Assigned
 *   (Auto)" email) is register-carried, not asserted: scenario 9 leaves
 *   what the Moderators' mailboxes hold to the register (PRINCIPLES M3),
 *   so this test reads no mailbox;
 * - the "needs a moderator" task's absence is read on the manager's Tasks
 *   panel after its grid settled (rows or "No Items"), scoped by the
 *   title; the panel's own rows (the two Moderators, the Author) are the
 *   positive control for the submit's side effects.
 */
const {test, expect} = require('../../support/fixtures.js');
const {TasksPanel} = require('../../../../../shared/playwright/pages/NotificationsPages.js');
const {ParticipantsPanel, RolesSettingsPage, RECOMMEND_ONLY_MARK} = require('../../pages/StageParticipantsPages.js');
const {
    STEPS,
    CONTROLS,
    SUBMIT_DIALOGS,
    startUrl,
    beginSubmission,
    continueTo,
    addGalleyFile,
    setRelationStatus,
    openReview,
    confirmSubmit,
    fillRichText,
} = require('../../pages/SubmissionWizardPages.js');

const CONTEXT = 'publicknowledge';
const MANAGER = 'manager.maya';
const AUTHOR = 'author.alex';
const AUTHOR_NAME = 'Alex Author';
/** The section's two ticked Moderators and the server's third (footnote s). */
const TICKED = {'Ana Section Editor': 'sectioneditor.ana', 'Ravi Section Editor': 'sectioneditor.ravi'};
const THIRD_MODERATOR = 'Omar Section Editor';
const ADMIN_ROW = /admin/i;
const MODERATOR_ROLE = 'Moderator';
const NEEDS_MODERATOR = 'A new preprint has been submitted to which a moderator needs to be assigned.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u35${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe("stage participants (the seeded server's Moderator role)", () => {
    test('S9: the Moderators assigned at submit', async ({asUser, appContext}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s9', testInfo);
        const title = `Moderators at submit ${tag}`;

        // Given: the seeded server, whose "Preprints" form ticks Ana and
        // Ravi under "Editorial Assignments" and not Omar (the seed), the
        // manager not assigned, the Site Administrator holding the manager
        // role; the Moderator role's recommend-only box ticked for this
        // scenario by the manager and put back after it (footnote s).
        const managerPage = await (await asUser(MANAGER)).newPage();
        const roles = new RolesSettingsPage(managerPage, CONTEXT);
        await roles.setRecommendOnly(MODERATOR_ROLE, true);
        try {
            expect(await roles.readRecommendOnly(MODERATOR_ROLE)).toBe(true);

            // ── The submission ───────────────────────────────────────────
            // The Author submits a preprint through the wizard (Rule 11c).
            const authorPage = await (await asUser(AUTHOR)).newPage();
            await authorPage.goto(startUrl(CONTEXT));
            await beginSubmission(authorPage, {title});
            const submissionId = Number(new URL(authorPage.url()).searchParams.get('id'));
            expect(submissionId).toBeGreaterThan(0);
            await addGalleyFile(authorPage);
            await continueTo(authorPage, STEPS.details);
            await fillRichText(authorPage, CONTROLS.abstract, `Abstract for ${title}.`);
            await continueTo(authorPage, STEPS.contributors);
            await continueTo(authorPage, STEPS.readers);
            await setRelationStatus(authorPage);
            await openReview(authorPage);
            await confirmSubmit(authorPage, {message: SUBMIT_DIALOGS.moderated});

            // ── The panel ────────────────────────────────────────────────
            // As the manager at "Production": the two Moderators' rows,
            // each with "Only allowed to recommend an editorial decision",
            // beside the Author's row; the Tasks panel lists no "needs a
            // moderator" task for the title (Rules 11a, 11b, 11c; Settings);
            // what the Moderators' mailboxes hold is OPS3's, not read here.
            const panel = new ParticipantsPanel(managerPage, CONTEXT, {appContext});
            await panel.gotoProduction(submissionId);
            await expect(panel.rows()).toHaveText([/Moderator/, /Moderator/, /Author/], {timeout: 30_000});
            for (const name of Object.keys(TICKED)) {
                await expect(panel.row(name)).toContainText(MODERATOR_ROLE);
                await expect(panel.recommendOnlyMark(name)).toBeVisible({timeout: 30_000});
            }
            await expect(panel.row(THIRD_MODERATOR)).toHaveCount(0);
            await expect(panel.row(AUTHOR_NAME)).toContainText('Author');
            await expect(panel.row(AUTHOR_NAME).getByText(RECOMMEND_ONLY_MARK)).toHaveCount(0);
            await managerPage.goto(`/index.php/${CONTEXT}/dashboard/editorial`);
            const tasks = new TasksPanel(managerPage);
            await expect(tasks.bell()).toBeVisible({timeout: 30_000});
            await tasks.open();
            await expect(tasks.rows().or(tasks.noItems()).first()).toBeVisible({timeout: 30_000});
            await expect(tasks.row(title)).toHaveCount(0);
            await expect(tasks.row(title).filter({hasText: NEEDS_MODERATOR})).toHaveCount(0);
            await tasks.close();

            // ── "Assign Participant" for the role ────────────────────────
            // "Assign", "Moderator", "Search", the third Moderator's row:
            // "Assignment privileges" arrives ticked; "Cancel" (Rule 4c;
            // Settings).
            await panel.gotoProduction(submissionId);
            let assign = await panel.openAssign();
            await assign.selectRole(MODERATOR_ROLE);
            await assign.search('Omar');
            await expect(assign.userRow(THIRD_MODERATOR).first()).toBeVisible({timeout: 30_000});
            await assign.chooseUser(THIRD_MODERATOR);
            await expect(assign.privilegesHeading()).toBeVisible({timeout: 30_000});
            await expect(assign.recommendOnlyBox()).toBeChecked();
            await assign.cancel();

            // ── Control ──────────────────────────────────────────────────
            // "Preprint Server manager", "Search", the Site Administrator's
            // row: "Assignment privileges" arrives clear, that role's box
            // untouched; "Cancel" (Settings).
            assign = await panel.openAssign();
            await assign.selectRole('Preprint Server manager');
            await assign.search('admin');
            await expect(assign.userRow(ADMIN_ROW).first()).toBeVisible({timeout: 30_000});
            await assign.chooseUser(ADMIN_ROW);
            await expect(assign.privilegesHeading()).toBeVisible({timeout: 30_000});
            await expect(assign.recommendOnlyBox()).not.toBeChecked();
            await assign.cancel();
        } finally {
            // The seeded server is shared state: the role's box goes back
            // whatever happened (PRINCIPLES A7).
            await roles.setRecommendOnly(MODERATOR_ROLE, false);
            expect(await roles.readRecommendOnly(MODERATOR_ROLE)).toBe(false);
        }
    });
});
