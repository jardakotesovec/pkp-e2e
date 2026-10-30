// Regression check — pkp/pkp-lib#13657 "Invalid article version URL throws an error instead of 404"
// (PRs: ojs#6003 main, merged 2026-10-30 as 822b79f70c; omp#2530 56ee387696, ops#1469 409a4f19c3 on main;
// ojs#6005 38e111c331 on ore). Each app's version route (OJS ArticleHandler::initialize(), OMP
// CatalogBookHandler::book(), OPS PreprintHandler::initialize()) now refuses a version segment that is not all
// digits with a 404, and the OJS and OMP handlers' `$publication` property is nullable, so a version that is no
// publication of the submission reaches the handler's own 404 instead of a "must not be accessed before
// initialization" 500.
//
// What it does, per app, on a dataset fleet (PKP's default test dataset; it changes nothing, so no reset between
// runs): picks a submission of `publicknowledge` with a published version that has a galley or format (the one
// with the most versions: OJS 1, OPS 3; OMP's dataset has no second version), then requests, anonymously
// following redirects (OJS sends a submission id to its URL path), its landing page and version routes with the version segment set to: the
// published versions (the controls), the unpublished ones, `image.gif`, `<id>abc.gif`, `0<id>`, the empty segment, another submission's
// publication, and an id no publication has; then the same for the galley (OJS, OPS) and the format download
// (OMP `catalog/view` and `catalog/download`, which read the segment in download(), outside omp#2530). It records
// each status and the server log lines the request wrote. Then, signed in as `dbarnes` (the manager), the
// unpublished versions (a preview), a published one and two bad segments.
//
//   npm run fleet-prep -- --feature <f> --dataset --reset [--apps ojs,omp,ops]
//   PROBE_FEATURE=<f> PROBE_AGENT=<id> [PROBE_RUN=<run>] \
//     node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/sync/pkp-lib-13657/version-urls.js
//   On ore: the same with `ojs` from the ore worktree, with this file copied to the same path there (the ore branch
//   does not carry it). With PKP_E2E_LINE=stable-3_5_0 in front of both: the 3.5 line.
// fix-omp-download.diff (OMP main) and fix-omp-3_5.diff (OMP 3.5, a port of omp#2530 plus that hunk) are the
// report's fixes: `node bin/try-fix.js apply <diff> omp`, the run, then `revert` with the same arguments.
//
// Reads fixed when: every bad segment answers 404 with no server log line, and every control 200 as before.
// At the bases (ojs 0a00726121, omp fd4ea260c, ops d4e4d8737d, ore b5fd5d1890) OJS and OMP answered 500 for each bad
// segment but `<id>abc`, which opened the version; at the heads all 404 but OMP's `catalog/view|download` with
// letters, 500 on PostgreSQL (report docs/reports/pr-review/2026-10-30-pkp-lib-13657.md, Finding 1).
//
// Facts: version-urls[-<PROBE_RUN>]-<app>.json.
const {forEachApp, launch, signIn, record, sql, serverLog} = require('../../../probe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

forEachApp(async (app) => {
    const ctx = 'publicknowledge';
    const page_ = {ojs: 'article', omp: 'catalog', ops: 'preprint'}[app.name];
    const op = {ojs: 'view', omp: 'book', ops: 'view'}[app.name];
    const cid = sql(app, `SELECT ${app.name === 'ojs' ? 'journal_id FROM journals' : app.name === 'omp' ? 'press_id FROM presses' : 'server_id FROM servers'} WHERE path = '${ctx}'`);
    // A submission with a published version that has a galley (OMP: an available format with a file), the one
    // with the most versions first.
    const repJoin = app.name === 'omp'
        ? `JOIN publication_formats r ON r.publication_id = p.publication_id AND r.is_available = 1
           JOIN submission_files f ON f.assoc_id = r.publication_format_id AND f.assoc_type = 521`
        : 'JOIN publication_galleys r ON r.publication_id = p.publication_id AND r.submission_file_id IS NOT NULL';
    const sid = sql(app, `SELECT s.submission_id FROM submissions s JOIN publications p ON p.submission_id = s.submission_id ${repJoin}
        WHERE s.context_id = ${cid} AND p.status = 3 GROUP BY s.submission_id
        ORDER BY (SELECT COUNT(*) FROM publications q WHERE q.submission_id = s.submission_id) DESC, s.submission_id LIMIT 1`);
    const pubs = sql(app, `SELECT publication_id, status FROM publications WHERE submission_id = ${sid} ORDER BY publication_id`)
        .split('\n').map((l) => l.split('|').map(Number));
    const published = pubs.filter(([, st]) => st === 3).map(([id]) => id);
    const unpublished = pubs.filter(([, st]) => st !== 3).map(([id]) => id);
    const P = published[0];
    const other = Number(sql(app, `SELECT p.publication_id FROM publications p JOIN submissions s ON s.submission_id = p.submission_id
        WHERE s.context_id = ${cid} AND p.submission_id <> ${sid} AND p.status = 3 ORDER BY p.publication_id LIMIT 1`));
    const none = Number(sql(app, 'SELECT MAX(publication_id) FROM publications')) + 1000;
    // A galley (OJS, OPS: publication_galleys by publication) or a format with a file (OMP).
    let rep = null, file = null;
    if (app.name === 'omp') {
        const row = sql(app, `SELECT pf.publication_format_id, sf.submission_file_id FROM publication_formats pf
            JOIN submission_files sf ON sf.assoc_id = pf.publication_format_id AND sf.assoc_type = 521
            WHERE pf.publication_id = ${P} AND pf.is_available = 1 ORDER BY 1 LIMIT 1`);
        if (row) [rep, file] = row.split('|').map(Number);
    } else {
        const row = sql(app, `SELECT galley_id, submission_file_id FROM publication_galleys WHERE publication_id = ${P} ORDER BY 1 LIMIT 1`);
        if (row) [rep, file] = row.split('|').map(Number);
    }
    const head = (...a) => `/index.php/${ctx}/en/${a.join('/')}`;
    const cases = [
        ['landing', head(page_, op, sid)],
        ...published.map((id) => [`version ${id} (published)`, head(page_, op, sid, 'version', id)]),
        ...unpublished.map((id) => [`version ${id} (unpublished, anonymous)`, head(page_, op, sid, 'version', id)]),
        ['version image.gif', head(page_, op, sid, 'version', 'image.gif')],
        [`version ${P}abc.gif`, head(page_, op, sid, 'version', `${P}abc.gif`)],
        [`version 0${P}`, head(page_, op, sid, 'version', `0${P}`)],
        ['version (empty)', head(page_, op, sid, 'version', '')],
        [`version ${other} (another submission's)`, head(page_, op, sid, 'version', other)],
        [`version ${none} (no such publication)`, head(page_, op, sid, 'version', none)],
    ];
    if (rep && app.name !== 'omp') {
        cases.push(
            [`galley ${rep} under version ${P}`, head(page_, 'view', sid, 'version', P, rep)],
            [`galley ${rep} under version image.gif`, head(page_, 'view', sid, 'version', 'image.gif', rep)],
            [`galley ${rep} under version ${P}abc`, head(page_, 'view', sid, 'version', `${P}abc`, rep)],
            [`download ${rep}/${file} under version ${P}`, head(page_, 'download', sid, 'version', P, rep, file)],
            [`download ${rep}/${file} under version image.gif`, head(page_, 'download', sid, 'version', 'image.gif', rep, file)],
            [`download ${rep}/${file} under version ${other}`, head(page_, 'download', sid, 'version', other, rep, file)],
        );
    }
    if (rep && app.name === 'omp') {
        for (const o of ['view', 'download']) {
            cases.push(
                [`${o} ${rep}/${file} under version ${P}`, head(page_, o, sid, 'version', P, rep, file)],
                [`${o} ${rep}/${file} under version image.gif`, head(page_, o, sid, 'version', 'image.gif', rep, file)],
                [`${o} ${rep}/${file} under version ${P}abc`, head(page_, o, sid, 'version', `${P}abc`, rep, file)],
                [`${o} ${rep}/${file} under version ${other}`, head(page_, o, sid, 'version', other, rep, file)],
            );
        }
    }
    const log = serverLog(app);
    const results = [];
    for (const [label, path] of cases) {
        const mark = log.mark();
        // OJS answers its submission id with a redirect to the URL path (initialize()): followed, up to three hops.
        let res, url = new URL(path, app.baseURL);
        const hops = [];
        for (let i = 0; i < 4; i++) {
            res = await fetch(url, {redirect: 'manual'});
            if (![301, 302, 303].includes(res.status) || i === 3) break;
            await res.arrayBuffer();
            url = new URL(res.headers.get('location'), url);
            hops.push(url.pathname);
        }
        const body = await res.text();
        await sleep(300);
        const errors = log.since(mark).filter((l) => !/\[[23]\d\d\]|\[404\]/.test(l)).map((l) => l.slice(0, 300));
        const r = {label, path, status: res.status, hops: hops.length ? hops : undefined, location: res.headers.get('location') || undefined,
            title: (body.match(/<title>([^<]*)/) || [])[1]?.replace(/\s+/g, ' ').trim().slice(0, 120), errors};
        results.push(r);
        console.log(`[13657] ${app.name} ${String(r.status).padEnd(3)} ${label}${hops.length ? ` (via ${hops.at(-1)})` : ''}${r.location ? ` -> ${r.location}` : ''}${errors.length ? `  LOG: ${errors[0]}` : ''}`);
    }
    // Signed in as the Journal/Press/Server manager `dbarnes`: an unpublished version opens as a preview (the
    // control the nullable property must leave alone), a bad segment still answers 404.
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        const signed = [
            ...unpublished.map((id) => [`dbarnes: version ${id} (unpublished, preview)`, head(page_, op, sid, 'version', id)]),
            [`dbarnes: version ${P}`, head(page_, op, sid, 'version', P)],
            ['dbarnes: version image.gif', head(page_, op, sid, 'version', 'image.gif')],
            [`dbarnes: version ${other} (another submission's)`, head(page_, op, sid, 'version', other)],
        ];
        for (const [label, path] of signed) {
            const mark = log.mark();
            const res = await page.goto(app.url(path));
            await sleep(300);
            const errors = log.since(mark).filter((l) => !/\[[23]\d\d\]|\[404\]/.test(l)).map((l) => l.slice(0, 300));
            const r = {label, path, status: res.status(), title: (await page.title()).slice(0, 120),
                preview: (await page.getByText('This is a preview and has not been published').count()) > 0, errors};
            results.push(r);
            console.log(`[13657] ${app.name} ${String(r.status).padEnd(3)} ${label}${r.preview ? ' [preview notice]' : ''}${errors.length ? `  LOG: ${errors[0]}` : ''}`);
        }
    } finally {
        await close();
    }
    record('version-urls', {line: app.line || process.env.PKP_E2E_APP_BRANCH || 'main', app: app.name, sid, published, unpublished, other, none, rep, file, results});
});
