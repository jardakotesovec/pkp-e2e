// @ts-check
/**
 * @file playwright/tests/U24-workflow-screen-and-stage-access.spec.js
 *
 * Workflow screen & stage access — OPS suite, one test per canonical
 * scenario the spec runs on a preprint server: the common scenarios 1, 5,
 * 6, 7 and 8 in the preprint server's own context (one stage, "Preprint"
 * group, Moderator and Preprint Server Manager as the editorial roles, since
 * OPS enrols no Editor account) and the OPS-specific scenario 10.
 * Spec: docs/specs/U24-workflow-screen-and-stage-access.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - Scenarios 2, 3 and 4 have no preprint analogue (the spec says so at
 *   their end; register OPS1 ✅): a preprint server has one stage, so there
 *   is no stage walk, no Copyeditor and no assistant with stage access. The
 *   single "Production" entry that S1 and S10 assert is the whole roster.
 * - A1 ❓: on a preprint server the landing entry and the stage an address
 *   names coincide, so the question cannot be observed here — S6 drives the
 *   plain `workflow/access` address and asserts the forward only.
 * - A2 ❓ / A4 ❓: need an assigned assistant off the active stage, or a
 *   reviewing manager; OPS has neither an assistant with stage access nor
 *   a reviewer role.
 * - A3 ❓ / A5 🐞 / OPS4 ❓: the incomplete-submission doors, the blank page
 *   of a malformed stage address and the author's draft with the "Error"
 *   dialog on top are not scenario'd; nothing here seeds a draft or types a
 *   stage-numbered address.
 * - A6 ❓ / A7 ❓: review-entry and skipped-stage status sentences; a
 *   preprint server has no review stage and no stage to skip.
 * - A8 ❓: the role-less Site Administrator cannot be arranged on the test
 *   install (the seeded `admin` is a Preprint Server Manager everywhere).
 * - OPS2 ❓: S10 asserts only what the spec states as the outcome for a
 *   declined preprint (lands on "Preprint: Title & Abstract"; "Production"
 *   one click away with "Revert Decline"), never that this landing is right.
 * - OPS3 🐞: a draft's bubble reading "Production" — no draft is seeded and
 *   no bubble of a draft is asserted.
 * - Rule 3's error shell (refused or deleted submission by address) and
 *   Rule 19's Delete dialog belong to the stage that offers "Delete" (on a
 *   preprint server, *Production stage*); this suite asserts the frame's
 *   Return dialogs (S8) only.
 * - "Neither dialog sends email" (Side effects): a mail-silence claim with
 *   no natural in-test positive control; not asserted.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster are
 * read-only (A1, A7). Every test seeds its own preprint with a unique tag
 * (M5) and drives roster accounts through `asUser`: `manager.maya` stands in
 * for the spec's Editor, `sectioneditor.ana` is the Moderator of section PRE
 * (assigned automatically to every preprint there), `author.alex` the
 * Author. A queued preprint is a plain submitted seed (OPS creates every
 * submission at Production); the declined one is `decisions: ['decline']`;
 * the Done state is `published: true`. No mail assertions, so no Mailpit
 * use. Waits are web-first (A5). Everything runs in the parallel `ops`
 * project.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage, NO_ACCESS_TEXT} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {EditorialDashboardPage} = require('../../../../shared/playwright/pages/EditorialDashboardPage.js');
const {MySubmissionsPage} = require('../../../../shared/playwright/pages/MySubmissionsPage.js');

const SERVER = 'publicknowledge';

/** The preprint server's single stage entry (Rule 7, OPS1). */
const OPS_STAGES = ['Production'];

/** The editorial roster of a preprint server's version node (Rule 10). */
const EDITORIAL_PAGES = [
    'Title & Abstract',
    'Contributors',
    'Metadata',
    'References',
    'Funding',
    'Galleys',
    'Media',
    'Permissions & Disclosure',
    'Preprint entry',
];

/** The author's roster on a preprint server (Rule 10, OPS1). */
const AUTHOR_PAGES = [
    'Title & Abstract',
    'Contributors',
    'Metadata',
    'References',
    'Funding',
    'Galleys',
    'Media',
    'Production Tasks & Discussions',
];

/** Unique per-run tag: single alphanumeric token, app + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u24${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

async function seed(opsApi, tag, extra = {}) {
    return await opsApi.createSubmission({
        tag,
        context: SERVER,
        submitter: 'author.alex',
        title: `Preprint ${tag}`,
        ...extra,
    });
}

/** A page as a given roster user, plus the workflow page object for it. */
async function workflowAs(asUser, appContext, username) {
    const page = await (await asUser(username)).newPage();
    return {
        page,
        workflow: new WorkflowPage(page, SERVER, {appContext, labels: {publicationGroup: 'Preprint'}}),
    };
}

test.describe('workflow screen & stage access', () => {
    test('S1 — open a preprint\'s workflow from the editorial dashboard', {tag: '@smoke'}, async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const {submissionId} = await seed(opsApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'manager.maya');
        const dash = new EditorialDashboardPage(page, SERVER);
        await dash.gotoView('active');
        const row = await dash.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header (Rule 4): number, underlined contributors, full title,
        // the stage bubble reading "Production" (Rule 5, OPS1).
        await expect(workflow.contributorsLine()).toBeVisible();
        await expect(workflow.contributorsLine()).not.toHaveText('');
        await expect(workflow.titleLine()).toHaveText(`Preprint ${tag}`);
        await workflow.expectStage('Production');

        // The side menu (Rules 7, 9): the Workflow group with "Production"
        // alone, striped; the Preprint group with one version node whose
        // pages start Title & Abstract, Contributors, Metadata.
        await expect(workflow.workflowGroup()).toBeVisible();
        expect(await workflow.stageLabels()).toEqual(OPS_STAGES);
        expect(await workflow.stripedLabels()).toEqual(['Production']);
        await expect(workflow.publicationGroup()).toBeVisible();
        await expect(workflow.versionNodes()).toHaveCount(1);
        expect((await workflow.pagesUnderLatestVersion()).slice(0, 3)).toEqual([
            'Title & Abstract',
            'Contributors',
            'Metadata',
        ]);

        // The main column is headed "Workflow: Production" (Rule 11) and
        // the address records the open preprint (Rule 12).
        await workflow.expectStageHeading('Production');
        expect(workflow.submissionIdFromUrl()).toBe(String(submissionId));

        // Close: the list is back and the address forgets the panel (Rule 1).
        await workflow.close();
        await expect(dash.row(tag)).toBeVisible({timeout: 30_000});
        expect(workflow.submissionIdFromUrl()).toBeNull();
    });

    test('S5 — deep link and reload', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await seed(opsApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'manager.maya');
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Contributors');

        // The address names the preprint and the selected entry (Rule 12).
        await expect
            .poll(() => workflow.menuKeyFromUrl(), {timeout: 30_000})
            .toMatch(/^publication_\d+_contributors$/);
        const deepLink = page.url();

        // The same address in a new tab opens straight on the page.
        const tab = await page.context().newPage();
        const tabWorkflow = new WorkflowPage(tab, SERVER, {
            appContext,
            labels: {publicationGroup: 'Preprint'},
        });
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
        const dash = new EditorialDashboardPage(page, SERVER);
        await expect(dash.heading()).toBeVisible({timeout: 30_000});
    });

    test('S6 — typed addresses forward', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const {submissionId} = await seed(opsApi, tag);
        const workflowAccessUrl = `/index.php/${SERVER}/workflow/access/${submissionId}`;
        const authorDashboardUrl = `/index.php/${SERVER}/authorDashboard/submission/${submissionId}`;

        // The Manager's `workflow/access` address forwards to the editorial
        // dashboard, "Assigned to me", with the panel open at its usual
        // landing, the single stage (Rules 2a, 11).
        const manager = await workflowAs(asUser, appContext, 'manager.maya');
        await manager.page.goto(workflowAccessUrl);
        await manager.page.waitForURL((url) => url.pathname.includes('/dashboard/editorial'), {
            waitUntil: 'commit',
        });
        await manager.workflow.expectOpen(submissionId);
        await manager.workflow.expectStageHeading('Production');
        await expect
            .poll(() => new URL(manager.page.url()).searchParams.get('currentViewId'), {timeout: 30_000})
            .toBe('assigned-to-me');
        expect(manager.workflow.submissionIdFromUrl()).toBe(String(submissionId));

        // The Author's old author-dashboard address forwards to My
        // Submissions with the panel open on the preprint's pages (Rule 2b).
        const author = await workflowAs(asUser, appContext, 'author.alex');
        await author.page.goto(authorDashboardUrl);
        await author.page.waitForURL((url) => url.pathname.includes('/dashboard/mySubmissions'), {
            waitUntil: 'commit',
        });
        await author.workflow.expectOpen(submissionId);
        await author.workflow.expectPageHeading('Title & Abstract');

        // Controls: the Author on the editorial address is turned away …
        await author.page.goto(workflowAccessUrl);
        await expect(author.page.getByText(NO_ACCESS_TEXT)).toBeVisible({timeout: 30_000});
        await author.workflow.expectClosed();

        // … and the Manager on the author-dashboard address likewise.
        await manager.page.goto(authorDashboardUrl);
        await expect(
            manager.page.getByText('You do not currently have sufficient privileges to view the submission.')
        ).toBeVisible({timeout: 30_000});
        await manager.workflow.expectClosed();
    });

    test('S7 — the author\'s view', {tag: '@smoke'}, async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const {submissionId} = await seed(opsApi, tag);

        const {page, workflow} = await workflowAs(asUser, appContext, 'author.alex');
        const mySub = new MySubmissionsPage(page, SERVER);
        await mySub.goto();
        const row = await mySub.findRowByTag(tag);
        await workflow.openFromRow(row, submissionId);

        // The header offers "Library" and nothing else (Rule 6).
        await expect(workflow.headerButton('Library')).toBeVisible();
        expect(await workflow.headerButtonLabels()).toEqual(['Library']);

        // No "Workflow" group at all; the panel lands on "Preprint: Title &
        // Abstract" (Rules 7, 11, OPS1).
        await workflow.expectPageHeading('Title & Abstract');
        await workflow.expectSelected('Title & Abstract');
        await expect(workflow.publicationGroup()).toBeVisible();
        await expect(workflow.workflowGroup()).toHaveCount(0);
        expect(await workflow.stageLabels()).toEqual([]);

        // The version node lists the author's roster, ending with
        // "Production Tasks & Discussions", nothing production-only (Rule
        // 10); no "Create New Version" (Rule 9).
        expect(await workflow.pagesUnderLatestVersion()).toEqual(AUTHOR_PAGES);
        await expect(workflow.createNewVersionLink()).toHaveCount(0);

        // Control: the Manager on the same preprint has "Activity Log" in
        // the header, the "Workflow" group in the menu, "Permissions &
        // Disclosure" in the list and "Create New Version" after the node.
        const manager = await workflowAs(asUser, appContext, 'manager.maya');
        await manager.workflow.gotoEditorial(submissionId);
        await expect(manager.workflow.headerButton('Activity Log')).toBeVisible();
        await expect(manager.workflow.workflowGroup()).toBeVisible();
        expect(await manager.workflow.stageLabels()).toEqual(OPS_STAGES);
        await manager.workflow.expandLatestVersionNode();
        await expect(manager.workflow.pageLink('Permissions & Disclosure')).toBeVisible();
        await expect(manager.workflow.createNewVersionLink()).toBeVisible();
    });

    test('S8 — View, Done and the two return buttons', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const {submissionId} = await seed(opsApi, tag, {published: true});

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

        // Control, same state: the Author's header reads "Library" and
        // nothing else (no assistant can open the panel on a preprint
        // server, so the Author is the control).
        const author = await workflowAs(asUser, appContext, 'author.alex');
        await author.workflow.gotoAuthor(submissionId);
        await author.workflow.expectStage('Published');
        await expect(author.workflow.headerButton('Library')).toBeVisible();
        expect(await author.workflow.headerButtonLabels()).toEqual(['Library']);

        // "Return to Workflow" (Rule 18a): back in Production, queued, with
        // the stage's panels and no status box; "Preview" and "Return to
        // Done".
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

        // Control again: the Author's header still reads "Library" alone.
        await author.workflow.gotoAuthor(submissionId);
        await author.workflow.expectStage('Production');
        await expect(author.workflow.headerButton('Library')).toBeVisible();
        expect(await author.workflow.headerButtonLabels()).toEqual(['Library']);

        // "Return to Done" (Rule 18b): "Published" and "View" are back.
        await manager.workflow.returnToDone();
        await manager.workflow.expectStage('Published');
        await expect(manager.workflow.headerButton('View')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Workflow')).toBeVisible();
        await expect(manager.workflow.headerButton('Return to Done')).toHaveCount(0);
    });

    test('S10 — the single-stage preprint workflow', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const [queued, declined] = await Promise.all([
            seed(opsApi, `${tag}q`),
            seed(opsApi, `${tag}d`, {decisions: ['decline']}),
        ]);

        // The Moderator on a queued preprint: "Production" alone, striped;
        // "Workflow: Production" with no status box (Rules 7, 11, 15, OPS1).
        const {workflow} = await workflowAs(asUser, appContext, 'sectioneditor.ana');
        await workflow.gotoEditorial(queued.submissionId);
        await workflow.expectStage('Production');
        expect(await workflow.stageLabels()).toEqual(OPS_STAGES);
        expect(await workflow.stripedLabels()).toEqual(['Production']);
        await workflow.expectSelected('Production');
        await workflow.expectStageHeading('Production');
        await expect(workflow.languageLine()).toHaveText('Current Submission Language: English');
        await expect(workflow.anyStatusBox()).toHaveCount(0);

        // The "Preprint" group's version node ends with "Permissions &
        // Disclosure", "Preprint entry" (Rule 10).
        expect(await workflow.pagesUnderLatestVersion()).toEqual(EDITORIAL_PAGES);

        // A declined preprint: bubble "Declined" (Rule 5); the panel lands
        // on "Preprint: Title & Abstract", not on "Production", which keeps
        // its stripe (Rule 11 as built; register OPS2 is open).
        await workflow.gotoEditorial(declined.submissionId);
        await workflow.expectStage('Declined');
        await workflow.expectPageHeading('Title & Abstract');
        await workflow.expectSelected('Title & Abstract');
        await expect(workflow.stageLink('Production')).not.toHaveClass(/bg-selection-dark/);
        expect(await workflow.stripedLabels()).toEqual(['Production']);

        // Control: select "Production" on the declined preprint — headed
        // "Workflow: Production" with the stage's own buttons, "Revert
        // Decline" among them (OPS1).
        await workflow.selectStage('Production');
        await expect(workflow.actionButton('Revert Decline')).toBeVisible();
    });
});
