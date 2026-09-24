// @ts-check
/**
 * @file playwright/tests/U46-galleys.spec.js
 *
 * Galleys — OMP suite. A press installs no galleys (the spec's title badge
 * is {OJS OPS}), so the press runs the one scenario written for it, S5 "No
 * galleys on a press" {OMP}: the absence test with a positive control per
 * assertion (RUNBOOK multi-app rule 3), in the press's own words: the Press
 * Manager, a monograph, "Publication Formats". S1–S4 and S6–S8 are the
 * journal's and the preprint server's, in those trees.
 * Spec: docs/specs/U46-galleys.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1, A3, A4, A5, A6, A7, OJS1, OPS1, OPS2, OPS3: all on the "Galleys"
 *   page or its window, which a press does not have.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. The monograph is a scratch submission of the seeded press
 * (which has none), submitted by the seeded Author with a unique tag (M5),
 * as footnote s says; `galleys` is never sent, the press refusing it.
 *
 * The absence is read on a settled side menu: the version's pages are read
 * once the version node has unfolded to its first page, and the missing
 * "Galleys" entry is paired with the "Publication Formats" entry of the
 * same list, read the same way, whose page then opens (M4, M6). Waits are
 * web-first (A5). Runs in the parallel `omp` project: nothing here changes
 * the press.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');

const PRESS = 'publicknowledge';

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u46${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

test.describe('galleys', () => {
    test('S5: no galleys on a press', async ({asUser, ompApi, appContext}, testInfo) => {
        const tag = makeTag('s5', testInfo);
        const {submissionId} = await ompApi.createSubmission({
            tag,
            context: PRESS,
            submitter: 'author.alex',
            title: `Submission ${tag}`,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const workflow = new WorkflowPage(page, PRESS, {appContext});
        await workflow.gotoEditorial(submissionId);

        // Side menu "Publication" › the version: its pages include no
        // "Galleys" (Purpose). The list is read after the node has unfolded
        // to its first page, so the read is settled.
        await expect(workflow.publicationGroup()).toBeVisible();
        const pages = await workflow.pagesUnderLatestVersion();
        expect(pages).not.toContain('Galleys');
        await expect(workflow.menuLink('Galleys')).toHaveCount(0);

        // Control: the same list offers "Publication Formats" (Purpose),
        // read the same two ways, and its page opens.
        expect(pages).toContain('Publication Formats');
        await expect(workflow.pageLink('Publication Formats')).toBeVisible();
        await workflow.selectPage('Publication Formats');
    });
});
