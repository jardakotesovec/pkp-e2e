// Helpers of walk.js here (issue report docs/issues/U13-OJS15-issue-xml-galley-downloads-not-lens.md).
// Requiring this file runs nothing. Every helper presses what a person presses, or reads what the
// screen shows. Page objects are required inside the functions (probe kit rule). The galley list
// read and the small PDF come from the U50 A11 walk's lib, the Lens page read from the U13 OJS9
// walk's.
const {idle, serverLog} = require('../../../probe');
const G = require('../issue-galley-interface-language-refused/lib');
const lens = require('../lens-formulas-not-typeset/lib');

const T = 30_000;
const {flat, sleep} = G;
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));

/** A small text file (an issue galley that is neither XML nor PDF). */
const TXT = (name) => ({name, mimeType: 'text/plain', buffer: Buffer.from('The whole issue as plain text.\n')});

/** Issues › `tab` › the issue's arrow › "Edit" › "Issue Galleys": the window. */
async function openIssueGalleys(page, app, tab, issue) {
    const {IssuesAdmin} = require('../../../pages/IssuesPages.js');
    const issues = new IssuesAdmin(page, app.contextPath);
    await issues.goto(tab);
    const win = await issues.openManagement(tab, issue);
    await win.openTab('Issue Galleys');
    return win;
}

/**
 * "Create Issue Galley": upload `file`, type `label`, keep the language shown, "Save". Returns the
 * window's own words, the upload's and the save's answers and the list after it.
 */
async function addIssueGalley(page, win, {label, file}) {
    const gw = await win.openCreateGalley();
    const form = flat(await gw.dialog.innerText().catch(() => null), 500);
    const up = await gw.upload(file);
    await gw.labelBox().fill(label);
    const language = await gw.localeSelect().evaluate((s) => (s.options[s.selectedIndex] ? s.options[s.selectedIndex].text.trim() : null)).catch(() => null);
    const saved = await gw.save();
    return {form, upload: up.status(), language, save: saved.status(), list: await G.galleyList(win)};
}

/** The issue's page as a reader sees it: its "Full Issue" heading and the galley links under it. */
async function readIssuePage(page) {
    const links = await page.locator('.galleys a.obj_galley_link').evaluateAll((as) => as.map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})));
    return {
        url: rel(page.url()),
        title: await page.title(),
        fullIssueHeading: flat(await page.locator('.galleys h2, .galleys h3').first().innerText().catch(() => null), 80),
        fullIssue: links.map((l) => ({...l, href: rel(l.href)})),
    };
}

/**
 * Press a galley link and read what follows, whichever it is: a download (its file name), or the
 * page the browser lands on. Returns both with every answer to an issue or article `view` or
 * `download` address on the way, and the server log's error lines written since the press.
 */
async function pressGalley(page, app, link) {
    const log = serverLog(app);
    const from = log.mark();
    const seen = [];
    const onResponse = (r) => {
        if (!/\/(issue|article)\/(view|download)\//.test(r.url())) return;
        const h = r.headers();
        seen.push({url: rel(r.url()), status: r.status(), location: rel(h.location) || null, type: h['content-type'] || null, disposition: h['content-disposition'] || null});
    };
    page.on('response', onResponse);
    const out = {before: rel(page.url()), listed: await link.count()};
    if (!out.listed) {
        page.off('response', onResponse);
        return out;
    }
    out.text = flat(await link.innerText(), 60);
    out.href = rel(await link.getAttribute('href'));
    // A download is awaited on its own event; a link that opens a page lets the wait run out.
    const dl = page.waitForEvent('download', {timeout: 10_000}).catch(() => null);
    await link.click();
    const d = await dl;
    if (d) {
        out.download = {suggestedFilename: d.suggestedFilename(), url: rel(d.url()), failure: await d.failure().catch((e) => `error ${e.message}`)};
        const p = out.download.failure ? null : await d.path().catch(() => null);
        if (p) out.download.bytes = require('fs').statSync(p).size;
    } else {
        out.download = null;
        await page.waitForLoadState('load').catch(() => {});
    }
    await sleep(1500);
    page.off('response', onResponse);
    out.after = rel(page.url());
    out.stayed = out.after === out.before;
    out.title = await page.title();
    out.responses = seen;
    out.serverLog = log.since(from).map((l) => flat(l, 600));
    return out;
}

/** A galley link by its label, among the links `scope` selects. */
function galleyLink(page, scope, label) {
    return page.locator(scope).filter({hasText: new RegExp(`(^|\\s)${label}(\\s|$)`)}).first();
}

/** The Lens reader page: what Lens laid out, the page's words and its script errors. */
async function readLensPage(page, errors) {
    const read = await lens.readLens(page);
    // The kit's screen() waits on the page's jQuery and hangs on the Lens page: read its text directly.
    const text = flat(await page.locator('body').innerText().catch(() => ''), 900);
    return {
        url: rel(page.url()),
        title: read.title,
        tabs: read.tabs,
        headings: read.headings,
        lensNodes: await page.locator('.content-node').count().catch(() => null),
        text,
        errors: errors.splice(0),
    };
}

/** The PDF reader page: its bar's title, its "Download" address and the viewer's frame. */
async function readPdfReader(page) {
    await idle(page).catch(() => {});
    return {
        url: rel(page.url()),
        title: await page.title(),
        barTitle: flat(await page.locator('header a.title').innerText().catch(() => null), 120),
        downloadHref: rel(await page.locator('header a.download').getAttribute('href').catch(() => null)),
        viewerFrame: rel(await page.locator('#pdfCanvasContainer iframe').getAttribute('src').catch(() => null)),
    };
}

module.exports = {T, flat, sleep, rel, PDF: G.PDF, TXT, openIssueGalleys, addIssueGalley, readIssuePage, pressGalley, galleyLink, readLensPage, readPdfReader, watchErrors: lens.watchErrors};
