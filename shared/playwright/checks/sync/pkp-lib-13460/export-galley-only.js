// PR review of pkp/pkp-lib#13460 round 8 (pkp/ojs#5903; the pkp/pkp-lib#13253 commit, lib/pkp `d19b2ed294`, ojs
// `99f5b3dfc8`), no report (ruled by @bozana 2026-10-08: Crossref takes no galley DOI; spec U45 note f-a15): on a Crossref journal,
// "Export DOIs" on a published article whose "Article" DOI was emptied while its galley keeps one now fails on the
// server (500, a PHP TypeError from the Crossref filter's createDOIDataNode() given a null DOI), where round 7
// and the tips refused it with 400 "One or more invalid publication objects were included with the request.".
// getExportableDOIsSubmissionIds() now accepts a work on its galley's DOI (ojs publication\DAO::whereHasDoi()),
// whatever "Items with DOIs" has ticked and whatever the agency takes; Crossref takes no galley DOI. The page shows
// no message either way (U45 A13).
//
// OJS only. Seeds its own scratch journal (DOIs on for articles and galleys, prefix 10.1234, default suffix, no
// agency yet, the Crossref plugin enabled) and three published articles with a PDF galley, each with both DOIs.
// As the manager, on screen:
//   A (the finding): DOIs page, expand, "Edit", empty the "Article" DOI, "Save" (the PDF keeps its DOI);
//   B (control): the same, emptying both boxes (no DOI left);
//   C (control): untouched (article and galley DOI);
//   Settings > Distribution > DOIs > "Registration": "Crossref", depositor name and email, "Save"; "Setup": the
//   kinds read back ("Articles" ticked again should the agency choice have unticked it, U45 A19);
//   DOIs page: tick one work, "Bulk Actions" > "Export DOIs" > "Export DOIs", for B, C, then A: the answer, what
//   the page shows, the server log.
// deposit-lists.php (read-only CLI) gives the works the export accepts (new, and by round 7's condition) and what
// the Crossref export plugin throws when it builds A's XML, which is what a DepositSubmission job for A would run.
// C's export answers 400 "An XML validation error occurred…" on installs that cannot fetch Crossref's schema, as
// the test installs cannot. At round 7 (`ed4299ffcb`) A answers 400 like B, so the line reads PASS.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r8b node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/export-galley-only.js
// Facts: .reports/sync/pr13460r8b/export-galley-only-ojs.json with screenshots
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, shot, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, DoiSettings, recordNotices} = require('../../../pages/DoisPages.js');
const L = require('./lib');

/** The lists "Export DOIs" and the deposit job read (deposit-lists.php, read-only). */
function lists(app, t, ids, flags = []) {
    const root = path.resolve(process.cwd(), app.root);
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(process.cwd(), app.configFile);
    const out = execFileSync('php', [path.join(__dirname, 'deposit-lists.php'), root, t, ...flags, ...ids.map(String)],
        {env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 180000});
    return JSON.parse(out.trim().split('\n').pop());
}
const flat = (s, n = 500) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[export-galley-only] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460x');
    const {mgr, au} = await L.scratchContext(app, t, {enabledDoiTypes: ['publication', 'representation'],
        publisherInstitution: 'Public Knowledge Project', onlineIssn: '1234-5679', plugins: {crossrefplugin: {enabled: true}}});
    const seed = async (k) => L.sid(await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Galley work ${k} ${t}`,
        published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]}));
    const A = await seed('a'), B = await seed('b'), C = await seed('c');
    const out = {tag: t, ids: {A, B, C}, seeded: {A: L.versionRows(app, A), B: L.versionRows(app, B), C: L.versionRows(app, C)}};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const dp = new DoisPage(page, t);
        const empty = async (id, types) => {
            await dp.goto();
            const row = dp.row(id);
            await dp.expand(row, id);
            await dp.startEditing(row);
            for (const type of types) await dp.doiBox(row, type).fill('');
            return dp.saveEditing(row);
        };
        out.emptyA = await empty(A, ['Article']);
        out.emptyB = await empty(B, ['Article', 'PDF']);
        out.afterEdit = {A: L.versionRows(app, A), B: L.versionRows(app, B), C: L.versionRows(app, C)};

        const settings = new DoiSettings(page, t);
        await settings.goto('Registration');
        await settings.chooseAgency('Crossref');
        await settings.field('depositorName').fill('Public Knowledge Project');
        await settings.field('depositorEmail').fill('doi@mail.test');
        out.agencySave = (await settings.pressSave(settings.registration)).status();
        await page.waitForTimeout(1500);
        await settings.goto('Setup');
        out.kindsAfterAgency = await settings.kinds();
        const articles = settings.kindsGroup().getByRole('checkbox').first();
        if (!(await articles.isChecked())) {
            await articles.check();
            out.kindsSave = (await settings.pressSave(settings.setup)).status();
            await page.waitForTimeout(1000);
        }
        out.stored = String(sql(app, `select setting_name||'='||setting_value from journal_settings js join journals j on j.journal_id=js.journal_id
            where j.path='${t}' and setting_name in ('enabledDoiTypes','registrationAgency','doiVersioning') order by 1`)).split('\n');
        out.lists = lists(app, t, [A, B, C], ['--xml']);

        const exportOne = async (key, id) => {
            await dp.goto();
            await dp.tick([id]);
            const dialog = await dp.chooseBulkAction('Export DOIs');
            const answered = page.waitForResponse((r) => /\/api\/v1\/dois\/submissions\/export/.test(r.url()) && r.request().method() !== 'GET', {timeout: 60000});
            const mark = log.mark();
            await dialog.getByRole('button', {name: 'Export DOIs', exact: true}).click();
            const r = await answered;
            const body = flat(await r.text().catch(() => ''), 700);
            await page.waitForTimeout(2500);
            const windows = await page.getByRole('dialog').allInnerTexts().then((a) => a.map((x) => flat(x, 400)));
            const notices = await page.locator('[role="alert"], [role="status"], .pkpNotification, [data-cy="notification"]').allInnerTexts()
                .then((a) => a.map((x) => flat(x, 200)).filter(Boolean)).catch(() => []);
            await shot(page, `export-galley-only-${key}`);
            return {id, status: r.status(), body, windows, notices, serverLog: log.since(mark)};
        };
        out.exportB = await exportOne('B-no-doi', B);
        out.exportC = await exportOne('C-both-dois', C);
        out.exportA = await exportOne('A-galley-doi-only', A);
    } finally {
        out.serverLog = log.since(from);
        record('export-galley-only', out);
        await close();
    }

    const one = (rows) => `article ${rows[0].doi} ${rows[0].status}, PDF ${rows[0].files}`;
    const answer = (e) => `${e.status} ${e.body.slice(0, 330)} (windows ${JSON.stringify(e.windows)}, notices ${JSON.stringify(e.notices)})`;
    const a = out.exportA, b = out.exportB;
    const bug = out.afterEdit.A[0].doi === '-' && /:Unregistered$/.test(out.afterEdit.A[0].files || '') && a.status >= 500 && b.status === 400;
    console.log(`[export-galley-only] ojs: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `A ${A} after the edit: ${one(out.afterEdit.A)}; Crossref saved ${out.agencySave}, "Items with DOIs" ${JSON.stringify(out.kindsAfterAgency)}, `
        + `stored ${JSON.stringify(out.stored)}; works the export accepts ${JSON.stringify(out.lists.exportable.single)}, by round 7's condition ${JSON.stringify(out.lists.exportableOld.single)}; `
        + `"Export DOIs" on A: ${answer(a)}; server log ${JSON.stringify(a.serverLog)}; `
        + `the Crossref XML for A (what a deposit job builds): ${JSON.stringify(out.lists.works[A].xml)}`);
    console.log(`[export-galley-only] ojs control B ${B} (no DOI: ${one(out.afterEdit.B)}): "Export DOIs" ${answer(b)}`);
    console.log(`[export-galley-only] ojs control C ${C} (both DOIs: ${one(out.afterEdit.C)}): "Export DOIs" ${answer(out.exportC)}`);
});
