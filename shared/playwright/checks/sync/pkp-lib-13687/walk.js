/**
 * @file shared/playwright/checks/sync/pkp-lib-13687/walk.js
 *
 * PR review of pkp/pkp-lib#13687 (#13688 stable-3_3_0, #13706 stable-3_4_0,
 * #13707 stable-3_5_0): FileApiHandler::downloadFile() asked for a fileId
 * that is not one of the submission file's revisions. Before the fix it
 * throws a plain Exception (HTTP 500, "Uncaught Exception: File … is not a
 * revision of submission file …" in the server log); after it, a 404.
 *
 * Per app, signed in as the dataset's `admin`, on one submission-stage
 * file of `publicknowledge` (OPS: a galley file, read in production):
 *   own      its own current fileId            -> 200, the file's bytes
 *   default  no fileId (the current revision)   -> 200
 *   missing  a fileId no file row has           -> 404 at the head (500 before)
 *   foreign  another submission file's fileId   -> 404 at the head (500 before)
 *   string   fileId=abc                         -> 404 at the head (500 before)
 * and the server log lines each request wrote.
 *
 *   PKP_E2E_LINE=<line> npm run fleet-prep -- --feature sync-13687 --dataset --reset
 *   PKP_E2E_LINE=<line> PROBE_FEATURE=sync-13687 PROBE_AGENT=w13687 \
 *     node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13687/walk.js
 */
const {forEachApp, launch, signIn, record, sql, serverLog} = require('../../../probe');

forEachApp(async (app) => {
    // OPS 3.3 still keeps its servers in `journals`.
    const table = {ojs: 'journals journal_id', omp: 'presses press_id', ops: 'servers server_id'}[app.name].split(' ');
    const has = (t) => sql(app, `SELECT to_regclass('${t}') IS NOT NULL`) === 't';
    const [ctxTable, ctxKey] = has(table[0]) ? table : ['journals', 'journal_id'];
    const ctx = sql(app, `SELECT ${ctxKey} FROM ${ctxTable} WHERE path = 'publicknowledge'`);
    const row = sql(app, `SELECT sf.submission_file_id, sf.submission_id, sf.file_id FROM submission_files sf JOIN submissions s ON s.submission_id = sf.submission_id WHERE s.context_id = ${ctx} AND sf.file_stage IN (2, 10) AND sf.file_id IS NOT NULL ORDER BY (sf.file_stage = 2) DESC, sf.submission_file_id LIMIT 1`);
    const [sfId, subId, fileId] = row.split('|');
    // A submission file (stage 2) reads in the submission stage; OPS has only
    // galley files (stage 10), read in production.
    const stageId = sql(app, `SELECT file_stage FROM submission_files WHERE submission_file_id = ${sfId}`) === '2' ? 1 : 5;
    const revisions = sql(app, `SELECT file_id FROM submission_file_revisions WHERE submission_file_id = ${sfId}`).split('\n').filter(Boolean);
    const foreign = sql(app, `SELECT file_id FROM submission_file_revisions WHERE submission_file_id <> ${sfId} AND file_id NOT IN (${revisions.join(',')}) ORDER BY file_id LIMIT 1`);
    const missing = Number(sql(app, 'SELECT MAX(file_id) FROM files')) + 1000;

    const {page, close} = await launch(app);
    const log = serverLog(app);
    const results = [];
    try {
        await signIn(page, 'admin');
        const base = `/index.php/publicknowledge/$$$call$$$/api/file/file-api/download-file?submissionFileId=${sfId}&submissionId=${subId}&stageId=${stageId}`;
        const cases = [
            ['own', `&fileId=${fileId}`, 200],
            ['default', '', 200],
            ['missing', `&fileId=${missing}`, 404],
            ['foreign', `&fileId=${foreign}`, 404],
            ['string', '&fileId=abc', 404],
        ];
        for (const [name, extra, want] of cases) {
            const from = log.mark();
            const res = await page.request.get(app.url(base + extra), {maxRedirects: 0});
            const body = await res.body();
            await new Promise((r) => setTimeout(r, 300));
            const lines = log.since(from).map((l) => l.slice(0, 220));
            const r = {
                case: name,
                fileId: extra.replace('&fileId=', '') || '(none)',
                status: res.status(),
                want,
                ok: res.status() === want,
                type: res.headers()['content-type'] || '',
                bytes: body.length,
                head: body.toString('utf8', 0, 160).replace(/\s+/g, ' '),
                log: lines,
            };
            results.push(r);
            console.log(`[13687] ${app.name} ${app.line} ${name} fileId=${r.fileId}: ${r.status} (want ${want}) ${r.ok ? 'OK' : 'MISMATCH'}${lines.length ? ' | log: ' + lines.join(' / ') : ''}`);
        }
        record('cases', {line: app.line, stageId, sfId, subId, fileId, revisions, foreign, missing, results});
    } finally {
        await close();
    }
});
