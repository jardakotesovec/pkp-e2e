// @ts-check
/**
 * @file playwright/tests/U30-author-response-to-reviews.spec.js
 *
 * Author response to reviews — OJS suite, one test per canonical scenario the
 * spec runs on OJS (common scenarios 1–6 and 8; scenario 7 is the {OMP OPS}
 * absence scenario, in those trees).
 * Spec: docs/specs/U30-author-response-to-reviews.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register —
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap): A1 🐞,
 * A2 ❓, A3 🐞, A4 🐞, A5 🐞, A6 ❓, A7 🐞, A8 ❓, OMP1 🐞. Where a test
 * passes through one (S1 and S8 send a request, S2 reads the editor's side
 * after a response, S6 walks the Funding Coordinator and the typed address,
 * S5 reads the minimum's email) it asserts the effect the spec states and
 * leaves the finding's own claim unasserted either way.
 *
 * Seeding: scenario endpoints only. publicknowledge and the 18 seeded users
 * are read-only; scenarios 1–4, 6 and 8 use scratch submissions on the seeded
 * journal with the ready roster (footnote s); scenario 4 records its Request
 * Revisions decision through the wizard (a seeded decision sends no email);
 * scenario 5 seeds a scratch journal through the `review:
 * {numReviewsPerSubmission: 1, defaultReviewMode: 'open'}` passthrough with
 * throwaway users whose addresses carry app + test. There is no scenario-API
 * key for a submitted author response, so the response states are reached by
 * driving the window the feature is about (A4 in scenarios.md sense: the
 * behaviour under test). Mail is read by recipient plus the tag-bearing
 * submission title (PRINCIPLES A8); silence claims are bounded by the mail or
 * effect that would carry them. No hard-coded waits.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {
    WorkflowPage: ReviewWorkflowPage,
    DecisionPage,
    openReviewDetails,
    markReviewComplete,
    closeReviewDetails,
    waitForJQueryIdle,
} = require('../pages/ReviewStagePages.js');
const {
    AuthorResponseTable,
    AuthorResponseCard,
    AuthorResponseWindow,
    RequestAuthorResponsePage,
    STATUS,
} = require('../pages/AuthorResponsePages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {getPassword} = require('../../../../shared/playwright/data/users.js');

const JOURNAL = 'publicknowledge';
const REQUEST_SUBJECT = 'Request For Author Response To Reviewer Feedback';
const REQUEST_EMAIL_ROW = 'Request For Author Response To Reviewer Feedback';
const DECISION_SUBJECT = 'Your submission has been reviewed and we encourage you to submit revisions';
const ALEX = 'Alex Author';
const BEA = 'Bea Author';
const ROUND_1_HEADING = 'Workflow: Review (Round 1)';
const ADVANCED_SENTENCE = 'The submission has been advanced to the next round of review';

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u30${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Seed a submission standing in external review on the given journal with
 * one round of reviewers (`reviewers`), or several rounds (`reviewRounds`:
 * the decision seeds the first entry into round 1 and every entry left over
 * builds a further round, footnote s). Returns the submission id, round 1's
 * id, every round id in order, and the title the test sent (the endpoint
 * does not echo the title).
 */
async function seedReviewedRound(ojsApi, tag, {
    context = JOURNAL,
    submitter = 'author.alex',
    reviewers = [],
    reviewRounds = null,
    decisions = ['sendExternalReview'],
    participants = [],
    title = `Submission ${tag}`,
} = {}) {
    const result = await ojsApi.createSubmission({
        tag,
        context,
        submitter,
        title,
        decisions,
        reviewRounds: reviewRounds || [{reviewers}],
        participants,
    });
    return {
        submissionId: result.submissionId,
        reviewRoundId: result.reviewRounds[0].id,
        reviewRoundIds: result.reviewRounds.map((round) => round.id),
        title,
    };
}

/**
 * Record the "Request Revisions" decision (no new round) through the wizard
 * as the signed-in editor on the open round. The wizard's "Notify Authors"
 * step sends the decision email the author's bullets read; `completeAll()`
 * walks every step and returns to the workflow.
 */
async function requestRevisionsViaWizard(page, contextPath) {
    const reviewWorkflow = new ReviewWorkflowPage(page, contextPath);
    await reviewWorkflow.clickRequestRevisions({newRound: false});
    const decision = new DecisionPage(page);
    await decision.expectOpen('Request Revisions');
    await decision.completeAll();
}

/** The greeting of a request email naming both assigned authors, in either order. */
function greetingNaming(a, b) {
    return new RegExp(`Hello (${a}, ${b}|${b}, ${a})`);
}

/** A brand-new signed-out context (never inherits the file's storage state). */
async function anonymousContext(browser, baseURL) {
    return browser.newContext({baseURL, storageState: {cookies: [], origins: []}});
}

/** The first href in an email's HTML whose visible text matches. */
function linkByText(html, text) {
    const anchorRe = /<a\b[^>]*href=(["'])([^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = anchorRe.exec(html)) !== null) {
        if (match[3].replace(/<[^>]+>/g, '').trim().includes(text)) {
            return match[2].replace(/&amp;/g, '&');
        }
    }
    return null;
}

/**
 * The editor presses "Request Response" on the open round and sends the
 * request, returning to the workflow through "View Submission Summary".
 */
async function sendRequestViaUi(page, table, requestPage) {
    await expect(table.requestResponseButton()).toBeEnabled({timeout: 30_000});
    await table.requestResponseButton().click();
    await requestPage.expectLoaded();
    await requestPage.submit();
    await requestPage.viewSubmissionSummaryLink().click();
    await expect(table.table()).toBeVisible({timeout: 30_000});
}

/**
 * Wait until the page's own API traffic has been quiet for a short spell. The
 * response window is built from the panel's publication fetch, and a trigger
 * pressed before that fetch lands mounts the window BLANK for good; the fetch
 * fires as the panel/card mounts, so a settle after navigation is the signal
 * that it is in. Event-driven with `expect.poll` (no fixed sleeps); bounded,
 * and a no-op once already quiet. `networkidle` is avoided because the
 * dashboard polls (patterns.md).
 */
async function settleApi(page, {quietMs = 900, timeout = 25_000} = {}) {
    let inflight = 0;
    let last = Date.now();
    const inc = (r) => {
        if (r.url().includes('/api/')) {
            inflight++;
            last = Date.now();
        }
    };
    const dec = (r) => {
        if (r.url().includes('/api/')) {
            inflight = Math.max(0, inflight - 1);
            last = Date.now();
        }
    };
    page.on('request', inc);
    page.on('requestfinished', dec);
    page.on('requestfailed', dec);
    try {
        await expect
            .poll(() => (inflight === 0 && Date.now() - last >= quietMs ? 'quiet' : 'busy'), {
                timeout,
                intervals: [150, 200, 300],
            })
            .toBe('quiet');
    } catch {
        // fall through — a busy page still gets a press attempt (with recovery)
    } finally {
        page.off('request', inc);
        page.off('requestfinished', dec);
        page.off('requestfailed', dec);
    }
}

/** Navigate, then wait for the panel's own API fetches to settle. */
async function gotoReady(page, navigate) {
    await navigate();
    await settleApi(page);
}

/**
 * Open the response window through an `opener` that makes it appear (finds the
 * card/menu trigger and presses it). A press before the panel's publication
 * fetch lands mounts the window BLANK for good (its overlay stacks but its
 * body/title never render, and it does not recover), so the recovery is a
 * reload — a fresh document clears the blank modal — after which the opener
 * re-finds the trigger and presses again once the data has caught up. Success
 * is the titled dialog. `gotoReady` narrows the race so the first press
 * usually wins. `reposition` runs after the recovery reload, for a window
 * on a past round (a reload lands on the latest round, so the round is
 * chosen again in the workflow menu before the press).
 */
async function openResponseWindow(page, opener, {editor = false, reposition = null} = {}) {
    const window = new AuthorResponseWindow(page, {editor});
    await settleApi(page);
    await opener();
    if (await window.modal().isVisible({timeout: 6_000}).catch(() => false)) {
        return window;
    }
    await expect(async () => {
        await gotoReady(page, () => page.reload());
        if (reposition) {
            await reposition();
            await settleApi(page);
        }
        await opener();
        await expect(window.modal()).toBeVisible({timeout: 8_000});
    }).toPass({intervals: [1_000, 2_500], timeout: 50_000});
    return window;
}

/** Open the editor "View" window on a row (recovers via reload + re-open). */
async function openEditorView(page, table, name, {reposition = null} = {}) {
    return openResponseWindow(
        page,
        async () => {
            await table.expectVisible();
            await table.openRowMenu(name);
            await table.menuItem('View').click({timeout: 8_000});
        },
        {editor: true, reposition}
    );
}

/** Open the author card's response window (recovers via reload + re-open). */
async function openCardWindow(page, card, which = 'submit', {reposition = null} = {}) {
    return openResponseWindow(
        page,
        async () => {
            const button = which === 'view' ? card.viewButton() : card.submitButton();
            await expect(button).toBeVisible({timeout: 30_000});
            await button.click({timeout: 8_000});
        },
        {reposition}
    );
}

/**
 * Submit a response as the signed-in author through the card's window.
 */
async function authorSubmitResponse(page, card, {text, onBehalfOf, reposition = null}) {
    const window = await openCardWindow(page, card, 'submit', {reposition});
    await expect(window.submitButton()).toBeDisabled();
    await window.body().click();
    await window.body().pressSequentially(text);
    await window.authorCheckbox(onBehalfOf).check();
    await expect(window.submitButton()).toBeEnabled();
    await window.submitButton().click();
    await window.expectClosed();
}

/** Open the workflow "Activity Log & Notes" modal and wait for its grid. */
async function openActivityLog(page) {
    await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
    const dialog = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
    await expect(dialog.getByText('Event', {exact: true})).toBeVisible({timeout: 30_000});
    return dialog;
}

test.describe('author response to reviews', () => {
    test('S1: from "Awaiting reviews" to a sent request', {tag: '@smoke'}, async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const notReady = await seedReviewedRound(ojsApi, tag + 'a', {
            title: `Submission ${tag} A`,
            reviewers: [{username: 'reviewer.julia', status: 'accepted'}],
        });
        const ready = await seedReviewedRound(ojsApi, tag + 'b', {
            title: `Submission ${tag} B`,
            reviewers: [
                {
                    username: 'reviewer.julia',
                    status: 'completed',
                    recommendation: 'pendingRevisions',
                    comments: 'The method needs a control group.',
                },
                {username: 'reviewer.paul', status: 'declined'},
            ],
        });

        const page = await (await asUser('editor.diana')).newPage();
        const workflow = new WorkflowPage(page, JOURNAL);
        const table = new AuthorResponseTable(page);
        const requestPage = new RequestAuthorResponsePage(page, JOURNAL);

        // The not-ready submission: one row, the Author, "Awaiting reviews",
        // "Request Response" greyed.
        await workflow.gotoEditorial(notReady.submissionId);
        await table.expectVisible();
        await expect(table.rows()).toHaveCount(1);
        await table.expectStatus(ALEX, STATUS.awaiting);
        await expect(table.requestResponseButton()).toBeDisabled();

        // The ready submission: "Ready to invite author", the button enabled,
        // although the second Reviewer's request was declined (the declined
        // row is the positive control that the request exists on the round).
        await workflow.gotoEditorial(ready.submissionId);
        await table.expectVisible();
        await expect(
            workflow.panel('Reviewers').getByRole('row').filter({hasText: 'Paul Reviewer'})
        ).toContainText('Request Declined');
        await table.expectStatus(ALEX, STATUS.ready);
        await expect(table.requestResponseButton()).toBeEnabled();

        // The request page: the Author the one fixed recipient, the template
        // subject, and the reviewer block already in the message.
        await table.requestResponseButton().click();
        await requestPage.expectLoaded();
        await expect(requestPage.recipientsDisabled()).toContainText(ALEX);
        await expect(requestPage.subject()).toHaveValue(REQUEST_SUBJECT);
        const message = requestPage.messageBody();
        await expect(message).toContainText('Submit Author Response');
        await expect(message).toContainText('The following comments were received from reviewers.');
        await expect(message).toContainText('Reviewer 1:');
        await expect(message).toContainText('Recommendation: Revisions Required');
        await expect(message).toContainText('The method needs a control group.');
        // The declined request contributes no block to the message.
        await expect(message).not.toContainText('Reviewer 2:');

        // "Cancel" returns to the round, nothing sent; then send for real.
        await requestPage.cancelButton().click();
        await expect(table.table()).toBeVisible({timeout: 30_000});
        await sendRequestViaUi(page, table, requestPage);

        // The email to the Author, and exactly one of it (Cancel sent none).
        const authorMail = `author.alex@mail.test`;
        const sent = await pkpMail.find({to: authorMail, contains: `${tag} B`, subject: REQUEST_SUBJECT});
        expect(await pkpMail.count({to: authorMail, contains: `${tag} B`, subject: REQUEST_SUBJECT})).toBe(1);
        const html = (await pkpMail.fullMessage(sent.ID)).HTML;
        expect(html).toContain('All peer reviews for your submission');
        expect(html).toContain(`Submission ${tag} B`);
        expect(html).toContain('Reviewer 1:');
        expect(html).toContain('Revisions Required');
        expect(html).toContain('The method needs a control group.');
        expect(html).toContain('Kind regards');
        expect(linkByText(html, 'Submit Author Response')).not.toBeNull();
        // The declined request contributes nothing: one reviewer block (the
        // "Reviewer 1:" read above is the control), none for the declined one.
        expect(html).not.toContain('Reviewer 2:');
        expect(html).not.toContain('Paul Reviewer');

        // The Author's view: the card offers a response, the "Notifications"
        // list holds the request. Control: the not-ready submission shows no
        // card at all.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorWorkflow = new WorkflowPage(authorPage, JOURNAL);
        const card = new AuthorResponseCard(authorPage);
        await authorWorkflow.gotoAuthor(ready.submissionId);
        await card.expectVisible();
        await card.expectStatus(/Respond to Reviews/i);
        await expect(card.submitButton()).toBeVisible();
        await expect(
            authorPage.getByRole('listitem').filter({hasText: REQUEST_EMAIL_ROW}).first()
        ).toBeVisible({timeout: 30_000});

        await authorWorkflow.gotoAuthor(notReady.submissionId);
        await card.expectAbsent();
    });

    test('S2: the author responds from the email', {tag: '@smoke'}, async ({browser, baseURL, asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId, title} = await seedReviewedRound(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'completed'}],
        });

        // The editor sends the request.
        const editorPage = await (await asUser('editor.diana')).newPage();
        const editorWorkflow = new WorkflowPage(editorPage, JOURNAL);
        const table = new AuthorResponseTable(editorPage);
        const requestPage = new RequestAuthorResponsePage(editorPage, JOURNAL);
        await editorWorkflow.gotoEditorial(submissionId);
        await table.expectVisible();
        await sendRequestViaUi(editorPage, table, requestPage);

        // The email's "Submit Author Response" button, opened signed out.
        const authorMail = `author.alex@mail.test`;
        const sent = await pkpMail.find({to: authorMail, contains: title, subject: REQUEST_SUBJECT});
        const link = linkByText((await pkpMail.fullMessage(sent.ID)).HTML, 'Submit Author Response');
        expect(link).not.toBeNull();

        const context = await anonymousContext(browser, baseURL);
        const page = await context.newPage();
        try {
            // Login first, then the response window opens on its own.
            await page.goto(link);
            await page.waitForURL(/\/login/, {waitUntil: 'commit'});
            const login = new LoginPage(page);
            await login.signIn('author.alex', getPassword('author.alex'));
            const window = new AuthorResponseWindow(page);
            await window.expectOpen();
            await expect(window.intro()).toContainText('All reviews for your submission have been completed.');

            // Cancel closes it; a reload does not reopen it; the card offers it.
            const card = new AuthorResponseCard(page);
            await window.cancel();
            await gotoReady(page, () => page.reload());
            await window.expectClosed();
            await card.expectVisible();
            await card.expectStatus(/Respond to Reviews/i);

            // Submit a response: greyed until both a body and an author box.
            const submitWindow = await openCardWindow(page, card, 'submit');
            await expect(submitWindow.submitButton()).toBeDisabled();
            await submitWindow.body().click();
            await submitWindow.body().pressSequentially('We added a control group.');
            await expect(submitWindow.submitButton()).toBeDisabled();
            await submitWindow.authorCheckbox(ALEX).check();
            await expect(submitWindow.submitButton()).toBeEnabled();
            await submitWindow.submitButton().click();
            await submitWindow.expectClosed();
            await card.expectStatus(STATUS.submittedBy(ALEX));
            await expect(card.viewButton()).toBeVisible();

            // Re-read: the author view is read-only; edits never enable submit.
            const viewWindow = await openCardWindow(page, card, 'view');
            await expect(viewWindow.intro()).toContainText(
                'This response cannot be edited by authors.'
            );
            await viewWindow.body().click();
            await viewWindow.body().pressSequentially(' More.');
            await viewWindow.authorCheckbox(ALEX).uncheck();
            await expect(viewWindow.submitButton()).toBeDisabled();
            await viewWindow.cancel();
        } finally {
            await context.close();
        }

        // The editor sees the response and gains the row menu; and is not told.
        await editorWorkflow.gotoEditorial(submissionId);
        await table.expectVisible();
        await table.expectStatus(ALEX, STATUS.submittedBy(ALEX));
        await expect(table.moreActions(ALEX)).toBeVisible();

        // Control: the response landed (the row flipped above), but told the
        // editor nothing — no task and no email carrying this submission.
        // editor.diana is a shared account, so the task absence is scoped by
        // this submission's unique title (a global "No Items" would race other
        // suites), bounded by the grid's own load.
        await editorPage.getByRole('button', {name: /^Tasks/}).first().click();
        const tasksDialog = editorPage
            .getByRole('dialog')
            .filter({has: editorPage.getByRole('heading', {name: 'Tasks', exact: true})});
        await expect(tasksDialog).toBeVisible({timeout: 30_000});
        await waitForJQueryIdle(editorPage);
        await expect(tasksDialog).not.toContainText(title);
        await pkpMail.expectNone({
            to: `editor.diana@mail.test`,
            contains: title,
            afterControl: {to: authorMail, contains: title, subject: REQUEST_SUBJECT},
        });
    });

    test('S3: the editor edits, deletes, and the author answers again', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId, title} = await seedReviewedRound(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'completed'}],
        });

        // Reach scenario 2's state: request sent, one author response.
        const editorPage = await (await asUser('editor.diana')).newPage();
        const editorWorkflow = new WorkflowPage(editorPage, JOURNAL);
        const editorTable = new AuthorResponseTable(editorPage);
        const requestPage = new RequestAuthorResponsePage(editorPage, JOURNAL);
        await editorWorkflow.gotoEditorial(submissionId);
        await editorTable.expectVisible();
        await sendRequestViaUi(editorPage, editorTable, requestPage);

        const authorPage = await (await asUser('author.alex')).newPage();
        const authorWorkflow = new WorkflowPage(authorPage, JOURNAL);
        const authorCard = new AuthorResponseCard(authorPage);
        await gotoReady(authorPage, () => authorWorkflow.gotoAuthor(submissionId));
        await authorCard.expectVisible();
        await authorSubmitResponse(authorPage, authorCard, {
            text: 'We added a control group.',
            onBehalfOf: ALEX,
        });

        // The Journal Manager edits the response.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerWorkflow = new WorkflowPage(managerPage, JOURNAL);
        const table = new AuthorResponseTable(managerPage);
        await gotoReady(managerPage, () => managerWorkflow.gotoEditorial(submissionId));
        await table.expectVisible();
        await table.expectStatus(ALEX, STATUS.submittedBy(ALEX));
        const editorView = await openEditorView(managerPage, table, ALEX);
        await expect(editorView.intro()).toContainText(
            `The following response was submitted by the author, ${ALEX}.`
        );
        await editorView.authorCheckbox(ALEX).uncheck();
        await expect(editorView.submitButton()).toBeDisabled();
        await editorView.authorCheckbox(ALEX).check();
        await editorView.fillBody('We added a control group and a power analysis.');
        await expect(editorView.submitButton()).toBeEnabled();
        await editorView.submitButton().click();
        await editorView.expectClosed();

        // The author reads the edited version; the card still names them.
        await gotoReady(authorPage, () => authorWorkflow.gotoAuthor(submissionId));
        const authorView = await openCardWindow(authorPage, authorCard, 'view');
        await expect(authorView.body()).toContainText('We added a control group and a power analysis.');
        await authorView.cancel();
        await authorCard.expectStatus(STATUS.submittedBy(ALEX));

        // "Delete" › "Cancel" keeps the response (control), then "Delete" ›
        // "OK" removes it and the table catches up.
        await table.deleteResponse(ALEX, {confirm: false});
        await table.expectStatus(ALEX, STATUS.submittedBy(ALEX));
        await expect(table.moreActions(ALEX)).toBeVisible();
        await table.deleteResponse(ALEX, {confirm: true});
        await table.expectStatus(ALEX, STATUS.ready);
        await expect(table.moreActions(ALEX)).toHaveCount(0);
        await expect(table.requestResponseButton()).toBeEnabled();

        // The author may answer again with no new request.
        await gotoReady(authorPage, () => authorWorkflow.gotoAuthor(submissionId));
        await authorCard.expectStatus(/Respond to Reviews/i);
        await expect(authorCard.submitButton()).toBeVisible();
        await authorSubmitResponse(authorPage, authorCard, {
            text: 'We have reworked the analysis.',
            onBehalfOf: ALEX,
        });
        await authorCard.expectStatus(STATUS.submittedBy(ALEX));

        // Exactly one request email; the "Notifications" list unchanged.
        expect(await pkpMail.count({to: 'author.alex@mail.test', contains: title, subject: REQUEST_SUBJECT})).toBe(1);

        // The editor sees the second response; the activity log holds the
        // request email row and none for the response's edit/delete.
        await managerWorkflow.gotoEditorial(submissionId);
        await table.expectStatus(ALEX, STATUS.submittedBy(ALEX));
        await expect(table.moreActions(ALEX)).toBeVisible();
        const log = await openActivityLog(managerPage);
        await expect(
            log.getByRole('row').filter({hasText: REQUEST_EMAIL_ROW}).first()
        ).toBeVisible({timeout: 30_000});
        await expect(log.getByRole('row').filter({hasText: 'reworked the analysis'})).toHaveCount(0);
    });

    test('S4: revisions requested — the card without a request, and the co-author responds', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId, title} = await seedReviewedRound(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'completed'}],
            participants: [{username: 'author.bea', role: 'author'}],
        });

        // The Journal Manager records "Request Revisions" through the wizard,
        // whose "Notify Authors" step sends the decision email (a seeded
        // decision sends none). No request is sent.
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerWorkflow = new WorkflowPage(managerPage, JOURNAL);
        await managerWorkflow.gotoEditorial(submissionId);
        await requestRevisionsViaWizard(managerPage, JOURNAL);
        await managerWorkflow.expectStatus('Revisions have been requested.', 'Round 1 Status');

        // The decision email's button: the Author lands on My Submissions,
        // the review stage on the round, the response window already open;
        // "Cancel" closes it and leaves the card offering a response.
        const alexMail = 'author.alex@mail.test';
        const decisionMail = await pkpMail.find({to: alexMail, contains: title, subject: DECISION_SUBJECT});
        const decisionLink = linkByText((await pkpMail.fullMessage(decisionMail.ID)).HTML, 'Submit Author Response');
        expect(decisionLink).not.toBeNull();
        const alexPage = await (await asUser('author.alex')).newPage();
        const alexWorkflow = new WorkflowPage(alexPage, JOURNAL);
        const alexCard = new AuthorResponseCard(alexPage);
        await alexPage.goto(decisionLink);
        await expect(alexPage).toHaveURL(/dashboard\/mySubmissions\?/);
        const alexWindow = new AuthorResponseWindow(alexPage);
        await alexWindow.expectOpen();
        await alexWindow.cancel();
        await expect(alexPage).toHaveURL(new RegExp(`workflowSubmissionId=${submissionId}`));
        await alexWorkflow.expectHeading(ROUND_1_HEADING);
        await alexCard.expectVisible();
        await alexCard.expectStatus(/Respond to Reviews/i);
        await expect(alexCard.submitButton()).toBeVisible();

        // The co-author opens the round: revisions requested, the card shows.
        const beaPage = await (await asUser('author.bea')).newPage();
        const beaWorkflow = new WorkflowPage(beaPage, JOURNAL);
        const beaCard = new AuthorResponseCard(beaPage);
        await gotoReady(beaPage, () => beaWorkflow.gotoAuthor(submissionId));
        await beaWorkflow.expectStatus('Revisions have been requested.', 'Round 1 Status');
        await beaCard.expectVisible();
        await beaCard.expectStatus(/Respond to Reviews/i);

        // The only "Authors" box is the submitting author's; the co-author
        // (a stage assignment, not a contributor) has none.
        const window = await openCardWindow(beaPage, beaCard, 'submit');
        await expect(window.authorCheckbox(ALEX)).toBeVisible();
        await expect(window.authorCheckbox(BEA)).toHaveCount(0);
        await window.body().click();
        await window.body().pressSequentially('We will add the control group.');
        await window.authorCheckbox(ALEX).check();
        await expect(window.submitButton()).toBeEnabled();
        await window.submitButton().click();
        await window.expectClosed();
        await beaCard.expectStatus(STATUS.submittedBy(BEA));

        // The submitting author sees the response read-only.
        await alexWorkflow.gotoAuthor(submissionId);
        await alexCard.expectStatus(STATUS.submittedBy(BEA));
        await expect(alexCard.viewButton()).toBeVisible();
        await expect(alexCard.submitButton()).toHaveCount(0);

        // The editor's table: two rows, both naming the co-author; the row
        // menu acts only on the co-author's row.
        const table = new AuthorResponseTable(managerPage);
        await gotoReady(managerPage, () => managerWorkflow.gotoEditorial(submissionId));
        await table.expectVisible();
        await expect(table.rows()).toHaveCount(2);
        await table.expectStatus(ALEX, STATUS.submittedBy(BEA));
        await table.expectStatus(BEA, STATUS.submittedBy(BEA));

        // Control: on the Author's (non-submitter) row the actions are greyed.
        await table.openRowMenu(ALEX);
        await expect(table.menuItem('View')).toBeDisabled();
        await expect(table.menuItem('Delete')).toBeDisabled();
        await managerPage.keyboard.press('Escape');

        // The co-author's row: its actions are enabled and "View" opens the
        // window naming the co-author.
        await table.openRowMenu(BEA);
        await expect(table.menuItem('View')).toBeEnabled();
        await expect(table.menuItem('Delete')).toBeEnabled();
        await managerPage.keyboard.press('Escape');
        const editorView = await openEditorView(managerPage, table, BEA);
        await expect(editorView.intro()).toContainText(
            `The following response was submitted by the author, ${BEA}.`
        );
    });

    test('S5: one confirmed review is enough when the minimum says so', async ({asUser, browser, baseURL, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const mgr = `${tag}mgr`;
        const rev1 = `${tag}r1`;
        const rev2 = `${tag}r2`;
        const authorName = `${tag}au`;
        await ojsApi.createContext({
            tag,
            review: {numReviewsPerSubmission: 1, defaultReviewMode: 'open'},
            users: [
                {username: mgr, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
                {username: rev1, roles: ['externalReviewer'], givenName: 'Rae', familyName: 'Uno'},
                {username: rev2, roles: ['externalReviewer'], givenName: 'Rob', familyName: 'Dos'},
                {username: authorName, roles: ['author'], givenName: 'Ada', familyName: 'Writer'},
            ],
        });
        const {submissionId} = await seedReviewedRound(ojsApi, tag, {
            context: tag,
            submitter: authorName,
            title: `Submission ${tag}`,
            reviewers: [
                {
                    username: rev1,
                    status: 'completed',
                    recommendation: 'pendingRevisions',
                    comments: 'Shorten the introduction.',
                },
                {username: rev2, status: 'accepted'},
            ],
        });

        // The throwaway manager opens the round through its own login.
        const context = await anonymousContext(browser, baseURL);
        const page = await context.newPage();
        try {
            const login = new LoginPage(page);
            await page.goto(login.contextUrl(tag, '/login'));
            await login.signIn(mgr, getPassword(mgr));
            const workflow = new WorkflowPage(page, tag);
            const table = new AuthorResponseTable(page);
            const requestPage = new RequestAuthorResponsePage(page, tag);
            await workflow.gotoEditorial(submissionId);
            await table.expectVisible();

            // Not ready while the review is only submitted, not confirmed.
            await table.expectStatus('Ada Writer', STATUS.awaiting);
            await expect(table.requestResponseButton()).toBeDisabled();

            // The editor marks the one review complete: the round is now ready
            // while the second review is still due.
            const reviewerRow = workflow.panel('Reviewers').getByRole('row').filter({hasText: 'Rae Uno'});
            const readModal = await openReviewDetails(page, reviewerRow);
            await markReviewComplete(page, readModal);
            await closeReviewDetails(page, readModal);
            await workflow.gotoEditorial(submissionId);
            await table.expectStatus('Ada Writer', STATUS.ready);
            await expect(table.requestResponseButton()).toBeEnabled();

            // Send the request and read the email: one reviewer block only.
            await sendRequestViaUi(page, table, requestPage);
            const authorMail = `${authorName}@mail.test`;
            const sent = await pkpMail.find({to: authorMail, contains: `Submission ${tag}`, subject: REQUEST_SUBJECT});
            const html = (await pkpMail.fullMessage(sent.ID)).HTML;
            expect(html).toContain('All peer reviews for your submission');
            expect(html).toContain('Revisions Required');
            expect(html).toContain('Shorten the introduction.');
            // The open review's heading: the first Reviewer's name alone in
            // place of "Reviewer 1:", the review having been conducted openly.
            expect(html).toContain('Rae Uno');
            expect(html).not.toContain('Reviewer 1:');
            // Control: no second reviewer block, by name or by number (the
            // review still due is silent).
            expect(html).not.toContain('Rob Dos');
            expect(html).not.toContain('Reviewer 2:');
        } finally {
            await context.close();
        }
    });

    test('S6: who may request', async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId, reviewRoundId, title} = await seedReviewedRound(ojsApi, tag, {
            reviewers: [{username: 'reviewer.julia', status: 'completed'}],
            participants: [
                {username: 'sectioneditor.ana', role: 'sectionEditor'},
                {username: 'assistant.rita', role: 'funding'},
                {username: 'author.bea', role: 'author'},
            ],
        });
        const DENIED = 'The current role does not have access to this operation.';

        // The assigned Section Editor: the table is ready and the button opens
        // the request page, its address holding the round id.
        const anaPage = await (await asUser('sectioneditor.ana')).newPage();
        const anaWorkflow = new WorkflowPage(anaPage, JOURNAL);
        const anaTable = new AuthorResponseTable(anaPage);
        const anaRequest = new RequestAuthorResponsePage(anaPage, JOURNAL);
        await anaWorkflow.gotoEditorial(submissionId);
        await anaTable.expectVisible();
        await anaTable.expectStatus(ALEX, STATUS.ready);
        await expect(anaTable.requestResponseButton()).toBeEnabled();
        await anaTable.requestResponseButton().click();
        await expect(anaRequest.heading()).toBeVisible({timeout: 30_000});
        await expect(anaPage).toHaveURL(new RegExp(`reviewRoundId=${reviewRoundId}(&|$)`));
        await anaRequest.cancelButton().click();
        await expect(anaTable.table()).toBeVisible({timeout: 30_000});

        // The request to both assigned authors: two rows, both ready; "To"
        // holds two chips and no box to add anyone; the one email lands in
        // both mailboxes with a greeting naming both, in either order.
        await expect(anaTable.rows()).toHaveCount(2);
        await anaTable.expectStatus(ALEX, STATUS.ready);
        await anaTable.expectStatus(BEA, STATUS.ready);
        await anaTable.requestResponseButton().click();
        await anaRequest.expectLoaded();
        await expect(anaRequest.recipientsDisabled()).toContainText(ALEX);
        await expect(anaRequest.recipientsDisabled()).toContainText(BEA);
        await expect(anaRequest.recipientChips()).toHaveCount(2);
        await expect(anaRequest.recipientAddBox()).toHaveCount(0);
        await anaRequest.submit();
        await anaRequest.viewSubmissionSummaryLink().click();
        await expect(anaTable.table()).toBeVisible({timeout: 30_000});
        const alexMail = 'author.alex@mail.test';
        const beaMail = 'author.bea@mail.test';
        const toAlex = await pkpMail.find({to: alexMail, contains: title, subject: REQUEST_SUBJECT});
        const toBea = await pkpMail.find({to: beaMail, contains: title, subject: REQUEST_SUBJECT});
        expect(toBea.ID).toBe(toAlex.ID);
        const requestHtml = (await pkpMail.fullMessage(toAlex.ID)).HTML;
        expect(requestHtml).toMatch(greetingNaming(ALEX, BEA));
        expect(await pkpMail.count({to: alexMail, contains: title, subject: REQUEST_SUBJECT})).toBe(1);
        expect(await pkpMail.count({to: beaMail, contains: title, subject: REQUEST_SUBJECT})).toBe(1);

        // The Funding Coordinator is offered the button, but it leads to the
        // access-denied page (A3 — the offer is not asserted).
        const ritaPage = await (await asUser('assistant.rita')).newPage();
        const ritaWorkflow = new WorkflowPage(ritaPage, JOURNAL);
        const ritaTable = new AuthorResponseTable(ritaPage);
        await ritaWorkflow.gotoEditorial(submissionId);
        await ritaTable.expectVisible();
        await ritaTable.requestResponseButton().click();
        await ritaPage.waitForURL(/authorizationDenied/, {waitUntil: 'commit'});
        await expect(ritaPage.locator('body')).toContainText(DENIED);

        // The Author by the typed address: the access-denied page.
        const alexPage = await (await asUser('author.alex')).newPage();
        const alexRequest = new RequestAuthorResponsePage(alexPage, JOURNAL);
        await alexRequest.goto(submissionId, reviewRoundId);
        await expect(alexPage.locator('body')).toContainText(DENIED);
        expect(alexPage.url()).toContain('authorizationDenied');

        // The Journal Manager by a wrong round: "Invalid review round.".
        const managerPage = await (await asUser('manager.maya')).newPage();
        const managerRequest = new RequestAuthorResponsePage(managerPage, JOURNAL);
        await managerRequest.goto(submissionId, 99999);
        await expect(managerPage.locator('body')).toContainText('Invalid review round.');

        // Control: the Journal Manager by the real round gets the page.
        await managerRequest.goto(submissionId, reviewRoundId);
        await expect(managerRequest.heading()).toBeVisible({timeout: 30_000});
    });

    test("S8: a past round's response beside an empty new round", async ({asUser, ojsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        // The decision seeds the first entry into round 1; the entry left over
        // builds round 2 (footnote s), so round 1 is past and round 2 current.
        const {submissionId, reviewRoundIds, title} = await seedReviewedRound(ojsApi, tag, {
            reviewRounds: [
                {reviewers: [{username: 'reviewer.julia', status: 'completed'}]},
                {reviewers: [{username: 'reviewer.paul', status: 'accepted'}]},
            ],
        });
        expect(reviewRoundIds).toHaveLength(2);

        const editorPage = await (await asUser('editor.diana')).newPage();
        const editorWorkflow = new WorkflowPage(editorPage, JOURNAL);
        const table = new AuthorResponseTable(editorPage);
        const requestPage = new RequestAuthorResponsePage(editorPage, JOURNAL);

        // The new round: "Awaiting reviews", "Request Response" greyed.
        await editorWorkflow.gotoEditorial(submissionId);
        await editorWorkflow.selectRound(2);
        await table.expectVisible();
        await table.expectStatus(ALEX, STATUS.awaiting);
        await expect(table.requestResponseButton()).toBeDisabled();

        // The past round's request: ready, enabled, and the sent dialog's
        // "View Submission Summary" returns to round 1.
        await editorWorkflow.selectRound(1);
        await table.expectStatus(ALEX, STATUS.ready);
        await expect(table.requestResponseButton()).toBeEnabled();
        await sendRequestViaUi(editorPage, table, requestPage);
        await editorWorkflow.expectHeading(ROUND_1_HEADING);
        const alexMail = 'author.alex@mail.test';
        await pkpMail.find({to: alexMail, contains: title, subject: REQUEST_SUBJECT});

        // The author's past round: the advanced-to-next-round sentence, the
        // card offering a response, and the response written on round 1.
        const authorPage = await (await asUser('author.alex')).newPage();
        const authorWorkflow = new WorkflowPage(authorPage, JOURNAL);
        const card = new AuthorResponseCard(authorPage);
        const toRound1 = () => authorWorkflow.selectRound(1);
        await gotoReady(authorPage, async () => {
            await authorWorkflow.gotoAuthor(submissionId);
            await toRound1();
        });
        await authorWorkflow.expectStatus(ADVANCED_SENTENCE, 'Status');
        await card.expectVisible();
        await card.expectStatus(/Respond to Reviews/i);
        await expect(card.submitButton()).toBeVisible();
        await authorSubmitResponse(authorPage, card, {
            text: "We answered the first round's reviews.",
            onBehalfOf: ALEX,
            reposition: toRound1,
        });
        await card.expectStatus(STATUS.submittedBy(ALEX));

        // The editor's two rounds: round 1 holds the response and its "View"
        // window; round 2 still reads "Awaiting reviews" with no "…" and the
        // button greyed.
        await gotoReady(editorPage, async () => {
            await editorWorkflow.gotoEditorial(submissionId);
            await editorWorkflow.selectRound(1);
        });
        await table.expectStatus(ALEX, STATUS.submittedBy(ALEX));
        const editorView = await openEditorView(editorPage, table, ALEX, {
            reposition: () => editorWorkflow.selectRound(1),
        });
        await expect(editorView.body()).toContainText("We answered the first round's reviews.");
        await editorView.cancel();
        await editorWorkflow.selectRound(2);
        await table.expectStatus(ALEX, STATUS.awaiting);
        await expect(table.moreActions(ALEX)).toHaveCount(0);
        await expect(table.requestResponseButton()).toBeDisabled();

        // Control: the author's round 2 ends with no card; the request and
        // the response belong to round 1 alone (the round's own status box
        // is the positive control that the stage rendered).
        await authorWorkflow.selectRound(2);
        await expect(authorWorkflow.statusBox('Round 2 Status')).toBeVisible({timeout: 30_000});
        await card.expectAbsent();
    });
});
