// @ts-check
/**
 * @file playwright/tests/U35-stage-participants.spec.js
 *
 * Stage participants — OPS suite, one test per scenario the spec runs on a
 * preprint server in the parallel project: scenario 7 ("The preprint
 * server's panel": the one "Production" entry and its rows, "Assign
 * Participant" landed by either stage key, a manager assigned, the rows' menus by role,
 * "Edit" on a Moderator's and on the Author's row, "Login As" and the
 * Author's view without the panel) and scenario 8 ("A Moderator assigned
 * and notified": the managers' task, a refused "OK", an Author assigned
 * with the task kept, a Moderator assigned with "Discussion (Production)",
 * the mailbox, the Tasks rows, "Notify" refused with "Message" empty,
 * "Remove" and the removed Moderator's landing). Scenario 9 ("The
 * Moderators assigned at submit") flips the seeded server's Moderator
 * role and lives in tests/serial/U35-stage-participants.spec.js. Scenarios
 * 1–6 are badged {OJS OMP}: the preprint server's own scenarios stand in
 * for them (RUNBOOK multi-app rule 3), so the suite carries no absence
 * test beyond S7's Control (the Author's view has no panel).
 * Spec: docs/specs/U35-stage-participants.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): OPS2 🐞
 * (S7 chooses "Assign Editor" as the scenario does and asserts the
 * assignment alone, never that "Message" stays as it was); A10 🐞 (S8
 * asserts that "OK" with nobody chosen keeps the window open and assigns
 * nobody, never that it says nothing); A8 🐞 (S8 reads the discussion's
 * participants, never its "Created by" line); A2 🐞 (every message step
 * chooses a predefined message first); A13 ❓ (S8 reads the removal's log
 * sentence, never the log's "User" column); A7 ❓ (S7 reads the
 * Moderator's own row for "Notify", "Remove" and the absent "Login As",
 * never for the absent "Edit"); OPS3 🐞 (register-carried: the serial
 * spec reads no Moderator mailbox) and OPS4 ❓ (the category form); A1, A3, A4, A5, A6, A9, A11, A12, OJS1 and OMP1
 * (journal and press surfaces, or states no OPS scenario reaches). OPS1 ✅
 * is what S7's role list asserts. The spec's Coverage section records
 * everything else left out. The spec's "Submission" entry on a preprint
 * server does not exist (finding T-ops-1, `.reports/U35/test-ops-findings.md`):
 * the suite reads the side menu's stage entries as exactly ["Production"]
 * and lands by both stage keys on "Workflow: Production".
 *
 * Seeding: scenario endpoints only. S7 runs on the read-only
 * `publicknowledge` with the roster (A1, A7): its seeded preprint
 * auto-assigns the section's two Moderators (footnote s), and every
 * change it makes (a manager assigned, a Moderator limited, an
 * impersonation) is scoped to its own submission or its own session. S8
 * runs on a scratch preprint server with throwaway users, since it reads
 * a mailbox (A8: every read scoped by a throwaway address, the second
 * Author's silence bounded by the Moderator's message) and needs a
 * submission nobody but its Author is assigned to. Tags are unique per
 * run (M5); waits are web-first (A5); the "Notification sent to users."
 * toast vanishes on OPS before a settled read, so the toasts are caught
 * by an observer armed before the press and the effect (the row, the
 * discussion, the mailbox) is the assertion.
 */
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {
    ParticipantsPanel,
    ENTRY_KEYS,
    TOASTS,
    NOTIFY_EMPTY_MESSAGE,
    LOGIN_AS_SENTENCE,
    REMOVE_SENTENCE,
    armToastObserver,
    expectObservedToast,
} = require('../pages/StageParticipantsPages.js');

const CONTEXT = 'publicknowledge';

/** The seeded preprint server's people (users.md; the OPS bootstrap). */
const MANAGER = 'manager.maya';
const AUTHOR = 'author.alex';
const MODERATORS = {
    'Ana Section Editor': 'sectioneditor.ana',
    'Ravi Section Editor': 'sectioneditor.ravi',
};
const AUTHOR_NAME = 'Alex Author';
/** The Site Administrator's row and radio, by the username the names carry either way. */
const ADMIN_ROW = /admin/i;
const ADMIN_MENU = /admin.*More Actions$/i;

/** The preprint server's roles and predefined messages (Rules 4a, 4e; OPS1). */
const OPS_ROLES = ['Preprint Server manager', 'Moderator', 'Author'];
const OPS_TEMPLATES = ['Discussion (Production)', 'Assign Editor'];
const DISCUSSION_TEMPLATE = 'Discussion (Production)';
const DISCUSSION_TEXT = 'Please enter your message.';

/** The managers' task (Rule 12) and the refusals (Rule 10). */
const NEEDS_MODERATOR = 'A new preprint has been submitted to which a moderator needs to be assigned.';
const NO_ROLE_ACCESS = 'The current role does not have access to this operation.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u35${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function account(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

const mailOf = (username) => `${username}@mail.test`;

/** A page as a given user, with the panel's page object for it. */
async function panelAs(asUser, appContext, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    const panel = new ParticipantsPanel(page, contextPath, {appContext});
    return {page, panel, workflow: panel.frame};
}

/** The same labels, order aside (the spec lists a menu's entries, not their order). */
const sorted = (labels) => [...labels].sort();

/**
 * The empty shell a removed participant lands on (Rule 10): the panel's
 * header holds the submission number and the "Error" dialog on top reads
 * `message`. Read through the `data-cy` hook, not by role: the dialog
 * stacks over the panel, which goes aria-hidden beneath it (patterns.md
 * pitfall 6; the OPS U24 suite's helper).
 */
async function expectErrorShell(workflow, submissionId, message) {
    const header = workflow.page.locator('[data-cy="sidemodal-header"]');
    await expect(header.locator('.text-xl-medium').first()).toHaveText(new RegExp(`^\\s*${submissionId}\\b`), {
        timeout: 30_000,
    });
    const dialog = workflow.errorDialog();
    await expect(dialog).toBeVisible({timeout: 30_000});
    await expect(dialog).toContainText(message);
    await expect(dialog.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
}

/** Open the header's Tasks panel on a fresh dashboard landing and return it with its rows settled. */
async function openTasks(page, contextPath, view = 'editorial') {
    await page.goto(`/index.php/${contextPath}/dashboard/${view}`);
    const tasks = new TasksPanel(page);
    await expect(tasks.bell()).toBeVisible({timeout: 30_000});
    await tasks.open();
    await expect(tasks.rows().or(tasks.noItems()).first()).toBeVisible({timeout: 30_000});
    return tasks;
}

test.describe('stage participants (U35) — OPS', () => {
    test("S7: the preprint server's panel", async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const title = `Preprint ${tag}`;

        // Given: the seeded server, the manager not assigned, a submitted
        // preprint by author.alex whose section's two Moderators are
        // assigned by the seed beside its Author (footnote s), and the
        // Site Administrator holding the manager role on the server.
        const seeded = await opsApi.createSubmission({tag, context: CONTEXT, submitter: AUTHOR, title});

        // ── One entry, one list ──────────────────────────────────────────
        // The spec's "Submission" entry does not exist on a preprint
        // server (finding T-ops-1; the OPS U25 suite's absence read): the
        // side menu's stage entries are exactly ["Production"], and the
        // address typed with the Submission stage's key lands on
        // "Workflow: Production" like the Production key does. On both
        // landings: the panel with "Assign", the two Moderators' rows and
        // the Author's (Rules 1, 2).
        const manager = await panelAs(asUser, appContext, MANAGER, CONTEXT);
        await manager.panel.gotoByKey(seeded.submissionId, ENTRY_KEYS.Submission);
        await expect.poll(() => manager.panel.stageLabels(), {timeout: 30_000}).toEqual(['Production']);
        await expect(manager.workflow.stageLink('Submission')).toHaveCount(0);
        await expect(manager.panel.heading()).toBeVisible({timeout: 30_000});
        await expect(manager.panel.assignButton()).toBeVisible();
        await expect(manager.panel.rows()).toHaveText([/Moderator/, /Moderator/, /Author/], {timeout: 30_000});
        for (const name of Object.keys(MODERATORS)) {
            await expect(manager.panel.row(name)).toContainText('Moderator');
        }
        await expect(manager.panel.row(AUTHOR_NAME)).toContainText('Author');
        const firstModerator = (await manager.panel.rows().first().innerText()).includes('Ana')
            ? 'Ana Section Editor'
            : 'Ravi Section Editor';
        const secondModerator = firstModerator === 'Ana Section Editor' ? 'Ravi Section Editor' : 'Ana Section Editor';

        // ── "Assign Participant" from either address ─────────────────────
        // Press "Assign": the role list "Preprint Server manager",
        // "Moderator", "Author" (OPS1), the first selected, the predefined
        // messages "Discussion (Production)" and "Assign Editor";
        // "Cancel"; landed by the Production key: the same rows and the
        // same window (Rules 4a, 4e).
        let assign = await manager.panel.openAssign();
        expect(await assign.roleOptions()).toEqual(OPS_ROLES);
        expect(await assign.selectedRole()).toBe(OPS_ROLES[0]);
        expect(sorted(await assign.templateOptions())).toEqual(sorted(OPS_TEMPLATES));
        await assign.cancel();
        await manager.panel.gotoProduction(seeded.submissionId);
        await expect(manager.panel.rows()).toHaveText([/Moderator/, /Moderator/, /Author/], {timeout: 30_000});
        await expect(manager.panel.rows().first()).toContainText(firstModerator);
        await expect(manager.panel.row(AUTHOR_NAME)).toContainText('Author');
        assign = await manager.panel.openAssign();
        expect(await assign.roleOptions()).toEqual(OPS_ROLES);
        expect(await assign.selectedRole()).toBe(OPS_ROLES[0]);
        expect(sorted(await assign.templateOptions())).toEqual(sorted(OPS_TEMPLATES));

        // ── A manager assigned ───────────────────────────────────────────
        // With "Preprint Server manager" selected press "Search" and choose
        // the Site Administrator's row: "Assignment privileges" with its
        // box and no "Permissions" (Rules 4c, 6); choose "Assign Editor"
        // (what it does to "Message" is OPS2, not asserted); "OK": "User
        // added as a stage participant." and the row "Preprint Server
        // manager" first, on the landing by either key (Rules 1, 2, 4f).
        await assign.search('admin');
        await expect(assign.userRow(ADMIN_ROW).first()).toBeVisible({timeout: 30_000});
        await assign.chooseUser(ADMIN_ROW);
        await expect(assign.privilegesHeading()).toBeVisible({timeout: 30_000});
        await expect(assign.recommendOnlyBox()).toBeVisible();
        await expect(assign.permissionsHeading()).toBeHidden();
        await expect(assign.metadataBox()).toBeHidden();
        await assign.chooseTemplate('Assign Editor');
        await armToastObserver(manager.page);
        await assign.ok();
        await expectObservedToast(manager.page, TOASTS.added);
        await expect(manager.panel.rows()).toHaveCount(4, {timeout: 30_000});
        await expect(manager.panel.rows().first()).toContainText(ADMIN_ROW);
        await expect(manager.panel.rows().first()).toContainText('Preprint Server manager');
        await manager.panel.gotoByKey(seeded.submissionId, ENTRY_KEYS.Submission);
        await expect(manager.panel.rows()).toHaveCount(4, {timeout: 30_000});
        await expect(manager.panel.rows().first()).toContainText(ADMIN_ROW);
        await expect(manager.panel.rows().first()).toContainText('Preprint Server manager');

        // ── The rows' menus ──────────────────────────────────────────────
        // The Site Administrator's row: "Edit", "Notify", "Remove", no
        // "Login As"; the first Moderator's row all four (Actors rows 3–6).
        expect(sorted(await manager.panel.readMenu(ADMIN_MENU))).toEqual(sorted(['Edit', 'Notify', 'Remove']));
        expect(sorted(await manager.panel.readMenu(firstModerator))).toEqual(
            sorted(['Edit', 'Notify', 'Login As', 'Remove'])
        );

        // ── "Edit" on a Moderator's row ──────────────────────────────────
        // "Edit Assignment" with "Assignment privileges" clear and
        // "Permissions" ticked; tick the first and "OK": "The stage
        // assignment has been changed." and the row's line, on the
        // landing by either key (Rules 2, 5a, 7).
        let edit = await manager.panel.openEdit(firstModerator);
        await expect(edit.privilegesHeading()).toBeVisible();
        await expect(edit.recommendOnlyBox()).not.toBeChecked();
        await expect(edit.permissionsHeading()).toBeVisible();
        await expect(edit.metadataBox()).toBeChecked();
        await edit.recommendOnlyBox().check();
        await armToastObserver(manager.page);
        await edit.ok();
        await expectObservedToast(manager.page, TOASTS.changed);
        await expect(manager.panel.recommendOnlyMark(firstModerator)).toBeVisible({timeout: 30_000});
        await expect(manager.panel.recommendOnlyMark(secondModerator)).toHaveCount(0);
        await manager.panel.gotoProduction(seeded.submissionId);
        await expect(manager.panel.recommendOnlyMark(firstModerator)).toBeVisible({timeout: 30_000});
        await expect(manager.panel.recommendOnlyMark(secondModerator)).toHaveCount(0);

        // ── "Edit" on the Author's row ───────────────────────────────────
        // "Permissions" with its box ticked and no "Assignment privileges";
        // "Cancel" (Rules 6, 7).
        edit = await manager.panel.openEdit(AUTHOR_NAME);
        await expect(edit.permissionsHeading()).toBeVisible();
        await expect(edit.metadataBox()).toBeChecked();
        await expect(edit.privilegesHeading()).toBeHidden();
        await expect(edit.recommendOnlyBox()).toBeHidden();
        await edit.cancel();

        // ── The Moderator's panel ────────────────────────────────────────
        // The second Moderator opens the preprint at "Production": "Assign"
        // beside the heading; their own row's menu holds "Notify" and
        // "Remove" and no "Login As" (the absent "Edit" is A7, parked);
        // the Site Administrator's row "Notify" and "Remove"; the first
        // Moderator's and the Author's rows "Edit", "Notify" and "Remove"
        // (Actors rows 2–6).
        const moderator = await panelAs(asUser, appContext, MODERATORS[secondModerator], CONTEXT);
        await moderator.panel.gotoProduction(seeded.submissionId);
        await expect(moderator.panel.heading()).toBeVisible({timeout: 30_000});
        await expect(moderator.panel.assignButton()).toBeVisible();
        await expect(moderator.panel.rows()).toHaveCount(4, {timeout: 30_000});
        const own = await moderator.panel.readMenu(secondModerator);
        expect(own).toEqual(expect.arrayContaining(['Notify', 'Remove']));
        expect(own).not.toContain('Login As');
        expect(sorted(await moderator.panel.readMenu(ADMIN_MENU))).toEqual(sorted(['Notify', 'Remove']));
        expect(sorted(await moderator.panel.readMenu(firstModerator))).toEqual(sorted(['Edit', 'Notify', 'Remove']));
        expect(sorted(await moderator.panel.readMenu(AUTHOR_NAME))).toEqual(sorted(['Edit', 'Notify', 'Remove']));

        // ── "Login As" ───────────────────────────────────────────────────
        // As the manager, on the second Moderator's row "…" › "Login As":
        // the dialog with its sentence, "OK" and "Cancel"; "OK": the
        // editorial dashboard with this preprint open, as the Moderator;
        // the list opens with "Logout as {name}" above the rows; press it:
        // the same preprint as the manager again, the row offering "Login
        // As" once more (Rule 9).
        const loginAs = await manager.panel.openLoginAs(secondModerator);
        await expect(loginAs).toContainText(LOGIN_AS_SENTENCE);
        await expect(loginAs.getByRole('button', {name: 'OK', exact: true})).toBeVisible();
        await expect(loginAs.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        await loginAs.getByRole('button', {name: 'OK', exact: true}).click();
        await manager.page.waitForURL(/dashboard\/editorial/, {waitUntil: 'commit', timeout: 30_000});
        await manager.workflow.expectOpen(seeded.submissionId);
        await expect(manager.panel.logoutAsButton(secondModerator)).toBeVisible({timeout: 30_000});
        await expect(manager.panel.firstEntry()).toContainText(`Logout as ${secondModerator}`);
        await expect(manager.panel.rows()).toHaveCount(4, {timeout: 30_000});
        const asModerator = await manager.panel.readMenu(secondModerator);
        expect(asModerator).not.toContain('Login As');
        await manager.panel.logoutAs(secondModerator, seeded.submissionId);
        await expect(manager.panel.firstEntry()).not.toContainText('Logout as');
        expect(await manager.panel.readMenu(secondModerator)).toContain('Login As');

        // ── Control ──────────────────────────────────────────────────────
        // The Author, opening the preprint from My Submissions, has no
        // "Participants" panel, where the manager's view showed it; the
        // author's own workflow navigation is the
        // settled read (Rule 1; Actors row 1).
        const author = await panelAs(asUser, appContext, AUTHOR, CONTEXT);
        await author.workflow.gotoAuthor(seeded.submissionId);
        await expect(
            author.page.getByRole('dialog').getByRole('navigation').getByRole('link', {name: 'Preprint', exact: true})
        ).toBeVisible({timeout: 30_000});
        await expect(author.panel.panel()).toHaveCount(0);
        await expect(author.panel.heading()).toHaveCount(0);
    });

    test('S8: a Moderator assigned and notified', async ({asUser, opsApi, appContext, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const managerName = `${tag}mg`;
        const moderatorName = `${tag}md`;
        const authorName = `${tag}au`;
        const secondAuthorName = `${tag}au2`;
        const managerDisplay = 'Mira Manager';
        const moderatorDisplay = 'Mona Moderator';
        const secondAuthorDisplay = 'Abe Authortwo';
        const title = `Preprint ${tag}`;

        // Given: a scratch preprint server with a throwaway Preprint Server
        // Manager, a Moderator and two Authors; the first Author's
        // submitted preprint with nobody else assigned (a scratch context
        // assigns nobody by itself, footnote s).
        await opsApi.createContext({
            tag,
            context: {name: `Preprint server ${tag}`},
            users: [
                account(managerName, 'Mira', 'Manager', ['manager']),
                account(moderatorName, 'Mona', 'Moderator', ['sectionEditor']),
                account(authorName, 'Ada', 'Author', ['author']),
                account(secondAuthorName, 'Abe', 'Authortwo', ['author']),
            ],
        });
        const seeded = await opsApi.createSubmission({tag, context: tag, submitter: authorName, title});
        expect(await pkpMail.count({to: mailOf(moderatorName)})).toBe(0);
        expect(await pkpMail.count({to: mailOf(secondAuthorName)})).toBe(0);

        // ── The managers' task ───────────────────────────────────────────
        // The header's Tasks panel lists "A new preprint has been submitted
        // to which a moderator needs to be assigned." for the title (Rule 12).
        const manager = await panelAs(asUser, appContext, managerName, tag);
        let tasks = await openTasks(manager.page, tag);
        await expect(tasks.row(title).filter({hasText: NEEDS_MODERATOR})).toHaveCount(1);
        await tasks.close();

        // ── "OK" with nobody chosen ──────────────────────────────────────
        // Open the preprint at "Production" and press "Assign"; with
        // "Preprint Server manager" selected and no row chosen press "OK":
        // the window stays open (what it says is A10, not asserted);
        // "Cancel": the panel still lists the Author's row alone (Rule 4f).
        await manager.panel.gotoProduction(seeded.submissionId);
        await expect(manager.panel.rows()).toHaveCount(1, {timeout: 30_000});
        await expect(manager.panel.row('Ada Author')).toContainText('Author');
        let assign = await manager.panel.openAssign();
        expect(await assign.selectedRole()).toBe(OPS_ROLES[0]);
        await assign.pressOk();
        await expect(assign.roleSelect()).toBeVisible();
        await assign.cancel();
        await expect(manager.panel.rows()).toHaveCount(1, {timeout: 30_000});
        await expect(manager.panel.row('Ada Author')).toContainText('Author');

        // ── An Author assigned keeps the task ────────────────────────────
        // "Assign", "Author", "Search", the second Author's row:
        // "Permissions" with its box ticked and no "Assignment privileges"
        // (Rules 4c, 6); "Message" empty, "OK": "User added as a stage
        // participant." and a second "Author" row (Rule 4f); the Tasks
        // panel still lists the task (Rule 12).
        assign = await manager.panel.openAssign();
        await assign.selectRole('Author');
        await assign.search('Abe');
        await expect(assign.userRow(secondAuthorDisplay).first()).toBeVisible({timeout: 30_000});
        await assign.chooseUser(secondAuthorDisplay);
        await expect(assign.permissionsHeading()).toBeVisible({timeout: 30_000});
        await expect(assign.metadataBox()).toBeChecked();
        await expect(assign.privilegesHeading()).toBeHidden();
        await expect(assign.recommendOnlyBox()).toBeHidden();
        expect(await assign.messageText()).toBe('');
        await armToastObserver(manager.page);
        await assign.ok();
        await expectObservedToast(manager.page, TOASTS.added);
        await expect(manager.panel.rows()).toHaveText([/Author/, /Author/], {timeout: 30_000});
        await expect(manager.panel.row(secondAuthorDisplay)).toContainText('Author');
        tasks = await openTasks(manager.page, tag);
        await expect(tasks.row(title).filter({hasText: NEEDS_MODERATOR})).toHaveCount(1);
        await tasks.close();

        // ── A Moderator assigned with "Discussion (Production)" ──────────
        // "Assign", "Moderator", "Search", the Moderator's row: "Assignment
        // privileges" clear and "Permissions" ticked (Rules 4c, 5b, 6);
        // "Discussion (Production)" fills "Message" with "Please enter
        // your message." (Rule 4e); "OK": both toasts, the "Moderator" row
        // above the Authors' (Rules 1, 4f), the discussion on the stage's
        // panel with the Moderator and the manager as its participants,
        // and the task gone from the Tasks panel (Rules 8a, 8b, 12).
        await manager.panel.gotoProduction(seeded.submissionId);
        assign = await manager.panel.openAssign();
        await assign.selectRole('Moderator');
        await assign.search('Mona');
        await expect(assign.userRow(moderatorDisplay).first()).toBeVisible({timeout: 30_000});
        await assign.chooseUser(moderatorDisplay);
        await expect(assign.privilegesHeading()).toBeVisible({timeout: 30_000});
        await expect(assign.recommendOnlyBox()).not.toBeChecked();
        await expect(assign.permissionsHeading()).toBeVisible();
        await expect(assign.metadataBox()).toBeChecked();
        await assign.chooseTemplate(DISCUSSION_TEMPLATE, {fills: DISCUSSION_TEXT});
        expect(await assign.messageText()).toBe(DISCUSSION_TEXT);
        await armToastObserver(manager.page);
        await assign.ok();
        await expectObservedToast(manager.page, TOASTS.added);
        await expectObservedToast(manager.page, TOASTS.sent);
        await expect(manager.panel.rows()).toHaveText([/Moderator/, /Author/, /Author/], {timeout: 30_000});
        await expect(manager.panel.rows().first()).toContainText(moderatorDisplay);
        const discussions = manager.panel.discussions();
        await expect(discussions.row(DISCUSSION_TEMPLATE)).toHaveCount(1, {timeout: 30_000});
        let view = await discussions.open(DISCUSSION_TEMPLATE);
        await expect(view).toContainText(moderatorDisplay);
        await expect(view).toContainText(managerDisplay);
        await discussions.close();
        tasks = await openTasks(manager.page, tag);
        await expect(tasks.row(title).filter({hasText: NEEDS_MODERATOR})).toHaveCount(0);
        await tasks.close();

        // ── The Moderator's mailbox ──────────────────────────────────────
        // The email "Discussion (Production)" with the manager's name on
        // the From line (Rule 8a).
        const mail = await pkpMail.find({to: mailOf(moderatorName), subject: DISCUSSION_TEMPLATE});
        expect(mail.Subject).toBe(DISCUSSION_TEMPLATE);
        expect(mail.From).toEqual({Name: managerDisplay, Address: mailOf(managerName)});
        expect(await pkpMail.count({to: mailOf(moderatorName)})).toBe(1);

        // ── The Moderator's Tasks panel ──────────────────────────────────
        // "{the manager} started a discussion: Discussion (Production): …" (Rule 8a).
        const moderator = await panelAs(asUser, appContext, moderatorName, tag);
        const moderatorTasks = await openTasks(moderator.page, tag);
        await expect(
            moderatorTasks.row(`${managerDisplay} started a discussion: ${DISCUSSION_TEMPLATE}:`)
        ).toHaveCount(1);
        await moderatorTasks.close();

        // ── "Notify" with "Message" empty ────────────────────────────────
        // As the manager, on the Moderator's row "…" › "Notify": "Start
        // Discussion", "Begin a discussion between yourself and {name}.",
        // the predefined-message list and "Message", the one button
        // "Notify" and no "Cancel"; "Notify" with "Message" empty: the
        // window stays open and "Please ensure…" shows at the top right
        // (a toast, caught by the observer armed before the press: finding
        // T-ops-2) (Rule 8; Fields).
        await manager.panel.gotoProduction(seeded.submissionId);
        const notify = await manager.panel.openNotify(moderatorDisplay);
        await expect(notify.dialog()).toContainText('Start Discussion');
        await expect(notify.dialog()).toContainText(`Begin a discussion between yourself and ${moderatorDisplay}.`);
        await expect(notify.templateSelect()).toBeVisible();
        await expect(notify.messageTextarea()).toBeAttached();
        await expect(notify.notifyButton()).toBeVisible();
        await expect(notify.cancelControls()).toHaveCount(0);
        await armToastObserver(manager.page);
        await notify.pressNotify();
        await expectObservedToast(manager.page, NOTIFY_EMPTY_MESSAGE);
        await expect(notify.templateSelect()).toBeVisible();
        await expect(notify.notifyButton()).toBeVisible();
        await notify.close();

        // ── "Remove" ─────────────────────────────────────────────────────
        // On the Moderator's row "…" › "Remove": the dialog "Remove
        // Participant" with its sentence, "OK" and "Cancel"; "OK": the row
        // leaves the panel, on the landing by either key; the discussion lists
        // the manager as its only participant; the Activity Log reads
        // "{name} ({username}) was removed from this submission as a
        // Moderator." (the column it is filed under is A13, not asserted)
        // (Rules 2, 10; Side effects).
        const remove = await manager.panel.openRemove(moderatorDisplay);
        await expect(remove).toContainText('Remove Participant');
        await expect(remove).toContainText(REMOVE_SENTENCE);
        await expect(remove.getByRole('button', {name: 'Cancel', exact: true})).toBeVisible();
        const removed = manager.page.waitForResponse(
            (r) => /delete-participant/.test(r.url()) && r.request().method() === 'POST',
            {timeout: 30_000}
        );
        await remove.getByRole('button', {name: 'OK', exact: true}).click();
        await removed;
        await expect(manager.panel.row(moderatorDisplay)).toHaveCount(0, {timeout: 30_000});
        await expect(manager.panel.rows()).toHaveText([/Author/, /Author/], {timeout: 30_000});
        await manager.panel.gotoByKey(seeded.submissionId, ENTRY_KEYS.Submission);
        await expect(manager.panel.rows()).toHaveText([/Author/, /Author/], {timeout: 30_000});
        await expect(manager.panel.row(moderatorDisplay)).toHaveCount(0);
        await manager.panel.gotoProduction(seeded.submissionId);
        await expect(discussions.row(DISCUSSION_TEMPLATE)).toHaveCount(1, {timeout: 30_000});
        view = await discussions.open(DISCUSSION_TEMPLATE);
        await expect(view).toContainText(managerDisplay);
        await expect(view).not.toContainText(moderatorDisplay);
        await discussions.close();
        await manager.workflow.openActivityLog();
        await expect(
            manager.workflow.activityLogRow(
                `${moderatorDisplay} (${moderatorName}) was removed from this submission as a Moderator.`
            )
        ).toBeVisible({timeout: 30_000});
        await manager.workflow.closeActivityLog();

        // ── The removed Moderator's landing ──────────────────────────────
        // The workflow address answers the dashboard with the dialog
        // "Error / The current role does not have access to this
        // operation." (Rule 10).
        await moderator.page.goto(moderator.workflow.editorialUrl(seeded.submissionId, 'workflow_5'));
        await expectErrorShell(moderator.workflow, seeded.submissionId, NO_ROLE_ACCESS);

        // ── Control ──────────────────────────────────────────────────────
        // The second Author, assigned with "Message" empty, has no email
        // once the Moderator's has arrived, and no row in their Tasks
        // panel (Side effects).
        expect(await pkpMail.count({to: mailOf(secondAuthorName)})).toBe(0);
        const secondAuthor = await panelAs(asUser, appContext, secondAuthorName, tag);
        const authorTasks = await openTasks(secondAuthor.page, tag, 'mySubmissions');
        await expect(authorTasks.noItems()).toBeVisible();
        await expect(authorTasks.rows()).toHaveCount(0);
        await authorTasks.close();
    });
});
