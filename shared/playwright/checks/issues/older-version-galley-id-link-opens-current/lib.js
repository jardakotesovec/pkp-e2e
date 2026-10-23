// Helpers for walk.js (U13 OJS14). Requiring this file runs nothing.
const path = require('path');
const {expect} = require('@playwright/test');
const {screen, record, idle} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));

/**
 * Follow one typed address (or press) and say where the browser ended and
 * what the page is: the chain of answers to the navigation, the final
 * address, the page's kind (PDF reader, article page, "404 Not Found"), the
 * outdated-version and preview notices verbatim, the reader bar's "Download"
 * address, and the file when the address delivered one. Records the screen
 * under `label`.
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

/** The article page as a reader sees it: notices, the versions list, galley links. */
async function readLanding(page) {
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    const versions = await page.locator('a[href*="/version/"]').evaluateAll((as) => as.map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href')})));
    const galleys = await page.locator('a.obj_galley_link').evaluateAll((as) => as.map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href')})));
    return {
        url: rel(page.url()),
        title: await page.title(),
        outdated: (body.match(/This is an outdated version[^\n]*/) || [null])[0],
        preview: (body.match(/This is a preview[^\n]*/) || [null])[0],
        versions: versions.map((v) => ({...v, href: rel(v.href)})),
        galleys: galleys.map((g) => ({...g, href: rel(g.href)})),
    };
}

/** The workflow of a submission, newest version shown (main: its "Title & Abstract"). */
async function openNewestVersion(page, app, frame, submissionId) {
    const stable35 = app.line === 'stable-3_5_0';
    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const pages = frame.menuLink('Title & Abstract');
    if (!stable35) {
        await expect(frame.latestVersionNode()).toBeVisible({timeout: T});
        if (!(await pages.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    }
    await expect(pages.last()).toBeVisible({timeout: T});
    await pages.last().click();
    await idle(page);
    await sleep(800);
}

/**
 * The editor presses "Preview" on the newest version's page and lands on the
 * preview (same tab on main; a new tab is followed if one opens). Returns
 * the page that shows it and how it was reached.
 */
async function pressPreview(page, app, frame, submissionId) {
    await openNewestVersion(page, app, frame, submissionId);
    const button = page.getByRole('button', {name: 'Preview', exact: true}).or(page.getByRole('link', {name: 'Preview', exact: true})).first();
    await expect(button).toBeVisible({timeout: T});
    const popup = page.context().waitForEvent('page', {timeout: 8_000}).catch(() => null);
    const nav = page.waitForURL(/\/article\/view\//, {timeout: 8_000}).catch(() => null);
    await button.click();
    const [p] = await Promise.all([popup, nav]);
    const shown = p || page;
    if (p) await p.waitForURL(/\/article\//, {timeout: T}).catch(() => {});
    await idle(shown).catch(() => {});
    return {page: shown, newTab: shown !== page};
}

/**
 * The editor publishes the submission's newest (unpublished) version from
 * its workflow: main presses "Publish", keeps what "Review Publishing
 * Details" preselects, "Confirm", then "Publish"; 3.5 presses "Publish" and
 * the window's own "Publish". Returns the windows' words and the status of
 * the publish request.
 */
async function publishLatestVersion(page, app, frame, submissionId, name) {
    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
    const stable35 = app.line === 'stable-3_5_0';
    await openNewestVersion(page, app, frame, submissionId);
    const out = {versionNodes: await frame.versionNodeLabels().catch((e) => `error ${e.message}`)};
    record(`${name}-workflow`, await screen(page));
    const published = page.waitForResponse((r) => /\/publish$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: 60_000}).catch(() => null);
    const confirmDialog = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
    if (stable35) {
        const button = page.getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
        await expect(button).toBeVisible({timeout: T});
        out.button = flat(await button.innerText());
        await button.click();
        const panelPublish = page.getByRole('dialog').getByRole('button', {name: 'Publish', exact: true}).last();
        await panelPublish.waitFor({state: 'visible', timeout: T});
        await sleep(800);
        out.window = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 600);
        record(`${name}-window`, await screen(page));
        await panelPublish.click();
    } else {
        const pub = new PublicationScreen(page, app.contextPath);
        out.button = flat(await pub.publishButton().innerText().catch(() => null));
        const panel = await pub.pressPublish({or: confirmDialog});
        if (panel) {
            await sleep(500);
            out.window = flat(await panel.innerText().catch(() => null), 600);
            record(`${name}-window`, await screen(page));
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        }
        await expect(confirmDialog).toBeVisible({timeout: T});
        out.confirm = flat(await confirmDialog.innerText(), 300);
        await confirmDialog.getByRole('button', {name: 'Publish', exact: true}).click();
    }
    const r = await published;
    out.publish = r ? r.status() : null;
    await idle(page);
    await sleep(1500);
    record(`${name}-published`, await screen(page));
    return out;
}

/**
 * The editor presses "Create New Version" on the newest version and keeps
 * what the window offers: main's window (the version to copy, the stage,
 * the significance) "Confirm"; 3.5's question its confirming button.
 * Returns the window's words and the new version's ID.
 */
async function createNewVersion(page, app, frame, submissionId, name) {
    const stable35 = app.line === 'stable-3_5_0';
    await openNewestVersion(page, app, frame, submissionId);
    if (!stable35) await frame.revealPublicationEntry('Create New Version').catch(() => {});
    const opener = page.getByRole('link', {name: 'Create New Version', exact: true}).or(page.getByRole('button', {name: 'Create New Version', exact: true})).first();
    await expect(opener).toBeVisible({timeout: T});
    await opener.click();
    const w = page.getByRole('dialog').filter({has: page.getByRole('button', {name: /^(Confirm|Yes|OK)$/})}).last();
    await w.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(800);
    const out = {window: flat(await w.innerText().catch(() => null), 600)};
    record(`${name}-window`, await screen(page));
    const created = page.waitForResponse((x) => /\/publications\/\d+\/version$/.test(new URL(x.url()).pathname) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
    await w.getByRole('button', {name: /^(Confirm|Yes|OK)$/}).last().click();
    const cr = await created;
    out.status = cr ? cr.status() : null;
    out.id = cr ? (await cr.json().catch(() => ({}))).id || null : null;
    await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    await sleep(1000);
    record(`${name}-created`, await screen(page));
    return out;
}

/**
 * Open a page of one version in the workflow's side menu. `which` is
 * 'first' (the oldest version) or 'latest'. main lists a node per version,
 * its pages under it; 3.5 lists one version's pages, the one "All
 * Versions" picks ("Version 1: …").
 */
async function openVersionPage(page, app, frame, which, label) {
    if (app.line === 'stable-3_5_0') {
        const all = page.getByRole('button', {name: 'All Versions'}).first();
        if (await all.isVisible().catch(() => false)) {
            await all.click();
            const items = page.getByRole('menuitem');
            await expect(items.first()).toBeVisible({timeout: T});
            const item = which === 'first' ? items.filter({hasText: /^\s*Version 1:/}).first() : items.last();
            await item.click();
            await idle(page);
            await sleep(800);
        }
        await frame.revealPublicationEntry(label);
        await frame.menuLink(label).first().click();
        await idle(page);
        return {version: flat(await page.getByText(/^Version:?$/).first().locator('..').innerText().catch(() => null), 120)};
    }
    const nodes = frame.versionNodes();
    await expect(nodes.first()).toBeVisible({timeout: T});
    const node = which === 'first' ? nodes.first() : nodes.last();
    const nodeLabel = flat(await node.innerText());
    for (let attempt = 0; attempt < 2; attempt++) {
        const entries = await frame.menuEntries();
        const at = entries.findIndex((e) => e.level === 2 && e.label === nodeLabel);
        let j = at + 1;
        for (; j < entries.length && entries[j].level > 2; j++) {
            if (entries[j].label === label) break;
        }
        if (at >= 0 && j < entries.length && entries[j].label === label) {
            const nth = entries.slice(0, j).filter((e) => e.label === label).length;
            await frame.menuLink(label).nth(nth).click();
            await idle(page);
            return {version: nodeLabel};
        }
        await node.click();
        await idle(page);
        await sleep(500);
    }
    throw new Error(`no "${label}" under "${nodeLabel}"`);
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

module.exports = {T, sleep, flat, rel, visit, readLanding, openNewestVersion, pressPreview, publishLatestVersion, createNewVersion, openVersionPage, setVersionGalleyUrlPath};
