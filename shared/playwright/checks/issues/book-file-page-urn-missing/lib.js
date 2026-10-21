// Helpers of walk.js here (issue report docs/issues/U20-OMP7-book-file-page-urn-missing.md).
// Requiring this file runs nothing. Every helper presses what a person presses, or reads what the
// screen (or the page's own source) shows. Page objects are required inside the functions (probe kit
// rule). Copied, so this folder stands alone: setUpUrn / openPublicationPage from
// publisher-id-on-tab-never-removed/lib.js, openFormats / openFileTab / closeWindow from
// issue-and-press-file-publisher-id-never-kept/lib.js, headTags from checks/U20/H13D/h13d.js.
const {idle, screen, record, shot} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const OMP_CHAPTERS = '../../../../../apps/omp/playwright/pages/ChapterPages.js';
const OMP_FORMATS = '../../../../../apps/omp/playwright/pages/PublicationFormatPages.js';

async function snap(page, name, {png = false} = {}) {
    record(name, await screen(page));
    if (png) await shot(page, name).catch(() => {});
}

/** The tags in a page source's head the two indexing plugins write, in source order. */
function headTags(html) {
    const head = (String(html || '').match(/<head[\s\S]*?<\/head>/i) || [''])[0];
    const out = [];
    for (const m of head.matchAll(/<(meta|link)\b[^>]*>/gi)) {
        const raw = m[0];
        const attr = (n) => { const x = raw.match(new RegExp(`\\s${n}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i')); return x ? (x[2] ?? x[3]) : null; };
        const name = attr('name'), rel = attr('rel');
        if (m[1].toLowerCase() === 'meta' && name && /^(citation_|gs_|DC\.)/i.test(name)) out.push(`${name}=${attr('content')}`);
        if (m[1].toLowerCase() === 'link' && rel && /^schema\.DC$/i.test(rel)) out.push(`link:${rel}=${attr('href')}`);
    }
    return out;
}
const idTags = (tags) => (tags || []).filter((t) => /^(DC\.Identifier|citation_urn|citation_doi)/.test(t));

/**
 * Settings › Website › "Plugins": "URN" enabled, its "Settings": the `kinds` ticked, a prefix, the
 * default patterns, namespace urn:nbn:de, a resolver, "Save".
 */
async function setUpUrn(page, app, kinds) {
    const {UrnPluginSettings} = require('../../../pages/IdentifiersPages.js');
    const plugins = new UrnPluginSettings(page, app.contextPath);
    await plugins.openPlugins();
    if (!(await plugins.enabledBox().isChecked())) await plugins.setEnabled(true);
    await plugins.openSettings();
    for (const k of kinds) await plugins.setKind(k, true);
    await plugins.prefixBox().fill('urn:nbn:de:0000-');
    await plugins.suffixRadio('default').check();
    await plugins.namespaceSelect().selectOption('urn:nbn:de');
    await plugins.resolverBox().fill('https://nbn-resolving.de/');
    await plugins.saveAccepted();
    return {kinds};
}

/** Open a Publication page of submission `sid`, version `pubId`: on main by its menu key, on 3.5 by the side menu's link. */
async function openPublicationPage(page, app, sid, pubId, label) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Publication', publicationHeading: 'Publication'}});
    const key = {Chapters: 'chapters', 'Publication Formats': 'publicationFormats'}[label];
    if (app.line === 'stable-3_5_0') {
        await frame.gotoEditorial(sid);
        await frame.expectVersionLoaded().catch(() => {});
        await frame.menuLink(label).first().click();
    } else {
        await frame.gotoEditorial(sid, {menuKey: `publication_${pubId}_${key}`});
    }
    await frame.expectPageHeading(label);
    await idle(page);
    return frame;
}

/** Publication › "Chapters" › the chapter's title › "Identifiers": the legacy identifiers window. */
async function openChapterTab(page, app, sid, pubId, title) {
    const {LegacyIdentifiersWindow} = require('../../../pages/IdentifiersPages.js');
    await openPublicationPage(page, app, sid, pubId, 'Chapters');
    const {ChapterList, ChapterWindow} = require(OMP_CHAPTERS);
    const list = new ChapterList(page);
    await list.expectLoaded();
    await list.titleLink(title).click();
    const cw = new ChapterWindow(page, 'Edit Chapter');
    await cw.expectOpen();
    const win = new LegacyIdentifiersWindow(page, cw.dialog());
    await win.openIdentifiersTab();
    await idle(page);
    return win;
}

/** OMP: the workflow of `submissionId` › Publication › "Publication Formats". */
async function openFormats(page, app, submissionId, publicationId) {
    const {PublicationFormatsPage} = require(OMP_FORMATS);
    const formats = new PublicationFormatsPage(page, app.contextPath);
    const key = app.line === 'stable-3_5_0' ? 'publication_publicationFormats' : `publication_${publicationId}_publicationFormats`;
    await formats.frame.gotoEditorial(submissionId, {menuKey: key});
    try {
        await formats.expectLoaded();
    } catch (e) {
        // a key the line does not know opens the stage view: take the side menu's link
        await formats.frame.dialog().getByRole('link', {name: 'Publication Formats', exact: true}).first().click();
        await formats.expectLoaded();
    }
    await idle(page);
    return formats;
}

/** OMP: a format's file row › arrow › "Edit" ("Edit a file") › "Identifiers". */
async function openFileTab(page, formats, format, fileName) {
    const {LegacyIdentifiersWindow} = require('../../../pages/IdentifiersPages.js');
    await formats.pressRowEntry(formats.fileRow(format, fileName), 'Edit');
    const dialog = page.getByRole('dialog').filter({has: page.getByRole('tab', {name: 'Identifiers', exact: true})}).last();
    const win = new LegacyIdentifiersWindow(page, dialog);
    await win.tab('Identifiers').waitFor({timeout: T});
    await win.openIdentifiersTab();
    await idle(page);
    return win;
}

/** Close an open legacy window with its "Close" (answering any "data has changed" confirm with OK). */
async function closeWindow(page, win) {
    if (!((await win.dialog.count()) > 0)) return;
    const onDialog = (d) => d.accept().catch(() => {});
    page.on('dialog', onDialog);
    try {
        await win.close();
    } finally {
        page.off('dialog', onDialog);
    }
}

/**
 * In an open "Identifiers" tab: read the URN area and the assign box's label and state as the tab opens
 * (the plugin renders the box ticked), leave the box as it is, press "Save". A box found unticked is
 * recorded and ticked, so the record shows the difference. Never throws on what the screen does.
 */
async function assignUrn(page, win, name) {
    const box = win.assignBox();
    const out = {area: flat(await win.urnArea().innerText().catch(() => ''), 300), assignBox: await box.count()};
    out.boxLabel = flat(await win.urnArea().locator('label').filter({has: page.locator('input[name="assignURN"]')}).innerText().catch(() => null), 200);
    out.tickedOnOpen = out.assignBox ? await box.isChecked().catch(() => null) : null;
    try {
        if (out.tickedOnOpen === false) await box.check();
        await snap(page, `${name}-before-save`);
        await win.save();
        out.saved = true;
    } catch (e) {
        out.error = flat(e.message, 300);
        await snap(page, `${name}-failed`, {png: true});
        await closeWindow(page, win).catch(() => {});
    }
    return out;
}

/** The links on the open page that lead to a chapter page or a file's view page, with their text. */
async function catalogLinks(page) {
    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim().slice(0, 100), href: a.getAttribute('href')})).filter((a) => /\/catalog\/(view|book)\//.test(a.href))).catch(() => []);
    return links.map((l) => ({...l, href: strip(l.href)}));
}

/**
 * On the page now open, click the first link whose address ends in `hrefEnd` (a person clicking the
 * link): the page it opens, its status and its own source's indexing tags (the navigation response's
 * text, which is what "View Page Source" shows).
 */
async function clickAndRead(page, hrefEnd, name, {png = false} = {}) {
    const link = page.locator(`a[href$="${hrefEnd}"]`).first();
    const out = {linkText: flat(await link.innerText().catch(() => null), 100), linkHref: strip(await link.getAttribute('href').catch(() => null))};
    const nav = page.waitForResponse((r) => r.request().isNavigationRequest() && r.frame() === page.mainFrame(), {timeout: T}).catch(() => null);
    await link.click({timeout: T}).catch((e) => { out.clickError = flat(e.message, 200); });
    const r = await nav;
    await idle(page).catch(() => {});
    const html = r ? await r.text().catch(() => '') : '';
    out.status = r ? r.status() : null;
    out.landed = strip(page.url());
    out.title = await page.title().catch(() => null);
    out.tags = headTags(html);
    out.ids = idTags(out.tags);
    out.urnTag = out.tags.filter((t) => /^DC\.Identifier\.URN=/.test(t));
    record(name, {...(await screen(page)), facts: {source: {...out, tags: undefined}}});
    if (png) await shot(page, name).catch(() => {});
    return out;
}

module.exports = {T, flat, sleep, strip, snap, headTags, idTags, setUpUrn, openPublicationPage, openChapterTab, openFormats, openFileTab, closeWindow, assignUrn, catalogLinks, clickAndRead};
