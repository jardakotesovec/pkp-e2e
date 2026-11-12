// @ts-check
/**
 * @file playwright/tests/serial/U42-citations-and-references.spec.js
 *
 * Citations & references — OMP suite, serial part: S5 ("Metadata lookup
 * switched on"), in the press's words (the Press Manager, a monograph).
 * The other scenarios run in the parallel `omp` project
 * (tests/U42-citations-and-references.spec.js), whose header holds the
 * suite's "not covered" block.
 * Spec: docs/specs/U42-citations-and-references.md
 *
 * Serial project (PRINCIPLES A9; footnote s): S5 runs the site's
 * background jobs twice with `runJobs()`, which drains the fleet's shared
 * queue. Its second monograph is seeded with `citationsLookup: 'failed'`
 * (scenarios.md), which leaves one row in Administration › "Failed Jobs",
 * a total U61's serial tests read; so S5 carries `@solo` and runs alone in
 * the `omp-solo` project, after the serial one (harness.md "Running").
 *
 * Not covered here, by register ID: A4 🐞 (the lookup text is read by its
 * opening words only), A13 🐞 (every author row added is filled), A16 🐞
 * (the expander is pressed by its current name, with the mouse), A25 🐞
 * (every DOI typed by hand is typed after the lookup's first step ran),
 * A26 ❓ (no lookup service answers on a test install).
 *
 * Lookup on: no job runner of its own and no outbound connection, so a
 * reference's lookup never finishes and the References page refetches
 * every 7 s while the progress box counts below its total; every read
 * after that is a web-first assertion, and row menus are retried once
 * when a refetch detaches their items (CitationsPages). The S5 settings
 * changes are made on the Settings screen because that screen is what the
 * scenario tests.
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {WorkflowPage} = require('../../../../../shared/playwright/pages/WorkflowPage.js');
const {
    CITATIONS_TEXT: TEXT,
    ReferencesPage,
    expectTopToBottom,
} = require('../../../../../shared/playwright/pages/CitationsPages.js');

const ORCID = 'https://orcid.org/0000-0002-1825-0097';
const SANDBOX_ORCID = 'https://sandbox.orcid.org/0000-0002-1825-0097';
const REPROCESS_ALL_QUESTION =
    "This will reprocess all references currently listed. You'll need to re-enter your manual changes again if you continue.";
const FAILED_DESCRIPTION =
    'The metadata lookup could not be completed for some references, usually because an external service was temporarily unavailable. They are marked below - you can edit them by hand, or use Reprocess to try again.';

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u42${scenario}omw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]` (users.md: `<username>@mail.test`). */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** Seed a scratch press with a throwaway manager and author and any context keys. */
async function seedPress(ompApi, tag, context = {}) {
    await ompApi.createContext({
        tag,
        users: [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author'])],
        ...context,
    });
    return {manager: `${tag}mg`, author: `${tag}au`};
}

/** A page as `username` with the workflow frame of `contextPath`. */
async function pageAs(asUser, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    return {page, frame: new WorkflowPage(page, contextPath)};
}

/** Open a monograph's workflow and its "References" page. */
async function openReferences({page, frame}, submissionId) {
    await frame.gotoEditorial(submissionId);
    const refs = new ReferencesPage(page, frame);
    await refs.open();
    return refs;
}

/** Settings › Workflow › Submission › "Metadata", loaded. */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(page.getByRole('checkbox', {name: 'Enable references metadata', exact: true})).toBeVisible({
        timeout: 30_000,
    });
}

/** Save the Metadata form, bounded by the context API answering OK. */
async function saveMetadataSettings(page) {
    const form = page
        .locator('form')
        .filter({has: page.getByRole('checkbox', {name: 'Enable keyword metadata', exact: true})});
    const saved = page.waitForResponse(
        (r) => r.url().includes('/api/v1/contexts/') && r.request().method() === 'POST' && r.ok(),
        {timeout: 30_000}
    );
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    await saved;
}

/** The Metadata screen's References controls. */
function referencesSettings(page) {
    return {
        lookup: page.getByRole('checkbox', {
            name: 'Enable references structuring and metadata lookup',
            exact: true,
        }),
    };
}

/**
 * Press "Save" in "Edit citation" when the server refuses it: bounded by
 * the citation write answering 400 (proposed shared:
 * `EditCitationPanel.saveRefusedByServer()`).
 */
async function saveRefusedByServer(page, panel) {
    const refused = page.waitForResponse(
        (r) => /\/citations\/\d+$/.test(r.url().split('?')[0]) && r.request().method() === 'POST' && r.status() === 400,
        {timeout: 30_000}
    );
    await panel.saveButton().click();
    await refused;
}

/**
 * One author of a structured row's expanded details, by its "Family
 * Given" text (proposed shared: `ReferencesPage.rowAuthor(text, name)`).
 */
function authorItem(refs, rowText, name) {
    return refs.row(rowText).locator('li').filter({hasText: name});
}

/**
 * A structured row's details, opened by its expander when closed, list
 * these authors in order (the list refetches after a save, so the read
 * repeats until it holds; .reports/flake-s26/fixC/diagnosis.md).
 */
async function expectAuthorsShown(refs, rowText, names) {
    const authors = refs.row(rowText).locator('li > span > span:first-child');
    await expect(async () => {
        if (!(await refs.rowSmallPrint(rowText).isVisible())) {
            await refs.rowExpander(rowText).click({timeout: 5_000});
        }
        await expect(authors).toHaveText(names, {timeout: 5_000});
    }).toPass({timeout: 30_000});
}

test.describe('citations and references (serial)', () => {
    test('S5: metadata lookup switched on @solo', async ({asUser, ompApi}, testInfo) => {
        test.slow();
        test.setTimeout(600_000);
        const tag = makeTag('s5', testInfo);
        const {manager, author} = await seedPress(ompApi, tag, {citationsMetadataLookup: true});
        const [{submissionId}, failed] = await Promise.all([
            ompApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}s`,
                citationsRaw: 'Alpha study 2020',
            }),
            // The lookup failed for good (scenarios.md `citationsLookup`).
            ompApi.createSubmission({
                tag: `${tag}f`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}f`,
                citationsRaw: 'Delta paper 2023',
                citationsLookup: 'failed',
            }),
        ]);

        const mgr = await pageAs(asUser, manager, tag);
        let refs = await openReferences(mgr, submissionId);

        // The page with lookup on: the lookup heading and text above the
        // "Add" box, the text read by its opening words on a press (A4),
        // "Reprocess all references" beside "Delete all references",
        // "Expand All" heading the second column (Rule 10).
        await expect(refs.structuredHeadings()).toHaveCount(2);
        await expect(refs.lookupText()).toContainText(TEXT.lookupTextStart);
        await expectTopToBottom([refs.lookupHeading(), refs.lookupText(), refs.addBox()]);
        await expect(refs.reprocessAllButton()).toBeVisible();
        await expect(refs.deleteAllButton()).toBeVisible();
        await expect(refs.secondColumnHeader().getByRole('button', {name: 'Expand All', exact: true})).toBeVisible();
        // The progress box counts every reference, the plain one whose
        // lookup waits included (Rule 13).
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/1', {timeout: 30_000});

        // "Expand All" with nothing structured toggles its label only
        // (Rule 10).
        await refs.expandAllButton().click();
        await expect(refs.expandAllButton()).toHaveText('Collapse All');
        await refs.expandAllButton().click();
        await expect(refs.expandAllButton()).toHaveText('Expand All');
        await expect(refs.rowCells()).toHaveText(['Alpha study 2020']);

        // A plain row: its text, and "Edit", "Delete", "Reprocess"
        // (Rules 4, 12, 15).
        let items = await refs.openRowMenu('Alpha study 2020');
        await expect(items).toHaveText(['Edit', 'Delete', 'Reprocess']);
        await refs.closeRowMenu('Alpha study 2020');

        // An empty "Edit Raw Citation": the structured form, the box
        // marked required; emptied, "Save" is refused in place; "Close"
        // leaves the row as it was (Fields & validation).
        let panel = await refs.edit('Alpha study 2020');
        await expect(panel.field('DOI')).toBeVisible();
        await expect(panel.rawRequiredMark()).toBeVisible();
        await panel.rawBox().fill('');
        await panel.saveRefused(TEXT.required);
        await panel.close();
        await expect(refs.rowCells()).toHaveText(['Alpha study 2020'], {timeout: 30_000});

        // Structured by hand: DOI, title, source, volume and one author
        // saved; the row shows the DOI link, then the title with an
        // expander; "Reprocess" is gone; the progress box reads 0/1
        // (Rules 11–15).
        panel = await refs.edit('Alpha study 2020');
        await panel.field('DOI').fill('10.1234/abcd');
        await panel.field('Title').fill('Alpha study');
        await panel.field('Source Name').fill('Journal of Tests');
        await panel.field('Volume').fill('12');
        await panel.addAuthor({givenName: 'Ada', familyName: 'Lovelace'});
        await panel.save();
        const row = refs.rows().first();
        const doiLink = row.getByRole('link', {name: '10.1234/abcd', exact: true});
        await expect(doiLink).toHaveAttribute('href', 'https://doi.org/10.1234/abcd', {timeout: 30_000});
        await expect(row.locator('td').first()).toContainText('Alpha study');
        await expect(row.getByRole('button', {name: 'Collapse'})).toBeVisible();
        await expectTopToBottom([doiLink, row.getByText('Alpha study', {exact: true})]);
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/1', {timeout: 30_000});
        items = await refs.openRowMenu('Alpha study');
        await expect(items).toHaveText(['Edit', 'Delete']);
        await refs.closeRowMenu('Alpha study');

        // The details: the author, the source, "Volume: 12" and the raw
        // text in small print (Rule 12).
        await expect(row.getByText('Lovelace Ada')).toHaveCount(0);
        await row.getByRole('button', {name: 'Collapse'}).click();
        await expect(row.getByText('Lovelace Ada')).toBeVisible({timeout: 30_000});
        await expect(row).toContainText('Journal of Tests');
        await expect(row).toContainText(/Volume:\s*12/);
        await expect(refs.rowSmallPrint('Alpha study')).toHaveText('Alpha study 2020');

        // Only the text edited: the structured details stay; the small
        // print reads the new text (Rule 14).
        panel = await refs.edit('Alpha study');
        await expect(panel.field('DOI')).toHaveValue('10.1234/abcd');
        await panel.rawBox().fill('Alpha study 2020, revised');
        await panel.save();
        await expect(doiLink).toBeVisible({timeout: 30_000});
        await expect(row.getByText('Alpha study', {exact: true})).toBeVisible();
        // The list refetches after the save, and every 7 s while the edited
        // reference is looked up again (citationManagerStore), so one read
        // of the row's state can be stale: open it and read until the text
        // holds (.reports/flake-s26/fixC/diagnosis.md).
        await expect(async () => {
            if (!(await refs.rowSmallPrint('Alpha study').isVisible())) {
                await row.getByRole('button', {name: 'Collapse'}).click({timeout: 5_000});
            }
            await expect(refs.rowSmallPrint('Alpha study')).toHaveText('Alpha study 2020, revised', {timeout: 5_000});
        }).toPass({timeout: 30_000});

        // "Arxiv" in its three forms: the bare ID, the "arxiv:" form and
        // the address are each kept as the bare ID with its version; the
        // row links it (Rule 12; Fields & validation).
        panel = await refs.edit('Alpha study');
        await panel.field('Arxiv').fill('2101.12345v2');
        await panel.save();
        await expect(row.getByRole('link', {name: '2101.12345v2', exact: true})).toBeVisible({timeout: 30_000});
        for (const typed of ['arxiv:2101.12345v2', 'https://arxiv.org/abs/2101.12345v2']) {
            panel = await refs.edit('Alpha study');
            await expect(panel.field('Arxiv')).toHaveValue('2101.12345v2');
            await panel.field('Arxiv').fill(typed);
            await panel.save();
        }
        panel = await refs.edit('Alpha study');
        await expect(panel.field('Arxiv')).toHaveValue('2101.12345v2');
        await panel.close();

        // An author's ORCID iD: another website's address and a
        // `javascript:` link are refused under the Lovelace row's box, the
        // panel staying open; closed, the row lists "Lovelace Ada" with no
        // ORCID link (Rule 12; Fields & validation).
        panel = await refs.edit('Alpha study');
        const lovelace = panel.authorRows().first();
        await expect(lovelace.locator('input[name="familyName"]')).toHaveValue('Lovelace');
        for (const refused of ['https://example.com/0000-0002-1825-0097', 'javascript:alert(1)']) {
            await lovelace.locator('input[name="orcid"]').fill(refused);
            await saveRefusedByServer(mgr.page, panel);
            await expect(lovelace.locator('.pkpFieldError'), `"${refused}"`).toHaveText([TEXT.orcidInvalid]);
            await expect(panel.dialog()).toBeVisible();
        }
        await panel.close();
        await expectAuthorsShown(refs, 'Alpha study', ['Lovelace Ada']);
        await expect(authorItem(refs, 'Alpha study', 'Lovelace Ada').getByRole('link')).toHaveCount(0);

        // A full, a sandbox and an empty "ORCID iD" saved: Lovelace and
        // Babbage each link the address typed, Somerville none (the
        // positive control of the absence above).
        panel = await refs.edit('Alpha study');
        await panel.authorRows().first().locator('input[name="orcid"]').fill(ORCID);
        await panel.addAuthor({givenName: 'Charles', familyName: 'Babbage', orcid: SANDBOX_ORCID});
        await panel.addAuthor({givenName: 'Mary', familyName: 'Somerville'});
        await panel.save();
        await expectAuthorsShown(refs, 'Alpha study', ['Lovelace Ada', 'Babbage Charles', 'Somerville Mary']);
        await expect(authorItem(refs, 'Alpha study', 'Lovelace Ada').getByRole('link')).toHaveAttribute('href', ORCID);
        await expect(authorItem(refs, 'Alpha study', 'Babbage Charles').getByRole('link')).toHaveAttribute(
            'href',
            SANDBOX_ORCID
        );
        await expect(authorItem(refs, 'Alpha study', 'Somerville Mary').getByRole('link')).toHaveCount(0);

        // "Add" with lookup on: both lines listed after the "Alpha study"
        // row; the box counts three (Rules 5, 13).
        await refs.add(['Beta trial 2021 https://doi.org/10.1234/efgh', 'Gamma report 2022']);
        await expect(refs.rows()).toHaveCount(3, {timeout: 30_000});
        await expectTopToBottom([
            refs.row('Alpha study'),
            refs.row('Beta trial 2021'),
            refs.row('Gamma report 2022'),
        ]);
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/3', {timeout: 30_000});

        // The lookup's first step: the site's background jobs run once and
        // the page is reloaded; "Beta" links the DOI written in its text
        // (Rules 11, 12, 14a).
        runJobs();
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveAttribute(
            'href',
            'https://doi.org/10.1234/efgh',
            {timeout: 30_000}
        );

        // DOIs typed by hand after the first step: "Beta"'s replaced, and
        // one typed on "Gamma", whose text holds none; each row links its
        // own (Rule 14).
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.field('DOI').fill('10.5678/hand');
        await panel.save();
        await expect(refs.rowDoiLink('Beta trial 2021', '10.5678/hand')).toBeVisible({timeout: 30_000});
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveCount(0);
        panel = await refs.edit('Gamma report 2022');
        await panel.field('DOI').fill('10.5678/gamma');
        await panel.save();
        await expect(refs.rowDoiLink('Gamma report 2022', '10.5678/gamma')).toBeVisible({timeout: 30_000});

        // "Reprocess all references": its confirmation, "OK"; the jobs run
        // once and the page is reloaded: "Beta" links the text's DOI again
        // and "Edit" holds it; "Gamma" keeps the typed one; "Alpha study"
        // keeps its DOI link and title (Rules 14a, 15).
        await refs.reprocessAllButton().click();
        const reprocessAll = refs.page.getByRole('dialog').filter({hasText: REPROCESS_ALL_QUESTION});
        await expect(reprocessAll).toBeVisible({timeout: 30_000});
        await expect(reprocessAll.getByRole('heading', {name: 'Reprocess all references', exact: true})).toBeVisible();
        await refs.confirmOk(reprocessAll, /reprocessCitationsByPublicationId$/);
        runJobs();
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toBeVisible({timeout: 30_000});
        await expect(refs.rowDoiLink('Beta trial 2021', '10.5678/hand')).toHaveCount(0);
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.close();
        await expect(refs.rowDoiLink('Gamma report 2022', '10.5678/gamma')).toBeVisible();
        await expect(refs.rowDoiLink('Alpha study', '10.1234/abcd')).toBeVisible();
        await expect(refs.row('Alpha study').getByText('Alpha study', {exact: true})).toBeVisible();

        // A lookup failed for good: the second monograph's row carries
        // "Metadata lookup failed" under its text and offers "Reprocess";
        // the box reads "0 of 1 references processed, 1 failed" with its
        // text (Rules 12, 13).
        const failedRefs = await openReferences(mgr, failed.submissionId);
        const delta = failedRefs.row('Delta paper 2023');
        await expect(delta.getByText('Metadata lookup failed', {exact: true})).toBeVisible({timeout: 30_000});
        await expectTopToBottom([
            delta.getByText('Delta paper 2023', {exact: true}),
            delta.getByText('Metadata lookup failed', {exact: true}),
        ]);
        await expect(failedRefs.progressTitle()).toHaveText('0 of 1 references processed, 1 failed');
        await expect(mgr.page.getByText(FAILED_DESCRIPTION, {exact: true})).toBeVisible();
        items = await failedRefs.openRowMenu('Delta paper 2023');
        await expect(items).toHaveText(['Edit', 'Delete', 'Reprocess']);
        await failedRefs.closeRowMenu('Delta paper 2023');

        // Control: lookup switched off: no lookup heading or text, no
        // "Reprocess all references", no "Expand All", no progress box;
        // the row shows its text alone; "Edit" offers the text box alone
        // (Settings bullet 2; Rules 3, 6).
        const settings = referencesSettings(mgr.page);
        await openMetadataSettings(mgr.page, tag);
        await expect(settings.lookup).toBeChecked();
        await settings.lookup.uncheck();
        await saveMetadataSettings(mgr.page);
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowCells()).toHaveText(
            ['Alpha study 2020, revised', 'Beta trial 2021 https://doi.org/10.1234/efgh', 'Gamma report 2022'],
            {timeout: 30_000}
        );
        await expect(refs.structuredHeadings()).toHaveCount(1);
        await expect(refs.lookupText()).toHaveCount(0);
        await expect(refs.reprocessAllButton()).toHaveCount(0);
        await expect(refs.deleteAllButton()).toBeVisible();
        await expect(refs.expandAllButton()).toHaveCount(0);
        await expect(refs.progressTitle()).toHaveCount(0);
        await expect(refs.rows().first().getByRole('link')).toHaveCount(0);
        panel = await refs.edit('Alpha study 2020, revised');
        await expect(panel.textboxes()).toHaveCount(1);
        await expect(panel.rawBox()).toHaveValue('Alpha study 2020, revised');
        await panel.close();

        // Ticked again: the DOI link and the title are back.
        await openMetadataSettings(mgr.page, tag);
        await settings.lookup.check();
        await saveMetadataSettings(mgr.page);
        refs = await openReferences(mgr, submissionId);
        const back = refs.row('Alpha study');
        await expect(back.getByRole('link', {name: '10.1234/abcd', exact: true})).toBeVisible({timeout: 30_000});
        await expect(back.getByText('Alpha study', {exact: true})).toBeVisible();
    });

});
