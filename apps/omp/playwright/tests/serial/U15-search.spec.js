// @ts-check
/**
 * @file playwright/tests/serial/U15-search.spec.js
 *
 * Search — the press's Search page (docs/specs/U15-search.md), read in
 * press words per GLOSSARY Part II: press, book/monograph, Press Manager,
 * catalog page. Common scenarios 1–6 in the press's own context, scenario 7
 * as an absence test with a positive control, and the press-specific
 * scenario 11 (multi-app rule 3).
 *
 * Serial project, on purpose (PRINCIPLES A9, patterns.md parallel lesson
 * 7): publishing queues the index refresh (Rule 12) and the fleets run with
 * the job runner off, so every scenario that expects a hit seeds through the
 * scenario API and then drains the SHARED queue once with `runJobs()`.
 * Scenario 5's "still absent before the jobs run" step assumes nothing else
 * drains this fleet's queue mid-test; only this suite does in normal runs.
 *
 * Deliberately not covered here (rule 3):
 * - Scenario 7's date filters {OJS OPS}: a press has none (OMP2). Only their
 *   absence is asserted, paired with the box and button working (M4).
 * - Scenarios 8, 9 and 10: journal- and server-specific; a press has no
 *   site-wide journal picker (A10 ❓), no publishing-mode gate (Rule 13) and
 *   no archive header.
 * - Nothing asserts a 🐞 (M3): the index-rebuild tool (OMP1) is a command
 *   line, post-publication edits (A3) and galley text (A11) are not
 *   searched for; the ❓ entries (A4 order, A5 several words, A6 bare page,
 *   A7 versions, A8 address-only refinements) are not asserted either.
 *   Results are matched by title, never by position (A4).
 * - The site-wide Search page (Rule 10) is a journal scenario; not run here.
 *
 * Isolation: every test mints its own scratch press (A1) and its own
 * made-up search words — letters only, all the same length, so none is a
 * prefix or stem of another and no earlier run's content can match (the
 * engine stems and a long-lived database keeps everything). The visitor is
 * the default `page` (no `user` option → no storage state); the Press
 * Manager comes from `asUser` on the scratch press's own manager.
 */
const {test, expect} = require('../../support/fixtures.js');
const {PressSearchPage, CatalogEntryControls, SENTENCES} = require('../../pages/SearchPages.js');
const {WorkflowPage} = require('../../../../../shared/playwright/pages/WorkflowPage.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** Unique per-run tag: a single alphanumeric token carrying app + scenario. */
function makeTag(scenario, testInfo) {
    return `u15s${scenario}ompw${testInfo.parallelIndex}${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 6)}`;
}

/**
 * A made-up word: letters only, always nine letters (a fixed "zq" plus a
 * consonant-vowel run ending in a non-suffix consonant), so two words of a
 * run can never be a prefix or a stem of one another.
 */
function makeWord(used = new Set()) {
    const consonants = 'bdfghklmnprtvz';
    const vowels = 'aeiou';
    const pick = (letters) => letters[Math.floor(Math.random() * letters.length)];
    for (;;) {
        let word = 'zq';
        for (let i = 0; i < 3; i++) word += pick(consonants) + pick(vowels);
        word += pick('bdfgklmnprtv');
        if (!used.has(word)) {
            used.add(word);
            return word;
        }
    }
}

const capitalize = (word) => word[0].toUpperCase() + word.slice(1);

/** The press's long date format in a result ("September 2, 2026"); the div pads it with whitespace. */
const LONG_DATE = /^\s*(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\s*$/;

/**
 * A scratch press with its own Press Manager and one or more authors.
 * Returns the usernames.
 */
async function seedPress(ompApi, tag, authors = [{key: 'aut'}]) {
    const manager = `mgr${tag}`;
    const users = [{username: manager, roles: ['manager'], givenName: 'Mona', familyName: 'Managerson'}];
    const names = {};
    for (const author of authors) {
        const username = `${author.key}${tag}`;
        names[author.key] = username;
        users.push({
            username,
            roles: ['author'],
            givenName: author.givenName || 'Ada',
            familyName: author.familyName || 'Plainfield',
        });
    }
    await ompApi.createContext({tag, context: {name: `Scratch press ${tag}`}, users});
    return {manager, ...names};
}

/** A published book (or, with `published: false`, a submitted one). */
async function seedBook(ompApi, {tag, submitter, title, abstract, published = true}) {
    const {submissionId} = await ompApi.createSubmission({
        tag,
        context: tag,
        submitter,
        title,
        abstract: abstract || 'A plain abstract about the subject.',
        submitted: true,
        published,
    });
    return submissionId;
}

test.describe('Search — the press Search page', () => {
    test('S1: Find a book by a word in its title', async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('1', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordB = makeWord(used);
        const titleA = `The ${wordA} expedition`;
        const titleB = `The ${wordB} chronicle`;
        const {aut} = await seedPress(ompApi, tag, [{key: 'aut', givenName: 'Zelda', familyName: 'Zorvakilen'}]);
        await seedBook(ompApi, {tag, submitter: aut, title: titleA});
        await seedBook(ompApi, {tag, submitter: aut, title: titleB});
        runJobs();

        // From the press's home page, the header's "Search" opens the page
        // "Search" with an empty box (Rule 1).
        const search = new PressSearchPage(page, tag);
        await search.openFromHome();
        await expect(page).toHaveURL(new RegExp(`/${tag}/search$`));
        await expect(search.box).toHaveValue('');

        // Exactly that book: title, contributors, published date, no galley
        // links; the other book absent (Rules 2, 3, 6).
        await search.submit(wordA);
        await search.expectOnly(titleA);
        const parts = PressSearchPage.parts(search.result(titleA));
        await expect(parts.titleLink).toHaveText(titleA);
        await expect(parts.author).toContainText('Zelda Zorvakilen (Author)');
        await expect(parts.date).toHaveText(LONG_DATE);
        await expect(parts.galleyLinks).toHaveCount(0);
        await expect(search.results.filter({hasText: titleB})).toHaveCount(0);

        // The title opens the book's catalog page; Back returns to the page
        // with the word still in the box.
        await parts.titleLink.click();
        await expect(page).toHaveURL(new RegExp(`/${tag}/catalog/book/\\d+`));
        await expect(page.getByRole('heading', {level: 1, name: titleA})).toBeVisible();
        await page.goBack();
        await expect(search.heading).toBeVisible();
        await expect(search.box).toHaveValue(wordA);
    });

    test('S2: Abstract and contributor names are searched too', async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('2', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordB = makeWord(used);
        const wordAbstract = makeWord(used);
        const wordFamily = makeWord(used);
        const titleA = `The ${wordA} expedition`;
        const titleB = `The ${wordB} chronicle`;
        const {one, two} = await seedPress(ompApi, tag, [
            {key: 'one', givenName: 'Ada', familyName: capitalize(wordFamily)},
            {key: 'two', givenName: 'Sam', familyName: 'Smith'},
        ]);
        await seedBook(ompApi, {
            tag,
            submitter: one,
            title: titleA,
            abstract: `An abstract about ${wordAbstract} and its measurement.`,
        });
        await seedBook(ompApi, {tag, submitter: two, title: titleB, abstract: 'A plain abstract about a periodical.'});
        runJobs();

        const search = new PressSearchPage(page, tag);
        // The word that appears only in one book's abstract (Rule 3).
        await search.search(wordAbstract);
        await search.expectOnly(titleA);
        // The made-up family name of one book's contributor (Rule 3).
        await search.search(wordFamily);
        await search.expectOnly(titleA);
        // The title word typed all in capitals (Rule 4).
        await search.search(wordA.toUpperCase());
        await search.expectOnly(titleA);
    });

    test('S3: Nothing found', async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('3', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordNowhere = makeWord(used);
        const titleA = `The ${wordA} expedition`;
        const {aut} = await seedPress(ompApi, tag);
        await seedBook(ompApi, {tag, submitter: aut, title: titleA});
        runJobs();

        const search = new PressSearchPage(page, tag);
        // Positive control: the press's own book is findable (M4).
        await search.search(wordA);
        await search.expectOnly(titleA);

        // A word that appears nowhere: the not-found sentence and "Search
        // again", which jumps to the search box (Rule 7, OMP2).
        await search.search(wordNowhere);
        await search.expectNone(wordNowhere);
        await expect(search.statusLine).toHaveText(`${SENTENCES.none(wordNowhere)} Search again`);
        await expect(search.searchAgainLink).toHaveAttribute('href', '#search-form');
        await search.searchAgain();
        await expect(search.box).toHaveValue(wordNowhere);
    });

    test('S4: Only published books are found', async ({page, asUser, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('4', testInfo);
        const word = makeWord();
        const publishedTitle = `The ${word} expedition`;
        const unpublishedTitle = `Notes towards ${word}`;
        const {manager, aut} = await seedPress(ompApi, tag);
        await seedBook(ompApi, {tag, submitter: aut, title: publishedTitle});
        await seedBook(ompApi, {tag, submitter: aut, title: unpublishedTitle, published: false});
        runJobs();

        // A visitor: only the published book (Rule 2).
        const visitorSearch = new PressSearchPage(page, tag);
        await visitorSearch.search(word);
        await visitorSearch.expectOnly(publishedTitle);
        await expect(visitorSearch.results.filter({hasText: unpublishedTitle})).toHaveCount(0);
        await expect(visitorSearch.countLine).toHaveText('1 Titles');

        // The Press Manager, signed in: the same one book, still not the
        // submission in the workflow (Rule 15).
        const managerPage = await (await asUser(manager)).newPage();
        const managerSearch = new PressSearchPage(managerPage, tag);
        await managerSearch.search(word);
        await managerSearch.expectOnly(publishedTitle);
        await expect(managerSearch.results.filter({hasText: unpublishedTitle})).toHaveCount(0);
        await expect(managerSearch.countLine).toHaveText('1 Titles');
    });

    test('S5: Unpublishing removes, republishing restores', async ({page, asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('5', testInfo);
        const word = makeWord();
        const title = `The ${word} expedition`;
        const {manager, aut} = await seedPress(ompApi, tag);
        const submissionId = await seedBook(ompApi, {tag, submitter: aut, title});
        runJobs();

        // The Press Manager sees it listed.
        const managerPage = await (await asUser(manager)).newPage();
        const managerSearch = new PressSearchPage(managerPage, tag);
        await managerSearch.search(word);
        await managerSearch.expectOnly(title);

        // Workflow › Publication › Title & Abstract › "Unpublish" (top right).
        const workflow = new WorkflowPage(managerPage, tag, {appContext});
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Title & Abstract');
        const controls = new CatalogEntryControls(workflow);
        await controls.unpublish();

        // A visitor's search reads the not-found line at once, no wait (Rule 12).
        const visitorSearch = new PressSearchPage(page, tag);
        await visitorSearch.search(word);
        await visitorSearch.expectNone(word);

        // Publish it again: still absent until the background jobs run…
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Title & Abstract');
        await controls.publish();
        await visitorSearch.search(word);
        await visitorSearch.expectNone(word);

        // …and listed once they have.
        runJobs();
        await visitorSearch.search(word);
        await visitorSearch.expectOnly(title);
    });

    test('S6: Paging through a long list', async ({page, ompApi}, testInfo) => {
        test.setTimeout(420_000); // 27 seeded books
        const tag = makeTag('6', testInfo);
        const word = makeWord();
        const {aut} = await seedPress(ompApi, tag);
        for (let i = 1; i <= 27; i++) {
            await seedBook(ompApi, {tag, submitter: aut, title: `Volume ${i} of the ${word} series`});
        }
        runJobs();

        // Page 1: 25 books, "1 - 25 of 27 items", links "2", ">" and ">>",
        // the current "1" plain text (Rule 8).
        const search = new PressSearchPage(page, tag);
        await search.search(word);
        await expect(search.countLine).toHaveText('27 Titles');
        await expect(search.statusLine).toContainText(SENTENCES.many(27, word));
        await expect(search.results).toHaveCount(25);
        await expect(search.pagination).toContainText('1 - 25 of 27 items');
        await expect(search.pageLink('2')).toBeVisible();
        await expect(search.pageLink('>')).toBeVisible();
        await expect(search.pageLink('>>')).toBeVisible();
        await expect(search.currentPageNumber()).toHaveText('1');
        await expect(search.pageLink('1')).toHaveCount(0);
        await expect(search.pageLink('<')).toHaveCount(0);
        await expect(search.pageLink('<<')).toHaveCount(0);

        // Page 2: the remaining 2, "26 - 27 of 27 items", "<<", "<" and "1";
        // the box still holds the word.
        await search.gotoPage('2');
        await expect(search.results).toHaveCount(2);
        await expect(search.pagination).toContainText('26 - 27 of 27 items');
        await expect(search.pageLink('<<')).toBeVisible();
        await expect(search.pageLink('<')).toBeVisible();
        await expect(search.pageLink('1')).toBeVisible();
        await expect(search.currentPageNumber()).toHaveText('2');
        await expect(search.pageLink('2')).toHaveCount(0);
        await expect(search.pageLink('>')).toHaveCount(0);
        await expect(search.pageLink('>>')).toHaveCount(0);
        await expect(search.box).toHaveValue(word);
    });

    test('S7: Narrow by publication date — absent on a press', async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('7', testInfo);
        const word = makeWord();
        const title = `The ${word} expedition`;
        const {aut} = await seedPress(ompApi, tag);
        await seedBook(ompApi, {tag, submitter: aut, title});
        runJobs();

        // The bare page: no "Advanced filters", no "Published After/Before",
        // no date selects; the box and "Search" button are there (OMP2, M4).
        const search = new PressSearchPage(page, tag);
        await search.goto();
        await expect(search.box).toBeVisible();
        await expect(search.searchButton).toBeVisible();
        await expect(search.advancedFilters).toHaveCount(0);
        await expect(search.dateLegends).toHaveCount(0);
        await expect(search.dateSelects).toHaveCount(0);
        await expect(page.locator('.page_search').getByText(/^(Year|Month|Day)$/)).toHaveCount(0);

        // Positive control: the same box and button run a search that finds
        // the book, and the results page carries no filters either.
        await search.submit(word);
        await search.expectOnly(title);
        await expect(search.advancedFilters).toHaveCount(0);
        await expect(search.dateLegends).toHaveCount(0);
        await expect(search.dateSelects).toHaveCount(0);
    });

    test("S11: The press's Search page", async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('11', testInfo);
        const word = makeWord();
        const title = `The ${word} expedition`;
        const {aut} = await seedPress(ompApi, tag, [{key: 'aut', givenName: 'Zelda', familyName: 'Zorvakilen'}]);
        await seedBook(ompApi, {tag, submitter: aut, title});
        runJobs();

        // From the home page's header "Search": heading "Search" and, at the
        // foot, a box and a "Search" button; no Advanced filters, no list.
        const search = new PressSearchPage(page, tag);
        await search.openFromHome();
        await expect(search.heading).toBeVisible();
        await expect(search.box).toBeVisible();
        await expect(search.searchButton).toBeVisible();
        expect(await search.formIsBelowHeading()).toBe(true);
        await expect(search.advancedFilters).toHaveCount(0);
        await expect(search.dateSelects).toHaveCount(0);
        await expect(search.results).toHaveCount(0);
        await expect(search.countLine).toHaveCount(0);
        await expect(search.statusLine).toHaveCount(0);

        // Search the word: "1 Titles", the one-title sentence with "Search
        // again", and the book with its cover, title, contributors and date.
        await search.submit(word);
        await expect(search.countLine).toHaveText('1 Titles');
        await expect(search.statusLine).toHaveText(`${SENTENCES.one(word)} Search again`);
        await expect(search.searchAgainLink).toBeVisible();
        await search.expectOnly(title);
        const parts = PressSearchPage.parts(search.result(title));
        await expect(parts.cover).toBeVisible();
        await expect(parts.titleLink).toHaveText(title);
        await expect(parts.author).toContainText('Zelda Zorvakilen (Author)');
        await expect(parts.date).toHaveText(LONG_DATE);
        expect(await search.formIsBelowResults()).toBe(true);

        // The title opens the book's catalog page.
        await parts.titleLink.click();
        await expect(page).toHaveURL(new RegExp(`/${tag}/catalog/book/\\d+`));
        await expect(page.getByRole('heading', {level: 1, name: title})).toBeVisible();

        // Back on the results, "Search again" jumps to the box, which still
        // holds the word.
        await page.goBack();
        await expect(search.statusLine).toBeVisible();
        await search.searchAgain();
        await expect(search.box).toHaveValue(word);
    });
});
