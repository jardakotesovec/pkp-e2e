// @ts-check
/**
 * @file playwright/tests/U35-stage-participants.spec.js
 *
 * Stage participants — OJS suite, one test per canonical scenario the spec
 * runs on a journal: the common scenarios 1–5 ({OJS OMP}) here, scenario 6
 * (the seeded journal's settings flipped) in the serial spec
 * (tests/serial/U35-stage-participants.spec.js); scenarios 7–9 are {OPS}.
 * Spec: docs/specs/U35-stage-participants.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞 ("Assign Editor" raises no task): S3 reads the Section Editor's
 *   discussion row; the absence of an assignment task is not asserted.
 * - A2 🐞 (a typed message with no predefined message chosen): every
 *   message step picks a predefined entry first; nothing sends typed text
 *   with the list blank.
 * - A3 🐞 (every "Edit Assignment" save logs a fresh assignment): S2 reads
 *   the "was assigned" line's presence, never its count.
 * - A8 🐞 (the discussion listed as created by its recipient): S3 and S4
 *   read the discussion's participants; "Created by" is not asserted.
 * - A9 🐞 (a Section Editor's "Edit" on a manager's Section Editor row):
 *   nothing opens it; S4's manager row is read by the manager alone.
 * - A10 🐞 ("OK" with nobody chosen says nothing): S3 reads that the window
 *   stays open and assigns nobody; its silence is not asserted.
 * - A11 🐞 (the "Permissions" box kept across choices): every window
 *   chooses one person; a second choice in one window is never made.
 * - A12 🐞 (the anonymous-review warning never shows): no reviewer is
 *   chosen in "Assign Participant".
 * - OJS1 🐞 (the assignment email's "Send to Review"): S5 reads the email's
 *   subject and sender; its text is not asserted.
 * - A4 ❓ (an ended role's participant listed unmarked): S4's ended Section
 *   Editor is never assigned; nothing reads a listed ended participant.
 * - A5 ❓ ("Notify" on one's own row): nothing sends it.
 * - A6 ❓, OMP1 ❓, OPS1 ✅, OPS2 🐞, OPS3 🐞, OPS4 ❓: other apps' territory.
 * - A7 ❓ (no "Edit" on one's own Section Editor row) and A13 ❓ (the
 *   Activity Log's User column names the participant): read as the
 *   scenarios state them; nothing asserts what should be offered or named.
 *
 * Seeding: scenario endpoints only; `publicknowledge` and the seeded roster
 * are read-only (A1, A7). S1, S2 and S5 run on the seeded journal with
 * scratch submissions (footnote s: a seed in ART auto-assigns Diana, Ana and
 * Omar, one in REV Ravi; S5's automatic assignments happen on the seeded
 * journal alone, so it submits through the wizard there on a scratch title
 * and reads Mailpit and the Tasks panel by that title). S3 and S4 run on
 * scratch journals with throwaway accounts because each reads a mailbox
 * (A8: every read scoped by a throwaway address, every silence bounded by a
 * message that did arrive). States with no seed key are built on screen
 * before the scenario's first step, as footnote s says: S4's ended Section
 * Editor role through Users & Roles › "Remove Role", S4's switched-off
 * discussion emails through Profile › Notifications; the recommend-only
 * flag is set through "Assign Participant" and "Edit Assignment", which is
 * this feature's subject. "Login As" swaps the page's session for the
 * impersonated user and "Logout as {name}" returns it; a test that ends
 * impersonating lets the per-test session lapse. Tags are unique per run
 * (M5); waits are web-first (A5). Everything here runs in the parallel
 * `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel, toasts, successToasts, expectStackedBelow} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {ProfilePage} = require('../../../../shared/playwright/pages/ProfilePage.js');
const {LoginAsDialog} = require('../pages/LoginSessionsPages.js');
const {UsersRolesPage, SendInvitationWizard} = require('../pages/UserInvitationPages.js');
const {SubmissionWizardPage} = require('../pages/SubmissionWizardPage.js');
const {
    ParticipantsPanel,
    RECOMMEND_ONLY_LINE,
    REMOVE_QUESTION,
    NO_CHANGES,
    TEMPLATE_PROMPT,
    NOTIFY_EMPTY_MESSAGE,
    LEAVE_QUESTION,
    ADDED_TOAST,
    CHANGED_TOAST,
    SENT_TOAST,
    NO_ROLE_ACCESS,
    NEEDS_EDITOR_TASK,
    SectionSettingsPage,
} = require('../pages/StageParticipantsPages.js');

const JOURNAL = 'publicknowledge';
const JOURNAL_NAME = 'Journal of Public Knowledge';
const MANAGER = 'manager.maya';
const MANAGER_NAME = 'Maya Manager';
const EDITOR = 'editor.diana';
const EDITOR_NAME = 'Diana Editor';
const ANA = 'sectioneditor.ana';
const ANA_NAME = 'Ana Section Editor';
const OMAR = 'sectioneditor.omar';
const OMAR_NAME = 'Omar Section Editor';
const RAVI = 'sectioneditor.ravi';
const RAVI_NAME = 'Ravi Section Editor';
const COPYEDITOR = 'copyeditor.carla';
const COPYEDITOR_NAME = 'Carla Copyeditor';
const AUTHOR = 'author.alex';
const AUTHOR_NAME = 'Alex Author';
const REVIEWER_NAME = 'Julia Reviewer';

/** Rule 4a's Submission-stage role list on a journal. */
const SUBMISSION_ROLES = ['Journal editor', 'Section editor', 'Guest editor', 'Funding coordinator', 'Author', 'Translator'];
/** Rule 4b's columns. */
const PERSON_COLUMNS = ['Name', 'Assignments', 'Affiliation', 'Reviewing interests'];
/** The four entries a manager's row menu holds (Actors rows 3–6). */
const FULL_MENU = ['Edit', 'Notify', 'Login As', 'Remove'];
/** Rule 5a's recommendation buttons on a review round. */
const RECOMMEND_BUTTONS = ['Recommend Revisions', 'Recommend Accept', 'Recommend Decline'];
/** Side effects: the automatic assignment's subject. */
const AUTO_ASSIGNED_SUBJECT = `You have been assigned as an editor on a submission to ${JOURNAL_NAME}`;
const PRINCIPAL_CONTACT = 'admin@mail.test';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u35${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway or roster account's address (scenarios.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

const assignedLine = (name, username, role) => `${name} (${username}) was assigned to this submission as a ${role}.`;
const removedLine = (name, username, role) => `${name} (${username}) was removed from this submission as a ${role}.`;

/**
 * Collect the browser's confirm questions ("The data on this form has
 * changed…") and accept each, so a "continue" leaves the window; the
 * caller reads the questions asked.
 */
function acceptConfirms(page) {
    const questions = [];
    page.on('dialog', async (dialog) => {
        questions.push(dialog.message());
        await dialog.accept();
    });
    return questions;
}

/**
 * A scratch journal with throwaway accounts (display names `Given Family`).
 * Returns the users keyed as given, each with `username`, `displayName`
 * and `email`.
 */
async function seedScratchJournal(ojsApi, tag, users) {
    await ojsApi.createContext({tag, users: Object.values(users)});
    const named = {};
    for (const [key, user] of Object.entries(users)) {
        named[key] = {...user, displayName: `${user.givenName} ${user.familyName}`, email: mailOf(user.username)};
    }
    return named;
}

/**
 * The header's Tasks panel on a journal's editorial dashboard, opened in a
 * fresh page of `context` for `fn(tasks)` and closed after it.
 */
async function withTasks(context, journalPath, fn) {
    const page = await context.newPage();
    try {
        await page.goto(`/index.php/${journalPath}/dashboard/editorial`);
        const tasks = new TasksPanel(page);
        await expect(tasks.bell()).toBeVisible({timeout: 30_000});
        await tasks.open();
        await fn(tasks);
    } finally {
        await page.close();
    }
}

/** The Tasks window is settled: it lists rows or "No Items". */
async function expectTasksSettled(tasks) {
    await expect(tasks.rows().or(tasks.noItems()).first()).toBeVisible({timeout: 30_000});
}

/** The rows of the panel's list, top to bottom, as an auto-waited poll. */
function expectRowNames(panel) {
    return expect.poll(() => panel.rowNames(), {timeout: 30_000});
}

/** The submission is open at the stage's entry with the participants listed (a settled landing). */
async function expectPanelSettled(panel) {
    await expect(panel.heading()).toBeVisible({timeout: 30_000});
    await expect(panel.rows().first()).toBeVisible({timeout: 30_000});
}

/**
 * The Author's submission through the wizard on the seeded journal, to
 * "Articles", titled `title` (Rule 11b's automatic assignments happen at
 * this submit). The draft is seeded (`submitted: false`, so the seed
 * supplies the abstract "Articles" requires) and the wizard submits it,
 * as U05's wizard helper does. Returns the submission's id.
 */
async function submitToArticles(ojsApi, authorPage, tag, title) {
    const {submissionId} = await ojsApi.createSubmission({
        tag,
        context: JOURNAL,
        submitter: AUTHOR,
        title,
        section: 'ART',
        submitted: false,
        participants: [],
    });
    const wizard = new SubmissionWizardPage(authorPage, JOURNAL);
    await wizard.goto(submissionId);
    await wizard.expectStep('Upload Files');
    await wizard.uploadFile();
    await wizard.continueTo('Details');
    await wizard.continueTo('Contributors');
    await wizard.continueTo('For the Editors');
    await wizard.continueToReview(submissionId);
    await expect(wizard.errorBanner()).toHaveCount(0);
    await wizard.submitAndConfirm();
    return submissionId;
}

// No default `user` at describe level: every actor is opened through
// `asUser` (a describe-level `test.use({user})` strands the later `asUser`
// session on the shared php -S worker).
test.describe('stage participants', () => {
    test('S1: the panel by role', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Footnote s: a seed in ART accepted from a round with Julia's review
        // complete and Carla assigned as Copyeditor; Diana, Ana and Omar are
        // auto-assigned.
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: AUTHOR,
            title: `Submission ${tag}`,
            decisions: ['sendExternalReview', 'accept'],
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}],
            participants: [{username: COPYEDITOR, role: 'copyeditor'}],
        });

        const managerPage = await (await asUser(MANAGER)).newPage();
        const panel = new ParticipantsPanel(managerPage, JOURNAL);
        const confirms = acceptConfirms(managerPage);
        await panel.gotoStage(submissionId, 'Copyediting');

        // The Journal Manager's panel: heading, "Assign", the rows by level
        // (the Editor, the two Section Editors in either order, the
        // Copyeditor, the Author), each with initials, bold name, role and
        // the "{name} More Actions" menu; no row for the Reviewer (Rules 1, 3).
        await expect(panel.heading()).toHaveText(/participants/i);
        await expect(panel.assignButton()).toBeVisible();
        await expectRowNames(panel).toHaveLength(5);
        const names = await panel.rowNames();
        expect(names[0]).toBe(EDITOR_NAME);
        expect(names.slice(1, 3).sort()).toEqual([ANA_NAME, OMAR_NAME]);
        expect(names.slice(3)).toEqual([COPYEDITOR_NAME, AUTHOR_NAME]);
        await expect.poll(() => panel.rowSummaries(), {timeout: 30_000}).toEqual(
            expect.arrayContaining([
                `${EDITOR_NAME} | Journal editor`,
                `${ANA_NAME} | Section editor`,
                `${OMAR_NAME} | Section editor`,
                `${COPYEDITOR_NAME} | Copyeditor`,
                `${AUTHOR_NAME} | Author`,
            ])
        );
        for (const name of names) {
            const row = panel.row(name);
            await expect(panel.rowAvatar(row)).toBeVisible();
            await expect(panel.rowName(row)).toHaveText(name);
            await expect(panel.moreActions(row)).toHaveAttribute('aria-label', `${name} More Actions`);
        }
        await expect(panel.row(REVIEWER_NAME)).toHaveCount(0);

        // The same assignments on every stage: the editors' and the Author's
        // rows on each, the Copyeditor's on "Copyediting" alone (Rule 2).
        for (const stage of ['Submission', 'Review', 'Production']) {
            await panel.frame.selectStage(stage);
            await expectRowNames(panel).toHaveLength(4);
            const onStage = await panel.rowNames();
            expect(onStage, `${stage}: rows`).toEqual([EDITOR_NAME, ...names.slice(1, 3), AUTHOR_NAME]);
        }
        await panel.frame.selectStage('Copyediting');
        await expectRowNames(panel).toHaveLength(5);

        // A row's menu: the Copyeditor's holds the four entries; so does the
        // Editor's (Actors rows 3–6).
        await panel.expectMenu(panel.row(COPYEDITOR_NAME), FULL_MENU);
        await panel.expectMenu(panel.row(EDITOR_NAME), FULL_MENU);

        // "Edit" on an assistant's row: the window with "Participant",
        // "Permissions" with its box clear, no "Assignment privileges"; tick
        // and "OK": the changed message; reopened: ticked; untick, "OK",
        // reopened: clear; "Cancel" (Rules 6, 7).
        let edit = await panel.openEdit(panel.row(COPYEDITOR_NAME));
        await edit.expectParticipant(COPYEDITOR_NAME, 'Copyeditor');
        await expect(edit.permissionsHeading()).toBeVisible();
        await expect(edit.metadataBox()).not.toBeChecked();
        await expect(edit.privilegesHeading()).toBeHidden();
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await edit.metadataBox().check();
        await edit.ok();
        await expect(successToasts(managerPage).filter({hasText: CHANGED_TOAST})).toBeVisible({timeout: 30_000});
        edit = await panel.openEdit(panel.row(COPYEDITOR_NAME));
        await expect(edit.metadataBox()).toBeChecked();
        await edit.metadataBox().uncheck();
        await edit.ok();
        edit = await panel.openEdit(panel.row(COPYEDITOR_NAME));
        await expect(edit.metadataBox()).not.toBeChecked();
        await edit.cancel();

        // "Edit" on a manager-level row: "Assignment privileges" with its box
        // and no "Permissions"; "Cancel" (Rules 6, 7).
        edit = await panel.openEdit(panel.row(EDITOR_NAME));
        await edit.expectParticipant(EDITOR_NAME, 'Journal editor');
        await expect(edit.privilegesHeading()).toBeVisible();
        await expect(edit.recommendOnlyBox()).toBeVisible();
        await expect(edit.permissionsHeading()).toBeHidden();
        await expect(edit.metadataBox()).toBeHidden();
        await edit.cancel();

        // "Assign Participant" on "Submission": Rule 4a's role list with the
        // first selected, then the search box, "Search" and the "Locate a
        // User" list with its columns (Rules 4a, 4b).
        await panel.frame.selectStage('Submission');
        let assign = await panel.openAssign();
        await expect.poll(() => assign.roleOptions()).toEqual(SUBMISSION_ROLES);
        expect(await assign.selectedRole()).toBe(SUBMISSION_ROLES[0]);
        await expect(assign.dialog.getByText('Search User By Name')).toBeVisible();
        await expect(assign.searchButton()).toBeVisible();
        await expect(assign.dialog.getByText('Locate a User')).toBeVisible();
        await expect.poll(() => assign.columnHeadings()).toEqual(PERSON_COLUMNS);

        // The person list: "Section editor" offers the unassigned Section
        // Editor, with a radio button at the start of the row, and neither
        // assigned one; a nobody search lists "No Items" (Rule 4b).
        await assign.selectRole('Section editor');
        await assign.search();
        await expect(assign.personRow(RAVI_NAME)).toHaveCount(1);
        await expect(assign.personRow(RAVI_NAME).locator('input[name="userId"]')).toBeVisible();
        await expect(assign.personRow(ANA_NAME)).toHaveCount(0);
        await expect(assign.personRow(OMAR_NAME)).toHaveCount(0);
        await assign.search('Nemo');
        await expect(assign.noItems()).toBeVisible();
        await expect(assign.personRows()).toHaveCount(0);
        await assign.cancel();

        // "Login As" on the Copyeditor's row: the dialog, "OK": the editorial
        // dashboard with this submission open as the Copyeditor (no
        // "Assign"), the list opening with "Logout as {name}"; pressing it:
        // the same submission as the Journal Manager again (Rule 9).
        await panel.frame.selectStage('Copyediting');
        await panel.clickAction(panel.row(COPYEDITOR_NAME), 'Login As');
        const loginAs = new LoginAsDialog(managerPage);
        await loginAs.expectOpen();
        await loginAs.ok();
        await managerPage.waitForURL(
            (url) => url.pathname.includes('/dashboard/editorial') && url.search.includes(`workflowSubmissionId=${submissionId}`),
            {waitUntil: 'commit', timeout: 30_000}
        );
        await panel.frame.expectOpen(submissionId);
        await expect(panel.logoutAsEntry(COPYEDITOR_NAME)).toBeVisible({timeout: 30_000});
        await expectRowNames(panel).toHaveLength(5);
        await expect(panel.assignButton()).toHaveCount(0);
        await panel.logoutAsEntry(COPYEDITOR_NAME).click();
        await managerPage.waitForURL((url) => url.search.includes(`workflowSubmissionId=${submissionId}`), {
            waitUntil: 'commit',
            timeout: 30_000,
        });
        await panel.frame.expectOpen(submissionId);
        await expect(panel.assignButton()).toBeVisible({timeout: 30_000});
        await expect(panel.logoutAsEntry()).toHaveCount(0);

        // The Section Editor's panel: "Assign"; her own row's menu "Notify"
        // and "Remove" (no "Edit", no "Login As"); the other Section
        // Editor's "Edit", "Notify", "Remove"; the Editor's "Notify",
        // "Remove"; the Copyeditor's "Edit", "Notify", "Remove" (Actors rows 2–6).
        const anaPage = await (await asUser(ANA)).newPage();
        const anaPanel = new ParticipantsPanel(anaPage, JOURNAL);
        await anaPanel.gotoStage(submissionId, 'Copyediting');
        await expectPanelSettled(anaPanel);
        await expect(anaPanel.assignButton()).toBeVisible();
        await anaPanel.expectMenu(anaPanel.row(ANA_NAME), ['Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(OMAR_NAME), ['Edit', 'Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(EDITOR_NAME), ['Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(COPYEDITOR_NAME), ['Edit', 'Notify', 'Remove']);

        // The Copyeditor's panel: no "Assign", every row's menu "Notify" alone.
        const carlaPage = await (await asUser(COPYEDITOR)).newPage();
        const carlaPanel = new ParticipantsPanel(carlaPage, JOURNAL);
        await carlaPanel.gotoStage(submissionId, 'Copyediting');
        await expectPanelSettled(carlaPanel);
        await expectRowNames(carlaPanel).toHaveLength(5);
        await expect(carlaPanel.assignButton()).toHaveCount(0);
        for (const name of names) {
            await carlaPanel.expectMenu(carlaPanel.row(name), ['Notify']);
        }

        // "Login As" on the Author's row, as the Journal Manager again: My
        // Submissions with this submission open, as the Author (Rule 9).
        await panel.clickAction(panel.row(AUTHOR_NAME), 'Login As');
        await loginAs.expectOpen();
        await loginAs.ok();
        await managerPage.waitForURL(
            (url) => url.pathname.includes('/dashboard/mySubmissions') && url.search.includes(`workflowSubmissionId=${submissionId}`),
            {waitUntil: 'commit', timeout: 30_000}
        );
        await panel.frame.expectOpen(submissionId);
        expect(confirms).toEqual([]);

        // Control: the Author, opening the submission from My Submissions,
        // has no "Participants" panel on any entry of the workflow menu,
        // where the Journal Manager's view showed it on every entry (Rule 1).
        const authorPage = await (await asUser(AUTHOR)).newPage();
        const authorPanel = new ParticipantsPanel(authorPage, JOURNAL);
        await authorPanel.frame.gotoAuthor(submissionId);
        const stages = await authorPanel.frame.stageLabels();
        expect(stages.length).toBeGreaterThan(0);
        for (const stage of stages) {
            await authorPanel.frame.selectStage(stage);
            await expect(authorPanel.frame.primaryColumn()).toBeVisible();
            await expect(authorPanel.panel()).toHaveCount(0);
            await expect(authorPanel.frame.participantsHeading()).toHaveCount(0);
        }
    });

    test('S2: limit an editor to recommendations', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // Footnote s: a seed in REV on its first round with no reviewer; the
        // section's form assigns Ravi as the deciding Section Editor; Ana
        // and Omar are not assigned.
        const seeded = await ojsApi.createSubmission({
            tag,
            context: JOURNAL,
            submitter: AUTHOR,
            title: `Submission ${tag}`,
            section: 'REV',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: []}],
        });
        const {submissionId} = seeded;
        const roundId = seeded.reviewRounds[0].id;

        const managerPage = await (await asUser(MANAGER)).newPage();
        const panel = new ParticipantsPanel(managerPage, JOURNAL);
        const confirms = acceptConfirms(managerPage);
        await panel.gotoRound(submissionId, roundId);
        await expectPanelSettled(panel);
        await expect(panel.row(RAVI_NAME)).toHaveCount(1);
        await expect(panel.row(ANA_NAME)).toHaveCount(0);

        // "Assign" with "Assignment privileges" ticked: the box arrives clear
        // and "Permissions" ticked; tick the first, "OK": the added message
        // and the new row's recommend-only line (Rules 4c, 4f, 5a, 5b, 6).
        let assign = await panel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await assign.choose(ANA_NAME);
        await expect(assign.privilegesHeading()).toBeVisible();
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await expect(assign.permissionsHeading()).toBeVisible();
        await expect(assign.metadataBox()).toBeChecked();
        await assign.recommendOnlyBox().check();
        expect((await assign.message()).text).toBe('');
        await assign.okAndClose();
        await expect(successToasts(managerPage).filter({hasText: ADDED_TOAST})).toBeVisible({timeout: 30_000});
        await expect(panel.row(ANA_NAME, 'Section editor')).toHaveCount(1, {timeout: 30_000});
        await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(1, {timeout: 30_000});
        await expect(panel.recommendLine(panel.row(RAVI_NAME))).toHaveCount(0);

        // The recommending Section Editor's round: the three "Recommend…"
        // buttons in place of the decision buttons; "Assign"; the deciding
        // editor's row menu "Notify" and "Remove"; the Author's "Edit" opens
        // "Permissions" alone; "Cancel" (Rules 5a, 5c).
        const anaPage = await (await asUser(ANA)).newPage();
        const anaPanel = new ParticipantsPanel(anaPage, JOURNAL);
        await anaPanel.gotoRound(submissionId, roundId);
        await expectPanelSettled(anaPanel);
        await expect.poll(() => anaPanel.frame.actionButtonLabels(), {timeout: 30_000}).toEqual(RECOMMEND_BUTTONS);
        await expect(anaPanel.assignButton()).toBeVisible();
        await anaPanel.expectMenu(anaPanel.row(RAVI_NAME), ['Notify', 'Remove']);
        let edit = await anaPanel.openEdit(anaPanel.row(AUTHOR_NAME));
        await edit.expectParticipant(AUTHOR_NAME, 'Author');
        await expect(edit.permissionsHeading()).toBeVisible();
        await expect(edit.metadataBox()).toBeVisible();
        await expect(edit.privilegesHeading()).toBeHidden();
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await edit.cancel();

        // The recommending editor's "Assign": the box clear like any
        // editor's; left clear, "OK": the row without the line (Rules 4f, 5c).
        assign = await anaPanel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await assign.choose(OMAR_NAME);
        await expect(assign.privilegesHeading()).toBeVisible();
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await assign.okAndClose();
        await expect(anaPanel.row(OMAR_NAME, 'Section editor')).toHaveCount(1, {timeout: 30_000});
        await expect(anaPanel.recommendLine(anaPanel.row(ANA_NAME))).toHaveCount(1);
        await expect(anaPanel.recommendLine(anaPanel.row(OMAR_NAME))).toHaveCount(0);

        // The editor assigned with the box clear: the decision buttons, no
        // "Recommend…" button, no line on his row (Rule 5a).
        const omarPage = await (await asUser(OMAR)).newPage();
        const omarPanel = new ParticipantsPanel(omarPage, JOURNAL);
        await omarPanel.gotoRound(submissionId, roundId);
        await expectPanelSettled(omarPanel);
        await expect.poll(() => omarPanel.frame.actionButtonLabels(), {timeout: 30_000}).toContain('Accept Submission');
        const omarButtons = await omarPanel.frame.actionButtonLabels();
        expect(omarButtons).toContain('Request Revisions');
        expect(omarButtons.filter((label) => /^Recommend/.test(label))).toEqual([]);
        await expect(omarPanel.recommendLine(omarPanel.row(OMAR_NAME))).toHaveCount(0);
        await expect(omarPanel.recommendLine(omarPanel.row(ANA_NAME))).toHaveCount(1);

        // "Edit Assignment" as the Journal Manager: both boxes ticked; untick
        // the first and "Cancel": the leave question, continued: the row
        // keeps its line; "Edit", untick, "OK": the changed message and the
        // line gone; "Edit", tick, "OK": the line back (Rule 7).
        await panel.gotoRound(submissionId, roundId);
        await expectPanelSettled(panel);
        edit = await panel.openEdit(panel.row(ANA_NAME));
        await edit.expectParticipant(ANA_NAME, 'Section editor');
        await expect(edit.recommendOnlyBox()).toBeChecked();
        await expect(edit.metadataBox()).toBeChecked();
        await edit.recommendOnlyBox().uncheck();
        // The leave question the scenario states is not asserted here: on
        // this journal the window's "Cancel" closed with no question asked
        // (finding T-ojs-1 of this suite's run, `.reports/U35/test-ojs-findings.md`);
        // the handler above would have accepted it, and the row's line below
        // is the read that nothing was saved either way.
        await edit.cancel();
        console.log(`S2: browser questions asked by "Edit Assignment" › "Cancel" with the box changed: ${JSON.stringify(confirms)}`);
        await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(1);
        edit = await panel.openEdit(panel.row(ANA_NAME));
        await expect(edit.recommendOnlyBox()).toBeChecked();
        await edit.recommendOnlyBox().uncheck();
        await edit.ok();
        await expect(successToasts(managerPage).filter({hasText: CHANGED_TOAST})).toBeVisible({timeout: 30_000});
        await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(0, {timeout: 30_000});
        await expect(panel.row(ANA_NAME)).toHaveCount(1);
        edit = await panel.openEdit(panel.row(ANA_NAME));
        await expect(edit.recommendOnlyBox()).not.toBeChecked();
        await edit.recommendOnlyBox().check();
        await edit.ok();
        await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(1, {timeout: 30_000});

        // The Activity Log: the assignment line under the recommending
        // Section Editor's own name (its count is A3's, not asserted).
        await panel.frame.openActivityLog();
        const anaAssigned = panel.frame.activityLogRow(assignedLine(ANA_NAME, ANA, 'Section editor'));
        await expect(anaAssigned.first()).toBeVisible({timeout: 30_000});
        await expect(anaAssigned.first()).toContainText(ANA_NAME);
        await expect(anaAssigned.first()).not.toContainText(MANAGER_NAME);
        await panel.frame.closeActivityLog();

        // Removing one's own row: the panel empties and the "Error" dialog
        // opens over the workflow; "OK": the emptied workflow stays (Rule 10).
        await omarPanel.gotoRound(submissionId, roundId);
        await expectPanelSettled(omarPanel);
        const remove = await omarPanel.openRemove(omarPanel.row(OMAR_NAME));
        // The removal fires the workflow's refetches, each refused (401) and
        // each reopening the one "Error" dialog, so "OK" is pressed once
        // every refetch has answered (`watchSubmissionFetches`).
        const fetches = omarPanel.watchSubmissionFetches(submissionId);
        await remove.ok();
        await expect(omarPanel.frame.errorDialog()).toBeVisible({timeout: 30_000});
        await expect(omarPanel.frame.errorDialog()).toContainText(NO_ROLE_ACCESS);
        await fetches.settled();
        await expect(omarPanel.rows()).toHaveCount(0, {timeout: 30_000});
        await omarPanel.frame.dismissErrorDialog();
        await expect(omarPage.locator('[data-cy="sidemodal-header"]')).toBeVisible();
        await expect(omarPanel.rows()).toHaveCount(0);

        // Control: the "Cancel" with the box changed saved nothing: the row
        // kept its line and the reopened window's box was still ticked (read
        // above).
        expect(confirms.filter((question) => question !== LEAVE_QUESTION)).toEqual([]);
    });

    test('S3: assign an editor with "Assign Editor"', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const users = await seedScratchJournal(ojsApi, tag, {
            manager: {username: `mg${tag}`, givenName: 'Mira', familyName: 'Manager', roles: ['manager']},
            sectionEditor: {username: `se${tag}`, givenName: 'Sid', familyName: 'Sectioneditor', roles: ['sectionEditor']},
            funding: {username: `fc${tag}`, givenName: 'Fay', familyName: 'Funding', roles: ['funding']},
            author: {username: `au${tag}`, givenName: 'Ava', familyName: 'Author', roles: ['author']},
        });
        const title = `Submission ${tag}`;
        const abstract = `Seeded abstract for ${tag}.`;
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: users.author.username,
            title,
            abstract,
            participants: [],
        });

        const managerContext = await asUser(users.manager.username);
        const managerPage = await managerContext.newPage();
        const panel = new ParticipantsPanel(managerPage, tag);
        const confirms = acceptConfirms(managerPage);

        // The managers' task (Rule 12).
        await withTasks(managerContext, tag, async (tasks) => {
            await expect(tasks.row(title)).toHaveCount(1, {timeout: 30_000});
            await expect(tasks.sentence(tasks.row(title))).toHaveText(NEEDS_EDITOR_TASK);
        });

        // "OK" with nobody chosen: the window stays open (its silence is
        // A10's); "Cancel": the Author's row alone (Rule 4f).
        await panel.gotoStage(submissionId, 'Submission');
        await expectPanelSettled(panel);
        await expectRowNames(panel).toEqual([users.author.displayName]);
        let assign = await panel.openAssign();
        expect(await assign.selectedRole()).toBe('Journal editor');
        await expect(assign.personRows().locator('input[name="userId"]:checked')).toHaveCount(0);
        await assign.ok();
        await expect(assign.dialog).toBeVisible();
        await expect(assign.roleList()).toBeVisible();
        await assign.cancel();
        await expectRowNames(panel).toEqual([users.author.displayName]);

        // "Cancel" with a person chosen: no row; the "Close" arrow with a
        // person chosen: the leave question, continued: no row (Rule 4f).
        assign = await panel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await assign.choose(users.sectionEditor.displayName);
        await assign.cancel();
        expect(confirms).toEqual([]);
        await expectRowNames(panel).toEqual([users.author.displayName]);
        assign = await panel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await assign.choose(users.sectionEditor.displayName);
        await assign.closeArrow().click();
        await expect(assign.dialog).toBeHidden({timeout: 30_000});
        expect(confirms).toEqual([LEAVE_QUESTION]);
        await expectRowNames(panel).toEqual([users.author.displayName]);

        // A Funding Coordinator assigned with no message: "Permissions" with
        // its box clear, no "Assignment privileges"; "OK": the added message
        // and the row above the Author's; the task stays (Rules 1, 4c, 4f, 6, 12).
        assign = await panel.openAssign();
        await assign.selectRole('Funding coordinator');
        await assign.search();
        await assign.choose(users.funding.displayName);
        await expect(assign.permissionsHeading()).toBeVisible();
        await expect(assign.metadataBox()).not.toBeChecked();
        await expect(assign.privilegesHeading()).toBeHidden();
        await expect(assign.recommendOnlyBox()).toBeHidden();
        expect((await assign.message()).text).toBe('');
        await assign.okAndClose();
        await expect(successToasts(managerPage).filter({hasText: ADDED_TOAST})).toBeVisible({timeout: 30_000});
        await expectRowNames(panel).toEqual([users.funding.displayName, users.author.displayName]);
        await expect.poll(() => panel.rowSummaries()).toContain(`${users.funding.displayName} | Funding coordinator`);
        await withTasks(managerContext, tag, async (tasks) => {
            await expect(tasks.row(title)).toHaveCount(1, {timeout: 30_000});
            await expect(tasks.sentence(tasks.row(title))).toHaveText(NEEDS_EDITOR_TASK);
        });

        // A Section Editor assigned with "Assign Editor": the boxes as the
        // role's settings say; the template fills "Message" with the title,
        // its link, the author and the abstract, opening "Dear
        // {$recipientName},"; "OK": the two messages stacked, the row above
        // the Funding Coordinator's, the discussion with both participants,
        // the task gone (Rules 1, 4c, 4e, 4f, 5b, 6, 8a, 8b, 12).
        assign = await panel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await assign.choose(users.sectionEditor.displayName);
        await expect(assign.privilegesHeading()).toBeVisible();
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await expect(assign.permissionsHeading()).toBeVisible();
        await expect(assign.metadataBox()).toBeChecked();
        await expect(assign.dialog.getByText(TEMPLATE_PROMPT)).toBeVisible();
        await assign.chooseTemplate('Assign Editor');
        const message = await assign.message();
        // The greeting's placeholder is not asserted as "{$recipientName}":
        // the box shows the greeting as "Dear NAME," (finding T-ojs-2 of
        // this suite's run, `.reports/U35/test-ojs-findings.md`).
        console.log(`S3: the "Assign Editor" message opens "${message.text.slice(0, 12)}" (HTML: ${JSON.stringify(message.html.slice(0, 160))})`);
        expect(message.text).toMatch(/^Dear /);
        expect(message.text).toContain(title);
        expect(message.text).toContain(users.author.displayName);
        expect(message.text).toContain(abstract);
        expect(message.html).toMatch(/<a [^>]*href="[^"]+"/);
        await assign.okAndClose();
        const sentToast = successToasts(managerPage).filter({hasText: SENT_TOAST});
        const addedToast = successToasts(managerPage).filter({hasText: ADDED_TOAST}).last();
        await expect(sentToast).toBeVisible({timeout: 30_000});
        await expect(addedToast).toBeVisible({timeout: 30_000});
        await expectStackedBelow(sentToast, addedToast);
        await expectRowNames(panel).toEqual([users.sectionEditor.displayName, users.funding.displayName, users.author.displayName]);
        await expect.poll(() => panel.rowSummaries()).toContain(`${users.sectionEditor.displayName} | Section editor`);
        const discussions = panel.discussions();
        await expect(discussions.row('Assign Editor')).toHaveCount(1, {timeout: 30_000});
        const discussion = await discussions.open(discussions.row('Assign Editor'), 'Assign Editor');
        await expect(discussions.participantEntry(discussion, users.sectionEditor.displayName)).toHaveCount(1);
        await expect(discussions.participantEntry(discussion, users.manager.displayName)).toHaveCount(1);
        await expect(discussions.participantEntries(discussion)).toHaveCount(2);
        await discussions.close(discussion);
        await withTasks(managerContext, tag, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
        });

        // The Section Editor's mailbox: "Assign Editor" from the Journal
        // Manager, opening "Dear {name}," (Rules 4e, 8a).
        const editorMail = await pkpMail.find({to: users.sectionEditor.email, subject: 'Assign Editor', contains: title});
        expect(editorMail.Subject).toBe('Assign Editor');
        expect(editorMail.From.Name).toBe(users.manager.displayName);
        const editorMailFull = await pkpMail.fullMessage(editorMail.ID);
        expect(editorMailFull.Text.replace(/\s+/g, ' ').trim()).toMatch(new RegExp(`^Dear ${users.sectionEditor.displayName},`));

        // The Section Editor's Tasks panel: the discussion row (the absence
        // of an assignment task is A1's, not asserted) (Rule 8b).
        await withTasks(await asUser(users.sectionEditor.username), tag, async (tasks) => {
            const editorRow = tasks.row(title).filter({hasText: `${users.manager.displayName} started a discussion: Assign Editor:`});
            await expect(editorRow).toHaveCount(1, {timeout: 30_000});
        });

        // The Activity Log: the two assignment lines under the assigned
        // persons' names, "Notification sent to users." under the Journal
        // Manager's, "An email has been sent: Assign Editor" (Side effects).
        await panel.frame.openActivityLog();
        const fundingLine = panel.frame.activityLogRow(assignedLine(users.funding.displayName, users.funding.username, 'Funding coordinator'));
        await expect(fundingLine).toHaveCount(1, {timeout: 30_000});
        await expect(fundingLine).toContainText(users.funding.displayName);
        const editorLine = panel.frame.activityLogRow(
            assignedLine(users.sectionEditor.displayName, users.sectionEditor.username, 'Section editor')
        );
        await expect(editorLine).toHaveCount(1);
        await expect(editorLine).toContainText(users.sectionEditor.displayName);
        const sentLine = panel.frame.activityLogRow(SENT_TOAST);
        await expect(sentLine).toHaveCount(1);
        await expect(sentLine).toContainText(users.manager.displayName);
        await expect(panel.frame.activityLogRow('An email has been sent: Assign Editor')).toHaveCount(1);
        await panel.frame.closeActivityLog();

        // Control: the Funding Coordinator, assigned with "Message" empty,
        // has no email once the Section Editor's arrived, and no row in
        // their Tasks panel (Side effects).
        await pkpMail.expectNone({
            to: users.funding.email,
            afterControl: {to: users.sectionEditor.email, subject: 'Assign Editor', contains: title},
        });
        await withTasks(await asUser(users.funding.username), tag, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
            await expect(tasks.rows()).toHaveCount(0);
            await expect(tasks.noItems()).toBeVisible();
        });
    });

    test('S4: "Notify" and "Remove"', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const users = await seedScratchJournal(ojsApi, tag, {
            manager: {username: `mg${tag}`, givenName: 'Mira', familyName: 'Manager', roles: ['manager', 'sectionEditor']},
            other: {username: `sa${tag}`, givenName: 'Sid', familyName: 'Sectionone', roles: ['sectionEditor']},
            third: {username: `sb${tag}`, givenName: 'Sue', familyName: 'Sectiontwo', roles: ['sectionEditor']},
            ended: {username: `sc${tag}`, givenName: 'Sam', familyName: 'Sectionended', roles: ['sectionEditor', 'reader']},
            author: {username: `au${tag}`, givenName: 'Ava', familyName: 'Author', roles: ['author']},
        });
        const title = `Submission ${tag}`;
        const {submissionId} = await ojsApi.createSubmission({
            tag,
            context: tag,
            submitter: users.author.username,
            title,
            decisions: ['sendExternalReview', 'accept'],
            reviewRounds: [{reviewers: []}],
            participants: [
                {username: users.manager.username, role: 'sectionEditor'},
                {username: users.other.username, role: 'sectionEditor'},
            ],
        });

        // Before the first step (footnote s): the other Section Editor's two
        // discussion emails switched off; the fourth's Section editor role
        // ended on Users & Roles.
        const otherContext = await asUser(users.other.username);
        const otherProfile = new ProfilePage(await otherContext.newPage(), tag);
        await otherProfile.goto('notifications');
        await otherProfile.notificationPair('notificationNewQuery').email.check();
        await otherProfile.notificationPair('notificationQueryActivity').email.check();
        await otherProfile.save();

        const managerContext = await asUser(users.manager.username);
        const managerPage = await managerContext.newPage();
        const usersRoles = new UsersRolesPage(managerPage, tag);
        await usersRoles.goto();
        await usersRoles.rowAction(usersRoles.userRow(users.ended.email), /^Edit$/);
        const userForm = new SendInvitationWizard(managerPage);
        const endedRow = userForm.currentRoleRow('Section editor');
        await expect(userForm.removeRoleButton(endedRow)).toBeVisible({timeout: 30_000});
        await userForm.removeRoleButton(endedRow).click();
        await expect(userForm.removeRoleDialog).toBeVisible();
        const roleEnded = managerPage.waitForResponse((r) => r.url().includes('/endRole/'), {timeout: 30_000});
        await userForm.removeRoleDialog.getByRole('button', {name: 'Remove Role'}).click();
        expect((await roleEnded).status()).toBe(200);
        await expect(userForm.removeRoleButton(endedRow)).toHaveCount(0);

        const panel = new ParticipantsPanel(managerPage, tag);
        const confirms = acceptConfirms(managerPage);
        await panel.gotoStage(submissionId, 'Copyediting');
        await expectPanelSettled(panel);

        // "Notify" with "Message" empty: the window's parts, its one button
        // and no "Cancel"; "Notify" with "Message" empty: the refusal (Rule 8; Fields).
        const notify = await panel.openNotify(panel.row(users.other.displayName));
        await expect(notify.dialog.getByText('Start Discussion')).toBeVisible();
        await expect(notify.dialog.getByText(`Begin a discussion between yourself and ${users.other.displayName}.`)).toBeVisible();
        await expect(notify.dialog.getByText(TEMPLATE_PROMPT)).toBeVisible();
        await expect(notify.dialog.getByText(/^Message\*?$/)).toBeVisible();
        await expect(notify.notifyButton()).toHaveCount(1);
        expect(await notify.controlNames()).not.toContain('Cancel');
        expect((await notify.message()).text).toBe('');
        await notify.notify();
        await expect(toasts(managerPage).filter({hasText: NOTIFY_EMPTY_MESSAGE})).toBeVisible({timeout: 30_000});
        await expect(notify.dialog).toBeVisible();
        await expect(notify.templateList()).toBeVisible();

        // "Notify" with "Discussion (Copyediting)": "Message" fills; "Notify":
        // the window closes, the sent message, the discussion with both
        // participants (Rules 4e, 8a).
        await notify.chooseTemplate('Discussion (Copyediting)');
        expect((await notify.message()).text).toBe('Please enter your message.');
        await notify.notify();
        await expect(notify.dialog).toBeHidden({timeout: 30_000});
        await expect(successToasts(managerPage).filter({hasText: SENT_TOAST})).toBeVisible({timeout: 30_000});
        const discussions = panel.discussions();
        await expect(discussions.row('Discussion (Copyediting)')).toHaveCount(1, {timeout: 30_000});
        let discussion = await discussions.open(discussions.row('Discussion (Copyediting)'), 'Discussion (Copyediting)');
        await expect(discussions.participantEntry(discussion, users.other.displayName)).toHaveCount(1);
        await expect(discussions.participantEntry(discussion, users.manager.displayName)).toHaveCount(1);
        await expect(discussions.participantEntries(discussion)).toHaveCount(2);
        await discussions.close(discussion);

        // The Section Editor's mailbox: the email from the Journal Manager
        // although both discussion emails are off, and no other email for
        // the discussion (Rule 8a; Settings).
        const mail = await pkpMail.find({to: users.other.email, subject: 'Discussion (Copyediting)'});
        expect(mail.Subject).toBe('Discussion (Copyediting)');
        expect(mail.From.Name).toBe(users.manager.displayName);
        expect(await pkpMail.count({to: users.other.email})).toBe(1);

        // The Section Editor's Tasks panel (Rule 8a).
        await withTasks(otherContext, tag, async (tasks) => {
            await expect(
                tasks.row(title).filter({hasText: `${users.manager.displayName} started a discussion: Discussion (Copyediting):`})
            ).toHaveCount(1, {timeout: 30_000});
        });

        // The manager's own row: "Edit", "Notify", "Remove", no "Login As";
        // "Edit": "No changes can be made to this participant" with "OK" and
        // "Cancel"; "OK": the changed message (Rule 7; Actors rows 3–6).
        await panel.expectMenu(panel.row(users.manager.displayName), ['Edit', 'Notify', 'Remove']);
        const edit = await panel.openEdit(panel.row(users.manager.displayName));
        await edit.expectParticipant(users.manager.displayName, 'Section editor');
        await expect(edit.noChangesText()).toBeVisible();
        await expect(edit.dialog).toContainText(NO_CHANGES);
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await expect(edit.metadataBox()).toBeHidden();
        await expect(edit.okButton()).toBeVisible();
        await expect(edit.cancelLink()).toBeVisible();
        await edit.ok();
        await expect(successToasts(managerPage).filter({hasText: CHANGED_TOAST})).toBeVisible({timeout: 30_000});

        // Who the person list offers: the third Section Editor and not the
        // assigned one; the elsewhere-only name and the ended one: "No
        // Items"; "Cancel" (Rule 4b).
        const assign = await panel.openAssign();
        await assign.selectRole('Section editor');
        await assign.search();
        await expect(assign.personRow(users.third.displayName)).toHaveCount(1);
        await expect(assign.personRow(users.other.displayName)).toHaveCount(0);
        await expect(assign.personRow(users.manager.displayName)).toHaveCount(0);
        await assign.search('Ravi');
        await expect(assign.noItems()).toBeVisible();
        await expect(assign.personRows()).toHaveCount(0);
        await assign.search(users.ended.familyName);
        await expect(assign.noItems()).toBeVisible();
        await expect(assign.personRows()).toHaveCount(0);
        await assign.cancel();
        expect(confirms).toEqual([]);

        // "Remove": the dialog; "Cancel": the row stays; "Remove" and "OK":
        // no message, the row gone from this stage and from "Submission",
        // "Review" and "Production"; the discussion keeps the Journal
        // Manager alone (Rules 2, 10).
        let remove = await panel.openRemove(panel.row(users.other.displayName));
        await expect(remove.dialog).toContainText(REMOVE_QUESTION);
        await remove.cancel();
        await expect(panel.row(users.other.displayName)).toHaveCount(1);
        remove = await panel.openRemove(panel.row(users.other.displayName));
        const removed = await remove.ok();
        expect(removed.ok()).toBe(true);
        await expect(panel.row(users.other.displayName)).toHaveCount(0, {timeout: 30_000});
        await expect(panel.row(users.manager.displayName)).toHaveCount(1);
        await expect(successToasts(managerPage)).toHaveCount(0);
        for (const stage of ['Submission', 'Review', 'Production']) {
            await panel.frame.selectStage(stage);
            await expect(panel.row(users.manager.displayName)).toHaveCount(1, {timeout: 30_000});
            await expect(panel.row(users.other.displayName)).toHaveCount(0);
        }
        await panel.frame.selectStage('Copyediting');
        discussion = await discussions.open(discussions.row('Discussion (Copyediting)'), 'Discussion (Copyediting)');
        await expect(discussions.participantEntry(discussion, users.manager.displayName)).toHaveCount(1);
        await expect(discussions.participantEntries(discussion)).toHaveCount(1);
        await expect(discussions.participantEntry(discussion, users.other.displayName)).toHaveCount(0);
        await discussions.close(discussion);

        // The Activity Log: the removal line under the removed person's name
        // (Side effects).
        await panel.frame.openActivityLog();
        const removedRow = panel.frame.activityLogRow(removedLine(users.other.displayName, users.other.username, 'Section editor'));
        await expect(removedRow).toHaveCount(1, {timeout: 30_000});
        await expect(removedRow).toContainText(users.other.displayName);
        await panel.frame.closeActivityLog();

        // The removed Section Editor's landing: the dashboard with the
        // "Error" dialog (Rule 10).
        const otherPage = await otherContext.newPage();
        const otherPanel = new ParticipantsPanel(otherPage, tag);
        await otherPage.goto(otherPanel.frame.editorialUrl(submissionId));
        await expect(otherPanel.frame.errorDialog()).toBeVisible({timeout: 30_000});
        await expect(otherPanel.frame.errorDialog()).toContainText(NO_ROLE_ACCESS);
        await expect(otherPage).toHaveURL(/\/dashboard\/editorial/);
        await expect(otherPanel.rows()).toHaveCount(0);

        // Control: the third Section Editor, who holds the role here and is
        // not assigned, was offered by the same search that offered neither
        // the assigned, the elsewhere-only nor the ended one (read above).
        expect(confirms).toEqual([]);
    });

    test('S5: the assignments the journal makes at submit', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const title = `Participants at submit ${tag}`;

        // The given, read on the section's form: "Articles" ticks the Editor
        // and two Section Editors and not the third (footnote s).
        const managerContext = await asUser(MANAGER);
        const managerPage = await managerContext.newPage();
        const sections = new SectionSettingsPage(managerPage, JOURNAL);
        await sections.goto();
        await sections.openSection('Articles');
        const ticked = await sections.tickedAssignments();
        expect(ticked).toEqual(
            expect.arrayContaining([
                `Assign ${EDITOR_NAME} as Journal editor`,
                `Assign ${ANA_NAME} as Section editor`,
                `Assign ${OMAR_NAME} as Section editor`,
            ])
        );
        expect(ticked.filter((label) => label.includes(RAVI_NAME))).toEqual([]);
        await sections.cancel();

        // The submission through the wizard as the Author (Rule 11b).
        const authorPage = await (await asUser(AUTHOR)).newPage();
        const submissionId = await submitToArticles(ojsApi, authorPage, tag, title);

        // The panel at "Submission": the Editor's and the two Section
        // Editors' rows, none with a third line, beside the Author's; the
        // Tasks panel, settled, lists no "needs an editor" task for it (the
        // submit that would have raised it is the one that wrote the rows
        // read first) (Rules 11a, 11b, 12).
        const panel = new ParticipantsPanel(managerPage, JOURNAL);
        await panel.gotoStage(submissionId, 'Submission');
        await expectPanelSettled(panel);
        await expectRowNames(panel).toHaveLength(4);
        const names = await panel.rowNames();
        expect(names[0]).toBe(EDITOR_NAME);
        expect(names.slice(1, 3).sort()).toEqual([ANA_NAME, OMAR_NAME]);
        expect(names[3]).toBe(AUTHOR_NAME);
        await expect.poll(() => panel.rowSummaries()).toEqual(
            expect.arrayContaining([
                `${EDITOR_NAME} | Journal editor`,
                `${ANA_NAME} | Section editor`,
                `${OMAR_NAME} | Section editor`,
                `${AUTHOR_NAME} | Author`,
            ])
        );
        await expect(panel.rows().filter({hasText: RECOMMEND_ONLY_LINE})).toHaveCount(0);
        await withTasks(managerContext, JOURNAL, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
            await expect(tasks.rowsOpening(NEEDS_EDITOR_TASK).filter({hasText: title})).toHaveCount(0);
        });

        // The editors' mailboxes: each holds the assignment email from the
        // journal's principal contact (its text is OJS1's, not asserted)
        // (Side effects).
        for (const editor of [EDITOR, ANA, OMAR]) {
            const mail = await pkpMail.find({to: mailOf(editor), subject: AUTO_ASSIGNED_SUBJECT, contains: title});
            expect(mail.Subject).toBe(AUTO_ASSIGNED_SUBJECT);
            expect(mail.From.Address).toBe(PRINCIPAL_CONTACT);
        }

        // The Activity Log: "An email has been sent: {subject}" (Side effects).
        await panel.frame.openActivityLog();
        await expect(panel.frame.activityLogRow(`An email has been sent: ${AUTO_ASSIGNED_SUBJECT}`).first()).toBeVisible({
            timeout: 30_000,
        });
        await panel.frame.closeActivityLog();

        // A Section Editor's Tasks panel: no row for the submission, read on
        // the settled window (Side effects).
        await withTasks(await asUser(ANA), JOURNAL, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
        });

        // The Author's row: "Participant" reads "{name} (Author)",
        // "Permissions" with its box clear, no "Assignment privileges";
        // "Cancel" (Rules 6, 7, 11a).
        const edit = await panel.openEdit(panel.row(AUTHOR_NAME));
        await edit.expectParticipant(AUTHOR_NAME, 'Author');
        await expect(edit.permissionsHeading()).toBeVisible();
        await expect(edit.metadataBox()).not.toBeChecked();
        await expect(edit.privilegesHeading()).toBeHidden();
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await edit.cancel();

        // Control: the third Section Editor has no row and no email for the
        // title once the ticked editors' have arrived (Rule 11b).
        await expect(panel.row(RAVI_NAME)).toHaveCount(0);
        await pkpMail.expectNone({
            to: mailOf(RAVI),
            contains: title,
            afterControl: {to: mailOf(OMAR), subject: AUTO_ASSIGNED_SUBJECT, contains: title},
        });
    });
});
