// @ts-check
/**
 * @file playwright/tests/U31-reviewer-suggestions-absence.spec.js
 *
 * U31 — Reviewer suggestions (docs/specs/U31-reviewer-suggestions.md): the
 * OPS ABSENCE test, spec scenario 6 {OPS}. A preprint server installs no
 * Review settings tab, so "Reviewer Suggestion at Submission" cannot be
 * switched on there: its submission wizard has no "Reviewer Suggestions"
 * step and its workflow screen no "Reviewers Suggested by Author" panel
 * (spec Purpose, the absence paragraph; footnote a, an install fact). Per
 * RUNBOOK multi-app rule 3 the whole feature costs this ONE absence test on
 * the preprint server, with a positive control per assertion (PRINCIPLES
 * M4, M6). The scenario's stated controls — the same wizard carrying the
 * step and the same screen the panel on a journal with the setting on — are
 * the OJS and OMP suites' scenarios 1 and 2.
 *
 * Deliberately NOT covered here (and why):
 * - Scenarios 1–5 (the wizard step and its window, the editors' panel on
 *   both stages, "Add Reviewer" from a row, the list inside Add Reviewer,
 *   the Funding Coordinator's error dialog, the press's Internal Review):
 *   journal and press screens; the OJS and OMP suites own them.
 * - The Findings register (A1–A5, OMP1): OJS/OMP surfaces; nothing to
 *   assert or park on OPS.
 * - The wizard's OPS step list as a whole and its "Submission Type" absence:
 *   the *Submission wizard* suite's record (U21 S13+S14); here the rail is
 *   read only as the positive control bounding the missing step.
 * - The Review tab's absence as a settings feature (side tabs, review
 *   forms): the *Review setup & review forms* suite's record (U29 S11); here
 *   the tab strip bounds the missing "Reviewer Suggestion at Submission"
 *   box.
 * - The author's own workflow view (the panel never shows there on any
 *   app): the scenario names the Preprint Server Manager's screen only.
 *
 * Seeding: the seeded preprint server `publicknowledge`, read-only (no
 * setting changes; the scenario endpoint refuses `reviewerSuggestions[]` on
 * OPS, spec footnote s). The author starts a fresh submission on screen (the
 * behavior under test is the wizard itself); the manager's screen is a
 * posted preprint seeded with `published: true` by `author.alex` (footnote
 * s6: any posted preprint). `manager.maya` is the Preprint Server Manager.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');
const {
    STEPS,
    startUrl,
    beginSubmission,
    continueTo,
    openReview,
    railEntry,
    reviewPanel,
} = require('../pages/SubmissionWizardPages.js');

const SERVER = 'publicknowledge';
const MANAGER = 'manager.maya';
const AUTHOR = 'author.alex';

/** The rail a preprint server's wizard shows, in order (U21 OPS1). */
const OPS_STEPS = [STEPS.files, STEPS.details, STEPS.contributors, STEPS.readers, STEPS.review];

/** The Workflow Settings tabs a preprint server installs, in order (U29 footnote b). */
const OPS_WORKFLOW_TABS = ['Submission', 'Preprint Server Library', 'Emails', 'Tasks and Discussions'];

/** The panel the editors' workflow screen shows on a journal or press (spec Rule 8). */
const PANEL_HEADING = 'Reviewers Suggested by Author';

/** The settings box a journal or press offers under Review › Setup. */
const SETTING_LABEL = 'Reviewer Suggestion at Submission';

/** Parallel-safe unique tag: single alphanumeric token, ≤32 chars. */
function makeTag(testInfo, scenarioKey) {
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6);
    return `${scenarioKey}opsw${testInfo.parallelIndex}${rand}`;
}

/** The Workflow Settings page's top tab strip: the first tablist in the main region. */
function workflowTabs(page) {
    return page.locator('main').getByRole('tablist').first().getByRole('tab');
}

/**
 * The wizard rail lists exactly the five OPS steps (the positive control)
 * and no "Reviewer Suggestions" entry; the step's button is nowhere on the
 * page either.
 */
async function expectNoSuggestionsStep(page) {
    const labels = page.locator('.pkpSteps__buttons .pkpSteps__step__label');
    await expect(labels).toHaveCount(OPS_STEPS.length);
    expect((await labels.allInnerTexts()).map((label) => label.trim().replace(/^\d+\s*/, ''))).toEqual(OPS_STEPS);
    await expect(railEntry(page, STEPS.reviewerSuggestions)).toHaveCount(0);
    await expect(page.getByRole('button', {name: 'Add Reviewer Suggestion'})).toHaveCount(0);
}

/**
 * Workflow Settings on the preprint server: the four installed tabs render
 * (the positive control, taken the same way), no "Review" tab among them,
 * and the "Reviewer Suggestion at Submission" box is nowhere on the page.
 */
async function expectNoReviewerSuggestionSetting(page) {
    const tabs = workflowTabs(page);
    await expect(tabs).toHaveText(OPS_WORKFLOW_TABS);
    await expect(tabs.filter({hasText: /^Review$/})).toHaveCount(0);
    await expect(page.locator('#reviewSetup')).toHaveCount(0);
    await expect(page.locator('input[name="reviewerSuggestionEnabled"]')).toHaveCount(0);
    await expect(page.locator('main').getByText(SETTING_LABEL)).toHaveCount(0);
}

test.describe('Reviewer suggestions (U31) — OPS absence', () => {
    test.beforeEach(async ({}, testInfo) => testInfo.setTimeout(180_000));

    test('S6 {OPS}: no "Reviewer Suggestions" step, no setting to switch on, no "Reviewers Suggested by Author" panel', async ({opsApi, asUser, appContext}, testInfo) => {
        const tag = makeTag(testInfo, 'u31s6');

        // ── The Author starts a new submission ──────────────────────────────
        // The start form and "Begin Submission" open the wizard on "Upload
        // Files" (the session and the wizard are live); the rail is the five
        // OPS steps and nothing between "For Readers" and "Review".
        const authorPage = await (await asUser(AUTHOR)).newPage();
        await authorPage.goto(startUrl(SERVER));
        await beginSubmission(authorPage, {title: `Preprint ${tag}`});
        await expectNoSuggestionsStep(authorPage);

        // Walked to the last step: the rail keeps the same five entries, and
        // the Review step's summary panels ("Files", "Details", "Contributors",
        // "For Readers" render) carry no "Reviewer Suggestions" panel.
        await continueTo(authorPage, STEPS.details);
        await continueTo(authorPage, STEPS.contributors);
        await continueTo(authorPage, STEPS.readers);
        await openReview(authorPage);
        await expectNoSuggestionsStep(authorPage);
        for (const heading of ['Files', 'Details', 'Contributors', 'For Readers']) {
            await expect(reviewPanel(authorPage, heading)).toBeVisible();
        }
        await expect(reviewPanel(authorPage, 'Reviewer Suggestions')).toHaveCount(0);
        await expect(authorPage.locator('main').getByText('Reviewer Suggestions')).toHaveCount(0);

        // ── The Preprint Server Manager's settings ──────────────────────────
        // Settings › Workflow by its address: the four installed tabs, no
        // "Review" tab, no "Reviewer Suggestion at Submission" box.
        const managerPage = await (await asUser(MANAGER)).newPage();
        await managerPage.goto(`/index.php/${SERVER}/management/settings/workflow`);
        await expect(workflowTabs(managerPage).first()).toHaveAttribute('aria-selected', 'true');
        await expectNoReviewerSuggestionSetting(managerPage);

        // The Review › Setup address a journal or press manager would type
        // (`#review/reviewSetup`) opens the same screen: the hash is kept,
        // "Submission" stays selected, the same four tabs and no box. (Leave
        // the page first: a hash-only change on the open page is a
        // same-document navigation — patterns.md pitfall 17.)
        await managerPage.goto(`/index.php/${SERVER}/index`);
        const typed = await managerPage.goto(`/index.php/${SERVER}/management/settings/workflow#review/reviewSetup`);
        expect(typed && typed.status()).toBe(200);
        expect(managerPage.url()).toContain('/management/settings/workflow#review/reviewSetup');
        await expect(workflowTabs(managerPage).filter({hasText: 'Submission'})).toHaveAttribute('aria-selected', 'true');
        await expectNoReviewerSuggestionSetting(managerPage);

        // ── The Preprint Server Manager's workflow screen of a posted preprint ──
        const seeded = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: AUTHOR,
            title: `Posted preprint ${tag}`,
            published: true,
        });
        expect(seeded.reviewerSuggestions).toEqual([]);

        // The browser's own traffic while the screen renders: on a journal the
        // panel's list is fetched from `…/reviewers/suggestions`; here nothing
        // asks for it, bounded by the screen's own submission fetch.
        const apiRequests = [];
        managerPage.on('request', (request) => {
            if (request.url().includes('/api/v1/')) {
                apiRequests.push(request.url());
            }
        });

        // The posted preprint opens in Done ("Published", header "View");
        // its one stage, Production, reads "Submission published." with the
        // Participants list beside it — the screen demonstrably renders.
        const manager = new WorkflowPage(managerPage, SERVER, {appContext, labels: {publicationGroup: 'Preprint'}});
        await manager.gotoEditorial(seeded.submissionId);
        await manager.expectStage('Published');
        await expect(manager.headerButton('View')).toBeVisible();
        expect(await manager.stageLabels()).toEqual(['Production']);
        await manager.selectStage('Production');
        await manager.expectStageHeading('Production');
        await manager.expectStatus('Submission published.');
        await expect(manager.participantsHeading()).toBeVisible();

        // No review entry of any kind in the menu, and no "Reviewers
        // Suggested by Author" panel, heading or row menu anywhere in the
        // dialog (bounded by the stage's status box and Participants list
        // having just rendered).
        await expect(manager.menu().getByRole('link', {name: /review/i})).toHaveCount(0);
        await expect(manager.dialog().getByRole('heading', {name: PANEL_HEADING})).toHaveCount(0);
        await expect(manager.dialog().getByText(PANEL_HEADING)).toHaveCount(0);
        await expect(manager.primaryColumn().getByRole('button', {name: 'Add Reviewer', exact: true})).toHaveCount(0);

        // The traffic read: the screen fetched the preprint itself and never
        // its reviewer suggestions.
        expect(apiRequests.some((url) => url.includes(`/api/v1/submissions/${seeded.submissionId}`))).toBe(true);
        expect(apiRequests.filter((url) => url.includes('/reviewers/suggestions'))).toEqual([]);
    });
});
