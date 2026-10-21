// Issue report docs/issues/U63-A25-import-over-upload-limit-file-size-error.md (U63 A25): the report's
// Steps to reproduce, walked through the screens on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"), as the dataset's manager `rvaca`, on `publicknowledge`. All three apps.
//
// Precondition: a 3 MB file named .xml (`truncate -s 3M h21e-3mb.xml`), over PHP's default
// upload_max_filesize of 2M, which the install keeps.
//   1. sign in as rvaca
//   2. side menu "Tools", "Import/Export", "Native XML Plugin"
//   3. "Import": "Upload File", the 3 MB file chosen
//   4. "Import"
//   control: a fresh tool page; the export tab, "Select All", the export button, "Download Exported
//            File"; that file chosen in the same box
// Mode `nb` (the fix's neighbour, alone): on a fresh tool page each, an empty file (0 bytes) and a
// 1 MB file chosen in the box; a fix of the size message must leave both as they are.
// Mode `real` (run on OMP): a real export over the limit. The press's export of all its books is
// imported once ("Import"), then the export of all books (now twice as many) is chosen in the box.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21e --dataset 5 --reset
// Run (main):   PROBE_FEATURE=issues-h21e PROBE_AGENT=h21e node bin/probe.js all shared/playwright/checks/issues/import-over-upload-limit-file-size-error/walk.js [nb | real]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21e-3_5 --dataset 5 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21e-3_5 PROBE_AGENT=h21e node bin/probe.js all shared/playwright/checks/issues/import-over-upload-limit-file-size-error/walk.js
// Facts: .reports/<feature>/h21e/a25-<mode>[-<run>]-<app>.json
const fs = require('fs');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, record, sql} = require('../../../probe');
const L = require('./lib');

const MODE = ['nb', 'real'].includes(process.argv[2]) ? process.argv[2] : 'walk';
const MB = 1024 * 1024;

forEachApp(async (app) => {
    const f = {app: app.name, line: app.line || 'main', mode: MODE, dataset: app.dataset};
    try {
        f.php = execFileSync('php', ['-r', 'echo "upload_max_filesize=", ini_get("upload_max_filesize"), " post_max_size=", ini_get("post_max_size");'], {encoding: 'utf8'});
    } catch (e) { f.php = L.flat(e.message, 200); }
    const ctxTable = {ojs: ['journals', 'journal_id'], omp: ['presses', 'press_id'], ops: ['servers', 'server_id']}[app.name];
    const count = () => {
        try { return Number(sql(app, `select count(*) from submissions where context_id=(select ${ctxTable[1]} from ${ctxTable[0]} where path='${app.contextPath}')`).trim()); } catch (e) { return `sql error: ${L.flat(e.message, 120)}`; }
    };
    const {page, close} = await launch(app);
    page.setDefaultTimeout(L.T);
    const errs = L.scriptErrors(page);
    const w = L.watch(page);
    try {
        // 1
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        f.submissionsBefore = count();
        if (MODE === 'walk') {
            const big = L.zeroFile('h21e-3mb.xml', 3 * MB);
            // 2
            f.step2 = await L.openNativeFromTools(app, page);
            f.step2.box = await L.boxState(page);
            await L.snap(page, 'a25-step2-import-tab');
            // 3
            f.step3 = await L.chooseFile(page, big);
            f.step3.bytes = fs.statSync(big).size;
            f.step3.localeKeyOnPage = await page.evaluate(() => (window.pkp && pkp.localeKeys && pkp.localeKeys['form.dropzone.dictFileTooBig']) || null).catch(() => null);
            await L.snap(page, 'a25-step3-file-chosen');
            // 4
            f.step4 = await L.pressImport(page);
            f.step4.panel = await L.panelText(page);
            await L.snap(page, 'a25-step4-import-pressed');
            f.submissionsAfter = count();
            // control
            f.control = {open: await L.openNativeFromTools(app, page)};
            f.control.export = await L.exportAll(app, page, 'h21e-own-export');
            f.control.open2 = await L.openNativeFromTools(app, page);
            f.control.choose = await L.chooseFile(page, f.control.export.file);
            await L.snap(page, 'a25-control-own-export-chosen');
        } else if (MODE === 'real') {
            f.real = {open: await L.openNativeFromTools(app, page)};
            f.real.first = await L.exportAll(app, page, 'h21e-real-first');
            await L.openNativeFromTools(app, page);
            f.real.firstChosen = await L.chooseFile(page, f.real.first.file);
            f.real.firstImport = await L.importAndWait(page);
            f.submissionsAfterImport = count();
            await L.openNativeFromTools(app, page);
            f.real.second = await L.exportAll(app, page, 'h21e-real-second');
            await L.openNativeFromTools(app, page);
            f.real.secondChosen = await L.chooseFile(page, f.real.second.file);
            await L.snap(page, 'a25-real-second-chosen');
        } else {
            f.nb = {};
            for (const [key, bytes] of [['empty', 0], ['one-mb', 1 * MB]]) {
                const file = L.zeroFile(`h21e-${key}.xml`, bytes);
                await L.openNativeFromTools(app, page);
                f.nb[key] = {bytes, ...(await L.chooseFile(page, file))};
                await L.snap(page, `a25-nb-${key}`);
            }
        }
    } catch (e) {
        f.error = L.flat(e.stack, 900);
        await L.snap(page, `a25-${MODE}-error`).catch(() => {});
    } finally {
        w.stop();
        f.requests = w.seen;
        f.serverErrors = w.seen.filter((x) => x.status >= 500);
        f.scriptErrors = errs;
        record(`a25-${MODE}`, f);
        console.log(`[a25 ${MODE}] ${app.name}`, JSON.stringify(f, null, 1).slice(0, 5000));
        await signOut(page).catch(() => {});
        await close();
    }
});
