// @ts-check
/**
 * @file playwright/tests/serial/U15-search.spec.js
 *
 * Search — OJS suite, one test per canonical scenario the app runs: the
 * common scenarios 1–7 and the journal-specific 8 and 9.
 * Spec: docs/specs/U15-search.md
 *
 * Why serial: the search index is refreshed by a queued job
 * (UpdateSubmissionSearchJob) and the fleets run with the job runner off,
 * so every scenario that expects a hit publishes through the scenario API
 * and then drains the queue with runJobs() — which pops the SHARED queue
 * and is only safe in the serial project (patterns.md parallel lesson 7).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings
 * register; a 🐞 is never asserted as the contract, and a claim parked on
 * an open ❓ is not a coverage gap):
 * - OJS1 🐞: the hidden screen-reader status line ("Found one item." /
 *   the raw plural code) is not asserted anywhere.
 * - OJS2 🐞: S8 asserts that "By Journal" limits the first page of results
 *   (a hit with the journal chosen, "No Results" for the other journal's
 *   word) — never that the select shows blank afterwards, and no test pages
 *   through a journal-limited result.
 * - A1 🐞: every date filter is set with Year, Month and Day; no test
 *   chooses a year alone or a year and month.
 * - A2 ❓: S7 filters on the 10th between articles of the 1st and the
 *   15th, so the chosen-day boundary is never exercised.
 * - A3 🐞, A7 ❓, A11 🐞: no test edits a published article without
 *   republishing, publishes a second version, or uploads a galley.
 * - A4 ❓ / A5 ❓ / A6 ❓ / A8 ❓: results are counted, never ordered; every
 *   search is a single word; the bare page's full listing is not
 *   asserted (S1 only checks the box opens empty); no address-only
 *   refinement is typed.
 * - OJS3 ❓: S9 asserts the scenario as written — a visitor pressing the
 *   header's "Search" on a journal that does not publish online lands on
 *   the Login page. If the team settles OJS3 the other way, that one
 *   assertion follows the spec.
 * - Rule 16 (subscription journals), the issue-unpublish and delete paths
 *   of Rule 12, and the site-wide page's paging are spec claims outside
 *   the canonical scenarios.
 *
 * Seeding: scenario endpoints only, on scratch journals with throwaway
 * users; publicknowledge is never touched. The made-up search words are
 * letters-only, random per run and equal in length (so none is a stem or
 * prefix of another and nothing from an earlier run on this long-lived
 * database can match). S7 sets the two published dates through the
 * workflow's "Publication Settings" page before publishing (the API has no
 * date key). Every absence claim is paired with a positive control taken
 * the same way (PRINCIPLES M4). The default `page` carries no storage
 * state, so it is the visitor of every scenario; signed-in actors come
 * from `asUser`.
 */
const {test, expect} = require('../../support/fixtures.js');
const {
    SearchPage,
    setPublishingMode,
    DOES_NOT_PUBLISH_TEXT,
} = require('../../pages/SearchPages.js');
const {PublicationScreen} = require('../../pages/PublicationMetadataPages.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');

/** Unique per-run tag: single alphanumeric token carrying feature, scenario, app and worker. */
function makeTag(scenario, testInfo) {
    return `u15${scenario}ojsw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * A made-up, letters-only, pronounceable word: four consonant-vowel pairs
 * and a closing consonant (nine letters; the closing letters avoid the
 * English stemmer's suffix endings). Equal length keeps two words from
 * being prefixes of each other.
 */
function makeWord() {
    const pick = (s) => s[Math.floor(Math.random() * s.length)];
    let word = '';
    for (let i = 0; i < 4; i++) {
        word += pick('bcfklmnprtvz') + pick('aeiou');
    }
    return word + pick('kmnptv');
}

/** `n` distinct made-up words. */
function makeWords(n) {
    const words = new Set();
    while (words.size < n) {
        words.add(makeWord());
    }
    return [...words];
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Editorial decisions that carry a seeded submission to Production without publishing it. */
const TO_PRODUCTION = ['skipExternalReview', 'sendToProduction'];

/**
 * Seed a scratch journal with a manager and the given author users, each
 * `{username, givenName, familyName}`.
 */
async function seedJournal(ojsApi, tag, {name, authors, extraUsers = []}) {
    return ojsApi.createContext({
        tag,
        context: name ? {name} : undefined,
        users: [
            {username: `mgr${tag}`, roles: ['manager'], givenName: 'Mona', familyName: 'Managerson'},
            ...authors.map((a) => ({
                username: a.username,
                roles: ['author'],
                givenName: a.givenName,
                familyName: a.familyName,
            })),
            ...extraUsers,
        ],
    });
}

test.describe('Search (queue-drained index)', () => {
    test('S1: Find an article by a word in its title', async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const [wordA, wordB] = makeWords(2);
        const author = `aut${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const titleA = `The ${wordA} study`;
        const titleB = `Notes on ${wordB}`;
        const {submissionId: idA} = await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: titleA, published: true,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: titleB, published: true,
        });
        runJobs();

        // From the journal's home page, the header's "Search" opens the page
        // with an empty box.
        const search = new SearchPage(page, tag);
        await search.gotoJournalHome();
        await expect(search.headerSearchLink()).toHaveCount(1);
        await search.openFromHeader();
        await expect(search.queryBox()).toHaveValue('');
        await expect(search.headerSearchLink()).toHaveCount(0); // absent on the Search page itself

        // The title word finds exactly that article: title, contributors,
        // published date, no galley links; the other article is absent.
        await search.search(wordA);
        const result = await search.expectOnlyResult(titleA);
        await expect(result.locator('.meta .authors')).toHaveText('Ada Authorson (Author)');
        await expect(result.locator('.meta .published')).toHaveText(/^\s*\d{4}-\d{2}-\d{2}\s*$/);
        await expect(result.locator('.galleys_links')).toHaveCount(0);
        await expect(search.resultByTitle(titleB)).toHaveCount(0);
        await expect(search.pagination()).toContainText('1 - 1 of 1 items');

        // The title opens the landing page; Back returns to the page with
        // the word still in the box.
        await search.openResult(result, titleA);
        await expect(page).toHaveURL(new RegExp(`/${tag}/article/view/${idA}\\b`));
        await page.goBack();
        await search.expectOpen();
        await expect(search.queryBox()).toHaveValue(wordA);
    });

    test('S2: Abstract and contributor names are searched too', async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s2', testInfo);
        const [titleWord, abstractWord, nameWord, controlWord] = makeWords(4);
        const familyName = capitalize(nameWord);
        const authorA = `auta${tag}`;
        const authorB = `autb${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [
                {username: authorA, givenName: 'Zelda', familyName},
                {username: authorB, givenName: 'Sam', familyName: 'Smith'},
            ],
        });
        const titleA = `The ${titleWord} study`;
        const titleB = `Notes on ${controlWord}`;
        await ojsApi.createSubmission({
            tag, context: tag, submitter: authorA, title: titleA, published: true,
            abstract: `An abstract about ${abstractWord} and its measurement.`,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: authorB, title: titleB, published: true,
            abstract: 'A plain abstract about a regional periodical.',
        });
        runJobs();

        const search = new SearchPage(page, tag);
        await search.goto();

        // A word that appears only in the abstract.
        await search.search(abstractWord);
        await search.expectOnlyResult(titleA);
        await expect(search.resultByTitle(titleB)).toHaveCount(0);

        // A contributor's made-up family name.
        await search.search(familyName);
        const byName = await search.expectOnlyResult(titleA);
        await expect(byName.locator('.meta .authors')).toHaveText(`Zelda ${familyName} (Author)`);
        await expect(search.resultByTitle(titleB)).toHaveCount(0);

        // The title word typed all in capitals.
        await search.search(titleWord.toUpperCase());
        await search.expectOnlyResult(titleA);
        await expect(search.resultByTitle(titleB)).toHaveCount(0);
    });

    test('S3: Nothing found', async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s3', testInfo);
        const [word, nowhereWord] = makeWords(2);
        const author = `aut${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const title = `The ${word} study`;
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title, published: true,
        });
        runJobs();

        const search = new SearchPage(page, tag);
        await search.goto();

        // Positive control: the seeded word is found.
        await search.search(word);
        await search.expectOnlyResult(title);

        // A word that appears nowhere: empty list, "No Results".
        await search.search(nowhereWord);
        await search.expectNoResults();
        await expect(search.pagination()).toHaveCount(0);
        await expect(search.queryBox()).toHaveValue(nowhereWord);
    });

    test('S4: Only published articles are found', async ({page, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s4', testInfo);
        const [word] = makeWords(1);
        const author = `aut${tag}`;
        const manager = `mgr${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const publishedTitle = `The ${word} study`;
        const unpublishedTitle = `Another ${word} manuscript`;
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: publishedTitle, published: true,
        });
        await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title: unpublishedTitle,
            submitted: true, published: false,
        });
        runJobs();

        // A visitor: only the published article.
        const visitorSearch = new SearchPage(page, tag);
        await visitorSearch.goto();
        await visitorSearch.search(word);
        await visitorSearch.expectOnlyResult(publishedTitle);
        await expect(visitorSearch.resultByTitle(unpublishedTitle)).toHaveCount(0);

        // The Journal Manager, signed in: the same one article, still not
        // the unpublished submission (Rule 15).
        const managerPage = await (await asUser(manager)).newPage();
        const managerSearch = new SearchPage(managerPage, tag);
        await managerSearch.goto();
        await managerSearch.search(word);
        await managerSearch.expectOnlyResult(publishedTitle);
        await expect(managerSearch.resultByTitle(unpublishedTitle)).toHaveCount(0);
    });

    test('S5: Unpublishing removes, republishing restores', async ({page, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s5', testInfo);
        const [word] = makeWords(1);
        const author = `aut${tag}`;
        const manager = `mgr${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const title = `Notes on ${word}`;
        const {submissionId} = await ojsApi.createSubmission({
            tag, context: tag, submitter: author, title, published: true,
        });
        runJobs();

        // Listed while published (the control for every absence below).
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await search.expectOnlyResult(title);

        // The Journal Manager unpublishes it from the workflow's
        // Publication area.
        const managerPage = await (await asUser(manager)).newPage();
        const publication = new PublicationScreen(managerPage, tag);
        await publication.gotoWorkflow(submissionId);
        await publication.openEntry('Title & Abstract');
        await publication.unpublish();

        // A visitor's search reads "No Results" at once, no queue run.
        await search.search(word);
        await search.expectNoResults();

        // Published again: still absent until the background jobs run, then
        // listed again.
        await publication.publish();
        await search.search(word);
        await search.expectNoResults();
        runJobs();
        await search.search(word);
        await search.expectOnlyResult(title);
    });

    test('S6: Paging through a long list', async ({page, ojsApi}, testInfo) => {
        test.setTimeout(420_000); // 27 seeded publications plus one queue drain
        const tag = makeTag('s6', testInfo);
        const [word] = makeWords(1);
        const author = `aut${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const total = 27;
        for (let i = 1; i <= total; i++) {
            await ojsApi.createSubmission({
                tag, context: tag, submitter: author,
                title: `Paper ${i} on ${word}`, published: true,
            });
        }
        runJobs();

        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);

        // Page 1: 25 articles, "1 - 25 of 27 items", links "2", ">", ">>",
        // the current "1" as plain text.
        await expect(search.results()).toHaveCount(25);
        await expect(search.pagination()).toContainText('1 - 25 of 27 items');
        await expect(search.currentPageNumber()).toHaveText('1');
        await expect(search.pageLink('1')).toHaveCount(0);
        for (const label of ['2', '>', '>>']) {
            await expect(search.pageLink(label)).toBeVisible();
        }

        // Page 2: the remaining 2, "26 - 27 of 27 items", links "<<", "<",
        // "1", and the box still holds the word.
        await search.goToPage('2');
        await expect(search.results()).toHaveCount(2);
        await expect(search.pagination()).toContainText('26 - 27 of 27 items');
        await expect(search.currentPageNumber()).toHaveText('2');
        await expect(search.pageLink('2')).toHaveCount(0);
        for (const label of ['<<', '<', '1']) {
            await expect(search.pageLink(label)).toBeVisible();
        }
        await expect(search.queryBox()).toHaveValue(word);
    });

    test('S7: Narrow by publication date', async ({page, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s7', testInfo);
        const [word] = makeWords(1);
        const author = `aut${tag}`;
        const manager = `mgr${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [{username: author, givenName: 'Ada', familyName: 'Authorson'}],
        });
        const firstTitle = `${capitalize(word)} first-day article`;
        const fifteenthTitle = `${capitalize(word)} fifteenth-day article`;
        const seedToProduction = async (title) =>
            (
                await ojsApi.createSubmission({
                    tag, context: tag, submitter: author, title, decisions: TO_PRODUCTION,
                })
            ).submissionId;
        const firstId = await seedToProduction(firstTitle);
        const fifteenthId = await seedToProduction(fifteenthTitle);

        // The Journal Manager sets each article's Publication Date on the
        // workflow's Publication Settings page, then publishes it.
        const managerPage = await (await asUser(manager)).newPage();
        const publication = new PublicationScreen(managerPage, tag);
        const dateAndPublish = async (submissionId, date) => {
            await publication.gotoWorkflow(submissionId);
            await publication.openEntry('Publication Settings');
            const dateField = managerPage.locator(
                '[data-cy="workflow-primary-items"] input[name="datePublished"]'
            );
            await expect(dateField).toBeVisible({timeout: 30_000});
            await dateField.fill(date);
            await publication.save();
            await publication.publish();
        };
        await dateAndPublish(firstId, '2024-06-01');
        await dateAndPublish(fifteenthId, '2024-06-15');
        runJobs();

        // Both listed, with their chosen dates.
        const search = new SearchPage(page, tag);
        await search.goto();
        await search.search(word);
        await expect(search.results()).toHaveCount(2);
        await expect(search.resultByTitle(firstTitle).locator('.meta .published')).toHaveText('2024-06-01');
        await expect(search.resultByTitle(fifteenthTitle).locator('.meta .published')).toHaveText('2024-06-15');

        // "Published After" the 10th: only the 15th's article; the selects
        // still show the 10th.
        const tenth = {year: '2024', month: 'Jun', day: '10'};
        await search.setDate('dateFrom', tenth);
        await search.submit();
        await search.expectOnlyResult(fifteenthTitle);
        await expect(search.resultByTitle(firstTitle)).toHaveCount(0);
        await search.expectDate('dateFrom', tenth);
        await expect(search.queryBox()).toHaveValue(word);

        // "Published After" blank again, "Published Before" the 10th: only
        // the 1st's article.
        await search.clearDate('dateFrom');
        await search.setDate('dateTo', tenth);
        await search.submit();
        await search.expectOnlyResult(firstTitle);
        await expect(search.resultByTitle(fifteenthTitle)).toHaveCount(0);
        await search.expectDate('dateTo', tenth);
    });

    test('S8: Search the whole site', async ({page, ojsApi}, testInfo) => {
        test.slow();
        const tagA = makeTag('s8a', testInfo);
        const tagB = makeTag('s8b', testInfo);
        const [wordA, wordB] = makeWords(2);
        const nameA = `Alpha journal ${tagA}`;
        const nameB = `Beta journal ${tagB}`;
        const authorA = `aut${tagA}`;
        const authorB = `aut${tagB}`;
        await seedJournal(ojsApi, tagA, {
            name: nameA, authors: [{username: authorA, givenName: 'Ada', familyName: 'Authorson'}],
        });
        await seedJournal(ojsApi, tagB, {
            name: nameB, authors: [{username: authorB, givenName: 'Bea', familyName: 'Bookman'}],
        });
        const titleA = `The ${wordA} study`;
        const titleB = `Essay on ${wordB}`;
        const {submissionId: idA} = await ojsApi.createSubmission({
            tag: tagA, context: tagA, submitter: authorA, title: titleA, published: true,
        });
        const {submissionId: idB} = await ojsApi.createSubmission({
            tag: tagB, context: tagB, submitter: authorB, title: titleB, published: true,
        });
        runJobs();

        // The site-wide page is reached by typing its address.
        const search = new SearchPage(page, null);
        await search.goto();
        await expect(search.headerSearchLink()).toHaveCount(0);
        await expect(search.byJournalSelect()).toBeVisible();

        // The first word: the first journal's article, its journal's name
        // under the title, opening inside that journal.
        await search.search(wordA);
        const resultA = await search.expectOnlyResult(titleA);
        await expect(resultA.locator('.title a .subtitle')).toHaveText(nameA);
        await search.openResult(resultA, titleA);
        await expect(page).toHaveURL(new RegExp(`/${tagA}/article/view/${idA}\\b`));

        // The second word, likewise.
        await search.goto();
        await search.search(wordB);
        const resultB = await search.expectOnlyResult(titleB);
        await expect(resultB.locator('.title a .subtitle')).toHaveText(nameB);
        await search.openResult(resultB, titleB);
        await expect(page).toHaveURL(new RegExp(`/${tagB}/article/view/${idB}\\b`));

        // "By Journal" set to the first journal: its own word is still found
        // (control), the second journal's word gives "No Results".
        await search.goto();
        await search.byJournalSelect().selectOption({label: nameA});
        await search.search(wordA);
        await search.expectOnlyResult(titleA);
        await search.byJournalSelect().selectOption({label: nameA});
        await search.search(wordB);
        await search.expectNoResults();
    });

    test('S9: A journal that does not publish online', async ({page, asUser, ojsApi}, testInfo) => {
        test.slow();
        const tag = makeTag('s9', testInfo);
        const manager = `mgr${tag}`;
        const reader = `rdr${tag}`;
        await seedJournal(ojsApi, tag, {
            authors: [],
            extraUsers: [{username: reader, roles: ['reader'], givenName: 'Rosa', familyName: 'Reader'}],
        });

        // Control: while the journal publishes online, a visitor gets the
        // page from the header link.
        const visitor = new SearchPage(page, tag);
        await visitor.gotoJournalHome();
        await visitor.openFromHeader();

        // The Journal Manager switches the Publishing Mode off.
        const managerPage = await (await asUser(manager)).newPage();
        await setPublishingMode(managerPage, tag, 'none');

        // A visitor: the header still shows "Search"; pressing it lands on
        // the Login page.
        await visitor.gotoJournalHome();
        await expect(visitor.headerSearchLink()).toHaveCount(1);
        await visitor.headerSearchLink().click();
        await expect(page).toHaveURL(/\/login\b/);
        await expect(page.locator('form#login')).toBeVisible({timeout: 30_000});
        await expect(visitor.queryBox()).toHaveCount(0);

        // A signed-in Reader: the sentence instead of the page.
        const readerPage = await (await asUser(reader)).newPage();
        await readerPage.goto(visitor.url());
        await expect(readerPage.getByText(DOES_NOT_PUBLISH_TEXT)).toBeVisible({timeout: 30_000});
        await expect(readerPage.locator('input#query')).toHaveCount(0);

        // The Journal Manager: the Search page at the same address.
        const managerSearch = new SearchPage(managerPage, tag);
        await managerSearch.goto();

        // Open access restored: the visitor gets the page again.
        await setPublishingMode(managerPage, tag, 'open');
        await visitor.gotoJournalHome();
        await visitor.openFromHeader();
    });
});
