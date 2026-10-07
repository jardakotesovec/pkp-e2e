// Helpers for walk.js (U13 OJS14). Requiring this file runs nothing.
const {screen, record, idle} = require('../../../probe');
const {openVersionPage} = require('../jats-body-html-markup-as-text/lib');

const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));

/**
 * Follow one typed address (or press) and say where the browser ended and
 * what the page is: the chain of answers to the navigation, the final
 * address, the page's kind (PDF reader, article page, "404 Not Found"), the
 * outdated-version notice verbatim, the reader bar's "Download" address, and
 * the file when the address delivered one. Records the screen under `label`.
 */
async function visit(page, app, label, action, {download = false} = {}) {
    const chain = [];
    const onResponse = (r) => {
        const q = r.request();
        if (q.resourceType() === 'document' && q.frame() === page.mainFrame()) {
            const h = r.headers();
            chain.push({status: r.status(), url: rel(r.url()), ...(h.location ? {location: rel(h.location)} : {}), ...(h['content-disposition'] ? {disposition: h['content-disposition']} : {})});
        }
    };
    page.on('response', onResponse);
    const dl = download ? page.waitForEvent('download', {timeout: 15_000}).catch(() => null) : null;
    let error = null;
    try {
        await action();
    } catch (e) {
        // A typed address that delivers a file aborts the navigation ("Download is starting").
        error = flat(e.message, 160);
    }
    const file = dl ? await dl : null;
    await idle(page).catch(() => {});
    page.off('response', onResponse);
    const s = await screen(page);
    record(label, s);
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const out = {
        url: rel(page.url()),
        chain,
        title: await page.title(),
        notFound: /404 Not Found/.test(body),
        pdfReader: (await page.locator('#pdfCanvasContainer').count()) > 0,
        articlePage: (await page.locator('.obj_article_details').count()) > 0,
        notice: (body.match(/This is an outdated version[^\n]*/) || [null])[0],
        preview: (body.match(/This is a preview[^\n]*/) || [null])[0],
        readerDownload: rel(await page.locator('header a.download').getAttribute('href', {timeout: 2_000}).catch(() => null)),
        download: file ? {name: file.suggestedFilename(), url: rel(file.url())} : null,
        error,
    };
    console.log(`[fact] ${app.name} ${label}: ${JSON.stringify(out)}`);
    return out;
}

/**
 * The editor (signed in, the submission's workflow open in `frame`) types a
 * URL Path (an empty one clears it) on a galley of the 'first' (oldest) or
 * 'latest' version: the version in the side menu ("All Versions" on 3.5) ›
 * "Galleys" › the galley's "More Actions" › "Edit" › "URL Path" › "Save".
 * Returns the save's status.
 */
async function setVersionGalleyUrlPath(page, app, frame, which, galleyLabel, urlPath, name) {
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const opened = await openVersionPage(page, app, frame, which, 'Galleys');
    const galleys = new GalleyManager(page, frame);
    await galleys.expectLoaded();
    const labels = await galleys.labels().catch((e) => `error ${e.message}`);
    const win = await galleys.openEdit(galleyLabel);
    const before = await win.urlPathBox().inputValue();
    await win.type(win.urlPathBox(), urlPath);
    record(`${name}-edit-window`, await screen(page));
    const res = await win.save();
    await idle(page);
    record(`${name}-saved`, await screen(page));
    return {version: opened.version, galleys: labels, before, typed: urlPath, save: res.status()};
}

module.exports = {flat, rel, visit, setVersionGalleyUrlPath};
