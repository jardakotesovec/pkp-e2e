// Regression check — pkp-lib 7269eaf6f0 "pkp/pkp-lib#13561 Improve hygeine of file upload validation" (issue
// pkp/pkp-lib#13560; on stable-3_5_0 as aeacc41746 + 68512b5fda, the same patch). The report is
// docs/reports/2026-10-21-pkp-lib-13561.md; this check runs its Steps on PKP's default test dataset as the
// journal (press, server) manager `rvaca`: the report's console snippet as printed there (snippet() below:
// this app's submission, OJS 4, OMP 3, OPS 1, its section key and version stage, the 3.5 body on the line),
// which uploads a PNG drawn on a canvas as a temporary file and creates a new version with it as the cover
// through POST submissions/<id>/publications; then the stored cover setting, the context's public folder and
// the workflow's "Publication" menu. It asserts nothing, so it runs unchanged before the change (OMP or OPS
// while their lib/pkp pointer is at 042726ebf6, or lib/pkp checked out at the parent), at the tips and with
// fix.diff applied (bin/try-fix.js).
//
//   npm run fleet-prep -- --feature <f> --dataset 1 --reset      # every run adds a version
//   PROBE_FEATURE=<f> PKP_E2E_DATASET=1 PROBE_AGENT=<id> [PROBE_RUN=<run>] \
//     node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/sync/pkp-lib-13561/cover-on-add.js
//   PKP_E2E_LINE=stable-3_5_0 … the same on the 3.5 line's dataset fleet.
//
// Reads fixed when: the snippet's console line reads 200 with coverImage.en an object whose uploadName is
// submission_<id>_<new publication>_coverImage_en.png, the stored setting names that file, and the file is in
// the public folder. At the tips: 200 with coverImage {"en":null,…}, no stored setting, and the moved file in
// the public folder with nothing pointing to it. Before the change: as fixed.
//
// Facts: cover-on-add-<pkp-lib sha>[-<applied diff>][-<PROBE_RUN>]-<app>.json; screenshot
// <label>-workflow-<app>.png.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, idle, shot, record, sql, serverLog} = require('../../../probe');

const T = 30_000;
const SUBMISSION = {ojs: 4, omp: 3, ops: 1};
const STAGE = {ojs: 'VoR', omp: 'VoR', ops: 'AO'};
const CONTEXT_DIR = {ojs: 'journals', omp: 'presses', ops: 'contexts'};

/** The report's snippet, as printed for this app and line. */
function snippet(app, line) {
    const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
    const versionFields = line === 'main'
        ? `version: 2,\n        versionStage: '${STAGE[app.name]}',\n        versionMajor: 2,\n        versionMinor: 0,`
        : 'version: current.version + 1,';
    return `const id = ${SUBMISSION[app.name]};
const api = pkp.context.apiBaseUrl;
const headers = {'X-Csrf-Token': pkp.currentUser.csrfToken};
const get = async (route) => (await fetch(api + route, {headers})).json();
const current = await get(\`submissions/\${id}/publications/\${(await get(\`submissions/\${id}\`)).currentPublicationId}\`);
const canvas = Object.assign(document.createElement('canvas'), {width: 400, height: 400});
const png = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
const form = new FormData();
form.append('file', new File([png], 'cover.png', {type: 'image/png'}));
const temporaryFile = await (await fetch(api + 'temporaryFiles', {method: 'POST', headers, body: form})).json();
const response = await fetch(\`\${api}submissions/\${id}/publications\`, {
    method: 'POST',
    headers: {...headers, 'Content-Type': 'application/json'},
    body: JSON.stringify({
        ${versionFields}
        ${sectionKey}: current.${sectionKey},
        title: current.title,
        abstract: current.abstract,
        coverImage: {en: {temporaryFileId: temporaryFile.id, altText: 'Cover'}},
    }),
});
const added = await response.json();
console.log(response.status, added.id, JSON.stringify(added.coverImage));`;
}

forEachApp(async (app) => {
    const line = app.line || 'main';
    const sha = execFileSync('git', ['-C', path.join(path.resolve(app.root), 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const markerPath = path.join(app.root, '.pkp-e2e-fix.json');
    const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
    const label = `${sha}${marker ? `-${path.basename(String(marker.diff || 'fix'), '.diff')}` : ''}`;
    const facts = {app: app.name, line, libPkp: sha, fixApplied: marker ? marker.diff || true : false};

    const {table, id} = app.contextTables;
    const cid = Number(sql(app, `select ${id} from ${table} where path = 'publicknowledge'`).trim());
    const publicDir = path.join(app.root, app.dataset ? `public-ds${app.dataset}` : 'public', CONTEXT_DIR[app.name], String(cid));
    const ls = () => (fs.existsSync(publicDir) ? fs.readdirSync(publicDir).filter((f) => /coverImage/.test(f)).sort() : 'no folder');
    const sid = SUBMISSION[app.name];
    const rows = () => sql(app, `select publication_id from publications where submission_id = ${sid} order by publication_id`).trim().split(/\s+/).filter(Boolean);
    const log = serverLog(app);

    const {page, close} = await launch(app);
    try {
        await signIn(page, 'rvaca', {contextPath: 'publicknowledge'});
        await page.goto('/index.php/publicknowledge/en/management/settings/website');
        await idle(page);
        facts.versionsBefore = rows();
        facts.coverFilesBefore = ls();
        const from = log.mark();
        const consoleLines = [];
        page.on('console', (m) => consoleLines.push(m.text()));
        const code = snippet(app, line);
        facts.snippet = code;
        await page.evaluate(`(async () => {\n${code}\n})()`);
        await page.waitForTimeout(500);
        facts.consoleLines = consoleLines;
        facts.versionsAfter = rows();
        const newId = facts.versionsAfter.find((p) => !facts.versionsBefore.includes(p));
        facts.newPublicationId = newId || null;
        facts.storedCover = newId
            ? sql(app, `select locale || '=' || setting_value from publication_settings where publication_id = ${newId} and setting_name = 'coverImage'`).trim()
            : null;
        facts.coverFilesAfter = ls();
        facts.serverLog = log.since(from);
        await page.goto(`/index.php/publicknowledge/en/dashboard/editorial?workflowSubmissionId=${sid}`);
        await idle(page);
        await page.waitForTimeout(1000);
        await shot(page, `${label}-workflow`);
    } finally {
        record(`cover-on-add-${label}`, facts);
        console.log(`[fact] ${app.name} ${line} ${label}: ${JSON.stringify({console: facts.consoleLines, stored: facts.storedCover, files: facts.coverFilesAfter})}`);
        await close();
    }
});
