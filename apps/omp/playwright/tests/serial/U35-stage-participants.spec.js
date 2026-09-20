// @ts-check
/**
 * @file playwright/tests/serial/U35-stage-participants.spec.js
 *
 * Stage participants — scenario 6, the assignments at submit with the
 * seeded press's settings changed. The automatic assignments of Rule 11b
 * happen on the seeded press alone (footnote s), and the scenario flips
 * three of its settings (the Series editor role's recommend-only box, the
 * "Editor Assigned (Auto)" template's subject, a Series editor's
 * notification box), visible to every worker, so it runs in the serial
 * project (PRINCIPLES A7, A9) and restores each flip in a `finally`.
 * Spec: docs/specs/U35-stage-participants.md
 *
 * Coverage boundaries are declared in the parallel suite's header
 * (playwright/tests/U35-stage-participants.spec.js). Mailpit is shared
 * across fleets and workers: every read is scoped by the recipient's
 * address and the monograph's scratch title, and the unsubscribed Series
 * editor's silence is bounded by the other two editors' emails.
 */
const {test, expect} = require('../../support/fixtures.js');
const {ProfilePage} = require('../../../../../shared/playwright/pages/ProfilePage.js');
const {
    STEPS,
    wizardUrl,
    expectWizardOpen,
    expectStep,
    uploadWizardFile,
    continueTo,
    openReview,
    problemsBanner,
    confirmSubmit,
} = require('../../pages/SubmissionWizardPages.js');
const {
    ParticipantsPanel,
    RolesSettingsPage,
    AutoAssignedTemplatePage,
} = require('../../pages/StageParticipantsPages.js');

const PRESS = 'publicknowledge';
const PRESS_NAME = 'Public Knowledge Press';
const MANAGER = 'manager.maya';
const EDITOR = 'editor.diana';
const EDITOR_NAME = 'Diana Editor';
const ANA = 'sectioneditor.ana';
const ANA_NAME = 'Ana Section Editor';
const OMAR = 'sectioneditor.omar';
const OMAR_NAME = 'Omar Section Editor';
const RAVI_NAME = 'Ravi Section Editor';
const AUTHOR = 'author.alex';
const AUTHOR_NAME = 'Alex Author';
const SE_ROLE = 'Series editor';

/** The template's stored subject (its placeholder), and the subject the sent email carries. */
const STORED_SUBJECT = 'You have been assigned as an editor on a submission to {$contextName}';
const AUTO_ASSIGNED_SUBJECT = `You have been assigned as an editor on a submission to ${PRESS_NAME}`;
const EDITED_SUBJECT = `Edited: ${AUTO_ASSIGNED_SUBJECT}`;
/** Profile › Notifications: the "A new monograph, "{title}," has been submitted." row's setting. */
const SUBMITTED_SETTING = 'notificationSubmissionSubmitted';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u35${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

const mailOf = (username) => `${username}@mail.test`;

/**
 * The Author's submission through the wizard to "Monographs", titled
 * `title`: a seeded draft (the seed supplies the abstract) submitted
 * through the wizard with the series picked on "For the Editors", as the
 * parallel suite's S5 does.
 */
async function submitToMonographs(ompApi, authorPage, tag, title) {
    const {submissionId} = await ompApi.createSubmission({
        tag,
        context: PRESS,
        submitter: AUTHOR,
        title,
        series: 'monographs',
        submitted: false,
        participants: [],
    });
    await authorPage.goto(wizardUrl(PRESS, submissionId));
    await expectWizardOpen(authorPage);
    await expectStep(authorPage, STEPS.files);
    await uploadWizardFile(authorPage, `ms-${tag}.txt`);
    await continueTo(authorPage, STEPS.details);
    await continueTo(authorPage, STEPS.contributors);
    await continueTo(authorPage, STEPS.editors);
    const series = authorPage.getByRole('radio', {name: 'Monographs', exact: true});
    await expect(series).toBeVisible({timeout: 30_000});
    await series.check();
    await expect(series).toBeChecked();
    await openReview(authorPage);
    await expect(problemsBanner(authorPage)).toHaveCount(0);
    await confirmSubmit(authorPage);
    return submissionId;
}

test.describe("stage participants (the seeded press's settings flipped)", () => {
    test('S6: the assignments at submit with the settings changed', async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        const title = `Participants at submit, edited ${tag}`;

        const managerContext = await asUser(MANAGER);
        const anaContext = await asUser(ANA);
        const roles = new RolesSettingsPage(await managerContext.newPage(), PRESS);
        const template = new AutoAssignedTemplatePage(await managerContext.newPage(), PRESS);
        const anaProfile = new ProfilePage(await anaContext.newPage(), PRESS);

        // The three flips (footnote s), each restored below whatever happens.
        let roleWas = null;
        let subjectWas = null;
        let anaBoxWas = null;
        try {
            roleWas = await roles.setRecommendOnly(SE_ROLE, true);
            expect(roleWas, 'the Series editor role arrives with its box clear (install default)').toBe(false);
            expect(await roles.readRecommendOnly(SE_ROLE)).toBe(true);

            subjectWas = await template.readSubject();
            expect(subjectWas, 'the template arrives with its stored subject (install default)').toBe(STORED_SUBJECT);
            await template.setSubject(`Edited: ${subjectWas}`);
            expect(await template.readSubject()).toBe(`Edited: ${STORED_SUBJECT}`);

            await anaProfile.goto('notifications');
            const anaBox = anaProfile.notificationPair(SUBMITTED_SETTING).email;
            anaBoxWas = await anaBox.isChecked();
            expect(anaBoxWas, "Ana's box arrives clear (install default)").toBe(false);
            await anaBox.check();
            await anaProfile.save();
            await anaProfile.goto('notifications');
            await expect(anaProfile.notificationPair(SUBMITTED_SETTING).email).toBeChecked();

            // The submission through the wizard (Rule 11b).
            const authorPage = await (await asUser(AUTHOR)).newPage();
            const submissionId = await submitToMonographs(ompApi, authorPage, tag, title);

            // The panel: the two Series editors' rows carry the recommend-only
            // line; the Press Editor's, in a role whose box is clear, does not
            // (Rule 11b; Settings).
            const panel = new ParticipantsPanel(await managerContext.newPage(), PRESS);
            await panel.gotoStage(submissionId, 'Submission');
            await expect(panel.rows().first()).toBeVisible({timeout: 30_000});
            await expect.poll(() => panel.rowNames(), {timeout: 30_000}).toHaveLength(4);
            await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(1);
            await expect(panel.recommendLine(panel.row(OMAR_NAME))).toHaveCount(1);
            await expect(panel.row(EDITOR_NAME)).toHaveCount(1);
            await expect(panel.recommendLine(panel.row(EDITOR_NAME))).toHaveCount(0);
            await expect(panel.recommendLine(panel.row(AUTHOR_NAME))).toHaveCount(0);

            // "Assign Participant" for the role: the third Series editor's
            // "Assignment privileges" arrives ticked; "Cancel" (Rule 4c; Settings).
            const assign = await panel.openAssign();
            await assign.selectRole(SE_ROLE);
            await assign.search();
            await assign.choose(RAVI_NAME);
            await expect(assign.privilegesHeading()).toBeVisible();
            await expect(assign.recommendOnlyBox()).toBeChecked();
            await assign.cancel();

            // The mailboxes: the Press Editor's and the other Series editor's
            // hold the edited subject; the unsubscribed Series editor's holds
            // nothing for the title once those two arrived (Side effects; Settings).
            for (const editor of [EDITOR, OMAR]) {
                const mail = await pkpMail.find({to: mailOf(editor), subject: EDITED_SUBJECT, contains: title});
                expect(mail.Subject).toBe(EDITED_SUBJECT);
            }
            await pkpMail.expectNone({
                to: mailOf(ANA),
                contains: title,
                afterControl: {to: mailOf(OMAR), subject: EDITED_SUBJECT, contains: title},
            });

            // The Activity Log: "An email has been sent: Edited: …" (Side effects; Settings).
            await panel.frame.openActivityLog();
            await expect(panel.frame.activityLogRow(`An email has been sent: ${EDITED_SUBJECT}`).first()).toBeVisible({
                timeout: 30_000,
            });
            await panel.frame.closeActivityLog();

            // Control: the unsubscribed Series editor's row is on the panel
            // all the same (read above: her row with its line), and her
            // silence was read once the other two emails had arrived.
            await expect(panel.row(ANA_NAME)).toHaveCount(1);
        } finally {
            // Restore every flip, then read each back.
            if (roleWas !== null) {
                await roles.setRecommendOnly(SE_ROLE, roleWas);
                expect(await roles.readRecommendOnly(SE_ROLE)).toBe(roleWas);
            }
            if (subjectWas !== null) {
                await template.setSubject(subjectWas);
                expect(await template.readSubject()).toBe(subjectWas);
            }
            if (anaBoxWas !== null) {
                await anaProfile.goto('notifications');
                await anaProfile.notificationPair(SUBMITTED_SETTING).email.setChecked(anaBoxWas);
                await anaProfile.save();
                await anaProfile.goto('notifications');
                await expect(anaProfile.notificationPair(SUBMITTED_SETTING).email).not.toBeChecked();
            }
        }
    });
});
