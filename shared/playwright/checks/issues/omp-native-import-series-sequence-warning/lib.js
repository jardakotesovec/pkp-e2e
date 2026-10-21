// Helpers for OMP's Native XML Plugin page (Tools › Import/Export › "Native XML Plugin"), used by walk.js.
// Copied from the U63 A9 walk's lib.js (checks/issues/unknown-section-import-broken-submission) so this
// folder stands alone. Requiring this file runs nothing.
const fs = require('fs');
const {screen, shot, record, idle} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const NATIVE = '/management/importexport/plugin/NativeImportExportPlugin';

// A server error's own text is never kept in a file here; only whether one was shown.
const INTERNALS = /SQLSTATE|Stack trace|\.php(:| on line )\d+/;
async function snap(page, name) {
    const s = await screen(page);
    if (INTERNALS.test(JSON.stringify(s))) {
        record(name, {url: s.url, title: s.title, withheld: 'server error text; not kept'});
        return {name, serverText: true};
    }
    record(name, s);
    await shot(page, name).catch(() => {});
    return {name, serverText: false};
}

/** Every non-asset response of 400 or more and every non-GET request. */
function watch(page) {
    const seen = [];
    const on = (r) => {
        if (/\.(js|css|png|svg|woff2?)(\?|$)/.test(r.url())) return;
        if (r.request().method() === 'GET' && r.status() < 400 && !/NativeImportExportPlugin\/(import|export)/.test(r.url())) return;
        seen.push({method: r.request().method(), url: rel(r.url()).replace(/csrfToken=[^&]+/, 'csrf').replace(/temporaryFileId=\d+/, 'temporaryFileId=…').slice(0, 160), status: r.status()});
    };
    page.on('response', on);
    return {seen, stop: () => page.off('response', on)};
}

/** Script errors the page raised, caught or not. */
function scriptErrors(page) {
    const errs = [];
    page.on('pageerror', (e) => errs.push(flat(e.message, 200)));
    page.on('console', (m) => { if (m.type() === 'error' && /^\w*Error\b/.test(m.text())) errs.push(flat(m.text(), 200)); });
    return errs;
}

const tabs = (page) => page.locator('#importExportTabs > ul [role="tab"]').evaluateAll((ts) => ts.map((t) => ({text: t.innerText.trim(), selected: t.getAttribute('aria-selected') === 'true'}))).catch(() => []);
const panelText = async (page) => flat(await page.locator('#importExportTabs [role="tabpanel"]:visible').first().innerText().catch(() => null), 2000);

async function openNative(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en${NATIVE}`));
    await page.locator('#importExportTabs').waitFor({timeout: 20_000});
    await idle(page).catch(() => {});
}

/** Press a tab button and wait for a results tab to be added and filled; returns what it shows. */
async function pressForResults(page, button) {
    const before = (await tabs(page)).length;
    await button.click();
    let added = false;
    for (let i = 0; i < 60; i++) {
        await sleep(500);
        if ((await tabs(page)).length > before) {
            added = true;
            const t = await panelText(page);
            if (t && /completed|failed|error|warning|Download/i.test(t)) break;
        }
        if (i === 20 && !added) break;
    }
    await idle(page).catch(() => {});
    await sleep(800);
    return {tabs: (await tabs(page)).map((t) => `${t.text}${t.selected ? '*' : ''}`), panel: await panelText(page)};
}

async function openExportTab(page) {
    await page.getByRole('tab', {name: 'Export', exact: true}).first().click();
    await idle(page).catch(() => {});
    await page.locator('#exportSubmissions-tab .listPanel__item, #exportSubmissions-tab .listPanel__empty').first().waitFor({timeout: 10_000}).catch(() => {});
    await idle(page).catch(() => {});
}

/** "Export" tab: tick the book by title (searching the list), "Export Submissions", "Download Exported File"; returns the file's text. */
async function exportOne(page, title) {
    await openExportTab(page);
    const tab = page.locator('#exportSubmissions-tab');
    let item = tab.locator('.listPanel__item').filter({hasText: title});
    if (!(await item.count())) {
        const search = tab.locator('input[type=search]').first();
        await search.fill(title.slice(0, 40));
        await sleep(1200); await idle(page).catch(() => {});
        item = tab.locator('.listPanel__item').filter({hasText: title});
    }
    await item.first().locator('input[type=checkbox]').check();
    const res = await pressForResults(page, tab.getByRole('button', {name: 'Export Submissions', exact: true}));
    const dlP = page.waitForEvent('download', {timeout: 20_000});
    await page.locator('#importExportTabs [role="tabpanel"]:visible').first().getByRole('button', {name: 'Download Exported File'}).click();
    const d = await dlP;
    const xml = fs.readFileSync(await d.path(), 'utf8');
    return {res, file: d.suggestedFilename(), xml};
}

/** "Import" tab: choose the file under "File", wait for the upload, press "Import". */
async function importFile(page, file) {
    await page.getByRole('tab', {name: 'Import', exact: true}).first().click();
    await idle(page).catch(() => {});
    const up = page.waitForResponse((r) => r.url().includes('uploadImportXML'), {timeout: 30_000});
    await page.locator('#importXmlForm input[type=file]').first().setInputFiles(file);
    const u = await up;
    await idle(page).catch(() => {});
    await sleep(500);
    const uploaded = {status: u.status(), box: flat(await page.locator('#importXmlForm').innerText().catch(() => null), 300)};
    const res = await pressForResults(page, page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}));
    return {uploaded, ...res};
}

module.exports = {sleep, flat, rel, snap, watch, scriptErrors, openNative, openExportTab, exportOne, importFile};
