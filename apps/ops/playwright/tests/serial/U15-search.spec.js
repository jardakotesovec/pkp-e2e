// @ts-check
/**
 * @file playwright/tests/serial/U15-search.spec.js
 *
 * Search — OPS suite, one test per canonical scenario a preprint server runs
 * (common scenarios 1–7 and 12 in server vocabulary: "server", "preprint",
 * Preprint Server Manager, "Unpost", the "Date Posted" field on the
 * Preprint entry page, the "Downloads: … - Submitted … - Posted …" date
 * line, the Production stage as the one a preprint is posted from) plus the
 * server-specific scenario 10 (the archive header's search box on the home
 * page and on the Preprints page). Scenarios 8–9 are journal-only and 11 is
 * press-only: no OPS surface.
 * Spec: docs/specs/U15-search.md
 *
 * SERIAL PROJECT, by necessity: the search index is refreshed by a queued
 * job (Rule 12) and the fleets run with `[queues] job_runner = Off`, so a
 * seeded posted preprint is findable only after `runJobs()` has drained
 * the queue — and that drain pops the SHARED queue, which is only safe in
 * the serial project (patterns.md parallel lesson 7). Every scenario that
 * expects a hit seeds through the scenario API and drains once.
 *
 * Deliberately NOT covered (register IDs from the spec's Findings
 * register — a 🐞 is never asserted as the contract, a ❓ is parked, not a
 * gap): A1 🐞, A2 ❓, A3 🐞, A4 ❓, A5 ❓, A6 ❓, A7 ❓, A8 ❓, A9 🐞, A10 🐞,
 * A11 🐞, A12 🐞, A13 🐞, A14 🐞, A15 🐞, A16 ❓, OPS1 🐞 (S1 reads the
 * single-hit status line only, whose text is right; the plural is never
 * read), OPS2 ❓, OPS3 🐞, OPS4 🐞 (S12 asserts the declined preprint's
 * listing and its title's address, never the "404 Not Found" the title
 * opens). The spec's Coverage section records everything else left out.
 *
 * Seeding: scenario endpoints only (a scratch server per test, with its own
 * throwaway Manager and Author; passwords are the username twice). Search
 * words are random, letters-only, of one length, and start with distinct
 * letters, so none is a stem or prefix of another and none survives from
 * an earlier run on the long-lived database. A visitor is the file's
 * anonymous `page`; the Manager comes from `asUser`. Waits are event-based
 * (the form's own navigation response, the publish/unpublish API responses,
 * web-first assertions) — no hard-coded sleeps. Mailpit is one shared
 * instance, so S1's mail read is scoped to this scratch server's throwaway
 * addresses. The suite runs with TZ=UTC, the PHP servers' clock (S6's
 * "current year").
 */
const {test, expect} = require('../../support/fixtures.js');
const {SearchPage, ArchiveHeaderSearch} = require('../../pages/SearchPages.js');
const {
    PublicationScreen,
    openWorkflow,
    postPreprint,
    unpostPreprint,
} = require('../../pages/PublicationPages.js');
const {DecisionPage} = require('../../pages/DecisionPage.js');
const {WorkflowPage} = require('../../../../../shared/playwright/pages/WorkflowPage.js');
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
    test('S1: find a preprint by a word in its title', async ({page, opsApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const [wordA, wordB] = makeWords(2);
        const titleA = `Notes on ${wordA}`;
        const titleB = `Notes on ${wordB}`;
        const users = contextUsers(tag);
        await opsApi.createContext({tag, users});
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
        // contributors, date line, no galley links (Rules 3, 6).
        await search.search(wordA);
        await search.expectOnlyResult(titleA);
        await expect(search.resultAuthors(titleA)).toContainText('Ada Author');
        await expect(search.resultDetails(titleA)).toHaveText(DATE_LINE);
        await expect(search.resultGalleyLinks(titleA)).toHaveCount(0);

        // Under the list: "1 - 1 of 1 items" and no page links, the list
        // being a single page (Rules 7, 8; S6 reads the links a two-page
        // list offers, the shape of this control).
        await expect(search.pagination()).toContainText('1 - 1 of 1 items');
        await expect(search.pageLinks()).toHaveCount(0);

        // The status line only a screen reader shows (Rule 7), read from the
        // element's text: "Found one item." on the single hit (the text OPS1
        // gets wrong on a longer list is never read).
        await expect(search.statusLine()).toHaveText('Found one item.');

        // Control: the other preprint is absent from the list.
        await expect(search.result(titleB)).toHaveCount(0);

        // The title opens the preprint's landing page; Back returns to the
        // Search page with the word still in the box.
        await search.resultTitleLink(titleA).click();
        await expect(page.getByRole('heading', {name: titleA})).toBeVisible({timeout: 30_000});
        expect(page.url()).toContain(`/${tag}/preprint/view/${submissionId}`);
        await page.goBack();
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(wordA);

        // The mail catcher holds no email from the searches (Side effects):
        // read scoped to this scratch server's throwaway addresses once the
        // searches' page loads have answered. Seeding sends no mail
        // (Mail::fake), so nothing else could have written to them.
        for (const {email} of users) {
            expect(await pkpMail.count({to: email})).toBe(0);
        }
    });

    test('S2: abstract and contributor names are searched too', async ({page, opsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const [wordTitle, wordAbstract, wordFamily, wordFrench, wordOther] = makeWords(5);
        const familyName = wordFamily[0].toUpperCase() + wordFamily.slice(1);
        const titleA = `The publications of children about ${wordTitle}`;
        const titleAFrench = `Les publications des enfants sur ${wordFrench}`;
        const titleB = `The ${wordOther} study`;
        // French beside English as UI and submission language, so the first
        // preprint's title can carry a French version (fn-s2).
        await opsApi.createContext({
            tag,
            context: {supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']},
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
            title: {en: titleA, fr_CA: titleAFrench},
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

        // The visitor reads in English.
        const search = new SearchPage(page, tag);
        await search.goto();

        // Exactly the first preprint, and the second (Control, carrying none
        // of the searched words) absent from the list.
        const expectFirstOnly = async () => {
            const found = await search.expectOnlyResult(titleA);
            await expect(search.result(titleB)).toHaveCount(0);
            return found;
        };

        // A word that appears only in one preprint's abstract (Rule 3).
        await search.search(wordAbstract);
        await expectFirstOnly();

        // The made-up family name of one preprint's contributor (Rule 3).
        await search.search(familyName);
        await expectFirstOnly();
        await expect(search.resultAuthors(titleA)).toContainText(familyName);

        // The title word typed all in capitals (Rule 4: case does not matter).
        await search.search(wordTitle.toUpperCase());
        await expectFirstOnly();

        // The French title's word, the site read in English (Rule 3).
        await search.search(wordFrench);
        await expectFirstOnly();

        // Whole words (Rule 4): a fragment finds nothing, the word does; an
        // irregular form does not find its plural.
        await search.search('publi');
        await search.expectNoResults();
        await search.search('publication');
        await expectFirstOnly();
        await search.search('child');
        await search.expectNoResults();
        await search.search('children');
        await expectFirstOnly();

        // Common words (Rule 4): "the" alone finds nothing, although both
        // titles hold it; beside the title word it changes nothing.
        await search.search('the');
        await search.expectNoResults();
        await search.search(`the ${wordTitle}`);
        await expectFirstOnly();

        // Punctuation and syntax (Rule 4): quotation marks and "AND" are
        // ignored; a hyphenated pair finds nothing, although both words are
        // in the title.
        await search.search(`"${wordTitle}"`);
        await expectFirstOnly();
        await search.search(`${wordTitle} AND children`);
        await expectFirstOnly();
        await search.search(`${wordTitle}-children`);
        await search.expectNoResults();
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

        // Control: the preprint's own title word, searched the same way,
        // lists it.
        await search.search(wordHit);
        await search.expectOnlyResult(title);

        // A word that appears nowhere: an empty list and "No Results" (Rule 7).
        await search.search(wordNowhere);
        await search.expectNoResults();
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

        // A visitor: only the published preprint (Rule 2). Control: the
        // never-published submission with the same word is absent, bounded
        // by the published hit listed the same way.
        const visitorSearch = new SearchPage(page, tag);
        await visitorSearch.goto();
        await visitorSearch.search(word);
        await visitorSearch.expectOnlyResult(publishedTitle);
        await expect(visitorSearch.result(draftTitle)).toHaveCount(0);

        // The server's Preprint Server Manager, signed in: the same one
        // preprint (Rule 15). Control: still not the unpublished submission.
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const managerSearch = new SearchPage(managerPage, tag);
        await managerSearch.goto();
        await managerSearch.search(word);
        await managerSearch.expectOnlyResult(publishedTitle);
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

        // Before: the Manager, signed in, finds the preprint (the control for
        // every absence below).
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const managerSearch = new SearchPage(managerPage, tag);
        await managerSearch.goto();
        await managerSearch.search(word);
        await managerSearch.expectOnlyResult(title);

        // "Unpost": the Manager opens the preprint's workflow, its Publication
        // area ("Preprint" group, Title & Abstract page) and presses "Unpost"
        // at the top right (Rule 12; the flow is U49's).
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
        // run in between.
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await search.expectNoResults();

        // Published again: Control, still "No Results" until the background
        // jobs run; once they have run, the visitor's search lists it again.
        await postPreprint(managerPage);
        await search.search(word);
        await search.expectNoResults();
        runJobs();
        await search.search(word);
        await search.expectOnlyResult(title);
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
        // ">>"; Control: the current "1" is plain text, not a link (Rule 8).
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
        // and "1"; the box still holds the word; Control: "2" as plain text.
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

        // Paging keeps the date filters (Rule 8): "Published After" the 1st
        // of January of the current year (the preprints were posted today,
        // TZ=UTC) keeps all 27; page 2 still shows that date, and the
        // current page's number stays plain text.
        const januaryFirst = {year: new Date().getFullYear(), month: 'Jan', day: 1};
        await search.setDate('dateFrom', januaryFirst);
        await search.submit();
        await expect(search.pagination()).toContainText('1 - 25 of 27 items');
        await expect(search.currentPageNumber(1)).toBeVisible();
        await search.gotoPage('2');
        await expect(search.pagination()).toContainText('26 - 27 of 27 items');
        await expect(search.currentPageNumber(2)).toBeVisible();
        await search.expectDate('dateFrom', januaryFirst);
        await expect(search.queryBox()).toHaveValue(word);
    });

    test('S7: narrow by publication date', async ({page, opsApi, asUser}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const emptyTag = makeTag('s7e', testInfo);
        const [word] = makeWords(1);
        const titleFirst = `Notes on ${word} first day`;
        const titleFifteenth = `Notes on ${word} fifteenth day`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        // A second scratch server on which no publication date has ever been
        // entered: nothing posted, no submission at all.
        await opsApi.createContext({tag: emptyTag, users: contextUsers(emptyTag)});
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

        // Both listed, with their posted dates; the Year list offers 2024
        // (the control for the empty server's blank list below).
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await expect(search.result(titleFirst)).toHaveCount(1);
        await expect(search.result(titleFifteenth)).toHaveCount(1);
        await expect(search.results()).toHaveCount(2);
        await expect(search.resultDetails(titleFirst)).toContainText('Posted 2024-06-01');
        await expect(search.resultDetails(titleFifteenth)).toContainText('Posted 2024-06-15');
        await expect(search.yearOptions('dateFrom').filter({hasText: /^2024$/})).toHaveCount(1);

        // "Published After" the 10th (Year, Month and Day all chosen): only
        // the 15th's preprint, and the selects still show the 10th (Rule 9).
        const tenth = {year: 2024, month: 'Jun', day: 10};
        await search.setDate('dateFrom', tenth);
        await search.submit();
        await search.expectOnlyResult(titleFifteenth);
        await expect(search.result(titleFirst)).toHaveCount(0);
        await search.expectDate('dateFrom', tenth);
        await search.expectDateBlank('dateTo');
        await expect(search.queryBox()).toHaveValue(word);

        // "Published Before": Published After back to blank, "Published
        // Before" the 10th (all three parts): only the 1st's preprint.
        await search.clearDate('dateFrom');
        await search.setDate('dateTo', tenth);
        await search.submit();
        await search.expectOnlyResult(titleFirst);
        await expect(search.result(titleFifteenth)).toHaveCount(0);
        await search.expectDate('dateTo', tenth);
        await search.expectDateBlank('dateFrom');

        // Empty box with a filter (Rule 5): the box cleared, "Published
        // Before" left at the 10th: still only the 1st's preprint.
        await search.queryBox().fill('');
        await search.submit();
        await search.expectOnlyResult(titleFirst);
        await expect(search.result(titleFifteenth)).toHaveCount(0);
        await search.expectDate('dateTo', tenth);
        await expect(search.queryBox()).toHaveValue('');

        // Month and Day without a Year (Rule 9): the word typed again,
        // "Published Before" blank, "Published After" at Jun / 10 with Year
        // left blank: both listed and the three selects go blank.
        await search.queryBox().fill(word);
        await search.clearDate('dateTo');
        await search.setDate('dateFrom', {month: 'Jun', day: 10});
        await search.submit();
        await expect(search.result(titleFirst)).toHaveCount(1);
        await expect(search.result(titleFifteenth)).toHaveCount(1);
        await expect(search.results()).toHaveCount(2);
        await search.expectDateBlank('dateFrom');
        await search.expectDateBlank('dateTo');

        // A server with nothing posted (Rule 9): the Year lists under both
        // filters offer only blank entries and the page reads "No Results".
        const emptySearch = new SearchPage(page, emptyTag);
        await emptySearch.goto();
        await emptySearch.expectYearListBlank('dateFrom');
        await emptySearch.expectYearListBlank('dateTo');
        await emptySearch.expectNoResults();
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
        await search.expectOnlyResult(title);
        await expect(search.resultDetails(title)).toHaveText(DATE_LINE);

        // The same box and button at the top of the Preprints page behave
        // the same way.
        await archive.gotoPreprints();
        await expect(archive.queryBox()).toHaveValue('');
        await expect(archive.searchButton()).toBeVisible();
        await archive.search(word);
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(word);
        await search.expectOnlyResult(title);
        await expect(search.resultDetails(title)).toHaveText(DATE_LINE);

        // Control: back on the home page, its archive box is empty again
        // (Rule 17), the Search page's box holding the word being the read
        // it is set against.
        await archive.gotoHome();
        await expect(archive.searchButton()).toBeVisible();
        await expect(archive.queryBox()).toHaveValue('');
    });

    test('S12: declined after publication, still listed; deleted, gone at once', async ({page, opsApi, asUser, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('s12', testInfo);
        const [wordA, wordB] = makeWords(2);
        const titleA = `Notes on ${wordA}`;
        const titleB = `Notes on ${wordB}`;
        await opsApi.createContext({tag, users: contextUsers(tag)});
        const {submissionId: idA} = await opsApi.createSubmission({
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

        // Before: the visitor finds the first preprint.
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(wordA);
        await search.expectOnlyResult(titleA);

        // Returned to the workflow and declined: the Manager opens the first
        // preprint's workflow (resting in Done from Production, the stage it
        // was posted from), presses "Return to Workflow" and confirms (U24
        // #done: the bubble reads "Production" while the panel stays on the
        // Preprint pages, so the stage is selected), then declines it there
        // with "Decline Submission" → "Record Decision" (fn-s12): the stage
        // bubble reads "Declined".
        const managerPage = await (await asUser(`${tag}mg`)).newPage();
        const workflow = new WorkflowPage(managerPage, tag, {
            appContext,
            labels: {publicationGroup: 'Preprint'},
        });
        await workflow.gotoEditorial(idA);
        await workflow.expectStage('Published');
        await workflow.returnToWorkflow();
        await workflow.expectStage('Production');
        await workflow.selectStage('Production');
        await workflow.actionButton('Decline Submission').click();
        const decision = new DecisionPage(managerPage);
        await decision.expectOpen('Decline Submission');
        await decision.completeAll();
        await workflow.expectOpen(idA);
        await workflow.expectStage('Declined');

        // The visitor's search for the word still lists the preprint, its
        // title linking to the landing page's address (Rule 2). What the
        // title opens on a server is OPS4's "404 Not Found", a 🐞 never
        // asserted as the contract (PRINCIPLES M3): the click stays out.
        await search.goto();
        await search.search(wordA);
        await search.expectOnlyResult(titleA);
        await expect(search.resultTitleLink(titleA)).toHaveAttribute(
            'href',
            new RegExp(`/${tag}/preprint/view/${idA}\\b`)
        );

        // Control: the second preprint, searched by its word, is listed
        // after the decline.
        await search.goto();
        await search.search(wordB);
        await search.expectOnlyResult(titleB);

        // Deleted: the Manager deletes the declined submission with the
        // Production stage's "Delete" and its confirmation ("Are you sure
        // you want to permanently delete this submission?"); the panel
        // closes.
        await workflow.selectStage('Production');
        await workflow.deleteSubmission();

        // The visitor's search reads "No Results" at once: no queue run
        // between the delete and this read (Side effects).
        await search.search(wordA);
        await search.expectNoResults();

        // Control: the second preprint is still listed after the delete.
        await search.search(wordB);
        await search.expectOnlyResult(titleB);
    });
});
