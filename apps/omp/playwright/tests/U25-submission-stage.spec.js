// @ts-check
/**
 * @file playwright/tests/U25-submission-stage.spec.js
 *
 * Submission stage — OMP suite, one test per canonical scenario the spec
 * runs on a press (S1–S7 common; S8 OMP-only; S10 and S11 OJS/OMP;
 * scenario 9 is OPS-only), in the press's own context: Press Editor,
 * monograph, series, the press decision roster ("Send to External Review"
 * in place of "Send for Review", plus "Send to Internal Review", and no
 * "Schedule For Publication" shortcut, whose absence is the plain Rule 7
 * claim S8 asserts).
 * Spec: docs/specs/U25-submission-stage.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 ❓
 * (a press has no shortcut; nothing is asserted about a journal's shortcut
 * in the declined state), A2 ❓ (no recommend-only assignment is made), A3 ❓
 * (S6 never revisits the deleted monograph's address), OMP1 ✅ (the two
 * review routes are asserted for their landing, never for the Internal
 * Review stage's contents), OPS1 ✅ (the preprint server's territory). The
 * spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only (A1, A7). S1–S5, S7, S8 and S10 seed scratch monographs
 * with unique tags (M5) in series `monographs` on the seeded press (its
 * submit-time auto-assignment enrols the seeded deciding editors and the
 * Series editor `sectioneditor.ana`); the declined and post-decision states
 * are reached by recording the decisions on screen. S6 isolates on a
 * scratch press with throwaway Manager, Series editor and Author accounts
 * (fn-s): the Author's mailbox read is a before/after count scoped to that
 * fresh address, bounded by the decline wizard's own email as the positive
 * control (A8), the decline being recorded on screen for that reason. S10
 * seeds the Funding Coordinator as `participants[]`, the row the Assign
 * Participant form writes. S11 isolates on a scratch press with "Reviewer
 * Suggestion at Submission" on (`review.reviewerSuggestionEnabled`) and
 * throwaway Editor and Author accounts, the suggestion seeded as the
 * wizard's step stores it (`reviewerSuggestions[]`). Every absence is a
 * settled read paired with a positive control on the same screen (M4, M6).
 * Waits are web-first (A5). Everything runs in the parallel `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {
    STATUS,
    primaryRegion,
    actionsRegion,
    secondaryRegion,
    decisionButton,
    openEditorial,
    openAuthorView,
    walkDecisionWizard,
    completeUploadWizard,
    expectStageLabel,
    expectNoStatusBox,
    expectStatusBoxAboveFiles,
    expectSubmissionPanels,
    menuEntriesUnder,
    secondaryHeadings,
    suggestedReviewersHeading,
    suggestedReviewerRow,
} = require('../pages/ReviewStagePages.js');
const {SUGGESTED_PANEL_HEADING} = require('../../../../shared/playwright/pages/ReviewerSuggestionPages.js');

const PK = 'publicknowledge';

/** The press's Submission-stage decision buttons (Rule 2–6, OMP labels). */
const BUTTONS = {
    external: 'Send to External Review',
    accept: 'Accept and Skip Review',
    decline: 'Decline Submission',
    internal: 'Send to Internal Review',
    revert: 'Revert Decline',
    delete: 'Delete',
};

/** The journal-only shortcut a press never shows (Rule 7). */
const SHORTCUT = 'Schedule For Publication';

/** The onward (queued-state) roster, in the order the screen shows it. */
const QUEUED_ORDER = [
    BUTTONS.external,
    BUTTONS.accept,
    BUTTONS.decline,
    BUTTONS.internal,
];

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}ompw${testInfo.parallelIndex}${rand}`;
}

/** A throwaway account for a scratch press (scenarios.md `users[]`). */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/**
 * Seed a monograph on publicknowledge in series `monographs` (submit-time
 * auto-assignment enrols the seeded deciding editors).
 */
async function seedMonograph(ompApi, tag, {decisions = [], participants = []} = {}) {
    const spec = {
        tag,
        context: PK,
        submitter: 'author.alex',
        series: 'monographs',
    };
    if (decisions.length) {
        spec.decisions = decisions;
    }
    if (participants.length) {
        spec.participants = participants;
    }
    return ompApi.createSubmission(spec);
}

/** Click a decision button and complete its wizard to the summary panel. */
async function recordDecision(page, modal, label) {
    await decisionButton(modal, label).click();
    await expect(
        page.getByRole('heading', {level: 1, name: new RegExp(label)})
    ).toBeVisible({timeout: 15_000});
    await walkDecisionWizard(page);
}

/** Select the Submission stage in the workflow menu of an onward workflow. */
async function gotoSubmissionStage(modal) {
    await modal.locator('nav').getByText('Submission', {exact: true}).click();
    await expect(
        modal.getByRole('heading', {name: 'Workflow: Submission'})
    ).toBeVisible({timeout: 15_000});
}

/**
 * The whole queued roster is offered, in order, and the journal's shortcut
 * is not (Rules 2–4, 7).
 */
async function expectQueuedRoster(modal) {
    await expect(actionsRegion(modal).getByRole('button')).toHaveText(QUEUED_ORDER, {
        timeout: 20_000,
    });
    await expect(modal.getByRole('button', {name: SHORTCUT})).toHaveCount(0);
}

/**
 * Off the active stage: the Submission stage's panels show and no decision
 * button remains, the action region itself being gone (Rule 9).
 */
async function expectPanelsWithoutDecisions(modal) {
    await expectSubmissionPanels(modal);
    await expect(actionsRegion(modal)).toHaveCount(0);
    for (const label of [...QUEUED_ORDER, BUTTONS.revert, BUTTONS.delete]) {
        await expect(modal.getByRole('button', {name: label, exact: true})).toHaveCount(0);
    }
}

/**
 * On the editorial dashboard, open the Declined view (the view list beside
 * the submissions table); resolves once the view's own list request
 * (status = declined) has answered. Freshly seeded submissions are the
 * newest, so they land on the view's first page.
 */
async function openDeclinedView(page, contextPath = PK) {
    await page.goto(`/index.php/${contextPath}/en/dashboard/editorial`);
    const answered = page.waitForResponse(
        (r) =>
            r.url().includes('_submissions') &&
            r.url().includes('status%5B%5D=4') &&
            r.ok()
    );
    await page.getByText('Declined', {exact: true}).first().click();
    await answered;
}

test.describe('Submission stage (U25)', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(300_000));

    test('S1: open a new monograph at the Submission stage', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s1');
        const fileName = `ms-${tag}.txt`;
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // The three panels, in their order (Rule 1): "Submission Files"
        // then "Desk Review Tasks & Discussions" in the main column,
        // "Participants" in the right-hand one.
        await expectSubmissionPanels(modal);

        // The Submission Files panel lists an uploaded file (the seed
        // carries none, so the panel's own Upload control provides it).
        const primary = primaryRegion(modal);
        await primary.getByRole('button', {name: 'Upload', exact: true}).first().click();
        await completeUploadWizard(page, fileName);
        await expect(primary.getByText(fileName).first()).toBeVisible({
            timeout: 15_000,
        });

        // The decision buttons at the top of the screen (press roster,
        // Rules 2–4).
        for (const label of QUEUED_ORDER) {
            await expect(decisionButton(modal, label)).toBeVisible();
        }

        // Control: no status box sits above "Submission Files" while the
        // submission is active here, and the stage label under the title
        // reads "Submission" (Rules 4, 8).
        await expectNoStatusBox(modal);
        await expectStageLabel(modal, 'Submission');
    });

    test('S2: send the monograph to (external) review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s2');
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // Control: before the decision, the same screen offers the onward
        // roster (Rules 2–4).
        await expectQueuedRoster(modal);

        await recordDecision(page, modal, BUTTONS.external);

        // The workflow moved to External Review, Round 1 open (Rule 2): the
        // workflow menu shows "External Review" with "Review Round 1".
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect
            .poll(() => menuEntriesUnder(modal2, 'External Review'), {timeout: 20_000})
            .toEqual(['Review Round 1']);

        // Reopening the Submission stage shows its panels but no decision
        // buttons (Rule 9).
        await gotoSubmissionStage(modal2);
        await expectPanelsWithoutDecisions(modal2);
    });

    test('S3: accept and skip review', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s3');
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // Control: before the decision, no status box sits above
        // "Submission Files" (Rule 8).
        await expectNoStatusBox(modal);
        await expect(decisionButton(modal, BUTTONS.accept)).toBeVisible();

        await recordDecision(page, modal, BUTTONS.accept);

        // Straight to Copyediting, no review (Rule 3).
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: Copyediting'})
        ).toBeVisible();
        await expectStageLabel(modal2, 'Copyediting');

        // The Submission stage after the move: a status box at the top of
        // the panel column, above "Submission Files", reading where the
        // submission now stands; the panels below it, and no decision
        // buttons (Rules 8, 9).
        await gotoSubmissionStage(modal2);
        await expectStatusBoxAboveFiles(modal2, STATUS.inCopyediting);
        await expectPanelsWithoutDecisions(modal2);
    });

    test('S4: decline a monograph', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s4');
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // Before the decision: the stage label reads "Submission" and the
        // onward roster is offered (Rules 2–4).
        await expectStageLabel(modal, 'Submission');
        await expectQueuedRoster(modal);

        await recordDecision(page, modal, BUTTONS.decline);

        // Back on the stage: the label reads "Declined" in place of
        // "Submission", the onward buttons are gone and Revert Decline
        // stands in their place (Rules 4–5).
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible();
        await expectStageLabel(modal2, 'Declined');
        await expect(decisionButton(modal2, BUTTONS.revert)).toBeVisible();
        for (const label of QUEUED_ORDER) {
            await expect(decisionButton(modal2, label)).toHaveCount(0);
        }

        // A Press Manager additionally sees Delete (Rule 6)…
        const mayaPage = await (await asUser('manager.maya')).newPage();
        const mayaModal = await openEditorial(mayaPage, PK, seeded.submissionId);
        await expect(decisionButton(mayaModal, BUTTONS.revert)).toBeVisible();
        await expect(decisionButton(mayaModal, BUTTONS.delete)).toBeVisible();

        // …while the assigned Series editor does not (Actors row 7).
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const anaModal = await openEditorial(anaPage, PK, seeded.submissionId);
        await expect(decisionButton(anaModal, BUTTONS.revert)).toBeVisible();
        await expect(decisionButton(anaModal, BUTTONS.delete)).toHaveCount(0);
    });

    test('S5: revert a decline', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s5');
        const seeded = await seedMonograph(ompApi, tag, {
            decisions: ['initialDecline'],
        });

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);

        // While declined, Revert Decline is the offered decision, with
        // Delete beside it for the Press Editor (a manager-level group),
        // and the stage label reads "Declined" (Rules 4–6).
        await expectStageLabel(modal, 'Declined');
        await expect(decisionButton(modal, BUTTONS.revert)).toBeVisible();
        await expect(decisionButton(modal, BUTTONS.delete)).toBeVisible();
        for (const label of QUEUED_ORDER) {
            await expect(decisionButton(modal, label)).toHaveCount(0);
        }

        await recordDecision(page, modal, BUTTONS.revert);

        // Queued again: the stage label reads "Submission" and the onward
        // roster returns (Rules 4, 5).
        const modal2 = await openEditorial(page, PK, seeded.submissionId);
        await expectStageLabel(modal2, 'Submission');
        await expectQueuedRoster(modal2);

        // Control: "Revert Decline" and "Delete" are no longer offered
        // (Actors rows 6–7).
        await expect(decisionButton(modal2, BUTTONS.revert)).toHaveCount(0);
        await expect(decisionButton(modal2, BUTTONS.delete)).toHaveCount(0);
    });

    test('S6: delete a declined monograph', async ({ompApi, asUser, pkpMail}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s6');
        // A scratch press the test alone feeds: a throwaway Press Manager,
        // Series editor and Author; the Author's monograph with the Series
        // editor assigned on the seed (fn-s). The mailbox read is scoped to
        // the Author's fresh address (A8).
        const managerName = `${tag}mg`;
        const editorName = `${tag}se`;
        const authorName = `${tag}au`;
        const mailTo = `${authorName}@mail.test`;
        await ompApi.createContext({
            tag,
            users: [
                user(managerName, 'Mira', 'Manager', ['manager']),
                user(editorName, 'Sena', 'Series', ['sectionEditor']),
                user(authorName, 'Ada', 'Author', ['author']),
            ],
        });
        const title = `Submission ${tag}`;
        const seeded = await ompApi.createSubmission({
            tag,
            context: tag,
            submitter: authorName,
            title,
            participants: [{username: editorName, role: 'sectionEditor'}],
        });
        expect(await pkpMail.count({to: mailTo})).toBe(0);

        // The Press Manager declines the monograph on screen: the wizard's
        // own email to the Author is the mailbox's positive control.
        const page = await (await asUser(managerName)).newPage();
        const modal = await openEditorial(page, tag, seeded.submissionId);
        await expectStageLabel(modal, 'Submission');
        await recordDecision(page, modal, BUTTONS.decline);
        const declineMail = await pkpMail.find({to: mailTo});
        expect(await pkpMail.count({to: mailTo})).toBe(1);

        // Control 1: the declined monograph is listed in the dashboard's
        // Declined view (declined submissions appear only there).
        await openDeclinedView(page, tag);
        await expect(page.getByText(title).first()).toBeVisible();

        // Control 2: on the same declined monograph the assigned Series
        // editor sees "Revert Decline" and no "Delete" (Actors row 7).
        const editorPage = await (await asUser(editorName)).newPage();
        const editorModal = await openEditorial(editorPage, tag, seeded.submissionId);
        await expectStageLabel(editorModal, 'Declined');
        await expect(decisionButton(editorModal, BUTTONS.revert)).toBeVisible();
        await expect(decisionButton(editorModal, BUTTONS.delete)).toHaveCount(0);

        // The Press Manager deletes: confirm dialog verbatim (Rule 6).
        const modal2 = await openEditorial(page, tag, seeded.submissionId);
        await expectStageLabel(modal2, 'Declined');
        await decisionButton(modal2, BUTTONS.delete).click();
        const dialog = page.getByRole('dialog').filter({
            hasText: 'Are you sure you want to permanently delete this submission?',
        });
        await expect(
            dialog.getByRole('heading', {name: 'Delete', exact: true})
        ).toBeVisible({timeout: 10_000});
        await expect(dialog.getByRole('button', {name: 'Cancel'})).toBeVisible();
        const deleted = page.waitForResponse(
            (r) => r.url().includes(`/_submissions/${seeded.submissionId}`) && r.request().method() === 'POST'
        );
        await dialog.getByRole('button', {name: 'Confirm'}).click();
        expect((await deleted).ok()).toBe(true);

        // The workflow closes…
        await expect(page.getByRole('heading', {name: /^Workflow:/})).toHaveCount(0, {
            timeout: 20_000,
        });

        // …and the monograph no longer appears in the Declined view.
        await openDeclinedView(page, tag);
        await expect(page.getByText(title)).toHaveCount(0);

        // The Author's mailbox (Side effects): nothing arrived for the
        // delete. The count taken after the delete's response and the
        // list's reload is still the decline's one message, and the newest
        // message is that same one.
        expect(await pkpMail.count({to: mailTo})).toBe(1);
        expect((await pkpMail.find({to: mailTo})).ID).toBe(declineMail.ID);
    });

    test("S7: the author's view offers no decisions", async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s7');
        const seeded = await seedMonograph(ompApi, tag);

        const page = await (await asUser('author.alex')).newPage();
        const modal = await openAuthorView(page, PK, seeded.submissionId);

        // The two panels of the author view (Rule 10)…
        const primary = primaryRegion(modal);
        await expect(
            primary.getByRole('heading', {name: /^(Submission Files|Desk Review Tasks & Discussions)$/})
        ).toHaveText(['Submission Files', 'Desk Review Tasks & Discussions']);

        // …and nothing else: no Participants panel, no action area, no
        // decision buttons, no "Delete", no "Schedule For Publication"
        // shortcut; no way to send, accept, decline or delete (Rule 10;
        // Actors row 8).
        await expect(modal.getByRole('heading', {name: 'Participants'})).toHaveCount(0);
        await expect(secondaryRegion(modal)).toHaveCount(0);
        await expect(actionsRegion(modal)).toHaveCount(0);
        for (const label of [...QUEUED_ORDER, BUTTONS.revert, BUTTONS.delete, SHORTCUT]) {
            await expect(
                modal.getByRole('button', {name: label, exact: true})
            ).toHaveCount(0);
        }

        // Control: an Editor opening the same monograph sees the
        // "Participants" panel and the decision buttons (Rules 1–4).
        const editorPage = await (await asUser('editor.diana')).newPage();
        const editorModal = await openEditorial(editorPage, PK, seeded.submissionId);
        await expectSubmissionPanels(editorModal);
        for (const label of QUEUED_ORDER) {
            await expect(decisionButton(editorModal, label)).toBeVisible();
        }
    });

    test('S8: the press decision roster and its two review routes (OMP1)', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s8');
        const [first, second] = await Promise.all([
            seedMonograph(ompApi, `${tag}a`),
            seedMonograph(ompApi, `${tag}b`),
        ]);

        const page = await (await asUser('editor.diana')).newPage();
        const modal = await openEditorial(page, PK, first.submissionId);

        // The buttons read, in order: Send to External Review, Accept and
        // Skip Review, Decline Submission, Send to Internal Review — and
        // the journal's Schedule For Publication shortcut is absent
        // (Rules 2, 7; OMP1).
        await expectQueuedRoster(modal);

        // "Send to External Review" skips the internal review stage and
        // opens External Review Round 1 directly: the workflow menu shows
        // "External Review" with "Review Round 1" and nothing under
        // "Internal Review" (Rule 2; OMP1).
        await recordDecision(page, modal, BUTTONS.external);
        const external = await openEditorial(page, PK, first.submissionId);
        await expect(
            external.getByRole('heading', {name: 'Workflow: External Review (Round 1)'})
        ).toBeVisible();
        await expect
            .poll(() => menuEntriesUnder(external, 'External Review'), {timeout: 20_000})
            .toEqual(['Review Round 1']);
        expect(await menuEntriesUnder(external, 'Internal Review')).toEqual([]);

        // Control: after the move, the Submission stage shows its panels
        // and no decision buttons (Rule 9).
        await gotoSubmissionStage(external);
        await expectPanelsWithoutDecisions(external);

        // "Send to Internal Review" on the second monograph routes into
        // the earlier Internal Review stage: the workflow menu shows
        // "Internal Review" with "Review Round 1" (Rule 2; OMP1; the stage
        // itself is documented separately).
        const modal2 = await openEditorial(page, PK, second.submissionId);
        await expectQueuedRoster(modal2);
        await recordDecision(page, modal2, BUTTONS.internal);
        const internal = await openEditorial(page, PK, second.submissionId);
        await expect(
            internal.getByRole('heading', {name: 'Workflow: Internal Review (Round 1)'})
        ).toBeVisible();
        await expect
            .poll(() => menuEntriesUnder(internal, 'Internal Review'), {timeout: 20_000})
            .toEqual(['Review Round 1']);
        expect(await menuEntriesUnder(internal, 'External Review')).toEqual([]);

        // Control: after this move too, the Submission stage shows its
        // panels and no decision buttons (Rule 9).
        await gotoSubmissionStage(internal);
        await expectPanelsWithoutDecisions(internal);
    });

    test('S10: an assistant assigned at the Submission stage', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s10');
        const seeded = await seedMonograph(ompApi, tag, {
            participants: [{username: 'assistant.rita', role: 'funding'}],
        });

        // The Funding Coordinator (the one default assistant group whose
        // stage set includes the Submission stage) opens the monograph:
        // the three panels, in order (Actors row 1; Rule 1).
        const page = await (await asUser('assistant.rita')).newPage();
        const modal = await openEditorial(page, PK, seeded.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible();
        await expectSubmissionPanels(modal);
        await expect(
            secondaryRegion(modal).getByText('Rita Assistant').first()
        ).toBeVisible();

        // The decision buttons: none of the press's roster, no action
        // area at all, and no "Schedule For Publication" shortcut (Actors
        // row 2; Rule 7).
        await expect(actionsRegion(modal)).toHaveCount(0);
        for (const label of [...QUEUED_ORDER, BUTTONS.revert, BUTTONS.delete, SHORTCUT]) {
            await expect(modal.getByRole('button', {name: label, exact: true})).toHaveCount(0);
        }

        // Control: the Press Editor opening the same monograph is offered
        // the whole roster (Rules 2–4).
        const editorPage = await (await asUser('editor.diana')).newPage();
        const editorModal = await openEditorial(editorPage, PK, seeded.submissionId);
        await expectSubmissionPanels(editorModal);
        await expectQueuedRoster(editorModal);
    });

    test('S11: reviewers suggested by the author', async ({ompApi, asUser}, testInfo) => {
        const tag = makeTag(testInfo, 'u25s11');
        // A scratch press with "Reviewer Suggestion at Submission" on, a
        // throwaway Editor and Author; two monographs by that Author, the
        // first carrying the one suggestion its author entered when
        // submitting, the second none (fn-s).
        const editorName = `${tag}ed`;
        const authorName = `${tag}au`;
        await ompApi.createContext({
            tag,
            review: {reviewerSuggestionEnabled: true},
            users: [
                user(editorName, 'Edna', 'Editor', ['editor']),
                user(authorName, 'Ada', 'Author', ['author']),
            ],
        });
        const [withSuggestion, without] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}a`,
                context: tag,
                submitter: authorName,
                title: `Suggested ${tag}`,
                reviewerSuggestions: [
                    {
                        givenName: 'Sam',
                        familyName: 'Suggested',
                        email: 'sam.suggested@mail.test',
                        suggestionReason: 'Knows the field.',
                    },
                ],
            }),
            ompApi.createSubmission({
                tag: `${tag}b`,
                context: tag,
                submitter: authorName,
                title: `Plain ${tag}`,
            }),
        ]);

        // The first monograph's Submission stage: a fourth panel headed
        // "Reviewers Suggested by Author" under the "Participants" panel,
        // listing "Sam Suggested" with the reason "Knows the field."
        // (Rule 1; Settings).
        const page = await (await asUser(editorName)).newPage();
        const modal = await openEditorial(page, tag, withSuggestion.submissionId);
        await expect(
            modal.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible();
        await expectSubmissionPanels(modal);
        await expect(secondaryHeadings(modal)).toHaveText(['Participants', SUGGESTED_PANEL_HEADING], {
            timeout: 20_000,
        });
        await expect(suggestedReviewersHeading(modal)).toBeVisible();
        const row = suggestedReviewerRow(modal, 'Sam Suggested');
        await expect(row).toHaveCount(1);
        await expect(row).toContainText('Sam Suggested');
        await expect(row).toContainText('Knows the field.');

        // Control: the second monograph shows the "Submission Files",
        // "Desk Review Tasks & Discussions" and "Participants" panels, and
        // no "Reviewers Suggested by Author" panel (Rule 1).
        const modal2 = await openEditorial(page, tag, without.submissionId);
        await expect(
            modal2.getByRole('heading', {name: 'Workflow: Submission'})
        ).toBeVisible();
        await expectSubmissionPanels(modal2);
        await expect(secondaryHeadings(modal2)).toHaveText(['Participants']);
        await expect(suggestedReviewersHeading(modal2)).toHaveCount(0);
        await expect(modal2.getByText(SUGGESTED_PANEL_HEADING)).toHaveCount(0);
    });
});
