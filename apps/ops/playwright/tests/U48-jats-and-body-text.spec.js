// @ts-check
/**
 * @file playwright/tests/U48-jats-and-body-text.spec.js
 *
 * JATS & Body Text — OPS suite. A preprint server does not install this
 * feature (the spec's title badge is {OJS}), so the server runs the one
 * scenario written for it, S9 "No 'JATS XML' and no 'Body Text'" {OMP OPS}:
 * the absence test with a positive control per assertion (RUNBOOK
 * multi-app rule 3), in the preprint server's own words: the Preprint
 * Server Manager, a posted preprint, the "Preprint" group, the preprint's
 * page. S1–S8 are the journal's, in its tree.
 * Spec: docs/specs/U48-jats-and-body-text.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - OMP1: the press's "Send to Text Editor", in the OMP tree (OPS mounts
 *   no file list for it).
 * - A1–A19: all on the journal's "JATS XML" and "Body Text" pages or the
 *   article's page, which a preprint server does not have.
 *
 * Seeding: scenario endpoints only; publicknowledge and the seeded roster
 * are read-only. The preprint is a scratch submission of the seeded
 * server, submitted by the seeded Author with a unique tag (M5) and posted
 * (`published: true`, no `decisions`: a preprint is in Production from its
 * submission), as footnote v says.
 *
 * The absence on the workflow is read on a settled side menu: the version's
 * pages are read once the version node has unfolded to its first page, and
 * each missing entry is paired with the "Title & Abstract" entry of the same
 * list, read the same way, whose page then opens (M4, M6). The absence on
 * the preprint's page is read once the page's own title heading is shown (a
 * server-rendered page, complete at that point), the link queried by role
 * like the heading it is paired with. Waits are web-first (A5). Runs in the
 * parallel `ops` project: nothing here changes the server.
 */
const {test, expect} = require('../support/fixtures.js');
const {WorkflowPage} = require('../../../../shared/playwright/pages/WorkflowPage.js');

const SERVER = 'publicknowledge';
/** publicknowledge is bilingual, so its public pages carry the /en prefix. */
const SERVER_PREFIX = '/en';

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u48${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** The preprint's page on the public site. */
function preprintUrl(submissionId) {
    return `/index.php/${SERVER}${SERVER_PREFIX}/preprint/view/${submissionId}`;
}

test.describe('JATS & Body Text', () => {
    test('S9: no "JATS XML" and no "Body Text" on a preprint server', async ({asUser, opsApi, appContext}, testInfo) => {
        const tag = makeTag('s9', testInfo);
        const title = `Submission ${tag}`;
        const {submissionId} = await opsApi.createSubmission({
            tag,
            context: SERVER,
            submitter: 'author.alex',
            title,
            published: true,
        });

        const page = await (await asUser('manager.maya')).newPage();
        const workflow = new WorkflowPage(page, SERVER, {appContext, labels: {publicationGroup: 'Preprint'}});
        await workflow.gotoEditorial(submissionId);

        // The version's pages: side menu "Preprint" › the version lists no
        // "JATS XML" and no "Body Text" (Purpose). The list is read after
        // the node has unfolded to its first page, so the read is settled.
        await expect(workflow.publicationGroup()).toBeVisible({timeout: 30_000});
        const pages = await workflow.pagesUnderLatestVersion();
        expect(pages).not.toContain('JATS XML');
        expect(pages).not.toContain('Body Text');
        await expect(workflow.menuLink('JATS XML')).toHaveCount(0);
        await expect(workflow.menuLink('Body Text')).toHaveCount(0);

        // Control: the same list shows "Title & Abstract", read the same two
        // ways, and its page opens.
        expect(pages).toContain('Title & Abstract');
        await expect(workflow.pageLink('Title & Abstract')).toBeVisible();
        await workflow.selectPage('Title & Abstract');

        // The public page: the preprint's page carries no "JATS XML" link
        // (Purpose). Control: the page shows the preprint's title, read by
        // role the same way.
        await page.goto(preprintUrl(submissionId));
        await expect(page.getByRole('heading', {level: 1, name: title, exact: true})).toBeVisible({
            timeout: 30_000,
        });
        await expect(page.getByRole('link', {name: /JATS/})).toHaveCount(0);
        await expect(page.getByText(/JATS XML/)).toHaveCount(0);
    });
});
