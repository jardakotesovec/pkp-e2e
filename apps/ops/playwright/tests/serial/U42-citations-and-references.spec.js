// @ts-check
/**
 * @file playwright/tests/serial/U42-citations-and-references.spec.js
 *
 * Citations & references — the OPS scenario that runs the site's
 * background jobs: S5, "Metadata lookup switched on". Its "let the site's
 * background jobs run once" is `runJobs()` (footnote s), which drains the
 * SHARED queue, so the test lives in the serial project (patterns.md
 * parallel lesson 7). It carries `@solo` and runs alone in the solo
 * project: its seed puts a row on Administration › "Failed Jobs" (the
 * `citationsLookup: 'failed'` key, scenarios.md), and U61's serial tests
 * read that page's total before and after an action of their own, so the
 * row must not land between their two reads. The other scenarios run in
 * tests/U42-citations-and-references.spec.js, whose header has the rest:
 * the preprint server's vocabulary (the Preprint Server Manager, the
 * "Preprint" group).
 * Spec: docs/specs/U42-citations-and-references.md
 *
 * Not covered, by register ID: A4 🐞 (the lookup text is read by its
 * opening words), A13 🐞, A14 🐞, A16 🐞, A25 🐞 (every DOI is typed after
 * the lookup's first step has run), A26 ❓.
 *
 * Seeding: a scratch preprint server with `citationsMetadataLookup: true`
 * and a throwaway manager and author; one preprint with `citationsRaw:
 * 'Alpha study 2020'`, a second with `citationsRaw: 'Delta paper 2023'` and
 * `citationsLookup: 'failed'` (footnote s). No lookup service answers on a
 * test install, so a lookup never finishes and the References page
 * refetches every 7 s while its progress box shows: every read is a
 * web-first assertion (it rides out a refetch), and row menus are retried
 * once when a refetch detaches their items (CitationsPages). The lookup
 * setting is switched off and on again on the Settings screen because
 * that screen is what the scenario's control tests.
 */
const {test, expect} = require('../../support/fixtures.js');
const {WorkflowPage} = require('../../../../../shared/playwright/pages/WorkflowPage.js');
const {
    CITATIONS_TEXT: TEXT,
    ReferencesPage,
    expectTopToBottom,
} = require('../../../../../shared/playwright/pages/CitationsPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** The failed lookup's box text (Rule 13). */
const FAILED_TEXT =
    'The metadata lookup could not be completed for some references, usually because an external service was temporarily unavailable. They are marked below - you can edit them by hand, or use Reprocess to try again.';
/** The "Reprocess all references" confirmation (Rule 15). */
const REPROCESS_ALL_QUESTION =
    "This will reprocess all references currently listed. You'll need to re-enter your manual changes again if you continue.";
/** ORCID's own example iD. */
const ORCID_ID = '0000-0002-1825-0097';

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u42${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A page as `username` with the workflow frame of `contextPath` (the "Preprint" group). */
async function pageAs(asUser, appContext, username, contextPath) {
    const page = await (await asUser(username)).newPage();
    return {page, frame: new WorkflowPage(page, contextPath, {appContext, labels: {publicationGroup: 'Preprint'}})};
}

/** Open a preprint's workflow and its "References" page. */
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

/**
 * An "Edit citation" author row by position, checked by its Family Name
 * box (the boxes have no names, A14).
 */
async function authorRow(panel, index, familyName) {
    const row = panel.authorRows().nth(index);
    await expect(row.locator('input[name="familyName"]')).toHaveValue(familyName, {timeout: 30_000});
    return row;
}

/** The ORCID iD message(s) under an author row's box. */
function orcidErrors(row) {
    return row.locator('td').filter({has: row.page().locator('input[name="orcid"]')}).locator('.pkpFieldError');
}

/** A structured row's author entry in its expanded details ("Lovelace Ada"). */
function authorEntry(row, name) {
    return row.locator('li').filter({hasText: name});
}

/** An author's ORCID link in a row's expanded details (named for a screen reader). */
function orcidLink(row, givenName, familyName) {
    return row.getByRole('link', {name: `ORCID profile for ${givenName} ${familyName}`, exact: true});
}

/**
 * Open a structured row's details when they are closed, and read until
 * `check` holds: the list refetches after a save and every 7 s while a
 * lookup is under way, so the row's state is read again on each pass.
 */
async function expectDetails(row, check) {
    await expect(async () => {
        if (!(await row.locator('.text-xs-normal').isVisible())) {
            await row.getByRole('button', {name: 'Collapse'}).click({timeout: 5_000});
        }
        await check();
    }).toPass({timeout: 30_000});
}

test.describe('citations and references (U42), background jobs — OPS', () => {
    test('S5: metadata lookup switched on @solo', async ({asUser, opsApi, appContext}, testInfo) => {
        test.slow();
        test.setTimeout(480_000);
        const tag = makeTag('s5', testInfo);
        const [manager, author] = [`${tag}mg`, `${tag}au`];
        await opsApi.createContext({
            tag,
            citationsMetadataLookup: true,
            users: [
                {username: manager, givenName: 'Mona', familyName: 'Manager', email: `${manager}@mail.test`, roles: ['manager']},
                {username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']},
            ],
        });
        const [{submissionId}, failed] = await Promise.all([
            opsApi.createSubmission({
                tag: `${tag}s`,
                context: tag,
                submitter: author,
                title: `Preprint ${tag}s`,
                citationsRaw: 'Alpha study 2020',
            }),
            opsApi.createSubmission({
                tag: `${tag}f`,
                context: tag,
                submitter: author,
                title: `Preprint ${tag}f`,
                citationsRaw: 'Delta paper 2023',
                citationsLookup: 'failed',
            }),
        ]);

        const mgr = await pageAs(asUser, appContext, manager, tag);
        let refs = await openReferences(mgr, submissionId);

        // The page with lookup on: the lookup heading and the text opening
        // "Structuring and Metadata Lookup is enabled" above the "Add" box
        // (the rest of the text is A4's), "Reprocess all references" beside
        // "Delete all references", "Expand All" heading the second column
        // (Rule 10).
        await expect(refs.structuredHeadings()).toHaveCount(2);
        await expect(refs.lookupText()).toBeVisible();
        await expectTopToBottom([refs.lookupHeading(), refs.lookupText(), refs.addBox()]);
        await expect(refs.reprocessAllButton()).toBeVisible();
        await expect(refs.deleteAllButton()).toBeVisible();
        await expect(refs.secondColumnHeader().getByRole('button', {name: 'Expand All', exact: true})).toBeVisible();
        // The progress box counts the reference whose lookup is under way
        // (Rules 11, 13).
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
        await expectDetails(row, () =>
            expect(refs.rowSmallPrint('Alpha study')).toHaveText('Alpha study 2020, revised', {timeout: 5_000})
        );

        // "Arxiv" in its three forms: the bare ID saved shows as a link;
        // each form reopens as the bare ID with its version (Rule 12;
        // Fields & validation).
        panel = await refs.edit('Alpha study');
        await panel.field('Arxiv').fill('2101.12345v2');
        await panel.save();
        await expect(row.getByRole('link', {name: '2101.12345v2', exact: true})).toHaveAttribute(
            'href',
            'https://arxiv.org/abs/2101.12345v2',
            {timeout: 30_000}
        );
        for (const typed of ['arxiv:2101.12345v2', 'https://arxiv.org/abs/2101.12345v2', null]) {
            panel = await refs.edit('Alpha study');
            await expect(panel.field('Arxiv')).toHaveValue('2101.12345v2');
            if (typed === null) {
                await panel.close();
                break;
            }
            await panel.field('Arxiv').fill(typed);
            await panel.save();
        }

        // An author's ORCID iD: another website's address and a
        // `javascript:` link refused under Lovelace's box, the panel open;
        // "Close" saves nothing, so the details carry no ORCID link
        // (Fields & validation; A22's guard).
        panel = await refs.edit('Alpha study');
        await expect(panel.authorRows()).toHaveCount(1);
        const lovelace = await authorRow(panel, 0, 'Lovelace');
        for (const refused of [`https://example.com/${ORCID_ID}`, 'javascript:alert(1)']) {
            await lovelace.locator('input[name="orcid"]').fill(refused);
            await panel.saveRefused(TEXT.orcidInvalid);
            await expect(orcidErrors(lovelace)).toHaveText([TEXT.orcidInvalid]);
        }
        await panel.close();
        await expectDetails(row, () => expect(authorEntry(row, 'Lovelace Ada')).toBeVisible({timeout: 5_000}));
        await expect(row.locator('a[href*="orcid"], a[href^="javascript"], a[href*="example.com"]')).toHaveCount(0);

        // A full and a sandbox iD saved and linked; a row with an empty box
        // saved with none (Fields & validation).
        panel = await refs.edit('Alpha study');
        await expect(panel.authorRows()).toHaveCount(1);
        await (await authorRow(panel, 0, 'Lovelace')).locator('input[name="orcid"]').fill(`https://orcid.org/${ORCID_ID}`);
        await panel.addAuthor({givenName: 'Charles', familyName: 'Babbage', orcid: `https://sandbox.orcid.org/${ORCID_ID}`});
        await panel.addAuthor({givenName: 'Mary', familyName: 'Somerville'});
        await panel.save();
        await expectDetails(row, async () => {
            await expect(orcidLink(row, 'Ada', 'Lovelace')).toHaveAttribute('href', `https://orcid.org/${ORCID_ID}`, {timeout: 5_000});
            await expect(orcidLink(row, 'Charles', 'Babbage')).toHaveAttribute('href', `https://sandbox.orcid.org/${ORCID_ID}`, {
                timeout: 5_000,
            });
            await expect(authorEntry(row, 'Somerville Mary')).toBeVisible({timeout: 5_000});
        });
        await expect(authorEntry(row, 'Lovelace Ada')).toBeVisible();
        await expect(authorEntry(row, 'Babbage Charles')).toBeVisible();
        await expect(authorEntry(row, 'Somerville Mary').getByRole('link')).toHaveCount(0);
        await expect(orcidLink(row, 'Mary', 'Somerville')).toHaveCount(0);

        // "Add" with lookup on: both listed after "Alpha study", the box
        // counting three (Rules 5, 13).
        await refs.add(['Beta trial 2021 https://doi.org/10.1234/efgh', 'Gamma report 2022']);
        await expect(refs.rowCells()).toHaveText([/Alpha study/, /Beta trial 2021/, /Gamma report 2022/], {timeout: 30_000});
        await expect(refs.progressTitle()).toHaveText('Processing references - 0/3', {timeout: 30_000});

        // The lookup's first step: the jobs run once, the page reloaded:
        // Beta's DOI is a doi.org link (Rules 11, 12).
        runJobs();
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveAttribute(
            'href',
            'https://doi.org/10.1234/efgh',
            {timeout: 30_000}
        );

        // DOIs typed by hand after the first step: each row links its
        // typed DOI (Rule 14).
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.field('DOI').fill('10.5678/hand');
        await panel.save();
        await expect(refs.rowDoiLink('Beta trial 2021', '10.5678/hand')).toHaveAttribute('href', 'https://doi.org/10.5678/hand', {
            timeout: 30_000,
        });
        panel = await refs.edit('Gamma report 2022');
        await panel.field('DOI').fill('10.5678/gamma');
        await panel.save();
        await expect(refs.rowDoiLink('Gamma report 2022', '10.5678/gamma')).toHaveAttribute(
            'href',
            'https://doi.org/10.5678/gamma',
            {timeout: 30_000}
        );

        // "Reprocess all references": its confirmation; OK, the jobs run
        // once, the page reloaded: Beta's text DOI is back, in the row and
        // in "Edit"; Gamma's typed DOI stays (its text holds none); the
        // "Alpha study" row keeps its DOI and title (Rules 14a, 15).
        await refs.reprocessAllButton().click();
        const reprocess = mgr.page.getByRole('dialog').filter({hasText: REPROCESS_ALL_QUESTION});
        await expect(reprocess).toBeVisible({timeout: 30_000});
        await expect(reprocess.getByRole('heading', {name: 'Reprocess all references', exact: true})).toBeVisible();
        await refs.confirmOk(reprocess, /reprocessCitationsByPublicationId$/);
        runJobs();
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowDoiLink('Beta trial 2021', '10.1234/efgh')).toHaveAttribute('href', 'https://doi.org/10.1234/efgh', {
            timeout: 30_000,
        });
        await expect(refs.row('Beta trial 2021').getByRole('link', {name: '10.5678/hand', exact: true})).toHaveCount(0);
        panel = await refs.edit('Beta trial 2021');
        await expect(panel.field('DOI')).toHaveValue('10.1234/efgh');
        await panel.close();
        await expect(refs.rowDoiLink('Gamma report 2022', '10.5678/gamma')).toBeVisible();
        const alpha = refs.rows().first();
        await expect(alpha.getByRole('link', {name: '10.1234/abcd', exact: true})).toBeVisible();
        await expect(alpha.getByText('Alpha study', {exact: true})).toBeVisible();

        // A lookup failed for good: the second preprint's row carries
        // "Metadata lookup failed" under its text and offers "Reprocess";
        // the box counts it failed (Rules 12, 13).
        const failedRefs = await openReferences(mgr, failed.submissionId);
        const delta = failedRefs.row('Delta paper 2023');
        await expectTopToBottom([delta.getByText('Delta paper 2023', {exact: true}), delta.getByText('Metadata lookup failed', {exact: true})]);
        items = await failedRefs.openRowMenu('Delta paper 2023');
        await expect(items).toHaveText(['Edit', 'Delete', 'Reprocess']);
        await failedRefs.closeRowMenu('Delta paper 2023');
        await expect(failedRefs.progressTitle()).toHaveText('0 of 1 references processed, 1 failed', {timeout: 30_000});
        await expect(mgr.page.getByText(FAILED_TEXT)).toBeVisible();

        // Control: lookup switched off: no lookup heading or text, no
        // "Reprocess all references", no "Expand All", no progress box;
        // the first row shows its text alone; "Edit" offers the text box
        // alone (Settings bullet 2; Rules 3, 6).
        await openMetadataSettings(mgr.page, tag);
        await expect(lookupBox(mgr.page)).toBeChecked();
        await lookupBox(mgr.page).uncheck();
        await saveMetadataSettings(mgr.page);
        refs = await openReferences(mgr, submissionId);
        await expect(refs.rowCells()).toHaveCount(3, {timeout: 30_000});
        await expect(refs.rowCells().first()).toHaveText('Alpha study 2020, revised');
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
        await lookupBox(mgr.page).check();
        await saveMetadataSettings(mgr.page);
        refs = await openReferences(mgr, submissionId);
        const back = refs.rows().first();
        await expect(back.getByRole('link', {name: '10.1234/abcd', exact: true})).toBeVisible({timeout: 30_000});
        await expect(back.getByText('Alpha study', {exact: true})).toBeVisible();
    });
});
