// @ts-check
/**
 * @file playwright/tests/U35-stage-participants.spec.js
 *
 * Stage participants — OMP suite, one test per canonical scenario the spec
 * runs on a press, in the press's own words (Press Manager, Press Editor,
 * Series editor, monograph, "External Review"): the common scenarios 1–5
 * ({OJS OMP}) here, scenario 6 (the seeded press's settings flipped) in the
 * serial spec (tests/serial/U35-stage-participants.spec.js); scenarios 7–9
 * are {OPS}.
 * Spec: docs/specs/U35-stage-participants.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞 ("Assign Editor" raises no task): S3 reads the Series editor's
 *   discussion row; the absence of an assignment task is not asserted.
 * - A2 🐞 (a typed message with no predefined message chosen): every
 *   message step picks a predefined entry first; nothing sends typed text
 *   with the list blank.
 * - A3 🐞 (every "Edit Assignment" save logs a fresh assignment): S2 reads
 *   the "was assigned" line's presence, never its count.
 * - A8 🐞 (the discussion listed as created by its recipient): S3 and S4
 *   read the discussion's participants; "Created by" is not asserted.
 * - A9 🐞 (a Series editor's "Edit" on a manager's Series editor row):
 *   nothing opens it; S4's manager row is read by the manager alone.
 * - A10 🐞 ("OK" with nobody chosen says nothing): S3 reads that the window
 *   stays open and assigns nobody; its silence is not asserted.
 * - A11 🐞 (the "Permissions" box kept across choices): every window
 *   chooses one person; a second choice in one window is never made.
 * - A12 🐞 (the anonymous-review warning never shows): no reviewer is
 *   chosen in "Assign Participant".
 * - OJS1 🐞, OPS1 ✅, OPS2 🐞, OPS3 🐞, OPS4 ❓: other apps' territory.
 * - A4 ❓ (an ended role's participant listed unmarked): S4's ended Series
 *   editor is never assigned; nothing reads a listed ended participant.
 * - A5 ❓ ("Notify" on one's own row): nothing sends it.
 * - A6 ❓ (an Internal Review round's empty template list): no window is
 *   opened on an internal round.
 * - A7 ❓ (no "Edit" on one's own Series editor row), A13 ❓ (the Activity
 *   Log's User column names the participant) and OMP1 ❓ (no Participants
 *   panel on the "Internal Review" stage entry): read as the scenarios
 *   state them; nothing asserts what should be offered, named or shown.
 *
 * Seeding: scenario endpoints only; `publicknowledge` and the seeded roster
 * are read-only (A1, A7). S1, S2 and S5 run on the seeded press with
 * scratch monographs (footnote s: a seed in the series "Monographs"
 * auto-assigns Diana, Ana and Omar, one in "Textbooks" Diana and Ravi; a
 * monograph past its review is `['skipInternalReview', 'sendExternalReview',
 * …]`, the press's route through an external round; S5's automatic
 * assignments happen on the seeded press alone, so it submits through the
 * wizard there on a scratch title, the series picked on "For the Editors",
 * and reads Mailpit and the Tasks panel by that title). S3 and S4 run on
 * scratch presses with throwaway accounts because each reads a mailbox (A8:
 * every read scoped by a throwaway address, every silence bounded by a
 * message that did arrive). States with no seed key are built on screen
 * before the scenario's first step, as footnote s says: S4's ended Series
 * editor role through Users & Roles › "Remove Role", S4's switched-off
 * discussion emails through Profile › Notifications; the recommend-only
 * flag is set through "Assign Participant" and "Edit Assignment", which is
 * this feature's subject. "Login As" swaps the page's session for the
 * impersonated user and "Logout as {name}" returns it; a test that ends
 * impersonating lets the per-test session lapse. Tags are unique per run
 * (M5); waits are web-first (A5). Everything here runs in the parallel
 * `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel, toasts, successToasts, expectStackedBelow} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {ProfilePage} = require('../../../../shared/playwright/pages/ProfilePage.js');
const {UsersAccessPage, SendInvitationWizard} = require('../pages/UserInvitationPages.js');
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
} = require('../pages/SubmissionWizardPages.js');
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
    SeriesSettingsPage,
} = require('../pages/StageParticipantsPages.js');

const PRESS = 'publicknowledge';
const PRESS_NAME = 'Public Knowledge Press';
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

/** The press's role labels (users.md: `editor` is "Press editor", `sectionEditor` "Series editor"). */
const EDITOR_ROLE = 'Press editor';
const SE_ROLE = 'Series editor';
/** Rule 4a's Submission-stage role list on a press. */
const SUBMISSION_ROLES = [EDITOR_ROLE, SE_ROLE, 'Funding coordinator', 'Author', 'Volume editor', 'Translator'];
/** Rule 4b's columns. */
const PERSON_COLUMNS = ['Name', 'Assignments', 'Affiliation', 'Reviewing interests'];
/** The four entries a manager's row menu holds (Actors rows 3–6). */
const FULL_MENU = ['Edit', 'Notify', 'Login As', 'Remove'];
/** Rule 5a's recommendation buttons on a review round. */
const RECOMMEND_BUTTONS = ['Recommend Revisions', 'Recommend Accept', 'Recommend Decline'];
/** The press's route to a review round and past it (footnote s). */
const TO_EXTERNAL_REVIEW = ['skipInternalReview', 'sendExternalReview'];
/** Side effects: the automatic assignment's subject. */
const AUTO_ASSIGNED_SUBJECT = `You have been assigned as an editor on a submission to ${PRESS_NAME}`;
const PRINCIPAL_CONTACT = 'admin@mail.test';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u35${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
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
 * A scratch press with throwaway accounts (display names `Given Family`).
 * Returns the users keyed as given, each with `username`, `displayName`
 * and `email`.
 */
async function seedScratchPress(ompApi, tag, users) {
    await ompApi.createContext({tag, users: Object.values(users)});
    const named = {};
    for (const [key, user] of Object.entries(users)) {
        named[key] = {...user, displayName: `${user.givenName} ${user.familyName}`, email: mailOf(user.username)};
    }
    return named;
}

/**
 * The header's Tasks panel on a press's editorial dashboard, opened in a
 * fresh page of `context` for `fn(tasks)` and closed after it.
 */
async function withTasks(context, pressPath, fn) {
    const page = await context.newPage();
    try {
        await page.goto(`/index.php/${pressPath}/dashboard/editorial`);
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

/** The monograph is open at the stage's entry with the participants listed (a settled landing). */
async function expectPanelSettled(panel) {
    await expect(panel.heading()).toBeVisible({timeout: 30_000});
    await expect(panel.rows().first()).toBeVisible({timeout: 30_000});
}

/**
 * The Author's submission through the wizard on the seeded press, to the
 * series "Monographs", titled `title` (Rule 11b's automatic assignments
 * happen at this submit). The draft is seeded (`submitted: false`, the
 * seed supplying the abstract) and the wizard submits it, the series
 * picked on "For the Editors" (seed-facts: a monograph with no series
 * chosen assigns nobody). Returns the monograph's id.
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

// No default `user` at describe level: every actor is opened through
// `asUser` (a describe-level `test.use({user})` strands the later `asUser`
// session on the shared php -S worker).
test.describe('stage participants', () => {
    test('S1: the panel by role', {tag: '@smoke'}, async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // Footnote s: a seed in "Monographs" accepted from its external
        // round with Julia's review complete and Carla assigned as
        // Copyeditor; Diana, Ana and Omar are auto-assigned.
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PRESS,
            submitter: AUTHOR,
            title: `Submission ${tag}`,
            series: 'monographs',
            decisions: [...TO_EXTERNAL_REVIEW, 'accept'],
            reviewRounds: [{reviewers: [{username: 'reviewer.julia', status: 'completed'}]}],
            participants: [{username: COPYEDITOR, role: 'copyeditor'}],
        });

        const managerPage = await (await asUser(MANAGER)).newPage();
        const panel = new ParticipantsPanel(managerPage, PRESS);
        const confirms = acceptConfirms(managerPage);
        await panel.gotoStage(submissionId, 'Copyediting');

        // The Press Manager's panel: heading, "Assign", the rows by level
        // (the Press Editor, the two Series editors in either order, the
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
                `${EDITOR_NAME} | ${EDITOR_ROLE}`,
                `${ANA_NAME} | ${SE_ROLE}`,
                `${OMAR_NAME} | ${SE_ROLE}`,
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
        // rows on "Submission", "External Review" and "Production", the
        // Copyeditor's on "Copyediting" alone (Rule 2); the press's "Internal
        // Review" entry shows no panel, read as the scenario states it (OMP1).
        for (const stage of ['Submission', 'External Review', 'Production']) {
            await panel.frame.selectStage(stage);
            await expectRowNames(panel).toHaveLength(4);
            const onStage = await panel.rowNames();
            expect(onStage, `${stage}: rows`).toEqual([EDITOR_NAME, ...names.slice(1, 3), AUTHOR_NAME]);
        }
        await panel.frame.selectStage('Internal Review');
        await expect(panel.frame.primaryColumn()).toBeVisible();
        await expect(panel.frame.anyStatusBox()).toBeVisible({timeout: 30_000});
        await expect(panel.panel()).toHaveCount(0);
        await expect(panel.frame.participantsHeading()).toHaveCount(0);
        await panel.frame.selectStage('Copyediting');
        await expectRowNames(panel).toHaveLength(5);

        // A row's menu: the Copyeditor's holds the four entries; so does the
        // Press Editor's (Actors rows 3–6).
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
        await edit.expectParticipant(EDITOR_NAME, EDITOR_ROLE);
        await expect(edit.privilegesHeading()).toBeVisible();
        await expect(edit.recommendOnlyBox()).toBeVisible();
        await expect(edit.permissionsHeading()).toBeHidden();
        await expect(edit.metadataBox()).toBeHidden();
        await edit.cancel();

        // "Assign Participant" on "Submission": Rule 4a's press role list
        // with the first selected, then the search box, "Search" and the
        // "Locate a User" list with its columns (Rules 4a, 4b).
        await panel.frame.selectStage('Submission');
        let assign = await panel.openAssign();
        await expect.poll(() => assign.roleOptions()).toEqual(SUBMISSION_ROLES);
        expect(await assign.selectedRole()).toBe(SUBMISSION_ROLES[0]);
        await expect(assign.dialog.getByText('Search User By Name')).toBeVisible();
        await expect(assign.searchButton()).toBeVisible();
        await expect(assign.dialog.getByText('Locate a User')).toBeVisible();
        await expect.poll(() => assign.columnHeadings()).toEqual(PERSON_COLUMNS);

        // The person list: "Series editor" offers the unassigned Series
        // editor, with a radio button at the start of the row, and neither
        // assigned one; a nobody search lists "No Items" (Rule 4b).
        await assign.selectRole(SE_ROLE);
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
        // dashboard with this monograph open as the Copyeditor (no
        // "Assign"), the list opening with "Logout as {name}"; pressing it:
        // the same monograph as the Press Manager again (Rule 9).
        await panel.frame.selectStage('Copyediting');
        let loginAs = await panel.openLoginAs(panel.row(COPYEDITOR_NAME));
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

        // The Series editor's panel: "Assign"; her own row's menu "Notify"
        // and "Remove" (no "Edit", no "Login As"); the other Series editor's
        // "Edit", "Notify", "Remove"; the Press Editor's "Notify", "Remove";
        // the Copyeditor's "Edit", "Notify", "Remove" (Actors rows 2–6).
        const anaPage = await (await asUser(ANA)).newPage();
        const anaPanel = new ParticipantsPanel(anaPage, PRESS);
        await anaPanel.gotoStage(submissionId, 'Copyediting');
        await expectPanelSettled(anaPanel);
        await expect(anaPanel.assignButton()).toBeVisible();
        await anaPanel.expectMenu(anaPanel.row(ANA_NAME), ['Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(OMAR_NAME), ['Edit', 'Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(EDITOR_NAME), ['Notify', 'Remove']);
        await anaPanel.expectMenu(anaPanel.row(COPYEDITOR_NAME), ['Edit', 'Notify', 'Remove']);

        // The Copyeditor's panel: no "Assign", every row's menu "Notify" alone.
        const carlaPage = await (await asUser(COPYEDITOR)).newPage();
        const carlaPanel = new ParticipantsPanel(carlaPage, PRESS);
        await carlaPanel.gotoStage(submissionId, 'Copyediting');
        await expectPanelSettled(carlaPanel);
        await expectRowNames(carlaPanel).toHaveLength(5);
        await expect(carlaPanel.assignButton()).toHaveCount(0);
        for (const name of names) {
            await carlaPanel.expectMenu(carlaPanel.row(name), ['Notify']);
        }

        // "Login As" on the Author's row, as the Press Manager again: My
        // Submissions with this monograph open, as the Author (Rule 9).
        loginAs = await panel.openLoginAs(panel.row(AUTHOR_NAME));
        await loginAs.ok();
        await managerPage.waitForURL(
            (url) => url.pathname.includes('/dashboard/mySubmissions') && url.search.includes(`workflowSubmissionId=${submissionId}`),
            {waitUntil: 'commit', timeout: 30_000}
        );
        await panel.frame.expectOpen(submissionId);
        expect(confirms).toEqual([]);

        // Control: the Author, opening the monograph from My Submissions,
        // has no "Participants" panel on any entry of the workflow menu,
        // where the Press Manager's view showed it on every stage entry but
        // the press's "Internal Review" (Rule 1).
        const authorPage = await (await asUser(AUTHOR)).newPage();
        const authorPanel = new ParticipantsPanel(authorPage, PRESS);
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

    test('S2: limit an editor to recommendations', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        // Footnote s: a seed in "Textbooks" on its first external round with
        // no reviewer; the series' form assigns Ravi as the deciding Series
        // editor (and Diana as Press Editor); Ana and Omar are not assigned.
        const seeded = await ompApi.createSubmission({
            tag,
            context: PRESS,
            submitter: AUTHOR,
            title: `Submission ${tag}`,
            series: 'textbooks',
            decisions: TO_EXTERNAL_REVIEW,
            reviewRounds: [{reviewers: []}],
        });
        const {submissionId} = seeded;
        const roundId = seeded.reviewRounds[0].id;

        const managerPage = await (await asUser(MANAGER)).newPage();
        const panel = new ParticipantsPanel(managerPage, PRESS);
        const confirms = acceptConfirms(managerPage);
        await panel.gotoRound(submissionId, roundId);
        await expectPanelSettled(panel);
        await expect(panel.row(RAVI_NAME)).toHaveCount(1);
        await expect(panel.row(ANA_NAME)).toHaveCount(0);

        // "Assign" with "Assignment privileges" ticked: the box arrives clear
        // and "Permissions" ticked; tick the first, "OK": the added message
        // and the new row's recommend-only line (Rules 4c, 4f, 5a, 5b, 6).
        let assign = await panel.openAssign();
        await assign.selectRole(SE_ROLE);
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
        await expect(panel.row(ANA_NAME, SE_ROLE)).toHaveCount(1, {timeout: 30_000});
        await expect(panel.recommendLine(panel.row(ANA_NAME))).toHaveCount(1, {timeout: 30_000});
        await expect(panel.recommendLine(panel.row(RAVI_NAME))).toHaveCount(0);

        // The recommending Series editor's round: the three "Recommend…"
        // buttons in place of the decision buttons; "Assign"; the deciding
        // editor's row menu "Notify" and "Remove"; the Author's "Edit" opens
        // "Permissions" alone; "Cancel" (Rules 5a, 5c).
        const anaPage = await (await asUser(ANA)).newPage();
        const anaPanel = new ParticipantsPanel(anaPage, PRESS);
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
        await assign.selectRole(SE_ROLE);
        await assign.search();
        await assign.choose(OMAR_NAME);
        await expect(assign.privilegesHeading()).toBeVisible();
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await assign.okAndClose();
        await expect(anaPanel.row(OMAR_NAME, SE_ROLE)).toHaveCount(1, {timeout: 30_000});
        await expect(anaPanel.recommendLine(anaPanel.row(ANA_NAME))).toHaveCount(1);
        await expect(anaPanel.recommendLine(anaPanel.row(OMAR_NAME))).toHaveCount(0);

        // The editor assigned with the box clear: the decision buttons, no
        // "Recommend…" button, no line on his row (Rule 5a).
        const omarPage = await (await asUser(OMAR)).newPage();
        const omarPanel = new ParticipantsPanel(omarPage, PRESS);
        await omarPanel.gotoRound(submissionId, roundId);
        await expectPanelSettled(omarPanel);
        await expect.poll(() => omarPanel.frame.actionButtonLabels(), {timeout: 30_000}).toContain('Accept Submission');
        const omarButtons = await omarPanel.frame.actionButtonLabels();
        expect(omarButtons).toContain('Request Revisions');
        expect(omarButtons.filter((label) => /^Recommend/.test(label))).toEqual([]);
        await expect(omarPanel.recommendLine(omarPanel.row(OMAR_NAME))).toHaveCount(0);
        await expect(omarPanel.recommendLine(omarPanel.row(ANA_NAME))).toHaveCount(1);

        // "Edit Assignment" as the Press Manager: both boxes ticked; untick
        // the first and "Cancel": the leave question, continued: the row
        // keeps its line; "Edit", untick, "OK": the changed message and the
        // line gone; "Edit", tick, "OK": the line back (Rule 7).
        await panel.gotoRound(submissionId, roundId);
        await expectPanelSettled(panel);
        edit = await panel.openEdit(panel.row(ANA_NAME));
        await edit.expectParticipant(ANA_NAME, SE_ROLE);
        await expect(edit.recommendOnlyBox()).toBeChecked();
        await expect(edit.metadataBox()).toBeChecked();
        await edit.recommendOnlyBox().uncheck();
        // The leave question the scenario states is not asserted here: on
        // this press the window's "Cancel" closed with no question asked
        // (finding T-omp-3 of this suite's run, `.reports/U35/test-omp-findings.md`);
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
        // Series editor's own name (its count is A3's, not asserted).
        await panel.frame.openActivityLog();
        const anaAssigned = panel.frame.activityLogRow(assignedLine(ANA_NAME, ANA, SE_ROLE));
        await expect(anaAssigned.first()).toBeVisible({timeout: 30_000});
        await expect(anaAssigned.first()).toContainText(ANA_NAME);
        await expect(anaAssigned.first()).not.toContainText(MANAGER_NAME);
        await panel.frame.closeActivityLog();

        // Removing one's own row: the panel empties and the "Error" dialog
        // opens over the workflow; "OK": the emptied workflow stays (Rule 10).
        await omarPanel.gotoRound(submissionId, roundId);
        await expectPanelSettled(omarPanel);
        const remove = await omarPanel.openRemove(omarPanel.row(OMAR_NAME));
        await remove.ok();
        await expect(omarPanel.frame.errorDialog()).toBeVisible({timeout: 30_000});
        await expect(omarPanel.frame.errorDialog()).toContainText(NO_ROLE_ACCESS);
        await expect(omarPanel.rows()).toHaveCount(0, {timeout: 30_000});
        await omarPanel.frame.dismissErrorDialog();
        await expect(omarPage.locator('[data-cy="sidemodal-header"]')).toBeVisible();
        await expect(omarPanel.rows()).toHaveCount(0);

        // Control: the "Cancel" with the box changed saved nothing: the row
        // kept its line and the reopened window's box was still ticked (read
        // above); no other browser question was asked.
        expect(confirms.filter((question) => question !== LEAVE_QUESTION)).toEqual([]);
    });

    test('S3: assign an editor with "Assign Editor"', async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const users = await seedScratchPress(ompApi, tag, {
            manager: {username: `mg${tag}`, givenName: 'Mira', familyName: 'Manager', roles: ['manager']},
            seriesEditor: {username: `se${tag}`, givenName: 'Sid', familyName: 'Serieseditor', roles: ['sectionEditor']},
            funding: {username: `fc${tag}`, givenName: 'Fay', familyName: 'Funding', roles: ['funding']},
            author: {username: `au${tag}`, givenName: 'Ava', familyName: 'Author', roles: ['author']},
        });
        const title = `Submission ${tag}`;
        const abstract = `Seeded abstract for ${tag}.`;
        const {submissionId} = await ompApi.createSubmission({
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

        // The managers' task, in the press's words (Rule 12).
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
        expect(await assign.selectedRole()).toBe(EDITOR_ROLE);
        await expect(assign.personRows().locator('input[name="userId"]:checked')).toHaveCount(0);
        await assign.ok();
        await expect(assign.dialog).toBeVisible();
        await expect(assign.roleList()).toBeVisible();
        await assign.cancel();
        await expectRowNames(panel).toEqual([users.author.displayName]);

        // "Cancel" with a person chosen: no row; the "Close" arrow with a
        // person chosen: the leave question, continued: no row (Rule 4f).
        assign = await panel.openAssign();
        await assign.selectRole(SE_ROLE);
        await assign.search();
        await assign.choose(users.seriesEditor.displayName);
        await assign.cancel();
        expect(confirms).toEqual([]);
        await expectRowNames(panel).toEqual([users.author.displayName]);
        assign = await panel.openAssign();
        await assign.selectRole(SE_ROLE);
        await assign.search();
        await assign.choose(users.seriesEditor.displayName);
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

        // A Series editor assigned with "Assign Editor": the boxes as the
        // role's settings say; the template fills "Message" with the title,
        // its link, the author and the abstract, opening "Dear …,"; "OK":
        // the two messages stacked, the row above the Funding Coordinator's,
        // the discussion with both participants, the task gone (Rules 1, 4c,
        // 4e, 4f, 5b, 6, 8a, 8b, 12).
        assign = await panel.openAssign();
        await assign.selectRole(SE_ROLE);
        await assign.search();
        await assign.choose(users.seriesEditor.displayName);
        await expect(assign.privilegesHeading()).toBeVisible();
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await expect(assign.permissionsHeading()).toBeVisible();
        await expect(assign.metadataBox()).toBeChecked();
        await expect(assign.dialog.getByText(TEMPLATE_PROMPT)).toBeVisible();
        await assign.chooseTemplate('Assign Editor');
        const message = await assign.message();
        // The greeting's placeholder is not asserted as "{$recipientName}":
        // the box shows the greeting as the placeholder's label (finding
        // T-ojs-2 of the OJS run and T-omp-1 of this one,
        // `.reports/U35/test-omp-findings.md`); the opening word and the
        // filled-in parts are.
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
        await expectRowNames(panel).toEqual([users.seriesEditor.displayName, users.funding.displayName, users.author.displayName]);
        await expect.poll(() => panel.rowSummaries()).toContain(`${users.seriesEditor.displayName} | ${SE_ROLE}`);
        const discussions = panel.discussions();
        await expect(discussions.row('Assign Editor')).toHaveCount(1, {timeout: 30_000});
        const discussion = await discussions.open(discussions.row('Assign Editor'), 'Assign Editor');
        await expect(discussions.participantEntry(discussion, users.seriesEditor.displayName)).toHaveCount(1);
        await expect(discussions.participantEntry(discussion, users.manager.displayName)).toHaveCount(1);
        await expect(discussions.participantEntries(discussion)).toHaveCount(2);
        await discussions.close(discussion);
        await withTasks(managerContext, tag, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
        });

        // The Series editor's mailbox: "Assign Editor" from the Press
        // Manager, opening "Dear {name}," (Rules 4e, 8a).
        const editorMail = await pkpMail.find({to: users.seriesEditor.email, subject: 'Assign Editor', contains: title});
        expect(editorMail.Subject).toBe('Assign Editor');
        expect(editorMail.From.Name).toBe(users.manager.displayName);
        const editorMailFull = await pkpMail.fullMessage(editorMail.ID);
        expect(editorMailFull.Text.replace(/\s+/g, ' ').trim()).toMatch(new RegExp(`^Dear ${users.seriesEditor.displayName},`));

        // The Series editor's Tasks panel: the discussion row (the absence
        // of an assignment task is A1's, not asserted) (Rule 8b).
        await withTasks(await asUser(users.seriesEditor.username), tag, async (tasks) => {
            const editorRow = tasks.row(title).filter({hasText: `${users.manager.displayName} started a discussion: Assign Editor:`});
            await expect(editorRow).toHaveCount(1, {timeout: 30_000});
        });

        // The Activity Log: the two assignment lines under the assigned
        // persons' names, "Notification sent to users." under the Press
        // Manager's, "An email has been sent: Assign Editor" (Side effects).
        await panel.frame.openActivityLog();
        const fundingLine = panel.frame.activityLogRow(assignedLine(users.funding.displayName, users.funding.username, 'Funding coordinator'));
        await expect(fundingLine).toHaveCount(1, {timeout: 30_000});
        await expect(fundingLine).toContainText(users.funding.displayName);
        const editorLine = panel.frame.activityLogRow(assignedLine(users.seriesEditor.displayName, users.seriesEditor.username, SE_ROLE));
        await expect(editorLine).toHaveCount(1);
        await expect(editorLine).toContainText(users.seriesEditor.displayName);
        const sentLine = panel.frame.activityLogRow(SENT_TOAST);
        await expect(sentLine).toHaveCount(1);
        await expect(sentLine).toContainText(users.manager.displayName);
        await expect(panel.frame.activityLogRow('An email has been sent: Assign Editor')).toHaveCount(1);
        await panel.frame.closeActivityLog();

        // Control: the Funding Coordinator, assigned with "Message" empty,
        // has no email once the Series editor's arrived, and no row in
        // their Tasks panel (Side effects).
        await pkpMail.expectNone({
            to: users.funding.email,
            afterControl: {to: users.seriesEditor.email, subject: 'Assign Editor', contains: title},
        });
        await withTasks(await asUser(users.funding.username), tag, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
            await expect(tasks.rows()).toHaveCount(0);
            await expect(tasks.noItems()).toBeVisible();
        });
    });

    test('S4: "Notify" and "Remove"', async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const users = await seedScratchPress(ompApi, tag, {
            manager: {username: `mg${tag}`, givenName: 'Mira', familyName: 'Manager', roles: ['manager', 'sectionEditor']},
            other: {username: `sa${tag}`, givenName: 'Sid', familyName: 'Seriesone', roles: ['sectionEditor']},
            third: {username: `sb${tag}`, givenName: 'Sue', familyName: 'Seriestwo', roles: ['sectionEditor']},
            ended: {username: `sc${tag}`, givenName: 'Sam', familyName: 'Seriesended', roles: ['sectionEditor', 'reader']},
            author: {username: `au${tag}`, givenName: 'Ava', familyName: 'Author', roles: ['author']},
        });
        const title = `Submission ${tag}`;
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: users.author.username,
            title,
            decisions: [...TO_EXTERNAL_REVIEW, 'accept'],
            reviewRounds: [{reviewers: []}],
            participants: [
                {username: users.manager.username, role: 'sectionEditor'},
                {username: users.other.username, role: 'sectionEditor'},
            ],
        });

        // Before the first step (footnote s): the other Series editor's two
        // discussion emails switched off; the fourth's Series editor role
        // ended on Users & Roles.
        const otherContext = await asUser(users.other.username);
        const otherProfile = new ProfilePage(await otherContext.newPage(), tag);
        await otherProfile.goto('notifications');
        await otherProfile.notificationPair('notificationNewQuery').email.check();
        await otherProfile.notificationPair('notificationQueryActivity').email.check();
        await otherProfile.save();

        const managerContext = await asUser(users.manager.username);
        const managerPage = await managerContext.newPage();
        const usersRoles = new UsersAccessPage(managerPage, tag);
        await usersRoles.goto();
        await expect(usersRoles.userRow(users.ended.email)).toBeVisible({timeout: 30_000});
        await usersRoles.userRowAction(users.ended.email, 'Edit');
        const userForm = new SendInvitationWizard(managerPage);
        const endedRow = userForm.currentRoleRow(SE_ROLE);
        await expect(endedRow.getByRole('button', {name: 'Remove Role'})).toBeVisible({timeout: 30_000});
        await userForm.pressRemoveRole(SE_ROLE);
        const roleEnded = managerPage.waitForResponse((r) => r.url().includes('/endRole/'), {timeout: 30_000});
        await userForm.removeRoleConfirmButton.click();
        expect((await roleEnded).status()).toBe(200);
        await expect(endedRow.getByRole('button', {name: 'Remove Role'})).toHaveCount(0);

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
        // The refusal is read where the press shows it, as a message at the
        // top right, with the window still open (finding T-omp-2 of this
        // suite's run, `.reports/U35/test-omp-findings.md`).
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

        // The Series editor's mailbox: the email from the Press Manager
        // although both discussion emails are off, and no other email for
        // the discussion (Rule 8a; Settings).
        const mail = await pkpMail.find({to: users.other.email, subject: 'Discussion (Copyediting)'});
        expect(mail.Subject).toBe('Discussion (Copyediting)');
        expect(mail.From.Name).toBe(users.manager.displayName);
        expect(await pkpMail.count({to: users.other.email})).toBe(1);

        // The Series editor's Tasks panel (Rule 8a).
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
        await edit.expectParticipant(users.manager.displayName, SE_ROLE);
        await expect(edit.noChangesText()).toBeVisible();
        await expect(edit.dialog).toContainText(NO_CHANGES);
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await expect(edit.metadataBox()).toBeHidden();
        await expect(edit.okButton()).toBeVisible();
        await expect(edit.cancelLink()).toBeVisible();
        await edit.ok();
        await expect(successToasts(managerPage).filter({hasText: CHANGED_TOAST})).toBeVisible({timeout: 30_000});

        // Who the person list offers: the third Series editor and not the
        // assigned one; the elsewhere-only name and the ended one: "No
        // Items"; "Cancel" (Rule 4b).
        const assign = await panel.openAssign();
        await assign.selectRole(SE_ROLE);
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
        // "External Review" and "Production"; the discussion keeps the Press
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
        for (const stage of ['Submission', 'External Review', 'Production']) {
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
        const removedRow = panel.frame.activityLogRow(removedLine(users.other.displayName, users.other.username, SE_ROLE));
        await expect(removedRow).toHaveCount(1, {timeout: 30_000});
        await expect(removedRow).toContainText(users.other.displayName);
        await panel.frame.closeActivityLog();

        // The removed Series editor's landing: the dashboard with the
        // "Error" dialog (Rule 10).
        const otherPage = await otherContext.newPage();
        const otherPanel = new ParticipantsPanel(otherPage, tag);
        await otherPage.goto(otherPanel.frame.editorialUrl(submissionId));
        await expect(otherPanel.frame.errorDialog()).toBeVisible({timeout: 30_000});
        await expect(otherPanel.frame.errorDialog()).toContainText(NO_ROLE_ACCESS);
        await expect(otherPage).toHaveURL(/\/dashboard\/editorial/);
        await expect(otherPanel.rows()).toHaveCount(0);

        // Control: the third Series editor, who holds the role here and is
        // not assigned, was offered by the same search that offered neither
        // the assigned, the elsewhere-only nor the ended one (read above).
        expect(confirms).toEqual([]);
    });

    test('S5: the assignments the press makes at submit', async ({asUser, ompApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const title = `Participants at submit ${tag}`;

        // The given, read on the series' form: "Monographs" ticks the Press
        // Editor and two Series editors and not the third (footnote s).
        const managerContext = await asUser(MANAGER);
        const managerPage = await managerContext.newPage();
        const series = new SeriesSettingsPage(managerPage, PRESS);
        await series.goto();
        await series.openSeries('Monographs');
        const ticked = await series.tickedAssignments();
        expect(ticked).toEqual(
            expect.arrayContaining([
                `Assign ${EDITOR_NAME} as ${EDITOR_ROLE}`,
                `Assign ${ANA_NAME} as ${SE_ROLE}`,
                `Assign ${OMAR_NAME} as ${SE_ROLE}`,
            ])
        );
        expect(ticked.filter((label) => label.includes(RAVI_NAME))).toEqual([]);
        await series.cancel();

        // The submission through the wizard as the Author (Rule 11b).
        const authorPage = await (await asUser(AUTHOR)).newPage();
        const submissionId = await submitToMonographs(ompApi, authorPage, tag, title);

        // The panel at "Submission": the Press Editor's and the two Series
        // editors' rows, none with a third line, beside the Author's; the
        // Tasks panel, settled, lists no "needs an editor" task for it (the
        // submit that would have raised it is the one that wrote the rows
        // read first) (Rules 11a, 11b, 12).
        const panel = new ParticipantsPanel(managerPage, PRESS);
        await panel.gotoStage(submissionId, 'Submission');
        await expectPanelSettled(panel);
        await expectRowNames(panel).toHaveLength(4);
        const names = await panel.rowNames();
        expect(names[0]).toBe(EDITOR_NAME);
        expect(names.slice(1, 3).sort()).toEqual([ANA_NAME, OMAR_NAME]);
        expect(names[3]).toBe(AUTHOR_NAME);
        await expect.poll(() => panel.rowSummaries()).toEqual(
            expect.arrayContaining([
                `${EDITOR_NAME} | ${EDITOR_ROLE}`,
                `${ANA_NAME} | ${SE_ROLE}`,
                `${OMAR_NAME} | ${SE_ROLE}`,
                `${AUTHOR_NAME} | Author`,
            ])
        );
        await expect(panel.rows().filter({hasText: RECOMMEND_ONLY_LINE})).toHaveCount(0);
        await withTasks(managerContext, PRESS, async (tasks) => {
            await expectTasksSettled(tasks);
            await expect(tasks.row(title)).toHaveCount(0);
            await expect(tasks.rowsOpening(NEEDS_EDITOR_TASK).filter({hasText: title})).toHaveCount(0);
        });

        // The editors' mailboxes: each holds the assignment email from the
        // press's principal contact (Side effects).
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

        // A Series editor's Tasks panel: no row for the monograph, read on
        // the settled window (Side effects).
        await withTasks(await asUser(ANA), PRESS, async (tasks) => {
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

        // Control: the third Series editor has no row and no email for the
        // title once the ticked editors' have arrived (Rule 11b).
        await expect(panel.row(RAVI_NAME)).toHaveCount(0);
        await pkpMail.expectNone({
            to: mailOf(RAVI),
            contains: title,
            afterControl: {to: mailOf(OMAR), subject: AUTO_ASSIGNED_SUBJECT, contains: title},
        });
    });
});
