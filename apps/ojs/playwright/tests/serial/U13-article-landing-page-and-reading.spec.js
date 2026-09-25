// @ts-check
/**
 * @file playwright/tests/serial/U13-article-landing-page-and-reading.spec.js
 *
 * Article landing page & reading — OJS suite, the serial part: scenario 9
 * {OJS}, the article summary on a journal's lists. Scenarios 1–8 are in
 * ../U13-article-landing-page-and-reading.spec.js, whose header lists what
 * the suite deliberately does not cover.
 * Spec: docs/specs/U13-article-landing-page-and-reading.md
 *
 * Why serial: a category page lists the articles the search index holds
 * (`PKPCatalogHandler::category()` reads `SubmissionSearchResult`), and the
 * index is refreshed by a queued job the fleets never run on their own, so
 * the test publishes through the scenario API and drains the queue with
 * runJobs(), which pops the SHARED queue and is only safe in the serial
 * project (patterns.md parallel lesson 7).
 *
 * Seeding: a scratch journal with throwaway accounts (the username twice as
 * password), as footnote s says: `categories[]`, a published `issues[]`
 * entry with its `coverImage`, `themeOptions.journalContentOrganization`,
 * and the submissions' `subtitle`, `coverImage`, `categories`, `galleys[]`
 * with `genre`, `published` and `issue`. The visitor is the fixture `page`
 * (no default user). Every absence is paired with a positive control taken
 * the same way (M4, M6).
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {ArticleLandingPage, ArticleSummaries, addressPattern} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');

const COVER = {file: 'profile-image-400.png'};
const ISSUE_2026 = {volume: 1, number: 1, year: 2026};

/** Unique per-run tag: single alphanumeric token, feature + scenario + worker. */
function makeTag(scenario, testInfo) {
    return `u13${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/** Seed a scratch journal with a throwaway Journal Manager and Author; returns the author and the context's answer. */
async function seedJournal(ojsApi, tag, keys = {}) {
    const users = [user(`${tag}mg`, 'Mona', 'Manager', ['manager']), user(`${tag}au`, 'Ada', 'Author', ['author'])];
    const context = await ojsApi.createContext({tag, users, ...keys});
    return {author: `${tag}au`, context};
}

test.describe('article landing page and reading (serial)', () => {
    test('S9: the article summary on a journal\'s lists', async ({page, ojsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s9', testInfo);
        const {author, context} = await seedJournal(ojsApi, tag, {
            categories: [{path: 'oceans', title: 'Oceans'}],
            issues: [{...ISSUE_2026, published: true, coverImage: COVER}],
            themeOptions: {journalContentOrganization: [1, 2, 3]},
        });
        const issueId = context.issues[0].id;
        const [tidal, harbour] = await Promise.all([
            ojsApi.createSubmission({
                tag,
                context: tag,
                submitter: author,
                title: 'Tidal Patterns',
                subtitle: 'A field study',
                coverImage: COVER,
                categories: ['oceans'],
                galleys: [
                    {label: 'PDF', file: 'article.pdf', genre: 'Article Text'},
                    {label: 'Data', file: 'notes.md', genre: 'Data Set'},
                ],
                published: true,
                issue: ISSUE_2026,
            }),
            ojsApi.createSubmission({
                tag: `${tag}h`,
                context: tag,
                submitter: author,
                title: 'Harbour Currents',
                published: true,
                issue: ISSUE_2026,
            }),
        ]);
        // The category page lists what the search index holds, which a
        // queued job refreshes after the publish (the header's "Why serial").
        runJobs();
        const landing = new ArticleLandingPage(page, tag);
        const tidalAddress = addressPattern(landing.url(tidal.submissionId));
        const issueAddress = new RegExp(`/index\\.php/${tag}/issue/view/${issueId}$`);

        // The issue's cover on an article with none of its own: a link to
        // the issue's page (Fields, the side column, "Cover image").
        await landing.goto(harbour.submissionId);
        await expect(landing.coverLink()).toHaveAttribute('href', issueAddress);
        await expect(landing.coverLink().locator('img')).toBeVisible();
        await landing.coverLink().click();
        await expect(page).toHaveURL(issueAddress);

        // The issue's table of contents: the cover, title and subtitle,
        // the author line and "PDF" alone; the title and the cover open
        // the article's page (Fields, the article summary; Rule 22).
        const toc = new ArticleSummaries(page, page.locator('.obj_issue_toc'));
        await expect(toc.summary('Tidal Patterns')).toHaveCount(1);
        await expect(toc.coverImage('Tidal Patterns')).toBeVisible();
        await expect(toc.titleLink('Tidal Patterns')).toContainText('Tidal Patterns');
        await expect(toc.subtitle('Tidal Patterns')).toHaveText('A field study');
        await expect(toc.authors('Tidal Patterns')).toContainText('Ada Author');
        await expect(toc.galleyLinks('Tidal Patterns')).toHaveText(['PDF']);
        await toc.titleLink('Tidal Patterns').click();
        await expect(page).toHaveURL(tidalAddress);
        await expect(landing.title()).toHaveText('Tidal Patterns');
        await page.goBack();
        await expect(page).toHaveURL(issueAddress);
        await toc.coverLink('Tidal Patterns').click();
        await expect(page).toHaveURL(tidalAddress);
        await expect(landing.title()).toHaveText('Tidal Patterns');

        // The home page, from the breadcrumb's "Home": "Tidal Patterns"
        // with "PDF" and no "Data" (Rule 22). An article in a published
        // issue is listed under "Current Issue", never under "Latest
        // Publications", which lists only articles outside a published issue
        // (T-ojs-2, `.reports/U13/test-ojs-findings.md`): the current
        // issue's list is read.
        await landing.breadcrumbLinks().filter({hasText: /^\s*Home\s*$/}).click();
        await expect(page).toHaveURL(new RegExp(`/index\\.php/${tag}(/index)?$`));
        const current = new ArticleSummaries(page, page.locator('section.current_issue'));
        await expect(current.summary('Tidal Patterns')).toHaveCount(1, {timeout: 30_000});
        await expect(current.galleyLinks('Tidal Patterns')).toHaveText(['PDF']);

        // A category page: the title and cover, no galley link (Rule 22).
        await landing.goto(tidal.submissionId);
        await landing.sideValue('Categories').getByRole('link', {name: 'Oceans', exact: true}).click();
        await expect(page).toHaveURL(new RegExp(`/index\\.php/${tag}/catalog/category/oceans$`));
        const category = new ArticleSummaries(page);
        await expect(category.summary('Tidal Patterns')).toHaveCount(1);
        await expect(category.titleLink('Tidal Patterns')).toContainText('Tidal Patterns');
        await expect(category.coverImage('Tidal Patterns')).toBeVisible();
        await expect(category.galleyLinks('Tidal Patterns')).toHaveCount(0);

        // Control: the article's own page lists "PDF" and, in a second
        // list, "Data" (Rule 10).
        await landing.goto(tidal.submissionId);
        await expect(landing.galleyLinks()).toHaveText(['PDF']);
        await expect(landing.additionalFileLinks()).toHaveText(['Data']);
    });
});
