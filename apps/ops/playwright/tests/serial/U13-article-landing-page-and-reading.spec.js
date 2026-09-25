// @ts-check
/**
 * @file playwright/tests/serial/U13-article-landing-page-and-reading.spec.js
 *
 * Article landing page & reading — OPS suite, serial part: scenario 10
 * {OPS}, the preprint summary on a preprint server's lists ("Latest
 * preprints" on the home page, "Archives", a category page). S1–S8 are in
 * `../U13-article-landing-page-and-reading.spec.js`.
 * Spec: docs/specs/U13-article-landing-page-and-reading.md
 *
 * SERIAL PROJECT, by necessity: a category page lists what the search
 * index holds, and a posted preprint enters the index through a queued job;
 * the fleets run with `[queues] job_runner = Off`, so the preprint is on its
 * category page only after `runJobs()` has drained the queue, and that
 * drain pops the SHARED queue, which is safe in the serial project alone
 * (patterns.md parallel lesson 7).
 *
 * Deliberately NOT covered (register IDs from the spec's Findings
 * register): OPS6 🐞 (the preprint has no DOI), OPS9 🐞 (the summary is
 * opened by its title, never by its cover). The rest of the register is
 * the landing page's, read in the parallel file's header.
 *
 * Seeding: scenario endpoints only: a scratch preprint server with the
 * category "Oceans" (`categories`) and a throwaway Author (the username
 * twice as password), and one posted preprint carrying `subtitle`,
 * `coverImage`, `keywords`, `categories` and a `galleys[]` "PDF", as
 * footnote s says. The visitor is the fixture `page` (no user is set in
 * this file). Every absence is paired with a positive control read the
 * same way (M4, M6). Page objects: shared/playwright/pages/ArticleLandingPages.js.
 */
const {test, expect} = require('../../support/fixtures.js');
const {runJobs} = require('../../../../../shared/playwright/support/jobs.js');
const {ArticleLandingPage, ArticleSummaries, addressPattern} = require('../../../../../shared/playwright/pages/ArticleLandingPages.js');

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u13${scenario}opw${testInfo.parallelIndex}${Math.random().toString(36).replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
}

/** Today as the pages write it (the servers' clock is UTC, `Y-m-d`). */
function today() {
    return new Date().toISOString().slice(0, 10);
}

test.describe('article landing page and reading (serial)', () => {
    test('S10: the preprint summary on a preprint server\'s lists', async ({page, opsApi}, testInfo) => {
        test.setTimeout(240_000);
        const tag = makeTag('s10', testInfo);
        const author = `${tag}au`;
        await opsApi.createContext({
            tag,
            categories: [{path: 'oceans', title: 'Oceans'}],
            users: [{username: author, givenName: 'Ada', familyName: 'Author', email: `${author}@mail.test`, roles: ['author']}],
        });
        const submission = await opsApi.createSubmission({
            tag,
            context: tag,
            submitter: author,
            title: 'Tidal Patterns',
            subtitle: 'A field study',
            coverImage: {file: 'profile-image-400.png'},
            keywords: ['tide', 'current'],
            categories: ['oceans'],
            galleys: [{label: 'PDF', file: 'preprint.pdf'}],
            published: true,
        });
        runJobs();
        const id = submission.submissionId;
        const day = today();
        const landing = new ArticleLandingPage(page, tag, {op: 'preprint'});
        const details = `Downloads: 0 - Submitted ${day} - Posted ${day}`;

        /** The summary's parts, as "Latest preprints" and "Archives" show them. */
        async function expectFullSummary(summaries) {
            await expect(summaries.coverImage('Tidal Patterns')).toBeVisible();
            await expect(summaries.coverLink('Tidal Patterns')).toHaveAttribute('href', addressPattern(landing.url(id)));
            await expect(summaries.titleLink('Tidal Patterns')).toContainText('Tidal Patterns');
            await expect(summaries.subtitle('Tidal Patterns')).toHaveText('A field study');
            await expect(summaries.authors('Tidal Patterns')).toContainText('Ada Author');
            await expect(summaries.keywords('Tidal Patterns')).toHaveText(['tide', 'current']);
            await expect(summaries.details('Tidal Patterns')).toHaveText(details);
            await expect(summaries.galleyLinks('Tidal Patterns')).toHaveText(['PDF']);
        }

        // "Latest preprints": the cover, the title with "A field study", the
        // author line, "tide" and "current", "Downloads: 0 - Submitted
        // {today} - Posted {today}" and "PDF"; the title opens the
        // preprint's page (OPS6; Fields, the article summary; Rule 22).
        await page.goto(`/index.php/${tag}/index`);
        await expect(page.getByRole('heading', {name: 'Latest preprints', exact: true})).toBeVisible({timeout: 30_000});
        const home = new ArticleSummaries(page);
        await expectFullSummary(home);

        // Control: the details line ends at "Posted {today}", with no " -
        // Versions:" part (one version posted).
        await expect(home.details('Tidal Patterns')).not.toContainText('Versions');
        await home.titleLink('Tidal Patterns').click();
        await expect(page).toHaveURL(landing.urlPattern(id));
        await expect(landing.title()).toHaveText('Tidal Patterns');

        // "Archives": the main menu's "Archives" lists the same summary
        // (Fields, the article summary).
        await page.goto(`/index.php/${tag}/index`);
        await page.getByRole('navigation', {name: 'Site Navigation'}).getByRole('link', {name: 'Archives', exact: true}).click();
        await expect(page.getByRole('heading', {level: 1})).toHaveText('Archives');
        await expectFullSummary(new ArticleSummaries(page));

        // A category page: "Oceans" under "Categories" opens the category's
        // page, which lists "Tidal Patterns" with no galley link (the lists
        // above, read the same way, carried "PDF") (Rule 22).
        await landing.goto(id);
        await landing.sideValue('Categories').getByRole('link', {name: 'Oceans', exact: true}).click();
        await expect(page).toHaveURL(addressPattern(`/index.php/${tag}/preprints/category/oceans`));
        const category = new ArticleSummaries(page);
        await expect(category.titleLink('Tidal Patterns')).toBeVisible({timeout: 30_000});
        await expect(category.summary('Tidal Patterns')).toHaveCount(1);
        await expect(category.galleyLinks('Tidal Patterns')).toHaveCount(0);
        await expect(category.summary('Tidal Patterns').locator('a.obj_galley_link')).toHaveCount(0);
    });
});
