// @ts-check
/**
 * @file playwright/tests/U24-workflow-screen-and-stage-access.spec.js
 *
 * Workflow screen & stage access — OMP suite, one test per canonical
 * scenario the spec runs on a press: common scenarios 1–8 in the press's
 * own context (Press Editor, monograph, series; the five-stage menu with
 * "Internal Review" skipped, the "Marketing" group, the press page roster)
 * plus the OMP-specific scenario 9. Scenario 10 is OPS-only.
 * Spec: docs/specs/U24-workflow-screen-and-stage-access.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - OMP2 ❓: whether "Media" should be listed for a role without Production
 *   access is open — S4 and S9 assert the Funding Coordinator's roster with
 *   "Media" set aside (neither its presence nor its absence), and the
 *   production-gated pages' absence; the manager control asserts the full
 *   roster, "Media" included, because the manager reaches Production.
 * - OMP3 🐞: the "Identifiers" page that outlives its plugin needs a
 *   scratch press and the plugin screens; not a canonical scenario.
 * - OMP1 ✅: "Internal Review", the "Marketing" group and the "Chapters" /
 *   "Publication Formats" pages are asserted only as present and in place
 *   (S2, S4, S7, S9); what they contain is outside the campaign.
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
 *   both roles on a scratch press; not a canonical scenario.
 * - A6 ❓: the review stage entry's own status sentence is open — S2 and S9
 *   select the round entry and the other stages, never "External Review"
 *   itself.
 * - A7 ❓: the status of stages skipped by a direct publish is open — S8's
 *   seed passed through Production, so every stage it reads has an
 *   undisputed sentence.
 * - A8 ❓: the role-less Site Administrator cannot be arranged on the test
 *   install (the seeded `admin` is a Press Manager everywhere).
 * - Rule 3's error shell (refused or deleted submission by address) and
 *   Rule 19's Delete dialog are exercised by the Submission stage suite
 *   (U25 S4/S6); this suite asserts the frame's Return dialogs (S8) only.
 * - Rule 6's press-only "Monograph" work-type control is asserted as
 *   nothing more than a header button the author's view lacks (S7).
 * - "Neither dialog sends email" (Side effects): a mail-silence claim with
 *   no natural in-test positive control; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster are
 * read-only (A1, A7). Every test seeds its own monograph with a unique tag
 * (M5) in series `monographs` (whose submit-time auto-assignment enrols the
 * seeded editors, so the Press Editor's "Assigned to me" view lists it) and
 * drives one or more roster accounts through `asUser`. Review
 * seeds go straight to External Review (`sendExternalReview` from the
 * Submission stage, one `external` round), so Internal Review is the
 * skipped stage scenario 2 describes. Assignments (S3 Copyeditor, S4 and S9
 * Funding Coordinator, S8 Layout Editor) are seeded as `participants[]`,
 * the row the Assign Participant form writes. No mail assertions, so no
 * Mailpit use. Waits are web-first (A5). Everything runs in the parallel
 * `omp` project.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage, NO_ACCESS_TEXT} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');

const PRESS = 'publicknowledge';

/** The press's stage entries in workflow order (Rule 7). */
const OMP_STAGES = ['Submission', 'Internal Review', 'External Review', 'Copyediting', 'Production'];

/** The press's menu groups in order (Rule 7, OMP1). */
const OMP_GROUPS = ['Workflow', 'Marketing', 'Publication'];

/** The press's editorial roster below the production gate (Rule 10), "Media" set aside (OMP2). */
const PRESS_PAGES_UNGATED = [
    'Title & Abstract',
    'Contributors',
    'Chapters',
    'Metadata',
    'Publication Formats',
    'References',
    'Funding',
];

/** The press's full editorial roster for a role with Production access (Rule 10). */
const PRESS_PAGES_EDITORIAL = [
    'Title & Abstract',
    'Contributors',
    'Chapters',
    'Metadata',
    'Publication Formats',
    'Media',
    'References',
    'Funding',
    'Catalog Entry',
    'Permissions & Disclosure',
];

/** The press's author roster (Rule 10). */
const PRESS_PAGES_AUTHOR = [
    'Title & Abstract',
    'Contributors',
    'Chapters',
    'Metadata',
    'Publication Formats',
    'Media',
    'References',
    'Funding',
];

/** The press's production-only pages (Rule 10). */
const PRODUCTION_PAGES = ['Catalog Entry', 'Permissions & Disclosure'];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u24${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** One External Review round with the default external reviewer accepted (footnote s). */
const ONE_EXTERNAL_ROUND = [{stage: 'external', reviewers: [{username: 'reviewer.julia', status: 'accepted'}]}];

/**
 * A monograph on the press in series `monographs`: submit-time
 * auto-assignment enrols the series' seeded editors (editor.diana among
 * them), so the Press Editor's "Assigned to me" view lists it (S1, S7).
 */
async function seed(ompApi, tag, extra = {}) {
    return await ompApi.createSubmission({
        tag,
        context: PRESS,
        submitter: 'author.alex',
        title: `Submission ${tag}`,
        series: 'monographs',
        ...extra,
    });
}

/** A monograph in External Review Round 1, Internal Review skipped (scenarios 2–4, 9). */
function inExternalReview(extra = {}) {
    return {decisions: ['sendExternalReview'], reviewRounds: ONE_EXTERNAL_ROUND, ...extra};
}

/** A page as a given roster user, plus the workflow page object for it. */
async function workflowAs(asUser, appContext, username) {
    const page = await (await asUser(username)).newPage();
    return {page, workflow: new WorkflowPage(page, PRESS, {appContext})};
}

/** The menu's group headings (level-1 entries) in order. */
async function groupLabels(workflow) {
    return (await workflow.menuEntries()).filter((e) => e.level === 1).map((e) => e.label);
}

/** The entries listed directly under a stage entry (its review rounds), in order. */
async function entriesUnder(workflow, stageLabel) {
    const entries = await workflow.menuEntries();
    const start = entries.findIndex((e) => e.level === 2 && e.label === stageLabel);
    if (start < 0) return [];
    const out = [];
    for (const e of entries.slice(start + 1)) {
        if (e.level <= 2) break;
        out.push(e.label);
    }
    return out;
}

test.describe('workflow screen & stage access', () => {
    test('S1 — open a monograph\'s workflow from the editorial dashboard', {tag: '@smoke'}, async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await seed(ompApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'editor.diana');
        const dash = new EditorialDashboardPage(page, PRESS);
        await dash.goto();
        const row = await dash.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header (Rule 4): number, underlined contributors, full title,
        // the stage bubble (Rule 5).
        await expect(workflow.contributorsLine()).toBeVisible();
        await expect(workflow.contributorsLine()).not.toHaveText('');
        await expect(workflow.titleLine()).toHaveText(`Submission ${tag}`);
        await workflow.expectStage('Submission');

        // The side menu (Rules 7, 9): the Workflow group with the press's
        // five stages in order, the first striped; the Publication group
        // with one version node whose pages start with the press's first
        // four (Rule 10).
        await expect(workflow.workflowGroup()).toBeVisible();
        expect(await workflow.stageLabels()).toEqual(OMP_STAGES);
        expect(await workflow.stripedLabels()).toEqual(['Submission']);
        await expect(workflow.publicationGroup()).toBeVisible();
        await expect(workflow.versionNodes()).toHaveCount(1);
        expect((await workflow.pagesUnderLatestVersion()).slice(0, 4)).toEqual([
            'Title & Abstract',
            'Contributors',
            'Chapters',
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

    test('S2 — walk the stages of a monograph in external review', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const {submissionId} = await seed(ompApi, tag, inExternalReview());

        const {workflow} = await workflowAs(asUser, appContext, 'editor.diana');
        await workflow.gotoEditorial(submissionId);

        // Lands on Review Round 1 under External Review (Rule 11), headed
        // for the round, with the round's status box (Rule 15c); the round
        // and its stage are striped (Rule 8).
        await workflow.expectStage('External Review (Round 1)');
        await workflow.expectStageHeading('External Review (Round 1)');
        await workflow.expectSelected('Review Round 1');
        await expect(workflow.statusBox('Round 1 Status')).toBeVisible();
        expect(await workflow.stripedLabels()).toEqual(['External Review', 'Review Round 1']);

        // Submission: a stage the submission moved beyond (Rule 15b), naming
        // the press's review stage, with its panels below the box.
        await workflow.selectStage('Submission');
        await workflow.expectStatus('The submission is currently in the External Review stage.');
        await expect(workflow.panel('Submission Files')).toBeVisible();

        // Internal Review, skipped on the way to External Review: not
        // reached (Rule 15a) and nothing at all below the box (Rule 16) —
        // no panels, no Participants column, no buttons.
        await workflow.selectStage('Internal Review');
        await workflow.expectStatus('The Internal Review stage has not yet been initiated.');
        await expect(workflow.panelTables()).toHaveCount(0);
        await expect(workflow.secondaryColumn()).toHaveCount(0);
        await expect(workflow.actionItems()).toHaveCount(0);

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

    test('S3 — a stage outside the role\'s stage set', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const {submissionId} = await seed(
            ompApi,
            tag,
            inExternalReview({participants: [{username: 'copyeditor.carla', role: 'copyeditor'}]})
        );

        // Control first: the Press Editor sees the round's panels and a
        // version node with pages (the positive control for every absence
        // below, M4).
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await editor.workflow.expectStageHeading('External Review (Round 1)');
        await expect(editor.workflow.panel('Reviewers')).toBeVisible();
        await expect(editor.workflow.versionNodes()).toHaveCount(1);
        await expect(editor.workflow.pageLink('Title & Abstract')).toBeVisible();

        // The assigned Copyeditor lands on the round (Rule 11) and gets the
        // no-access box alone (Rule 13).
        const {page, workflow} = await workflowAs(asUser, appContext, 'copyeditor.carla');
        await workflow.gotoEditorial(submissionId);
        await workflow.expectSelected('Review Round 1');
        await workflow.expectNoAccessOnly();

        // Submission: the same box. The press's Internal Review too.
        await workflow.select('Submission');
        await workflow.expectSelected('Submission');
        await workflow.expectNoAccessOnly();
        await workflow.select('Internal Review');
        await workflow.expectSelected('Internal Review');
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

    test('S4 — the production-only pages', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const {submissionId} = await seed(
            ompApi,
            tag,
            inExternalReview({participants: [{username: 'assistant.rita', role: 'funding'}]})
        );

        // The Funding Coordinator (stage set Submission + the review stages)
        // reaches the Publication group but not Production: no "Catalog
        // Entry" or "Permissions & Disclosure" (Rule 10). "Media" is left
        // out of the comparison (OMP2 is open).
        const funding = await workflowAs(asUser, appContext, 'assistant.rita');
        await funding.workflow.gotoEditorial(submissionId);
        await funding.workflow.expectStageHeading('External Review (Round 1)');
        const fundingPages = await funding.workflow.pagesUnderLatestVersion();
        expect(fundingPages.filter((p) => p !== 'Media')).toEqual(PRESS_PAGES_UNGATED);
        for (const gated of PRODUCTION_PAGES) {
            expect(fundingPages).not.toContain(gated);
        }
        await expect(funding.workflow.createNewVersionLink()).toHaveCount(0);

        // Control: the Press Manager sees the whole roster, the two
        // production-only pages last, then "Create New Version" after the
        // node.
        const manager = await workflowAs(asUser, appContext, 'manager.maya');
        await manager.workflow.gotoEditorial(submissionId);
        expect(await manager.workflow.pagesUnderLatestVersion()).toEqual(PRESS_PAGES_EDITORIAL);
        await expect(manager.workflow.createNewVersionLink()).toBeVisible();
    });

    test('S5 — deep link and reload', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await seed(ompApi, tag);

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
        const tabWorkflow = new WorkflowPage(tab, PRESS, {appContext});
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
        const dash = new EditorialDashboardPage(page, PRESS);
        await expect(dash.heading()).toBeVisible({timeout: 30_000});
    });

    test('S6 — typed addresses forward', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await seed(ompApi, tag);
        const workflowAccessUrl = `/index.php/${PRESS}/workflow/access/${submissionId}`;
        const authorDashboardUrl = `/index.php/${PRESS}/authorDashboard/submission/${submissionId}`;

        // The Press Editor's `workflow/access` address forwards to the
        // editorial dashboard, "Assigned to me", with the panel open (Rule 2a).
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

        // … and the Press Editor on the author-dashboard address likewise.
        await editor.page.goto(authorDashboardUrl);
        await expect(
            editor.page.getByText('You do not currently have sufficient privileges to view the submission.')
        ).toBeVisible({timeout: 30_000});
        await editor.workflow.expectClosed();
    });

    test('S7 — the author\'s view', {tag: '@smoke'}, async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await seed(ompApi, tag, {
            decisions: ['sendExternalReview', 'accept'],
            reviewRounds: ONE_EXTERNAL_ROUND,
        });

        const {page, workflow} = await workflowAs(asUser, appContext, 'author.alex');
        const mySub = new MySubmissionsPage(page, PRESS);
        await mySub.goto();
        const row = await mySub.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header offers "Library" and nothing else (Rule 6): no
        // "Activity Log" and no press work-type control.
        await expect(workflow.headerButton('Library')).toBeVisible();
        expect(await workflow.headerButtonLabels()).toEqual(['Library']);

        // The Workflow group lists every press stage (Rule 7); no Marketing
        // group in the author's view (OMP1); the version node lists the
        // press's author roster and nothing production-only (Rule 10); no
        // "Create New Version" (Rule 9).
        expect(await workflow.stageLabels()).toEqual(OMP_STAGES);
        expect(await groupLabels(workflow)).toEqual(['Workflow', 'Publication']);
        expect(await workflow.pagesUnderLatestVersion()).toEqual(PRESS_PAGES_AUTHOR);
        await expect(workflow.createNewVersionLink()).toHaveCount(0);

        // Control: the Press Editor on the same monograph has "Activity Log"
        // and the work-type control in the header, the Marketing group in
        // the menu and "Permissions & Disclosure" in the list.
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        await expect(editor.workflow.headerButton('Activity Log')).toBeVisible();
        await expect(editor.workflow.headerButton('Monograph')).toBeVisible();
        expect(await groupLabels(editor.workflow)).toEqual(OMP_GROUPS);
        await editor.workflow.expandLatestVersionNode();
        await expect(editor.workflow.pageLink('Permissions & Disclosure')).toBeVisible();
    });

    test('S8 — View, Done and the two return buttons', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await seed(ompApi, tag, {
            decisions: ['sendExternalReview', 'accept', 'sendToProduction'],
            reviewRounds: ONE_EXTERNAL_ROUND,
            published: true,
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
        // the panels and no "Status" box; "Preview" and "Return to Done".
        await manager.workflow.returnToWorkflow();
        await manager.workflow.expectStage('Production');
        await expect(manager.workflow.headerButton('Preview')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Done')).toBeVisible();
        await expect(manager.workflow.headerButton('View')).toHaveCount(0);
        await expect(manager.workflow.headerButton('Return to Workflow')).toHaveCount(0);
        await manager.workflow.expectStriped('Production');
        await manager.workflow.expectStageHeading('Production');
        await expect(manager.workflow.panelTables().first()).toBeVisible();
        await expect(manager.workflow.statusBox('Status')).toHaveCount(0);

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

    test('S9 — the press\'s five-stage menu', async ({asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const {submissionId} = await seed(
            ompApi,
            tag,
            inExternalReview({participants: [{username: 'assistant.rita', role: 'funding'}]})
        );

        // The Press Editor: five stages in order, "Review Round 1" under
        // "External Review" (and nothing under the skipped "Internal
        // Review"), the round's heading, and a "Marketing" group between
        // "Workflow" and "Publication" (Rule 7, OMP1).
        const editor = await workflowAs(asUser, appContext, 'editor.diana');
        await editor.workflow.gotoEditorial(submissionId);
        expect(await editor.workflow.stageLabels()).toEqual(OMP_STAGES);
        expect(await entriesUnder(editor.workflow, 'External Review')).toEqual(['Review Round 1']);
        expect(await entriesUnder(editor.workflow, 'Internal Review')).toEqual([]);
        await editor.workflow.expectStageHeading('External Review (Round 1)');
        expect(await groupLabels(editor.workflow)).toEqual(OMP_GROUPS);

        // The version node lists the press roster, with no "JATS XML" or
        // "Body Text" (Rule 10, OMP1).
        const editorPages = await editor.workflow.pagesUnderLatestVersion();
        expect(editorPages).toEqual(PRESS_PAGES_EDITORIAL);
        expect(editorPages).not.toContain('JATS XML');
        expect(editorPages).not.toContain('Body Text');

        // Control: the assigned Funding Coordinator still gets the
        // "Marketing" group but not "Catalog Entry" or "Permissions &
        // Disclosure". "Media" is left out of the comparison (OMP2 is open).
        const funding = await workflowAs(asUser, appContext, 'assistant.rita');
        await funding.workflow.gotoEditorial(submissionId);
        expect(await groupLabels(funding.workflow)).toEqual(OMP_GROUPS);
        const fundingPages = await funding.workflow.pagesUnderLatestVersion();
        expect(fundingPages.filter((p) => p !== 'Media')).toEqual(PRESS_PAGES_UNGATED);
        for (const gated of PRODUCTION_PAGES) {
            expect(fundingPages).not.toContain(gated);
        }
    });
});
