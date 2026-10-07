// PR review of pkp/pkp-lib#13460 round 2 (pkp/ojs#5903, pkp/omp#2495, pkp/ops#1435; issue
// pkp/pkp-lib#13447), report docs/reports/2026-10-07-pkp-lib-13460.md: under "Upon reaching the
// copyediting stage" (a server: "production") with "DOI Versioning" "Yes", a new major version of a
// published work gets its DOIs at creation; "Mark DOIs Registered" on the work then marks that
// unpublished version's DOIs "Registered", and once it is published they stay "Registered" and no
// deposit picks them up.
//
// All three apps (OMP expected PASS: its status updates take the current version only). Seeds its
// own scratch context (DOIs on for the work and its galleys / formats, prefix 10.1234, default
// suffix, "DOI Versioning" "Yes") and a published work with a galley (format), which gets its DOIs
// on publication. As the manager, on screen: "Create New Version" > "Major Revision"; DOIs page,
// tick the work, "Bulk Actions" > "Mark DOIs Registered"; the "View all" window; then "Publish"
// ("Post") the new version and read the window again. Runs unchanged at the tips, where the new
// version has no DOI until its publication.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r2b node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13460/version-mark-registered.js
// Facts: .reports/sync/pr13460r2b/version-mark-registered-<app>.json with screenshots
const {forEachApp, launch, signIn, record, shot, idle, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const WORDS = {ojs: {group: 'Publication', post: 'Publish'}, omp: {group: 'Publication', post: 'Publish'}, ops: {group: 'Preprint', post: 'Post'}};

forEachApp(async (app) => {
    const w = WORDS[app.name];
    const t = tag('p13460v');
    const {mgr, au} = await L.scratchContext(app, t, {enabledDoiTypes: ['publication', 'representation'], doiVersioning: true});
    const files = app.name === 'omp' ? {publicationFormats: [{name: 'PDF', file: 'article.pdf'}]} : {galleys: [{label: 'PDF', file: app.name === 'ops' ? 'preprint.pdf' : 'article.pdf'}]};
    const r = await app.api.createSubmission({tag: `${t}w`, context: t, submitter: au, title: `Versioned work ${t}`, published: true, ...files});
    const id = L.sid(r);
    const out = {tag: t, id, seeded: L.versionRows(app, id)};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const dois = new DoisPage(page, t);
        const frame = new WorkflowPage(page, t, {labels: {publicationGroup: w.group}});
        await frame.gotoEditorial(id);
        await frame.expectVersionLoaded().catch(() => {});
        out.created = await L.createVersion(page, frame, 'Major Revision');
        out.afterCreate = L.versionRows(app, id);

        await dois.goto();
        out.mark = (await dois.runBulk('Mark DOIs Registered', [id])).status();
        await dois.goto();
        out.windowAfterMark = await L.readVersionsWindow(dois, id);
        out.afterMark = L.versionRows(app, id);
        await shot(page, 'version-mark-registered-after-mark');

        await frame.gotoEditorial(id);
        await frame.expectVersionLoaded().catch(() => {});
        const ojsScreen = app.name === 'ojs' ? new (require('../../../../../apps/ojs/playwright/pages/PublishSchedulePages.js').PublishScreen)(page, t) : null;
        out.publish = await L.publishLatest(page, frame, w.post, ojsScreen);
        await dois.goto();
        out.windowAfterPublish = await L.readVersionsWindow(dois, id);
        out.afterPublish = L.versionRows(app, id);
        await shot(page, 'version-mark-registered-after-publish');
        // What a deposit would pick up for the work: the shape of getAllDepositableSubmissionIds()
        // (the current, published version's DOI while "Unregistered", "Error" or "Needs Sync").
        out.depositable = String(sql(app, `select string_agg(d.doi||':'||d.status, ',') from dois d join publications p on p.doi_id=d.doi_id
            join submissions s on s.current_publication_id=p.publication_id where s.submission_id=${id} and p.status=3 and d.status in (1,4,5)`)).trim() || 'none';
    } finally {
        out.serverLog = log.since(from);
        record('version-mark-registered', out);
        await close();
    }
    const v2 = (rows) => (rows || []).find((p) => p.id === out.created.id) || {};
    const atCreate = v2(out.afterCreate), atMark = v2(out.afterMark), atPublish = v2(out.afterPublish);
    const bug = atCreate.doi !== '-' && atCreate.doi !== undefined && !atMark.published && atMark.status === 'Registered'
        && atPublish.published && atPublish.status === 'Registered' && out.depositable === 'none';
    const show = (p) => `${p.doi || '?'} ${p.status || '?'}${p.files ? ` (file ${p.files})` : ''}`;
    console.log(`[version-mark-registered] ${app.name}: ${bug ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `new version ${out.created.version} (create ${out.created.status}) DOI at creation ${show(atCreate)}; `
        + `"Mark DOIs Registered" ${out.mark} -> unpublished ${show(atMark)}; published (${out.publish}) -> ${show(atPublish)}; `
        + `deposit would pick up: ${out.depositable}`);
});
