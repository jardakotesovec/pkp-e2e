// @ts-check
/**
 * @file playwright/tests/serial/U42-citations-and-references.spec.js
 *
 * Citations & references — OJS suite, the serial part: scenario 5,
 * "Metadata lookup switched on". Scenarios 1–4 and 6–9 are in
 * ../U42-citations-and-references.spec.js, whose header lists what the
 * suite deliberately does not cover.
 * Spec: docs/specs/U42-citations-and-references.md
 *
 * Why serial (footnote s, scenario 5): the scenario lets the site's
 * background jobs run twice (Rule 14a: the lookup's first step), and
 * runJobs() drains the SHARED queue, which is only safe in the serial
 * project (PRINCIPLES A9; patterns.md parallel lesson 7). Why `@solo`: its
 * second submission is seeded with `citationsLookup: 'failed'`, which
 * leaves one row on the fleet's Failed Jobs list (scenarios.md
 * "citationsLookup"), whose total U61's serial tests read before and after
 * a "Try Again" and a "Delete"; alone in the `ojs-solo` project it never
 * moves that total under them (harness.md "Project chain").
 *
 * Seeding: a scratch journal with `citationsMetadataLookup: true` and
 * throwaway accounts (the username twice as password); one submission
 * with `citationsRaw: 'Alpha study 2020'`, a second with `citationsRaw:
 * 'Delta paper 2023'` and `citationsLookup: 'failed'`. The lookup is
 * switched off and on again on the Settings screen because that screen is
 * what the scenario's control tests. No job runner otherwise and no
 * outbound connection, so a lookup never finishes and the References page
 * refetches every 7 s while the progress box counts below its total;
 * every read after that is a web-first assertion, and row menus are
 * retried once when a refetch detaches their items (CitationsPages).
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6).
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
const BETA = 'Beta trial 2021 https://doi.org/10.1234/efgh';
const GAMMA = 'Gamma report 2022';
const FAILED_TEXT =
    'The metadata lookup could not be completed for some references, usually because an external service was temporarily unavailable. They are marked below - you can edit them by hand, or use Reprocess to try again.';
const REPROCESS_ALL_QUESTION =
    "This will reprocess all references currently listed. You'll need to re-enter your manual changes again if you continue.";

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u42${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** Settings › Workflow › Submission › "Metadata", loaded. */
async function openMetadataSettings(page, contextPath) {
    await page.goto(`/index.php/${contextPath}/management/settings/workflow`);
    await page.locator('#metadata-button').click();
    await expect(page.getByRole('checkbox', {name: 'Enable references metadata', exact: true})).toBeVisible({
        timeout: 30_000,
    });
}

/** The Metadata screen's lookup box. */
function lookupBox(page) {
    return page.getByRole('checkbox', {name: 'Enable references structuring and metadata lookup', exact: true});
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

/** Open a submission's workflow and its "References" page. */
async function openReferences(page, frame, submissionId) {
    await frame.gotoEditorial(submissionId);
    const refs = new ReferencesPage(page, frame);
    await refs.open();
    return refs;
}

/**
 * Open a structured row's details and keep them open: the list refetches
 * after a save and every 7 s while a lookup is under way, so the read is
 * repeated until the small print shows (the expander is named "Collapse"
 * in both states, A16, and pressed with the mouse only).
 */
async function expandRow(refs, text) {
    await expect(async () => {
        if (!(await refs.rowSmallPrint(text).isVisible())) {
            await refs.rowExpander(text).click({timeout: 5_000});
        }
        await expect(refs.rowSmallPrint(text)).toBeVisible({timeout: 5_000});
    }).toPass({timeout: 30_000});
}

/** An author in a structured row's open details ("{family} {given}"). */
function detailsAuthor(refs, text, name) {
    return refs.row(text).locator('li').filter({hasText: name});
}

/** The messages under the ORCID iD box of the panel's `index`th author row. */
function authorOrcidMessages(panel, index) {
    return panel
        .authorRows()
        .nth(index)
        .locator('td')
        .filter({has: panel.page.locator('input[name="orcid"]')})
        .locator('.pkpFieldError__message');
}

test.describe('citations and references (serial)', () => {
    test('S5: metadata lookup switched on @solo', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(480_000);
        const tag = makeTag('s5', testInfo);
        const manager = `${tag}mg`;
        const author = `${tag}au`;
        await ojsApi.createContext({
            tag,
            users: [user(manager, 'Mona', 'Manager', ['manager']), user(author, 'Ada', 'Author', ['author'])],
            citationsMetadataLookup: true,
        });
        const [{submissionId}, failed] = await Promise.all([
            ojsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}s`,
                citationsRaw: 'Alpha study 2020',
            }),
            ojsApi.createSubmission({
                tag: `${tag}f`,
                context: tag,
                submitter: author,
                title: `Submission ${tag}f`,
                citationsRaw: 'Delta paper 2023',
                citationsLookup: 'failed',
            }),
        ]);

        const page = await (await asUser(manager)).newPage();
        const frame = new WorkflowPage(page, tag);
        let refs = await openReferences(page, frame, submissionId);

        // The page with lookup on: the lookup heading and text above the
        // "Add" box, "Reprocess all references" beside "Delete all
        // references", "Expand All" heading the second column (Rule 10).
        await expect(refs.structuredHeadings()).toHaveCount(2);
        await expect(refs.lookupText()).toHaveText(TEXT.lookupText);
        await expectTopToBottom([refs.lookupHeading(), refs.lookupText(), refs.addBox()]);
        await expect(refs.reprocessAllButton()).toBeVisible();
        await expect(refs.deleteAllButton()).toBeVisible();
        await expect(refs.secondColumnHeader().getByRole('button', {name: 'Expand All', exact: true})).toBeVisible();
        // The progress box: the one reference came in with lookup on, so
        // its lookup is under way (Rules 11, 13).
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
        const row = refs.row('Alpha study');
        const doiLink = row.getByRole('link', {name: '10.1234/abcd', exact: true});
        await expect(doiLink).toHaveAttribute('href', 'https://doi.org/10.1234/abcd', {timeout: 30_000});
        await expect(row.locator('td').first()).toContainText('Alpha study');
        await expect(refs.rowExpander('Alpha study')).toBeVisible();
        await expectTopToBottom([doiLink, row.getByText('Alpha study', {exact: true})]);
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/1', {timeout: 30_000});
        items = await refs.openRowMenu('Alpha study');
        await expect(items).toHaveText(['Edit', 'Delete']);
        await refs.closeRowMenu('Alpha study');

        // The details: the author, the source, "Volume: 12" and the raw
        // text in small print (Rule 12).
        await expect(row.getByText('Lovelace Ada')).toHaveCount(0);
        await expandRow(refs, 'Alpha study');
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
        await expect(async () => {
            await expandRow(refs, 'Alpha study');
            await expect(refs.rowSmallPrint('Alpha study')).toHaveText('Alpha study 2020, revised', {timeout: 5_000});
        }).toPass({timeout: 30_000});

        // "Arxiv" in its three forms: the bare ID linked from the row and
        // kept with its version; "arxiv:…" and the arxiv.org address each
        // kept as the bare ID (Rule 12; Fields & validation).
        for (const typed of ['2101.12345v2', 'arxiv:2101.12345v2', 'https://arxiv.org/abs/2101.12345v2']) {
            panel = await refs.edit('Alpha study');
            await panel.field('Arxiv').fill(typed);
            await panel.save();
            await expect(row.getByRole('link', {name: '2101.12345v2', exact: true}), `"${typed}" linked`).toBeVisible({
                timeout: 30_000,
            });
            panel = await refs.edit('Alpha study');
            await expect(panel.field('Arxiv'), `"${typed}" kept`).toHaveValue('2101.12345v2');
            await panel.close();
        }

        // An author's ORCID iD: another website's address and a
        // `javascript:` link refused under the row's box, the panel open;
        // closed, the details list Ada with no ORCID link. A full iD for
        // Ada, a sandbox iD for Babbage and none for Somerville saved: the
        // first two linked to the address typed, the third not (Rule 12;
        // Fields & validation).
        panel = await refs.edit('Alpha study');
        await expect(panel.authorRows()).toHaveCount(1);
        const adaOrcid = panel.authorRows().nth(0).locator('input[name="orcid"]');
        await adaOrcid.fill('https://example.com/0000-0002-1825-0097');
        await panel.saveRefused(TEXT.orcidInvalid);
        await expect(authorOrcidMessages(panel, 0)).toHaveText([TEXT.orcidInvalid]);
        await adaOrcid.fill('javascript:alert(1)');
        await panel.saveRefused(TEXT.orcidInvalid);
        await expect(authorOrcidMessages(panel, 0)).toHaveText([TEXT.orcidInvalid]);
        await panel.close();
        await expandRow(refs, 'Alpha study');
        await expect(detailsAuthor(refs, 'Alpha study', 'Lovelace Ada')).toBeVisible();
        await expect(detailsAuthor(refs, 'Alpha study', 'Lovelace Ada').locator('a')).toHaveCount(0);

        panel = await refs.edit('Alpha study');
        await panel.authorRows().nth(0).locator('input[name="orcid"]').fill(ORCID);
        await panel.addAuthor({givenName: 'Charles', familyName: 'Babbage', orcid: SANDBOX_ORCID});
        await panel.addAuthor({givenName: 'Mary', familyName: 'Somerville'});
        await panel.save();
        await expandRow(refs, 'Alpha study');
        await expect(detailsAuthor(refs, 'Alpha study', 'Somerville Mary')).toBeVisible({timeout: 30_000});
        await expect(detailsAuthor(refs, 'Alpha study', 'Lovelace Ada').locator('a')).toHaveAttribute('href', ORCID);
        await expect(detailsAuthor(refs, 'Alpha study', 'Babbage Charles').locator('a')).toHaveAttribute('href', SANDBOX_ORCID);
        await expect(detailsAuthor(refs, 'Alpha study', 'Somerville Mary').locator('a')).toHaveCount(0);

        // "Add" with lookup on: both listed after the "Alpha study" row; the
        // box counts the three (Rules 5, 13).
        await refs.add([BETA, GAMMA]);
        await expect(refs.rows()).toHaveCount(3, {timeout: 30_000});
        await expect(refs.rowCells().nth(0)).toContainText('Alpha study');
        await expect(refs.rowCells().nth(1)).toHaveText(BETA);
        await expect(refs.rowCells().nth(2)).toHaveText(GAMMA);
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/3', {timeout: 30_000});

        // The lookup's first step: the site's background jobs run once and
        // the page reloaded: "Beta trial 2021" links the DOI in its text
        // (Rules 11, 12, 14a).
        await expect(refs.row('Beta trial 2021').getByRole('link')).toHaveCount(0);
        runJobs();
        refs = await openReferences(page, frame, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveAttribute(
            'href',
            'https://doi.org/10.1234/efgh',
            {timeout: 30_000}
        );

        // DOIs typed by hand after the first step: Beta's replaced by
        // "10.5678/hand", Gamma's "10.5678/gamma" typed; each row links its
        // typed DOI (Rule 14).
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.field('DOI').fill('10.5678/hand');
        await panel.save();
        await expect(refs.rowDoiLink('Beta trial 2021', '10.5678/hand')).toBeVisible({timeout: 30_000});
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveCount(0);
        panel = await refs.edit(GAMMA);
        await panel.field('DOI').fill('10.5678/gamma');
        await panel.save();
        await expect(refs.rowDoiLink(GAMMA, '10.5678/gamma')).toHaveAttribute('href', 'https://doi.org/10.5678/gamma', {
            timeout: 30_000,
        });

        // "Reprocess all references": its confirmation; "OK"; the jobs run
        // once and the page reloaded: Beta links the DOI of its text again
        // and "Edit" shows it; Gamma, whose text holds none, keeps its
        // typed DOI; Alpha keeps its DOI link and title (Rules 14a, 15).
        await refs.reprocessAllButton().click();
        const reprocess = page.getByRole('dialog').filter({hasText: REPROCESS_ALL_QUESTION});
        await expect(reprocess).toBeVisible({timeout: 30_000});
        await expect(reprocess.getByRole('heading', {name: 'Reprocess all references', exact: true})).toBeVisible();
        await refs.confirmOk(reprocess, /reprocessCitationsByPublicationId$/);
        runJobs();
        refs = await openReferences(page, frame, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveAttribute(
            'href',
            'https://doi.org/10.1234/efgh',
            {timeout: 30_000}
        );
        await expect(refs.rowDoiLink('Beta trial 2021', '10.5678/hand')).toHaveCount(0);
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.close();
        await expect(refs.rowDoiLink(GAMMA, '10.5678/gamma')).toBeVisible({timeout: 30_000});
        await expect(refs.rowDoiLink('Alpha study', '10.1234/abcd')).toBeVisible();
        await expect(refs.row('Alpha study').getByText('Alpha study', {exact: true})).toBeVisible();

        // A lookup failed for good: the second submission's row carries
        // "Metadata lookup failed" under its text and offers "Reprocess";
        // the box reads "0 of 1 references processed, 1 failed" with its
        // text (Rules 12, 13).
        const failedRefs = await openReferences(page, frame, failed.submissionId);
        const delta = failedRefs.row('Delta paper 2023');
        await expectTopToBottom([delta.getByText('Delta paper 2023', {exact: true}), delta.getByText('Metadata lookup failed', {exact: true})]);
        items = await failedRefs.openRowMenu('Delta paper 2023');
        await expect(items).toHaveText(['Edit', 'Delete', 'Reprocess']);
        await failedRefs.closeRowMenu('Delta paper 2023');
        await expect(failedRefs.progressTitle()).toHaveText('0 of 1 references processed, 1 failed', {timeout: 30_000});
        await expect(page.getByText(FAILED_TEXT, {exact: true})).toBeVisible();
        // (The positive control of the badge: the first submission's rows,
        // read the same way, carry none.)
        refs = await openReferences(page, frame, submissionId);
        await expect(refs.rows()).toHaveCount(3, {timeout: 30_000});
        await expect(refs.table().getByText('Metadata lookup failed')).toHaveCount(0);

        // Control: lookup switched off: no lookup heading or text, no
        // "Reprocess all references", no "Expand All", no progress box;
        // the first row shows its text alone; "Edit" offers the text box
        // alone (Settings bullet 2; Rules 3, 6).
        await openMetadataSettings(page, tag);
        await expect(lookupBox(page)).toBeChecked();
        await lookupBox(page).uncheck();
        await saveMetadataSettings(page);
        refs = await openReferences(page, frame, submissionId);
        await expect(refs.rowCells()).toHaveText(['Alpha study 2020, revised', BETA, GAMMA], {timeout: 30_000});
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
        await openMetadataSettings(page, tag);
        await lookupBox(page).check();
        await saveMetadataSettings(page);
        refs = await openReferences(page, frame, submissionId);
        const back = refs.rows().first();
        await expect(back.getByRole('link', {name: '10.1234/abcd', exact: true})).toBeVisible({timeout: 30_000});
        await expect(back.getByText('Alpha study', {exact: true})).toBeVisible();
    });
});
