// U40 claim check I23C (housekeeping 2026-10-23), the U36 incidental row: the submission
// files API's edit (`PUT …/submissions/{id}/files/{fileId}?stageId=…`) with `fileStage`,
// `assocType`, `assocId` in the body. No screen sends these on this route, so the API is
// checked directly (the Frame's exception), as dbarnes (the dataset's editor, manager level),
// with the CSRF token of a back-office page of the context.
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-cc23a PKP_E2E_DATASET=6 \
//     PROBE_NOTES_FEATURE=U40 PROBE_AGENT=cc23a PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U40/I23C/u36.js
// Each run edits a different file (r1 the first, r2 the second of the plan) so two runs on
// one fleet do not read each other's leftovers.
const {forEachApp, launch, signIn, signOut, screen, record, idle, sql, serverLog} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [submissionId, submissionFileId, stageId of the file's stage, another file stage]
const PLAN = {
    ojs: {r1: [4, 17, 1, 4], r2: [8, 24, 1, 4]},
    omp: {r1: [3, 16, 1, 4], r2: [3, 17, 1, 4]},
    ops: {r1: [1, 1, 5, 2], r2: [2, 2, 5, 2]},
};

function fileRow(app, id) {
    const [fs, at, ai, gid, fid, upd] = sql(app, `select file_stage, coalesce(assoc_type::text,'NULL'), coalesce(assoc_id::text,'NULL'), genre_id, file_id, updated_at from submission_files where submission_file_id=${id}`).split('|');
    const name = sql(app, `select setting_value from submission_file_settings where submission_file_id=${id} and setting_name='name' and locale='en'`);
    return {fileStage: fs, assocType: at, assocId: ai, genreId: gid, fileId: fid, updatedAt: upd, nameEn: name};
}

function logMax(app) {
    return +sql(app, 'select coalesce(max(log_id),0) from event_log');
}

function logSince(app, from) {
    return sql(app, `select log_id, assoc_type, assoc_id, event_type, message, coalesce(user_id::text,'') from event_log where log_id>${from} order by log_id`)
        .split('\n').filter(Boolean).map((l) => l.slice(0, 220));
}

forEachApp(async (app) => {
    const key = RUN.replace(/^s/, 'r');
    const [subId, fileId, stageId, otherStage] = (PLAN[app.name][key] || PLAN[app.name].r1);
    const S = {app: app.name, run: RUN, subId, fileId, stageId, steps: []};
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial`));
        await idle(page);
        record('u36-dashboard', await screen(page));
        const ctx = await page.evaluate(() => ({api: window.pkp && pkp.context && pkp.context.apiBaseUrl, csrf: window.pkp && pkp.currentUser && pkp.currentUser.csrfToken}));
        S.apiBase = ctx.api;
        const call = (method, body) => page.evaluate(async ({url, method, body, csrf}) => {
            const r = await fetch(url, {method, headers: {'Content-Type': 'application/json', 'X-Csrf-Token': csrf}, body: body ? JSON.stringify(body) : undefined});
            const text = await r.text();
            let json = null;
            try { json = JSON.parse(text); } catch (e) { /* not json */ }
            return {status: r.status, json, text: json ? null : text.slice(0, 300)};
        }, {url: `${ctx.api}submissions/${subId}/files/${fileId}?stageId=${stageId}`, method, body, csrf: ctx.csrf});
        const pick = (j) => j && (j.id ? {id: j.id, fileStage: j.fileStage, assocType: j.assocType, assocId: j.assocId, name: j.name && j.name.en, updatedAt: j.updatedAt} : j);

        const before = await call('GET');
        S.before = {status: before.status, file: pick(before.json), db: fileRow(app, fileId)};
        const bodies = [
            ['fileStage alone', {fileStage: otherStage}],
            ['assocType and assocId', {assocType: 520, assocId: 1}],
            ['fileStage, assoc and a name', {fileStage: otherStage, assocType: 520, assocId: 1, name: {en: `Renamed u40i23c ${RUN}`}}],
            ['empty body', {}],
        ];
        for (const [label, body] of bodies) {
            const log = serverLog(app);
            const from = log.mark();
            const lf = logMax(app);
            const r = await call('PUT', body);
            await sleep(300);
            const after = await call('GET');
            S.steps.push({label, body, status: r.status, response: pick(r.json) || r.text, getAfter: pick(after.json), db: fileRow(app, fileId), log: logSince(app, lf), serverLog: log.since(from).slice(0, 5)});
        }
        // the same edit as a screen sends it (POST + X-Http-Method-Override), fileStage alone
        {
            const lf = logMax(app);
            const r = await page.evaluate(async ({url, csrf, otherStage}) => {
                const res = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Csrf-Token': csrf, 'X-Http-Method-Override': 'PUT'}, body: JSON.stringify({fileStage: otherStage})});
                return {status: res.status, text: (await res.text()).slice(0, 200)};
            }, {url: `${ctx.api}submissions/${subId}/files/${fileId}?stageId=${stageId}`, csrf: ctx.csrf, otherStage});
            S.steps.push({label: 'fileStage alone, POST with method override', status: r.status, response: r.text.slice(0, 120), db: fileRow(app, fileId), log: logSince(app, lf)});
        }
        await signOut(page);
    } finally {
        await close();
    }
    record('u36-files-edit', S);
    console.log(`[${app.name} ${RUN}] file ${fileId} before ${JSON.stringify(S.before.db)}`);
    for (const s of S.steps) console.log(`  ${s.label}: ${s.status} db ${JSON.stringify(s.db)} log ${s.log.length} ${JSON.stringify(s.log.map((l) => l.split('|').slice(3, 5).join('|')))}`);
});
