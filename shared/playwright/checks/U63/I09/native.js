// U63 I09, row L11: the Native XML import of a file holding 100 imported copies (OMP; OJS and OPS as controls),
// on PKP's default test dataset (a dataset fleet of this agent's own), as the dataset's manager `rvaca`.
//   base    the dataset's own submissions, exported once ("Select All", the export button, "Download Exported File")
//   size    the "Upload File" box and a file's size: plain files under PHP's upload_max_filesize, between it and
//           post_max_size, and over post_max_size (Rule 8's "The box takes any file")
//   grow    "Import" of the base file, each time from a freshly opened tool page, until the export list holds 100
//   ten     ten lines ticked, exported, imported (the control)
//   hundred "Select All" on the list's page (100 lines), exported, imported: the row
// The tool-page helpers follow the kept issue walks' (checks/issues/export-list-selection-stops-at-page), written
// here again because an issue walk's lib.js goes with its report.
const fs = require('fs');
const path = require('path');
const {signIn, signOut, idle, note, loc, outFile} = require('../../../probe');
const {sleep, flat, rel, toolTabs, panelText} = require('./lib');

const NATIVE = '/management/importexport/plugin/NativeImportExportPlugin';
const LABELS = {
    ojs: {exportTab: 'Export Articles', exportBtn: 'Export Articles', results: 'Import Results', table: 'journals', id: 'journal_id'},
    omp: {exportTab: 'Export', exportBtn: 'Export Submissions', results: 'Results', table: 'presses', id: 'press_id'},
    ops: {exportTab: 'Export Preprints', exportBtn: 'Export Preprints', results: 'Import Results', table: 'servers', id: 'server_id'},
};
const listTab = (page) => page.locator('#exportSubmissions-tab');

function helpers(c) {
    const {page, app} = c;
    const L = LABELS[app.name];
    const ctx = app.contextPath;
    const contextId = () => c.q(`select ${L.id} from ${L.table} where path='${ctx}'`)[0];
    /** Submissions of the context in the database: all, and by status (1 queued, 3 published, 4 declined, 5 scheduled). */
    const counts = () => ({total: Number(c.q(`select count(*) from submissions where context_id=${contextId()}`)[0]), byStatus: c.q(`select status || ':' || count(*) from submissions where context_id=${contextId()} group by status order by status`).join(' ')});
    async function openNative() {
        await page.goto(c.cu(ctx, `/en${NATIVE}`));
        await page.locator('#importExportTabs').waitFor({timeout: 30_000});
        await idle(page).catch(() => {});
    }
    async function openExportTab() {
        await page.getByRole('tab', {name: L.exportTab, exact: true}).first().click();
        await idle(page).catch(() => {});
        await listTab(page).locator('.listPanel__item, .listPanel__empty').first().waitFor({timeout: 20_000}).catch(() => {});
        await idle(page).catch(() => {});
    }
    /** What the export list shows: lines, ticked lines, page links, the select button's label. */
    const listState = () => listTab(page).evaluate((el) => {
        const boxes = [...el.querySelectorAll('.listPanel__item input[type=checkbox]')];
        const btn = [...el.querySelectorAll('button')].find((b) => /^Select (All|None)$/.test(b.innerText.trim()));
        const pag = el.querySelector('.pkpPagination');
        const head = el.querySelector('.pkpHeader, .listPanel__header');
        return {lines: boxes.length, ticked: boxes.filter((b) => b.checked).length, button: btn ? btn.innerText.trim() : null,
            pagination: pag ? pag.innerText.replace(/\s+/g, ' ').trim() : null, header: head ? head.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) : null};
    });
    async function pressSelect() {
        await listTab(page).getByRole('button', {name: /^Select (All|None)$/}).click();
        await sleep(300);
        return listState();
    }
    async function tickFirst(n) {
        const boxes = listTab(page).locator('.listPanel__item input[type=checkbox]');
        for (let i = 0; i < n; i++) await boxes.nth(i).check();
        return listState();
    }
    const fileItems = (xml) => [...xml.matchAll(/<(article|monograph|preprint)\b[^>]*>\s*<id type="internal"[^>]*>(\d+)<\/id>/g)].length;
    /** Press the export button, then "Download Exported File"; keeps the file under `name` and says what it holds. */
    async function exportAndDownload(name) {
        const before = (await toolTabs(page)).length;
        const from = c.slog.mark();
        const t0 = Date.now();
        await listTab(page).getByRole('button', {name: L.exportBtn, exact: true}).click();
        const panel = page.locator('#importExportTabs > [role="tabpanel"]:visible').first();
        const button = panel.getByRole('button', {name: 'Download Exported File'});
        for (let i = 0; i < 700; i++) {
            await sleep(500);
            if ((await toolTabs(page)).length > before && await button.isVisible().catch(() => false)) break;
        }
        const o = {exportMs: Date.now() - t0, tabs: await toolTabs(page), panel: await panelText(page, 300)};
        if (!(await button.isVisible().catch(() => false))) return {...o, noButton: true, log: c.logSince(from)};
        const dlP = page.waitForEvent('download', {timeout: 120_000});
        await button.click();
        const d = await dlP;
        const file = outFile(`${name}.xml`);
        fs.copyFileSync(await d.path(), file);
        const xml = fs.readFileSync(file, 'utf8');
        return {...o, file, downloadName: d.suggestedFilename(), bytes: fs.statSync(file).size, items: fileItems(xml), log: c.logSince(from)};
    }
    /**
     * From a freshly opened tool page: the file into the "Upload File" box, then "Import". Records the upload's answer
     * as the page got it, what the box shows, the tabs, the results text, the requests, notices, dialogs, the server
     * log and the database's count before and after. `snapName` keeps the two screens; without it only the facts.
     */
    async function importRecorded(file, snapName, {wait = 420_000} = {}) {
        await openNative();
        const o = {file: path.basename(file), bytes: fs.statSync(file).size, countBefore: counts().total};
        const from = c.slog.mark();
        const dialogsBefore = c.dialogs.length;
        const seen = [];
        const t0 = Date.now();
        const onResp = async (r) => {
            const m = r.url().match(/NativeImportExportPlugin\/(uploadImportXML|importBounce|import)\b/);
            if (!m) return;
            const e = {op: m[1], method: r.request().method(), status: r.status(), atMs: Date.now() - t0};
            if (m[1] !== 'import') e.body = flat(await r.text().catch(() => null), 400).replace(/csrfToken=[A-Za-z0-9]+/, 'csrfToken=…');
            else e.bodyBytes = Number(r.headers()['content-length'] || 0) || undefined;
            seen.push(e);
        };
        const onFail = (rq) => { if (/NativeImportExportPlugin/.test(rq.url())) seen.push({failed: rel(rq.url()).replace(/\?.*/, ''), why: rq.failure() && rq.failure().errorText, atMs: Date.now() - t0}); };
        page.on('response', onResp); page.on('requestfailed', onFail);
        try {
            // The box refuses a file over the size limit itself ("File size error."), sending nothing: wait for the
            // upload's answer only when its request started.
            let started = false;
            const onReq = (rq) => { if (rq.url().includes('uploadImportXML')) started = true; };
            page.on('request', onReq);
            const up = page.waitForResponse((r) => r.url().includes('uploadImportXML'), {timeout: 180_000}).catch(() => null);
            await page.locator('#importXmlForm input[type=file]').first().setInputFiles(file);
            for (let i = 0; i < 20 && !started; i++) await sleep(500);
            const u = started ? await up : null;
            page.off('request', onReq);
            await idle(page).catch(() => {});
            await sleep(1000);
            o.upload = u ? u.status() : started ? 'no answer in 180 s' : 'no upload request sent';
            o.box = flat(await page.locator('#importXmlForm').innerText().catch(() => null), 300);
            o.fileIdSet = !!(await page.locator('#importXmlForm #temporaryFileId').inputValue().catch(() => ''));
            if (snapName) { const s = await c.snap(`${snapName}-uploaded`); o.noticesAfterUpload = s.notices; o.snapUploaded = s.label; }
            const tabsBefore = (await toolTabs(page)).length;
            const bounceP = page.waitForResponse((r) => /importBounce/.test(r.url()), {timeout: 60_000}).catch(() => null);
            const importP = page.waitForResponse((r) => /NativeImportExportPlugin\/import\?/.test(r.url()), {timeout: wait}).catch(() => null);
            const t1 = Date.now();
            await page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}).click();
            const b = await bounceP;
            o.bounce = b ? b.status() : 'no request';
            for (let i = 0; i < 10 && (await toolTabs(page)).length === tabsBefore; i++) await sleep(300);
            o.tabAdded = (await toolTabs(page)).length > tabsBefore;
            if (o.tabAdded) {
                const r = await importP;
                o.importAnswer = r ? r.status() : `no answer in ${wait / 1000} s`;
                o.importMs = Date.now() - t1;
            }
            await idle(page).catch(() => {});
            await sleep(1500);
            o.tabs = await toolTabs(page);
            const text = (await panelText(page, 400_000)) || '';
            o.resultsHead = text.slice(0, 260);
            o.resultsTail = text.length > 500 ? text.slice(-240) : undefined;
            o.resultsLength = text.length;
            o.importedLines = [...text.matchAll(/"(\d+)"\s*-\s*"/g)].length;
            o.says = {success: /The import completed successfully/.test(text), failed: /The process failed/.test(text), errors: /Errors occured:/.test(text), warnings: /Warnings encountered:/.test(text), validation: /Validation errors:/.test(text)};
            if (snapName) { const s = await c.snap(`${snapName}-results`); o.noticesAfterImport = s.notices; o.snapResults = s.label; }
        } finally {
            page.off('response', onResp); page.off('requestfailed', onFail);
        }
        o.requests = seen;
        o.dialogs = c.dialogs.slice(dialogsBefore);
        o.log = c.logSince(from);
        o.countAfter = counts().total;
        o.added = o.countAfter - o.countBefore;
        return o;
    }
    /** The Dashboard's "Active submissions" view, recorded; the count its heading or pager shows. */
    async function dashboard(label) {
        await page.goto(c.cu(ctx, '/en/dashboard/editorial?currentViewId=active'));
        await idle(page).catch(() => {});
        await page.locator('main table tbody tr').first().waitFor({timeout: 20_000}).catch(() => {});
        await sleep(800);
        const s = await c.snap(label);
        const main = (s.text && s.text.main) || '';
        return {snap: s.label, heading: flat((main.match(/Active submissions[^\n]*/) || [])[0], 80), pager: flat((main.match(/Showing[^\n]*|\d+\s*(-|to)\s*\d+ of \d+[^\n]*/i) || [])[0], 80), db: counts()};
    }
    return {L, counts, openNative, openExportTab, listState, pressSelect, tickFirst, exportAndDownload, importRecorded, dashboard};
}

/** A plain text file of about `mb` megabytes (not XML: the box is said to take any file). */
function plainFile(name, mb) {
    const file = outFile(name);
    const line = 'u63i09 plain text, not XML: the quick brown fox jumps over the lazy dog 0123456789\n';
    const fd = fs.openSync(file, 'w');
    const chunk = line.repeat(Math.ceil(65536 / line.length));
    for (let written = 0; written < mb * 1024 * 1024; written += chunk.length) fs.writeSync(fd, chunk);
    fs.closeSync(fd);
    return file;
}

async function rowL11(c, on) {
    const {page, fact, snap, app, S, save} = c;
    const h = helpers(c);
    if (!app.dataset) throw new Error('row L11 drives a dataset fleet: run with PKP_E2E_DATASET=<n> (the fleet of .reports/issues-c1/fleet.json)');
    const o = {fleet: `dataset fleet ${app.dataset}`, baseURL: app.baseURL};
    o.phpLimits = c.cli(['-d', 'max_execution_time=120', '-r', 'echo "upload_max_filesize=", ini_get("upload_max_filesize"), " post_max_size=", ini_get("post_max_size"), " memory_limit=", ini_get("memory_limit"), " max_execution_time=", ini_get("max_execution_time"), " (the fleet\'s php -S runs the same php.ini with -d max_execution_time=120)";']);
    await signIn(page, 'rvaca', {contextPath: app.contextPath});
    try {
        o.start = await h.dashboard('n-00-dashboard-start');
        await h.openNative();
        o.importTab = {tabs: await (require('./lib').toolTabs)(page), snap: (await snap('n-01-import-tab')).label};
        await loc(page, 'Native XML "Import": the file input behind "Upload File"', page.locator('#importXmlForm input[type=file]'));
        await loc(page, 'Native XML "Import": the "Import" button', page.locator('#importXmlForm').getByRole('button', {name: 'Import', exact: true}));

        // ---- base: the dataset's own submissions in one file
        if (!S.base || !fs.existsSync(S.base.file)) {
            await h.openExportTab();
            const list = await h.listState();
            const sel = await h.pressSelect();
            const s = await snap('n-02-export-list-all-ticked');
            const ex = await h.exportAndDownload('base');
            S.base = {file: ex.file, bytes: ex.bytes, items: ex.items};
            save();
            o.base = {list, selectAll: sel, snap: s.label, ...ex, snapResults: (await snap('n-03-export-results')).label};
            await loc(page, 'Native XML export results: "Download Exported File"', page.locator('#importExportTabs > [role="tabpanel"]:visible').first().getByRole('button', {name: 'Download Exported File'}));
        }
        fact(`L11-base-${app.name}`, o);

        // ---- size: the box and the file's size (plain files; nothing is imported from them)
        if (on('size')) {
            const sz = {};
            for (const [key, mb] of [['under-1mb', 1], ['between-3mb', 3], ['over-9mb', 9]]) {
                const file = plainFile(`plain-${key}.txt`, mb);
                sz[key] = await h.importRecorded(file, `n-10-size-${key}`, {wait: 120_000});
                fs.unlinkSync(file);
            }
            fact(`L11-size-${app.name}`, sz);
        }

        // ---- grow: the base file imported until the export list holds 100
        if (on('grow')) {
            const g = [];
            for (let i = 1; i <= 14 && h.counts().total < 100; i++) {
                const r = await h.importRecorded(S.base.file, i === 1 ? 'n-20-grow-first' : null);
                g.push({n: i, upload: r.upload, importAnswer: r.importAnswer, importMs: r.importMs, importedLines: r.importedLines, says: r.says, added: r.added, countAfter: r.countAfter, log: r.log.slice(0, 4), dialogs: r.dialogs});
                c.log('grow', i, r.countAfter);
            }
            fact(`L11-grow-${app.name}`, {imports: g, after: h.counts()});
        }

        // ---- ten: the control
        if (on('ten')) {
            await h.openNative();
            await h.openExportTab();
            const t = {list: await h.listState()};
            t.ticked = await h.tickFirst(10);
            t.export = await h.exportAndDownload('ten');
            t.import = await h.importRecorded(t.export.file, 'n-30-ten');
            fact(`L11-ten-${app.name}`, t);
        }

        // ---- hundred: the row
        if (on('hundred')) {
            await h.openNative();
            await h.openExportTab();
            const hd = {list: await h.listState()};
            hd.selectAll = await h.pressSelect();
            hd.snapList = (await snap('n-40-export-list-page-ticked')).label;
            hd.export = await h.exportAndDownload('hundred');
            hd.snapExport = (await snap('n-41-export-hundred-results')).label;
            S.hundred = {file: hd.export.file, bytes: hd.export.bytes, items: hd.export.items}; save();
            hd.dashboardBefore = await h.dashboard('n-42-dashboard-before-hundred');
            if (hd.export.file) hd.import = await h.importRecorded(hd.export.file, 'n-43-hundred');
            hd.dashboardAfter = await h.dashboard('n-44-dashboard-after-hundred');
            fact(`L11-hundred-${app.name}`, hd);
        }
        fact(`L11-end-${app.name}`, {counts: h.counts()});
    } finally {
        await signOut(page).catch(() => {});
    }
}

module.exports = {rowL11, helpers, plainFile, LABELS};
