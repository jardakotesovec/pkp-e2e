// @ts-check
/**
 * @file playwright/tests/serial/U15-search.spec.js
 *
 * Search — OPS suite, one test per canonical scenario a preprint server runs
 * (common scenarios 1–7 in server vocabulary: "server", "preprint",
 * Preprint Server Manager, "Unpost", the "Date Posted" field on the
 * Preprint entry page, the "Downloads: … - Submitted … - Posted …" date
 * line) plus the server-specific scenario 10 (the archive header's search
 * box on the home page and on the Preprints page). Scenarios 8–9 are
 * journal-only and 11 is press-only: no OPS surface.
 * Spec: docs/specs/U15-search.md
 *
 * SERIAL PROJECT, by necessity: the search index is refreshed by a queued
 * job (Rule 12) and the fleets run with `[queues] job_runner = Off`, so a
 * seeded published preprint is findable only after `runJobs()` has drained
 * the queue — and that drain pops the SHARED queue, which is only safe in
 * the serial project (patterns.md parallel lesson 7). Every scenario that
 * expects a hit seeds through the scenario API and drains once.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register):
 * - OPS1 🐞 (the screen-reader count always says "Found one item."): the
 *   hidden status line is never asserted, in any scenario.
 * - A1 🐞 (a year-only or year+month filter is ignored and the selects then
 *   lie): S7 chooses Year, Month and Day every time; the partial choice is
 *   not exercised.
 * - A2 ❓ (Published Before leaves out the chosen day): S7 filters on the
 *   10th, which neither preprint carries, so neither reading is frozen.
 * - A4 ❓ (results come in no particular order): results are matched by
 *   title, never by position.
 * - A6 ❓ (the bare page lists everything): the bare Search page's list is
 *   not asserted either way; S1 asserts only that its box opens empty.
 * - A3 🐞 / A7 ❓ (post-publication edits and superseded versions): no
 *   scenario edits a published preprint or adds a version.
 * - A11 🐞 (galley text is never searched): seeded preprints carry no
 *   files; S1 asserts only that a result shows no galley links.
 * - OPS2 ❓ (the server's does-not-post gate cannot be reached): not
 *   exercised; visitors and the Manager get the page (S4 covers the
 *   signed-in side as Rule 15 describes it).
 * - OPS3 🐞 (the rebuild tool ignores the server path) and Rule 14's
 *   address-only refinements: no screen, no scenario.
 * - Rule 10 (site-wide search) and A10 ❓: scenario 8 is journal-only.
 *
 * Seeding: scenario endpoints only (a scratch server per test, with its own
 * throwaway Manager and Author; passwords are the username twice). Search
 * words are random, letters-only, and start with distinct letters, so none
 * is a stem or prefix of another and none survives from an earlier run on
 * the long-lived database. A visitor is the file's anonymous `page`; the
 * Manager comes from `asUser`. Waits are event-based (the form's own
 * navigation response, the publish/unpublish API responses, web-first
 * assertions) — no hard-coded sleeps.
 */
const {test, expect} = require('../../support/fixtures.js');
const {SearchPage, ArchiveHeaderSearch} = require('../../pages/SearchPages.js');
const {
    PublicationScreen,
    openWorkflow,
    postPreprint,
    unpostPreprint,
} = require('../../pages/PublicationPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

// Every `page` in this file is a visitor: no cookies, whatever the worker's
// auth cache holds (patterns.md parallel lesson 8).
test.use({storageState: {cookies: [], origins: []}});

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker + random. */
function makeTag(scenario, testInfo) {
    return `u15${scenario}opsw${testInfo.parallelIndex}${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6)}`;
}

/**
 * Made-up search words: letters only, random per run, each starting with a
 * different letter, so no word is a stem or a prefix of another (the engine
 * stems, and a long-lived database keeps earlier runs' content).
 */
function makeWords(count) {
    const initials = 'bdfgkmnprstvz';
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const words = [];
    for (let i = 0; i < count; i++) {
        let word = initials[i];
        for (let j = 0; j < 7; j++) {
            word += letters[Math.floor(Math.random() * letters.length)];
        }
        words.push(word);
    }
    return words;
}

/** The scratch server's Manager and submitting Author. */
function contextUsers(tag, {authorFamilyName = 'Author'} = {}) {
    return [
        {
            username: `${tag}mg`,
            givenName: 'Mona',
            familyName: 'Manager',
            email: `${tag}mg@mail.test`,
            roles: ['manager'],
        },
        {
            username: `${tag}au`,
            givenName: 'Ada',
            familyName: authorFamilyName,
            email: `${tag}au@mail.test`,
            roles: ['author'],
        },
    ];
}

/**
 * The date line of a result on a server (fn-f): downloads, then the two
 * dates. The template puts line breaks around the "-" divider, and a regex
 * expectation sees the raw text, so the divider's whitespace is tolerated.
 */
const DATE_LINE = /Downloads: 0\s*-\s*Submitted \d{4}-\d{2}-\d{2} - Posted \d{4}-\d{2}-\d{2}/;

/**
 * Open the workflow straight onto a version's Preprint entry page (the side
 * menu mirrors its selection into `workflowMenuKey`).
 */
async function openPreprintEntry(page, contextPath, submissionId, publicationId) {
    await page.goto(
        `/index.php/${contextPath}/dashboard/editorial?workflowSubmissionId=${submissionId}&workflowMenuKey=publication_${publicationId}_preprintEntry`
    );
    await expect(page.getByRole('heading', {name: 'Preprint: Preprint entry'})).toBeVisible({
        timeout: 30_000,
    });
}

test.describe('Search (U15)', () => {
    test('S1: find a preprint by a word in its title', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const [wordA, wordB] = makeWords(2);
        const titleA = `Notes on ${wordA}`;
        const titleB = `Notes on ${wordB}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title: titleA,
            published: true,
        });
        await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: `${tag}au`,
            title: titleB,
            published: true,
        });
        runJobs();

        // From the server's home page, the header's "Search" link opens the
        // page "Search" with an empty box (Rule 1).
        const search = new SearchPage(page, tag);
        await page.goto(`/index.php/${tag}`);
        await search.openFromHeader();
        await expect(search.queryBox()).toHaveValue('');
        await expect(search.headerSearchLink()).toHaveCount(0);

        // The word from one title lists exactly that preprint: title,
        // contributors, date line, no galley links; the other is absent
        // (Rules 3, 6).
        await search.search(wordA);
        await expect(search.result(titleA)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.result(titleB)).toHaveCount(0);
        await expect(search.resultAuthors(titleA)).toContainText('Ada Author');
        await expect(search.resultDetails(titleA)).toHaveText(DATE_LINE);
        await expect(search.resultGalleyLinks(titleA)).toHaveCount(0);

        // The title opens the preprint's landing page; Back returns to the
        // Search page with the word still in the box.
        await search.resultTitleLink(titleA).click();
        await expect(page.getByRole('heading', {name: titleA})).toBeVisible({timeout: 30_000});
        expect(page.url()).toContain(`/${tag}/preprint/view/${submissionId}`);
        await page.goBack();
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(wordA);
    });

    test('S2: abstract and contributor names are searched too', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const [wordTitle, wordAbstract, wordFamily, wordOther] = makeWords(4);
        const familyName = wordFamily[0].toUpperCase() + wordFamily.slice(1);
        const titleA = `Notes on ${wordTitle}`;
        const titleB = `Notes on ${wordOther}`;
        await opsApi.createContext({
            tag,
            users: [
                ...contextUsers(tag, {authorFamilyName: familyName}),
                {
                    username: `${tag}bu`,
                    givenName: 'Bea',
                    familyName: 'Other',
                    email: `${tag}bu@mail.test`,
                    roles: ['author'],
                },
            ],
        });
        await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title: titleA,
            abstract: `A seeded abstract that mentions ${wordAbstract} once.`,
            published: true,
        });
        await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: `${tag}bu`,
            title: titleB,
            published: true,
        });
        runJobs();

        const search = new SearchPage(page, tag);
        await search.goto();

        // A word that appears only in one preprint's abstract (Rule 3).
        await search.search(wordAbstract);
        await expect(search.result(titleA)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);

        // The made-up family name of one preprint's contributor (Rule 3).
        await search.search(familyName);
        await expect(search.result(titleA)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.resultAuthors(titleA)).toContainText(familyName);

        // The title word typed all in capitals (Rule 4: case does not matter).
        await search.search(wordTitle.toUpperCase());
        await expect(search.result(titleA)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.result(titleB)).toHaveCount(0);
    });

    test('S3: nothing found', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const [wordHit, wordNowhere] = makeWords(2);
        const title = `Notes on ${wordHit}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });
        runJobs();

        const search = new SearchPage(page, tag);
        await search.goto();

        // Positive control, same way: the title word finds the preprint.
        await search.search(wordHit);
        await expect(search.result(title)).toHaveCount(1);
        await expect(search.noResultsNotice()).toHaveCount(0);

        // A word that appears nowhere: an empty list and "No Results" (Rule 7).
        await search.search(wordNowhere);
        await expect(search.noResultsNotice()).toBeVisible({timeout: 30_000});
        await expect(search.results()).toHaveCount(0);
        await expect(search.pagination()).toHaveCount(0);
    });

    test('S4: only published preprints are found', async ({page, opsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const [word] = makeWords(1);
        const publishedTitle = `Notes on ${word}`;
        const draftTitle = `Draft on ${word}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title: publishedTitle,
            published: true,
        });
        await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: `${tag}au`,
            title: draftTitle,
            submitted: true,
            published: false,
        });
        runJobs();

        // A visitor: only the published preprint; the never-published
        // submission with the same word is absent (Rule 2), bounded by the
        // published hit listed the same way.
        const visitorSearch = new SearchPage(page, tag);
        await visitorSearch.goto();
        await visitorSearch.search(word);
        await expect(visitorSearch.result(publishedTitle)).toHaveCount(1);
        await expect(visitorSearch.results()).toHaveCount(1);
        await expect(visitorSearch.result(draftTitle)).toHaveCount(0);

        // The server's Preprint Server Manager, signed in: the same one
        // preprint, and still not the unpublished submission (Rule 15).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const managerSearch = new SearchPage(managerPage, tag);
        await managerSearch.goto();
        await managerSearch.search(word);
        await expect(managerSearch.result(publishedTitle)).toHaveCount(1);
        await expect(managerSearch.results()).toHaveCount(1);
        await expect(managerSearch.result(draftTitle)).toHaveCount(0);
    });

    test('S5: unposting removes, reposting restores', async ({page, opsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const [word] = makeWords(1);
        const title = `Notes on ${word}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId} = await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });
        runJobs();

        // Listed while posted.
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await expect(search.result(title)).toHaveCount(1);

        // The Manager opens the preprint's workflow, its Publication area
        // ("Preprint" group, Title & Abstract page) and presses "Unpost" at
        // the top right (Rule 12; the flow is U49's).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        await openWorkflow(managerPage, tag, submissionId);
        const screen = new PublicationScreen(managerPage);
        await screen.openPage('Title & Abstract');
        await expect(
            managerPage
                .locator('[data-cy="workflow-controls-right"]')
                .getByRole('button', {name: 'Unpost', exact: true})
        ).toBeVisible({timeout: 30_000});
        await unpostPreprint(managerPage);

        // A visitor searching the word now gets "No Results", with no queue
        // run in between (the listing above is the same-way control).
        await search.search(word);
        await expect(search.noResultsNotice()).toBeVisible({timeout: 30_000});
        await expect(search.results()).toHaveCount(0);

        // Post it again: still "No Results" until the background jobs run;
        // once they have run, it is listed again.
        await postPreprint(managerPage);
        await search.search(word);
        await expect(search.noResultsNotice()).toBeVisible({timeout: 30_000});
        await expect(search.results()).toHaveCount(0);
        runJobs();
        await search.search(word);
        await expect(search.result(title)).toHaveCount(1);
        await expect(search.noResultsNotice()).toHaveCount(0);
    });

    test('S6: paging through a long list', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s6', testInfo);
        const [word] = makeWords(1);
        await opsApi.createContext({tag, users: contextUsers(tag)});
        for (let i = 1; i <= 27; i++) {
            await opsApi.createSubmission({
                tag: `${tag}p${i}`,
                context: tag,
                submitter: `${tag}au`,
                title: `Notes on ${word} part ${i}`,
                published: true,
            });
        }
        runJobs();

        // Page 1: 25 preprints, "1 - 25 of 27 items", links "2", ">" and
        // ">>"; the current "1" is plain text (Rule 8).
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await expect(search.results()).toHaveCount(25);
        await expect(search.pagination()).toContainText('1 - 25 of 27 items');
        await expect(search.pageLink('2')).toBeVisible();
        await expect(search.pageLink('>')).toBeVisible();
        await expect(search.pageLink('>>')).toBeVisible();
        await expect(search.currentPageNumber(1)).toBeVisible();
        await expect(search.pageLink('1')).toHaveCount(0);
        await expect(search.pageLink('<')).toHaveCount(0);
        await expect(search.pageLink('<<')).toHaveCount(0);

        // Page 2: the remaining 2, "26 - 27 of 27 items", links "<<", "<"
        // and "1"; the box still holds the word.
        await search.gotoPage('2');
        await expect(search.results()).toHaveCount(2);
        await expect(search.pagination()).toContainText('26 - 27 of 27 items');
        await expect(search.pageLink('<<')).toBeVisible();
        await expect(search.pageLink('<')).toBeVisible();
        await expect(search.pageLink('1')).toBeVisible();
        await expect(search.currentPageNumber(2)).toBeVisible();
        await expect(search.pageLink('2')).toHaveCount(0);
        await expect(search.pageLink('>')).toHaveCount(0);
        await expect(search.pageLink('>>')).toHaveCount(0);
        await expect(search.queryBox()).toHaveValue(word);
    });

    test('S7: narrow by publication date', async ({page, opsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const [word] = makeWords(1);
        const titleFirst = `Notes on ${word} first day`;
        const titleFifteenth = `Notes on ${word} fifteenth day`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const first = await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title: titleFirst,
        });
        const fifteenth = await opsApi.createSubmission({
            tag: `${tag}b`,
            context: tag,
            submitter: `${tag}au`,
            title: titleFifteenth,
        });

        // Setup, not under test: the Manager sets "Date Posted" on each
        // preprint's Preprint entry page (the API has no date key), then
        // posts it; a past date is kept as the posted date (U49 Rule 8).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const screen = new PublicationScreen(managerPage);
        for (const [seed, date] of [
            [first, '2024-06-01'],
            [fifteenth, '2024-06-15'],
        ]) {
            await openPreprintEntry(managerPage, tag, seed.submissionId, seed.publicationId);
            const dateInput = screen.input('issueEntry', 'datePublished');
            await expect(dateInput).toBeVisible({timeout: 30_000});
            await dateInput.fill(date);
            await screen.save();
            await postPreprint(managerPage);
        }
        runJobs();

        // Without a filter, both are listed, with their posted dates.
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await expect(search.result(titleFirst)).toHaveCount(1);
        await expect(search.result(titleFifteenth)).toHaveCount(1);
        await expect(search.results()).toHaveCount(2);
        await expect(search.resultDetails(titleFirst)).toContainText('Posted 2024-06-01');
        await expect(search.resultDetails(titleFifteenth)).toContainText('Posted 2024-06-15');

        // "Published After" the 10th (Year, Month and Day all chosen): only
        // the 15th's preprint, and the selects still show the 10th (Rule 9).
        await search.setDate('dateFrom', {year: 2024, month: 'Jun', day: 10});
        await search.submit();
        await expect(search.result(titleFifteenth)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.result(titleFirst)).toHaveCount(0);
        await search.expectDate('dateFrom', {year: 2024, month: 'Jun', day: 10});
        await search.expectDateBlank('dateTo');
        await expect(search.queryBox()).toHaveValue(word);

        // Published After back to blank, "Published Before" the 10th: only
        // the 1st's preprint.
        await search.clearDate('dateFrom');
        await search.setDate('dateTo', {year: 2024, month: 'Jun', day: 10});
        await search.submit();
        await expect(search.result(titleFirst)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.result(titleFifteenth)).toHaveCount(0);
        await search.expectDate('dateTo', {year: 2024, month: 'Jun', day: 10});
        await search.expectDateBlank('dateFrom');
    });

    test('S10: search from the archive header', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s10', testInfo);
        const [word] = makeWords(1);
        const title = `Notes on ${word}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        await opsApi.createSubmission({
            tag: `${tag}a`,
            context: tag,
            submitter: `${tag}au`,
            title,
            published: true,
        });
        runJobs();

        const archive = new ArchiveHeaderSearch(page, tag);
        const search = new SearchPage(page, tag);

        // The home page's archive header: an empty box and a "Search"
        // button; submitting opens the Search page with the word in its box
        // and the one preprint, its date line reading "Downloads: 0 -
        // Submitted {date} - Posted {date}" (Rule 17).
        await archive.gotoHome();
        await expect(archive.queryBox()).toHaveValue('');
        await expect(archive.searchButton()).toBeVisible();
        await archive.search(word);
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(word);
        await expect(search.result(title)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.resultDetails(title)).toHaveText(DATE_LINE);

        // The same box and button at the top of the Preprints page behave
        // the same way.
        await archive.gotoPreprints();
        await expect(archive.queryBox()).toHaveValue('');
        await expect(archive.searchButton()).toBeVisible();
        await archive.search(word);
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(word);
        await expect(search.result(title)).toHaveCount(1);
        await expect(search.results()).toHaveCount(1);
        await expect(search.resultDetails(title)).toHaveText(DATE_LINE);
    });
});
