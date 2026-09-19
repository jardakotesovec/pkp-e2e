// @ts-check
/**
 * @file playwright/tests/U33-production-stage.spec.js
 *
 * U33 — Production stage, OMP suite (spec:
 * docs/specs/U33-production-stage.md). One test per canonical scenario the
 * spec runs on a press, in the press's own words (Press Manager, Press
 * Editor, Series editor, monograph): the common scenarios 1–5 and the
 * press-only scenario 7 (the press's notice box, OMP1). Scenario 6 is
 * OJS's, 8 and 9 OPS's.
 *
 * Not covered, by register ID (the spec's Coverage section is the record
 * of everything else left out): A1 ❓ (S1 reads the recommending Series
 * editor's panels, "Upload", "Schedule For Publication" and "Assign" and
 * the absence of "Move To Copyediting" and of any recommendation control;
 * nothing asserts what a recommendation here would do), A2 ❓ (S3 deletes
 * the layout task with the panel's "Delete" and reads the discussion row
 * staying; nothing about "Galleys Complete"), A3 ❓ (S4 reads the
 * Copyediting entry after the move with no notice box; nothing about a
 * recompute), A4 ❓ (S2 and S4 read "Schedule For Publication" above "The
 * Production stage has not yet been initiated."; nothing presses it there),
 * OMP2 🐞 (nothing touches "Unpublish"; S7 reads "Catalog Management" on
 * a seed-published monograph only). OMP1 ✅ is asserted in S1, S2, S3, S5
 * and S7 (the press notice for every role, the author's included, and no
 * journal notice anywhere). OJS1, OJS2, OPS1–OPS3: other apps' territory.
 *
 * Seeding: scenario endpoints only; scratch monographs ride the read-only
 * `publicknowledge` press in series `monographs` (its submit-time
 * auto-assignment enrols `editor.diana`, the assigned Press Editor of every
 * seeded-press scenario, and `manager.maya` is the unassigned Press
 * Manager); a monograph at Production is `['skipInternalReview', 'accept',
 * 'sendToProduction']` (footnote s; the press's route through an external
 * round). Seeded submissions carry no files, so a production ready file is
 * uploaded through "Upload" (S3) or arrives through "Send To Production"
 * recorded on screen after one copyedited file is uploaded on the
 * Copyediting entry (S2, S4). The roster carries no recommend-only
 * assignment: S1 assigns `sectioneditor.ravi` (Series editor of
 * `textbooks`, so not auto-assigned) through the "Assign" form with the
 * "Assignment privileges" box, as U32 does. S3 and S4 read a mailbox and
 * run each on its own scratch press with throwaway accounts (Mailpit is
 * shared across fleets: every mail claim is scoped by a recipient address
 * naming app and test, A8), the throwaway editor assigned in the seed since
 * a scratch press auto-assigns nobody. Every absence is a settled read (an
 * exact heading list, an exact button list, a bounded mail read) paired
 * with a positive control taken the same way (M4, M6). Waits are web-first
 * (A5). Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    primaryRegion,
    actionsRegion,
    decisionButton,
    openEditorial,
    expectPlainStatus,
    assignParticipant,
    expectStageLabel,
} = require('../pages/ReviewStagePages.js');
const {
    LISTS,
    COMPLETIONS,
    FILE_COLUMNS,
    UPLOAD_WIZARD_STEPS,
    STAGE_STATUS,
    selectStage,
    noticeHeading,
    expectNoNotice,
    statusHeading,
    fileList,
    listHeading,
    fileRow,
    fileRows,
    columnHeaders,
    participantsPanel,
    participantsHeading,
    uploadIntoList,
    wizardSteps,
    viewSubmissionSummary,
    startSendToProduction,
    wizardFileBox,
    recordAndExpectCompletion,
    expectDecisionButtons: expectCopyeditingButtons,
} = require('../pages/CopyeditingStagePages.js');
const {
    PRODUCTION_DECISIONS,
    PRESS_NOTICES,
    PRODUCTION_STATUS,
    PRODUCTION_READY_FILES,
    PRODUCTION_DISCUSSIONS,
    UPLOAD_WIZARD_TITLE,
    MOVED_TO_COPYEDITING,
    READY_FOR_PRODUCTION,
    openProduction,
    openAuthorProduction,
    expectPressNotice,
    expectNoJournalNotice,
    productionHeadings,
    listDescription,
    uploadButton,
    openUploadWizard,
    completeProductionUpload,
    downloadFile,
    downloadAll,
    productionFilesList,
    discussionsPanel,
    discussionRow,
    expectDecisionButtons,
    expectHighlighted,
    expectNotHighlighted,
    recommendationControls,
    pressScheduleForPublication,
    startMoveToCopyediting,
} = require('../pages/ProductionStagePages.js');
const {TasksPanel} = require('../../../../shared/playwright/pages/NotificationsPages.js');

const PK = 'publicknowledge';
const EDITOR = 'editor.diana';

/** The press's route into Copyediting through an external round, and on to Production (footnote s). */
const TO_COPYEDITING = ['skipInternalReview', 'accept'];
const TO_PRODUCTION = [...TO_COPYEDITING, 'sendToProduction'];

/** The main column of an active, unpublished monograph (Rules 1, 3d). */
const ACTIVE_HEADINGS = [PRESS_NOTICES.awaiting.heading, PRODUCTION_READY_FILES, PRODUCTION_DISCUSSIONS];
const BOTH_BUTTONS = [PRODUCTION_DECISIONS.schedule, PRODUCTION_DECISIONS.moveToCopyediting];

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/**
 * Seed a monograph on publicknowledge in series `monographs` (submit-time
 * auto-assignment enrols the seeded Press Editor), at Production unless
 * `decisions` says otherwise.
 */
async function seedMonograph(ompApi, tag, {decisions = TO_PRODUCTION, participants = null, ...rest} = {}) {
    const spec = {tag, context: PK, submitter: 'author.alex', series: 'monographs', decisions, ...rest};
    if (participants) {
        spec.participants = participants;
    }
    return ompApi.createSubmission(spec);
}

/**
 * A scratch press for the mail-reading scenarios: a throwaway Press Editor
 * and Author and, when asked, two Layout Editors; one monograph with the
 * editor assigned (a scratch press assigns nobody on submit).
 */
async function seedScratchPress(ompApi, tag, {layoutEditors = false, decisions = TO_PRODUCTION} = {}) {
    const user = (key, given, family, roles) => ({
        username: `${tag}${key}`,
        roles,
        givenName: `${given}${tag}`,
        familyName: family,
        email: `${tag}${key}@mail.test`,
        displayName: `${given}${tag} ${family}`,
    });
    const press = {
        tag,
        editor: user('ed', 'Ed', 'Editor', ['editor']),
        author: user('au', 'Au', `Author ${tag}`, ['author']),
    };
    if (layoutEditors) {
        press.layoutOne = user('la', 'La', 'Layout', ['layoutEditor']);
        press.layoutTwo = user('lb', 'Lb', 'Layout', ['layoutEditor']);
    }
    const users = Object.values(press)
        .filter((u) => typeof u === 'object')
        .map(({displayName, ...u}) => u);
    await ompApi.createContext({tag, users});
    const seeded = await ompApi.createSubmission({
        tag,
        context: tag,
        submitter: press.author.username,
        decisions,
        participants: [{username: press.editor.username, role: 'editor'}],
    });
    return {...press, submissionId: seeded.submissionId, title: `Submission ${tag}`};
}

test.describe('Production stage (U33)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: open a monograph at Production', {tag: '@smoke'}, async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s1');
        // The Press Editor auto-assigned, manager.maya unassigned; a second
        // monograph published (footnote s).
        const seeded = await seedMonograph(ompApi, tag);
        const published = await seedMonograph(ompApi, `${tag}p`, {published: true});

        // The Press Editor: the bubble, then top to bottom the notice, the
        // list with its line, the discussions panel; Participants on the
        // right. The one exact heading list is the settled read of what
        // shows.
        const page = await (await asUser(EDITOR)).newPage();
        const modal = await openProduction(page, PK, seeded.submissionId);
        await expectStageLabel(modal, 'Production');
        await expect(productionHeadings(modal)).toHaveText(ACTIVE_HEADINGS);
        await expectPressNotice(modal, PRESS_NOTICES.awaiting);
        await expect(listDescription(modal)).toBeVisible();
        await expect(participantsHeading(modal)).toBeVisible();

        // The decision buttons: "Schedule For Publication" highlighted,
        // then "Move To Copyediting".
        await expectDecisionButtons(modal, BOTH_BUTTONS);
        await expectHighlighted(modal, PRODUCTION_DECISIONS.schedule);
        await expectNotHighlighted(modal, PRODUCTION_DECISIONS.moveToCopyediting);

        // Control: no status box above "Production Ready Files"; the notice
        // takes that slot (read above, the same screen); no journal notice.
        await expect(statusHeading(modal)).toHaveCount(0);
        await expectNoJournalNotice(modal);

        // "Schedule For Publication": "Title & Abstract" opens under the
        // "Publication" group; "Production" selected again is as before,
        // since the button records no decision.
        await pressScheduleForPublication(modal);
        await selectStage(modal, 'Production');
        await expectStageLabel(modal, 'Production');
        await expect(productionHeadings(modal)).toHaveText(ACTIVE_HEADINGS);
        await expectDecisionButtons(modal, BOTH_BUTTONS);

        // The Press Manager not assigned: the same three panels, both
        // buttons and the same "Awaiting approval." box (read the same way
        // as the Press Editor's).
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const mayaModal = await openProduction(mayaPage, PK, seeded.submissionId);
        await expect(productionHeadings(mayaModal)).toHaveText(ACTIVE_HEADINGS);
        await expect(participantsHeading(mayaModal)).toBeVisible();
        await expectDecisionButtons(mayaModal, BOTH_BUTTONS);
        await expectPressNotice(mayaModal, PRESS_NOTICES.awaiting);

        // The recommending Series editor: `sectioneditor.ravi` (Series
        // editor of `textbooks`, so not auto-assigned) assigned through
        // "Assign" with "Assignment privileges" limited to recommendations.
        await assignParticipant(page, modal, {
            group: 'Series editor',
            query: 'ravi',
            resultName: 'Ravi Section Editor',
            recommendOnly: true,
        });
        const raviPage = await (await asUser('sectioneditor.ravi')).newPage();
        const raviModal = await openProduction(raviPage, PK, seeded.submissionId);
        // The three panels, "Upload" above the list, "Schedule For
        // Publication" alone at the top, "Assign" on Participants, and no
        // recommendation control: the exact button list of one against the
        // manager's list of two read the same way.
        await expect(productionHeadings(raviModal)).toHaveText(ACTIVE_HEADINGS);
        await expect(uploadButton(raviModal)).toBeVisible();
        await expect(participantsPanel(raviModal).getByRole('button', {name: 'Assign', exact: true})).toBeVisible();
        await expectDecisionButtons(raviModal, [PRODUCTION_DECISIONS.schedule]);
        await expect(decisionButton(raviModal, PRODUCTION_DECISIONS.moveToCopyediting)).toHaveCount(0);
        await expect(recommendationControls(raviModal)).toHaveCount(0);

        // The published monograph: "Submission published." above the
        // "Catalog Management" box, the list and the discussions panel;
        // "Schedule For Publication" the only button.
        const pubModal = await openProduction(page, PK, published.submissionId);
        await expectPlainStatus(pubModal, PRODUCTION_STATUS.published);
        await expect(productionHeadings(pubModal)).toHaveText([
            'Status',
            PRESS_NOTICES.catalog.heading,
            PRODUCTION_READY_FILES,
            PRODUCTION_DISCUSSIONS,
        ]);
        await expectPressNotice(pubModal, PRESS_NOTICES.catalog);
        await expectDecisionButtons(pubModal, [PRODUCTION_DECISIONS.schedule]);
        await expect(decisionButton(pubModal, PRODUCTION_DECISIONS.moveToCopyediting)).toHaveCount(0);
    });

    test('S2: arrive through "Send To Production"', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s2');
        const copyedited = `copyedited-${tag}.txt`;
        // At Copyediting, accepted from review; the Press Editor uploads the
        // one copyedited file, "Draft Files" stays empty.
        const seeded = await seedMonograph(ompApi, tag, {decisions: TO_COPYEDITING});

        const page = await (await asUser(EDITOR)).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await expectStageLabel(modal, 'Copyediting');
        await uploadIntoList(page, modal, LISTS.copyedited, copyedited);
        await expect(fileRows(modal, LISTS.draft)).toHaveCount(0);

        // The "Production" entry before the decision: the not-initiated
        // box with "Schedule For Publication" highlighted above it, alone.
        await selectStage(modal, 'Production');
        await expectPlainStatus(modal, PRODUCTION_STATUS.notInitiated);
        await expectDecisionButtons(modal, [PRODUCTION_DECISIONS.schedule]);
        await expectHighlighted(modal, PRODUCTION_DECISIONS.schedule);

        // "Send To Production": "Notify Authors", then "Select Files" with
        // the copyedited file ticked; record it.
        await selectStage(modal, 'Copyediting');
        await startSendToProduction(page, modal);
        if (!(await wizardFileBox(page, copyedited).isChecked())) {
            await wizardFileBox(page, copyedited).check();
        }
        await recordAndExpectCompletion(page, {
            title: COMPLETIONS.sentToProduction.title,
            message: COMPLETIONS.sentToProduction.message(`Submission ${tag}`),
        });
        const landed = await viewSubmissionSummary(page);

        // The bubble reads "Production" and the entry lists the file as a
        // row of its own with the four columns.
        await expect(landed.getByRole('heading', {name: 'Workflow: Production'})).toBeVisible();
        await expectStageLabel(landed, 'Production');
        await expect(fileRow(landed, PRODUCTION_READY_FILES, copyedited).first()).toBeVisible({timeout: 20_000});
        await expect(fileRows(landed, PRODUCTION_READY_FILES)).toHaveCount(1);
        await expect(columnHeaders(landed, PRODUCTION_READY_FILES)).toContainText(FILE_COLUMNS);

        // The notice above the list: "Awaiting approval.", as before the
        // decision (OMP1); no journal notice.
        await expectPressNotice(landed, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(landed);

        // The "Copyediting" entry after the decision: the stage's status
        // box above "Draft Files" and no "Notification" box (the list is
        // the positive read of the same screen).
        await selectStage(landed, 'Copyediting');
        await expectPlainStatus(landed, STAGE_STATUS.inProduction);
        await expect(fileList(landed, LISTS.draft)).toBeVisible();
        await expect(noticeHeading(landed)).toHaveCount(0);

        // Control: after the decision no status box stands above
        // "Production Ready Files", where before it the entry showed the
        // not-initiated box (the exact heading list: the notice, the
        // panels, nothing else); both buttons.
        await selectStage(landed, 'Production');
        await expect(productionHeadings(landed)).toHaveText(ACTIVE_HEADINGS);
        await expect(statusHeading(landed)).toHaveCount(0);
        await expectDecisionButtons(landed, BOTH_BUTTONS);
    });

    test('S3: assign a Layout Editor with "Ready for Production"', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s3');
        const fileName = `layout-${tag}.txt`;
        const press = await seedScratchPress(ompApi, tag, {layoutEditors: true});

        const page = await (await asUser(press.editor.username)).newPage();
        const modal = await openProduction(page, tag, press.submissionId);
        await expectPressNotice(modal, PRESS_NOTICES.awaiting);
        await expect(fileRows(modal, PRODUCTION_READY_FILES)).toHaveCount(0);

        // "Assign" with the message box empty: the first Layout Editor, no
        // predefined message; the box still reads "Awaiting approval."
        // (OMP1), no journal notice.
        await assignParticipant(page, modal, {
            group: 'Layout Editor',
            query: press.layoutOne.givenName,
            resultName: press.layoutOne.displayName,
        });
        await expectPressNotice(modal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(modal);

        // "Assign" with "Ready for Production": the second Layout Editor;
        // the box still reads "Awaiting approval." and the discussions
        // panel lists the discussion.
        await assignParticipant(page, modal, {
            group: 'Layout Editor',
            query: press.layoutTwo.givenName,
            resultName: press.layoutTwo.displayName,
            template: READY_FOR_PRODUCTION.template,
        });
        await expectPressNotice(modal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(modal);
        await expect(discussionRow(modal, READY_FOR_PRODUCTION.template).first()).toBeVisible({timeout: 20_000});

        // The second Layout Editor's mailbox: "Ready for Production" from
        // the assigning editor, ending with the reply line (its `{authors}`
        // rendered as the authors' family names), whose link opens the
        // monograph's workflow, and an unsubscribe link.
        const mail = await pkpMail.find({to: press.layoutTwo.email, subject: READY_FOR_PRODUCTION.subject});
        expect(mail.From.Address).toBe(press.editor.email);
        const full = await pkpMail.fullMessage(mail.ID);
        const replyLine = full.Text.match(/Reply to this comment at #(\d+)\s+([^(]*?)\s*\(\s*(\S+?)\s*\)/);
        expect(replyLine, 'the reply line with its link').not.toBeNull();
        expect(replyLine[1]).toBe(String(press.submissionId));
        expect(replyLine[2]).toContain(press.author.familyName);
        expect(full.Text).toMatch(/unsubscribe\s*\(\s*\S+\s*\)/i);
        const layoutPage = await (await asUser(press.layoutTwo.username)).newPage();
        const replyUrl = new URL(replyLine[3]);
        await layoutPage.goto(replyUrl.pathname + replyUrl.search);
        await expect(layoutPage).toHaveURL(new RegExp(`workflowSubmissionId=${press.submissionId}\\b`));
        await expect(layoutPage.locator('[data-cy="active-modal"]').first().getByRole('heading', {name: /^Workflow:/}).first()).toBeVisible({timeout: 20_000});

        // The second Layout Editor's Tasks panel: the discussion row and
        // the task row; "Delete" on the task removes it and the discussion
        // stays.
        await layoutPage.goto(`/index.php/${tag}/en/dashboard/editorial`);
        const tasks = new TasksPanel(layoutPage);
        await tasks.open();
        const discussionTaskRow = tasks
            .row(`${press.editor.displayName} started a discussion: ${READY_FOR_PRODUCTION.template}`)
            .filter({hasText: press.title});
        const taskRow = tasks.row(READY_FOR_PRODUCTION.task(press.title));
        await expect(discussionTaskRow).toHaveCount(1);
        await expect(taskRow).toHaveCount(1);
        await expect(tasks.rows()).toHaveCount(2);
        await tasks.box(taskRow).check();
        await tasks.act('Delete');
        await expect(taskRow).toHaveCount(0);
        await expect(discussionTaskRow).toHaveCount(1);
        await tasks.close();

        // The second Layout Editor's stage: the box and the three panels,
        // "Upload" above the list, "Schedule For Publication" alone; no
        // "Move To Copyediting" and no journal notice (the exact lists).
        const layoutModal = await openProduction(layoutPage, tag, press.submissionId);
        await expect(productionHeadings(layoutModal)).toHaveText(ACTIVE_HEADINGS);
        await expect(participantsHeading(layoutModal)).toBeVisible();
        await expect(uploadButton(layoutModal)).toBeVisible();
        await expectDecisionButtons(layoutModal, [PRODUCTION_DECISIONS.schedule]);
        await expect(decisionButton(layoutModal, PRODUCTION_DECISIONS.moveToCopyediting)).toHaveCount(0);
        await expectNoJournalNotice(layoutModal);

        // "Upload": the wizard with its title and three steps; "Complete"
        // lists the file at once with the four columns; the name downloads
        // it; "Download All Files" one zip.
        const wizard = await openUploadWizard(layoutPage, layoutModal);
        await expect(layoutPage.getByRole('dialog', {name: UPLOAD_WIZARD_TITLE, exact: true})).toBeVisible();
        await expect(wizard.getByRole('tab')).toHaveText(UPLOAD_WIZARD_STEPS);
        await completeProductionUpload(layoutPage, layoutModal, wizard, fileName);
        await expect(columnHeaders(layoutModal, PRODUCTION_READY_FILES)).toContainText(FILE_COLUMNS);
        expect(await downloadFile(layoutPage, layoutModal, fileName)).toBe(fileName);
        expect(await downloadAll(layoutPage, layoutModal)).toMatch(/production-ready-files\.zip$/);

        // The Press Editor's screen after the upload: the file listed and
        // the box unchanged (a file here changes no notice).
        const modal2 = await openProduction(page, tag, press.submissionId);
        await expect(fileRow(modal2, PRODUCTION_READY_FILES, fileName).first()).toBeVisible({timeout: 20_000});
        await expectPressNotice(modal2, PRESS_NOTICES.awaiting);

        // Control: the first Layout Editor, assigned with the message box
        // left empty, received nothing, bounded by the second's email
        // taken the same way, and has no row in the Tasks panel.
        await pkpMail.expectNone({
            to: press.layoutOne.email,
            afterControl: {to: press.layoutTwo.email, subject: READY_FOR_PRODUCTION.subject},
        });
        const firstPage = await (await asUser(press.layoutOne.username)).newPage();
        await firstPage.goto(`/index.php/${tag}/en/dashboard/editorial`);
        const firstTasks = new TasksPanel(firstPage);
        await firstTasks.open();
        await expect(firstTasks.noItems()).toBeVisible();
        await expect(firstTasks.rows()).toHaveCount(0);
    });

    test('S4: "Move To Copyediting"', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s4');
        const copyedited = `copyedited-${tag}.txt`;
        // At Copyediting; one copyedited file uploaded and "Send To
        // Production" recorded on screen with it ticked.
        const press = await seedScratchPress(ompApi, tag, {decisions: TO_COPYEDITING});

        const page = await (await asUser(press.editor.username)).newPage();
        const modal = await openEditorial(page, tag, press.submissionId);
        await expectStageLabel(modal, 'Copyediting');
        await uploadIntoList(page, modal, LISTS.copyedited, copyedited);
        await startSendToProduction(page, modal);
        if (!(await wizardFileBox(page, copyedited).isChecked())) {
            await wizardFileBox(page, copyedited).check();
        }
        await recordAndExpectCompletion(page, {
            title: COMPLETIONS.sentToProduction.title,
            message: COMPLETIONS.sentToProduction.message(press.title),
        });
        const landed = await viewSubmissionSummary(page);
        await expect(landed.getByRole('heading', {name: 'Workflow: Production'})).toBeVisible();
        await expectStageLabel(landed, 'Production');

        // Control first: the entry lists the file, shows the discussions
        // panel under it and offers both buttons.
        await expect(productionHeadings(landed)).toHaveText(ACTIVE_HEADINGS);
        await expect(fileRow(landed, PRODUCTION_READY_FILES, copyedited).first()).toBeVisible({timeout: 20_000});
        await expect(discussionsPanel(landed)).toBeVisible();
        await expectDecisionButtons(landed, BOTH_BUTTONS);

        // The wizard: the "Notify Authors" page alone (one step, no
        // "Continue"; "Record Decision" is the positive read of the
        // footer); the completion dialog.
        await startMoveToCopyediting(page, landed);
        await expect(page.getByRole('heading', {name: 'Notify Authors', exact: true, level: 2})).toBeVisible();
        await expect(wizardSteps(page).filter({hasText: 'Select Files'})).toHaveCount(0);
        await expect(page.getByRole('button', {name: 'Record Decision', exact: true})).toBeVisible();
        await expect(page.getByRole('button', {name: 'Continue', exact: true})).toHaveCount(0);
        await recordAndExpectCompletion(page, {
            title: MOVED_TO_COPYEDITING.title,
            message: MOVED_TO_COPYEDITING.message(press.title),
        });

        // Where it lands: the bubble reads "Copyediting"; the entry shows
        // the two lists with the files they held (the copyedited file, no
        // draft file), both buttons again and no notice box (the exact
        // heading list; the discussions panel read by its suffix, since
        // the entry showed it headed "Production Tasks & Discussions"
        // after a move back in U32, its T-omp-2).
        const back = await viewSubmissionSummary(page);
        await expect(back.getByRole('heading', {name: 'Workflow: Copyediting'})).toBeVisible();
        await expectStageLabel(back, 'Copyediting');
        await expect(
            primaryRegion(back).getByRole('heading', {name: /^(Notification|Status|Draft Files|.* Tasks & Discussions|Copyedited Files)$/})
        ).toHaveText([LISTS.draft, /Tasks & Discussions$/, LISTS.copyedited]);
        await expect(fileRow(back, LISTS.copyedited, copyedited).first()).toBeVisible();
        await expect(fileRows(back, LISTS.draft)).toHaveCount(0);
        await expectCopyeditingButtons(back);
        await expectNoNotice(back);

        // The "Production" entry: the not-initiated box with "Schedule For
        // Publication" highlighted above it and Participants with "Assign",
        // and nothing else: no file list, no discussions panel.
        await selectStage(back, 'Production');
        await expectPlainStatus(back, PRODUCTION_STATUS.notInitiated);
        await expect(productionHeadings(back)).toHaveText(['Status']);
        await expectDecisionButtons(back, [PRODUCTION_DECISIONS.schedule]);
        await expectHighlighted(back, PRODUCTION_DECISIONS.schedule);
        await expect(participantsPanel(back).getByRole('button', {name: 'Assign', exact: true})).toBeVisible();
        await expect(primaryRegion(back).getByRole('table')).toHaveCount(0);
        await expect(productionFilesList(back)).toHaveCount(0);
        await expect(discussionsPanel(back)).toHaveCount(0);

        // The Author's mailbox.
        const mail = await pkpMail.find({to: press.author.email, subject: MOVED_TO_COPYEDITING.authorMail});
        expect(mail.From.Address).toBe(press.editor.email);
    });

    test("S5: the author's view", async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s5');
        const seeded = await seedMonograph(ompApi, tag);

        // Control: the Press Editor's entry shows the list, Participants
        // and both buttons (the exact lists the author's absences are read
        // against).
        const edPage = await (await asUser(EDITOR)).newPage();
        const edModal = await openProduction(edPage, PK, seeded.submissionId);
        await expect(productionHeadings(edModal)).toHaveText(ACTIVE_HEADINGS);
        await expect(participantsHeading(edModal)).toBeVisible();
        await expect(uploadButton(edModal)).toBeVisible();
        await expectDecisionButtons(edModal, BOTH_BUTTONS);

        // The Author: the "Awaiting approval." box above the discussions
        // panel (OMP1) and nothing else.
        const auPage = await (await asUser('author.alex')).newPage();
        const auModal = await openAuthorProduction(auPage, PK, seeded.submissionId);
        await expectStageLabel(auModal, 'Production');
        await expect(productionHeadings(auModal)).toHaveText([PRESS_NOTICES.awaiting.heading, PRODUCTION_DISCUSSIONS]);
        await expectPressNotice(auModal, PRESS_NOTICES.awaiting);
        await expect(discussionsPanel(auModal)).toBeVisible();
        await expect(primaryRegion(auModal).getByRole('table')).toHaveCount(1);
        await expect(productionFilesList(auModal)).toHaveCount(0);
        await expect(listHeading(auModal, PRODUCTION_READY_FILES)).toHaveCount(0);
        await expect(uploadButton(auModal)).toHaveCount(0);
        await expect(participantsHeading(auModal)).toHaveCount(0);
        await expect(participantsPanel(auModal)).toHaveCount(0);
        await expectNoJournalNotice(auModal);
        await expect(actionsRegion(auModal).getByRole('button')).toHaveCount(0);
        await expect(decisionButton(auModal, PRODUCTION_DECISIONS.schedule)).toHaveCount(0);
        await expect(decisionButton(auModal, PRODUCTION_DECISIONS.moveToCopyediting)).toHaveCount(0);
    });

    test("S7: the press's notice box (OMP1)", async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u33s7');
        // The Press Editor auto-assigned and `layouteditor.leo` assigned in
        // the seed; a second monograph of the same Author, published.
        const seeded = await seedMonograph(ompApi, tag, {
            participants: [{username: 'layouteditor.leo', role: 'layoutEditor'}],
        });
        const published = await seedMonograph(ompApi, `${tag}p`, {published: true});

        // The Press Editor's entry: "Awaiting approval." with its sentence
        // above "Production Ready Files".
        const edPage = await (await asUser(EDITOR)).newPage();
        const edModal = await openProduction(edPage, PK, seeded.submissionId);
        await expect(productionHeadings(edModal)).toHaveText(ACTIVE_HEADINGS);
        await expectPressNotice(edModal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(edModal);

        // The Press Manager not assigned: the same box.
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const mayaModal = await openProduction(mayaPage, PK, seeded.submissionId);
        await expect(productionHeadings(mayaModal)).toHaveText(ACTIVE_HEADINGS);
        await expectPressNotice(mayaModal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(mayaModal);

        // The Layout Editor: the same box.
        const leoPage = await (await asUser('layouteditor.leo')).newPage();
        const leoModal = await openProduction(leoPage, PK, seeded.submissionId);
        await expect(productionHeadings(leoModal)).toHaveText(ACTIVE_HEADINGS);
        await expectPressNotice(leoModal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(leoModal);

        // The Author, from My Submissions: the same box above the
        // discussions panel.
        const auPage = await (await asUser('author.alex')).newPage();
        const auModal = await openAuthorProduction(auPage, PK, seeded.submissionId);
        await expect(productionHeadings(auModal)).toHaveText([PRESS_NOTICES.awaiting.heading, PRODUCTION_DISCUSSIONS]);
        await expectPressNotice(auModal, PRESS_NOTICES.awaiting);
        await expectNoJournalNotice(auModal);

        // The published monograph: under "Submission published." the box
        // reads "Catalog Management" with its sentence, above the file list.
        const pubModal = await openProduction(edPage, PK, published.submissionId);
        await expectPlainStatus(pubModal, PRODUCTION_STATUS.published);
        await expect(productionHeadings(pubModal)).toHaveText([
            'Status',
            PRESS_NOTICES.catalog.heading,
            PRODUCTION_READY_FILES,
            PRODUCTION_DISCUSSIONS,
        ]);
        await expectPressNotice(pubModal, PRESS_NOTICES.catalog);

        // Control: none of these views shows the journal's notices (read
        // above on each; here on the published one too), and the
        // "Awaiting approval." heading is gone from the published entry.
        await expectNoJournalNotice(pubModal);
        await expect(primaryRegion(pubModal).getByRole('heading', {name: PRESS_NOTICES.awaiting.heading, exact: true})).toHaveCount(0);
    });
});
