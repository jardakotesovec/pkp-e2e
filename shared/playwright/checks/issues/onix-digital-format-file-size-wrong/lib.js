// Helpers for the U74 A22 walk {OMP}: the press's "Publisher Identity" (the ONIX tool's four
// details), a digital format added to a book with files uploaded and approved, and the ONIX 3.0
// tool's export of one book read per product (each Extent). Requiring this file runs nothing; the
// suite page objects are required inside the calls (they read PKP_APP_ROOT, which forEachApp
// sets). Adapted from the U74 claim check H13D (shared/playwright/checks/U74/H13D/h13d.js) and
// the U74 A9/A17 walks' identity helper, copied so this folder stands alone.
const fs = require('fs');
const path = require('path');
const {idle, screen, shot, record, sql, outFile} = require('../../../probe');

const ROOT = path.resolve(__dirname, '../../../../..');
const shared = (file) => require(path.join(ROOT, 'shared/playwright/pages', file));

const BOOK = {id: 4, publicationId: 4, title: 'How Canadians Communicate: Contexts of Canadian Popular Culture'};
const IDENTITY = {publisher: 'Public Knowledge Press', location: 'Vancouver', codeType: 'Proprietary (01)', codeValue: 'PKP-01'};
const MB = 1024 * 1024;

const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run one step: its result, or `{error}` with a screenshot, so a walk goes on through the state a fix brings. */
async function step(page, name, fn) {
    try {
        const out = await fn();
        return out === undefined ? {ok: true} : out;
    } catch (e) {
        const error = flat(e && e.message);
        console.log(`[step ${name}] ${error}`);
        await shot(page, `a22-error-${name}`).catch(() => {});
        record(`a22-error-${name}`, {error, screen: await screen(page).catch(() => null)});
        return {error};
    }
}

/** Settings › Press › "Masthead": the four "Publisher Identity" details, "Save"; whether "Saved" showed. */
async function fillPublisherIdentity(app, page, d = IDENTITY) {
    await page.goto(app.url(`/index.php/${app.contextPath}/en/management/settings/context`));
    await idle(page).catch(() => {});
    await page.getByRole('tab', {name: 'Masthead'}).first().click().catch(() => {});
    await page.locator('[name="publisher"]').first().waitFor({timeout: 20_000});
    await idle(page).catch(() => {});
    const f = page.locator('form').filter({has: page.locator('[name=publisher]')}).first();
    await f.locator('[name="publisher"]').first().fill(d.publisher);
    await f.locator('[name="location"]').first().fill(d.location);
    await f.locator('select[name="codeType"]').first().selectOption({label: d.codeType});
    await f.locator('[name="codeValue"]').first().fill(d.codeValue);
    await f.getByRole('button', {name: 'Save', exact: true}).first().click();
    return page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15_000}).then(() => true).catch(() => false);
}

/** Submission 4's "Publication Formats" page (3.5 keys it without the version). */
async function openFormats(app, page) {
    const {PublicationFormatsPage} = require(`${app.suiteDir}/pages/PublicationFormatPages.js`);
    const pf = new PublicationFormatsPage(page, app.contextPath);
    if (app.line === 'stable-3_5_0') {
        await pf.frame.gotoEditorial(BOOK.id, {menuKey: 'publication_publicationFormats'});
        await pf.expectLoaded();
    } else {
        await pf.gotoEditorial(BOOK.id, BOOK.publicationId);
    }
    await idle(page).catch(() => {});
    return pf;
}

/** "Add publication format": the name, "Physical format" as it opens (unticked), "OK"; the rows after. */
async function addFormat(app, page, name) {
    const pf = await openFormats(app, page);
    const add = await pf.openAdd();
    await add.typeName(name);
    const out = {physical: await add.physicalBox().isChecked().catch(() => null), remote: await add.remoteBox().isChecked().catch(() => null)};
    await add.ok();
    await pf.formatRow(name).waitFor({state: 'visible', timeout: 30_000});
    out.rows = await pf.grid().locator('tr.gridRow').evaluateAll((rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ').trim().slice(0, 160)));
    return out;
}

/** A PDF-headed file of `bytes` bytes in the run folder (the "user's computer"). */
function makeFile(name, bytes) {
    const file = outFile(name);
    const head = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%');
    const tail = Buffer.from('\n%%EOF');
    fs.writeFileSync(file, Buffer.concat([head, Buffer.alloc(bytes - head.length - tail.length, 0x20), tail]));
    return file;
}

/** The format's "Change File" with `file` ("Book Manuscript"), then under it "Awaiting Approval" › "Approve Proof" › "OK". */
async function uploadAndApprove(app, page, format, file) {
    const fileName = path.basename(file);
    const pf = await openFormats(app, page);
    await pf.uploadWithChangeFile(format, file);
    const row = pf.fileRow(format, fileName);
    const before = (await row.locator('a').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    await (await pf.openStatus(row, 'Awaiting Approval', 'Approve Proof')).ok();
    await pause(1000);
    await idle(page).catch(() => {});
    const after = (await pf.fileRow(format, fileName).locator('a').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
    return {bytes: fs.statSync(file).size, before, after};
}

/**
 * Tools › "ONIX 3.0 Monograph Export Plugin" › "Export": tick the book, "Export Submissions",
 * "Download Exported File". The results text, the file kept under `name`, and per product its
 * title, format name and Extent elements.
 */
async function exportOnix(app, page, name, titles = [BOOK.title]) {
    const {OnixToolPage} = require(`${app.suiteDir}/pages/OnixPages.js`);
    const {downloadFrom} = shared('ImportExportPages.js');
    const onix = new OnixToolPage(page, app.contextPath);
    await onix.open();
    await idle(page);
    const tabs = await onix.anyTab().allInnerTexts().catch(() => []);
    if (!tabs.length) return {tabs, page: await screen(page)};
    await onix.list.expectLoaded();
    const validation = await onix.validationBox().isChecked().catch(() => null);
    for (const t of titles) for (const box of await onix.list.box(t).all()) await box.check();
    const results = await onix.list.pressExport(onix);
    await pause(1000);
    record(`a22-results-${name}`, await screen(page));
    const out = {tabs, validation, results: flat(await results.innerText().catch(() => ''), 1500)};
    const button = results.getByRole('button', {name: 'Download Exported File', exact: true});
    if (!(await button.count())) return out;
    const file = await downloadFrom(page, () => button.click());
    out.kept = outFile(`a22-onix-${name}.xml`);
    fs.writeFileSync(out.kept, file.text);
    out.file = file.name;
    out.products = await page.evaluate((xml) => {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const kid = (el, n) => [...el.children].find((k) => k.localName === n);
        return [...doc.getElementsByTagNameNS('*', 'Product')].map((p) => {
            const desc = kid(p, 'DescriptiveDetail');
            const extents = desc ? [...desc.children].filter((k) => k.localName === 'Extent').map((e) => [...e.children].map((k) => `${k.localName}=${k.textContent}`).join(' ')) : [];
            const ids = [...p.getElementsByTagNameNS('*', 'ProductIdentifier')].map((i) => [...i.children].map((k) => k.textContent.trim()).join(':'));
            return {
                record: [...p.getElementsByTagNameNS('*', 'RecordReference')].map((t) => t.textContent.trim())[0],
                productForm: desc && kid(desc, 'ProductForm') ? kid(desc, 'ProductForm').textContent : null,
                productFormDescription: [...p.getElementsByTagNameNS('*', 'ProductFormDescription')].map((t) => t.textContent.trim())[0] || null,
                ids,
                extents,
            };
        });
    }, file.text);
    // The raw Extent lines, for the report's Observed.
    out.extentXml = (file.text.match(/<(?:\w+:)?Extent>[\s\S]*?<\/(?:\w+:)?Extent>/g) || []).map((x) => x.replace(/>\s+</g, '><'));
    return out;
}

/**
 * Tools › "Import/Export" › "Native XML Plugin" › "Export": tick the book, "Export Submissions",
 * "Download Exported File"; the file kept under `name` in the run folder, and its file-size Extents.
 */
async function nativeExport(app, page, name, title = BOOK.title) {
    const {NativeXmlPage} = shared('ImportExportPages.js');
    const native = new NativeXmlPage(page, app.contextPath, {exportTab: 'Export', exportButton: 'Export Submissions', importResults: 'Results'});
    await native.goto();
    await native.openExportTab();
    await native.list.box(title).first().check();
    const panel = await native.list.pressExport(native);
    await panel.getByText(/completed successfully|process failed/).first().waitFor({timeout: 60_000}).catch(() => {});
    const text = (await panel.innerText().catch(() => '')) || '';
    const out = {results: flat(text, 600)};
    if (await native.downloadButton(panel).isVisible().catch(() => false)) {
        const file = await native.download(panel);
        out.kept = outFile(name);
        fs.writeFileSync(out.kept, file.text);
        out.bytes = Buffer.byteLength(file.text);
        out.extents = (file.text.match(/<(?:\w+:)?Extent>[\s\S]*?<\/(?:\w+:)?Extent>/g) || []).map((x) => x.replace(/>\s+</g, '><'));
    }
    return out;
}

/** "Native XML Plugin" › "Import": upload `file`, "Import"; the results text and the new submissions' ids. */
async function nativeImport(app, page, file) {
    const {NativeXmlPage} = shared('ImportExportPages.js');
    const native = new NativeXmlPage(page, app.contextPath, {exportTab: 'Export', exportButton: 'Export Submissions', importResults: 'Results'});
    await native.goto();
    await native.openTab('Import');
    await native.upload(file);
    const panel = await native.pressImport();
    await panel.getByText(/completed successfully|process failed|error/i).first().waitFor({timeout: 60_000}).catch(() => {});
    const text = flat(await panel.innerText().catch(() => ''), 1500);
    const ids = [...(text || '').matchAll(/"(\d+)"\s*-\s*"/g)].map((m) => Number(m[1]));
    return {completed: /completed successfully/.test(text || ''), text, ids};
}

/**
 * A book's "Publication Formats" › a format's arrow › "Edit" › "Metadata" › "Save", as it stands;
 * the save's outcome (a refusal is recorded, never thrown).
 */
async function saveMetadata(app, page, submissionId, format) {
    const {PublicationFormatsPage} = require(`${app.suiteDir}/pages/PublicationFormatPages.js`);
    const pf = new PublicationFormatsPage(page, app.contextPath);
    const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${submissionId}`).trim());
    await pf.gotoEditorial(submissionId, publicationId);
    await idle(page).catch(() => {});
    const win = await pf.openEdit(format);
    const meta = await win.openMetadata();
    const fileSizeBox = await page.locator('input[name="fileSize"]').count();
    const out = {publicationId, fileSizeBox};
    try {
        await meta.save();
        out.saved = true;
    } catch (e) {
        out.saved = false;
        out.error = flat(e && e.message, 400);
        out.errors = await page.locator('label.error:visible, .pkp_form_error:visible').allInnerTexts().catch(() => []);
        await shot(page, `a22-metadata-save-${submissionId}`).catch(() => {});
    }
    return out;
}

/** Submission 4's formats as stored: physical flag, stored file size, remote, proof files and approved ones (Evidence only). */
function storedFormats(app, id = BOOK.id) {
    return sql(app, `select pf.publication_format_id, pf.physical_format, pf.file_size, coalesce(pf.remote_url, '') <> '' as remote,
        (select count(*) from submission_files sf where sf.assoc_type = 521 and sf.assoc_id = pf.publication_format_id and sf.file_stage = 10) as files,
        (select count(*) from submission_files sf where sf.assoc_type = 521 and sf.assoc_id = pf.publication_format_id and sf.file_stage = 10 and sf.viewable = 1) as approved
        from publication_formats pf join publications p using (publication_id) where p.submission_id = ${id} order by 1`);
}

module.exports = {BOOK, IDENTITY, MB, flat, pause, step, fillPublisherIdentity, openFormats, addFormat, makeFile, uploadAndApprove, exportOnix, nativeExport, nativeImport, saveMetadata, storedFormats};
