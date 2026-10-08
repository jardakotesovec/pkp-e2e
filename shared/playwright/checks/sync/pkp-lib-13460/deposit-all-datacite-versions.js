// PR review of pkp/pkp-lib#13460 round 8 (pkp/ojs#5903; the pkp/pkp-lib#13253 commit, lib/pkp `d19b2ed294`, ojs
// `99f5b3dfc8`), no report (ruled by @bozana 2026-10-08: DataCite with DOI versioning is still to be implemented, pkp/pkp-lib#11591; spec U45 OJS8): on a journal that deposits
// with DataCite and has "DOI Versioning" "Yes", "Deposit All" now lists the DOIs of every published major version
// (getAllDepositableSubmissionIds() follows getLatestMinorPublicationsForDoiDeposit()) and marks them all
// "Submitted", while the one job it queues for the work hands DataCite the current version's article and galleys
// only (DatacitePlugin::depositSubmissions() reads getCurrentPublication()). The earlier version's DOIs then read
// "Submitted" for good: no later "Deposit All" lists a "Submitted" DOI. At round 7 and the tips the query listed
// the current version's DOIs only, so the earlier version's kept reading "Unregistered".
//
// OJS only (DataCite is a journal's agency). Seeds its own scratch journal (DOIs on for articles and galleys,
// prefix 10.1234, default suffix, "DOI Versioning" "Yes", DataCite with a symbol and no password) and two
// published articles with a PDF galley, whose 1.0 DOIs read "Unregistered". As the manager, on screen:
//   W (the finding): "Create New Version" > "Major Revision", "Publish" (2.0 gets its own DOIs); DOIs page,
//     "Deposit All" > "Deposit all DOIs"; every version's statuses, the work's "View all" window, the jobs queued
//     for W; then "Deposit All" once more;
//   V (neighbour, older than the commit by the code): the same two versions, then tick V, "Bulk Actions" >
//     "Deposit DOIs" before the "Deposit All": the per-work action marks getPublishedDoisForSubmission(), every
//     published version's DOIs, and queues the same job.
// The lists are read the way "Deposit All" and the job read them (deposit-lists.php, read-only CLI): the new set
// in both "DOI Versioning" modes (the mode set on the in-memory journal only), round 7's query on the same rows,
// the objects the DataCite job is handed and the DOIs in the DataCite XML built for the work. Statuses are read
// from the database. The queued jobs are counted, never run (no DataCite account, `job_runner` Off).
// At round 7 (`ed4299ffcb`) the set holds 2.0's DOIs only, so the line reads PASS.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r8b node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13460/deposit-all-datacite-versions.js
// Facts: .reports/sync/pr13460r8b/deposit-all-datacite-versions-ojs.json with a screenshot
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, record, shot, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

/** The lists "Deposit All" and the deposit job read (deposit-lists.php, read-only). */
function lists(app, t, ids, flags = []) {
    const root = path.resolve(process.cwd(), app.root);
    const config = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(process.cwd(), app.configFile);
    const out = execFileSync('php', [path.join(__dirname, 'deposit-lists.php'), root, t, ...flags, ...ids.map(String)],
        {env: {...process.env, PKP_CONFIG_FILE: config}, encoding: 'utf8', timeout: 180000});
    return JSON.parse(out.trim().split('\n').pop());
}
/** DepositSubmission jobs queued for the work. */
const jobsFor = (app, id) => Number(String(sql(app, `select count(*) from jobs where position('DepositSubmission' in payload) > 0
    and payload ~ 'submissionId[^;]{0,3};i:${id};'`)).trim());
const show = (rows) => rows.map((p) => `${p.version}${p.published ? '' : ' (unpublished)'}: article ${p.doi} ${p.status}, PDF ${p.files}`).join('; ');
const set = (rows) => rows.map((r) => `${r.doi}${r.submissionId === null ? ' (no work id)' : ''}`);

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[deposit-all-datacite-versions] ${app.name}: skipped (OJS only)`);
        return;
    }
    const t = tag('p13460d');
    const {mgr, au} = await L.scratchContext(app, t, {enabledDoiTypes: ['publication', 'representation'], doiVersioning: true,
        registrationAgency: 'dataciteplugin', plugins: {dataciteplugin: {enabled: true, settings: {username: 'P13460SYM'}}}});
    const seed = async (k) => L.sid(await app.api.createSubmission({tag: `${t}${k}`, context: t, submitter: au, title: `Versioned article ${k} ${t}`,
        published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]}));
    const W = await seed('w'), V = await seed('v');
    const out = {tag: t, ids: {W, V}, seeded: {W: L.versionRows(app, W), V: L.versionRows(app, V)}};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const dp = new DoisPage(page, t);
        const ojsScreen = new (require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js').PublishScreen)(page, t);
        const major = async (id) => {
            const frame = new WorkflowPage(page, t, {labels: {publicationGroup: 'Publication'}});
            await frame.gotoEditorial(id);
            await frame.expectVersionLoaded().catch(() => {});
            const created = await L.createVersion(page, frame, 'Major Revision');
            await frame.gotoEditorial(id);
            await frame.expectVersionLoaded().catch(() => {});
            created.publish = await L.publishLatest(page, frame, 'Publish', ojsScreen);
            return created;
        };
        const depositAll = async () => {
            await dp.goto();
            await dp.depositAllButton().click();
            return (await dp.confirmAction(dp.dialog('Deposit all DOIs'), 'Deposit all DOIs')).status();
        };
        out.v2 = {W: await major(W), V: await major(V)};

        // Neighbour: the per-work "Deposit DOIs" on V, before "Deposit All".
        out.beforeV = L.versionRows(app, V);
        await dp.goto();
        out.depositV = (await dp.runBulk('Deposit DOIs', [V])).status();
        out.afterV = L.versionRows(app, V);
        out.jobsV = jobsFor(app, V);

        // The finding: "Deposit All" with W's four DOIs "Unregistered".
        out.before = L.versionRows(app, W);
        out.listsBefore = lists(app, t, [W, V], ['--xml']);
        out.depositAll = await depositAll();
        out.after = L.versionRows(app, W);
        out.jobs = jobsFor(app, W);
        await dp.goto();
        out.rowBadge = (await dp.rowBadge(dp.row(W)).innerText().catch(() => '')).trim();
        out.window = await L.readVersionsWindow(dp, W);
        await shot(page, 'deposit-all-datacite-versions-after');
        out.listsAfter = lists(app, t, [W, V]);

        // A second press: does anything take 1.0's DOIs up again?
        out.depositAll2 = await depositAll();
        out.after2 = L.versionRows(app, W);
        out.jobs2 = jobsFor(app, W);
        out.afterV2 = L.versionRows(app, V);
        out.jobsV2 = jobsFor(app, V);
    } finally {
        out.serverLog = log.since(from);
        record('deposit-all-datacite-versions', out);
        await close();
    }

    const first = (rows) => rows.find((p) => /1\.0$/.test(p.version)) || {};
    const b1 = first(out.before), a1 = first(out.after), z1 = first(out.after2);
    const work = out.listsBefore.works[W];
    const handed = work.datacite.map((i) => i.doi);
    const galley1 = (b1.files || '').split(':')[0];
    const bug = b1.status === 'Unregistered' && /:Unregistered$/.test(b1.files || '') && a1.status === 'Submitted' && /:Submitted$/.test(a1.files || '')
        && !handed.includes(b1.doi) && !handed.includes(galley1);
    const win = (out.window || []).map((b) => `${b.heading} => ${b.rows.map((r) => `${r.type}: ${r.badge}`).join(', ')}`);
    console.log(`[deposit-all-datacite-versions] ojs: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `W ${W} (2.0 created ${out.v2.W.status}, published ${out.v2.W.publish}) before: ${show(out.before)}; `
        + `"Deposit All" set ${JSON.stringify(set(out.listsBefore.new.versioning.filter((r) => r.submissionId === W || r.submissionId === null)))}, `
        + `round 7's query ${JSON.stringify(set(out.listsBefore.old))}; "Deposit All" ${out.depositAll} -> ${show(out.after)}; `
        + `DepositSubmission jobs for W ${out.jobs}; the DataCite job is handed ${JSON.stringify(work.datacite)}; DataCite XML built for W: ${JSON.stringify(work.xml)}; `
        + `row badge "${out.rowBadge}", "View all" window ${JSON.stringify(win)}; "Deposit All" set afterwards ${JSON.stringify(set(out.listsAfter.new.versioning))}; `
        + `second "Deposit All" ${out.depositAll2} -> 1.0 article ${z1.status}, PDF ${z1.files}; jobs for W ${out.jobs2}`);
    console.log(`[deposit-all-datacite-versions] ojs neighbour (per-work "Deposit DOIs", older than the commit by the code): V ${V} before: ${show(out.beforeV)}; `
        + `"Deposit DOIs" ${out.depositV} -> ${show(out.afterV)}; DepositSubmission jobs for V ${out.jobsV}; `
        + `the DataCite job is handed ${JSON.stringify(out.listsBefore.works[V].datacite)}; after both "Deposit All": ${show(out.afterV2)}, jobs for V ${out.jobsV2}`);
    console.log(`[deposit-all-datacite-versions] ojs control (the same rows with "DOI Versioning" "No", in memory): "Deposit All" set `
        + `${JSON.stringify(set(out.listsBefore.new.single))}`);
});
