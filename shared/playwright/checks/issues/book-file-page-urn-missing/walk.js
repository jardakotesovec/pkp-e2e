// Issue report docs/issues/U20-OMP7-book-file-page-urn-missing.md (spec U20, register OMP7): a book file's
// view page (catalog/view/…) never carries "DC.Identifier.URN" for the URN assigned to the file.
// Takes the report's Steps on PKP's default test dataset (OMP book 14), through the screens:
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
//   PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/issues/book-file-page-urn-missing/walk.js
//   (3.5: PKP_E2E_LINE=stable-3_5_0 in front of both, PROBE_RUN=r35.)
// MODE=nb (the fix trial's neighbour, on a fresh reset): the URN plugin set up, chapter 1's URN assigned,
//   no file given one; the book page, chapter 1's page and every file view page read.
// OJS and OPS have no file view page (catalog/view answers 404 there): the script runs on OMP only.
// No assertions: the script records, the report judges.
const {forEachApp, launch, signIn, signOut, record, idle, serverLog, sql} = require('../../../probe');
const L = require('./lib');

const MODE = process.env.MODE || 'steps';
const RUN = process.env.PROBE_RUN || 'main';
const SID = 14;
const CHAPTER = 'Chapter 1: Mind Control—Internal or External?';
const FORMAT = 'PDF';
const BOOK_FILE = 'The Canadian Nutrient File: Nutrient Val.pdf';
const CHAPTER_FILE = 'chapter1.pdf';

forEachApp(async (app) => {
    const log = (...a) => console.log(`[h21p ${app.name} ${app.line || 'main'} ${RUN} ${MODE}]`, ...a);
    if (app.name !== 'omp') { log('skipped: a press surface'); return; }
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    const fact = (k, v) => { record('h21p-facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 2500)); };
    const slog = serverLog(app);
    const from = slog.mark();

    // Evidence only, not steps: the ids the reads name.
    const pub = Number(sql(app, `select current_publication_id from submissions where submission_id = ${SID}`));
    const files = sql(app, `select sf.submission_file_id, (select setting_value from submission_file_settings x where x.submission_file_id = sf.submission_file_id and setting_name = 'name' and locale = 'en'), coalesce((select setting_value from submission_file_settings x where x.submission_file_id = sf.submission_file_id and setting_name = 'chapterId'), '-') from submission_files sf where sf.submission_id = ${SID} and sf.assoc_type = 521 order by 1`).split('\n').map((l) => l.split('|'));
    const fileId = (name) => (files.find((f) => f[1] === name) || [])[0];
    fact('ids', {pub, files});

    const {page, close} = await launch(app);
    const bad = [], pageErrors = [];
    page.on('response', (r) => { if (r.status() >= 500) bad.push({status: r.status(), m: r.request().method(), url: L.strip(r.url()).slice(0, 200)}); });
    page.on('pageerror', (e) => pageErrors.push({text: L.flat(e.message, 200), url: L.strip(page.url())}));
    try {
        // ---------------------------------------------------------------- steps 1-6 (MODE=nb: 1-4)
        await signIn(page, 'dbarnes', {contextPath: app.contextPath});
        await idle(page);
        const setup = {};
        try {
            setup.urn = await L.setUpUrn(page, app, ['Monographs', 'Chapters', 'Files']);
        } catch (e) {
            setup.urnError = L.flat(e.message, 400);
            await L.snap(page, 'urn-settings-failed', {png: true});
        }
        await L.snap(page, 'step3-urn-settings-saved');
        setup.chapter = await L.assignUrn(page, await L.openChapterTab(page, app, SID, pub, CHAPTER), 'step4-chapter');
        if (MODE !== 'nb') {
            let formats = await L.openFormats(page, app, SID, pub);
            setup.chapterFile = await L.assignUrn(page, await L.openFileTab(page, formats, FORMAT, CHAPTER_FILE), 'step5-chapter-file');
            formats = await L.openFormats(page, app, SID, pub);
            setup.bookFile = await L.assignUrn(page, await L.openFileTab(page, formats, FORMAT, BOOK_FILE), 'step6-book-file');
            // the tabs as they read after the save (what URN each file now holds)
            formats = await L.openFormats(page, app, SID, pub);
            let win = await L.openFileTab(page, formats, FORMAT, CHAPTER_FILE);
            setup.chapterFileAfter = L.flat(await win.urnArea().innerText().catch(() => ''), 300);
            await L.snap(page, 'step5-chapter-file-tab-after', {png: true});
            await L.closeWindow(page, win).catch(() => {});
            formats = await L.openFormats(page, app, SID, pub);
            win = await L.openFileTab(page, formats, FORMAT, BOOK_FILE);
            setup.bookFileAfter = L.flat(await win.urnArea().innerText().catch(() => ''), 300);
            await L.snap(page, 'step6-book-file-tab-after');
            await L.closeWindow(page, win).catch(() => {});
        }
        setup.stored = sql(app, `select 'file', submission_file_id, setting_value from submission_file_settings where setting_name = 'pub-id::other::urn' and submission_file_id in (select submission_file_id from submission_files where submission_id = ${SID}) union all select 'chapter', chapter_id, setting_value from submission_chapter_settings where setting_name = 'pub-id::other::urn' and chapter_id in (select chapter_id from submission_chapters where publication_id = ${pub}) union all select 'publication', publication_id, setting_value from publication_settings where setting_name = 'pub-id::other::urn' and publication_id = ${pub}`).split('\n');
        fact('setup', setup);

        // ---------------------------------------------------------------- steps 7-9, signed out
        await signOut(page).catch(() => {});
        const bookUrl = app.url(`/index.php/${app.contextPath}/catalog/book/${SID}`);
        const R = {};
        const openBook = async () => { const r = await page.goto(bookUrl); await idle(page).catch(() => {}); return r; };
        let r = await openBook();
        const bookHtml = r ? await r.text().catch(() => '') : '';
        R.book = {status: r ? r.status() : null, ids: L.idTags(L.headTags(bookHtml)), links: await L.catalogLinks(page)};
        await L.snap(page, 'step7-book-page', {png: true});
        const chapterLink = R.book.links.find((l) => l.text.includes('Mind Control') && /\/chapter\//.test(l.href));
        // step 7: chapter 1's page
        R.chapter = await L.clickAndRead(page, chapterLink ? chapterLink.href : '/chapter/none', 'step7-chapter-page');
        const chapterPageUrl = page.url();
        R.chapter.links = await L.catalogLinks(page);
        // step 8: the whole-book file's view page, from the book page
        await openBook();
        R.bookFileView = await L.clickAndRead(page, `/${fileId(BOOK_FILE)}`, 'step8-book-file-view', {png: true});
        // step 9: chapter 1's file's view page, from chapter 1's page
        await page.goto(chapterPageUrl); await idle(page).catch(() => {});
        R.chapterFileView = await L.clickAndRead(page, `/${fileId(CHAPTER_FILE)}`, 'step9-chapter-file-view', {png: true});
        if (MODE === 'nb') {
            // every other file's view page linked from the book page
            R.others = [];
            for (const f of files) {
                if (f[1] === CHAPTER_FILE || f[1] === BOOK_FILE) continue;
                await openBook();
                const o = await L.clickAndRead(page, `/${f[0]}`, `nb-view-${f[0]}`);
                R.others.push({file: f[1], chapterId: f[2], status: o.status, linkText: o.linkText, ids: o.ids, urnTag: o.urnTag});
            }
        }
        fact('read', R);
    } finally {
        fact('crashes', {server5xx: bad, script: pageErrors, serverLog: slog.since(from).map((l) => L.flat(l, 300)).slice(0, 20)});
        await close();
    }
});
