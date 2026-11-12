// @ts-check
/**
 * @file shared/playwright/pages/ArticleLandingPages.js
 *
 * Page objects for the Article landing page & reading feature (spec:
 * docs/specs/U13-article-landing-page-and-reading.md), shared by the OJS
 * and OPS suites. App-neutral (PRINCIPLES M2): the object word in the
 * address ("article", "preprint") and every per-app string are passed in
 * by the suite; the class names below are the default theme's, the same
 * on a journal and a preprint server where both have the part.
 *
 * Surfaces:
 * - ArticleLandingPage — the published (or previewed) item's page: the
 *   breadcrumb, the notices, the label line's parts (preprint server), title and
 *   subtitle, the contributors, the main column's sections ("Keywords:",
 *   "Abstract", "Plain Language Summary", "Downloads" and its chart,
 *   "References" through CitationsPages' `landingReferences`), the side
 *   column (cover image, the two galley lists, "Published" / "Posted",
 *   "Versions", the labelled sub-items "Issue", "Section", "Categories",
 *   "Article Number"), the outline readers used for the order and
 *   "nothing else" claims, and the "How to Cite" block (the citation,
 *   "More Citation Formats", its formats, "Download Citation").
 * - GalleyReaderPage — the PDF and HTML reader pages: the bar (return
 *   arrow, title, "Download"), the outdated-version notice, the pdf.js
 *   viewer's controls and page count, the HTML frame.
 * - CitationStyleSettings — Settings › Website › "Plugins": the "Citation
 *   Style Language" row (its box, the disable question, its "Settings")
 *   and the plugin's settings window (`#citationStyleLanguageSettingsForm`).
 * - ArticleSummaries — the article summary on the listing pages (an
 *   issue's table of contents, the home page's lists, category, archive
 *   and search pages).
 * - expectNotFoundPage / expectLoginPage — the two pages a refused
 *   visitor meets.
 *
 * The workflow side (the header's "Preview", "Create New Version",
 * publishing) is WorkflowPage's and the app's own publication pages'; the
 * galley builders are GalleysPages'.
 *
 * DOM facts (U13 claim check, `.reports/U13/screen-notes.md` ccK1–ccK5,
 * the default theme's `article_details.tpl` / `preprint_details.tpl`,
 * `article_summary.tpl` / `preprint_summary.tpl`, the pdf.js viewer's
 * `display.tpl` and the CSL plugin's `citation-block.blade`, 2026-09-25):
 * - the page is `article.obj_article_details` (`obj_preprint_details`);
 *   the main column `.main_entry`, the side column `.entry_details`; each
 *   part's h2 (or h3) is `.label`, and the headings the eye never sees
 *   ("Authors", "Downloads", "Additional Files") carry `.pkp_screen_reader`
 *   (Playwright counts them visible: a 1px clip);
 * - the galley lists are `ul.galleys_links` and
 *   `ul.supplementary_galleys_links`, each inside its own `.item.galleys`;
 *   a journal's "JATS XML" link is `a.obj_galley_link.xml` in `.item.jats`,
 *   so the main list is read by its `ul`, never by `a.obj_galley_link`;
 * - the "Versions" entries are `.item.published .versions li` (a bare
 *   `.versions li` also matches a preprint's contributor list);
 * - a galley link that downloads starts a navigation the browser aborts
 *   when the attachment arrives: read it through the download event
 *   (SubmissionFilesPages' `captureDownload`), never a URL wait;
 * - the citation list toggles `aria-expanded` on its button and
 *   `aria-hidden` on `#cslCitationFormats`; a format fetches
 *   `citationstylelanguage/get/<id>` and closes the list; with no format
 *   offered the button opens nothing.
 */
const fs = require('fs');
const {expect} = require('@playwright/test');
const {BasePage} = require('./BasePage.js');
const {waitForJQueryIdle} = require('../support/legacy.js');
const {captureDownload} = require('./SubmissionFilesPages.js');
const {landingReferences} = require('./CitationsPages.js');

const T = 30_000;

/** Strings the three apps share (lib/pkp and the plugins' own locales). */
const TEXT = {
    notFound: '404 Not Found',
    login: 'Login',
    preview: 'This is a preview and has not been published. View submission',
    outdated: (date) => `This is an outdated version published on ${date}. Read the most recent version.`,
    howToCite: 'How to Cite',
    moreFormats: 'More Citation Formats',
    downloadCitation: 'Download Citation',
    downloadPdf: 'Download PDF',
    download: 'Download',
    returnToArticle: 'Return to Article Details',
    returnToIssue: 'Return to Issue Details',
    pdfTitle: (title) => `View of ${title}`,
    saved: 'Your changes have been saved.',
    disableQuestion: 'Are you sure you want to disable this plugin?',
    formChanged: 'The data on this form has changed. Do you wish to continue without saving?',
    pluginEnabled: (name) => `The plugin "${name}" has been enabled.`,
    pluginDisabled: (name) => `The plugin "${name}" has been disabled.`,
    downloadsHeading: 'Downloads',
    additionalFilesHeading: 'Additional Files',
};
exports.LANDING_TEXT = TEXT;

/**
 * The "Citation Style Language" plugin's formats: the name each list
 * shows and the id its radios, boxes and addresses carry.
 */
const CITATION_STYLES = {
    ABNT: 'associacao-brasileira-de-normas-tecnicas',
    ACM: 'acm-sig-proceedings',
    ACS: 'acs-nano',
    AMA: 'ama',
    APA: 'apa',
    Chicago: 'chicago-author-date',
    Harvard: 'harvard-cite-them-right',
    IEEE: 'ieee',
    MLA: 'modern-language-association',
    Turabian: 'turabian-fullnote-bibliography',
    Vancouver: 'vancouver',
};
exports.CITATION_STYLES = CITATION_STYLES;

/** The download formats: the name the list shows and the id. */
const CITATION_DOWNLOADS = {
    'Endnote/Zotero/Mendeley (RIS)': 'ris',
    BibTeX: 'bibtex',
};
exports.CITATION_DOWNLOADS = CITATION_DOWNLOADS;

/** Collapse runs of white space and trim. */
function flat(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}
exports.flat = flat;

/** Escape a string for a RegExp. */
function escapeRe(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
exports.escapeRe = escapeRe;

/**
 * An address pattern: `base` taken literally, then `tail` as a RegExp
 * source, anchored at the end.
 */
function addressPattern(base, tail = '') {
    return new RegExp(`${escapeRe(base)}${tail}$`);
}
exports.addressPattern = addressPattern;

/** A whole-text matcher (trimmed), for `filter({hasText})`. */
function whole(text) {
    return new RegExp(`^\\s*${escapeRe(text)}\\s*$`);
}
exports.whole = whole;

// ---------------------------------------------------------------------------
// The two pages a refused visitor meets
// ---------------------------------------------------------------------------

/**
 * Open an address and expect the "404 Not Found" page: the status and the
 * page's heading.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function expectNotFoundPage(page, url) {
    const response = await page.goto(url);
    expect(response && response.status(), `${url} answers 404`).toBe(404);
    await expect(page.getByRole('heading', {level: 1})).toHaveText(TEXT.notFound);
}
exports.expectNotFoundPage = expectNotFoundPage;

/**
 * Open an address and expect to land on the Login page (its address and
 * its "Login" heading, the username box there).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 */
async function expectLoginPage(page, url) {
    await page.goto(url);
    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('heading', {level: 1})).toHaveText(TEXT.login);
    await expect(page.locator('input#username')).toBeVisible();
}
exports.expectLoginPage = expectLoginPage;

/**
 * Today's date as the pages write it (`Y-m-d`), in the runner's zone and
 * in UTC: the server's zone decides, and the two differ near midnight.
 */
function todayCandidates() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const utc = now.toISOString().slice(0, 10);
    return [...new Set([local, utc])];
}
exports.todayCandidates = todayCandidates;

/** "2026-09-25" written as the HTML reader writes it, "September 25, 2026". */
function longDate(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[m - 1]} ${d}, ${y}`;
}
exports.longDate = longDate;

// ---------------------------------------------------------------------------
// The landing page (Fields, the landing page; Rules 1–10, 14–18, 21)
// ---------------------------------------------------------------------------

exports.ArticleLandingPage = class ArticleLandingPage extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     * @param {{op?: string, locale?: string}} [options] `op` the object word
     *   in the address ("article", "preprint"); `locale` a language segment
     *   the addresses carry ("en" on the bilingual seeded context, "" on a
     *   one-language scratch context)
     */
    constructor(page, contextPath, {op = 'article', locale = ''} = {}) {
        super(page);
        this.contextPath = contextPath;
        this.op = op;
        this.locale = locale;
    }

    /**
     * The item's address, relative to the server: `/index.php/{context}[/{locale}]/{op}/view/{id}`,
     * plus `/version/{publicationId}` and a galley part when given.
     *
     * @param {number|string} id the number or URL Path
     * @param {{version?: number|string, galley?: number|string, locale?: string}} [options]
     */
    url(id, {version, galley, locale} = {}) {
        const lang = locale === undefined ? this.locale : locale;
        let url = `/index.php/${this.contextPath}${lang ? `/${lang}` : ''}/${this.op}/view/${id}`;
        if (version !== undefined) url += `/version/${version}`;
        if (galley !== undefined) url += `/${galley}`;
        return url;
    }

    /** A RegExp matching the item's address (and nothing after it), absolute or relative. */
    urlPattern(id, options = {}) {
        return new RegExp(`${escapeRe(this.url(id, options))}$`);
    }

    /** Open the item's page and wait for its heading; returns the response. */
    async goto(id, options = {}) {
        const response = await this.page.goto(this.url(id, options));
        await this.expectLoaded();
        return response;
    }

    /** Reload and wait for the heading. */
    async reload() {
        await this.page.reload();
        await this.expectLoaded();
    }

    /** The page is there: its title heading. */
    async expectLoaded() {
        await expect(this.title()).toBeVisible({timeout: T});
    }

    /** The whole item (`article.obj_article_details` / `obj_preprint_details`). */
    article() {
        return this.page.locator('article.obj_article_details, article.obj_preprint_details');
    }

    breadcrumb() {
        return this.page.locator('nav.cmp_breadcrumbs');
    }

    breadcrumbLinks() {
        return this.breadcrumb().getByRole('link');
    }

    /** The notices above the title (`.cmp_notification`). */
    notices() {
        return this.article().locator('.cmp_notification');
    }

    /** A link inside the notices by its words ("View submission", "most recent version"). */
    noticeLink(name) {
        return this.notices().getByRole('link', {name, exact: true});
    }

    /**
     * A preprint server's label line above the title, its three parts in
     * order: "Preprint", "/", "{date} ({version name})" (spans directly
     * under the article; the OPS author's need).
     */
    labelLineParts() {
        return this.article().locator(':scope > span.preprint_label, :scope > span.separator, :scope > span.preprint_version');
    }

    title() {
        return this.article().locator('h1.page_title');
    }

    subtitle() {
        return this.article().locator('h2.subtitle');
    }

    mainColumn() {
        return this.article().locator('.main_entry');
    }

    sideColumn() {
        return this.article().locator('.entry_details');
    }

    /** The contributor list's entries. */
    contributors() {
        return this.mainColumn().locator('.item.authors ul.authors > li');
    }

    /** The "Keywords:" part (its label and value). */
    keywords() {
        return this.mainColumn().locator('.item.keywords');
    }

    /** A main-column section by its heading's words ("Abstract", "Plain Language Summary", "Downloads"). */
    mainSection(heading) {
        return this.mainColumn()
            .locator('section.item')
            .filter({has: this.page.locator('h2.label', {hasText: whole(heading)})});
    }

    /**
     * The main column's parts top to bottom, each as its visible heading
     * or, for a part the eye reads without one, its kind ("authors").
     *
     * @returns {Promise<string[]>}
     */
    async mainOutline() {
        return this.mainColumn().evaluate((column) =>
            Array.from(column.querySelectorAll(':scope > .item, :scope > section')).map((part) => {
                const label = part.querySelector(':scope > .label, :scope > h2:not(.pkp_screen_reader)');
                if (label) return (label.textContent || '').replace(/\s+/g, ' ').trim();
                return Array.from(part.classList).filter((c) => c !== 'item').join(' ');
            })
        );
    }

    /** The "References" block (CitationsPages' reader). */
    references() {
        return landingReferences(this.page);
    }

    /** The "Downloads" section with its chart. */
    downloadsChart() {
        return this.mainColumn().locator('section.item.downloads_chart');
    }

    /**
     * The drawn chart as Chart.js holds it: its type and every value of
     * its first data set; null until it is drawn.
     */
    async chartReading() {
        return this.downloadsChart().locator('canvas.usageStatsGraph').evaluate((canvas) => {
            const w = /** @type {any} */ (window);
            const chart = w.Chart && w.Chart.getChart ? w.Chart.getChart(canvas) : null;
            if (!chart) return null;
            const set = chart.data.datasets[0] || {data: []};
            return {type: chart.config.type, values: [...set.data].map(Number)};
        });
    }

    // --- the side column -------------------------------------------------

    /** The cover image part. */
    coverImage() {
        return this.sideColumn().locator('.item.cover_image');
    }

    /** The cover image's link (the issue's cover, on an article with none of its own). */
    coverLink() {
        return this.coverImage().getByRole('link');
    }

    /** The main galley links, in order. */
    galleyLinks() {
        return this.sideColumn().locator('ul.galleys_links a');
    }

    /** The additional files' links, in order. */
    additionalFileLinks() {
        return this.sideColumn().locator('ul.supplementary_galleys_links a');
    }

    /** A galley link (either list) by its whole text ("PDF", "HTML (French (Canada))"). */
    galleyLink(label) {
        return this.sideColumn()
            .locator('ul.galleys_links a, ul.supplementary_galleys_links a')
            .filter({hasText: whole(label)});
    }

    /** The heading a screen reader reads over the main list ("Downloads"). */
    galleyListHeading() {
        return this.sideColumn().locator('.item.galleys').filter({has: this.page.locator('ul.galleys_links')}).locator('.pkp_screen_reader');
    }

    /**
     * Every heading of the two galley lists (h2 or h3), shown or not: one
     * per list, each `.pkp_screen_reader` (the OPS author's need).
     */
    galleyListHeadings() {
        return this.sideColumn().locator('.item.galleys').locator('h2, h3');
    }

    /** The heading a screen reader reads over the additional files ("Additional Files"). */
    additionalFilesHeading() {
        return this.sideColumn()
            .locator('.item.galleys')
            .filter({has: this.page.locator('ul.supplementary_galleys_links')})
            .locator('.pkp_screen_reader');
    }

    /** The "Published" / "Posted" line (its label and the date line). */
    publishedLine() {
        return this.sideColumn().locator('.item.published > .sub_item:not(.versions)');
    }

    /** The date line under "Published" / "Posted". */
    publishedValue() {
        return this.publishedLine().locator('.value');
    }

    /** The "Versions" part. */
    versionsPart() {
        return this.sideColumn().locator('.item.published .sub_item.versions');
    }

    /** The "Versions" entries, newest first. */
    versionEntries() {
        return this.versionsPart().locator('li');
    }

    /** A "Versions" entry's link (absent when the entry is plain text). */
    versionLink(text) {
        return this.versionsPart().getByRole('link', {name: text, exact: true});
    }

    /** A side-column sub-item by its label ("Issue", "Section", "Categories", "Article Number"). */
    sideItem(label) {
        return this.sideColumn()
            .locator('.sub_item, section.item')
            .filter({has: this.page.locator('h2.label', {hasText: whole(label)})});
    }

    /** A side-column sub-item's value. */
    sideValue(label) {
        return this.sideItem(label).locator('.value');
    }

    /**
     * The side column top to bottom as the eye reads it: "cover image" for
     * the cover, each galley link's words, and every visible part heading
     * (the screen-reader-only ones left out).
     *
     * @returns {Promise<string[]>}
     */
    async sideOutline() {
        return this.sideColumn().evaluate((column) => {
            const out = [];
            const walk = (el) => {
                for (const child of Array.from(el.children)) {
                    if (child.classList.contains('pkp_screen_reader')) continue;
                    if (child.classList.contains('cover_image')) {
                        out.push('cover image');
                        continue;
                    }
                    if (child.matches('ul.galleys_links, ul.supplementary_galleys_links')) {
                        child.querySelectorAll('a').forEach((a) => out.push((a.textContent || '').replace(/\s+/g, ' ').trim()));
                        continue;
                    }
                    if (child.matches('h2.label, h3.label')) {
                        out.push((child.textContent || '').replace(/\s+/g, ' ').trim());
                        continue;
                    }
                    walk(child);
                }
            };
            walk(column);
            return out;
        });
    }

    /**
     * Every heading of the item the eye sees (h1–h3, the screen-reader-only
     * ones left out), top to bottom, main column before side column.
     *
     * @returns {Promise<string[]>}
     */
    async visibleHeadings() {
        return this.article().evaluate((article) =>
            Array.from(article.querySelectorAll('h1, h2, h3'))
                .filter((h) => !h.classList.contains('pkp_screen_reader'))
                .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean)
        );
    }

    // --- opening galleys --------------------------------------------------

    /** Press a galley link that navigates (a reader page, a remote address). */
    async openGalley(label) {
        await this.galleyLink(label).click();
    }

    /**
     * Press a galley link that downloads: returns the file's suggested
     * name, the file's path on disk and whether the browser stayed on the
     * item's page.
     */
    async downloadGalley(label) {
        const before = this.page.url();
        const {download} = await captureDownload(this.page, () => this.galleyLink(label).click());
        await expect(this.title()).toBeVisible({timeout: T});
        return {name: download.suggestedFilename(), path: await download.path(), stayed: this.page.url() === before};
    }

    // --- "How to Cite" (Rules 15, 16) -----------------------------------

    /** The "How to Cite" block. */
    citationBlock() {
        return this.sideColumn().locator('.item.citation');
    }

    citationHeading() {
        return this.citationBlock().locator('h2.label');
    }

    /** The citation shown (`#citationOutput`). */
    citation() {
        return this.citationBlock().locator('#citationOutput');
    }

    /**
     * "More Citation Formats" (its accessible name ends in the icon's
     * glyph, so it is found by the list it controls and its words checked
     * by `expectFormatsButton()`).
     */
    formatsButton() {
        return this.citationBlock().locator('button[aria-controls="cslCitationFormats"]');
    }

    /** The button reads "More Citation Formats". */
    async expectFormatsButton() {
        await expect(this.formatsButton()).toHaveText(TEXT.moreFormats);
    }

    /** The list the button opens (`#cslCitationFormats`). */
    formatsList() {
        return this.citationBlock().locator('#cslCitationFormats');
    }

    /** The on-screen formats of the open list, in order. */
    formatLinks() {
        return this.formatsList().locator('ul.citation_formats_styles').first().locator('a');
    }

    /** "Download Citation" (the label over the downloads). */
    downloadCitationLabel() {
        return this.formatsList().locator('div.label');
    }

    /** The download formats, in order. */
    downloadFormatLinks() {
        return this.formatsList().locator('div.label + ul.citation_formats_styles a');
    }

    /** Press "More Citation Formats" until the list is open. */
    async openFormats() {
        await this.formatsButton().click();
        await expect(this.formatsButton()).toHaveAttribute('aria-expanded', 'true');
        await expect(this.formatsList()).toBeVisible();
    }

    /** Press "More Citation Formats" on the open list: it closes. */
    async closeFormats() {
        await this.formatsButton().click();
        await expect(this.formatsButton()).toHaveAttribute('aria-expanded', 'false');
        await expect(this.formatsList()).toBeHidden();
    }

    /**
     * Choose an on-screen format in the open list: waits for its fetch and
     * the citation to change; returns the new citation's words.
     *
     * @param {string} name the list's words ("IEEE")
     */
    async chooseFormat(name) {
        const before = flat(await this.citation().innerText());
        const id = CITATION_STYLES[name];
        const fetched = this.page.waitForResponse((r) => r.url().includes(`citationstylelanguage/get/${id}`), {timeout: T});
        await this.formatLinks().filter({hasText: whole(name)}).click();
        const response = await fetched;
        expect(response.status()).toBe(200);
        await expect.poll(async () => flat(await this.citation().innerText()), {timeout: T}).not.toBe(before);
        return flat(await this.citation().innerText());
    }

    /**
     * Choose a download format in the open list: returns the file's
     * suggested name and its text.
     *
     * @param {string} name "BibTeX", "Endnote/Zotero/Mendeley (RIS)"
     */
    async downloadCitation(name) {
        const {download} = await captureDownload(this.page, () =>
            this.downloadFormatLinks().filter({hasText: whole(name)}).click()
        );
        const file = await download.path();
        return {name: download.suggestedFilename(), text: file ? fs.readFileSync(file, 'utf8') : ''};
    }
};

// ---------------------------------------------------------------------------
// The PDF and HTML reader pages (Fields; Rules 11, 12)
// ---------------------------------------------------------------------------

exports.GalleyReaderPage = class GalleyReaderPage extends BasePage {
    /** The bar across the top. */
    bar() {
        return this.page.locator('header.header_view');
    }

    /** The return arrow. */
    returnLink() {
        return this.bar().locator('a.return');
    }

    /** What a screen reader reads for the arrow. */
    returnLinkName() {
        return this.returnLink().locator('.pkp_screen_reader');
    }

    /** The title link. */
    titleLink() {
        return this.bar().locator('a.title');
    }

    /** "Download" (the PDF reader's). */
    downloadLink() {
        return this.bar().locator('a.download');
    }

    /** What a screen reader reads for "Download". */
    downloadLinkName() {
        return this.downloadLink().locator('.pkp_screen_reader');
    }

    /** The outdated-version notice between the bar and the document. */
    notice() {
        return this.page.locator('.galley_view_notice_message');
    }

    /** The reader is there: its bar's title. */
    async expectLoaded() {
        await expect(this.titleLink()).toBeVisible({timeout: T});
    }

    // --- the PDF viewer ---------------------------------------------------

    /** The pdf.js viewer's frame. */
    pdfViewer() {
        return this.page.frameLocator('#pdfCanvasContainer iframe');
    }

    /** A pdf.js control by its element id (`pageNumber`, `zoomInButton`, `viewFindButton`, `printButton`, …). */
    pdfControl(id) {
        return this.pdfViewer().locator(`#${id}`);
    }

    /** The viewer's page count once the document has loaded (0 when none has). */
    async pdfPageCount() {
        const frame = this.page.frames().find((f) => /pdf\.js\/web\/viewer\.html/.test(f.url()));
        if (!frame) return 0;
        return frame.evaluate(() => {
            const app = /** @type {any} */ (window).PDFViewerApplication;
            return app && app.pdfDocument ? app.pagesCount : 0;
        }).catch(() => 0);
    }

    /** "Download": the file's suggested name. */
    async download() {
        const {download} = await captureDownload(this.page, () => this.downloadLink().click());
        return download.suggestedFilename();
    }

    // --- the HTML reader --------------------------------------------------

    /** The HTML full text's frame. */
    htmlFrame() {
        return this.page.frameLocator('iframe[name="htmlFrame"]');
    }
};

// ---------------------------------------------------------------------------
// Settings › Website › "Plugins": "Citation Style Language" (Settings
// bullets 4, 5; Fields, the settings window)
// ---------------------------------------------------------------------------

exports.CitationStyleSettings = class CitationStyleSettings extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {string} contextPath
     */
    constructor(page, contextPath) {
        super(page);
        this.contextPath = contextPath;
        this.pluginId = 'citationstylelanguageplugin';
        this.pluginName = 'Citation Style Language';
    }

    grid() {
        return this.page.locator('#pluginGridContainer');
    }

    /** The plugin's row. */
    row() {
        return this.grid().locator(`tr.gridRow[id$="-row-${this.pluginId}"]`);
    }

    /** The row's "Enabled" box. */
    enabledBox() {
        return this.row().getByRole('checkbox');
    }

    /**
     * The row's arrow (offered only while the plugin is on), closed
     * (`a.show_extras`) or open (`a.hide_extras`).
     */
    arrow() {
        return this.row().locator('a.show_extras, a.hide_extras');
    }

    /** The same as `arrow()`, by the name the OPS suite proposed: the arrow in either state. */
    anyArrow() {
        return this.arrow();
    }

    /** The "Settings" link under the arrow (in the row after it). */
    settingsLink() {
        return this.grid()
            .locator(`tr[id$="-row-${this.pluginId}"] + tr`)
            .getByRole('link', {name: 'Settings', exact: true});
    }

    /** Open Settings › Website › "Plugins" and wait for the row. */
    async openPlugins() {
        await this.page.goto(this.contextUrl(this.contextPath, '/management/settings/website'));
        await this.page.locator('#plugins-button').click();
        await expect(this.row()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** The in-page "Disable" question. */
    disableQuestion() {
        return this.page.getByRole('dialog').filter({hasText: TEXT.disableQuestion}).last();
    }

    /**
     * Tick or untick the row's box; unticking answers the question "OK".
     * Bounded by the grid's answer; returns the question's words when one
     * was asked.
     *
     * @param {boolean} want
     */
    async setEnabled(want) {
        const answered = this.page.waitForResponse(
            (r) => new RegExp(`plugin-grid/${want ? 'enable' : 'disable'}`).test(r.url()) && r.ok(),
            {timeout: T}
        );
        await this.enabledBox().click();
        let question = null;
        if (!want) {
            const dialog = this.disableQuestion();
            await expect(dialog).toBeVisible({timeout: T});
            question = flat(await dialog.innerText());
            await dialog.getByRole('button', {name: 'OK', exact: true}).click();
        }
        await answered;
        await waitForJQueryIdle(this.page);
        await expect(this.enabledBox()).toBeChecked({checked: want, timeout: T});
        return question;
    }

    /** The notices at the top right (the legacy notification area). */
    notices() {
        return this.page.locator('.pkp_notification:visible, [class*="otification"]:visible').filter({hasText: /\S/});
    }

    /**
     * Run an action and wait for a notice with these words it raises
     * (armed before the action).
     */
    async noticeDuring(text, action) {
        const seen = expect(this.notices().filter({hasText: text}).first()).toBeVisible({timeout: T});
        seen.catch(() => {});
        const result = await action();
        await seen;
        return result;
    }

    // --- the settings window ---------------------------------------------

    form() {
        return this.page.locator('#citationStyleLanguageSettingsForm');
    }

    /** The window around the form. */
    window() {
        return this.page.getByRole('dialog').filter({has: this.form()});
    }

    /** Press the row's arrow (when its "Settings" is not shown yet) and "Settings"; wait for the form. */
    async openSettings() {
        await expect(async () => {
            if (!(await this.settingsLink().isVisible())) {
                await this.row().locator('a.show_extras').click({timeout: 5_000});
            }
            await expect(this.settingsLink()).toBeVisible({timeout: 3_000});
        }).toPass({timeout: T});
        await expect(async () => {
            if (!(await this.form().isVisible())) {
                await this.settingsLink().click({timeout: 5_000});
            }
            await expect(this.form()).toBeVisible({timeout: 3_000});
        }).toPass({timeout: T});
        await expect(this.publisherLocationBox()).toBeVisible({timeout: T});
        await waitForJQueryIdle(this.page);
    }

    /** "Primary Citation Format"'s radio for a format name ("IEEE"). */
    primaryRadio(name) {
        return this.form().locator(`input[name="primaryCitationStyle"][value="${CITATION_STYLES[name]}"]`);
    }

    /** Every "Primary Citation Format" radio. */
    primaryRadios() {
        return this.form().locator('input[name="primaryCitationStyle"]');
    }

    /** "Additional Citation Formats"'s box for a format name. */
    additionalBox(name) {
        return this.form().locator(`input[name="enabledCitationStyles[]"][value="${CITATION_STYLES[name]}"]`);
    }

    additionalBoxes() {
        return this.form().locator('input[name="enabledCitationStyles[]"]');
    }

    /** "Downloadable Formats"'s box for a download name. */
    downloadBox(name) {
        return this.form().locator(`input[name="enabledCitationDownloads[]"][value="${CITATION_DOWNLOADS[name]}"]`);
    }

    downloadBoxes() {
        return this.form().locator('input[name="enabledCitationDownloads[]"]');
    }

    /** The chosen "Primary Citation Format" radio (none on a new journal). */
    checkedPrimaryRadios() {
        return this.form().locator('input[name="primaryCitationStyle"]:checked');
    }

    /** The ticked "Additional Citation Formats" boxes. */
    checkedAdditionalBoxes() {
        return this.form().locator('input[name="enabledCitationStyles[]"]:checked');
    }

    /** The ticked "Downloadable Formats" boxes. */
    checkedDownloadBoxes() {
        return this.form().locator('input[name="enabledCitationDownloads[]"]:checked');
    }

    publisherLocationBox() {
        return this.form().locator('input[name="publisherLocation"]');
    }

    okButton() {
        return this.form().getByRole('button', {name: 'OK', exact: true});
    }

    /** The form's "Cancel" (a link on a legacy form). */
    cancelControl() {
        return this.form()
            .getByRole('link', {name: 'Cancel', exact: true})
            .or(this.form().getByRole('button', {name: 'Cancel', exact: true}));
    }

    /** The window's header "Close". */
    closeButton() {
        return this.window().getByRole('button', {name: 'Close', exact: true}).first();
    }

    /** The window has gone and the modal store's close slot has passed. */
    async expectClosed() {
        await expect(this.form()).toHaveCount(0, {timeout: T});
        await waitForJQueryIdle(this.page);
        await this.page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
    }

    /** "OK": waits for the save's answer and the window closing. */
    async save() {
        const answered = this.page.waitForResponse(
            (r) => /verb=settings/.test(r.url()) && /save=/.test(r.url()) && r.request().method() === 'POST',
            {timeout: T}
        );
        await this.okButton().click();
        const response = await answered;
        await this.expectClosed();
        return response;
    }
};

// ---------------------------------------------------------------------------
// The article summary on the listing pages (Fields, the article summary;
// Rule 22)
// ---------------------------------------------------------------------------

exports.ArticleSummaries = class ArticleSummaries extends BasePage {
    /**
     * @param {import('@playwright/test').Page} page
     * @param {import('@playwright/test').Locator} [scope] the list to read
     *   ("Latest Publications", an issue's table of contents); the whole
     *   page when absent
     */
    constructor(page, scope) {
        super(page);
        this.scope = scope || page.locator('body');
    }

    /** Every summary in the scope. */
    all() {
        return this.scope.locator('.obj_article_summary, .obj_preprint_summary');
    }

    /** The summary whose title reads `title` (the subtitle aside). */
    summary(title) {
        return this.all().filter({has: this.page.locator('.title a', {hasText: title})});
    }

    /** A summary's title link. */
    titleLink(title) {
        return this.summary(title).locator('.title a');
    }

    /** A summary's subtitle. */
    subtitle(title) {
        return this.summary(title).locator('.subtitle');
    }

    /** A summary's cover link and image. */
    coverLink(title) {
        return this.summary(title).locator('.cover a');
    }

    coverImage(title) {
        return this.summary(title).locator('.cover img');
    }

    /** A summary's author line. */
    authors(title) {
        return this.summary(title).locator('.authors');
    }

    /** A summary's galley links, in order. */
    galleyLinks(title) {
        return this.summary(title).locator('ul.galleys_links a');
    }

    /** A preprint summary's keywords, in order. */
    keywords(title) {
        return this.summary(title).locator('.keywords li');
    }

    /** A preprint summary's details line ("Downloads: … - Submitted … - Posted …"). */
    details(title) {
        return this.summary(title).locator('.details');
    }
};
