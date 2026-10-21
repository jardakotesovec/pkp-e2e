// U49 claim check H21 (housekeeping 2026-10-21, cc21b): three incidentals rows, all REST API or plain-address
// requests, no screen sends them (MAINTENANCE housekeeping step 6). On PKP's default test dataset (a dataset
// fleet), as the manager `rvaca`, from a signed-in settings page (the session's CSRF token):
//
//   PHASE=stage     U49 row: POST {ctx}/api/v1/submissions/{id}/publications (a new version) on a published
//                   submission (OJS 17, OMP 14, OPS 2), the body copied from its current version, with
//                   versionStage omitted, null, each of AO / PMUR / VoR (the values the controller's
//                   validateVersionStage() names) and one outside them ("XYZ"); the answer, the version count
//                   before and after, the server-log lines. On 3.5 (no stage fields) `version: n+1` and the same
//                   versionStage values.
//   PHASE=cover     U49 row: PUT …/publications/{id} on an unpublished version (OJS 5, OMP 4, OPS 1) with one
//                   temporary file (a real PNG) as `coverImage` under both languages (en, fr_CA); the answer,
//                   the stored cover, the files on disk, the server log. Controls: one PNG under en only; two
//                   PNGs, one per language. Neighbour: POST …/publications (add) with one PNG under both languages.
//   PHASE=category  U16 row: Settings › Press (Journal, Server) › "Categories", "Applied Science" (OPS 3.5:
//                   "Social sciences") › Edit, "Cover Image" a 400 × 400 PNG, Save (3.5: the older form, "OK");
//                   the category page's picture; then catalog/fullSize and catalog/thumbnail ?type=category&id=
//                   (OPS: preprints/…) typed: status, Content-Type, length, first bytes.
//   (default: all three, in that order)
//
// A database error's or PHP error's text in an answer is kept as its kind only (SQLSTATE, constraint, error
// class), never verbatim.
//
// Reset first (every phase changes the dataset):
//   npm run fleet-prep -- --feature <f> --dataset <n> --reset
// Run (main):  PROBE_FEATURE=<f> PKP_E2E_DATASET=<n> PROBE_AGENT=<id> PROBE_RUN=r1 node bin/probe.js <app> shared/playwright/checks/U49/H21/h21.js
// Run (3.5):   PKP_E2E_LINE=stable-3_5_0 … PROBE_RUN=s1 …
// Facts: h21-<phase>[-<run>]-<app>.json; snapshots h21-<phase>-<step>[-<run>]-<app>.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, screen, shot, record, sql, serverLog} = require('../../../probe');

const T = 30_000;
const PHASES = (process.env.PHASE || 'stage,cover,category').split(',');
const PUBLISHED = {ojs: 17, omp: 14, ops: 2};
const UNPUBLISHED = {ojs: 5, omp: 4, ops: 1};
const CONTEXT_DIR = {ojs: 'journals', omp: 'presses', ops: 'contexts'};
const FILES = path.join(__dirname, '..', '..', '..', '..', '..', 'apps', 'ojs', 'playwright', 'fixtures', 'files');
const PICTURE = path.join(FILES, 'profile-image-400.png');
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** An error's text kept as its kind only. */
function kind(text) {
    const s = String(text || '');
    const out = {};
    const st = s.match(/SQLSTATE\[(\w+)\]/);
    if (st) out.sqlstate = st[1];
    const cons = s.match(/check constraint \\?"([a-z_]+)\\?"/i);
    if (cons) out.constraint = cons[1];
    const php = s.match(/\b(TypeError|ArgumentCountError|ValueError|ErrorException|Error)\b/);
    if (php) out.phpError = php[1];
    const fn = s.match(/([A-Za-z\\]+Exception)::__construct\(\)/);
    if (fn) out.in = fn[1].split('\\').pop() + '::__construct()';
    if (/must be of type ([\w\\]+), null given/.test(s)) out.nullGivenFor = s.match(/must be of type ([\w\\]+), null given/)[1].split('\\').pop();
    return Object.keys(out).length ? out : null;
}
function answer(r) {
    const raw = r.json ? JSON.stringify(r.json) : r.text || '';
    const k = kind(raw);
    if (k) return {status: r.status, body: '[error text: withheld]', errorKind: k};
    if (!r.json) return {status: r.status, body: flat(r.text)};
    const j = JSON.stringify(r.json);
    return {status: r.status, body: j.length <= 600 ? r.json : {keys: Object.keys(r.json).slice(0, 40)}};
}
const logKinds = (lines) => lines.map((l) => kind(l) || {line: flat(l.replace(/\/[\w./-]+\.php/g, '<file>'), 160)});

/** In the signed-in session: the context's REST API, the session's CSRF token, JSON both ways. */
async function api(page, method, route, {body, upload} = {}) {
    return page.evaluate(
        async ({method, route, body, upload}) => {
            const headers = {'X-Csrf-Token': pkp.currentUser.csrfToken};
            const init = {method: method === 'GET' ? 'GET' : 'POST', headers};
            if (method === 'PUT' || method === 'DELETE') headers['X-Http-Method-Override'] = method;
            if (upload) {
                const fd = new FormData();
                fd.append('file', new File([Uint8Array.from(atob(upload.b64), (c) => c.charCodeAt(0))], upload.name, {type: upload.type}));
                init.body = fd;
            } else if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
                init.body = JSON.stringify(body);
            }
            const r = await fetch(pkp.context.apiBaseUrl + route, init);
            const text = await r.text();
            let json = null;
            try {
                json = JSON.parse(text);
            } catch (e) {
                json = null;
            }
            return {status: r.status, json, text: json ? null : text.slice(0, 400)};
        },
        {method, route, body, upload: upload ? {name: upload.name, type: upload.type, b64: upload.buffer.toString('base64')} : null}
    );
}
const png = (name) => ({name, type: 'image/png', buffer: fs.readFileSync(PICTURE)});

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('h21.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    const line = app.line || 'main';
    const legacy = line !== 'main';
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const ctx = app.contextPath;
    const log = serverLog(app);
    const {page, close} = await launch(app);
    page.on('dialog', (d) => d.accept().catch(() => {}));
    const snap = async (name) => {
        const s = await screen(page).catch((e) => ({url: page.url(), error: flat(e.message)}));
        record(`h21-${name}${run}`, s);
        await shot(page, `h21-${name}${run}`).catch(() => {});
        return s;
    };
    const settingsPage = async () => {
        await page.goto(app.url(`/index.php/${ctx}/en/management/settings/website`));
        await idle(page);
    };
    const {table, id, settings} = app.contextTables;
    const cid = Number(sql(app, `select ${id} from ${table} where path = '${ctx}'`).trim());

    await signIn(page, 'rvaca');

    // ------------------------------------------------------------------------------------------- stage
    if (PHASES.includes('stage')) {
        const facts = {app: app.name, line, phase: 'stage', submissionId: PUBLISHED[app.name], tries: []};
        await settingsPage();
        await snap('stage-1-settings');
        const sid = PUBLISHED[app.name];
        const count = async () => ((await api(page, 'GET', `submissions/${sid}`)).json?.publications || []).length;
        const sub = (await api(page, 'GET', `submissions/${sid}`)).json;
        facts.submission = {status: sub?.status, currentPublicationId: sub?.currentPublicationId, versions: (sub?.publications || []).map((p) => ({id: p.id, status: p.status, versionStage: p.versionStage, versionString: p.versionString, version: p.version}))};
        const current = (await api(page, 'GET', `submissions/${sid}/publications/${sub.currentPublicationId}`)).json;
        const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
        const VALUES = [['omitted'], ['null', null], ['AO', 'AO'], ['PMUR', 'PMUR'], ['VoR', 'VoR'], ['XYZ', 'XYZ']];
        for (const [label, value] of VALUES) {
            const body = legacy
                ? {version: (current.version || 1) + 1}
                : {version: 2, versionMajor: 2, versionMinor: 0};
            if (label !== 'omitted') body.versionStage = value;
            body[sectionKey] = current[sectionKey];
            body.title = current.title;
            body.abstract = current.abstract;
            const before = await count();
            const from = log.mark();
            const r = await api(page, 'POST', `submissions/${sid}/publications`, {body});
            await new Promise((res) => setTimeout(res, 300));
            const after = await count();
            const row = sql(app, `select publication_id, ${legacy ? 'version' : "coalesce(version_stage,'∅')||' '||coalesce(version_major::text,'∅')||'.'||coalesce(version_minor::text,'∅')"} from publications where submission_id = ${sid} order by publication_id desc limit 1`).trim();
            const t = {versionStage: label, sent: Object.keys(body), answer: answer(r), created: r.json && r.json.id ? {id: r.json.id, versionStage: r.json.versionStage, versionString: r.json.versionString} : null, versions: `${before} → ${after}`, lastRow: row, serverLog: logKinds(log.since(from))};
            facts.tries.push(t);
            console.log(`[fact] ${app.name} ${line} stage ${label}: ${JSON.stringify({status: t.answer.status, errorKind: t.answer.errorKind, versions: t.versions, created: t.created})}`);
        }
        await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        await page.waitForTimeout(1500);
        const s = await snap('stage-2-workflow');
        facts.workflowMenu = flat(s.text && (s.text.dialog || s.text.main), 1200);
        record(`h21-stage${run}`, facts);
    }

    // ------------------------------------------------------------------------------------------- cover
    if (PHASES.includes('cover')) {
        const sid = UNPUBLISHED[app.name];
        const facts = {app: app.name, line, phase: 'cover', submissionId: sid, steps: {}};
        await settingsPage();
        await snap('cover-1-settings');
        const sub = (await api(page, 'GET', `submissions/${sid}`)).json;
        const pid = sub.currentPublicationId;
        facts.publication = {id: pid, status: sub.publications.find((p) => p.id === pid)?.status, locales: sql(app, `select string_agg(distinct locale, ',') from publication_settings where publication_id = ${pid} and locale <> ''`).trim()};
        facts.contextMetadataLocales = sql(app, `select setting_value from ${settings} where ${id} = ${cid} and setting_name = 'supportedSubmissionMetadataLocales'`).trim();
        const conf = fs.readFileSync(path.join(app.root, path.basename(app.configFile)), 'utf8');
        const publicFiles = (conf.match(/^public_files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
        const publicDir = path.join(path.isAbsolute(publicFiles) ? publicFiles : path.join(app.root, publicFiles), CONTEXT_DIR[app.name], String(cid));
        fs.mkdirSync(publicDir, {recursive: true}); // the dataset dump leaves the context's public folder out
        const coverFiles = () => (fs.existsSync(publicDir) ? fs.readdirSync(publicDir).filter((n) => n.startsWith(`submission_${sid}_`)).sort() : []);
        const stored = () => sql(app, `select locale||'='||setting_value from publication_settings where publication_id = ${pid} and setting_name = 'coverImage' order by locale`).split('\n').filter(Boolean);
        const tempRow = (tid) => sql(app, `select count(*) from temporary_files where file_id = ${tid}`).trim();
        const step = async (key, fn) => {
            const from = log.mark();
            const o = await fn();
            o.serverLog = logKinds(log.since(from));
            o.storedAfter = stored();
            o.filesAfter = coverFiles();
            facts.steps[key] = o;
            console.log(`[fact] ${app.name} ${line} cover ${key}: ${JSON.stringify({status: o.answer?.status, errorKind: o.answer?.errorKind, stored: o.storedAfter, files: o.filesAfter, log: o.serverLog.slice(0, 3)})}`);
        };
        facts.storedBefore = stored();
        facts.filesBefore = coverFiles();
        // 1. One temporary file under both languages.
        await step('1-same-file-two-languages', async () => {
            const t = (await api(page, 'POST', 'temporaryFiles', {upload: png('cover.png')})).json;
            const r = await api(page, 'PUT', `submissions/${sid}/publications/${pid}`, {body: {coverImage: {en: {temporaryFileId: t.id, altText: ''}, fr_CA: {temporaryFileId: t.id, altText: ''}}}});
            return {temporaryFileId: t.id, answer: answer(r), temporaryFileRowAfter: tempRow(t.id)};
        });
        // 2. Control: one file under en only.
        await step('2-control-en-only', async () => {
            const t = (await api(page, 'POST', 'temporaryFiles', {upload: png('cover-en.png')})).json;
            const r = await api(page, 'PUT', `submissions/${sid}/publications/${pid}`, {body: {coverImage: {en: {temporaryFileId: t.id, altText: ''}}}});
            return {temporaryFileId: t.id, answer: answer(r), coverImageAnswered: r.json?.coverImage ?? null};
        });
        // 3. Control: two files, one per language.
        await step('3-control-two-files', async () => {
            const a = (await api(page, 'POST', 'temporaryFiles', {upload: png('cover-a.png')})).json;
            const b = (await api(page, 'POST', 'temporaryFiles', {upload: png('cover-b.png')})).json;
            const r = await api(page, 'PUT', `submissions/${sid}/publications/${pid}`, {body: {coverImage: {en: {temporaryFileId: a.id, altText: ''}, fr_CA: {temporaryFileId: b.id, altText: ''}}}});
            return {temporaryFileIds: [a.id, b.id], answer: answer(r), coverImageAnswered: r.json?.coverImage ?? null};
        });
        // 4. Neighbour: the add path (POST …/publications) with one file under both languages.
        await step('4-add-same-file-two-languages', async () => {
            const count = async () => ((await api(page, 'GET', `submissions/${sid}`)).json?.publications || []).length;
            const current = (await api(page, 'GET', `submissions/${sid}/publications/${pid}`)).json;
            const sectionKey = app.name === 'omp' ? 'seriesId' : 'sectionId';
            const t = (await api(page, 'POST', 'temporaryFiles', {upload: png('cover-add.png')})).json;
            const body = legacy ? {version: (current.version || 1) + 1} : {version: 2, versionStage: app.name === 'ops' ? 'AO' : 'VoR', versionMajor: 2, versionMinor: 0};
            Object.assign(body, {[sectionKey]: current[sectionKey], title: current.title, abstract: current.abstract, coverImage: {en: {temporaryFileId: t.id, altText: ''}, fr_CA: {temporaryFileId: t.id, altText: ''}}});
            const before = await count();
            const r = await api(page, 'POST', `submissions/${sid}/publications`, {body});
            const after = await count();
            const last = sql(app, `select publication_id from publications where submission_id = ${sid} order by publication_id desc limit 1`).trim();
            return {temporaryFileId: t.id, answer: answer(r), versions: `${before} → ${after}`, lastPublicationId: last, lastCover: sql(app, `select locale||'='||setting_value from publication_settings where publication_id = ${last} and setting_name = 'coverImage'`).split('\n').filter(Boolean)};
        });
        await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${sid}`));
        await idle(page);
        await page.waitForTimeout(1500);
        await snap('cover-2-workflow');
        record(`h21-cover${run}`, facts);
    }

    // ---------------------------------------------------------------------------------------- category
    if (PHASES.includes('category')) {
        const facts = {app: app.name, line, phase: 'category', steps: {}};
        const {CategoriesTab} = require('../../../pages/CategoriesPages.js');
        const categories = new CategoriesTab(page, ctx);
        const word = app.name === 'ops' ? 'preprints' : 'catalog';
        const hasPath = (p) => !!sql(app, `select category_id from categories where path = '${p}' and context_id = ${cid}`).trim();
        const pic = hasPath('applied-science') ? {name: 'Applied Science', path: 'applied-science'} : {name: 'Social sciences', path: 'social-sciences'};
        pic.id = Number(sql(app, `select category_id from categories where path = '${pic.path}' and context_id = ${cid}`).trim());
        facts.category = pic;
        const conf = fs.readFileSync(path.join(app.root, path.basename(app.configFile)), 'utf8');
        const publicFiles = (conf.match(/^public_files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
        fs.mkdirSync(path.join(path.isAbsolute(publicFiles) ? publicFiles : path.join(app.root, publicFiles), CONTEXT_DIR[app.name], String(cid)), {recursive: true});
        const from = log.mark();
        try {
            if (!legacy) {
                await categories.goto();
                await snap('category-1-tab');
                const win = await categories.openEdit(pic.name);
                await snap('category-2-edit-window');
                const up = await win.uploadCover(PICTURE);
                const saved = await win.save();
                await idle(page);
                facts.steps.save = {upload: up.status(), save: saved.status()};
            } else {
                await page.goto(categories.url());
                await page.locator('#categories-button').click();
                await page.locator('#categoriesContainer table').first().waitFor({timeout: T});
                await idle(page);
                await snap('category-1-tab');
                await page.locator('#categoriesContainer a.pkp_linkaction_editCategory').filter({hasText: new RegExp(`^\\s*${pic.name}\\s*$`)}).first().click();
                await page.locator('form#categoryForm [name="name[en]"]').waitFor({timeout: T});
                await idle(page);
                await snap('category-2-edit-window');
                const uploaded = page.waitForResponse((r) => /upload-?[Ii]mage/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
                await page.locator('form#categoryForm #plupload input[type=file]').setInputFiles(PICTURE);
                const up = await uploaded;
                await idle(page);
                const savedP = page.waitForResponse((r) => /update-?[Cc]ategory/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
                await page.locator('form#categoryForm').getByRole('button', {name: 'OK', exact: true}).click();
                const s = await savedP;
                await idle(page);
                facts.steps.save = {upload: up.status(), save: s.status()};
            }
        } catch (e) {
            facts.steps.saveThrew = flat(e.message.split('\n')[0]);
        }
        facts.steps.storedImage = sql(app, `select image from categories where category_id = ${pic.id}`).trim();
        // The category page's picture.
        const address = app.url(`/index.php/${ctx}/${word}/category/${pic.path}`);
        try {
            await page.goto(address);
        } catch (e) {
            await page.waitForTimeout(3000);
            await page.goto(address); // a press's first category page after a settings save can fail to load (U16 OMP5)
        }
        await idle(page);
        await page.locator('.about_section .cover img').first().evaluate((img) => img.decode && img.decode().catch(() => null)).catch(() => null);
        await snap('category-3-page');
        facts.steps.pagePicture = await page.evaluate(() => {
            const img = document.querySelector('.about_section .cover img');
            return img ? {src: img.getAttribute('src'), complete: img.complete, naturalWidth: img.naturalWidth} : null;
        });
        // The two addresses, typed.
        for (const op of ['fullSize', 'thumbnail']) {
            const r = await page.request.get(app.url(`/index.php/${ctx}/${word}/${op}?type=category&id=${pic.id}`));
            const buf = await r.body();
            facts.steps[op] = {status: r.status(), contentType: r.headers()['content-type'] || null, length: buf.length, firstBytes: buf.subarray(0, 8).toString('hex'), disposition: r.headers()['content-disposition'] || null};
            console.log(`[fact] ${app.name} ${line} category ${op}: ${JSON.stringify(facts.steps[op])}`);
        }
        facts.steps.serverLog = logKinds(log.since(from));
        record(`h21-category${run}`, facts);
    }
    await close();
});
