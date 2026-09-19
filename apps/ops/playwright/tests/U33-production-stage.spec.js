// @ts-check
/**
 * @file playwright/tests/U33-production-stage.spec.js
 *
 * Production stage — OPS suite, one test per scenario the spec runs on a
 * preprint server: scenario 8 ("Open a preprint on a preprint server",
 * which doubles as the absence scenario for the journal's file list and
 * notices, register OPS1: every absence paired with a positive control,
 * PRINCIPLES M4, M6) and scenario 9 ("Decline, revert and delete a
 * preprint", the server's own decisions). Scenarios 1–7 are badged
 * {OJS OMP}: a preprint server has no Copyediting stage to arrive from, no
 * production ready files, no galley notice and no "Move To Copyediting"
 * (spec Purpose, Rules 1, 3e), and S8 asserts those absences, so the suite
 * carries no further absence test. The {OPS} exclusivity of "Decline
 * Submission", "Revert Decline" and "Delete" needs no cross-app control
 * here: the OJS and OMP suites assert their own Production buttons
 * (RUNBOOK multi-app rule 3).
 * Spec: docs/specs/U33-production-stage.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): OPS2 🐞
 * (S9 reads the "Submission Reactivated" dialog's title and that its text
 * names the preprint, never the "submission stage" sentence), OPS3 ❓ (S9
 * reads "Post the preprint" on a declined preprint as the spec's current
 * text, and moves with the spec if the ruling flips), A1 ❓ (S8 reads the
 * recommending Moderator's entry as the spec's current text: the panels
 * and "Post the preprint" alone), OMP2 🐞, A2 ❓, A3 ❓, A4 ❓, OJS1 ❓, OJS2 ❓
 * (journal and press surfaces a preprint server never shows), OMP1 ✅
 * (press routing). The spec's Coverage section records everything else
 * left out.
 *
 * Seeding: scenario endpoints only; `publicknowledge` and the seeded
 * roster are read-only (A1, A7). S8 runs on `publicknowledge` with roster
 * accounts (`manager.maya` the Preprint Server Manager, `sectioneditor.ana`
 * the Moderator of section PRE, assigned to every preprint there and
 * named in `participants[]` as fn-s says; there is no `recommendOnly` seed
 * key, so the flag is set on screen through the row's "Edit Assignment"
 * window); its posted preprint is `published: true`. S9 runs on a scratch
 * preprint server with throwaway accounts, since it reads a mailbox (A8:
 * every read scoped by the throwaway Author's address, every silence
 * bounded by a message that did arrive); its declined preprint is
 * `decisions: ['decline']`. Tags are unique per run (M5); waits are
 * web-first (A5). Everything runs in the parallel `ops` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {EditorialDashboardPage} = require('../pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../pages/MySubmissionsPage.js');
const {DecisionPage} = require('../pages/DecisionPage.js');
const {ProductionStagePage, DISCUSSIONS_PANEL} = require('../pages/ProductionStagePages.js');

const SERVER = 'publicknowledge';

/** The preprint server's single stage entry (Rule 2; Settings bullet 4). */
const OPS_STAGES = ['Production'];

/** The queued preprint's buttons, left to right (Rule 1). */
const QUEUED_BUTTONS = ['Post the preprint', 'Decline Submission'];

/** The declined preprint's buttons for a manager (Rules 9–11; OPS3) and for a Moderator. */
const DECLINED_BUTTONS_MANAGER = ['Post the preprint', 'Revert Decline', 'Delete'];
const DECLINED_BUTTONS_MODERATOR = ['Post the preprint', 'Revert Decline'];

/** The decision emails' subjects (Side effects; the install defaults). */
const DECLINE_SUBJECT = 'Your submission has been declined';
const REVERT_SUBJECT = 'We have reversed the decision to decline your submission';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u33${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** A page as a given user, plus the Production entry's page object for it. */
async function productionAs(asUser, appContext, username, contextPath = SERVER) {
    const page = await (await asUser(username)).newPage();
    const stage = new ProductionStagePage(page, contextPath, {appContext});
    return {page, stage, workflow: stage.frame};
}

test.describe('production stage (U33) — OPS', () => {
    test('S8: open a preprint on a preprint server', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const moderator = 'Ana Section Editor';
        const [queued, posted] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}q`,
                context: SERVER,
                submitter: 'author.alex',
                title: `Preprint ${tag}`,
                participants: [{username: 'sectioneditor.ana', role: 'sectionEditor'}],
            }),
            opsApi.createSubmission({
                tag: `${tag}p`,
                context: SERVER,
                submitter: 'author.alex',
                title: `Posted ${tag}`,
                published: true,
            }),
        ]);

        // ── The workflow menu ────────────────────────────────────────────
        // The Preprint Server Manager opens the queued preprint's workflow:
        // the "Workflow" group lists "Production" alone (a settled read of
        // the whole group, bounded by the entry it must hold), and the
        // bubble under the title reads "Production" (Rule 2).
        const manager = await productionAs(asUser, appContext, 'manager.maya');
        await manager.workflow.gotoEditorial(queued.submissionId);
        await manager.workflow.expectStageHeading('Production');
        await manager.workflow.expectStage('Production');
        await expect(manager.workflow.stageLink('Production')).toBeVisible();
        await expect.poll(() => manager.workflow.stageLabels(), {timeout: 30_000}).toEqual(OPS_STAGES);

        // ── The Production stage ─────────────────────────────────────────
        // The main column shows the "Production Tasks & Discussions" panel
        // and the right-hand column the "Participants" panel, and those are
        // the panel headings in that order (the settled read that also
        // states no other panel shows); no "Production Ready Files" list,
        // no "Upload" and no notice box (Rules 1, 3e; OPS1), with the
        // discussions panel as the positive control.
        await expect(manager.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(manager.workflow.participantsHeading()).toBeVisible();
        await manager.workflow.expectPanelHeadings([DISCUSSIONS_PANEL, 'Participants']);
        await manager.workflow.expectNoStatusBox();
        await manager.stage.expectNoJournalSurfaces();

        // The buttons at the top: "Post the preprint", highlighted, then
        // "Decline Submission", and nothing else (Rule 1). This is also the
        // scenario's "Control": each surface an absence below is read
        // against is on screen here.
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);
        await manager.stage.expectHighlighted('Post the preprint');
        await manager.stage.expectNotHighlighted('Decline Submission');

        // ── "Post the preprint" ──────────────────────────────────────────
        // Press it: the newest version's "Title & Abstract" page opens
        // under the "Preprint" group, no decision recorded (the bubble
        // still reads "Production"); select "Production" again: the entry
        // is as before, with both buttons (Rule 6).
        await manager.stage.pressPostThePreprint();
        await expect
            .poll(() => manager.workflow.menuKeyFromUrl(), {timeout: 30_000})
            .toBe(`publication_${queued.publicationId}_titleAbstract`);
        await manager.workflow.expectSelected('Title & Abstract');
        await manager.workflow.expectStage('Production');
        await manager.workflow.selectStage('Production');
        await expect(manager.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(manager.workflow.participantsHeading()).toBeVisible();
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);

        // ── The recommending Moderator ───────────────────────────────────
        // The Manager limits the assigned Moderator to recommendations
        // through the row's "Edit Assignment" window (fn-s: no seed key);
        // the row then carries the mark.
        await manager.stage.setRecommendOnly(moderator);

        // The Moderator opens the preprint at "Production": the two panels
        // and "Post the preprint" alone; no "Decline Submission" and no
        // recommendation control anywhere on the panel (A1 as the spec's
        // current text; Actors row 7). "Post the preprint" is the control.
        const recommending = await productionAs(asUser, appContext, 'sectioneditor.ana');
        await recommending.stage.gotoProduction(queued.submissionId);
        await recommending.workflow.expectStage('Production');
        await expect(recommending.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(recommending.workflow.participantsHeading()).toBeVisible();
        await recommending.workflow.expectPanelHeadings([DISCUSSIONS_PANEL, 'Participants']);
        await expect(recommending.stage.decisionButton('Post the preprint')).toBeVisible();
        await recommending.stage.expectDecisionButtons(['Post the preprint']);
        await expect(recommending.stage.decisionButton('Decline Submission')).toHaveCount(0);
        await expect(recommending.stage.recommendationControls()).toHaveCount(0);
        await expect(recommending.workflow.errorDialog()).toHaveCount(0);

        // ── The posted preprint ──────────────────────────────────────────
        // The Manager opens the posted preprint's "Production" entry: the
        // status box "Submission published." above the discussions panel,
        // the "Participants" panel beside them, and no button at all (Rule
        // 8): the action region is gone, bounded by the status box and the
        // panels having rendered.
        await manager.stage.gotoProduction(posted.submissionId);
        await manager.workflow.expectStatusAbovePanel('Submission published.', DISCUSSIONS_PANEL);
        await expect(manager.workflow.participantsHeading()).toBeVisible();
        await manager.workflow.expectPanelHeadings(['Status', DISCUSSIONS_PANEL, 'Participants']);
        await manager.stage.expectDecisionButtons([]);
        await expect(manager.workflow.actionItems()).toHaveCount(0);
        await expect(manager.stage.decisionButton('Post the preprint')).toHaveCount(0);
        await expect(manager.stage.decisionButton('Decline Submission')).toHaveCount(0);
        await manager.stage.expectNoJournalSurfaces();
    });

    test('S9: decline, revert and delete a preprint', async ({asUser, opsApi, appContext, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const managerName = `${tag}mg`;
        const moderatorName = `${tag}md`;
        const authorName = `${tag}au`;
        const mailTo = `${authorName}@mail.test`;
        const moderatorDisplay = 'Mona Moderator';

        // Given: a scratch preprint server with a throwaway Manager, a
        // Moderator and an Author; the Author's submitted preprint with the
        // Moderator assigned, and their second preprint, declined by seed.
        await opsApi.createContext({
            tag,
            users: [
                user(managerName, 'Mira', 'Manager', ['manager']),
                user(moderatorName, 'Mona', 'Moderator', ['sectionEditor']),
                user(authorName, 'Ada', 'Author', ['author']),
            ],
        });
        const queuedTitle = `Preprint ${tag}`;
        const declinedTitle = `Declined ${tag}`;
        const [queued, declined] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}q`, context: tag, submitter: authorName, title: queuedTitle,
                participants: [{username: moderatorName, role: 'sectionEditor'}],
            }),
            opsApi.createSubmission({
                tag: `${tag}d`, context: tag, submitter: authorName, title: declinedTitle,
                decisions: ['decline'],
            }),
        ]);
        // Seeding sends no mail: the recipient's box starts empty.
        expect(await pkpMail.count({to: mailTo})).toBe(0);

        // ── The Author's view ────────────────────────────────────────────
        // The Author opens the preprint from My Submissions ("Active
        // submissions" lists it; the declined one is not there): the side
        // menu has no "Workflow" group (the "Preprint" group is the
        // control), the view opens on the newest version's "Title &
        // Abstract" page, and the "Preprint" group's last page, "Production
        // Tasks & Discussions", shows the panel with its "Add" (Rule 12).
        const author = await productionAs(asUser, appContext, authorName, tag);
        const mySub = new MySubmissionsPage(author.page, tag);
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 1);
        await mySub.searchFor(tag);
        const row = mySub.row(queuedTitle);
        await expect(row).toBeVisible({timeout: 30_000});
        await expect(mySub.row(declinedTitle)).toHaveCount(0);
        await author.workflow.openFromRow(row, queued.submissionId);
        await author.workflow.expectStage('Production');
        await author.workflow.expectPageHeading('Title & Abstract');
        await author.workflow.expectSelected('Title & Abstract');
        await expect(author.workflow.publicationGroup()).toBeVisible();
        await expect(author.workflow.workflowGroup()).toHaveCount(0);
        await expect(author.workflow.stageLink('Production')).toHaveCount(0);
        const authorAddress = author.page.url();
        expect(new URL(authorAddress).searchParams.get('workflowSubmissionId')).toBe(String(queued.submissionId));
        const pages = await author.workflow.pagesUnderLatestVersion();
        expect(pages[pages.length - 1]).toBe(DISCUSSIONS_PANEL);
        await author.workflow.selectPage(DISCUSSIONS_PANEL);
        await expect(author.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(author.stage.discussionsAddButton()).toBeVisible();

        // ── "Decline Submission" ─────────────────────────────────────────
        // The Manager opens the preprint's "Production" entry. Control:
        // before the decision it offers "Post the preprint" and "Decline
        // Submission", and neither "Revert Decline" nor "Delete" (Rule 1).
        const manager = await productionAs(asUser, appContext, managerName, tag);
        await manager.stage.gotoProduction(queued.submissionId);
        await manager.workflow.expectStage('Production');
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);
        await expect(manager.stage.decisionButton('Revert Decline')).toHaveCount(0);
        await expect(manager.stage.decisionButton('Delete')).toHaveCount(0);

        // Press "Decline Submission": the wizard opens with the "Notify
        // Authors" page alone; record the decision: it closes on
        // "Submission Declined" with its sentence, and back on the
        // workflow the bubble reads "Declined" (Rule 9).
        const decision = new DecisionPage(manager.page);
        await manager.stage.decisionButton('Decline Submission').click();
        await decision.expectOpen('Decline Submission');
        await decision.expectSteps(['Notify Authors']);
        await expect(decision.stepHeading('Notify Authors')).toBeVisible();
        const declinedDialog = await decision.recordDecision('Submission Declined');
        await expect(declinedDialog).toContainText(
            `The submission, ${queuedTitle}, has been declined and sent to the archives. All notifications have been sent, except any you chose to skip.`
        );
        await decision.viewSubmission();
        await manager.workflow.expectOpen(queued.submissionId);
        await manager.workflow.expectStage('Declined');

        // ── The declined preprint's buttons ──────────────────────────────
        // Reopen the workflow by address: it opens on "Title & Abstract";
        // select "Production": "Revert Decline" and "Delete", with "Post
        // the preprint" still beside them (Rule 9; OPS3 as the spec's
        // current text), and no "Decline Submission".
        await manager.workflow.gotoEditorial(queued.submissionId);
        await manager.workflow.expectStage('Declined');
        await manager.workflow.expectPageHeading('Title & Abstract');
        await manager.workflow.selectStage('Production');
        await manager.stage.expectDecisionButtons(DECLINED_BUTTONS_MANAGER);
        await expect(manager.stage.decisionButton('Decline Submission')).toHaveCount(0);

        // ── The dashboard's "Declined" view ──────────────────────────────
        // Lists the preprint (Rule 9), beside the seeded declined one: the
        // scratch server's count is the test's own.
        const dash = new EditorialDashboardPage(manager.page, tag);
        await dash.gotoView('declined');
        await dash.expectViewHeading('Declined', 2);
        await expect(dash.row(queuedTitle)).toBeVisible({timeout: 30_000});
        await expect(dash.row(declinedTitle)).toBeVisible();

        // ── The Author's mailbox ─────────────────────────────────────────
        // Holds the email "Your submission has been declined" (Side effects).
        const declineMail = await pkpMail.find({to: mailTo, contains: queuedTitle, subject: DECLINE_SUBJECT});
        expect(declineMail.Subject).toBe(DECLINE_SUBJECT);
        expect(await pkpMail.count({to: mailTo})).toBe(1);

        // ── The Author's view after the decision ─────────────────────────
        // My Submissions no longer lists the preprint under "Active
        // submissions" (bounded by the view's count and its own empty
        // state); opened by the address it had before, the same pages show
        // under the bubble "Declined", with "Status: Unposted" on "Title &
        // Abstract" and no word of the decision on the page (Rule 12).
        await mySub.goto();
        await mySub.expectViewHeading('Active submissions', 0);
        await mySub.searchFor(tag);
        await expect(mySub.emptyState()).toBeVisible({timeout: 30_000});
        await expect(mySub.row(queuedTitle)).toHaveCount(0);
        await author.page.goto(authorAddress);
        await author.workflow.expectOpen(queued.submissionId);
        await author.workflow.expectStage('Declined');
        await author.workflow.expectPageHeading('Title & Abstract');
        await author.workflow.expectPublicationStatus('Unposted');
        await expect(author.workflow.workflowGroup()).toHaveCount(0);
        await expect(author.workflow.primaryColumn().getByText(/declin/i)).toHaveCount(0);
        await expect(author.workflow.controlsLeft().getByText(/declin/i)).toHaveCount(0);
        await author.workflow.selectPage(DISCUSSIONS_PANEL);
        await expect(author.stage.discussionsPanel()).toBeVisible({timeout: 30_000});
        await expect(author.stage.discussionsAddButton()).toBeVisible();
        await expect(author.workflow.primaryColumn().getByText(/declin/i)).toHaveCount(0);

        // ── The Moderator on the declined preprint ───────────────────────
        // "Post the preprint" and "Revert Decline"; no "Delete" (Rule 11;
        // Actors rows 8–9), "Revert Decline" being the control.
        const moderator = await productionAs(asUser, appContext, moderatorName, tag);
        await moderator.workflow.gotoEditorial(queued.submissionId);
        await moderator.workflow.expectStage('Declined');
        await moderator.workflow.expectPageHeading('Title & Abstract');
        await moderator.workflow.selectStage('Production');
        await expect(moderator.stage.participantRow(moderatorDisplay)).toBeVisible({timeout: 30_000});
        await expect(moderator.stage.decisionButton('Revert Decline')).toBeVisible();
        await moderator.stage.expectDecisionButtons(DECLINED_BUTTONS_MODERATOR);
        await expect(moderator.stage.decisionButton('Delete')).toHaveCount(0);

        // ── "Revert Decline" ─────────────────────────────────────────────
        // The Manager presses "Revert Decline": the wizard opens with the
        // "Notify Authors" page alone; record the decision: it closes on
        // "Submission Reactivated" naming the preprint (its "submission
        // stage" sentence is OPS2 🐞, not asserted); the bubble reads
        // "Production", the preprint has left the "Declined" view, and the
        // buttons are "Post the preprint" and "Decline Submission" again
        // (Rule 10); the Author's mailbox holds the reversal email.
        await manager.stage.gotoProduction(queued.submissionId);
        await manager.workflow.expectStage('Declined');
        await manager.stage.decisionButton('Revert Decline').click();
        await decision.expectOpen('Revert Decline');
        await decision.expectSteps(['Notify Authors']);
        await expect(decision.stepHeading('Notify Authors')).toBeVisible();
        const revertedDialog = await decision.recordDecision('Submission Reactivated');
        await expect(revertedDialog).toContainText(`The submission, ${queuedTitle}, is now active`);
        await decision.viewSubmission();
        await manager.workflow.expectOpen(queued.submissionId);
        await manager.workflow.expectStage('Production');
        await manager.workflow.selectStage('Production');
        await manager.stage.expectDecisionButtons(QUEUED_BUTTONS);
        await expect(manager.stage.decisionButton('Revert Decline')).toHaveCount(0);
        await expect(manager.stage.decisionButton('Delete')).toHaveCount(0);
        await dash.gotoView('declined');
        await dash.expectViewHeading('Declined', 1);
        await expect(dash.row(declinedTitle)).toBeVisible({timeout: 30_000});
        await expect(dash.row(queuedTitle)).toHaveCount(0);
        const revertMail = await pkpMail.find({to: mailTo, contains: queuedTitle, subject: REVERT_SUBJECT});
        expect(revertMail.Subject).toBe(REVERT_SUBJECT);
        const mailBeforeDelete = await pkpMail.count({to: mailTo});
        expect(mailBeforeDelete).toBe(2);

        // ── "Delete" on the second, declined preprint ────────────────────
        // Open it at "Production": "Delete" stands beside "Revert Decline";
        // press it and confirm the dialog ("Delete" / "Are you sure you
        // want to permanently delete this submission?" / "Confirm"): the
        // panel closes, the preprint no longer lists under "Declined"
        // (bounded by the view's count and empty state), and the Author's
        // mailbox holds no new email: the two decision emails above are
        // the control taken the same way (Rule 11; Side effects).
        await manager.workflow.gotoEditorial(declined.submissionId);
        await manager.workflow.expectStage('Declined');
        await manager.workflow.selectStage('Production');
        await manager.stage.expectDecisionButtons(DECLINED_BUTTONS_MANAGER);
        await manager.workflow.deleteSubmission();
        expect(manager.workflow.submissionIdFromUrl()).toBeNull();
        await dash.expectViewCount('Declined', 0);
        await dash.gotoView('declined');
        await dash.expectViewHeading('Declined', 0);
        await expect(dash.emptyState()).toBeVisible({timeout: 30_000});
        await expect(dash.row(declinedTitle)).toHaveCount(0);
        expect(await pkpMail.count({to: mailTo})).toBe(mailBeforeDelete);
        expect(await pkpMail.count({to: mailTo, contains: declinedTitle})).toBe(0);
    });
});
