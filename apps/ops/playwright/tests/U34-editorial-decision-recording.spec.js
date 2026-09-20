// @ts-check
/**
 * @file playwright/tests/U34-editorial-decision-recording.spec.js
 *
 * Editorial decision recording — OPS suite, one test per scenario the spec
 * runs on a preprint server: scenario 9 ("Decline and revert a preprint"),
 * which doubles as the absence scenario for the wizard's review pages
 * (register OPS1: no "Notify Reviewers", "Notify Editors" or "Select
 * Files" page, no "Submission Files" or "Review Files" source in "Attach
 * Files", no recommendation at all), every absence paired with a positive
 * control read the same way (PRINCIPLES M4, M6; RUNBOOK multi-app rule
 * 3). Scenarios 1–8 are badged {OJS OMP}, 10 {OJS} and 11 {OMP}: a
 * preprint server has no review stage, no Reviewer role, no recommending
 * editor, no fee page and no internal review (spec Purpose), and S9's
 * Control bullet asserts those absences, so the suite carries no further
 * absence test. The {OPS} exclusivity of the two-decision wizard needs no
 * cross-app control here: the OJS and OMP suites assert their own rosters
 * (Rule 2's table).
 * Spec: docs/specs/U34-editorial-decision-recording.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): OPS2 🐞
 * (S9 reads the "Insert Content" rows for the server's name, the authors
 * and the title, never the initials row's untranslated description), A8 ❓
 * (the markup and empty rows of the same window), and *Production stage*'s
 * OPS2 🐞 (S9 reads the "Submission Reactivated" window's title, that its
 * text names the preprint and its "unless you chose to skip" sentence,
 * never the "submission stage" it names); A6 🐞, A9 🐞, OJS1 🐞, OMP1 🐞,
 * A1 ❓, A2 ❓, A4 ❓, A5 ❓, A7 ❓, A10 ❓, A11 ❓ (journal and press surfaces a
 * preprint server never shows). OPS1 ✅ is what S9 asserts. The spec's
 * Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only; `publicknowledge` and the seeded
 * roster are read-only (A1, A7). S9 runs on a scratch preprint server with
 * throwaway accounts, since it reads a mailbox (A8: every read scoped by
 * the throwaway Author's address, every silence bounded by a message that
 * did arrive) and flags a Moderator as recommend-only on screen through
 * the Participants row's "Edit Assignment" window (there is no
 * `recommendOnly` seed key; scenarios.md "Decision behaviour worth
 * knowing"). Tags are unique per run (M5); waits are web-first (A5).
 * Everything runs in the parallel `ops` project.
 */
const path = require('node:path');
const {test, expect} = require('../support/fixtures.js');
const {DecisionPage} = require('../pages/DecisionPage.js');
const {ComposerPage} = require('../pages/DecisionWizardPages.js');
const {ProductionStagePage} = require('../pages/ProductionStagePages.js');

/** The queued preprint's buttons, left to right (*Production stage* Rule 1). */
const QUEUED_BUTTONS = ['Post the preprint', 'Decline Submission'];

/** The declined preprint's buttons for a manager (*Production stage* Rules 9–11). */
const DECLINED_BUTTONS = ['Post the preprint', 'Revert Decline', 'Delete'];

/** The one-page wizard's rail and footer (Rules 1, 2, 10). */
const ONE_PAGE_RAIL = ['Notify Authors'];
const ONE_PAGE_FOOTER = ['Skip this email', 'Cancel', 'Record Decision'];

/** The review pages a preprint server never builds (OPS1). */
const REVIEW_PAGES = ['Notify Reviewers', 'Notify Editors', 'Select Files'];

/** The "Attach Files" sources on a preprint server, and the two it lacks (Rule 6; OPS1). */
const OPS_ATTACH_SOURCES = ['Upload File', 'Library Files'];
const JOURNAL_ATTACH_BUTTONS = ['Attach Submission Files', 'Attach Review Files'];
const JOURNAL_ATTACH_HEADINGS = ['Submission Files', 'Review Files'];

/** The sentences under the headings (Rule 11's table). */
const DECLINE_SENTENCE =
    'This submission will be declined for publication. No further review will be conducted and the submission will be archived.';

/** The decision emails' subjects and their template's name (Side effects; the install defaults). */
const DECLINE_TEMPLATE = 'Submission Declined';
const DECLINE_SUBJECT = 'Your submission has been declined';
const REVERT_SUBJECT = 'We have reversed the decision to decline your submission';

/** The refusals a typed address answers (Actors rows 2 and 4; Rule 12). */
const NOT_FOUND_DECISION = 'This decision could not be found. Please provide a recognized decision type.';
const NO_ROLE_ACCESS = 'The current role does not have access to this operation.';

/** Footnote s1's decision numbers: "Decline Submission" and "Recommend Accept". */
const DECISION_DECLINE = 8;
const DECISION_RECOMMEND_ACCEPT = 9;

/** The file attached to the letter (the suite's own upload fixture). */
const PDF_NAME = 'preprint.pdf';
const PDF_PATH = path.resolve(__dirname, '../fixtures/files', PDF_NAME);

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u34${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** A page as a given user, plus the Production entry's page object for it. */
async function productionAs(asUser, appContext, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    const stage = new ProductionStagePage(page, contextPath, {appContext});
    return {page, stage, workflow: stage.frame};
}

test.describe('editorial decision recording (U34) — OPS', () => {
    test('S9: decline and revert a preprint', async ({asUser, opsApi, appContext, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const managerName = `${tag}mg`;
        const moderatorName = `${tag}md`;
        const authorName = `${tag}au`;
        const managerDisplay = 'Mira Manager';
        const moderatorDisplay = 'Mona Moderator';
        const authorDisplay = 'Ada Author';
        const mailTo = `${authorName}@mail.test`;
        const serverName = `Preprint server ${tag}`;
        const title = `Preprint ${tag}`;

        // Given: a scratch preprint server with a throwaway Preprint Server
        // Manager, a Moderator and an Author; the Author's submitted
        // preprint with the Moderator assigned. The Moderator's limit to
        // recommendations is set on screen below (no seed key).
        await opsApi.createContext({
            tag,
            context: {name: serverName},
            users: [
                user(managerName, 'Mira', 'Manager', ['manager']),
                user(moderatorName, 'Mona', 'Moderator', ['sectionEditor']),
                user(authorName, 'Ada', 'Author', ['author']),
            ],
        });
        const seeded = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: authorName,
            title,
            participants: [{username: moderatorName, role: 'sectionEditor'}],
        });
        // Seeding sends no mail: the recipient's box starts empty.
        expect(await pkpMail.count({to: mailTo})).toBe(0);

        // The Manager opens the preprint's "Production" entry and limits
        // the assigned Moderator to recommendations through the row's
        // "Edit Assignment" window (the given); the row carries the mark.
        // Control for the wizard: the entry offers "Post the preprint" and
        // "Decline Submission" before anything is recorded.
        const manager = await productionAs(asUser, appContext, managerName, tag);
        await manager.stage.gotoProduction(seeded.submissionId);
        await manager.workflow.expectStage('Production');
        await manager.stage.setRecommendOnly(moderatorDisplay);
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);

        // ── The one-page wizard ──────────────────────────────────────────
        // Press "Decline Submission": a full page headed "Decline
        // Submission" alone, its sentence under it, the rail "1 Notify
        // Authors" alone (the settled read that also states no other
        // page), "Email Templates" listing "Submission Declined", and the
        // footer "Skip this email", "Cancel", "Record Decision" with no
        // "Continue" and no "Previous" (Rules 1, 2, 10; Side effects).
        const decision = new DecisionPage(manager.page);
        const composer = new ComposerPage(manager.page);
        await manager.stage.decisionButton('Decline Submission').click();
        await decision.expectOpen('Decline Submission');
        await decision.expectTitleAlone('Decline Submission');
        await expect(decision.pageDescription()).toHaveText(DECLINE_SENTENCE);
        await decision.expectSteps(ONE_PAGE_RAIL);
        await expect(decision.stepItems()).toHaveCount(1);
        await expect(decision.stepItems().first()).toContainText(/\b1\b/);
        await expect(decision.stepHeading('Notify Authors')).toBeVisible();
        await decision.awaitComposerLoaded();
        await composer.expectTemplates([DECLINE_TEMPLATE]);
        await decision.expectFooter(ONE_PAGE_FOOTER);
        await expect(decision.skipButton()).toBeVisible();
        await expect(decision.recordButton).toBeVisible();
        await expect(decision.continueButton).toHaveCount(0);
        await expect(decision.page.getByRole('button', {name: 'Previous', exact: true})).toHaveCount(0);

        // Control: the review pages never appear in the rail, "Notify
        // Authors" being there (OPS1; Purpose).
        for (const label of REVIEW_PAGES) {
            await expect(decision.stepItems().filter({hasText: label})).toHaveCount(0);
            await expect(decision.stepHeading(label)).toHaveCount(0);
        }

        // ── "Attach Files" ───────────────────────────────────────────────
        // Press it: the window offers "Upload File" and "Library Files"
        // alone (a settled read of every source heading), their buttons
        // being the control for the missing "Submission Files" and
        // "Review Files" panels (OPS1); press "Upload File", add a PDF and
        // press the window's "Attach Files": the file's chip under the
        // message with its remove cross (Rule 6).
        await composer.openAttachWindow();
        await composer.expectAttachSources(OPS_ATTACH_SOURCES);
        await expect(composer.attachSourceButton('Upload File')).toBeVisible();
        await expect(composer.attachSourceButton('Attach Library Files')).toBeVisible();
        for (const label of JOURNAL_ATTACH_BUTTONS) {
            await expect(composer.attachSourceButton(label)).toHaveCount(0);
        }
        for (const label of JOURNAL_ATTACH_HEADINGS) {
            await expect(composer.attachWindow().getByText(label, {exact: true})).toHaveCount(0);
        }
        await composer.uploadAndAttach(PDF_PATH, PDF_NAME);
        await expect(composer.attachmentChips()).toHaveCount(1);
        await expect(composer.attachmentChip(PDF_NAME)).toContainText(PDF_NAME);
        await expect(composer.attachmentRemoveButton(PDF_NAME)).toBeVisible();

        // ── "Insert Content" ─────────────────────────────────────────────
        // The letter opens with its placeholders as values ("Dear Ada
        // Author,"); with the cursor at the end of that line press "Insert
        // Content": the window lists the letter's values, each with a
        // description (the server's name, the authors' names, the title
        // read); press "Insert" on the server's name: the window closes
        // and the name stands at the cursor (Rule 5). The initials row's
        // untranslated description is OPS2 🐞, not asserted.
        expect(await composer.firstParagraphText()).toBe(`Dear ${authorDisplay},`);
        await composer.placeCursorAtEndOfFirstParagraph();
        await composer.openInsertWindow();
        await expect(composer.insertSearchBox()).toBeVisible();
        await expect(composer.insertRowValue("The server's name")).toHaveText(serverName);
        await expect(composer.insertRowValue('The full names of the authors')).toHaveText(authorDisplay);
        await expect(
            composer.insertRowValue("The latest published version of the submission's title")
        ).toHaveText(title);
        await composer.insertValue("The server's name");
        await expect
            .poll(() => composer.firstParagraphText(), {timeout: 30_000})
            .toBe(`Dear ${authorDisplay},${serverName}`);

        // ── "Record Decision" ────────────────────────────────────────────
        // Press it: the window "Submission Declined" with its sentence and
        // its one control, the "View Submission Summary" link, which
        // closes it onto the workflow, now bubbled "Declined" (Rule 11).
        const declinedDialog = await decision.recordDecision('Submission Declined');
        await expect(declinedDialog).toContainText(
            `The submission, ${title}, has been declined and sent to the archives. All notifications have been sent, except any you chose to skip.`
        );
        await expect(declinedDialog.getByRole('link', {name: 'View Submission Summary', exact: true})).toBeVisible();
        await expect(declinedDialog.getByRole('link')).toHaveCount(1);
        await expect(declinedDialog.getByRole('button')).toHaveCount(0);
        await decision.viewSubmission();
        await manager.workflow.expectOpen(seeded.submissionId);
        await manager.workflow.expectStage('Declined');

        // ── The Author's mailbox and the Activity Log ────────────────────
        // The mailbox holds "Your submission has been declined" from the
        // Manager's name and address with the PDF attached, and nothing
        // else; the Activity Log reads "{editor} declined this
        // submission." (Side effects).
        const declineMail = await pkpMail.find({to: mailTo, subject: DECLINE_SUBJECT, contains: title});
        expect(declineMail.Subject).toBe(DECLINE_SUBJECT);
        expect(declineMail.From).toEqual({Name: managerDisplay, Address: `${managerName}@mail.test`});
        const declineFull = await pkpMail.fullMessage(declineMail.ID);
        expect((declineFull.Attachments || []).map((a) => a.FileName)).toEqual([PDF_NAME]);
        expect(declineFull.Text).toContain(serverName);
        expect(await pkpMail.count({to: mailTo})).toBe(1);
        await manager.workflow.openActivityLog();
        await expect(manager.workflow.activityLogRow(`${managerDisplay} declined this submission.`)).toBeVisible({
            timeout: 30_000,
        });
        await manager.workflow.closeActivityLog();

        // ── "Revert Decline" with the email skipped ──────────────────────
        // A declined preprint's workflow lands on "Title & Abstract", so
        // select "Production": "Revert Decline" stands there (control);
        // press it: the one-page wizard again; press "Skip this email":
        // the notice with "Don't skip this email" in place of the letter;
        // "Record Decision": the window "Submission Reactivated" naming
        // the preprint and its "unless you chose to skip" sentence (the
        // stage it names is *Production stage*'s OPS2 🐞, not asserted);
        // the Activity Log reads "{editor} reversed the decision to
        // decline this submission." and the Author's mailbox holds no
        // "We have reversed…", the decline email being the control taken
        // the same way and the log line the bound (Rules 3, 11; Side
        // effects).
        await manager.workflow.selectStage('Production');
        await manager.stage.expectDecisionButtons(DECLINED_BUTTONS);
        await manager.stage.decisionButton('Revert Decline').click();
        await decision.expectOpen('Revert Decline');
        await decision.expectTitleAlone('Revert Decline');
        await decision.expectSteps(ONE_PAGE_RAIL);
        await expect(decision.stepHeading('Notify Authors')).toBeVisible();
        await decision.expectFooter(ONE_PAGE_FOOTER);
        await decision.skipEmail();
        await expect(composer.templatesHeading()).toHaveCount(0);
        const revertedDialog = await decision.recordDecision('Submission Reactivated');
        await expect(revertedDialog).toContainText(`The submission, ${title}, is now active`);
        await expect(revertedDialog).toContainText(
            'The author has been notified, unless you chose to skip that email.'
        );
        await expect(revertedDialog.getByRole('link', {name: 'View Submission Summary', exact: true})).toBeVisible();
        await decision.viewSubmission();
        await manager.workflow.expectOpen(seeded.submissionId);
        await manager.workflow.expectStage('Production');
        await manager.workflow.openActivityLog();
        await expect(
            manager.workflow.activityLogRow(`${managerDisplay} reversed the decision to decline this submission.`)
        ).toBeVisible({timeout: 30_000});
        await manager.workflow.closeActivityLog();
        await pkpMail.expectNone({
            to: mailTo,
            subject: REVERT_SUBJECT,
            afterControl: {to: mailTo, subject: DECLINE_SUBJECT, contains: title},
        });
        expect(await pkpMail.count({to: mailTo})).toBe(1);
        await manager.workflow.selectStage('Production');
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);

        // ── The Moderator limited to recommendations ─────────────────────
        // The Moderator opens the preprint at "Production": the row's
        // recommend-only mark and the discussions panel are on screen (the
        // control), the buttons are "Post the preprint" alone, and there
        // is no "Recommendation" box and no recommendation control on the
        // panel; the "Recommend Accept" address typed by hand answers the
        // access-denied page "This decision could not be found…" (Rule
        // 12; Actors row 2; OPS1).
        const moderator = await productionAs(asUser, appContext, moderatorName, tag);
        await moderator.stage.gotoProduction(seeded.submissionId);
        await moderator.workflow.expectStage('Production');
        await expect(moderator.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(moderator.stage.recommendOnlyMark(moderatorDisplay)).toBeVisible({timeout: 30_000});
        await expect(moderator.stage.decisionButton('Post the preprint')).toBeVisible();
        await moderator.stage.expectDecisionButtons(['Post the preprint']);
        await expect(moderator.stage.decisionButton('Decline Submission')).toHaveCount(0);
        await expect(moderator.stage.recommendationBox()).toHaveCount(0);
        await expect(moderator.stage.recommendationControls()).toHaveCount(0);
        await moderator.workflow.expectAccessDeniedPage(
            DecisionPage.recordUrl(tag, seeded.submissionId, DECISION_RECOMMEND_ACCEPT),
            NOT_FOUND_DECISION
        );

        // ── The Author by address ────────────────────────────────────────
        // The Author types the "Decline Submission" address: the
        // access-denied page "The current role does not have access to
        // this operation." (Actors row 4).
        const author = await productionAs(asUser, appContext, authorName, tag);
        await author.workflow.expectAccessDeniedPage(
            DecisionPage.recordUrl(tag, seeded.submissionId, DECISION_DECLINE),
            NO_ROLE_ACCESS
        );
    });
});
