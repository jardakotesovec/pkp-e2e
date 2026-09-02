// @ts-check
/**
 * @file playwright/tests/U24-workflow-screen-and-stage-access.spec.js
 *
 * Workflow screen & stage access — OJS suite, one test per canonical
 * scenario the spec runs on OJS (common scenarios 1–8; scenario 9 is
 * OMP-only, 10 OPS-only).
 * Spec: docs/specs/U24-workflow-screen-and-stage-access.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - A1 ❓: whether a stage-naming address should carry its stage into the
 *   panel is open — S6 drives only the plain `workflow/access` address and
 *   asserts the forward, not the landing entry's relation to any stage.
 * - A2 ❓: the empty "Publication" heading an off-stage assistant sees is
 *   open — S3 asserts only what Rule 9 states as built (heading present, no
 *   node, pressing it changes nothing), never that this is right.
 * - A3 ❓ / A5 🐞: the incomplete-submission doors and the blank page of a
 *   malformed stage address are not scenario'd; nothing here types a
 *   stage-numbered address.
 * - A4 ❓: the reviewing manager's empty shell needs a throwaway user in
 *   both roles on a scratch journal; not a canonical scenario.
 * - A6 ❓: the "Review" stage entry's own status sentence is open — S2
 *   selects the round entry and the other stages, never the "Review" entry
 *   itself.
 * - A7 ❓: the status of stages skipped by a direct publish is open — S8's
 *   seed passed through Production, so every stage it reads has an
 *   undisputed sentence.
 * - A8 ❓: the role-less Site Administrator cannot be arranged on the test
 *   install (the seeded `admin` is a Journal Manager everywhere).
 * - Rule 3's error shell (refused or deleted submission by address) and
 *   Rule 19's Delete dialog are exercised by the Submission stage suite
 *   (U25 S4/S6); this suite asserts the frame's Return dialogs (S8) only.
 * - "Neither dialog sends email" (Side effects): a mail-silence claim with
 *   no natural in-test positive control; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster are
 * read-only (A1, A7). Every test seeds its own submission with a unique tag
 * (M5) and drives one or more roster accounts through `asUser`. Assignments
 * (S3 Copyeditor, S4 Funding Coordinator, S8 Layout Editor) are seeded as
 * `participants[]`, the row the Assign Participant form writes. No mail
 * assertions, so no Mailpit use. Waits are web-first (A5). Everything runs
 * in the parallel `ojs` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage, NO_ACCESS_TEXT} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');

const JOURNAL = 'publicknowledge';

/** OJS stage entries in workflow order (Rule 7). */
const OJS_STAGES = ['Submission', 'Review', 'Copyediting', 'Production'];

/** The editorial roster's production-only pages (Rule 10). */
const PRODUCTION_PAGES = ['Body Text', 'Galleys', 'Media', 'Permissions & Disclosure', 'Publication Settings'];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u24${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** One review round with the default reviewer accepted (scenario footnote s). */
const ONE_ROUND = [{reviewers: [{username: 'reviewer.julia', status: 'accepted'}]}];

async function seed(ojsApi, tag, extra = {}) {
    return await ojsApi.createSubmission({
        tag,
        context: JOURNAL,
        submitter: 'author.alex',
        title: `Submission ${tag}`,
        ...extra,
    });
}

/** A submission in Review Round 1 (scenarios 2–4). */
function inReview(extra = {}) {
    return {decisions: ['sendExternalReview'], reviewRounds: ONE_ROUND, ...extra};
}

/** A page as a given roster user, plus the workflow page object for it. */
async function workflowAs(asUser, appContext, username) {
    const page = await (await asUser(username)).newPage();
    return {page, workflow: new WorkflowPage(page, JOURNAL, {appContext})};
}

test.describe('workflow screen & stage access', () => {
    test('S1 — open a submission\'s workflow from the editorial dashboard', {tag: '@smoke'}, async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await seed(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'editor.diana');
        const dash = new EditorialDashboardPage(page, JOURNAL);
        await dash.goto();
        const row = await dash.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header (Rule 4): number, underlined contributors, full title,
        // the stage bubble (Rule 5).
        await expect(workflow.contributorsLine()).toBeVisible();
        await expect(workflow.contributorsLine()).not.toHaveText('');
        await expect(workflow.titleLine()).toHaveText(`Submission ${tag}`);
        await workflow.expectStage('Submission');

        // The side menu (Rules 7, 9): the Workflow group with the four
        // stages in order, the first striped; the Publication group with one
        // version node whose pages start Title & Abstract, Contributors,
        // Metadata.
        await expect(workflow.workflowGroup()).toBeVisible();
        expect(await workflow.stageLabels()).toEqual(OJS_STAGES);
        expect(await workflow.stripedLabels()).toEqual(['Submission']);
        await expect(workflow.publicationGroup()).toBeVisible();
        await expect(workflow.versionNodes()).toHaveCount(1);
        expect((await workflow.pagesUnderLatestVersion()).slice(0, 3)).toEqual([
            'Title & Abstract',
            'Contributors',
            'Metadata',
        ]);

        // The main column is headed "Workflow: Submission" (Rule 11) and the
        // address records the open submission (Rule 12).
        await workflow.expectStageHeading('Submission');
        expect(workflow.submissionIdFromUrl()).toBe(String(submissionId));

        // Close: the list is back and the address forgets the panel (Rule 1).
        await workflow.close();
        await expect(dash.row(tag)).toBeVisible({timeout: 30_000});
        expect(workflow.submissionIdFromUrl()).toBeNull();
    });

    test('S2 — walk the stages of a submission in review', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await seed(ojsApi, tag, inReview());

        const {workflow} = await workflowAs(asUser, appContext, 'editor.diana');
        await workflow.gotoEditorial(submissionId);

        // Lands on Review Round 1 (Rule 11), headed for the round, with the
        // round's status box (Rule 15c); the round and its stage are striped.
        await workflow.expectStageHeading('Review (Round 1)');
        await workflow.expectSelected('Review Round 1');
        await expect(workflow.statusBox('Round 1 Status')).toBeVisible();
        expect(await workflow.stripedLabels()).toEqual(['Review', 'Review Round 1']);

        // Submission: a stage the submission moved beyond (Rule 15b), with
        // its panels below the box.
        await workflow.selectStage('Submission');
        await workflow.expectStatus('The submission is currently in the Review stage.');
        await expect(workflow.panel('Submission Files')).toBeVisible();

        // Copyediting: not yet reached (Rules 15a, 16) — no panels, only the
        // Participants list on the right.
        await workflow.selectStage('Copyediting');
        await workflow.expectStatus('The Copyediting stage has not yet been initiated.');
        await expect(workflow.participantsHeading()).toBeVisible();
        await expect(workflow.panelTables()).toHaveCount(0);

        // Production: the same box naming Production, plus the stage's
        // "Schedule For Publication" button and the Participants list.
        await workflow.selectStage('Production');
        await workflow.expectStatus('The Production stage has not yet been initiated.');
        await expect(workflow.actionButton('Schedule For Publication')).toBeVisible();
        await expect(workflow.participantsHeading()).toBeVisible();
        await expect(workflow.panelTables()).toHaveCount(0);
    });

    test('S3 — a stage outside the role\'s stage set', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await seed(
            ojsApi,
            tag,
            inReview({participants: [{username: 'copyeditor.carla', role: 'copyeditor'}]})
        );

        // Control first: the Editor sees the round's panels and a version
        // node with pages (the positive control for every absence below, M4).
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await editor.workflow.expectStageHeading('Review (Round 1)');
        await expect(editor.workflow.panel('Reviewers')).toBeVisible();
        await expect(editor.workflow.versionNodes()).toHaveCount(1);
        await expect(editor.workflow.pageLink('Title & Abstract')).toBeVisible();

        // The assigned Copyeditor lands on the round (Rule 11) and gets the
        // no-access box alone (Rule 13).
        const {page, workflow} = await workflowAs(asUser, appContext, 'copyeditor.carla');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectSelected('Review Round 1');
        await workflow.expectNoAccessOnly();

        // Submission: the same box.
        await workflow.select('Submission');
        await workflow.expectSelected('Submission');
        await workflow.expectNoAccessOnly();

        // Copyediting, the one stage in the Copyeditor's set: the language
        // line and the not-yet-reached box (Rules 14, 15a), a read-only
        // Participants list, no panels (Rule 16).
        await workflow.selectStage('Copyediting');
        await expect(workflow.languageLine()).toHaveText('Current Submission Language: English');
        await workflow.expectStatus('The Copyediting stage has not yet been initiated.');
        await expect(workflow.participantsHeading()).toBeVisible();
        await expect(workflow.participantsAssignButton()).toHaveCount(0);
        await expect(workflow.panelTables()).toHaveCount(0);

        // The Publication group: heading with no version node beneath, and
        // pressing the heading changes nothing (Rule 9).
        await expect(workflow.publicationGroup()).toBeVisible();
        await expect(workflow.versionNodes()).toHaveCount(0);
        const urlBefore = page.url();
        await workflow.publicationGroup().click();
        await workflow.expectStageHeading('Copyediting');
        await expect(workflow.versionNodes()).toHaveCount(0);
        expect(page.url()).toBe(urlBefore);
    });

    test('S4 — the production-only pages', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await seed(
            ojsApi,
            tag,
            inReview({participants: [{username: 'assistant.rita', role: 'funding'}]})
        );

        // The Funding Coordinator (stage set Submission + Review) reaches the
        // Publication group but not Production: the roster stops at JATS XML
        // (Rule 10).
        const funding = await workflowAs(asUser, appContext, 'assistant.rita');
        await funding.workflow.gotoEditorial(submissionId);
        await funding.workflow.expectStageHeading('Review (Round 1)');
        expect(await funding.workflow.pagesUnderLatestVersion()).toEqual([
            'Title & Abstract',
            'Contributors',
            'Metadata',
            'References',
            'Funding',
            'JATS XML',
        ]);
        await expect(funding.workflow.createNewVersionLink()).toHaveCount(0);

        // Control: the Journal Manager sees those pages and the five
        // production-only ones, then "Create New Version" after the node.
        const manager = await workflowAs(asUser, appContext, 'manager.maya');
        await manager.workflow.gotoEditorial(submissionId);
        expect(await manager.workflow.pagesUnderLatestVersion()).toEqual([
            'Title & Abstract',
            'Contributors',
            'Metadata',
            'References',
            'Funding',
            'JATS XML',
            ...PRODUCTION_PAGES,
        ]);
        await expect(manager.workflow.createNewVersionLink()).toBeVisible();
    });

    test('S5 — deep link and reload', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await seed(ojsApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'editor.diana');
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Contributors');

        // The address names the submission and the selected entry (Rule 12).
        await expect
            .poll(() => workflow.menuKeyFromUrl(), {timeout: 30_000})
            .toMatch(/^publication_\d+_contributors$/);
        const deepLink = page.url();

        // The same address in a new tab opens straight on the page.
        const tab = await page.context().newPage();
        const tabWorkflow = new WorkflowPage(tab, JOURNAL, {appContext});
        await tab.goto(deepLink);
        await tabWorkflow.expectOpen(submissionId);
        await tabWorkflow.expectPageHeading('Contributors');
        await tabWorkflow.expectSelected('Contributors');
        await tab.close();

        // Reload: the same.
        await page.reload();
        await workflow.expectOpen(submissionId);
        await workflow.expectPageHeading('Contributors');

        // Close: both parts leave the address and the list is back.
        await workflow.close();
        expect(workflow.submissionIdFromUrl()).toBeNull();
        expect(workflow.menuKeyFromUrl()).toBeNull();
        const dash = new EditorialDashboardPage(page, JOURNAL);
        await expect(dash.heading()).toBeVisible({timeout: 30_000});
    });

    test('S6 — typed addresses forward', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await seed(ojsApi, tag);
        const workflowAccessUrl = `/index.php/${JOURNAL}/workflow/access/${submissionId}`;
        const authorDashboardUrl = `/index.php/${JOURNAL}/authorDashboard/submission/${submissionId}`;

        // The Editor's `workflow/access` address forwards to the editorial
        // dashboard, "Assigned to me", with the panel open (Rule 2a).
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.page.goto(workflowAccessUrl);
        await editor.page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        await editor.workflow.expectOpen(submissionId);
        await editor.workflow.expectStageHeading('Submission');
        await expect
            .poll(() => new URL(editor.page.url()).searchParams.get('currentViewId'), {timeout: 30_000})
            .toBe('assigned-to-me');
        expect(editor.workflow.submissionIdFromUrl()).toBe(String(submissionId));

        // The Author's old author-dashboard address forwards to My
        // Submissions with the panel open (Rule 2b).
        const author = await workflowAs(asUser, appContext, 'author.alex');
        await author.page.goto(authorDashboardUrl);
        await author.page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        await author.workflow.expectOpen(submissionId);
        await author.workflow.expectStageHeading('Submission');

        // Controls: the Author on the editorial address is turned away …
        await author.page.goto(workflowAccessUrl);
        await expect(author.page.getByText(NO_ACCESS_TEXT)).toBeVisible({timeout: 30_000});
        await author.workflow.expectClosed();

        // … and the Editor on the author-dashboard address likewise.
        await editor.page.goto(authorDashboardUrl);
        await expect(
            editor.page.getByText('You do not currently have sufficient privileges to view the submission.')
        ).toBeVisible({timeout: 30_000});
        await editor.workflow.expectClosed();
    });

    test('S7 — the author\'s view', {tag: '@smoke'}, async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await seed(ojsApi, tag, {decisions: ['sendExternalReview', 'accept']});

        const {page, workflow} = await workflowAs(asUser, appContext, 'author.alex');
        const mySub = new MySubmissionsPage(page, JOURNAL);
        await mySub.goto();
        const row = await mySub.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header offers "Library" and nothing else (Rule 6).
        await expect(workflow.headerButton('Library')).toBeVisible();
        expect(await workflow.headerButtonLabels()).toEqual(['Library']);

        // The Workflow group lists every stage (Rule 7); the version node
        // lists the author's roster and nothing production-only (Rule 10);
        // no "Create New Version" (Rule 9).
        expect(await workflow.stageLabels()).toEqual(OJS_STAGES);
        expect(await workflow.pagesUnderLatestVersion()).toEqual([
            'Title & Abstract',
            'Contributors',
            'Metadata',
            'References',
            'Funding',
            'Galleys',
            'Media',
        ]);
        await expect(workflow.createNewVersionLink()).toHaveCount(0);

        // Control: the Editor on the same submission has "Activity Log" in
        // the header and "Permissions & Disclosure" in the list.
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await expect(editor.workflow.headerButton('Activity Log')).toBeVisible();
        await editor.workflow.expandLatestVersionNode();
        await expect(editor.workflow.pageLink('Permissions & Disclosure')).toBeVisible();
    });

    test('S8 — View, Done and the two return buttons', async ({asUser, ojsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await seed(ojsApi, tag, {
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            reviewRounds: ONE_ROUND,
            published: true,
            issue: {volume: 1, number: 2, year: 2014},
            participants: [{username: 'layouteditor.leo', role: 'layoutEditor'}],
        });

        // Resting in Done (Rule 18): bubble "Published", "View" and "Return
        // to Workflow", no striped stage, Production reads "Submission
        // published." (Rule 15d).
        const manager = await workflowAs(asUser, appContext, 'manager.maya');
        await manager.workflow.gotoEditorial(submissionId);
        await manager.workflow.expectStage('Published');
        await expect(manager.workflow.headerButton('View')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Workflow')).toBeVisible();
        expect(await manager.workflow.stripedLabels()).toEqual([]);
        await manager.workflow.selectStage('Production');
        await manager.workflow.expectStatus('Submission published.');

        // Control, same state: the assigned Layout Editor sees "View" but
        // neither return button.
        const layout = await workflowAs(asUser, appContext, 'layouteditor.leo');
        await layout.workflow.gotoEditorial(submissionId);
        await expect(layout.workflow.headerButton('View')).toBeVisible();
        await expect(layout.workflow.headerButton('Return to Workflow')).toHaveCount(0);
        await expect(layout.workflow.headerButton('Return to Done')).toHaveCount(0);

        // "Return to Workflow" (Rule 18a): back in Production, queued, with
        // the panels and no status box; "Preview" and "Return to Done".
        await manager.workflow.returnToWorkflow();
        await manager.workflow.expectStage('Production');
        await expect(manager.workflow.headerButton('Preview')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Done')).toBeVisible();
        await expect(manager.workflow.headerButton('View')).toHaveCount(0);
        await expect(manager.workflow.headerButton('Return to Workflow')).toHaveCount(0);
        await manager.workflow.expectStriped('Production');
        await manager.workflow.expectStageHeading('Production');
        await expect(manager.workflow.panelTables().first()).toBeVisible();
        await expect(manager.workflow.anyStatusBox()).toHaveCount(0);

        // Control again: the Layout Editor now sees "Preview", still no
        // return buttons.
        await layout.workflow.gotoEditorial(submissionId);
        await expect(layout.workflow.headerButton('Preview')).toBeVisible();
        await expect(layout.workflow.headerButton('Return to Workflow')).toHaveCount(0);
        await expect(layout.workflow.headerButton('Return to Done')).toHaveCount(0);

        // "Return to Done" (Rule 18b): "Published" and "View" are back.
        await manager.workflow.returnToDone();
        await manager.workflow.expectStage('Published');
        await expect(manager.workflow.headerButton('View')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Workflow')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Done')).toHaveCount(0);
    });
});
