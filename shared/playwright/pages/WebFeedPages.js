/**
 * @file shared/playwright/pages/WebFeedPages.js
 *
 * Page objects for U18 "Web feeds" (docs/specs/U18-web-feeds.md), shared by
 * the OJS, OMP and OPS suites. App-neutral: the markup is the Web Feed
 * plugin's own (plugins/generic/webFeed, the same in the three apps) and
 * lib/pkp's plugin grid; every on-screen word that differs per app (the
 * "Display web feed links on…" labels, the list choice a journal alone
 * offers) is passed in by the suite or read by the radio's value.
 *
 * Surfaces:
 * - feedPath / gatewayPath — the feed and gateway addresses of a context.
 * - parseFeed / readFeed / downloadFeed / openFeedInBrowser — a feed reader:
 *   the three documents fetched the way a reader fetches them (a plain GET
 *   through the page's own request context, so a signed-in page reads as
 *   its user), the RSS 1.0 file downloaded as Chromium downloads it, and
 *   each document taken apart into the channel's parts and the items'.
 * - FeedBox — the "Latest publications" box in a public page's sidebar.
 * - discoveryLinks / discoveryHrefs — the feed links of a page's header.
 * - PublicPages — the reader-side pages the scenarios visit (home, About,
 *   Archive, an issue, an article), the "404 Not Found" page and Login.
 * - WebFeedPluginRow — Settings › Website › "Plugins" › "Installed
 *   Plugins": the "Web Feed Plugin" row, its category, its "Enabled" box
 *   (with the disable question), its arrow and the links under it.
 * - WebFeedSettingsWindow — the plugin's "Settings" window: its title,
 *   description and heading, the round buttons by value, "Number of
 *   publications to display", "Include identifiers…", "OK" (accepted,
 *   refused by the server, stopped in the browser), "Cancel" and "×".
 *
 * DOM shapes from the U18 claim check (.reports/U18/screen-notes.md, the
 * kept scripts under shared/playwright/checks/U18/) and the OJS suite's
 * runs, 2026-09-26. The window's `[role="dialog"]` also matches the
 * editorial header, so every window locator is scoped to its form.
 */
const fs = require('fs');
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const T = 30_000;

/** The three feeds, in the order the box and the header list them. */
const FEED_TYPES = ['atom', 'rss2', 'rss'];

/** The words the plugin prints, the same in the three apps (English). */
const TEXT = {
    pluginName: 'Web Feed Plugin',
    descriptionFirst: 'This plugin produces RSS/Atom web syndication feeds.',
    descriptionSecond: "The plugin also includes a sidebar block which enables you to display the feed links on your application's sidebar",
    settingsHeading: 'Settings',
    numberLabel: 'Number of publications to display',
    includeIdentifiers: 'Include identifiers (ISBN, keywords, categories, etc.) in the feed summary?',
    requiredNote: 'Required fields are marked with an asterisk: *',
    saved: 'Your changes have been saved.',
    errorsOccurred: 'Errors occurred processing this form',
    refusedNumber: 'Please enter a positive integer for recent published items.',
    required: 'This field is required.',
    leaveQuestion: 'The data on this form has changed. Do you wish to continue without saving?',
    disableQuestion: 'Are you sure you want to disable this plugin?',
    boxHeading: 'Latest publications',
    logos: {atom: 'Atom logo', rss2: 'RSS2 logo', rss: 'RSS1 logo'},
    notFound: '404 Not Found',
    downloadName: 'rss.rdf',
};

/** Text with runs of white space collapsed. */
function flat(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}

/** Escape a string for a RegExp. */
function esc(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A feed's address: `/index.php/{context}[/{locale}]/gateway/plugin/WebFeedGatewayPlugin/{type}`. */
function feedPath(contextPath, type, {locale = ''} = {}) {
    return `/index.php/${contextPath}${locale ? `/${locale}` : ''}/gateway/plugin/WebFeedGatewayPlugin/${type}`;
}

/** An address under the context's gateway: `/index.php/{context}/gateway{rest}`. */
function gatewayPath(contextPath, rest = '') {
    return `/index.php/${contextPath}/gateway${rest}`;
}

// ---------------------------------------------------------------------------
// The feed reader
// ---------------------------------------------------------------------------

/** Decode the entities a feed's text nodes carry (one level, as a reader does). */
function unescapeXml(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/** Every `<tag …>…</tag>` (or self-closed `<tag …/>`) in `xml`: `{attrs, inner}` (inner '' when self-closed). */
function elements(xml, tag) {
    const re = new RegExp(`<${esc(tag)}((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</${esc(tag)}>)`, 'g');
    return [...xml.matchAll(re)].map((m) => ({attrs: m[1] || '', inner: m[2] || ''}));
}

/** An attribute's value from an element's attribute text. */
function attr(attrs, name) {
    const m = attrs.match(new RegExp(`\\s${esc(name)}="([^"]*)"`));
    return m ? unescapeXml(m[1]) : null;
}

/** The trimmed, decoded text of the first `<tag>` in `xml` (null when absent). */
function text(xml, tag) {
    const found = elements(xml, tag)[0];
    return found ? unescapeXml(found.inner.trim()) : null;
}

/** The XML before the first item: the channel's own parts. */
function channelPart(xml, itemTag) {
    const at = xml.search(new RegExp(`<${itemTag}[\\s>]`));
    return at < 0 ? xml : xml.slice(0, at);
}

/**
 * A summary as a reader shows it, one entry per line: the decoded summary
 * split at its `<br />` breaks, each line trimmed (an empty line stays).
 */
function summaryLines(summary) {
    if (summary == null) return [];
    return summary.split(/<br\s*\/?>/i).map((line) => flat(line));
}

/**
 * Take one feed apart. `type` is 'atom', 'rss2' or 'rss'. The channel's
 * parts: `title`, `link` (the home page), `description` (Atom's subtitle),
 * `authorName` / `authorEmail` (Atom), `managingEditor` (RSS 2.0),
 * `language` (RSS 2.0 and 1.0), `updated` (Atom `updated`, RSS 2.0
 * `pubDate`). Each item: `title`, `link`, `authors` (every name; RSS 2.0's
 * one line as its only entry), `summary` (decoded, null when absent),
 * `summaryLines`, `date` (Atom `published`, RSS 2.0 `pubDate`, RSS 1.0
 * `dc:date`) and `terms` (the subject terms' words, in document order).
 *
 * @param {'atom'|'rss2'|'rss'} type
 * @param {string} xml
 */
function parseFeed(type, xml) {
    const itemTag = type === 'atom' ? 'entry' : 'item';
    const head = channelPart(xml, itemTag);
    const items = elements(xml, itemTag).map(({inner}) => {
        const summary = type === 'atom' ? text(inner, 'summary') : text(inner, 'description');
        let link;
        let authors;
        let date;
        let terms;
        if (type === 'atom') {
            const alternate = elements(inner, 'link').find((l) => attr(l.attrs, 'rel') === 'alternate');
            link = alternate ? attr(alternate.attrs, 'href') : null;
            authors = elements(inner, 'author').map((a) => text(a.inner, 'name'));
            date = text(inner, 'published');
            terms = elements(inner, 'category').map((c) => attr(c.attrs, 'term'));
        } else if (type === 'rss2') {
            link = text(inner, 'link');
            authors = elements(inner, 'dc:creator').map((c) => flat(unescapeXml(c.inner)));
            date = text(inner, 'pubDate');
            terms = elements(inner, 'category').map((c) => flat(unescapeXml(c.inner)));
        } else {
            link = text(inner, 'link');
            authors = elements(inner, 'dc:creator').map((c) => flat(unescapeXml(c.inner)));
            date = text(inner, 'dc:date');
            terms = elements(inner, 'dc:subject').map((s) => text(s.inner, 'rdf:value'));
        }
        return {title: text(inner, 'title'), link, authors, summary, summaryLines: summaryLines(summary), date, terms};
    });
    const channel = {items};
    channel.title = text(head, 'title');
    if (type === 'atom') {
        const alternate = elements(head, 'link').find((l) => attr(l.attrs, 'rel') === 'alternate');
        channel.link = alternate ? attr(alternate.attrs, 'href') : null;
        channel.description = text(head, 'subtitle');
        const author = elements(head, 'author')[0];
        channel.authorName = author ? text(author.inner, 'name') : null;
        channel.authorEmail = author ? text(author.inner, 'email') : null;
        channel.updated = text(head, 'updated');
        channel.language = null;
    } else {
        channel.link = text(head, 'link');
        channel.description = text(head, 'description');
        channel.language = type === 'rss2' ? text(head, 'language') : text(head, 'dc:language');
        channel.managingEditor = text(head, 'managingEditor');
        channel.updated = text(head, 'pubDate');
    }
    return channel;
}

/**
 * Read a feed as a reader does: a plain GET through `request` (the page's
 * own request context, which carries its session), redirects followed.
 * Returns the answer (`status`, `contentType`, the final `url`, `body`)
 * and, for an XML answer, the parsed parts of parseFeed.
 *
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} url
 * @param {'atom'|'rss2'|'rss'} type
 */
async function readFeed(request, url, type) {
    const response = await request.get(url, {failOnStatusCode: false});
    const body = await response.text();
    const contentType = response.headers()['content-type'] || '';
    const parsed = /xml/.test(contentType) ? parseFeed(type, body) : {items: [], title: null};
    return {status: response.status(), contentType, url: response.url(), body, ...parsed};
}

/**
 * Open the RSS 1.0 address in the browser, which downloads it: returns the
 * file's suggested name and its content, parsed.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function downloadFeed(page, url) {
    const download = page.waitForEvent('download', {timeout: T});
    // The navigation ends in the download ("Download is starting"), never a page.
    await page.goto(url).catch(() => {});
    const file = await download;
    const filePath = await file.path();
    const body = fs.readFileSync(filePath, 'utf8');
    return {filename: file.suggestedFilename(), body, ...parseFeed('rss', body)};
}

/**
 * Open a feed address in the browser (Atom and RSS 2.0 show as text):
 * the answer's status, the tab title and the page's text.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function openFeedInBrowser(page, url) {
    const response = await page.goto(url);
    await expect(page.locator('body')).not.toBeEmpty({timeout: T});
    return {
        status: response ? response.status() : 0,
        contentType: response ? response.headers()['content-type'] || '' : '',
        title: await page.title(),
        text: await page.locator('body').innerText(),
    };
}

// ---------------------------------------------------------------------------
// The reader's pages
// ---------------------------------------------------------------------------

/** The "Latest publications" box in the sidebar (`.block_web_feed`, Rule 11). */
class FeedBox extends BasePage {
    constructor(page) {
        super(page);
        this.block = page.locator('.block_web_feed');
        this.heading = this.block.locator('.title').first();
        this.links = this.block.locator('a');
    }

    /** The link whose logo image reads `alt` ("Atom logo", "RSS2 logo", "RSS1 logo"). */
    link(alt) {
        return this.block.getByRole('link', {name: alt, exact: true});
    }

    /** Each link's image text, in order. */
    async logoTexts() {
        return this.block.locator('a img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('alt')));
    }
}

/**
 * The feed links of a page's hidden header: `<link rel="alternate">` with a
 * feed type (Atom, RSS 2.0, RSS 1.0), whatever their address.
 *
 * @param {import('@playwright/test').Page} page
 */
function discoveryLinks(page) {
    return page.locator('head link[rel="alternate"][type$="+xml"]');
}

/**
 * The header's feed links' addresses, path only, sorted (read after the
 * page's navigation: the header is server-rendered).
 *
 * @param {import('@playwright/test').Page} page
 */
async function discoveryHrefs(page) {
    const hrefs = await discoveryLinks(page).evaluateAll((links) => links.map((l) => new URL(l.href).pathname));
    return hrefs.sort();
}

/**
 * The public pages a scenario visits, on one context (bare addresses: a
 * scratch context has one language).
 */
class PublicPages extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.main = page.locator('.pkp_structure_main');
        this.box = new FeedBox(page);
    }

    url(pathname = '') {
        return this.contextUrl(this.contextPath, pathname);
    }

    /** Open a public page and wait for its main structure. */
    async open(pathname = '') {
        const response = await this.page.goto(this.url(pathname));
        await expect(this.main).toBeVisible({timeout: T});
        return response ? response.status() : 0;
    }

    home() {
        return this.open('');
    }

    about() {
        return this.open('/about');
    }

    archive() {
        return this.open('/issue/archive');
    }

    /** An issue's page by id {OJS}. */
    issue(issueId) {
        return this.open(`/issue/view/${issueId}`);
    }

    /** An article's page by submission id (`article/view/{id}` on a journal). */
    article(submissionId, {pagePath = 'article/view'} = {}) {
        return this.open(`/${pagePath}/${submissionId}`);
    }

    /** The home page's own block (`.page_index_*`): the landmark of "the home page opened". */
    homeBlock() {
        return this.page.locator('[class*="page_index_"]');
    }

    /** The titles an issue's table of contents lists, top to bottom {OJS}. */
    tocTitles() {
        return this.page.locator('.obj_issue_toc .obj_article_summary .title');
    }

    /**
     * Open an address expecting the bare "404 Not Found" page: the status,
     * the heading, and no public page structure.
     */
    async expectNotFound(url) {
        const response = await this.page.goto(url);
        expect(response && response.status(), `${url} answers 404`).toBe(404);
        await expect(this.page.locator('h1')).toHaveText(TEXT.notFound, {timeout: T});
        await expect(this.main).toHaveCount(0);
    }

    /** Open an address expecting the context's Login page in its place. */
    async expectLogin(url) {
        await this.page.goto(url);
        await expect(this.page).toHaveURL(/\/login(\?|$)/, {timeout: T});
        await expect(this.page.locator('form#login')).toBeVisible({timeout: T});
    }

    /**
     * The page's own title heading in the main structure (a press's book
     * page heads the book's title as `h1.title`, a journal's article page
     * as `h1.page_title`): the first `h1` of `.pkp_structure_main`.
     */
    mainHeading() {
        return this.main.locator('h1').first();
    }

    /**
     * The home page's own block in any app: a journal's and a preprint
     * server's `.page_index_*`, a press's `.page_homepage` (OMP's
     * `pages/index.tpl`). Empty on a scratch context, so read it by count.
     */
    homePageBlock() {
        return this.page.locator('[class*="page_index_"], .page_homepage');
    }
}

// ---------------------------------------------------------------------------
// Settings › Website › "Plugins": the "Web Feed Plugin" row
// ---------------------------------------------------------------------------

class WebFeedPluginRow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.grid = page.locator('#pluginGridContainer');
        this.row = this.grid.locator('tr.gridRow[id$="-row-webfeedplugin"]').first();
        this.enabledBox = this.row.getByRole('checkbox');
        this.arrow = this.row.locator('a.show_extras, a.hide_extras');
    }

    url() {
        return this.contextUrl(this.contextPath, '/management/settings/website#plugins');
    }

    /**
     * Open Settings › Website › "Plugins" (leaving the page first: a
     * hash-only goto reloads nothing, pitfall 17) and wait for the row.
     * Every load also fires the Plugin Gallery grid's server 500, a
     * *Plugins management* finding (U62), not this feature's.
     */
    async goto() {
        await this.page.goto('about:blank');
        await this.page.goto(this.url());
        await expect(this.row).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The heading of the category the row sits under ("Generic Plugins"). */
    categoryHeading() {
        return this.row
            .locator('xpath=ancestor::tbody[contains(@class, "category_grid_body")][1]/tr[1]')
            .locator('.label')
            .first();
    }

    /** The row's name cell. */
    nameCell() {
        return this.row.locator('td').first();
    }

    /** The row's controls (the next row), shown once the arrow is pressed. */
    async controls() {
        const id = await this.row.getAttribute('id');
        return this.page.locator(`[id="${id}-control-row"]`);
    }

    /** Press the arrow (once: a second press hangs, pitfall 10) and return the controls row. */
    async openControls() {
        await expect(this.arrow).toHaveCount(1, {timeout: T});
        const controls = await this.controls();
        await this.arrow.click();
        await expect(controls.getByRole('link').first()).toBeVisible({timeout: T});
        return controls;
    }

    /** The links under the pressed arrow, by their words, in order (read after openControls). */
    async controlNames(controls) {
        return (await controls.getByRole('link').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** The row's arrow, then "Settings": the window, loaded. */
    async openSettings() {
        const controls = await this.openControls();
        const window = new WebFeedSettingsWindow(this.page);
        await controls.getByRole('link', {name: 'Settings', exact: true}).click();
        await window.waitOpen();
        return window;
    }

    /**
     * Tick or untick the "Enabled" box, answering the disable question
     * with "OK"; waits for the grid's answer and the redrawn box. Returns
     * the disable question's text (null when enabling).
     *
     * @param {boolean} want
     */
    async setEnabled(want) {
        const answer = this.page.waitForResponse(
            (r) => new RegExp(`plugin-grid/${want ? 'enable' : 'disable'}`).test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.enabledBox.click();
        let question = null;
        if (!want) {
            const dialog = this.page.getByRole('dialog').filter({hasText: TEXT.disableQuestion}).last();
            await expect(dialog).toBeVisible({timeout: T});
            question = flat(await dialog.innerText());
            await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        }
        const response = await answer;
        expect(response.status(), 'the grid answers').toBe(200);
        await waitForJQueryIdle(this.page);
        await expect(this.enabledBox).toBeChecked({checked: want, timeout: T});
        return question;
    }
}

// ---------------------------------------------------------------------------
// The plugin's "Settings" window
// ---------------------------------------------------------------------------

class WebFeedSettingsWindow extends BasePage {
    constructor(page) {
        super(page);
        this.form = page.locator('#webFeedSettingsForm');
        this.dialog = page.getByRole('dialog').filter({has: this.form});
        this.title = this.dialog.getByRole('heading', {level: 1});
        this.description = this.form.locator('#description');
        this.heading = this.form.locator('h3');
        this.notification = this.form.locator('[id^="webFeedSettingsFormNotification"]');
        this.numberBox = this.form.locator('input[name="recentItems"]');
        this.identifiersBox = this.form.locator('input[name="includeIdentifiers"]');
        this.okButton = this.form.getByRole('button', {name: 'OK', exact: true});
        this.cancelLink = this.form.getByRole('link', {name: 'Cancel', exact: true});
        this.closeButton = this.dialog.getByRole('button', {name: 'Close', exact: true});
        this.requiredNote = this.form.getByText(TEXT.requiredNote, {exact: true});
    }

    /** Wait until the window's form has loaded (it arrives by AJAX after the dialog opens). */
    async waitOpen() {
        await expect(this.numberBox).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** A "Display web feed links on…" round button by value: `all`, `homepage`, `issue`. */
    displayPage(value) {
        return this.form.locator(`input[type="radio"][name="displayPage"][value="${value}"]`);
    }

    /** A list-choice round button by value {OJS}: `issue`, `recent`. */
    displayItems(value) {
        return this.form.locator(`input[type="radio"][name="displayItems"][value="${value}"]`);
    }

    /** Every round button of a group (`displayPage`, `displayItems`). */
    radios(name) {
        return this.form.locator(`input[type="radio"][name="${name}"]`);
    }

    /** A round button or box by its label. */
    labelled(role, name) {
        return this.form.getByRole(role, {name, exact: true});
    }

    /** The number box by the label it carries ("Number of publications to display", or a refusal's message). */
    numberBoxNamed(label) {
        return this.form.getByRole('textbox', {name: label, exact: true});
    }

    /** The value of the checked round button of a group (null when none). */
    async chosen(name) {
        return this.form
            .locator(`input[type="radio"][name="${name}"]`)
            .evaluateAll((radios) => (radios.find((r) => r.checked) || {value: null}).value);
    }

    /** Replace the number box's text. */
    async typeNumber(value) {
        await this.numberBox.fill(value);
    }

    /** The in-page message under the box ("This field is required."). */
    fieldError() {
        return this.form.locator('label.error, .error').filter({hasText: TEXT.required});
    }

    /**
     * The window's text above the plugin's description (where a refusal's
     * banner shows), read from the DOM order.
     */
    async textAboveDescription() {
        return this.form.evaluate((form) => {
            const description = form.querySelector('#description');
            const out = [];
            const walker = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                if (description && description.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) {
                    if (node.parentElement && node.parentElement.closest('script')) continue;
                    out.push(node.textContent);
                }
            }
            return out.join(' ').replace(/\s+/g, ' ').trim();
        });
    }

    /** Press "OK" and wait for the save's answer (the POST to the plugin's `manage`). */
    async pressOk() {
        const answer = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/manage\b/.test(r.url()),
            {timeout: T}
        );
        await this.okButton.click();
        const response = await answer;
        await waitForJQueryIdle(this.page);
        return response;
    }

    /** "OK" the server accepts: the window closes and "Your changes have been saved." shows. */
    async okAccepted() {
        const response = await this.pressOk();
        expect(response.status(), 'the save answers').toBe(200);
        await expect(this.form).toHaveCount(0, {timeout: T});
        await expect(this.savedNotice()).toBeVisible({timeout: T});
    }

    /** The page's notice "Your changes have been saved." (its box also carries "× Close"). */
    savedNotice() {
        return this.page.getByText(TEXT.saved).first();
    }

    /** "OK" the server refuses: the window stays, re-rendered with the refusal's banner. */
    async okRefused() {
        const response = await this.pressOk();
        expect(response.status(), 'the refusal answers').toBe(200);
        await expect(this.numberBox).toBeVisible({timeout: T});
        await expect(this.notification).toContainText(TEXT.refusedNumber, {timeout: T});
    }

    /**
     * "OK" the browser stops: returns how many saves left the page until
     * the in-page message showed (0 when nothing was sent).
     */
    async okStoppedInBrowser() {
        let sent = 0;
        const onRequest = (request) => {
            if (request.method() === 'POST' && /\/manage\b/.test(request.url())) sent += 1;
        };
        this.page.on('request', onRequest);
        try {
            await this.okButton.click();
            await expect(this.form.getByText(TEXT.required, {exact: true})).toBeVisible({timeout: T});
            await waitForJQueryIdle(this.page);
        } finally {
            this.page.off('request', onRequest);
        }
        return sent;
    }

    /** "Cancel": the window closes; waits out the modal's close window (pitfall 4). */
    async cancel() {
        await this.cancelLink.click();
        await expect(this.form).toHaveCount(0, {timeout: T});
        await pastCloseWindow(this.page);
    }
}

/**
 * Wait out the modal store's close window (patterns.md pitfall 4): a page
 * timer longer than the app's 450 ms slot, so an opener pressed next opens
 * its window.
 *
 * @param {import('@playwright/test').Page} page
 */
async function pastCloseWindow(page) {
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
}

module.exports = {
    FEED_TYPES,
    WEB_FEED_TEXT: TEXT,
    feedPath,
    gatewayPath,
    parseFeed,
    readFeed,
    downloadFeed,
    openFeedInBrowser,
    FeedBox,
    discoveryLinks,
    discoveryHrefs,
    PublicPages,
    WebFeedPluginRow,
    WebFeedSettingsWindow,
    pastCloseWindow,
};
