// PR review of pkp/pkp-lib#13460 round 3 (pkp/omp#2495; issue pkp/pkp-lib#13447), report
// docs/reports/2026-10-07-pkp-lib-13460.md, its two OMP findings, with "Files" ticked under "Items
// with DOIs" and "DOI Versioning" "Yes":
//   finding 1: "Mark DOIs Registered" on a book marks the proof-file ("PDF / article.pdf") DOI of its
//     unpublished new major version "Registered" (its monograph and format DOIs stay "Unregistered"),
//     and the file DOI stays "Registered" once that version is published;
//   finding 2: with 1.0 and 2.0 both published, "Mark DOIs Registered" marks 1.0's DOIs too, but
//     "Mark DOIs Unregistered" resets only 2.0's (and every version's file), so 1.0's monograph and
//     format DOIs stay "Registered". Way round read after it: unpublish 2.0 (1.0 is current again),
//     "Mark DOIs Unregistered" again.
//
// OMP only. Seeds its own scratch press (DOIs on for monographs, formats and files, prefix 10.1234,
// default suffix, "Upon reaching the copyediting stage", "DOI Versioning" "Yes") and a published book
// with a "PDF" format carrying a proof file, which get their DOIs on publication; one book per finding.
// As the manager, on screen: "Create New Version" > "Major Revision", "Publish" (finding 2), the DOIs
// page's "Bulk Actions" and its "View all" window. The way round's "Unpublish" is the API call the
// button makes. Statuses are read from the database. At the tips a new major version has no DOI until
// its publication, so finding 1 shows nothing there; finding 2 reads PASS there (both actions take the
// current version, so 1.0's DOIs are never marked).
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=pr13460r3b node bin/probe.js omp shared/playwright/checks/sync/pkp-lib-13460/omp-file-and-unmark.js
// Facts: .reports/sync/pr13460r3b/omp-file-and-unmark-omp.json with screenshots
const {forEachApp, launch, signIn, record, shot, tag, sql, serverLog} = require('../../../probe');
const {DoisPage, recordNotices} = require('../../../pages/DoisPages.js');
const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
const L = require('./lib');

const STATUS = {1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};

/** Every DOI of the book: [{version, published, kind, doi, status}], kind monograph | format | file. */
function items(app, id) {
    return String(sql(app, `select p.version_major||'.'||p.version_minor, p.status, k.kind, d.doi, d.status from (
            select p.publication_id, 'monograph' kind, p.doi_id from publications p where p.submission_id=${id}
            union all select f.publication_id, 'format', f.doi_id from publication_formats f
            union all select f.publication_id, 'file', sf.doi_id from submission_files sf
                join publication_formats f on f.publication_format_id=sf.assoc_id and sf.assoc_type=521 where sf.file_stage=10
        ) k join publications p on p.publication_id=k.publication_id join dois d on d.doi_id=k.doi_id
        where p.submission_id=${id} order by 1, 3`))
        .split('\n').filter(Boolean).map((l) => {
            const [version, st, kind, doi, ds] = l.split('|');
            return {version, published: Number(st) === 3, kind, doi, status: STATUS[ds] || ds};
        });
}
const pick = (rows, version, kind) => rows.find((r) => r.version === version && r.kind === kind) || {};
const brief = (rows, version) => ['monograph', 'format', 'file'].map((k) => `${k} ${pick(rows, version, k).status || '-'}`).join(', ');

forEachApp(async (app) => {
    if (app.name !== 'omp') {
        console.log(`[omp-file-and-unmark] ${app.name}: skipped (OMP only)`);
        return;
    }
    const t = tag('p13460f');
    const {mgr, au} = await L.scratchContext(app, t, {enabledDoiTypes: ['publication', 'representation', 'file'], doiVersioning: true});
    const seed = async (w) => L.sid(await app.api.createSubmission({tag: `${t}${w}`, context: t, submitter: au, title: `Versioned book ${t}${w}`,
        published: true, publicationFormats: [{name: 'PDF', file: 'article.pdf'}]}));
    const a = await seed('a'), b = await seed('b');
    const out = {tag: t, ids: {a, b}, f1: {seeded: items(app, a)}, f2: {}};
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        await recordNotices(page);
        await signIn(page, mgr, {contextPath: t});
        const dois = new DoisPage(page, t);
        const frame = new WorkflowPage(page, t, {labels: {publicationGroup: 'Publication'}});

        // Finding 1: an unpublished major version 2.0, then "Mark DOIs Registered", then publish 2.0.
        await frame.gotoEditorial(a);
        await frame.expectVersionLoaded().catch(() => {});
        out.f1.created = await L.createVersion(page, frame, 'Major Revision');
        out.f1.afterCreate = items(app, a);
        await dois.goto();
        out.f1.mark = (await dois.runBulk('Mark DOIs Registered', [a])).status();
        await dois.goto();
        out.f1.windowAfterMark = await L.readVersionsWindow(dois, a);
        out.f1.afterMark = items(app, a);
        await shot(page, 'omp-file-and-unmark-f1-after-mark');
        await frame.gotoEditorial(a);
        await frame.expectVersionLoaded().catch(() => {});
        out.f1.publish = await L.publishLatest(page, frame, 'Publish');
        out.f1.afterPublish = items(app, a);

        // Finding 2: 1.0 and 2.0 both published, "Mark DOIs Registered", then "Mark DOIs Unregistered".
        await frame.gotoEditorial(b);
        await frame.expectVersionLoaded().catch(() => {});
        out.f2.created = await L.createVersion(page, frame, 'Major Revision');
        out.f2.publish = await L.publishLatest(page, frame, 'Publish');
        out.f2.before = items(app, b);
        await dois.goto();
        out.f2.mark = (await dois.runBulk('Mark DOIs Registered', [b])).status();
        out.f2.afterMark = items(app, b);
        await dois.goto();
        out.f2.unmark = (await dois.runBulk('Mark DOIs Unregistered', [b])).status();
        await dois.goto();
        out.f2.windowAfterUnmark = await L.readVersionsWindow(dois, b);
        out.f2.afterUnmark = items(app, b);
        await shot(page, 'omp-file-and-unmark-f2-after-unmark');
        // Way round: unpublish 2.0 (the "Unpublish" button's call), so 1.0 is current, and unmark again.
        out.f2.unpublish = await page.evaluate(async (u) => (await fetch(u, {method: 'POST',
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: '{}'})).status,
        app.url(`/index.php/${t}/api/v1/submissions/${b}/publications/${out.f2.created.id}/unpublish`));
        await dois.goto();
        out.f2.unmarkAgain = (await dois.runBulk('Mark DOIs Unregistered', [b])).status();
        out.f2.afterWayRound = items(app, b);
    } finally {
        out.serverLog = log.since(from);
        record('omp-file-and-unmark', out);
        await close();
    }
    const f1 = out.f1, f2 = out.f2;
    const bug1 = pick(f1.afterMark, '2.0', 'file').status === 'Registered' && !pick(f1.afterMark, '2.0', 'file').published
        && pick(f1.afterPublish, '2.0', 'file').status === 'Registered';
    console.log(`[omp-file-and-unmark] omp finding 1: ${bug1 ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `new version ${f1.created.version} (create ${f1.created.status}) at creation: ${brief(f1.afterCreate, '2.0')}; `
        + `"Mark DOIs Registered" ${f1.mark} -> unpublished 2.0: ${brief(f1.afterMark, '2.0')} (1.0: ${brief(f1.afterMark, '1.0')}); `
        + `published (${f1.publish}) -> 2.0: ${brief(f1.afterPublish, '2.0')}`);
    const bug2 = pick(f2.afterMark, '1.0', 'monograph').status === 'Registered'
        && ['monograph', 'format'].some((k) => pick(f2.afterUnmark, '1.0', k).status === 'Registered');
    console.log(`[omp-file-and-unmark] omp finding 2: ${bug2 ? 'FAIL (bug shows)' : 'PASS (bug does not show)'} — `
        + `1.0 and 2.0 published (${f2.created.status}, ${f2.publish}); "Mark DOIs Registered" ${f2.mark} -> 1.0: ${brief(f2.afterMark, '1.0')}, 2.0: ${brief(f2.afterMark, '2.0')}; `
        + `"Mark DOIs Unregistered" ${f2.unmark} -> 1.0: ${brief(f2.afterUnmark, '1.0')}, 2.0: ${brief(f2.afterUnmark, '2.0')}; `
        + `way round (unpublish 2.0 ${f2.unpublish}, unmark ${f2.unmarkAgain}) -> 1.0: ${brief(f2.afterWayRound, '1.0')}`);
});
