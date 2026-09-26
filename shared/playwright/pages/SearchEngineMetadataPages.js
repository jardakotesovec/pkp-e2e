/**
 * @file shared/playwright/pages/SearchEngineMetadataPages.js
 *
 * Page objects for U20 "Search-engine metadata & analytics"
 * (docs/specs/U20-search-engine-metadata-and-analytics.md), shared by the
 * OJS, OMP and OPS suites. App-neutral: the sitemap, the page head, the
 * "Search Indexing" form and the plugin grid are lib/pkp's; every on-screen
 * word that differs per app (the wizard's first tab, "…of the journal…")
 * is passed in by the suite.
 *
 * Surfaces:
 * - sitemapPath / siteIndexPath / pathOf — the addresses, and the path of an
 *   address the page wrote (the sitemap's and the tags' addresses are built
 *   from the install's base URL, not the worker port: compare paths).
 * - readSitemap — a sitemap or the site's index opened in the browser: the
 *   navigation's answer, its raw XML taken apart into entries, and the
 *   text the browser shows.
 * - readSource / metaContents / metasMatching / linksOf / headAsBuilt — a
 *   page's source as "view source" shows it (the navigation's raw answer),
 *   its `<meta>` and `<link>` tags, and the head as the browser built it.
 * - SearchIndexingForm — the "Search Indexing" form (Settings ›
 *   Distribution, or the Settings Wizard's side tab): its intro, the
 *   "sitemap" link, the two boxes, their help texts, "Save" and "Saved".
 * - PluginRow — one row of Settings › Website › "Plugins" › "Installed
 *   Plugins" by plugin id: its category, its box (with the "Disable"
 *   question), the page's notice, the arrow and the links under it.
 * - GoogleAnalyticsWindow — the plugin's "Settings" window.
 * - HostedContexts — Administration › "Hosted Journals" and the Settings
 *   Wizard's "Search Indexing" side tab.
 *
 * DOM shapes from the U20 claim check (.reports/U20/screen-notes.md, the
 * kept scripts under shared/playwright/checks/U20/) and the OJS suite's
 * runs, 2026-09-26.
 */
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');

const T = 30_000;

/** The words the screens print, the same in the three apps (English). */
const TEXT = {
    indexingTab: 'Search Indexing',
    indexingIntro: 'Help search engines like Google discover and display your site. You are encouraged to submit your sitemap.',
    customTagsHelp:
        'Add custom HTML tags, also known as meta tags, that you would like to be inserted in the head of every page. Consult a technical advisor before adding tags here.',
    disableTitle: 'Disable',
    disableQuestion: 'Are you sure you want to disable this plugin?',
    enabledNotice: (name) => `The plugin "${name}" has been enabled.`,
    disabledNotice: (name) => `The plugin "${name}" has been disabled.`,
    plugins: {
        dublinCore: 'Dublin Core Indexing Plugin',
        googleScholar: 'Google Scholar Indexing Plugin',
        googleAnalytics: 'Google Analytics Plugin',
    },
    gaDescriptionStart: "Integrate OJS with Google Analytics, Google's web site traffic analysis application.",
    gaFirstParagraph: 'With this plugin enabled Google Analytics may be used to collect and analyze web site usage and traffic.',
    gaNumberLabel: 'Account number',
    requiredNote: 'Required fields are marked with an asterisk: *',
    required: 'This field is required.',
    gtagScript: 'https://www.googletagmanager.com/gtag/js?id=',
    xmlViewer: 'This XML file does not appear to have any style information associated with it.',
};

/** Plugin ids of the grid rows (`…-row-<id>`). */
const PLUGIN_IDS = {
    dublinCore: 'dublincoremetaplugin',
    googleScholar: 'googlescholarplugin',
    googleAnalytics: 'googleanalyticsplugin',
};

/** Text with runs of white space collapsed. */
function flat(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

/** `{context}/sitemap`, with a language segment when given. */
function sitemapPath(contextPath, {locale = ''} = {}) {
    return `/index.php/${contextPath}${locale ? `/${locale}` : ''}/sitemap`;
}

/** The site's index of sitemaps. */
function siteIndexPath() {
    return '/index.php/index/sitemap';
}

/** The path of an absolute address (or the address itself when it has no host). */
function pathOf(url) {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}

function unescapeXml(text) {
    return String(text)
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

/**
 * Open a sitemap (or the site's index) in the browser and take it apart.
 * Returns {status, contentType, url (where the browser landed), chain (the
 * redirects' statuses), body (raw XML), root (the root element's name),
 * entries [{loc, children}] (children: the element names inside each
 * `<url>`/`<sitemap>`), locs, paths, shown (the text the browser shows)}.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function readSitemap(page, url) {
    const response = await page.goto(url);
    const status = response ? response.status() : 0;
    const contentType = response ? response.headers()['content-type'] || '' : '';
    const body = response ? await response.text() : '';
    const chain = [];
    for (let r = response && response.request().redirectedFrom(); r; r = r.redirectedFrom()) {
        const answer = await r.response();
        chain.unshift(answer ? answer.status() : 0);
    }
    const rootMatch = body.match(/<(urlset|sitemapindex)\b/);
    const entries = [...body.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map((m) => ({
        loc: unescapeXml(((m[2].match(/<loc>([\s\S]*?)<\/loc>/) || [])[1] || '').trim()),
        children: [...m[2].matchAll(/<([A-Za-z:]+)[\s>]/g)].map((c) => c[1]),
    }));
    const shown = await page.locator('body').innerText().catch(() => '');
    return {
        status,
        contentType,
        url: page.url(),
        chain,
        body,
        root: rootMatch ? rootMatch[1] : null,
        entries,
        locs: entries.map((e) => e.loc),
        paths: entries.map((e) => pathOf(e.loc)),
        shown,
    };
}

/** An attribute of a raw tag. */
function attrOf(raw, name) {
    const m = raw.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    return m ? unescapeXml(m[2] !== undefined ? m[2] : m[3]) : null;
}

/**
 * Open a page and read its source as "view source" shows it: the raw
 * answer of the navigation. Returns {status, url, body, head (the raw text
 * before `</head>`), metas [{name, content, raw}], links [{rel, href,
 * hreflang, raw}]}; the tags are those of the whole raw document, in order.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function readSource(page, url) {
    const response = await page.goto(url);
    return sourceOf(page, response);
}

/** readSource's reading of a navigation already made (a reload, a click). */
async function sourceOf(page, response) {
    const body = response ? await response.text() : '';
    const headEnd = body.search(/<\/head>/i);
    const metas = [...body.matchAll(/<meta\b[^>]*>/gi)].map((m) => ({
        name: attrOf(m[0], 'name'),
        content: attrOf(m[0], 'content'),
        raw: m[0],
    }));
    const links = [...body.matchAll(/<link\b[^>]*>/gi)].map((m) => ({
        rel: attrOf(m[0], 'rel'),
        href: attrOf(m[0], 'href'),
        hreflang: attrOf(m[0], 'hreflang'),
        raw: m[0],
    }));
    return {
        status: response ? response.status() : 0,
        url: page.url(),
        body,
        head: headEnd > 0 ? body.slice(0, headEnd) : '',
        metas,
        links,
    };
}

/** The contents of a source's `<meta name="…">` tags of one name, in order. */
function metaContents(source, name) {
    return source.metas.filter((m) => m.name === name).map((m) => m.content);
}

/** The names of a source's `<meta>` tags whose name matches (`/^citation_/`, `/^DC\./`). */
function metasMatching(source, pattern) {
    return source.metas.filter((m) => m.name && pattern.test(m.name)).map((m) => m.name);
}

/** A source's `<link>` tags of one rel, as {href, hreflang}. */
function linksOf(source, rel) {
    return source.links.filter((l) => l.rel === rel).map((l) => ({href: l.href, hreflang: l.hreflang}));
}

/**
 * The head as the browser built it (the element inspector's view): how
 * many style sheets and language links sit in the head and in the body,
 * the body's first lines of text, and where a text node of the body that
 * holds `text` sits against the page header.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} [text]
 */
async function headAsBuilt(page, text = '') {
    return page.evaluate((needle) => {
        const head = document.head;
        const body = document.body;
        const header = document.querySelector('header, .pkp_structure_head');
        let node = null;
        if (needle) {
            const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const n = walker.currentNode;
                if (n.textContent.includes(needle) && !(n.parentElement && n.parentElement.closest('script, style'))) {
                    node = n;
                    break;
                }
            }
        }
        let textTop = null;
        let textAboveHeader = null;
        if (node) {
            const range = document.createRange();
            range.selectNodeContents(node);
            textTop = range.getBoundingClientRect().top;
            textAboveHeader = header ? !!(node.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING) : null;
        }
        return {
            stylesheetsInHead: head ? head.querySelectorAll('link[rel="stylesheet"]').length : 0,
            stylesheetsInBody: body.querySelectorAll('link[rel="stylesheet"]').length,
            languageLinksInHead: head ? head.querySelectorAll('link[rel="alternate"][hreflang]').length : 0,
            languageLinksInBody: body.querySelectorAll('link[rel="alternate"][hreflang]').length,
            firstLines: (body.innerText || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3),
            textShown: node ? node.parentElement === body || !!node.parentElement.closest('body') : false,
            textTop,
            headerTop: header ? header.getBoundingClientRect().top : null,
            textAboveHeader,
        };
    }, text);
}

// ---------------------------------------------------------------------------
// The "Search Indexing" form
// ---------------------------------------------------------------------------

class SearchIndexingForm extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {{locale?: string}} [options] the form language of the boxes (default `en`)
     */
    constructor(page, {locale = 'en'} = {}) {
        super(page);
        this.form = page.locator('form').filter({has: page.locator('[id^="searchIndexing-searchDescription-control"]')}).first();
        this.group = this.form.getByRole('group', {name: TEXT.indexingTab, exact: true});
        this.heading = this.form.locator('.pkpFormGroup__heading > div').first();
        this.intro = this.form.locator('.pkpFormGroup__heading > div').nth(1);
        this.sitemapLink = this.form.getByRole('link', {name: 'sitemap', exact: true});
        this.description = this.form.locator(`[id="searchIndexing-searchDescription-control-${locale}"]`);
        this.customTags = this.form.locator(`[id="searchIndexing-customHeaders-control-${locale}"]`);
        this.descriptionHelpButton = this.helpButton('searchDescription', locale);
        this.customTagsHelpButton = this.helpButton('customHeaders', locale);
        this.saveButton = this.form.getByRole('button', {name: 'Save', exact: true});
        this.savedStatus = this.form.locator('[role="status"]').filter({hasText: 'Saved'});
    }

    /** A field's help icon (beside its label). */
    helpButton(field, locale) {
        return this.form
            .locator(`label[for="searchIndexing-${field}-control-${locale}"]`)
            .locator('xpath=following-sibling::span[contains(@class, "tooltipButton")][1]');
    }

    /** Wait until the form is on screen. */
    async ready() {
        await expect(this.description).toBeVisible({timeout: T});
        await expect(this.saveButton).toBeEnabled({timeout: T});
    }

    /** Hover a help icon and return the help text that shows. */
    async helpShown(button) {
        await button.hover();
        const shown = this.page.locator('.v-popper__popper--shown');
        let text = '';
        await expect
            .poll(async () => (text = flat((await shown.allInnerTexts()).join(' '))), {timeout: T})
            .not.toBe('');
        return text;
    }

    /** Press "Save" and wait for the save's answer and "Saved" beside the button; returns the status code. */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.saveButton.click();
        const response = await answered;
        await expect(this.savedStatus).toBeVisible({timeout: T});
        return response.status();
    }
}

/**
 * Settings › Distribution › "Search Indexing" of one context.
 */
class DistributionSettings extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.tab = page.getByRole('tab', {name: TEXT.indexingTab, exact: true});
        this.form = new SearchIndexingForm(page);
    }

    url() {
        return this.contextUrl(this.contextPath, '/management/settings/distribution');
    }

    /** Open Settings › Distribution and its "Search Indexing" tab; returns the form, ready. */
    async openSearchIndexing() {
        await this.page.goto('about:blank');
        await this.page.goto(this.url());
        await expect(this.tab).toBeVisible({timeout: T});
        if ((await this.tab.getAttribute('aria-selected')) !== 'true') await this.tab.click();
        await expect(this.tab).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await this.form.ready();
        return this.form;
    }
}

// ---------------------------------------------------------------------------
// Settings › Website › "Plugins": one plugin's row
// ---------------------------------------------------------------------------

class PluginRow extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {string} pluginId the grid row's id end (`googleanalyticsplugin`)
     */
    constructor(page, contextPath, pluginId) {
        super(page);
        this.contextPath = contextPath;
        this.pluginId = pluginId;
        this.grid = page.locator('#pluginGridContainer');
        this.row = this.grid.locator(`tr.gridRow[id$="-row-${pluginId}"]`).first();
        this.enabledBox = this.row.getByRole('checkbox');
        this.arrow = this.row.locator('a.show_extras, a.hide_extras');
        this.name = this.row.locator(`[id="cell-${pluginId}-name"]`);
        this.description = this.row.locator(`[id="cell-${pluginId}-description"]`);
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

    /** The row's controls (the next row), shown once the arrow is pressed. */
    async controls() {
        const id = await this.row.getAttribute('id');
        return this.page.locator(`[id="${id}-control-row"]`);
    }

    /**
     * Press the arrow and return the controls row; controls already open
     * (the row's window closed again) are returned as they are, since a
     * second press closes them (pitfall 10).
     */
    async openControls() {
        await expect(this.arrow).toHaveCount(1, {timeout: T});
        const controls = await this.controls();
        if (await controls.getByRole('link').first().isVisible()) return controls;
        await this.arrow.click();
        await expect(controls.getByRole('link').first()).toBeVisible({timeout: T});
        return controls;
    }

    /** The links under the pressed arrow, by their words, in order. */
    async controlNames(controls) {
        return (await controls.getByRole('link').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** The page's notice by its sentence ("The plugin "…" has been enabled."). */
    notice(text) {
        return this.page.locator('.pkpNotification').filter({hasText: text}).first();
    }

    /**
     * Tick or untick the box, answering the "Disable" window with "OK";
     * waits for the grid's answer and the redrawn box. Returns
     * {title, question} of the "Disable" window (null when ticking, which
     * asks nothing: the answer arrives with no window open).
     *
     * @param {boolean} want
     */
    async setEnabled(want) {
        const answer = this.page.waitForResponse(
            (r) => new RegExp(`plugin-grid/${want ? 'enable' : 'disable'}`).test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.enabledBox.click();
        let asked = null;
        if (!want) {
            const dialog = this.page.getByRole('dialog').filter({hasText: TEXT.disableQuestion}).last();
            await expect(dialog).toBeVisible({timeout: T});
            asked = {
                title: flat(await dialog.getByRole('heading').first().innerText()),
                question: flat(await dialog.getByText(TEXT.disableQuestion).first().innerText()),
            };
            await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        }
        const response = await answer;
        expect(response.status(), 'the grid answers').toBe(200);
        if (want) {
            await expect(this.page.getByRole('dialog').filter({hasText: TEXT.disableQuestion})).toHaveCount(0);
        }
        await waitForJQueryIdle(this.page);
        await expect(this.enabledBox).toBeChecked({checked: want, timeout: T});
        return asked;
    }

    /** The row's arrow, then "Settings": the Google Analytics window, loaded. */
    async openAnalyticsSettings() {
        const controls = await this.openControls();
        const window = new GoogleAnalyticsWindow(this.page);
        await controls.getByRole('link', {name: 'Settings', exact: true}).click();
        await window.waitOpen();
        return window;
    }

    /**
     * Every plugin row of the category this row sits under ("Generic
     * Plugins"), for an absence read beside the rows it lists (the OPS
     * suite's missing "Dublin Core Indexing Plugin"; tops, 2026-09-26).
     */
    sameCategoryRows() {
        return this.row
            .locator('xpath=ancestor::tbody[contains(@class, "category_grid_body")][1]')
            .locator('tr.gridRow');
    }
}

// ---------------------------------------------------------------------------
// "Google Analytics Plugin"'s "Settings" window
// ---------------------------------------------------------------------------

class GoogleAnalyticsWindow extends BasePage {
    constructor(page) {
        super(page);
        this.form = page.locator('#gaSettingsForm');
        this.dialog = page.getByRole('dialog').filter({has: this.form});
        this.title = this.dialog.getByRole('heading', {level: 1});
        this.numberBox = this.form.locator('input[name="googleAnalyticsSiteId"]');
        this.numberLabel = this.form.locator('label').filter({hasText: TEXT.gaNumberLabel}).first();
        this.okButton = this.form.getByRole('button', {name: 'OK', exact: true});
        this.cancelLink = this.form.getByRole('link', {name: 'Cancel', exact: true});
        this.requiredNote = this.form.getByText(TEXT.requiredNote, {exact: true});
        this.fieldError = this.form.locator('label.error').filter({hasText: TEXT.required});
    }

    /** Wait until the window's form has loaded (it arrives by AJAX after the dialog opens). */
    async waitOpen() {
        await expect(this.numberBox).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The window's paragraphs of text above the box, each flattened. */
    async paragraphs() {
        return (await this.form.locator('p').allInnerTexts()).map(flat).filter(Boolean);
    }

    /** The texts in page order: the box's label, "Cancel", "OK" and the note, with the box between (`[box]`). */
    async fieldOrder() {
        return this.form.evaluate((form) => {
            const items = [...form.querySelectorAll('input[name="googleAnalyticsSiteId"], a, button, p, label')];
            return items
                .map((el) => {
                    if (el.matches('input')) return '[box]';
                    return (el.innerText || '').replace(/\s+/g, ' ').trim();
                })
                .filter(Boolean);
        });
    }

    /**
     * "OK" the browser stops: returns how many saves left the page until
     * "This field is required." showed (0 when nothing was sent).
     */
    async okStoppedInBrowser() {
        let sent = 0;
        const onRequest = (request) => {
            if (request.method() === 'POST' && /\/manage\b/.test(request.url())) sent += 1;
        };
        this.page.on('request', onRequest);
        try {
            await this.okButton.click();
            await expect(this.fieldError).toBeVisible({timeout: T});
            await waitForJQueryIdle(this.page);
        } finally {
            this.page.off('request', onRequest);
        }
        return sent;
    }

    /** "OK" the server accepts: waits for the save's answer and the window's close; returns the status code. */
    async okAccepted() {
        const answer = this.page.waitForResponse(
            (r) => r.request().method() === 'POST' && /\/manage\b/.test(r.url()),
            {timeout: T}
        );
        await this.okButton.click();
        const response = await answer;
        await expect(this.form).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
        await pastCloseWindow(this.page);
        return response.status();
    }

    /** "Cancel": the window closes; waits out the modal's close window (pitfall 4). */
    async cancel() {
        await this.cancelLink.click();
        await expect(this.form).toHaveCount(0, {timeout: T});
        await pastCloseWindow(this.page);
    }
}

// ---------------------------------------------------------------------------
// Administration › "Hosted Journals" and the Settings Wizard
// ---------------------------------------------------------------------------

class HostedContexts extends BasePage {
    constructor(page) {
        super(page);
        this.indexingTab = page.getByRole('tab', {name: TEXT.indexingTab, exact: true});
        this.form = new SearchIndexingForm(page);
    }

    /** Open Administration › "Hosted Journals" ("Hosted Presses", "Hosted Servers"). */
    async goto() {
        await this.page.goto(this.siteUrl('/admin/contexts'));
        await expect(this.page.locator('tr.gridRow').first()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** A context's row by a name it contains. */
    contextRow(name) {
        return this.page.locator('tr.gridRow').filter({hasText: name}).first();
    }

    /** Press the row's arrow, then "Settings wizard"; waits for the wizard's tabs. */
    async openWizard(name) {
        const row = this.contextRow(name);
        await expect(row).toBeVisible({timeout: T});
        await row.locator('a.show_extras').click();
        const actions = row.locator('xpath=following-sibling::tr[1]');
        await actions.getByRole('link', {name: 'Settings wizard', exact: true}).click();
        await this.page.waitForURL(/\/admin\/wizard\//, {timeout: T, waitUntil: 'commit'});
        await expect(this.page.getByRole('tab').first()).toBeVisible({timeout: T});
    }

    /** The wizard's top tab by name ("Journal Settings", "Setup", "Server Settings"). */
    topTab(name) {
        return this.page.getByRole('tab', {name, exact: true}).first();
    }

    /** On the open wizard: the first tab (by its name), then "Search Indexing"; returns the form, ready. */
    async openSearchIndexing(firstTabName) {
        const top = this.topTab(firstTabName);
        await expect(top).toBeVisible({timeout: T});
        if ((await top.getAttribute('aria-selected')) !== 'true') await top.click();
        await expect(top).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await this.indexingTab.click();
        await expect(this.indexingTab).toHaveAttribute('aria-selected', 'true', {timeout: T});
        await this.form.ready();
        return this.form;
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

/**
 * Keep a page's Google traffic on the machine (harness.md: tests never
 * reach real external services): Google's tag loader at
 * www.googletagmanager.com is answered with an empty script, so no Google
 * code runs, and anything bound for google-analytics.com is aborted.
 * Returns {gtag, analytics}: the URLs the page asked for, as they were
 * asked, filled in as the requests arrive (read them after the page's
 * load, or through `expect.poll`).
 *
 * @param {import('@playwright/test').Page} page
 */
async function stubGoogle(page) {
    const seen = {gtag: [], analytics: []};
    await page.route('**/www.googletagmanager.com/**', (route) => {
        seen.gtag.push(route.request().url());
        return route.fulfill({status: 200, contentType: 'application/javascript', body: ''});
    });
    await page.route('**/*google-analytics.com/**', (route) => {
        seen.analytics.push(route.request().url());
        return route.abort();
    });
    return seen;
}

module.exports = {
    SEM_TEXT: TEXT,
    stubGoogle,
    PLUGIN_IDS,
    flat,
    sitemapPath,
    siteIndexPath,
    pathOf,
    readSitemap,
    readSource,
    sourceOf,
    metaContents,
    metasMatching,
    linksOf,
    headAsBuilt,
    SearchIndexingForm,
    DistributionSettings,
    PluginRow,
    GoogleAnalyticsWindow,
    HostedContexts,
    pastCloseWindow,
};
