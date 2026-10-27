// Helpers for walk.js (issue report docs/issues/U64-A17-word-downloads-missing-from-article-statistics.md).
// Requiring this file runs nothing. Copied so this folder stands alone:
//   addGalleyToLatestVersion, publishLatestVersion, filesDir, runJobs, nextDay: the U64 claim check
//     I23E (../../U64/I23E/lib.js, itself from ../lens-formulas-not-typeset, ../older-version-pdf-reader-empty,
//     ../book-file-open-download-fails, ../download-issues-stops-at-30);
//   openGalleys, post (a preprint server): ../listing-offers-galley-without-file/lib.js;
//   addFormatFile (a press): ../html-file-omp-links-dead/lib.js addFreeFormatFile, with the component chosen
//     by name and no dependent files.
const fs = require('fs');
const path = require('path');
const {expect} = require('@playwright/test');
const {execFileSync} = require('child_process');
const {screen, shot, record, idle, drainJobs, sql, outFile} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => (u == null ? u : String(u).replace(/^https?:\/\/[^/]+/, ''));
const VISIBLE_DIALOG = '[role="dialog"]:visible';
/** Yesterday's date (YYYY-MM-DD, local), the day nextDay() moves today's visits to. */
const yesterday = () => { const d = new Date(Date.now() - 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** An ordinary desktop browser's name, so neither line's list of robots drops the reader's visit. */
const READER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** The usage lines of the galley's files, slimmed. */
function slimLines(lines) {
    return lines.map((e) => ({time: e.time, assocType: e.assocType, submissionId: e.submissionId, representationId: e.representationId,
        submissionFileId: e.submissionFileId, fileType: e.fileType, url: rel(e.canonicalUrl), ua: flat(e.userAgent, 140)}));
}

/** Each app's words for the Steps. */
const WORDS = {
    ojs: {statsPage: 'Articles', downloadItems: 'Download Articles', itemPath: (id) => `article/view/${id === 1 ? 'mwandenga' : id}`},
    omp: {statsPage: 'Monographs', downloadItems: 'Download Monographs', itemPath: (id) => `catalog/book/${id}`},
    ops: {statsPage: 'Preprints', downloadItems: 'Download Preprints', itemPath: (id) => `preprint/view/${id}`},
};

// ---------------------------------------------------------------------------
// The item's file links on its public page, and a press of one.

/** The file links of the item's page: a journal's and a server's galley links, a press's format files. */
function fileLinks(page, app) {
    return app.name === 'omp' ? page.locator('.pub_format_single a.cmp_download_link, .pub_format_remote a') : page.locator('a.obj_galley_link');
}

/**
 * Signed out: the item's page, then each label in `labels` pressed from it in turn (the page opened
 * afresh before each). A press that saves a file reports the file; one that opens a page (the PDF
 * viewer) reports the page. Every response of a file address is kept.
 */
async function readerVisits(page, app, itemId, labels) {
    const out = {presses: []};
    const files = [];
    page.context().on('response', (r) => {
        if (!/\/(article|preprint|catalog)\/(view|download)\//.test(r.url())) return;
        files.push({url: rel(r.url()).slice(0, 160), status: r.status(), type: flat(r.headers()['content-type'], 80),
            disposition: flat(r.headers()['content-disposition'], 120)});
    });
    const itemUrl = app.url(`/index.php/${app.contextPath}/${WORDS[app.name].itemPath(itemId)}`);
    for (const [i, label] of labels.entries()) {
        await page.goto(itemUrl);
        await idle(page).catch(() => {});
        if (i === 0) {
            record('reader-item-page', await screen(page));
            await shot(page, 'reader-item-page').catch(() => {});
            out.links = await fileLinks(page, app).evaluateAll((as) => as.map((a) => ({text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href')})));
            out.links = out.links.map((l) => ({...l, href: rel(l.href)}));
        }
        const link = fileLinks(page, app).filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
        const press = {label, found: await link.count()};
        if (press.found) {
            const dl = page.waitForEvent('download', {timeout: 12_000}).catch(() => null);
            await link.click();
            const d = await dl;
            press.download = d ? {file: d.suggestedFilename(), url: rel(d.url()), bytes: await d.path().then((p) => (p ? fs.statSync(p).size : null)).catch(() => null)} : null;
            await idle(page).catch(() => {});
            await sleep(d ? 1500 : 4000);
            press.pageAfter = {url: rel(page.url()), title: await page.title().catch(() => null)};
            if (!d) record(`reader-${label.replace(/\W+/g, '-').toLowerCase()}`, await screen(page));
        }
        out.presses.push(press);
    }
    out.fileResponses = files;
    return out;
}

// ---------------------------------------------------------------------------
// Statistics › "Articles" ("Monographs", "Preprints").

/**
 * The manager's read: the item's row, the page's own list answer, the chart's "Files", "Download
 * Report" › the items' and the files' spreadsheets, and the publication stats API for the item (no
 * screen calls it: asked as the manager, with no dates and with the page's range).
 */
async function readStats(page, app, itemId, title) {
    const R = {};
    const got = page.waitForResponse((r) => /\/api\/v1\/stats\/publications\?/.test(r.url()), {timeout: T}).catch(() => null);
    await page.goto(app.url(`/index.php/${app.contextPath}/stats/publications/publications`));
    const r = await got;
    await idle(page).catch(() => {});
    await sleep(1000);
    R.heading = flat(await page.locator('h1').first().innerText().catch(() => null), 80);
    R.request = r ? {url: decodeURIComponent(rel(r.url())).slice(0, 300), status: r.status()} : null;
    const body = r ? await r.json().catch(() => null) : null;
    const item = body && body.items ? body.items.find((i) => JSON.stringify(i).includes(title)) || null : null;
    R.listItem = item ? {...item, publication: item.publication ? {id: item.publication.id} : null} : null;
    R.listOrder = body && body.items ? body.items.map((i) => (i.publication ? i.publication.id : null)) : null;
    R.range = flat(await page.locator('.pkpDateRange__current').first().innerText().catch(() => null), 80);
    const table = await page.locator('.pkpStats__panel table').first().evaluate((tbl) => ({
        head: [...tbl.querySelectorAll('thead th')].map((th) => th.innerText.replace(/\s+/g, ' ').trim()),
        rows: [...tbl.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
    })).catch((e) => ({err: flat(e.message, 120)}));
    R.head = table.head;
    R.rows = table.rows;
    R.row = (table.rows || []).find((cells) => cells.some((c) => c.includes(title))) || null;
    R.rowByHead = R.row && R.head ? Object.fromEntries(R.head.map((h, i) => [h.replace(/\s*Sort.*$/i, ''), R.row[i]])) : null;
    record('stats-items', await screen(page));
    await shot(page, 'stats-items').catch(() => {});

    const tl = page.waitForResponse((x) => /\/api\/v1\/stats\/publications\/timeline/.test(x.url()), {timeout: 15_000}).catch(() => null);
    const filesBtn = page.getByRole('button', {name: 'Files', exact: true}).first();
    R.filesButton = await filesBtn.count();
    if (R.filesButton) {
        await filesBtn.click();
        const t = await tl;
        if (t) {
            const j = await t.json().catch(() => null);
            R.filesTimeline = {url: decodeURIComponent(rel(t.url())).slice(0, 300), status: t.status(), nonZero: Array.isArray(j) ? j.filter((p) => p.value) : j};
        }
        await idle(page).catch(() => {});
        await sleep(800);
        R.filesChartTable = await page.locator('.pkpStats__graph table, .pkpStats table').first().innerText().then((t) => flat(t, 600)).catch(() => null);
        record('stats-items-files-chart', await screen(page));
    }

    R.downloads = {};
    for (const name of [WORDS[app.name].downloadItems, 'Download Files']) {
        const dlg = page.getByRole('dialog').filter({hasText: 'Download a CSV'});
        if (!(await dlg.isVisible().catch(() => false))) {
            await page.getByRole('button', {name: 'Download Report', exact: true}).click();
            await dlg.waitFor({state: 'visible', timeout: T});
            record('stats-download-window', await screen(page));
        }
        const dlP = page.waitForEvent('download', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name, exact: true}).click();
        const d = await dlP;
        if (d) {
            const p = await d.path().catch(() => null);
            const text = p ? fs.readFileSync(p, 'utf8') : '';
            const key = name === 'Download Files' ? 'download-files' : 'download-items';
            if (p) fs.copyFileSync(p, outFile(`${key}.csv`));
            const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
            const headAt = lines.findIndex((l) => /^"?(ID|Article ID|Preprint ID|Monograph ID)"?,/.test(l));
            R.downloads[name] = {file: d.suggestedFilename(), head: headAt >= 0 ? lines[headAt] : null,
                lines: lines.filter((l) => l.includes(title.slice(0, 30)) || /\.docx|\.pdf|\.txt|\.csv/i.test(l)).slice(0, 12)};
        } else {
            R.downloads[name] = null;
        }
        await sleep(800);
    }

    const range = /dateStart=([\d-]+)&dateEnd=([\d-]+)/.exec((R.request && R.request.url) || '');
    const single = (query) => page.evaluate(async ({id, query}) => {
        const base = window.pkp && pkp.context && pkp.context.apiBaseUrl;
        if (!base) return {err: 'no apiBaseUrl'};
        const res = await fetch(`${base}stats/publications/${id}${query}`, {headers: {'X-Csrf-Token': pkp.currentUser.csrfToken}});
        let j = null;
        try { j = await res.json(); } catch (e) { j = null; }
        if (j && j.publication) j.publication = {id: j.publication.id};
        return {query, status: res.status, body: j};
    }, {id: itemId, query}).catch((e) => ({err: flat(e.message, 200)}));
    R.singleRange = range ? await single(`?dateStart=${range[1]}&dateEnd=${range[2]}`) : null;
    return R;
}

// ---------------------------------------------------------------------------
// A preprint server's galleys and "Post" (from ../listing-offers-galley-without-file/lib.js).

/**
 * Open the "Galleys" page of the submission's newest version in the
 * editorial workflow: Publication ("Preprint") › "Galleys".
 */
async function openGalleys(page, app, submissionId) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const group = app.name === 'ops' ? 'Preprint' : 'Publication';
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: group}});
    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const link = frame.menuLink('Galleys');
    if (!(await link.last().isVisible().catch(() => false))) {
        if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) await frame.latestVersionNode().click();
        else await frame.publicationGroup().click();
    }
    await expect(link.last()).toBeVisible({timeout: T});
    await link.last().click();
    const galleys = new GalleyManager(page, frame);
    await galleys.expectLoaded();
    return galleys;
}

/**
 * A preprint server's "Preprint entry" of the submission's newest version (Preprint › "Preprint entry"):
 * "Date Published" typed, "Save". Used so the item page's chart, which starts on that date, takes in
 * downloads the same-day shortcut (nextDay) dates to the day before.
 */
async function setDatePublished(page, app, submissionId, date) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Preprint'}});
    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const link = frame.menuLink('Preprint entry');
    if (!(await link.last().isVisible().catch(() => false))) {
        if (app.line !== 'stable-3_5_0' && (await frame.latestVersionNode().isVisible().catch(() => false))) await frame.latestVersionNode().click();
        else await frame.publicationGroup().click();
    }
    await expect(link.last()).toBeVisible({timeout: T});
    await link.last().click();
    await idle(page);
    const box = page.locator('input[name="datePublished"]').first();
    await box.waitFor({timeout: T});
    await sleep(600);
    const before = await box.inputValue().catch(() => null);
    await box.fill(date);
    await box.press('Tab').catch(() => {});
    const w = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()), {timeout: T}).catch(() => null);
    await box.locator('xpath=ancestor::form[1]').getByRole('button', {name: 'Save', exact: true}).click();
    const r = await w;
    await idle(page);
    await sleep(600);
    record('ops-date-published', await screen(page));
    return {before, typed: date, save: r ? r.status() : null, after: await box.inputValue().catch(() => null)};
}

/** The workflow's "Post" on a preprint server, confirmed with the window's "Post". */
async function post(page) {
    const control = page.getByRole('button', {name: 'Post', exact: true}).first();
    await expect(control).toBeVisible({timeout: T});
    await control.click();
    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
    await expect(confirm).toBeVisible({timeout: T});
    const text = flat(await confirm.last().innerText(), 300);
    const answered = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T});
    await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
    const r = await answered;
    await page.getByRole('button', {name: 'Unpost', exact: true}).first().waitFor({timeout: T}).catch(() => {});
    await idle(page);
    return {confirm: text, status: r.status()};
}

// ---------------------------------------------------------------------------
// A press's publication format with one file (from ../html-file-omp-links-dead/lib.js addFreeFormatFile).

/**
 * A press manager adds a free, approved, available publication format holding one file to a
 * book, on the workflow's "Publication Formats" page, as a person does: "Add publication
 * format" (the name, "OK"), the format row's "Change File" (the component named, the file,
 * "Continue" twice, "Complete"), the file row's "Set Terms" ("Open Access", "Save"), the
 * format row's "Awaiting Approval" and "Not Available", each confirmed with "OK". Returns the words of each row and window met.
 */
async function addFormatFile(page, app, {submissionId, formatName, file, fileName, component = 'Book Manuscript'}) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Publication'}});
    const out = {};
    const wf = () => page.locator(VISIBLE_DIALOG).first();
    const top = () => page.locator(VISIBLE_DIALOG).last();
    const snap = async (name) => record(name, await screen(page));
    const pressAndConfirm = async (key, link, {before = null, confirm = /^(OK|Yes|Approve|Save)$/} = {}) => {
        if (!(await link.count())) {
            out[key] = 'no such link';
            return;
        }
        const name = flat(await link.innerText().catch(() => null), 80);
        await link.click();
        await idle(page);
        await sleep(900);
        if (before) await before();
        const question = flat(await top().innerText().catch(() => null), 300);
        const button = top().getByRole('button', {name: confirm}).first();
        const buttonName = flat(await button.innerText().catch(() => null), 40);
        await snap(`add-${key}`);
        await button.click().catch(() => {});
        await idle(page);
        await sleep(1200);
        out[key] = {link: name, window: question, pressed: buttonName};
    };

    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const menu = frame.menuLink('Publication Formats');
    if (!(await menu.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    await menu.last().click();
    await idle(page);
    await sleep(800);
    await snap('add-1-formats');

    const add = wf().getByRole('link', {name: 'Add publication format'}).first();
    await add.click();
    await top().locator('input[name^="name"]').first().waitFor({timeout: T});
    await idle(page);
    await top().locator('input[name^="name"]').first().fill(formatName);
    await snap('add-2-format-window');
    await top().getByRole('button', {name: 'OK', exact: true}).click();
    await idle(page);
    await sleep(1500);
    await idle(page);

    const formatRow = () => wf().locator('tr').filter({hasText: formatName}).filter({has: page.locator('.onix_code')}).first();
    out.formatRowNew = flat(await formatRow().innerText().catch(() => null), 300);
    const change = formatRow().getByRole('link', {name: 'Change File', exact: true}).first();
    await change.click();
    const wizard = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    await wizard.locator('input[type="file"]').waitFor({state: 'attached', timeout: T});
    await idle(page);
    const genre = wizard.locator('select[id^="genreId"]');
    if (await genre.count()) {
        const options = await genre.locator('option').evaluateAll((els) => els.map((x) => ({v: x.value, t: x.text.trim()})).filter((x) => x.v));
        const pick = options.find((o) => o.t === component) || options[0];
        await genre.selectOption(pick.v);
        out.component = pick.t;
    }
    await wizard.locator('input[type="file"]').setInputFiles(file);
    await page.waitForFunction(() => {
        const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length);
        return b && !b.disabled;
    }, null, {timeout: T});
    await snap('add-3-upload-window');
    await wizard.getByRole('button', {name: 'Continue', exact: true}).click();
    await idle(page);
    await sleep(800);
    const outer = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).first();
    await outer.getByRole('button', {name: 'Continue', exact: true}).click();
    await idle(page);
    await sleep(800);
    await outer.getByRole('button', {name: 'Complete', exact: true}).click();
    await idle(page);
    await sleep(1500);
    await idle(page);

    const fileRow = () => wf().locator('tr.gridRow').filter({hasText: fileName}).first();
    out.fileRowNew = flat(await fileRow().innerText().catch(() => null), 200);
    await pressAndConfirm('4-file-terms', fileRow().getByRole('link', {name: 'Set Terms', exact: true}).first(), {
        before: async () => {
            const open = top().locator('input[type="radio"][value="openAccess"]').first();
            if (await open.count()) await open.check();
        },
    });
    await pressAndConfirm('5-format-approval', formatRow().getByRole('link', {name: 'Awaiting Approval', exact: true}).first());
    await pressAndConfirm('6-format-availability', formatRow().getByRole('link', {name: 'Not Available', exact: true}).first());
    out.formatRowReady = flat(await formatRow().innerText().catch(() => null), 300);
    await snap('add-6-ready');
    return out;
}

// ---------------------------------------------------------------------------
// A journal's galleys and "Publish", the files dir, the job queue and the night: copied from the
// U64 claim check I23E (../../U64/I23E/lib.js).

// From ../lens-formulas-not-typeset/lib.js.
/**
 * The editor adds a galley with a file to the submission's newest
 * (unpublished) version: Publication menu › the newest version ›
 * "Galleys" › "Add galley", the label, "Save", then the upload window
 * (component, file, "Continue" twice, "Complete").
 */
async function addGalleyToLatestVersion(page, app, submissionId, {label, component, file, name}) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Publication'}});
    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const galleysLink = frame.menuLink('Galleys');
    if (app.line !== 'stable-3_5_0') {
        await expect(frame.latestVersionNode()).toBeVisible({timeout: T});
        if (!(await galleysLink.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    }
    await expect(galleysLink.last()).toBeVisible({timeout: T});
    await galleysLink.last().click();
    const galleys = new GalleyManager(page, frame);
    await galleys.expectLoaded();
    const before = await galleys.labels();
    await galleys.addGalley({label, component, file, name});
    await idle(page);
    const after = await galleys.labels();
    record('step3-galleys', await screen(page));
    return {before, after};
}

// From ../older-version-pdf-reader-empty/lib.js.
/**
 * The editor publishes a submission's newest (unpublished) version from
 * its workflow: main presses the publish button, keeps what the "Review
 * Publishing Details" window preselects, "Confirm", then "Publish"; 3.5
 * presses "Publish" and the window's own "Publish". Returns the windows'
 * words and the publish request's status.
 */
async function publishLatestVersion(page, app, submissionId) {
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
    const stable35 = app.line === 'stable-3_5_0';
    const frame = new WorkflowPage(page, app.contextPath, {labels: {publicationGroup: 'Publication'}});
    await frame.gotoEditorial(submissionId);
    await frame.expectVersionLoaded().catch(() => {});
    await idle(page);
    const out = {submissionId, versionNodes: await frame.versionNodeLabels().catch((e) => `error ${e.message}`)};
    // The newest version's "Title & Abstract" (3.5 lists one version's pages).
    const pages = frame.menuLink('Title & Abstract');
    if (!stable35) {
        await expect(frame.latestVersionNode()).toBeVisible({timeout: T});
        if (!(await pages.last().isVisible().catch(() => false))) await frame.latestVersionNode().click();
    }
    await expect(pages.last()).toBeVisible({timeout: T});
    await pages.last().click();
    await idle(page);
    record('step1-workflow', await screen(page));
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
        out.window = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 800);
        record('step2-publish-window', await screen(page));
        await panelPublish.click();
    } else {
        const pub = new PublicationScreen(page, app.contextPath);
        out.button = flat(await pub.publishButton().innerText().catch(() => null));
        const panel = await pub.pressPublish({or: confirmDialog});
        if (panel) {
            await sleep(500);
            out.window = flat(await panel.innerText().catch(() => null), 800);
            out.versionStage = await panel.locator('select[name="versionStage"]').inputValue().catch(() => null);
            out.assignment = await panel.locator('input[name="assignment"]:checked').getAttribute('value').catch(() => null);
            record('step2-publish-window', await screen(page));
            await shot(page, 'step2-publish-window').catch(() => {});
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
    record('step2-published', await screen(page));
    return out;
}

// From ../book-file-open-download-fails/lib.js: the fleet's files_dir.
function filesDir(app) {
    const repo = path.join(__dirname, '../../../../..');
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.join(repo, app.configFile);
    const m = fs.readFileSync(config, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+)"?\s*$/m);
    return m ? m[1].trim() : null;
}

// From ../download-issues-stops-at-30/lib.js.
/**
 * Run the fleet's queued jobs to the end. main: the kit's `drainJobs()`. A stable line: the
 * app's `jobs.php run` until the `jobs` table is empty, because 3.5's `jobs.php work` does not
 * take the kit's `--stop-when-empty` and never ends.
 */
async function runJobs(app, config) {
    if (app.line === 'main') return drainJobs(app).then((r) => ({passes: r.passes, counts: r.counts}));
    let runs = 0;
    for (; runs < 60 && Number(sql(app, 'select count(*) from jobs')) > 0; runs++) {
        execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 120_000});
    }
    return {runs, left: sql(app, 'select count(*) from jobs'), failed: sql(app, 'select count(*) from failed_jobs')};
}

/**
 * The night between the visits and the Statistics page. The Steps say "the next day": the app's
 * daily task (`APP\tasks\UsageStatsLoader`) turns a day's log into figures the day after, and
 * the Statistics pages end their ranges at yesterday. A walk cannot wait, so this moves the
 * lines the app itself logged for the visits one day back (each line's `time`, nothing else),
 * hands the file to the loader's own stage folder under the name the app gave it, and runs the
 * app's own task and job queue on it:
 *   php lib/pkp/tools/scheduler.php test --name=APP\tasks\UsageStatsLoader
 *   php lib/pkp/tools/jobs.php work --stop-when-empty   (a stable line: `jobs.php run` until the queue is empty)
 * Returns the files and lines handed over and the `metrics_issue` rows the app compiled.
 */
async function nextDay(app) {
    const dir = path.join(filesDir(app), 'usageStats');
    const logs = path.join(dir, 'usageEventLogs');
    const stage = path.join(dir, 'stage');
    fs.mkdirSync(stage, {recursive: true});
    const back = (t) => new Date(new Date(`${t.replace(' ', 'T')}Z`).getTime() - 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
    const out = {files: [], lines: 0, issueLines: 0};
    for (const f of fs.existsSync(logs) ? fs.readdirSync(logs).filter((n) => n.endsWith('.log')) : []) {
        const lines = fs.readFileSync(path.join(logs, f), 'utf8').split('\n').filter(Boolean);
        const moved = lines.map((l) => l.replace(/"time":"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)"/, (_, t) => `"time":"${back(t)}"`));
        // The staged file is named for the day its lines now carry: the loader's compile jobs
        // delete a day's figures by the file name's date (PKPTemporaryTotalsDAO::
        // compileSubmissionMetrics, `orWhereDate`), so a file named for one day holding the
        // previous day's lines has its figures wiped by the file named for that day (r1 on
        // main 2026-10-23, where the dataset's own day log was still waiting).
        const m = /^usage_events_(\d{4})(\d\d)(\d\d)\.log$/.exec(f);
        const name = m ? `usage_events_${back(`${m[1]}-${m[2]}-${m[3]} 12:00:00`).slice(0, 10).replace(/-/g, '')}.log` : f;
        fs.writeFileSync(path.join(stage, name), moved.join('\n') + '\n');
        fs.unlinkSync(path.join(logs, f));
        out.files.push(`${f} -> ${name}`);
        out.lines += lines.length;
        out.issueLines += lines.filter((l) => /"issueId":\d+/.test(l) && !/"submissionId":\d+/.test(l)).length;
    }
    const repo = path.join(__dirname, '../../../../..');
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.join(repo, app.configFile);
    try {
        out.loader = flat(execFileSync('php', ['lib/pkp/tools/scheduler.php', 'test', '--name=APP\\tasks\\UsageStatsLoader'], {
            cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 120_000,
        }), 200);
    } catch (e) {
        out.loaderError = flat(`${e.message} ${e.stdout || ''} ${e.stderr || ''}`, 500);
    }
    out.jobs = await runJobs(app, config).catch((e) => ({error: flat(e.message, 300)}));
    if (app.name === 'ojs') out.metricsIssue = sql(app, 'select count(distinct issue_id), count(*), min(date), max(date), sum(metric) from metrics_issue');
    out.left = Object.fromEntries(['stage', 'processing', 'dispatch', 'reject', 'archive'].map((d) => [d, fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)) : null]));
    return out;
}

// ---------------------------------------------------------------------------
// The item page's "Downloads" chart (copied from the U13 claim check I27B, ../../U13/I27B/i27b.js
// setBarChart and readChart, trimmed to the save and the read).

/**
 * Settings › Website › Appearance › Theme: "Usage statistics display options" set to "Use bar type of
 * the chart for usage statistics display.", Save. Returns the field before and after, and the save's answer.
 */
async function setBarChart(page, app) {
    const out = {};
    const panel = () => page.locator('[role="tabpanel"]#theme').first();
    const field = () => panel().locator('.pkpFormField').filter({hasText: /Usage statistics display options/}).first();
    const readField = () => field().evaluate((f) => [...f.querySelectorAll('input[type=radio]')]
        .map((i) => ({value: i.value, checked: i.checked}))).catch((e) => ({err: flat(e.message, 200)}));
    await page.goto(app.url(`/index.php/${app.contextPath}/management/settings/website`));
    await idle(page);
    for (const id of ['appearance', 'theme']) {
        const b = page.locator(`#${id}-button`).first();
        await b.waitFor({timeout: T});
        if ((await b.getAttribute('aria-selected')) !== 'true') { await b.click(); await idle(page); }
    }
    await panel().getByRole('radio').first().waitFor({timeout: T});
    await sleep(400);
    out.before = await readField();
    await panel().getByRole('radio', {name: /^Use bar type/}).check();
    const w = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()), {timeout: T}).catch(() => null);
    await panel().getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await w;
    out.save = r ? {url: rel(r.url()).slice(0, 160), status: r.status()} : null;
    await idle(page);
    await sleep(800);
    record('theme-saved', await screen(page));
    out.after = await readField();
    return out;
}

/** The item page's "Downloads" chart as the page holds it: heading, the figures handed to it, and what it drew. */
async function readChart(page, itemId) {
    return page.evaluate((id) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const canvas = document.querySelector('canvas.usageStatsGraph');
        const section = canvas ? canvas.closest('section') : null;
        const S = typeof pkpUsageStats === 'undefined' ? null : pkpUsageStats;
        const data = S && S.data && S.data.Submission ? S.data.Submission[id] || null : null;
        let drawn = null;
        if (canvas && typeof Chart !== 'undefined' && Chart.getChart) {
            const c = Chart.getChart(canvas);
            if (c) drawn = {type: c.config.type, labels: c.data.labels, datasets: c.data.datasets.map((d) => ({label: d.label, data: d.data}))};
        }
        return {heading: t(section && section.querySelector('h2, h3')), canvas: !!canvas, data, drawn};
    }, itemId).catch((e) => ({err: flat(e.message, 200)}));
}

/** Signed out, in an ordinary browser: the item's page and its "Downloads" chart. */
async function chartVisit(page, app, itemId) {
    await page.goto(app.url(`/index.php/${app.contextPath}/${WORDS[app.name].itemPath(itemId)}`));
    await idle(page).catch(() => {});
    await sleep(1500);
    record('reader-chart', await screen(page));
    await shot(page, 'reader-chart').catch(() => {});
    const out = await readChart(page, itemId);
    await page.locator('canvas.usageStatsGraph').scrollIntoViewIfNeeded().catch(() => {});
    await sleep(400);
    // The step's reading: hover the last (current) month's bar, then read the tooltip Chart.js drew.
    out.tooltip = await page.evaluate(() => {
        const c = typeof Chart !== 'undefined' && Chart.getChart ? Chart.getChart(document.querySelector('canvas.usageStatsGraph')) : null;
        if (!c) return null;
        const els = c.getDatasetMeta(0).data;
        const el = els[els.length - 1];
        const r = c.canvas.getBoundingClientRect();
        return {x: r.left + el.x, y: r.top + (el.y + el.base) / 2};
    }).then(async (pt) => {
        if (!pt) return null;
        await page.mouse.move(pt.x, pt.y);
        await sleep(600);
        await shot(page, 'reader-chart-hover').catch(() => {});
        return page.evaluate(() => {
            const t = Chart.getChart(document.querySelector('canvas.usageStatsGraph')).tooltip;
            return t && t.opacity ? {title: t.title, body: (t.body || []).map((b) => b.lines.join(' '))} : {shown: false};
        });
    }).catch((e) => ({err: flat(e.message, 200)}));
    return out;
}

module.exports = {T, sleep, flat, rel, READER_UA, WORDS, slimLines, readerVisits, readStats, openGalleys, post, addFormatFile,
    addGalleyToLatestVersion, publishLatestVersion, filesDir, runJobs, nextDay,
    setBarChart, readChart, chartVisit, setDatePublished, yesterday};
