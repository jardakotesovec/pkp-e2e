// @ts-check
/**
 * @file playwright/tests/U25-submission-stage.spec.js
 *
 * Submission stage — OJS suite, one test per canonical scenario the spec runs
 * on OJS (S1–S7 common; S10 and S11 OJS/OMP; scenario 8 is OMP-only, 9
 * OPS-only).
 * Spec: docs/specs/U25-submission-stage.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 ❓
 * (S4, S5 and S6 assert nothing about "Schedule For Publication" in the
 * declined state; S1, S7 and S10 read it on a queued submission only), A2 ❓
 * (no recommend-only assignment is seeded), A3 ❓ (S6 never revisits the
 * deleted submission's address), OMP1 ✅, OPS1 ✅ (other apps' territory).
 * The spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster are
 * read-only (A1, A7). Every test seeds its own submissions with unique tags
 * (M5) and drives roster accounts through `asUser`. S6 and S11 isolate on a
 * scratch journal with throwaway accounts: S6 because its mailbox read is a
 * before/after count on the Author's address, and other suites' decision
 * mail to `author.alex` lands in the same Mailpit in parallel (A8); S11
 * because "Reviewer Suggestion at Submission" is off on the seeded journal
 * (its `review` passthrough sets it). The Section Editor of S4 is assigned
 * on submit as the seeded section's editor; S6's and S10's assignments are
 * seeded as `participants[]`, the row the Assign Participant form writes.
 * The seed carries no files, so S1 provides "the author's uploaded file"
 * through the panel's own upload wizard. Every absence is read with a
 * settled locator and paired with a positive control taken the same way
 * (M4, M6): the panel headings are read as one exact ordered list, the
 * action region's buttons likewise. Waits are web-first (A5). Everything
 * runs in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    WorkflowPage,
    DecisionPage,
    uploadViaWizard,
    FIXTURE_PDF_NAME,
    SUGGESTED_PANEL_HEADING,
} = require('../pages/ReviewStagePages.js');

const JOURNAL = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u25${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account's address (scenarios.md: `<username>@mail.test`). */
const mailOf = (username) => `${username}@mail.test`;

/** Seed a fresh queued submission (stage 1, no decisions) on a journal. */
async function seedQueued(ojsApi, tag, {context = JOURNAL, submitter = 'author.alex', ...extra} = {}) {
    return await ojsApi.createSubmission({
        tag,
        context,
        submitter,
        title: `Submission ${tag}`,
        ...extra,
    });
}

/** The three onward decision buttons of Rules 2–4. */
const ONWARD_DECISIONS = ['Send for Review', 'Accept and Skip Review', 'Decline Submission'];

/** The journal's shortcut of Rule 7. */
const SHORTCUT = 'Schedule For Publication';

/** The three editorial panels of Rule 1, as the panel headings read in order. */
const EDITORIAL_PANELS = ['Submission Files', 'Desk Review Tasks & Discussions', 'Participants'];

/** The author view's two panels of Rule 10. */
const AUTHOR_PANELS = ['Submission Files', 'Desk Review Tasks & Discussions'];

/** A page as a given user, plus the workflow page object for it. */
async function workflowAs(asUser, username, contextPath = JOURNAL) {
    const page = await (await asUser(username)).newPage();
    return {page, workflow: new WorkflowPage(page, contextPath)};
}

/** Press a decision button and walk its wizard back to the workflow. */
async function recordDecision(page, workflow, label) {
    await workflow.actionButton(label).click();
    const decision = new DecisionPage(page);
    await decision.expectOpen(label);
    await decision.completeAll();
}

/** The onward decisions of Rules 2–4 are all offered. */
async function expectOnwardOffered(workflow) {
    for (const label of ONWARD_DECISIONS) {
        await expect(workflow.actionButton(label)).toBeVisible();
    }
}

/** None of the onward decisions is offered (the caller bounds the read). */
async function expectOnwardAbsent(workflow) {
    for (const label of ONWARD_DECISIONS) {
        await expect(workflow.actionButton(label)).toHaveCount(0);
    }
}

/**
 * The submissions-table search box (the manager's editorial dashboard also
 * carries a second, views-list searchbox — scope by accessible name).
 */
function tableSearch(page) {
    return page.getByRole('searchbox', {name: /Search submissions, ID/});
}

/**
 * Commit a search for the tag on the current dashboard view (the search
 * commits on Enter and flips the dashboard to its search view) and resolve
 * once the list's own fetch for it has answered.
 */
async function searchByTag(page, tag) {
    const filtered = page.waitForResponse(
        (r) => r.url().includes('_submissions') && r.url().includes(tag)
    );
    const search = tableSearch(page);
    await expect(search).toBeVisible({timeout: 30_000});
    await search.click();
    await search.pressSequentially(tag, {delay: 25});
    await search.press('Enter');
    await filtered;
    return page.getByRole('row').filter({hasText: tag});
}

/** The dashboard's "Declined" view of a journal. */
function declinedView(contextPath) {
    return `/index.php/${contextPath}/dashboard/editorial?currentViewId=declined`;
}

test.describe('submission stage', () => {
    test('S1: open a new submission at the Submission stage', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await seedQueued(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, 'editor.diana');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectPageTitle('Submission');

        // The Submission Files panel lists the submission's file (the seed
        // carries no files, so the panel's own upload wizard provides the
        // file whose listing Rule 1 describes).
        await workflow.panel('Submission Files').getByRole('button', {name: 'Upload', exact: true}).click();
        await uploadViaWizard(page);
        await expect(workflow.panelRow('Submission Files', FIXTURE_PDF_NAME)).toBeVisible();

        // The three panels of Rule 1, in that order, and nothing else.
        await workflow.expectPanelHeadings(EDITORIAL_PANELS);

        // The decision buttons at the top (Rules 2–4), plus the journal's
        // shortcut (Rule 7).
        await expectOnwardOffered(workflow);
        await expect(workflow.actionButton(SHORTCUT)).toBeVisible();

        // Control (Rules 4, 8): no status box above "Submission Files" (the
        // panels and buttons above bound the read), and the stage label
        // under the title reads "Submission".
        await workflow.expectNoStatusBox();
        await workflow.expectStage('Submission');

        // The shortcut records no decision (Rule 7): press it, land on the
        // publication's "Title & Abstract", select "Submission" again: the
        // three decision buttons are still offered.
        await workflow.pressScheduleForPublication();
        await workflow.selectSubmissionStage();
        await expectOnwardOffered(workflow);
        await workflow.expectStage('Submission');
    });

    test('S2: send the submission to review', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await seedQueued(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, 'editor.diana');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectPageTitle('Submission');

        // Control: before the decision the screen offers the three onward
        // decisions (Rules 2–4).
        await expectOnwardOffered(workflow);

        await recordDecision(page, workflow, 'Send for Review');

        // The workflow moved to the Review stage: the menu shows "Review"
        // with "Review Round 1" (Rule 2; Side effects).
        await workflow.expectPageTitle('Review (Round 1)');
        await expect(workflow.stageLink('Review')).toBeVisible();
        await expect(workflow.roundLink(1)).toBeVisible();

        // The Submission stage after the move: its panels show (the status
        // box now leads the column), and none of the decision buttons remain
        // (Rule 9); the action region's one button bounds the read.
        await workflow.selectSubmissionStage();
        await workflow.expectPanelHeadings(['Status', ...EDITORIAL_PANELS]);
        await workflow.expectDecisionButtons([SHORTCUT]);
        await expectOnwardAbsent(workflow);
    });

    test('S3: accept and skip review', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await seedQueued(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, 'editor.diana');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectPageTitle('Submission');

        // Control (Rule 8): before the decision, no status box sits above
        // "Submission Files" — bounded by the panels and the buttons.
        await workflow.expectPanelHeadings(EDITORIAL_PANELS);
        await expectOnwardOffered(workflow);
        await workflow.expectNoStatusBox();

        await recordDecision(page, workflow, 'Accept and Skip Review');

        // Straight to the Copyediting stage, no review round created (Rule 3).
        await workflow.expectPageTitle('Copyediting');
        await expect(workflow.roundLink(1)).toHaveCount(0);

        // The Submission stage after the move (Rules 8, 9): the status box
        // at the top of the panel column, directly above "Submission
        // Files", the panels below it, and no decision buttons (the
        // shortcut alone in the action region bounds the read).
        await workflow.selectSubmissionStage();
        await workflow.expectStatusAboveFiles('The submission is currently in the Copyediting stage.');
        await workflow.expectPanelHeadings(['Status', ...EDITORIAL_PANELS]);
        await workflow.expectDecisionButtons([SHORTCUT]);
        await expectOnwardAbsent(workflow);
    });

    test('S4: decline a submission', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await seedQueued(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, 'editor.diana');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectStage('Submission');
        await recordDecision(page, workflow, 'Decline Submission');

        // Back on the Submission stage: the stage label under the title
        // reads "Declined" in place of "Submission" (Rule 4), the onward
        // buttons are gone and "Revert Decline" is offered in their place
        // (Rule 5). Nothing is asserted about the shortcut here (A1).
        await workflow.expectPageTitle('Submission');
        await workflow.expectStage('Declined');
        await expect(workflow.actionButton('Revert Decline')).toBeVisible();
        await expectOnwardAbsent(workflow);

        // The Journal Manager: "Revert Decline" and, additionally, "Delete"
        // (Rule 6) …
        const manager = await workflowAs(asUser, 'manager.maya');
        await manager.workflow.gotoEditorial(submissionId);
        await expect(manager.workflow.actionButton('Revert Decline')).toBeVisible();
        await expect(manager.workflow.actionButton('Delete')).toBeVisible();

        // … while the Section Editor (assigned on submit as the section's
        // editor) gets "Revert Decline" and no "Delete" (Actors row 7).
        const sectionEditor = await workflowAs(asUser, 'sectioneditor.ana');
        await sectionEditor.workflow.gotoEditorial(submissionId);
        await expect(sectionEditor.workflow.actionButton('Revert Decline')).toBeVisible();
        await expect(sectionEditor.workflow.actionButton('Delete')).toHaveCount(0);
    });

    test('S5: revert a decline', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        // The declined state seeded through the real InitialDecline decision.
        const {submissionId} = await seedQueued(ojsApi, tag, {decisions: ['initialDecline']});

        const {page, workflow} = await workflowAs(asUser, 'editor.diana');
        await workflow.gotoEditorial(submissionId);

        // The declined state as the starting point, the control for the
        // restore: "Declined" under the title, "Revert Decline" and (for an
        // Editor) "Delete" offered, no onward buttons.
        await workflow.expectStage('Declined');
        await expect(workflow.actionButton('Revert Decline')).toBeVisible();
        await expect(workflow.actionButton('Delete')).toBeVisible();
        await expectOnwardAbsent(workflow);

        await recordDecision(page, workflow, 'Revert Decline');

        // The submission is queued again (Rules 4, 5): the stage label
        // reads "Submission" again and the onward buttons are back …
        await workflow.expectPageTitle('Submission');
        await workflow.expectStage('Submission');
        await expectOnwardOffered(workflow);

        // … while "Revert Decline" and "Delete" are no longer offered, each
        // being offered only in the declined state (Actors rows 6–7).
        await expect(workflow.actionButton('Revert Decline')).toHaveCount(0);
        await expect(workflow.actionButton('Delete')).toHaveCount(0);
    });

    test('S6: delete a declined submission', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        // A scratch journal with throwaway accounts (fn-s): the Author's
        // mailbox must be a fresh address, since other suites' decision mail
        // to author.alex lands in the same Mailpit in parallel (A8).
        const tag = makeTag('s6', testInfo);
        const manager = `${tag}mgr`;
        const sectionEditor = `${tag}se`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [
                {username: manager, roles: ['manager']},
                {username: sectionEditor, roles: ['sectionEditor']},
                {username: author, roles: ['author']},
            ],
        });
        // Two sibling tags (neither a substring of the other's rows): the
        // submission to delete, declined on screen below so the wizard's
        // own email to the Author is the mailbox's positive control, plus a
        // second declined seed that stays — the positive control for the
        // Declined-view search after the delete.
        const doomedTag = `${tag}d`;
        const keptTag = `${tag}k`;
        const assigned = {participants: [{username: sectionEditor, role: 'sectionEditor'}]};
        const {submissionId} = await seedQueued(ojsApi, doomedTag, {
            context: tag,
            submitter: author,
            ...assigned,
        });
        await seedQueued(ojsApi, keptTag, {
            context: tag,
            submitter: author,
            decisions: ['initialDecline'],
            ...assigned,
        });
        const authorEmail = mailOf(author);

        // The Journal Manager declines the submission on screen: the
        // decision's email reaches the Author (the mailbox's control).
        const {page, workflow} = await workflowAs(asUser, manager, tag);
        await workflow.gotoEditorial(submissionId);
        await recordDecision(page, workflow, 'Decline Submission');
        await workflow.expectStage('Declined');
        const declineMail = await pkpMail.find({to: authorEmail, contains: `Submission ${doomedTag}`});
        expect(await pkpMail.count({to: authorEmail})).toBe(1);

        // Control: a Section Editor assigned to the same declined submission
        // sees "Revert Decline" and no "Delete" (Actors row 7).
        const se = await workflowAs(asUser, sectionEditor, tag);
        await se.workflow.gotoEditorial(submissionId);
        await expect(se.workflow.actionButton('Revert Decline')).toBeVisible();
        await expect(se.workflow.actionButton('Delete')).toHaveCount(0);

        // The declined submission is listed on the dashboard's Declined view
        // (positive control for its later absence).
        await page.goto(declinedView(tag));
        await expect(await searchByTag(page, doomedTag)).toBeVisible({timeout: 30_000});

        // The Journal Manager deletes it through the confirm dialog ("Are
        // you sure you want to permanently delete this submission?"): the
        // submission is removed and the workflow panel closes (Rule 6).
        await workflow.gotoEditorial(submissionId);
        await workflow.deleteSubmission();

        // The Declined view: the kept seed is still found the same way
        // (positive control) …
        await page.goto(declinedView(tag));
        await expect(await searchByTag(page, keptTag)).toBeVisible({timeout: 30_000});

        // … while the deleted one no longer appears, searched the same way
        // on a freshly opened Declined view (a committed search flips the
        // dashboard to its search view and removes the in-page box); the
        // absence is bounded by the search's own response.
        await page.goto(declinedView(tag));
        await expect(await searchByTag(page, doomedTag)).toHaveCount(0);

        // The Author's mailbox: nothing is emailed on delete (Side effects).
        // The count is what it was after the decline, and the newest message
        // is still the decline's; the delete's own response and the two
        // list fetches above bound the read.
        expect(await pkpMail.count({to: authorEmail})).toBe(1);
        const newest = await pkpMail.find({to: authorEmail});
        expect(newest.ID).toBe(declineMail.ID);
    });

    test('S7: the author\'s view offers no decisions', {tag: '@smoke'}, async ({asUser, ojsApi}, testInfo) => {
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await seedQueued(ojsApi, tag, {submitter: 'author.alex'});

        const author = await workflowAs(asUser, 'author.alex');
        await author.workflow.gotoAuthor(submissionId);
        await author.workflow.expectPageTitle('Submission');

        // The two panels of the author view, and nothing else: no
        // "Participants" panel (Rule 10) — the exact ordered heading list.
        await author.workflow.expectPanelHeadings(AUTHOR_PANELS);

        // The top of the screen: no decision buttons, no "Delete", no
        // "Schedule For Publication" shortcut (Rule 10; Actors row 8) —
        // bounded by the panels above.
        await expectOnwardAbsent(author.workflow);
        await expect(author.workflow.actionButton('Delete')).toHaveCount(0);
        await expect(author.workflow.actionButton(SHORTCUT)).toHaveCount(0);
        await expect(author.workflow.decisionButton(SHORTCUT)).toHaveCount(0);

        // Control: an Editor opening the same submission sees the
        // "Participants" panel, the three decision buttons and the shortcut
        // (Rules 1–4, 7).
        const editor = await workflowAs(asUser, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await editor.workflow.expectPanelHeadings(EDITORIAL_PANELS);
        await expectOnwardOffered(editor.workflow);
        await expect(editor.workflow.actionButton(SHORTCUT)).toBeVisible();
    });

    test('S10: an assistant assigned at the Submission stage', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        // The Funding Coordinator (the one default assistant group whose
        // stage set includes the Submission stage) assigned as
        // `participants[]`, the row the Assign Participant form writes.
        const {submissionId} = await seedQueued(ojsApi, tag, {
            participants: [{username: 'assistant.rita', role: 'funding'}],
        });

        const funding = await workflowAs(asUser, 'assistant.rita');
        await funding.workflow.gotoEditorial(submissionId);
        await funding.workflow.expectPageTitle('Submission');

        // The three panels, in that order (Actors row 1; Rule 1).
        await funding.workflow.expectPanelHeadings(EDITORIAL_PANELS);

        // The decision buttons: none (Actors row 2). The action region
        // holds exactly the shortcut, which is the positive control for the
        // absence read in the same region.
        await funding.workflow.expectDecisionButtons([SHORTCUT]);
        await expectOnwardAbsent(funding.workflow);

        // "Schedule For Publication" for this role too: press it, the panel
        // moves to the publication's "Title & Abstract" (Actors row 8; Rule 7).
        await funding.workflow.pressScheduleForPublication();

        // Control: an Editor opening the same submission is offered the
        // three decisions (Rules 2–4).
        const editor = await workflowAs(asUser, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await expectOnwardOffered(editor.workflow);
    });

    test('S11: reviewers suggested by the author', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        // A scratch journal with "Reviewer Suggestion at Submission" on
        // (fn-s): the seeded journal keeps the setting off.
        const tag = makeTag('s11', testInfo);
        const editor = `${tag}ed`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            review: {reviewerSuggestionEnabled: true},
            users: [
                {username: editor, roles: ['editor']},
                {username: author, roles: ['author']},
            ],
        });
        const suggested = {givenName: 'Sam', familyName: 'Suggested'};
        const reason = 'Knows the field.';
        const first = await seedQueued(ojsApi, `${tag}a`, {
            context: tag,
            submitter: author,
            reviewerSuggestions: [{...suggested, email: 'sam.suggested@mail.test', suggestionReason: reason}],
        });
        const second = await seedQueued(ojsApi, `${tag}b`, {context: tag, submitter: author});

        const {workflow} = await workflowAs(asUser, editor, tag);

        // The first article: a fourth panel headed "Reviewers Suggested by
        // Author" under "Participants", listing "Sam Suggested" with the
        // author's reason (Rule 1; Settings).
        await workflow.gotoEditorial(first.submissionId);
        await workflow.expectPageTitle('Submission');
        await workflow.expectPanelHeadings([...EDITORIAL_PANELS, SUGGESTED_PANEL_HEADING]);
        await workflow.expectSuggestedReviewer(`${suggested.givenName} ${suggested.familyName}`, reason);

        // Control: the second article shows the three panels and no
        // "Reviewers Suggested by Author" panel (Rule 1).
        await workflow.gotoEditorial(second.submissionId);
        await workflow.expectPageTitle('Submission');
        await workflow.expectPanelHeadings(EDITORIAL_PANELS);
        await workflow.expectNoSuggestedReviewersPanel();
    });
});
