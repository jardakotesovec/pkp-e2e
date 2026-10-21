// Helpers for walk.js (issue report docs/issues/U63-A25-import-over-upload-limit-file-size-error.md):
// the Native XML Plugin page (Tools › "Import/Export" › "Native XML Plugin") and its "Upload File" box.
// Requiring this file runs nothing. Written from the Native XML issue walks' helpers, kept here because
// an issue walk's folder goes with its report.
const fs = require('fs');
const {screen, shot, record, idle, outFile} = require('../../../probe');

const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const LABELS = {
    ojs: {exportTab: 'Export Articles', exportBtn: 'Export Articles'},
    omp: {exportTab: 'Export', exportBtn: 'Export Submissions'},
    ops: {exportTab: 'Export Preprints', exportBtn: 'Export Preprints'},
};

/** The kit's screen() and a screenshot under one name; returns what the snapshot says. */
async function snap(page, name) {
    const s = await screen(page).catch((e) => ({url: page.url(), screenError: flat(e.message, 200)}));
    record(name, s);
    await shot(page, name).catch(() => {});
    return {name, notices: s.notices};
}

/** Every request to the Native XML plugin's handler, with its answer (the upload's and importBounce's bodies cut short). */
function watch(page) {
    const seen = [];
    const on = async (r) => {
        const m = r.url().match(/NativeImportExportPlugin\/(\w+)/);
        if (!m && r.status() < 400) return;
        if (/\.(js|css|png|svg|woff2?)(\?|$)/.test(r.url())) return;
        const e = {op: m ? m[1] : rel(r.url()).slice(0, 120), method: r.request().method(), status: r.status()};
        if (m && /uploadImportXML|importBounce/.test(m[1])) e.body = flat(await r.text().catch(() => null), 300).replace(/csrfToken=[A-Za-z0-9]+/g, 'csrfToken=…');
        seen.push(e);
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

const tabs = (page) => page.locator('#importExportTabs > ul [role="tab"]').evaluateAll((ts) => ts.map((t) => `${t.innerText.trim()}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`)).catch(() => []);
const panelText = async (page) => flat(await page.locator('#importExportTabs [role="tabpanel"]:visible').first().innerText().catch(() => null), 1500);

/** Step 2: side menu "Tools", its "Import/Export" tab, the "Native XML Plugin" link. */
async function openNativeFromTools(app, page) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
    await idle(page).catch(() => {});
    let via = 'side menu';
    const tools = page.getByRole('link', {name: 'Tools', exact: true}).first();
    if (await tools.count()) await tools.click();
    else { via = 'address (no "Tools" link found)'; await page.goto(app.url(`/index.php/${app.contextPath}/en/management/tools`)); }
    await idle(page).catch(() => {});
    const ie = page.getByRole('tab', {name: 'Import/Export', exact: true});
    if (await ie.count()) await ie.first().click();
    await page.getByRole('link', {name: 'Native XML Plugin', exact: true}).first().click({timeout: T});
    await page.locator('#importExportTabs').waitFor({timeout: T});
    await idle(page).catch(() => {});
    await sleep(500);
    return {via, url: rel(page.url()), tabs: await tabs(page)};
}

/** What the "Import" tab's upload box shows. */
async function boxState(page) {
    return page.locator('#importXmlForm').evaluate((f) => {
        const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => !!(e && (e.offsetWidth || e.offsetHeight));
        const up = f.querySelector('.pkp_controller_fileUpload');
        const add = f.querySelector('.pkp_uploader_button_add');
        const change = f.querySelector('.pkp_uploader_button_change');
        return {
            status: up ? [...up.classList].filter((c) => /loading|waiting|uploading|error|complete/.test(c)).join(' ') : null,
            error: t(f.querySelector('.pkpUploaderError')),
            fileName: t(f.querySelector('.pkpUploaderFilename')),
            button: vis(change) ? t(change) : vis(add) ? t(add) : null,
            temporaryFileId: (f.querySelector('#temporaryFileId') || {}).value || '',
            text: t(f).slice(0, 400),
        };
    });
}

/** Step 3: "Upload File", the file chosen in the picker; waits for the upload when one is sent. */
async function chooseFile(page, file) {
    let started = false;
    const onReq = (rq) => { if (rq.url().includes('uploadImportXML')) started = true; };
    page.on('request', onReq);
    const up = page.waitForResponse((r) => r.url().includes('uploadImportXML'), {timeout: 120_000}).catch(() => null);
    const chooser = page.waitForEvent('filechooser', {timeout: 10_000}).catch(() => null);
    await page.locator('#importXmlForm').getByRole('button', {name: 'Upload File'}).click({force: true}).catch(() => {});
    const fc = await chooser;
    if (fc) await fc.setFiles(file);
    else await page.locator('#importXmlForm input[type=file]').first().setInputFiles(file);
    for (let i = 0; i < 10 && !started; i++) await sleep(300);
    const u = started ? await up : null;
    page.off('request', onReq);
    await idle(page).catch(() => {});
    await sleep(800);
    return {picker: fc ? 'file chooser' : 'input', uploadRequest: started ? (u ? u.status() : 'no answer') : 'none sent', box: await boxState(page)};
}

/** Step 4: "Import"; waits for importBounce and for a results tab, recording what the page shows. */
async function pressImport(page) {
    const before = await tabs(page);
    const dialogs = [];
    const onDialog = (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 300)}); };
    page.on('dialog', onDialog);
    const bounce = page.waitForResponse((r) => /importBounce/.test(r.url()), {timeout: 20_000}).catch(() => null);
    await page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}).click();
    const b = await bounce;
    for (let i = 0; i < 10; i++) { await sleep(300); if ((await tabs(page)).length > before.length) break; }
    await idle(page).catch(() => {});
    await sleep(1500);
    page.off('dialog', onDialog);
    return {bounce: b ? {status: b.status(), body: flat(await b.text().catch(() => null), 200)} : 'no request', tabsBefore: before, tabsAfter: await tabs(page), dialogs, box: await boxState(page)};
}

/** "Import" with a file up: waits (up to `ms`) for the results tab to say how the import ended. */
async function importAndWait(page, ms = 300_000) {
    const before = (await tabs(page)).length;
    await page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}).click();
    let text = null;
    for (let t = 0; t < ms; t += 1000) {
        await sleep(1000);
        if ((await tabs(page)).length > before) {
            text = await panelText(page);
            if (text && /completed successfully|process failed|Errors occured/i.test(text)) break;
        }
    }
    await idle(page).catch(() => {});
    return {tabs: await tabs(page), results: flat(text, 400)};
}

/** Control: the export tab, "Select All", the export button, "Download Exported File"; returns the file and its size. */
async function exportAll(app, page, name) {
    const L = LABELS[app.name];
    await page.getByRole('tab', {name: L.exportTab, exact: true}).first().click();
    await idle(page).catch(() => {});
    const tab = page.locator('#exportSubmissions-tab');
    await tab.locator('.listPanel__item').first().waitFor({timeout: T});
    await idle(page).catch(() => {});
    await tab.getByRole('button', {name: 'Select All', exact: true}).click();
    const ticked = await tab.locator('.listPanel__item input[type=checkbox]:checked').count();
    const before = (await tabs(page)).length;
    await tab.getByRole('button', {name: L.exportBtn, exact: true}).click();
    const panel = page.locator('#importExportTabs [role="tabpanel"]:visible').first();
    const dl = panel.getByRole('button', {name: 'Download Exported File'});
    for (let i = 0; i < 240; i++) { await sleep(500); if ((await tabs(page)).length > before && await dl.isVisible().catch(() => false)) break; }
    const dlP = page.waitForEvent('download', {timeout: 60_000});
    await dl.click();
    const d = await dlP;
    const file = outFile(`${name}.xml`);
    fs.copyFileSync(await d.path(), file);
    return {ticked, file, bytes: fs.statSync(file).size};
}

/** A file of `bytes` zero bytes (what `truncate -s` makes), written where the run keeps its files. */
function zeroFile(name, bytes) {
    const file = outFile(name);
    const fd = fs.openSync(file, 'w');
    if (bytes > 0) fs.ftruncateSync(fd, bytes);
    fs.closeSync(fd);
    return file;
}

module.exports = {T, sleep, flat, rel, LABELS, snap, watch, scriptErrors, tabs, panelText, openNativeFromTools, boxState, chooseFile, pressImport, importAndWait, exportAll, zeroFile};
