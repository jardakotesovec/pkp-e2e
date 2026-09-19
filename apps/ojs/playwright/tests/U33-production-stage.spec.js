// @ts-check
/**
 * @file playwright/tests/U33-production-stage.spec.js
 *
 * Production stage — OJS suite, one test per canonical scenario the spec
 * runs on OJS (the five common scenarios and scenario 6, the journal's
 * galley notice; scenario 7 is OMP-only, 8 and 9 OPS-only).
 * Spec: docs/specs/U33-production-stage.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 ❓: S1 reads the recommending Section Editor's panels, "Upload",
 *   "Schedule For Publication" and "Assign" and the absence of "Move To
 *   Copyediting" and of any recommendation control, as the scenario states;
 *   nothing asserts what a recommendation here would do.
 * - A2 ❓: S3 deletes the layout task with the panel's "Delete" and reads
 *   the discussion row staying; nothing asserts what "Galleys Complete" or
 *   a galley does to the task.
 * - A3 ❓: S4 reads the Copyediting entry after the move with no notice box
 *   above "Draft Files", as the scenario states; nothing asserts which
 *   notice a recompute would raise.
 * - A4 ❓: S2 and S4 read "Schedule For Publication" above "The Production
 *   stage has not yet been initiated.", as the scenarios state; nothing
 *   presses it there.
 * - OJS1 ❓: S3 reads the notice standing after the empty-message
 *   assignment and flipping after the "Ready for Production" one; nothing
 *   opens a discussion with no Layout Editor assigned.
 * - OJS2 ❓: S1 reads the galley notice between "Submission published." and
 *   the list on the published article, as the scenario states; nothing
 *   touches "Unpublish".
 * - OMP1, OMP2, OPS1, OPS2, OPS3: other apps' territory.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (A1, A7). Every test seeds its own submission with a unique
 * tag (M5). S3 and S4 run on a scratch journal with throwaway accounts,
 * because each reads a mailbox and Mailpit is shared (A8); their editor is
 * seeded as a participant (nobody is auto-assigned on a scratch journal).
 * The other tests run on the seeded journal with `editor.diana` assigned
 * through `participants[]` (the notice shows only to an assigned editor).
 * A submission reaches Production through `sendToProduction` after an
 * `accept` from a review round (footnote s); S6's galley is seeded through
 * `galleys[]`. Seeded submissions carry no files, so a production ready file
 * is uploaded through "Upload" (S3) or arrives through "Send To Production"
 * recorded on screen after one copyedited file is uploaded on the
 * Copyediting entry (S2, S4). The roster carries no recommend-only
 * assignment: S1 sets the flag on screen through the Participants row's
 * "Edit". Every absence is read settled (an exact heading list, an exact
 * button list, a bounded mail read) and paired with a positive control
 * taken the same way (M4, M6). Waits are web-first (A5). Everything runs in
 * the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');
const {assignParticipant, inMemoryFile, uploadWizardSteps, uploadViaWizard} = require('../pages/ReviewStagePages.js');
const {
    CopyeditingStagePage,
    uploadIntoList,
    stepItems,
    recordDecision,
    leaveCompletion,
    DRAFT_FILES,
    COPYEDITED_FILES,
    DISCUSSIONS: COPYEDITING_DISCUSSIONS,
    SEND_TO_PRODUCTION,
    MOVE_TO_REVIEW,
    IN_PRODUCTION,
} = require('../pages/CopyeditingStagePages.js');
const {
    ProductionStagePage,
    NOTICE_ASSIGN_GALLEYS,
    NOTICE_AWAITING_GALLEYS,
    PRODUCTION_READY_FILES,
    PRODUCTION_DISCUSSIONS,
    PRODUCTION_DESCRIPTION,
    SCHEDULE_FOR_PUBLICATION,
    MOVE_TO_COPYEDITING,
    SUBMISSION_PUBLISHED,
    UPLOAD_WIZARD_TITLE,
} = require('../pages/ProductionStagePages.js');

const JOURNAL = 'publicknowledge';
const EDITOR = 'editor.diana';
const PANELS = [PRODUCTION_READY_FILES, PRODUCTION_DISCUSSIONS, 'Participants'];
const COPYEDITING_PANELS = [DRAFT_FILES, COPYEDITING_DISCUSSIONS, COPYEDITED_FILES, 'Participants'];
const BOTH_BUTTONS = [SCHEDULE_FOR_PUBLICATION, MOVE_TO_COPYEDITING];
const WIZARD_STEPS = ['1. Upload File', '2. Review Details', '3. Confirm'];
const READY_FOR_PRODUCTION = 'Ready for Production';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u33${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway or roster account's address (scenarios.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/**
 * Seed a submission accepted from its Round 1 review and sent to production
 * (footnote s). On the seeded journal the round holds a completed review by
 * `reviewer.julia`; a scratch journal has no reviewer enrolled, so its round
 * holds none. `decisions` without `sendToProduction` leaves it at
 * Copyediting (S2, S4).
 */
async function seedSubmission(ojsApi, tag, {
    context = JOURNAL,
    submitter = 'author.alex',
    participants = [{username: EDITOR, role: 'editor'}],
    reviewers = context === JOURNAL ? [{username: 'reviewer.julia', status: 'completed'}] : [],
    decisions = ['sendExternalReview', 'accept', 'sendToProduction'],
    ...rest
} = {}) {
    return await ojsApi.createSubmission({
        tag,
        context,
        submitter,
        title: `Submission ${tag}`,
        decisions,
        reviewRounds: [{reviewers}],
        participants,
        ...rest,
    });
}

/**
 * A scratch journal for the mail-reading scenarios: one editor, two layout
 * editors and one author, all throwaway. Returns their usernames and
 * display names.
 */
async function seedScratchJournal(ojsApi, tag) {
    const users = {
        editor: {username: `ed${tag}`, givenName: 'Erin', familyName: `Editor ${tag}`, roles: ['editor']},
        layoutOne: {username: `la${tag}`, givenName: 'Lara', familyName: `Layout ${tag}`, roles: ['layoutEditor']},
        layoutTwo: {username: `lb${tag}`, givenName: 'Lena', familyName: `Layout ${tag}`, roles: ['layoutEditor']},
        author: {username: `au${tag}`, givenName: 'Ava', familyName: `Author ${tag}`, roles: ['author']},
    };
    await ojsApi.createContext({tag, users: Object.values(users)});
    const named = {};
    for (const [key, user] of Object.entries(users)) {
        named[key] = {...user, displayName: `${user.givenName} ${user.familyName}`};
    }
    return named;
}

/**
 * Upload one copyedited file on the Copyediting entry and record "Send To
 * Production" on screen with that file ticked (footnote s: a submission
 * that must arrive with a file). Lands on the Production entry.
 */
async function sendToProductionWithFile(page, contextPath, submissionId, file) {
    const copyediting = new CopyeditingStagePage(page, contextPath);
    await copyediting.gotoEditorial(submissionId);
    await uploadIntoList(copyediting, COPYEDITED_FILES, file);
    const decision = await copyediting.openDecision(SEND_TO_PRODUCTION);
    await decision.continueStep();
    await expect(page.getByRole('heading', {name: 'Select Files', exact: true, level: 2})).toBeVisible();
    await decision.promoteFileCheckbox(file.name).check();
    const done = await recordDecision(page, 'Sent to Production');
    await leaveCompletion(page, done);
    const stage = new ProductionStagePage(page, contextPath);
    await stage.frame.expectStage('Production');
    await stage.frame.expectStageHeading('Production');
    return stage;
}

// No default `user` at describe level: every actor is opened through
// `asUser` (as U32 does; a describe-level `test.use({user})` strands the
// later `asUser` session on the shared php -S worker).
test.describe('production stage', () => {
    test('S1: open a submission at Production', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        // The Editor assigned, a Section Editor whose recommend-only flag the
        // test sets on screen (the roster carries none), and manager.maya
        // left unassigned; a second submission published with no galley
        // (footnote s).
        const {submissionId} = await seedSubmission(ojsApi, tag, {
            participants: [
                {username: EDITOR, role: 'editor'},
                {username: 'sectioneditor.omar', role: 'sectionEditor'},
            ],
        });
        const {submissionId: publishedId} = await seedSubmission(ojsApi, `${tag}p`, {
            published: true,
            issue: {volume: 1, number: 2, year: 2014},
        });

        const page = await (await asUser(EDITOR)).newPage();
        const stage = new ProductionStagePage(page, JOURNAL);
        await stage.gotoEditorial(submissionId);

        // The stage: bubble, then top to bottom the notice, the file list
        // with its line, the discussions panel, Participants on the right;
        // the one exact heading list is the settled read of what shows.
        await stage.frame.expectStage('Production');
        await stage.expectPanelHeadings(['Notification', ...PANELS]);
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await expect(stage.panelDescription(PRODUCTION_READY_FILES)).toHaveText(PRODUCTION_DESCRIPTION);
        await expect(stage.frame.participantsHeading()).toBeVisible();

        // The decision buttons: "Schedule For Publication" highlighted, then
        // "Move To Copyediting".
        await stage.expectDecisionButtons(BOTH_BUTTONS);
        await stage.expectHighlighted(SCHEDULE_FOR_PUBLICATION);
        await stage.expectNotHighlighted(MOVE_TO_COPYEDITING);

        // Control: no status box above "Production Ready Files"; the notice
        // takes that slot (read above, the same screen).
        await stage.expectNoStatusBox();

        // "Schedule For Publication": "Title & Abstract" opens under the
        // "Publication" group; "Production" selected again is as before,
        // since the button records no decision.
        await stage.pressScheduleForPublication();
        await stage.selectProduction();
        await stage.frame.expectStage('Production');
        await stage.expectPanelHeadings(['Notification', ...PANELS]);
        await stage.expectDecisionButtons(BOTH_BUTTONS);

        // The Journal Manager not assigned: the same three panels and both
        // buttons, and no notice (the exact heading list, read the same way
        // as the Editor's).
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerStage = new ProductionStagePage(managerPage, JOURNAL);
        await managerStage.gotoEditorial(submissionId);
        await managerStage.expectPanelHeadings(PANELS);
        await managerStage.expectDecisionButtons(BOTH_BUTTONS);

        // The recommending Section Editor: flagged through the Participants
        // row's "Edit Assignment" by the Editor first.
        await stage.setRecommendOnly('Omar Section Editor');
        const omarPage = await (await asUser('sectioneditor.omar')).newPage();
        const omarStage = new ProductionStagePage(omarPage, JOURNAL);
        await omarStage.gotoEditorial(submissionId);
        // The three panels (an assigned editor, so the notice shows to him
        // too; Actors row 2), "Upload" above the list, "Schedule For
        // Publication" alone at the top, "Assign" on Participants, and no
        // recommendation control: the exact button list of one against the
        // manager's list of two read the same way.
        await omarStage.expectPanelHeadings(['Notification', ...PANELS]);
        await expect(omarStage.uploadButton()).toBeVisible();
        await expect(omarStage.frame.participantsAssignButton()).toBeVisible();
        await omarStage.expectDecisionButtons([SCHEDULE_FOR_PUBLICATION]);
        await expect(omarStage.decisionButton(MOVE_TO_COPYEDITING)).toHaveCount(0);
        await expect(omarStage.recommendationControls()).toHaveCount(0);

        // The published submission: "Submission published." above the notice,
        // the list and the discussions panel; "Schedule For Publication" the
        // only button.
        await stage.gotoEditorial(publishedId);
        await stage.frame.expectStatus(SUBMISSION_PUBLISHED);
        await stage.expectPanelHeadings(['Status', 'Notification', ...PANELS]);
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await stage.expectDecisionButtons([SCHEDULE_FOR_PUBLICATION]);
        await expect(stage.decisionButton(MOVE_TO_COPYEDITING)).toHaveCount(0);
    });

    test('S2: arrive through "Send To Production"', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        const copyedited = inMemoryFile(`${tag}copyedited.txt`);
        // At Copyediting, accepted from review (footnote s); the Editor
        // uploads the one copyedited file, "Draft Files" stays empty.
        const {submissionId} = await seedSubmission(ojsApi, tag, {decisions: ['sendExternalReview', 'accept']});

        const page = await (await asUser(EDITOR)).newPage();
        const copyediting = new CopyeditingStagePage(page, JOURNAL);
        await copyediting.gotoEditorial(submissionId);
        await uploadIntoList(copyediting, COPYEDITED_FILES, copyedited);
        await expect(copyediting.noItems(DRAFT_FILES)).toBeVisible();

        // The "Production" entry before the decision: the not-initiated box
        // with "Schedule For Publication" highlighted above it, alone.
        const stage = new ProductionStagePage(page, JOURNAL);
        await stage.selectProduction();
        await stage.expectNotInitiated();
        await stage.expectDecisionButtons([SCHEDULE_FOR_PUBLICATION]);
        await stage.expectHighlighted(SCHEDULE_FOR_PUBLICATION);

        // "Send To Production": "Notify Authors", then "Select Files" with
        // the copyedited file ticked; record it.
        await copyediting.frame.selectStage('Copyediting');
        const decision = await copyediting.openDecision(SEND_TO_PRODUCTION);
        await decision.continueStep();
        await expect(page.getByRole('heading', {name: 'Select Files', exact: true, level: 2})).toBeVisible();
        await decision.promoteFileCheckbox(copyedited.name).check();
        const done = await recordDecision(page, 'Sent to Production');
        await leaveCompletion(page, done);

        // The bubble reads "Production" and the entry lists the file as a
        // row of its own with its number, name, date and type.
        await stage.frame.expectStage('Production');
        await stage.frame.expectStageHeading('Production');
        await stage.expectFileRow(PRODUCTION_READY_FILES, copyedited.name);
        await expect(stage.fileRows(PRODUCTION_READY_FILES)).toHaveCount(1);

        // The notice above the list, under "Notification".
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await expect(stage.noticeHeading()).toBeVisible();

        // The "Copyediting" entry after the decision: no notice box above
        // "Draft Files" any more (the list itself and the stage's status box
        // are the positive reads of the same screen).
        await copyediting.frame.selectStage('Copyediting');
        await copyediting.frame.expectStatusAbovePanel(IN_PRODUCTION, DRAFT_FILES);
        await expect(copyediting.table(DRAFT_FILES)).toBeVisible();
        await expect(copyediting.noticeHeading()).toHaveCount(0);

        // Control: after the decision no status box stands above "Production
        // Ready Files", where before it the entry showed the not-initiated
        // box (the exact heading list: the notice, the panels, nothing else).
        await stage.selectProduction();
        await stage.expectPanelHeadings(['Notification', ...PANELS]);
        await stage.expectNoStatusBox();
        await stage.expectDecisionButtons(BOTH_BUTTONS);
    });

    test('S3: assign a Layout Editor with "Ready for Production"', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        const title = `Submission ${tag}`;
        const file = inMemoryFile(`${tag}layout.txt`);
        const users = await seedScratchJournal(ojsApi, tag);
        const {submissionId} = await seedSubmission(ojsApi, tag, {
            context: tag,
            submitter: users.author.username,
            participants: [{username: users.editor.username, role: 'editor'}],
        });

        const editorPage = await (await asUser(users.editor.username)).newPage();
        const stage = new ProductionStagePage(editorPage, tag);
        await stage.gotoEditorial(submissionId);
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await expect(stage.noItems(PRODUCTION_READY_FILES)).toBeVisible();

        // "Assign" with the message box empty: the first Layout Editor, no
        // predefined message; the notice still reads "Assign a user…".
        await assignParticipant(editorPage, {
            group: 'Layout Editor',
            name: users.layoutOne.displayName,
            searchName: 'Lara',
        });
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await stage.reland();
        await expect(stage.participantRow(users.layoutOne.displayName)).toBeVisible();
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);

        // "Assign" with "Ready for Production": on the same page the notice
        // reads "Awaiting Galleys.", and the discussions panel lists the
        // discussion (read after a re-landing, since a closed legacy window
        // hides the tables from role queries).
        await assignParticipant(editorPage, {
            group: 'Layout Editor',
            name: users.layoutTwo.displayName,
            searchName: 'Lena',
            template: READY_FOR_PRODUCTION,
        });
        await stage.expectNotice(NOTICE_AWAITING_GALLEYS);
        await stage.reland();
        await expect(stage.participantRow(users.layoutTwo.displayName)).toBeVisible();
        await expect(stage.discussionRow(READY_FOR_PRODUCTION)).toHaveCount(1);

        // The second Layout Editor's mailbox: "Ready for Production" from the
        // assigning editor, ending with the reply line, whose link opens the
        // submission's workflow, and an unsubscribe link.
        const message = await pkpMail.find({to: mailOf(users.layoutTwo.username), subject: READY_FOR_PRODUCTION});
        expect(message.From.Address).toBe(mailOf(users.editor.username));
        const full = await pkpMail.fullMessage(message.ID);
        const replyLine = full.Text.match(/Reply to this comment at #(\d+)\s+([^(]*?)\s*\(\s*(\S+?)\s*\)/);
        expect(replyLine, 'the reply line with its link').not.toBeNull();
        expect(replyLine[1]).toBe(String(submissionId));
        // The line's `{authors}` is the authors' family names ("Author u33…").
        expect(replyLine[2]).toContain(users.author.familyName);
        expect(full.Text).toMatch(/unsubscribe\s*\(\s*\S+\s*\)/i);
        const layoutPage = await (await asUser(users.layoutTwo.username)).newPage();
        const replyUrl = new URL(replyLine[3]);
        await layoutPage.goto(replyUrl.pathname + replyUrl.search);
        const layoutStage = new ProductionStagePage(layoutPage, tag);
        await layoutStage.frame.expectOpen(submissionId);

        // The second Layout Editor's Tasks panel: the discussion row and the
        // task row; "Delete" on the task removes it and the discussion stays.
        await layoutPage.goto(`/index.php/${tag}/dashboard/editorial`);
        const tasks = new TasksPanel(layoutPage);
        await tasks.open();
        const discussionRow = tasks
            .row(`${users.editor.displayName} started a discussion: ${READY_FOR_PRODUCTION}`)
            .filter({hasText: title});
        const taskRow = tasks.row('You have been asked to review layouts for').filter({hasText: title});
        await expect(discussionRow).toHaveCount(1);
        await expect(taskRow).toHaveCount(1);
        await expect(tasks.rows()).toHaveCount(2);
        await tasks.box(taskRow).check();
        await tasks.act('Delete');
        await expect(taskRow).toHaveCount(0);
        await expect(discussionRow).toHaveCount(1);
        await tasks.close();

        // The second Layout Editor's stage: the three panels, "Upload" above
        // the list, "Schedule For Publication" alone; no "Move To
        // Copyediting" and no notice box (the exact lists).
        await layoutStage.gotoEditorial(submissionId);
        await layoutStage.expectPanelHeadings(PANELS);
        await expect(layoutStage.uploadButton()).toBeVisible();
        await layoutStage.expectDecisionButtons([SCHEDULE_FOR_PUBLICATION]);
        await expect(layoutStage.decisionButton(MOVE_TO_COPYEDITING)).toHaveCount(0);
        await expect(layoutStage.noticeHeading()).toHaveCount(0);

        // "Upload": the wizard with its three steps; "Complete" lists the
        // file at once; the name downloads it; "Download All Files" one zip.
        const wizard = await layoutStage.openUploadWizard();
        await expect(wizard.getByRole('heading', {level: 1})).toHaveText(UPLOAD_WIZARD_TITLE);
        await expect(uploadWizardSteps(wizard)).toHaveText(WIZARD_STEPS);
        await uploadViaWizard(layoutPage, {file});
        const row = await layoutStage.expectFileRow(PRODUCTION_READY_FILES, file.name);
        expect(await layoutStage.downloadFile(row)).toBe(file.name);
        expect(await layoutStage.downloadAll()).toMatch(/production-ready-files\.zip$/);

        // The Editor's screen after the upload: the notice still reads
        // "Awaiting Galleys." (a file here changes no notice).
        await stage.gotoEditorial(submissionId);
        await stage.expectNotice(NOTICE_AWAITING_GALLEYS);
        await expect(stage.fileRow(PRODUCTION_READY_FILES, file.name)).toBeVisible();

        // Control: the first Layout Editor, assigned with the message box
        // left empty, received nothing, bounded by the second's email taken
        // the same way, and has no row in the Tasks panel.
        await pkpMail.expectNone({
            to: mailOf(users.layoutOne.username),
            afterControl: {to: mailOf(users.layoutTwo.username), subject: READY_FOR_PRODUCTION},
        });
        const firstPage = await (await asUser(users.layoutOne.username)).newPage();
        await firstPage.goto(`/index.php/${tag}/dashboard/editorial`);
        const firstTasks = new TasksPanel(firstPage);
        await firstTasks.open();
        await expect(firstTasks.noItems()).toBeVisible();
        await expect(firstTasks.rows()).toHaveCount(0);
    });

    test('S4: "Move To Copyediting"', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const title = `Submission ${tag}`;
        const copyedited = inMemoryFile(`${tag}copyedited.txt`);
        const users = await seedScratchJournal(ojsApi, tag);
        // At Copyediting (footnote s); one copyedited file uploaded and "Send
        // To Production" recorded on screen with it ticked.
        const {submissionId} = await seedSubmission(ojsApi, tag, {
            context: tag,
            submitter: users.author.username,
            participants: [{username: users.editor.username, role: 'editor'}],
            decisions: ['sendExternalReview', 'accept'],
        });

        const page = await (await asUser(users.editor.username)).newPage();
        const stage = await sendToProductionWithFile(page, tag, submissionId, copyedited);

        // Control first: the entry lists the file, shows the discussions
        // panel under it and offers both buttons.
        await stage.expectPanelHeadings(['Notification', ...PANELS]);
        await expect(stage.fileRow(PRODUCTION_READY_FILES, copyedited.name)).toBeVisible();
        await stage.expectDecisionButtons(BOTH_BUTTONS);

        // The wizard: the "Notify Authors" page alone (one step, no
        // "Continue"; "Record Decision" is the positive read of the footer).
        const decision = await stage.openDecision(MOVE_TO_COPYEDITING);
        await expect(stepItems(page)).toHaveText([/Notify Authors/]);
        await expect(page.getByRole('heading', {name: 'Notify Authors', exact: true, level: 2})).toBeVisible();
        await expect(decision.recordButton).toBeVisible();
        await expect(decision.continueButton).toHaveCount(0);
        const done = await recordDecision(page, 'Moved to Copyediting');
        await expect(done).toContainText(
            `The submission, ${title}, was moved to the copyediting stage. The author has been notified, unless you chose to skip that email.`
        );
        await leaveCompletion(page, done);

        // Where it lands: the bubble reads "Copyediting"; the entry shows
        // the two lists with the files they held (the copyedited file, no
        // draft file), both buttons again and no notice box above "Draft
        // Files" (the exact heading list).
        const copyediting = new CopyeditingStagePage(page, tag);
        await copyediting.frame.expectStage('Copyediting');
        await copyediting.frame.expectStageHeading('Copyediting');
        await copyediting.expectPanelHeadings(COPYEDITING_PANELS);
        await expect(copyediting.fileRow(COPYEDITED_FILES, copyedited.name)).toBeVisible();
        await expect(copyediting.noItems(DRAFT_FILES)).toBeVisible();
        await copyediting.expectDecisionButtons([SEND_TO_PRODUCTION, MOVE_TO_REVIEW]);
        await expect(copyediting.noticeHeading()).toHaveCount(0);

        // The "Production" entry: the not-initiated box with "Schedule For
        // Publication" highlighted above it and Participants with "Assign",
        // and nothing else: no file list, no discussions panel.
        await stage.selectProduction();
        await stage.expectNotInitiated();
        await stage.expectPanelHeadings(['Status', 'Participants']);
        await stage.expectDecisionButtons([SCHEDULE_FOR_PUBLICATION]);
        await stage.expectHighlighted(SCHEDULE_FOR_PUBLICATION);
        await expect(stage.frame.participantsAssignButton()).toBeVisible();
        await expect(stage.frame.panelTables()).toHaveCount(0);
        await expect(stage.table(PRODUCTION_READY_FILES)).toHaveCount(0);
        await expect(stage.table(PRODUCTION_DISCUSSIONS)).toHaveCount(0);

        // The Author's mailbox.
        const message = await pkpMail.find({
            to: mailOf(users.author.username),
            subject: 'Your submission has been moved to copyediting',
        });
        expect(message.From.Address).toBe(mailOf(users.editor.username));
    });

    test("S5: the author's view", async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await seedSubmission(ojsApi, tag);

        // Control: the Editor's entry shows the list, Participants and both
        // buttons (the exact lists the author's absences are read against).
        const editorPage = await (await asUser(EDITOR)).newPage();
        const editorStage = new ProductionStagePage(editorPage, JOURNAL);
        await editorStage.gotoEditorial(submissionId);
        await editorStage.expectPanelHeadings(['Notification', ...PANELS]);
        await expect(editorStage.frame.participantsHeading()).toBeVisible();
        await editorStage.expectDecisionButtons(BOTH_BUTTONS);

        // The Author: the discussions panel and nothing else.
        const authorPage = await (await asUser('author.alex')).newPage();
        const stage = new ProductionStagePage(authorPage, JOURNAL);
        await stage.gotoAuthor(submissionId);
        await stage.frame.expectStage('Production');
        await stage.expectPanelHeadings([PRODUCTION_DISCUSSIONS]);
        await expect(stage.table(PRODUCTION_DISCUSSIONS)).toBeVisible();
        await expect(stage.frame.panelTables()).toHaveCount(1);
        await expect(stage.table(PRODUCTION_READY_FILES)).toHaveCount(0);
        await expect(stage.uploadButton()).toHaveCount(0);
        await expect(stage.frame.participantsHeading()).toHaveCount(0);
        await expect(stage.frame.participantsAssignButton()).toHaveCount(0);
        await expect(stage.noticeHeading()).toHaveCount(0);
        await stage.expectDecisionButtons([]);
        await expect(stage.decisionButton(SCHEDULE_FOR_PUBLICATION)).toHaveCount(0);
        await expect(stage.decisionButton(MOVE_TO_COPYEDITING)).toHaveCount(0);
    });

    test('S6: no notice once a galley exists', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        // One Production seed whose newest version carries a galley (the
        // `galleys[]` key), and a second with none (footnote s).
        const {submissionId: withGalley, galleys} = await seedSubmission(ojsApi, tag, {
            galleys: [{label: 'PDF', file: 'article.pdf'}],
        });
        expect(galleys).toHaveLength(1);
        const {submissionId: withoutGalley} = await seedSubmission(ojsApi, `${tag}n`);

        const page = await (await asUser(EDITOR)).newPage();
        const stage = new ProductionStagePage(page, JOURNAL);

        // The submission with a galley: no notice box above the list; the
        // list, the discussions panel and both buttons as usual (the exact
        // heading list).
        await stage.gotoEditorial(withGalley);
        await stage.frame.expectStage('Production');
        await stage.expectPanelHeadings(PANELS);
        await expect(stage.noticeHeading()).toHaveCount(0);
        await expect(stage.table(PRODUCTION_READY_FILES)).toBeVisible();
        await expect(stage.table(PRODUCTION_DISCUSSIONS)).toBeVisible();
        await stage.expectDecisionButtons(BOTH_BUTTONS);

        // Control: the second submission's entry shows the notice under
        // "Notification" above the list, read the same way.
        await stage.gotoEditorial(withoutGalley);
        await stage.expectPanelHeadings(['Notification', ...PANELS]);
        await stage.expectNotice(NOTICE_ASSIGN_GALLEYS);
        await stage.expectDecisionButtons(BOTH_BUTTONS);
    });
});
