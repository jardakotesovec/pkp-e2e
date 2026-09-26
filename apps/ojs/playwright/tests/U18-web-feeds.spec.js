// @ts-check
/**
 * @file playwright/tests/U18-web-feeds.spec.js
 *
 * Web feeds — OJS suite, one test per canonical scenario: S1–S8, all common
 * to the three apps, with the {OJS} bullets inline ("Future Tides"
 * scheduled in an unpublished issue, "…on issue pages only.", the
 * current-issue choice with Rule 16d, the A5 list choice of a new journal).
 * Spec: docs/specs/U18-web-feeds.md
 *
 * Deliberately NOT covered (register IDs from the spec's Findings register;
 * a 🐞 is never asserted as the contract, a ❓ is parked, not a gap; the
 * spec's Coverage section is the record of everything else left out):
 * - A1 🐞: S7 never reads the RSS 2.0 feed of the journal with nothing
 *   published.
 * - A2 🐞: no unknown feed name is opened.
 * - A3 🐞, A7 🐞: S5's "Gamma" carries no keyword, subject or discipline,
 *   and no ISBN line is looked for.
 * - A4 ❓: S4 reads the header's links, never the box, at each choice.
 * - A8 🐞, OPS1 🐞: a press's and a preprint server's, in those suites.
 * - A6 ❓ is read where S7 states it (the "Journal Summary" with its tags
 *   written out); no "License Terms" are saved.
 *
 * Seeding: scenario endpoints only, as footnote s says; publicknowledge and
 * the seeded roster are only read. Every scenario runs on its own scratch
 * journal, its path the test's unique tag, with throwaway accounts (the
 * username twice as password): an Author who submits every article, a
 * Journal Manager in S2–S7, a Reader in S8. Articles are published by the
 * submission scenario (`published`, `datePublished`), one after another in
 * the order the recent list follows; S1's "Future Tides" is `published`
 * into the unpublished issue, so scheduled; S3 alone passes `plugins`
 * (the saved number 5) and no test seeds `sidebar` (S3 places the box on
 * screen); S7 names the journal, its initials and its principal contact;
 * S8 passes `restrictSiteAccess`. The scratch journal has no Country and no
 * key sets one, so S7 picks one on the "Masthead" tab before that tab's
 * "Save" (T-ojs-1). Articles seeded back to back are a second apart on
 * the server's clock (the last change is stamped to the second). The empty-journal reads (S6, S7) use a
 * new scratch journal: publicknowledge collects the suites' published
 * items. Every signed-in actor gets its own `asUser` context; the visitor
 * is a browser context with an empty storage state (patterns.md, parallel
 * lesson 8). The feeds are read with the visitor's request context and
 * parsed (WebFeedPages.readFeed); the RSS 1.0 address is also opened in
 * the browser, which downloads "rss.rdf", and the Atom and RSS 2.0
 * addresses show as text. Every Settings › Website › "Plugins" load fires
 * the Plugin Gallery grid's server 500 (U62's finding): not asserted here.
 * Every absence is read settled and paired with a positive control taken
 * the same way (M4, M6): a feed's whole list of titles beside the absent
 * title, the header's feed links counted on a page that is loaded, a row's
 * arrow counted before and after, the "Sidebar" list's other boxes beside
 * the missing one. Everything here runs in the parallel `ojs` project.
 */
const {test: base, expect} = require('../support/fixtures.js');
const {
    FEED_TYPES,
    WEB_FEED_TEXT: W,
    feedPath,
    gatewayPath,
    readFeed,
    downloadFeed,
    openFeedInBrowser,
    discoveryLinks,
    discoveryHrefs,
    PublicPages,
    WebFeedPluginRow,
    pastCloseWindow,
} = require('../../../../shared/playwright/pages/WebFeedPages.js');
const {SidebarSetup} = require('../../../../shared/playwright/pages/CustomContentPages.js');
const {SettingsPages, SettingsForm} = require('../../../../shared/playwright/pages/ContextIdentityPages.js');
const {todayCandidates} = require('../../../../shared/playwright/pages/ArticleLandingPages.js');
const {LoginPage} = require('../../../../shared/playwright/pages/LoginPage.js');
const {PublishScreen} = require('../pages/PublishSchedulePages.js');

const ALL_PAGES = 'Display web feed links on all application pages.';
const HOMEPAGE_AND_ISSUES = 'Display web feed links on homepage and issue pages only.';
const ISSUE_PAGES = 'Display web feed links on issue pages only.';
const CURRENT_ISSUE = 'Display items in current published issue.';
const RECENT = 'Display a fixed number of the most recent publications.';
const PUBLISH_QUESTION = 'Are you sure you want to publish this?';

/** A visitor's page: a second browser context with no session at all (parallel lesson 8). */
const test = base.extend({
    visitor: async ({browser, baseURL}, use) => {
        const context = await browser.newContext({baseURL, storageState: {cookies: [], origins: []}, reducedMotion: 'reduce'});
        const page = await context.newPage();
        await use(page);
        await context.close();
    },
});

/** Unique per-run tag: single alphanumeric token, feature + scenario + app + worker. */
function makeTag(scenario, testInfo) {
    return `u18${scenario}ojw${testInfo.parallelIndex}${Math.random().toString(36).slice(2, 8)}`;
}

/** A throwaway account for `createContext`'s `users[]`. */
function user(username, givenName, familyName, roles) {
    return {username, givenName, familyName, email: `${username}@mail.test`, roles};
}

/**
 * A scratch journal with the throwaway Author (`${tag}au`, Ada Author) and,
 * with `manager`, a Journal Manager (`${tag}mg`), plus `extra` accounts and
 * context keys. Returns the createContext answer.
 */
async function seedJournal(ojsApi, tag, {manager = true, extra = [], ...keys} = {}) {
    return ojsApi.createContext({
        tag,
        users: [
            ...(manager ? [user(`${tag}mg`, 'Mona', 'Manager', ['manager'])] : []),
            user(`${tag}au`, 'Ada', 'Author', ['author']),
            ...extra,
        ],
        ...keys,
    });
}

/** An article submitted by the journal's Author; returns its submission id. */
async function seedArticle(ojsApi, tag, title, extra = {}) {
    const {submissionId} = await ojsApi.createSubmission({
        tag: `${tag}${title.replace(/[^A-Za-z]/g, '').slice(0, 6).toLowerCase()}`,
        context: tag,
        submitter: `${tag}au`,
        title,
        ...extra,
    });
    return submissionId;
}

/** A "Sidebar" box's row label (the row's name, without its order buttons' words). */
function sidebarLabel(box) {
    return box.locator('xpath=ancestor::label[1]').locator('.pkpFormField--options__optionLabel').first();
}

/**
 * Wait until the server's clock (the Date header of a static file) shows a
 * later second than when called. A submission's last change is stamped to
 * the second, so articles seeded within one second tie in the recent list,
 * whose order then is the database's; the scenarios publish them one after
 * another, as a person does.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 */
async function nextServerSecond(request) {
    const serverNow = async () => Date.parse((await request.head('/README.md')).headers()['date'] || '');
    const start = await serverNow();
    await expect.poll(serverNow, {intervals: [250], timeout: 10_000}).toBeGreaterThan(start);
}

/** A signed-in actor's page (its own `asUser` context). */
async function actorPage(asUser, username) {
    return (await asUser(username)).newPage();
}

/** Read the three feeds through the visitor's request context: {atom, rss2, rss}. */
async function readAll(visitor, tag) {
    const out = {};
    for (const type of FEED_TYPES) {
        out[type] = await readFeed(visitor.request, feedPath(tag, type), type);
        expect(out[type].status, `the ${type} feed answers`).toBe(200);
        expect(out[type].contentType, `the ${type} feed is XML`).toMatch(/xml/);
    }
    return out;
}

/** The three feeds' item titles, each feed's list in order. */
async function titlesOfAll(visitor, tag) {
    const feeds = await readAll(visitor, tag);
    return Object.fromEntries(FEED_TYPES.map((type) => [type, feeds[type].items.map((i) => i.title)]));
}

/** Expect each of the three feeds to list exactly `titles`, in order. */
async function expectFeedTitles(visitor, tag, titles) {
    const all = await titlesOfAll(visitor, tag);
    for (const type of FEED_TYPES) {
        expect(all[type], `the ${type} feed's items`).toEqual(titles);
    }
}

/** The three feed addresses of a journal (paths), sorted as discoveryHrefs sorts them. */
function feedPaths(tag) {
    return FEED_TYPES.map((type) => feedPath(tag, type)).sort();
}

/**
 * Publish the version shown on the workflow: the publish button, the
 * "Review Publishing Details" panel when it opens (its version selects
 * filled only when empty; the page object returns it once its "Issue
 * Assignment" preselection is in; the U13 S3 flake), then the window's
 * "Publish". The page object presses a swallowed press again (U49 fn-k).
 *
 * @param {PublishScreen} pub
 */
async function publishShown(pub) {
    const confirmation = pub.confirmationDialog(PUBLISH_QUESTION);
    const panel = await pub.pressPublish({or: confirmation});
    if (panel) {
        const stage = panel.locator('select[name="versionStage"]');
        if (!(await stage.inputValue())) await stage.selectOption('VoR');
        const minor = panel.locator('select[name="versionIsMinor"]');
        if ((await minor.isVisible()) && !(await minor.inputValue())) await minor.selectOption('false');
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
    }
    await expect(confirmation).toBeVisible({timeout: 30_000});
    await pub.confirmPublish(confirmation, 'Publish');
    await pub.expectStatus('Published');
}

test.describe('Web feeds', () => {
    test('S1: The three feeds of a journal with a published article', async ({ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s1', testInfo);
        const other = `${tag}b`;
        await seedJournal(ojsApi, tag, {
            manager: false,
            context: {name: 'Sea Letters'},
            issues: [{volume: 1, number: 2, year: 2026}],
        });
        const articleId = await seedArticle(ojsApi, tag, 'Tidal Patterns', {
            abstract: 'Tides follow the moon.',
            published: true,
            datePublished: '2024-03-05',
        });
        await seedArticle(ojsApi, tag, 'Draft Study');
        await seedArticle(ojsApi, tag, 'Future Tides', {published: true, issue: {volume: 1, number: 2, year: 2026}});
        await seedJournal(ojsApi, other, {manager: false});
        await seedArticle(ojsApi, other, 'Elsewhere', {published: true});
        const pages = new PublicPages(visitor, tag);
        const home = new RegExp(`/index\\.php/${tag}$`);
        const articlePage = new RegExp(`/index\\.php/${tag}/article/view/${articleId}$`);

        // The Atom feed: the browser shows marked-up text with no tab title;
        // titled "Sea Letters", linked to the home page, one item "Tidal
        // Patterns" with its page, "Ada Author", the abstract and the date
        // (Rules 1, 7, 8; Fields).
        const atomShown = await openFeedInBrowser(visitor, feedPath(tag, 'atom'));
        expect(atomShown.status).toBe(200);
        expect(atomShown.contentType).toMatch(/^application\/atom\+xml/);
        expect(atomShown.title, 'no tab title').toBe('');
        expect(atomShown.text).toContain('Tidal Patterns');
        const feeds = await readAll(visitor, tag);
        const atom = feeds.atom;
        expect(atom.title).toBe('Sea Letters');
        expect(atom.link).toMatch(home);
        expect(atom.items.map((i) => i.title)).toEqual(['Tidal Patterns']);
        expect(atom.items[0].link).toMatch(articlePage);
        expect(atom.items[0].authors).toEqual(['Ada Author']);
        expect(atom.items[0].summary).toBe('Tides follow the moon.');
        expect(atom.items[0].date).toBe('2024-03-05T00:00:00+00:00');

        // The RSS 2.0 feed: text again, the same one item, "Ada Author
        // (Author)", the RSS date, the language "en" (Rule 2; Fields).
        const rss2Shown = await openFeedInBrowser(visitor, feedPath(tag, 'rss2'));
        expect(rss2Shown.status).toBe(200);
        expect(rss2Shown.contentType).toMatch(/^application\/rss\+xml/);
        expect(rss2Shown.title, 'no tab title').toBe('');
        expect(rss2Shown.text).toContain('Tidal Patterns');
        const rss2 = feeds.rss2;
        expect(rss2.items.map((i) => i.title)).toEqual(['Tidal Patterns']);
        expect(rss2.items[0].link).toMatch(articlePage);
        expect(rss2.items[0].authors).toEqual(['Ada Author (Author)']);
        expect(rss2.items[0].date).toBe('Tue, 05 Mar 2024 00:00:00 +0000');
        expect(rss2.language).toBe('en');

        // The RSS 1.0 feed: the browser downloads "rss.rdf", which holds the
        // same item, dated "2024-03-05", and the language "en" (Rule 2).
        const rdf = await downloadFeed(visitor, feedPath(tag, 'rss'));
        expect(rdf.filename).toBe(W.downloadName);
        expect(rdf.items.map((i) => i.title)).toEqual(['Tidal Patterns']);
        expect(rdf.items[0].link).toMatch(articlePage);
        expect(rdf.items[0].date).toBe('2024-03-05');
        expect(rdf.language).toBe('en');
        expect(feeds.rss.items.map((i) => i.title)).toEqual(['Tidal Patterns']);

        // Not in the feeds: "Draft Study", "Future Tides" and "Elsewhere",
        // beside the one item each lists (Rule 3).
        for (const [type, feed] of [...Object.entries(feeds), ['downloaded rss', rdf]]) {
            for (const absent of ['Draft Study', 'Future Tides', 'Elsewhere']) {
                expect(feed.body, `${absent} in the ${type} feed`).not.toContain(absent);
            }
        }

        // The item's link: it opens the article's page of "Tidal Patterns" (Rule 7).
        await visitor.goto(atom.items[0].link);
        await expect(visitor.locator('h1.page_title')).toHaveText('Tidal Patterns', {timeout: 30_000});

        // Other gateway addresses: the gateway alone lands on the home page;
        // an unknown plugin name answers "404 Not Found" (Rule 15).
        await pages.open('/gateway');
        await expect(visitor).toHaveURL(new RegExp(`/index\\.php/${tag}(/index)?$`));
        await expect(pages.homeBlock()).toHaveCount(1);
        await expect(visitor).toHaveTitle('Sea Letters');
        await pages.expectNotFound(gatewayPath(tag, '/plugin/NoSuchPlugin/atom'));

        // Control: the second journal's Atom feed holds "Elsewhere" (Rule 3).
        const elsewhere = await readFeed(visitor.request, feedPath(other, 'atom'), 'atom');
        expect(elsewhere.status).toBe(200);
        expect(elsewhere.items.map((i) => i.title)).toEqual(['Elsewhere']);
    });

    test('S2: The feeds follow publishing', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s2', testInfo);
        await seedJournal(ojsApi, tag);
        const tidalId = await seedArticle(ojsApi, tag, 'Tidal Patterns', {published: true, datePublished: '2024-03-05'});
        await nextServerSecond(visitor.request);
        await seedArticle(ojsApi, tag, 'Coral Reefs', {published: true});
        const page = await actorPage(asUser, `${tag}mg`);
        const pub = new PublishScreen(page, tag);

        // Before: each feed lists "Coral Reefs", then "Tidal Patterns" (Rules 2, 3, 4).
        await expectFeedTitles(visitor, tag, ['Coral Reefs', 'Tidal Patterns']);

        // Unpublished: each feed lists "Coral Reefs" alone (Rule 3).
        await pub.gotoWorkflow(tidalId);
        await pub.openEntry('Title & Abstract');
        await pub.expectStatus('Published');
        await pub.unpublish();
        await expectFeedTitles(visitor, tag, ['Coral Reefs']);

        // Published again: "Tidal Patterns" is back, first on a journal (Rules 3, 4a).
        await publishShown(pub);
        await expectFeedTitles(visitor, tag, ['Tidal Patterns', 'Coral Reefs']);

        // A second version, retitled and published: the item reads "Tidal
        // Patterns Revisited" and carries the new version's date, no longer
        // 2024-03-05 (Rule 7; Fields, "What each item carries").
        const dialog = await pub.openCreateVersionDialog();
        await pub.confirmVersionDialog(dialog);
        await pub.openVersionEntry('Version of Record 1.1', 'Title & Abstract');
        await pub.setRichText('titleAbstract-title-control-en', 'Tidal Patterns Revisited');
        await pub.save();
        await publishShown(pub);
        const feeds = await readAll(visitor, tag);
        const today = todayCandidates();
        for (const type of FEED_TYPES) {
            const titles = feeds[type].items.map((i) => i.title);
            expect([...titles].sort(), `the ${type} feed's items`).toEqual(['Coral Reefs', 'Tidal Patterns Revisited']);
            expect(feeds[type].body, `the old title in the ${type} feed`).not.toMatch(/Tidal Patterns(?! Revisited)/);
            const item = feeds[type].items.find((i) => i.title === 'Tidal Patterns Revisited');
            if (type === 'rss2') {
                expect(item && item.date).not.toBe('Tue, 05 Mar 2024 00:00:00 +0000');
                const shown = new Date(String(item && item.date)).toISOString().slice(0, 10);
                expect(today, `the RSS 2.0 date ${item && item.date}`).toContain(shown);
            } else {
                expect(item && item.date).not.toMatch(/^2024-03-05/);
                expect(today, `the ${type} date ${item && item.date}`).toContain(String(item && item.date).slice(0, 10));
            }
        }

        // Control: "Coral Reefs" stayed in the three feeds throughout (Rule 3),
        // read above at every step; still dated as seeded.
        for (const type of FEED_TYPES) {
            expect(feeds[type].items.map((i) => i.title)).toContain('Coral Reefs');
        }
    });

    test('S3: The "Latest publications" box, and the plugin switched off', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s3', testInfo);
        await seedJournal(ojsApi, tag, {plugins: {webfeedplugin: {enabled: true, settings: {recentItems: 5}}}});
        const articleId = await seedArticle(ojsApi, tag, 'Tidal Patterns', {published: true});
        const page = await actorPage(asUser, `${tag}mg`);
        const pages = new PublicPages(visitor, tag);
        const box = pages.box;

        // Control: before the first "Save", the home page has no "Latest
        // publications" box while its header already carries the three feed
        // links (Rules 1, 12).
        await pages.home();
        await expect(discoveryLinks(visitor)).toHaveCount(3);
        expect(await discoveryHrefs(visitor)).toEqual(feedPaths(tag));
        await expect(box.block).toHaveCount(0);

        // Placed: "Sidebar" lists "Web Feed Plugin", unticked; tick it and
        // "Save" (Settings bullet 6).
        const sidebar = new SidebarSetup(page, tag);
        await sidebar.goto();
        const feedBox = sidebar.box('WebFeedBlockPlugin');
        await expect(feedBox).toHaveCount(1);
        await expect(sidebarLabel(feedBox)).toHaveText(W.pluginName);
        await expect(feedBox).not.toBeChecked();
        expect(await sidebar.place('WebFeedBlockPlugin', true)).toBe(200);

        // The box: headed "Latest publications", three logo links, on the
        // home page, "About the Journal" and the article's page (Rule 11).
        for (const open of [() => pages.home(), () => pages.about(), () => pages.article(articleId)]) {
            await open();
            await expect(box.block).toBeVisible();
            await expect(box.heading).toHaveText(W.boxHeading);
            await expect(box.links).toHaveCount(3);
            expect(await box.logoTexts()).toEqual([W.logos.atom, W.logos.rss2, W.logos.rss]);
        }

        // Its links: "Atom logo" and "RSS2 logo" show the feed as text
        // listing "Tidal Patterns"; "RSS1 logo" downloads "rss.rdf" (Rule 11).
        await pages.home();
        await box.link(W.logos.atom).click();
        await expect(visitor).toHaveURL(new RegExp(`${feedPath(tag, 'atom')}$`));
        await expect(visitor.locator('body')).toContainText('Tidal Patterns');
        await visitor.goBack();
        await expect(box.block).toBeVisible();
        await box.link(W.logos.rss2).click();
        await expect(visitor).toHaveURL(new RegExp(`${feedPath(tag, 'rss2')}$`));
        await expect(visitor.locator('body')).toContainText('Tidal Patterns');
        await visitor.goBack();
        await expect(box.block).toBeVisible();
        const download = visitor.waitForEvent('download');
        await box.link(W.logos.rss).click();
        expect((await download).suggestedFilename()).toBe(W.downloadName);

        // Switched off: untick "Web Feed Plugin" and confirm; its row keeps
        // no arrow (Rule 14a).
        const plugins = new WebFeedPluginRow(page, tag);
        await plugins.goto();
        await expect(plugins.arrow).toHaveCount(1);
        const question = await plugins.setEnabled(false);
        expect(question).toContain(W.disableQuestion);
        await expect(plugins.row).toBeVisible();
        await expect(plugins.arrow).toHaveCount(0);

        // The home page: no box and no feed link in its header; the three
        // addresses answer "404 Not Found" (Rule 14; Settings bullet 1).
        await pages.home();
        await expect(pages.homeBlock()).toHaveCount(1);
        await expect(box.block).toHaveCount(0);
        await expect(discoveryLinks(visitor)).toHaveCount(0);
        for (const type of FEED_TYPES) {
            await pages.expectNotFound(feedPath(tag, type));
        }

        // "Sidebar" no longer lists "Web Feed Plugin" while it lists the
        // other blocks; the tab is left unsaved (Rule 14).
        await sidebar.goto();
        await expect(sidebar.box('languagetoggleblockplugin')).toHaveCount(1);
        await expect(sidebar.box('WebFeedBlockPlugin')).toHaveCount(0);
        await expect(sidebar.form).not.toContainText(W.pluginName);

        // Switched on again: the arrow opens "Settings", whose window reads
        // 5; the box, the header's feed links and the Atom feed's item are
        // back (Rules 12, 14).
        await plugins.goto();
        expect(await plugins.setEnabled(true)).toBeNull();
        await expect(plugins.arrow).toHaveCount(1);
        const window = await plugins.openSettings();
        await expect(window.numberBox).toHaveValue('5');
        await window.cancel();
        await pages.home();
        await expect(box.block).toBeVisible();
        await expect(box.links).toHaveCount(3);
        await expect(discoveryLinks(visitor)).toHaveCount(3);
        expect(await discoveryHrefs(visitor)).toEqual(feedPaths(tag));
        const atom = await readFeed(visitor.request, feedPath(tag, 'atom'), 'atom');
        expect(atom.status).toBe(200);
        expect(atom.items.map((i) => i.title)).toEqual(['Tidal Patterns']);
    });

    test('S4: Where the feeds are advertised', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s4', testInfo);
        const context = await seedJournal(ojsApi, tag, {issues: [{volume: 1, number: 1, year: 2024, published: true}]});
        const issueId = context.issues[0].id;
        const articleId = await seedArticle(ojsApi, tag, 'Tidal Patterns', {published: true, issue: {volume: 1, number: 1, year: 2024}});
        const page = await actorPage(asUser, `${tag}mg`);
        const pages = new PublicPages(visitor, tag);
        const plugins = new WebFeedPluginRow(page, tag);
        const three = feedPaths(tag);

        // The plugin's window: "Web Feed Plugin" ticked under "Generic
        // Plugins"; the window titled "Web Feed Plugin" with its
        // description, the heading "Settings", the homepage-and-issues
        // choice, "Display a fixed number…" [A5], 30, "Include identifiers…"
        // unticked, "Cancel" and "OK" (Rules 1, 17; Fields).
        await plugins.goto();
        await expect(plugins.enabledBox).toBeChecked();
        await expect(plugins.categoryHeading()).toHaveText('Generic Plugins');
        let window = await plugins.openSettings();
        await expect(window.title).toHaveText(W.pluginName);
        await expect(window.description).toContainText(W.descriptionFirst);
        await expect(window.description).toContainText(W.descriptionSecond);
        await expect(window.heading).toHaveText(W.settingsHeading);
        await expect(window.labelled('radio', HOMEPAGE_AND_ISSUES)).toBeChecked();
        expect(await window.chosen('displayPage')).toBe('homepage');
        await expect(window.labelled('radio', RECENT)).toBeChecked();
        await expect(window.labelled('radio', CURRENT_ISSUE)).not.toBeChecked();
        expect(await window.chosen('displayItems')).toBe('recent');
        await expect(window.numberBoxNamed(W.numberLabel)).toHaveValue('30');
        await expect(window.labelled('checkbox', W.includeIdentifiers)).not.toBeChecked();
        await expect(window.okButton).toBeVisible();
        await expect(window.cancelLink).toBeVisible();
        await window.cancel();

        // A new journal's discovery links: the home page, the "Archive" and
        // the page of Vol. 1 No. 1 carry the three (Rule 12).
        for (const open of [() => pages.home(), () => pages.archive(), () => pages.issue(issueId)]) {
            await open();
            expect(await discoveryHrefs(visitor)).toEqual(three);
        }

        // Control: before the first "OK", "About the Journal" and the
        // article's page carry no feed link (Rule 12).
        for (const open of [() => pages.about(), () => pages.article(articleId)]) {
            await open();
            await expect(discoveryLinks(visitor)).toHaveCount(0);
        }

        // "…on all application pages.": "OK" closes the window with "Your
        // changes have been saved."; About and the article's page now carry
        // the three (Rules 12, 16; Side effects).
        await plugins.goto();
        window = await plugins.openSettings();
        await window.labelled('radio', ALL_PAGES).check();
        await window.okAccepted();
        for (const open of [() => pages.about(), () => pages.article(articleId)]) {
            await open();
            expect(await discoveryHrefs(visitor)).toEqual(three);
        }

        // "…on issue pages only." {OJS}: the home page carries no feed link;
        // the "Archive" and the issue's page still carry the three (Rule 12).
        await plugins.goto();
        window = await plugins.openSettings();
        await window.labelled('radio', ISSUE_PAGES).check();
        await window.okAccepted();
        await pages.home();
        await expect(pages.homeBlock()).toHaveCount(1);
        await expect(discoveryLinks(visitor)).toHaveCount(0);
        for (const open of [() => pages.archive(), () => pages.issue(issueId)]) {
            await open();
            expect(await discoveryHrefs(visitor)).toEqual(three);
        }
    });

    test('S5: Which articles, and how many', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s5', testInfo);
        const issue = {volume: 1, number: 1, year: 2024};
        const context = await seedJournal(ojsApi, tag, {
            issues: [{...issue, published: true}],
            categories: [
                {path: 'cat-one', title: 'Cat One'},
                {path: 'cat-two', title: 'Cat Two'},
            ],
        });
        const issueId = context.issues[0].id;
        await seedArticle(ojsApi, tag, 'Alpha', {published: true, datePublished: '2024-03-03', issue});
        await nextServerSecond(visitor.request);
        await seedArticle(ojsApi, tag, 'Beta', {published: true, datePublished: '2024-03-02', issue});
        await nextServerSecond(visitor.request);
        await seedArticle(ojsApi, tag, 'Gamma', {
            published: true,
            datePublished: '2024-03-01',
            abstract: 'Currents turn at dusk.',
            categories: ['cat-one', 'cat-two'],
        });
        const page = await actorPage(asUser, `${tag}mg`);
        const pages = new PublicPages(visitor, tag);
        const plugins = new WebFeedPluginRow(page, tag);
        const gammaOf = (feed) => feed.items.find((i) => i.title === 'Gamma');

        // The most recently changed first: "Gamma", "Beta", "Alpha";
        // "Gamma" carries "Cat One" and "Cat Two" and the abstract alone
        // (Rules 2, 4); control: no "Categories:" line yet (Rule 9).
        let feeds = await readAll(visitor, tag);
        for (const type of FEED_TYPES) {
            expect(feeds[type].items.map((i) => i.title), `the ${type} feed's items`).toEqual(['Gamma', 'Beta', 'Alpha']);
            const gamma = gammaOf(feeds[type]);
            expect(gamma && gamma.terms, `"Gamma"'s ${type} terms`).toEqual(expect.arrayContaining(['Cat One', 'Cat Two']));
            expect(gamma && gamma.summary, `"Gamma"'s ${type} summary`).toBe('Currents turn at dusk.');
            expect(gamma && gamma.summaryLines.some((l) => l.startsWith('Categories:')), 'a "Categories:" line').toBe(false);
        }

        // "Include identifiers…" ticked: "Gamma"'s summary opens with
        // "Section: Articles" and "Categories: Cat One, Cat Two", then an
        // empty line and the abstract (Rule 9; Settings bullet 5).
        await plugins.goto();
        let window = await plugins.openSettings();
        await window.labelled('checkbox', W.includeIdentifiers).check();
        await window.okAccepted();
        feeds = await readAll(visitor, tag);
        for (const type of FEED_TYPES) {
            const gamma = gammaOf(feeds[type]);
            expect(gamma && gamma.summaryLines, `"Gamma"'s ${type} summary`).toEqual([
                'Section: Articles',
                'Categories: Cat One, Cat Two',
                '',
                'Currents turn at dusk.',
            ]);
        }

        // A number below the count: 2 lists "Gamma" and "Beta", no "Alpha"
        // (Rule 4; Settings bullet 4).
        await plugins.goto();
        window = await plugins.openSettings();
        await window.typeNumber('2');
        await window.okAccepted();
        await expectFeedTitles(visitor, tag, ['Gamma', 'Beta']);

        // "Display items in current published issue." {OJS} with the box
        // emptied: saved, reopened as 0 (Rule 16d); the issue's page lists
        // "Alpha" and "Beta", and the feeds list the same two in either
        // order, no "Gamma" (Rules 5, 5a; Settings bullet 3).
        await plugins.goto();
        window = await plugins.openSettings();
        await window.labelled('radio', CURRENT_ISSUE).check();
        await window.typeNumber('');
        await window.okAccepted();
        await plugins.goto();
        window = await plugins.openSettings();
        await expect(window.labelled('radio', CURRENT_ISSUE)).toBeChecked();
        await expect(window.numberBox).toHaveValue('0');
        await window.cancel();
        await pages.issue(issueId);
        await expect(pages.tocTitles()).toHaveCount(2);
        const toc = (await pages.tocTitles().allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
        expect([...toc].sort()).toEqual(['Alpha', 'Beta']);
        // Compared as a set: the two articles share the issue's order
        // number (0, as scheduling leaves it), and the page and the feeds
        // each list the tie as their own query returns it (Rule 5a; fix
        // list B, flake-s26).
        const feedTitles = await titlesOfAll(visitor, tag);
        for (const type of FEED_TYPES) {
            expect([...feedTitles[type]].sort(), `the ${type} feed's items`).toEqual([...toc].sort());
        }
    });

    test('S6: The window\'s number box, "Cancel" and leaving unsaved', async ({asUser, ojsApi}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s6', testInfo);
        await seedJournal(ojsApi, tag);
        const page = await actorPage(asUser, `${tag}mg`);
        const dialogs = [];
        page.on('dialog', (dialog) => {
            dialogs.push({type: dialog.type(), message: dialog.message()});
            dialog.accept().catch(() => {});
        });
        const plugins = new WebFeedPluginRow(page, tag);
        const openWindow = async () => {
            await plugins.goto();
            return plugins.openSettings();
        };
        /** The window as a new journal has it: the homepage choice, 30, the box unticked. */
        const expectUnsaved = async (window) => {
            await expect(window.labelled('radio', HOMEPAGE_AND_ISSUES)).toBeChecked();
            await expect(window.numberBoxNamed(W.numberLabel)).toHaveValue('30');
            await expect(window.labelled('checkbox', W.includeIdentifiers)).not.toBeChecked();
        };

        // "Cancel": the changes dropped with no question (Fields, the window).
        let window = await openWindow();
        await window.labelled('radio', ALL_PAGES).check();
        await window.typeNumber('5');
        await window.labelled('checkbox', W.includeIdentifiers).check();
        await window.cancel();
        expect(dialogs, 'no question on "Cancel"').toEqual([]);
        window = await openWindow();
        await expectUnsaved(window);

        // "×" after a change: the browser's question, accepted; nothing saved.
        await window.typeNumber('5');
        await window.numberBox.blur();
        await window.closeButton.click();
        await expect(window.form).toHaveCount(0, {timeout: 30_000});
        expect(dialogs.map((d) => d.message)).toEqual([W.leaveQuestion]);
        await pastCloseWindow(page);
        window = await openWindow();
        await expect(window.numberBox).toHaveValue('30');

        // Leaving the page: the browser asks whether to leave; nothing saved.
        dialogs.length = 0;
        await window.typeNumber('5');
        await window.numberBox.blur();
        await page.reload();
        expect(dialogs.map((d) => d.type)).toEqual(['beforeunload']);
        window = await openWindow();
        await expect(window.numberBox).toHaveValue('30');

        // A refused number: "abc" with "Include identifiers…" ticked. The
        // window stays with the banner and the message above the
        // description, the message in place of the label, the box emptied;
        // "OK" again is stopped with "This field is required." (Rules 16a, 16b).
        await window.labelled('checkbox', W.includeIdentifiers).check();
        await window.typeNumber('abc');
        await window.okRefused();
        const above = await window.textAboveDescription();
        expect(above).toContain(W.errorsOccurred);
        expect(above).toContain(W.refusedNumber);
        await expect(window.numberBoxNamed(W.refusedNumber)).toHaveValue('');
        await expect(window.numberBoxNamed(W.numberLabel)).toHaveCount(0);
        expect(await window.okStoppedInBrowser(), 'saves sent').toBe(0);
        await expect(window.form.getByText(W.required, {exact: true})).toBeVisible();

        // The other refused values: "0", "-3", one space (Rule 16a).
        for (const value of ['0', '-3', ' ']) {
            await window.typeNumber(value);
            await window.okRefused();
            await expect(window.numberBoxNamed(W.refusedNumber), `"${value}" emptied`).toHaveValue('');
            await expect(window.form).toBeVisible();
        }

        // Control: "Cancel" and reopened, the window reads 30 with
        // "Include identifiers…" unticked: nothing was saved (Rule 16b).
        await window.cancel();
        window = await openWindow();
        await expectUnsaved(window);

        // Kept numbers: "3abc" reopens as 3, "2.5" as 2, "1000000" as
        // 1000000, each "OK" closing with "Your changes have been saved."
        // (Rule 16c).
        for (const [typed, kept] of [
            ['3abc', '3'],
            ['2.5', '2'],
            ['1000000', '1000000'],
        ]) {
            await window.typeNumber(typed);
            await window.okAccepted();
            window = await openWindow();
            await expect(window.numberBox, `"${typed}" reopened`).toHaveValue(kept);
        }
        await window.cancel();
    });

    test('S7: A journal with nothing published, and the feed\'s description', async ({asUser, ojsApi, visitor}, testInfo) => {
        test.slow();
        test.setTimeout(300_000);
        const tag = makeTag('s7', testInfo);
        await seedJournal(ojsApi, tag, {
            context: {name: 'Quiet Waters', acronym: 'QW', contactName: 'Pat Contact', contactEmail: 'pat.contact@example.org'},
        });
        const page = await actorPage(asUser, `${tag}mg`);
        const home = new RegExp(`/index\\.php/${tag}$`);
        const readAtom = async () => {
            const atom = await readFeed(visitor.request, feedPath(tag, 'atom'), 'atom');
            expect(atom.status).toBe(200);
            expect(atom.contentType).toMatch(/^application\/atom\+xml/);
            return atom;
        };

        // The Atom feed: "Quiet Waters", the home page, "Pat Contact" with
        // the address, no item; control: the description empty (Rules 6, 8).
        const atom = await readAtom();
        expect(atom.title).toBe('Quiet Waters');
        expect(atom.link).toMatch(home);
        expect(atom.authorName).toBe('Pat Contact');
        expect(atom.authorEmail).toBe('pat.contact@example.org');
        expect(atom.items).toEqual([]);
        expect(atom.body).not.toContain('<entry');
        expect(atom.description).toBe('');

        // The RSS 1.0 feed: the download "rss.rdf", titled "Quiet Waters",
        // no item (Rule 6). The RSS 2.0 address is not read [A1].
        const rdf = await downloadFeed(visitor, feedPath(tag, 'rss'));
        expect(rdf.filename).toBe(W.downloadName);
        expect(rdf.title).toBe('Quiet Waters');
        expect(rdf.items).toEqual([]);
        expect(rdf.body).not.toContain('<item ');

        // The search indexing "Description" fills the description (Rule 8;
        // Settings bullet 9).
        const settings = new SettingsPages(page, tag);
        await settings.goto('distribution');
        await settings.tab('Search Indexing').click();
        const indexing = new SettingsForm(page, '[id^="searchIndexing-searchDescription-control"]');
        await indexing.ready();
        await indexing.control('searchIndexing-searchDescription-control').fill('Letters about still water.');
        await indexing.save();
        expect((await readAtom()).description).toBe('Letters about still water.');

        // "Journal Summary" replaces it, its tags written out [A6] (Rule 8;
        // Settings bullet 9).
        const masthead = await settings.openJournalTab('Masthead');
        await masthead.typeRich('masthead-description-control', 'A journal of quiet seas.');
        // The seeded journal has no Country, which the tab requires before
        // "Save" (T-ojs-1; no scenario key sets it): picked in the same form.
        await masthead.control('masthead-country-control').selectOption({label: 'Canada'});
        await masthead.save();
        expect((await readAtom()).description).toBe('<p>A journal of quiet seas.</p>');
    });

    test('S8: A journal closed to visitors', async ({ojsApi, visitor}, testInfo) => {
        test.slow();
        const tag = makeTag('s8', testInfo);
        const other = `${tag}b`;
        const reader = `${tag}rd`;
        await seedJournal(ojsApi, tag, {
            manager: false,
            restrictSiteAccess: true,
            extra: [user(reader, 'Rita', 'Reader', ['reader'])],
        });
        await seedArticle(ojsApi, tag, 'Tidal Patterns', {published: true});
        await seedJournal(ojsApi, other, {manager: false});
        await seedArticle(ojsApi, other, 'Open Study', {published: true});
        const pages = new PublicPages(visitor, tag);

        // Control: before the sign-in, the second journal's Atom feed shows
        // and lists "Open Study" (Rule 13).
        const open = await openFeedInBrowser(visitor, feedPath(other, 'atom'));
        expect(open.status).toBe(200);
        expect(open.contentType).toMatch(/^application\/atom\+xml/);
        const openAtom = await readFeed(visitor.request, feedPath(other, 'atom'), 'atom');
        expect(openAtom.items.map((i) => i.title)).toEqual(['Open Study']);

        // Signed out: each of the three addresses opens the Login page in
        // place of the feed (Rule 13; Settings bullet 7).
        for (const type of ['rss2', 'rss', 'atom']) {
            await pages.expectLogin(feedPath(tag, type));
            await expect(visitor).toHaveURL(new RegExp(`source=.*${encodeURIComponent(feedPath(tag, type)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
        }

        // Signed in there as the Reader: the three show their feed, listing
        // "Tidal Patterns" (Rules 3, 13).
        await new LoginPage(visitor).signIn(reader, `${reader}${reader}`);
        await expect(visitor).toHaveURL(new RegExp(`${feedPath(tag, 'atom')}$`));
        await expect(visitor.locator('body')).toContainText('Tidal Patterns');
        const rss2Shown = await openFeedInBrowser(visitor, feedPath(tag, 'rss2'));
        expect(rss2Shown.contentType).toMatch(/^application\/rss\+xml/);
        expect(rss2Shown.text).toContain('Tidal Patterns');
        const rdf = await downloadFeed(visitor, feedPath(tag, 'rss'));
        expect(rdf.filename).toBe(W.downloadName);
        expect(rdf.items.map((i) => i.title)).toEqual(['Tidal Patterns']);
        await expectFeedTitles(visitor, tag, ['Tidal Patterns']);
    });
});
