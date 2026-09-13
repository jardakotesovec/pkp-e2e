// @ts-check
/**
 * @file playwright/tests/serial/U15-search.spec.js
 *
 * U15 — Search, OMP suite (spec: docs/specs/U15-search.md), read in press
 * words per GLOSSARY Part II: press, book/monograph, Press Manager,
 * catalog page. One test per canonical scenario the spec runs on a press:
 * the common scenarios 1–6 in the press's own context, scenario 7 as the
 * absence check its Control describes (a press has no date filters,
 * OMP2), the press-specific scenario 11 and the common scenario 12.
 * Scenarios 8 and 9 are OJS-only, 10 is OPS-only.
 *
 * Not covered, by register ID (the spec's Coverage section is the record
 * of everything else left out): OMP1, OMP3, A3, A4, A5, A6, A7, A8, A9,
 * A10, A11, A12, A13, A16; A1, A2, A14 and A15 concern the date filters a
 * press lacks; OJS1–3 and OPS1–3 are the other applications'. Results are
 * matched by title, never by position (A4). The status line of scenario 1
 * is a journal's and a server's; a press renders its "1 Titles" count
 * instead and the line is not asserted here. OMP3 (folded from T-omp-1,
 * 2026-09-13): a declined book's title in the results opens "404 Not
 * Found" for the visitor on a press, so S12 asserts the folded bullet's
 * press half — the listing and the title's address after the decline —
 * and never the page it opens (M3).
 *
 * Serial project, on purpose (PRINCIPLES A9, patterns.md parallel lesson
 * 7): publishing queues the index refresh (Rule 12) and the fleets run with
 * the job runner off, so every scenario that expects a hit seeds through the
 * scenario API and then drains the SHARED queue once with `runJobs()`.
 * Scenario 5's "still absent before the jobs run" step and scenario 12's
 * "gone at once" step assume nothing else drains this fleet's queue
 * mid-test; only this suite does in normal runs.
 *
 * Isolation: every test mints its own scratch press (A1) and its own
 * made-up search words — letters only, all the same length, so none is a
 * prefix or stem of another and no earlier run's content can match (the
 * engine stems and a long-lived database keeps everything). The visitor is
 * the default `page` (no `user` option → no storage state); the Press
 * Manager comes from `asUser` on the scratch press's own manager. Mailpit
 * reads are scoped to the scratch press's throwaway addresses
 * (`<username>@mail.test`, fn-s1).
 */
const {test, expect} = require('../../support/fixtures.js');
const {
    PressSearchPage,
    CatalogEntryControls,
    SENTENCES,
    declineFromStage,
} = require('../../pages/SearchPages.js');
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

/** A throwaway account's address (scenarios.md `users[]` default). */
const emailOf = (username) => `${username}@mail.test`;

/** The press's long date format in a result ("September 2, 2026"); the div pads it with whitespace. */
const LONG_DATE = /^\s*(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\s*$/;

/** A book's catalog page address (Rule 6). */
const CATALOG_BOOK = (tag) => new RegExp(`/${tag}/(en/)?catalog/book/\\d+`);

/**
 * A scratch press with its own Press Manager and one or more authors.
 * `context` adds keys to the context spec (a second locale for S2).
 * Returns the usernames.
 */
async function seedPress(ompApi, tag, authors = [{key: 'aut'}], context = {}) {
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
    await ompApi.createContext({tag, context: {name: `Scratch press ${tag}`, ...context}, users});
    return {manager, ...names};
}

/** A published book (or, with `published: false`, a submitted one). `title` may be a locale map. */
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
    test('S1: Find a book by a word in its title', async ({page, ompApi, pkpMail}, testInfo) => {
        test.slow();
        const tag = makeTag('1', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordB = makeWord(used);
        const titleA = `The ${wordA} expedition`;
        const titleB = `The ${wordB} chronicle`;
        const {manager, aut} = await seedPress(ompApi, tag, [{key: 'aut', givenName: 'Zelda', familyName: 'Zorvakilen'}]);
        await seedBook(ompApi, {tag, submitter: aut, title: titleA});
        await seedBook(ompApi, {tag, submitter: aut, title: titleB});
        runJobs();

        // The header's "Search" link: from the press's home page, the page
        // "Search" opens with an empty box (Rule 1).
        const search = new PressSearchPage(page, tag);
        await search.openFromHome();
        await expect(page).toHaveURL(new RegExp(`/${tag}/search$`));
        await expect(search.box).toHaveValue('');

        // A title word: exactly that book — title, contributors, published
        // date, no galley links (Rules 2, 3, 6).
        await search.submit(wordA);
        await search.expectOnly(titleA);
        const parts = PressSearchPage.parts(search.result(titleA));
        await expect(parts.titleLink).toHaveText(titleA);
        await expect(parts.author).toContainText('Zelda Zorvakilen (Author)');
        await expect(parts.date).toHaveText(LONG_DATE);
        await expect(parts.galleyLinks).toHaveCount(0);

        // Under the list: a press shows its "1 Titles" count instead of the
        // items line, and no page links, the list being a single page
        // (Rules 7, 8). The status line is a journal's and a server's; a
        // press has none to read.
        await expect(search.countLine).toHaveText('1 Titles');
        await expect(search.pageLinks()).toHaveCount(0);

        // Control: the other book is absent from the list.
        await search.expectAbsent(titleB);

        // The title opens the book's catalog page; Back returns to the page
        // with the word still in the box.
        await parts.titleLink.click();
        await expect(page).toHaveURL(CATALOG_BOOK(tag));
        await expect(page.getByRole('heading', {level: 1, name: titleA})).toBeVisible();
        await page.goBack();
        await expect(search.heading).toBeVisible();
        await expect(search.box).toHaveValue(wordA);

        // The mail catcher holds no email from the searches (Side effects):
        // both searches are synchronous page loads that have answered, so
        // any mail they sent would already be in the catcher; seeding sends
        // none (scenarios.md, the mail fake). Read scoped to this press's
        // two throwaway addresses; the catcher answering its total is the
        // control that the read itself works.
        expect(await pkpMail.messageCount()).toBeGreaterThanOrEqual(0);
        expect(await pkpMail.count({to: emailOf(manager)})).toBe(0);
        expect(await pkpMail.count({to: emailOf(aut)})).toBe(0);
    });

    test('S2: Abstract and contributor names are searched too', async ({page, ompApi}, testInfo) => {
        test.slow();
        const tag = makeTag('2', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordB = makeWord(used);
        const wordAbstract = makeWord(used);
        const wordFamily = makeWord(used);
        const wordFrench = makeWord(used);
        const titleA = `The publications of children about ${wordA}`;
        const titleAFrench = `Les publications des enfants sur ${wordFrench}`;
        const titleB = `The ${wordB} study`;
        // A press reading in English and French, so the first book carries
        // a French title beside its English one (fn-s2).
        const {one, two} = await seedPress(
            ompApi,
            tag,
            [
                {key: 'one', givenName: 'Ada', familyName: capitalize(wordFamily)},
                {key: 'two', givenName: 'Sam', familyName: 'Smith'},
            ],
            {supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}
        );
        await seedBook(ompApi, {
            tag,
            submitter: one,
            title: {en: titleA, fr_CA: titleAFrench},
            abstract: `An abstract about ${wordAbstract} and its measurement.`,
        });
        await seedBook(ompApi, {tag, submitter: two, title: titleB, abstract: 'A plain abstract about a periodical.'});
        runJobs();

        const search = new PressSearchPage(page, tag);
        /** The first book alone is listed; the second (Control) is absent. */
        const expectFirstAlone = async (words) => {
            await search.search(words);
            await search.expectOnly(titleA);
            await search.expectAbsent(titleB);
        };
        /** Nothing is listed: the not-found line (Control: the second book absent too). */
        const expectNothing = async (words) => {
            await search.search(words);
            await search.expectNone(words);
            await search.expectAbsent(titleB);
        };

        // A word in the abstract (Rule 3).
        await expectFirstAlone(wordAbstract);
        // A contributor's family name (Rule 3).
        await expectFirstAlone(wordFamily);
        // Capitals (Rule 4).
        await expectFirstAlone(wordA.toUpperCase());
        // The French title: the site read in English, the French title's
        // word finds the book (Rule 3).
        await expectFirstAlone(wordFrench);

        // Whole words (Rule 4): "publi" finds nothing although the title
        // holds "publications"; "publication" finds it; "child" finds
        // nothing although the title holds "children"; "children" finds it.
        await expectNothing('publi');
        await expectFirstAlone('publication');
        await expectNothing('child');
        await expectFirstAlone('children');

        // Common words (Rule 4): "the" alone finds nothing although both
        // titles hold it; "the" beside the title word changes nothing.
        await expectNothing('the');
        await expectFirstAlone(`the ${wordA}`);

        // Punctuation and syntax (Rule 4): quotation marks and "AND" change
        // nothing; a hyphenated pair finds nothing although both words are
        // in the title.
        await expectFirstAlone(`"${wordA}"`);
        await expectFirstAlone(`${wordA} AND children`);
        await expectNothing(`${wordA}-children`);
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

        // A word that appears nowhere: the not-found sentence and "Search
        // again", which jumps to the search box (Rule 7, OMP2).
        const search = new PressSearchPage(page, tag);
        await search.search(wordNowhere);
        await search.expectNone(wordNowhere);
        await expect(search.statusLine).toHaveText(`${SENTENCES.none(wordNowhere)} Search again`);
        await expect(search.searchAgainLink).toHaveAttribute('href', '#search-form');
        await search.searchAgain();
        await expect(search.box).toHaveValue(wordNowhere);

        // Control: the book's own title word, searched the same way, lists it.
        await search.search(wordA);
        await search.expectOnly(titleA);
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
        await expect(visitorSearch.countLine).toHaveText('1 Titles');

        // The Press Manager, signed in: the same one book (Rule 15).
        const managerPage = await (await asUser(manager)).newPage();
        const managerSearch = new PressSearchPage(managerPage, tag);
        await managerSearch.search(word);
        await managerSearch.expectOnly(publishedTitle);
        await expect(managerSearch.countLine).toHaveText('1 Titles');

        // Control: the submission still in the workflow is listed for
        // neither the visitor nor the Press Manager.
        await visitorSearch.expectAbsent(unpublishedTitle);
        await managerSearch.expectAbsent(unpublishedTitle);
    });

    test('S5: Unpublishing removes, republishing restores', async ({page, asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('5', testInfo);
        const word = makeWord();
        const title = `The ${word} expedition`;
        const {manager, aut} = await seedPress(ompApi, tag);
        const submissionId = await seedBook(ompApi, {tag, submitter: aut, title});
        runJobs();

        // Before: the Press Manager sees it listed.
        const managerPage = await (await asUser(manager)).newPage();
        const managerSearch = new PressSearchPage(managerPage, tag);
        await managerSearch.search(word);
        await managerSearch.expectOnly(title);

        // "Unpublish": Workflow › Publication › Title & Abstract › "Unpublish"
        // (top right). A visitor's search reads the not-found line at once,
        // no wait (Rule 12).
        const workflow = new WorkflowPage(managerPage, tag, {appContext});
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Title & Abstract');
        const controls = new CatalogEntryControls(workflow);
        await controls.unpublish();
        const visitorSearch = new PressSearchPage(page, tag);
        await visitorSearch.search(word);
        await visitorSearch.expectNone(word);

        // Published again. Control: until the jobs have run, the visitor's
        // search still reads the not-found line…
        await workflow.gotoEditorial(submissionId);
        await workflow.selectPage('Title & Abstract');
        await controls.publish();
        await visitorSearch.search(word);
        await visitorSearch.expectNone(word);

        // …and once they have, the book is listed again.
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

        // Page 1: 25 books, "1 - 25 of 27 items", links "2", ">" and ">>"
        // (Rule 8). Control: the current "1" is plain text, not a link.
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
        // the box still holds the word. Control: "2" is plain text now.
        // (The date-filter step is a journal's and a server's, {OJS OPS}.)
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

        // Control (the scenario's own, a press having no date filters): the
        // bare page shows no "Advanced filters", no "Published After/Before",
        // no date selects; only the box and "Search" at its foot (OMP2, M4).
        const search = new PressSearchPage(page, tag);
        await search.goto();
        await expect(search.box).toBeVisible();
        await expect(search.searchButton).toBeVisible();
        expect(await search.formIsBelowHeading()).toBe(true);
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

        // The header's "Search" link: heading "Search" and, at the foot, a
        // box and a "Search" button. Control: no list before any word is
        // typed, and no Advanced filters.
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

        // The word: "1 Titles", the one-title sentence with "Search again",
        // and the book with its cover, title, contributors and date; still
        // no Advanced filters.
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
        await expect(search.advancedFilters).toHaveCount(0);
        await expect(search.dateSelects).toHaveCount(0);

        // The title opens the book's catalog page.
        await parts.titleLink.click();
        await expect(page).toHaveURL(CATALOG_BOOK(tag));
        await expect(page.getByRole('heading', {level: 1, name: title})).toBeVisible();

        // Back on the results, "Search again" jumps to the box, which still
        // holds the word; the filters are absent throughout.
        await page.goBack();
        await expect(search.statusLine).toBeVisible();
        await search.searchAgain();
        await expect(search.box).toHaveValue(word);
        await expect(search.advancedFilters).toHaveCount(0);
    });

    test('S12: Declined after publication, still listed; deleted, gone at once', async ({page, asUser, ompApi, appContext}, testInfo) => {
        test.slow();
        const tag = makeTag('12', testInfo);
        const used = new Set();
        const wordA = makeWord(used);
        const wordB = makeWord(used);
        const titleA = `The ${wordA} expedition`;
        const titleB = `The ${wordB} chronicle`;
        const {manager, aut} = await seedPress(ompApi, tag);
        const idA = await seedBook(ompApi, {tag, submitter: aut, title: titleA});
        await seedBook(ompApi, {tag, submitter: aut, title: titleB});
        runJobs();

        // Before: the visitor finds the first book.
        const visitorSearch = new PressSearchPage(page, tag);
        await visitorSearch.search(wordA);
        await visitorSearch.expectOnly(titleA);

        // Returned to the workflow and declined: the Press Manager presses
        // "Return to Workflow" and confirms (U24 #done), then "Decline
        // Submission" → "Record Decision" on the stage the book was
        // published from (U25; fn-s12).
        const managerPage = await (await asUser(manager)).newPage();
        const workflow = new WorkflowPage(managerPage, tag, {appContext});
        // A published book's panel opens on its Publication page and stays
        // there after the return, so the stage entry is selected to reach
        // the stage's buttons (screen-notes, tomp).
        await workflow.gotoEditorial(idA);
        await workflow.expectStage('Published');
        await workflow.returnToWorkflow();
        await expect(workflow.headerButton('Return to Done')).toBeVisible();
        await workflow.expectStage('Submission');
        await workflow.selectStage('Submission');
        await declineFromStage(workflow);
        await workflow.gotoEditorial(idA);
        await expect(workflow.header()).toContainText('Declined');
        await workflow.selectStage('Submission');
        await expect(workflow.actionButton('Delete')).toBeVisible();

        // The visitor's search still lists the book on every application,
        // its title linking to the catalog page (Rule 2); the page the link
        // opens is not read: on a press it is "404 Not Found" once the book
        // is declined (OMP3, a 🐞 never asserted as contract, M3). Control:
        // the second book, by its word, is listed after the decline.
        await visitorSearch.search(wordA);
        await visitorSearch.expectOnly(titleA);
        await expect(PressSearchPage.parts(visitorSearch.result(titleA)).titleLink).toHaveAttribute('href', CATALOG_BOOK(tag));
        await visitorSearch.search(wordB);
        await visitorSearch.expectOnly(titleB);

        // Deleted: "Delete" → "Are you sure you want to permanently delete
        // this submission?" → Confirm (U25 #delete). The visitor's search
        // reads the not-found line at once, no background jobs run in
        // between (Side effects). Control: the second book is still listed.
        await workflow.deleteSubmission();
        await visitorSearch.search(wordA);
        await visitorSearch.expectNone(wordA);
        await visitorSearch.search(wordB);
        await visitorSearch.expectOnly(titleB);
    });
});
