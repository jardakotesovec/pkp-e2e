// Regression check — pkp-lib b44cf27793 "pkp/pkp-lib#8920 Implement Laravel Scout and Opensearch (#11578)" (with OJS
// 71a7bfccec, OMP a25dff8b5, OPS 43359941c6, 2025-08-01): MetadataChangedListener, BatchMetadataChangedListener and
// their jobs were deleted, while main still fires MetadataChanged after a publication edit
// (PKPSubmissionController::editPublication) and BatchMetadataChanged after a Native XML import
// (NativeXmlSubmissionFilter), so nothing acts on either. The report is docs/reports/2026-10-22-pkp-lib-8920.md.
// In a scratch context it seeds itself (ORCID on, Member API sandbox; OJS a published issue), one published item whose
// contributor holds a verified iD with a live token (3.5: the contributor's role set in the Contributors window and
// the item published on screen, the line refuses the `published` seed key), then two parts:
//   A. edit — as the context's manager, workflow › "Title & Abstract" (the "This version has been published"
//      warning), the title changed, "Save"; the jobs queued by that save. ORCID itself is never reached on the test
//      installs (dead [proxy]), so the ORCID half is read from the queue: the publish queues DepositOrcidSubmission
//      (control); 3.5's save queues MetadataChangedJob, whose search-index call sends the work again (OJS, OPS).
//   B. import — the item exported with the line's own CLI (tools/importExport.php NativeImportExportPlugin export),
//      its title changed to a new word, imported into the same context (import … --user_name <manager>); the jobs
//      queued by the import, the new item's status, its search-index rows and the front-end search for the word;
//      then the one queued BatchMetadataChangedJob run alone (run-one.php queued <id>, 3.5), or, where nothing was
//      queued, the item indexed alone as a publish would (run-one.php index <id>, main), and the search again.
// It asserts nothing, so it runs unchanged on main, on stable-3_5_0 and with a fix applied (bin/try-fix.js).
//
//   PROBE_FEATURE=<f> PROBE_AGENT=<id> node bin/probe.js <ojs|omp|ops|all> \
//     shared/playwright/checks/sync/pkp-lib-8920/metadata-changed.js
//   PKP_E2E_LINE=stable-3_5_0 … the same on the 3.5 line's fleet (driven on OJS 2026-10-22; OPS and OMP not yet).
//   PART=edit or PART=import runs one part only.
//
// Reads fixed when, on main: A's queuedByEdit holds the job that re-sends the work (a DepositOrcidSubmission, OJS and
// OPS) and re-indexes it; B's queuedByImport holds a job for the imported item, and once that job runs (or at once)
// searchAfterImport.found is true. At the main tips: queuedByEdit and queuedByImport empty, searchAfterImport.found
// false, searchAfterIndexOne.found true (the item is only missing from the index). On stable-3_5_0 (the before
// side): queuedByEdit = [MetadataChangedJob], queuedByImport = [BatchMetadataChangedJob], found false before that
// job runs and true after.
//
// Facts: metadata-changed-<line>-<app>.json; export/import XML and CLI logs beside them; screenshots
// <line>-search-*-<app>.png.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, tag, sql, serverLog, outFile} = require('../../../probe');

const T = 30_000;
const HELPER = path.join(__dirname, 'run-one.php');
const ENTITY = {ojs: 'article', omp: 'monograph', ops: 'preprint'};
const VIEW = {ojs: 'article/view', omp: 'catalog/book', ops: 'preprint/view'};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const maxJob = (app) => Number(sql(app, 'select coalesce(max(id),0) from jobs').trim()) || 0;
const jobsAbove = (app, id) => sql(app, `select id, substring(payload from '"displayName":"([^"]+)"') from jobs where id > ${id} order by id`)
    .split('\n').filter(Boolean).map((l) => l.replace(/\\\\/g, '\\'));

function php(app, args, cwdRoot = true) {
    try {
        return execFileSync('php', args, {
            cwd: cwdRoot ? path.resolve(app.root) : undefined,
            env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.configFile)},
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        return `EXIT ${e.status}\n${e.stdout || ''}\n${e.stderr || ''}`;
    }
}

// 3.5: the seeded contributor has no user group (harness.md "3.5: the main overlays"), which a Native XML export and
// an ORCID work need; set it as an editor does (Contributors › Edit › "Author" › Save). From pkp-lib-10744/cli-worker.js.
async function setContributorRole(page, app, cp, s) {
    const r = {};
    await page.goto(app.url(`/index.php/${cp}/en/dashboard/editorial?workflowSubmissionId=${s.submissionId}`));
    await idle(page);
    await page.getByRole('link', {name: 'Contributors'}).or(page.getByRole('button', {name: 'Contributors'})).first().click({timeout: T});
    await idle(page);
    await page.getByRole('button', {name: /^Edit/}).first().click({timeout: T});
    await idle(page);
    await page.locator('input[name="userGroupId"]').first().waitFor({state: 'attached', timeout: T});
    const authorRadio = page.locator('label').filter({hasText: /^\s*Author\s*$/}).locator('input[name="userGroupId"]').first();
    if (await authorRadio.count()) await authorRadio.check({force: true});
    const country = page.locator('select[name="country"]:visible').first();
    if (await country.count() && !(await country.inputValue())) {
        await country.selectOption('CA');
        r.country = 'CA';
    }
    const saved = page.waitForResponse((x) => /contributors\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await page.getByRole('button', {name: 'Save', exact: true}).last().click({timeout: T});
    const sv = await saved;
    r.saveStatus = sv ? sv.status() : null;
    await idle(page);
    r.userGroup = sql(app, `select user_group_id from authors where publication_id=${s.publicationId}`).trim();
    return r;
}

// 3.5: "Schedule For Publication" › the issue (OJS) › "Publish" (OPS "Post"). From pkp-lib-10744/cli-worker.js.
async function publishOnScreen(page, app, cp, s) {
    const r = {};
    await page.goto(app.url(`/index.php/${cp}/en/dashboard/editorial?workflowSubmissionId=${s.submissionId}`));
    await idle(page);
    await page.getByRole('link', {name: 'Contributors'}).or(page.getByRole('button', {name: 'Contributors'})).first().click({timeout: T});
    await idle(page);
    const header = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Post|Schedule For Publication)$/});
    await header.first().waitFor({state: 'visible', timeout: T});
    await header.first().click();
    const issueSel = page.locator('select[name="issueId"]:visible');
    if (await issueSel.waitFor({state: 'visible', timeout: 8_000}).then(() => true).catch(() => false)) {
        const val = await issueSel.locator('option').evaluateAll((os) => (os.find((o) => /Vol\. 1/.test(o.textContent)) || {}).value);
        await issueSel.selectOption(val);
        await page.getByRole('button', {name: 'Save', exact: true}).last().click();
    }
    const modal = page.locator('.pkpWorkflow__publishModal').last();
    await modal.waitFor({state: 'visible', timeout: T});
    await idle(page);
    await sleep(800);
    const posted = page.waitForResponse((x) => /\/publications\/\d+\/publish$/.test(new URL(x.url()).pathname) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await modal.getByRole('button', {name: /^(Publish|Post|Schedule For Publication|Schedule)$/}).last().click();
    const p = await posted;
    r.publish = p ? p.status() : 'no request';
    await idle(page);
    await sleep(1000);
    return r;
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const line = app.line || 'main';
    const on35 = line !== 'main';
    const loc = on35 ? '/en' : '';
    const part = (process.env.PART || 'all').toLowerCase();
    const t = tag('r8920');
    const out = {app: app.name, line};
    const fact = (k, v) => { out[k] = v; record(`metadata-changed-${line}`, out); console.log(`[8920 ${line} ${app.name}] ${k}:`, JSON.stringify(v).slice(0, 900)); };
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `R8920 ${t}`, contactName: 'Orla Contact', contactEmail: `${t}c@mail.test`},
        users: [
            {username: `${t}mg`, roles: ['manager']},
            {username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
        ],
        orcid: {enabled: true, apiType: 'memberSandbox', city: 'Vancouver'},
        ...(isOJS ? {issues: [{volume: 1, number: 1, year: 2026, published: true}]} : {}),
    });
    const cp = ctx.path || t;
    const ctxId = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path='${cp}'`).trim();
    fact('context', {path: cp, id: ctxId});
    const mark0 = maxJob(app);
    const s = await app.api.createSubmission({
        tag: `${t}v`, context: cp, submitter: `${t}au`, title: `Quorvex ${t}`,
        author: {orcid: 'https://orcid.org/0000-0002-1825-0097', orcidIsVerified: true},
        ...(on35
            ? {decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: isOJS ? 'article.pdf' : 'preprint.pdf'}]}
            : {published: true}),
        ...(isOJS ? {issue: {volume: 1, number: 1, year: 2026}} : {}),
    });
    fact('seed', {submissionId: s.submissionId, publicationId: s.publicationId});
    fact('authorOrcid', sql(app, `select s.setting_name, left(s.setting_value, 40) from authors a join author_settings s on s.author_id=a.author_id where a.publication_id=${s.publicationId} and s.setting_name like 'orcid%' order by 1`).split('\n'));

    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    const search = async (word, key, id) => {
        await page.goto(app.url(`/index.php/${cp}/search/search?query=${encodeURIComponent(word)}`));
        await idle(page);
        const sc = await screen(page);
        await shot(page, `${line}-search-${key}-${app.name}`).catch(() => {});
        const links = await page.locator(`a[href*="/${VIEW[app.name]}/${id}"]`).count();
        const main = sc.text?.main || '';
        const i = main.search(/Search Results|No Results|title(s)? (was|were) found|No titles/);
        return {word, found: links > 0, resultText: flat(i >= 0 ? main.slice(i) : main.slice(-300), 300)};
    };
    try {
        await signIn(page, `${t}mg`, {contextPath: cp});
        await idle(page);
        if (on35) {
            fact('role', await setContributorRole(page, app, cp, s));
            fact('publishOnScreen', await publishOnScreen(page, app, cp, s));
        }
        fact('pubRow', sql(app, `select publication_id, status, date_published from publications where submission_id=${s.submissionId}`));
        fact('queuedByPublish', jobsAbove(app, mark0));

        if (part === 'all' || part === 'edit') {
            await page.goto(app.url(`/index.php/${cp}${loc}/dashboard/editorial?workflowSubmissionId=${s.submissionId}`));
            await idle(page);
            await page.getByRole('link', {name: 'Title & Abstract', exact: true}).first().click({timeout: T}).catch(async () => {
                await page.getByRole('link', {name: 'Publication', exact: true}).click();
                await page.getByRole('link', {name: 'Title & Abstract', exact: true}).first().click({timeout: T});
            });
            await idle(page);
            const editor = 'titleAbstract-title-control-en';
            await page.waitForFunction((id) => !!window.tinymce?.get(id)?.initialized, editor, {timeout: T});
            await sleep(800);
            const before = await screen(page);
            fact('formBefore', {warning: flat(((before.text?.dialog || before.text?.main || '').match(/Warning: This version has been published[^\n]*/) || [null])[0], 160)});
            await page.evaluate(([id, v]) => { const e = window.tinymce.get(id); e.setContent(v); e.fire('change'); }, [editor, `Zentrafil ${t}`]);
            const mark1 = maxJob(app);
            const saved = page.waitForResponse((r) => /\/publications\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await page.getByRole('button', {name: 'Save', exact: true}).last().click();
            const r = await saved;
            fact('save', r ? {status: r.status(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, url: r.url().replace(/^https?:\/\/[^/]+/, '')} : null);
            await sleep(2500);
            await shot(page, `${line}-edit-after-${app.name}`).catch(() => {});
            fact('titleStored', sql(app, `select locale, setting_value from publication_settings where publication_id=${s.publicationId} and setting_name='title'`));
            fact('queuedByEdit', jobsAbove(app, mark1));
        }

        if (part === 'all' || part === 'import') {
            const exportFile = outFile(`export-${line}.xml`);
            const importFile = outFile(`import-${line}.xml`);
            fact('exportCli', flat(php(app, ['tools/importExport.php', 'NativeImportExportPlugin', 'export', exportFile, cp, ENTITY[app.name], String(s.submissionId)]), 600));
            const xml = fs.existsSync(exportFile) ? fs.readFileSync(exportFile, 'utf8') : '';
            const word = `Velmorak${t.slice(-6)}`;
            // the publication's title (and the submission-level title some apps write) carries the new word
            fs.writeFileSync(importFile, xml.replace(/(<title locale="en">)[^<]*(<\/title>)/g, `$1${word} ${t}$2`));
            fact('importWord', word);
            const maxSub = Number(sql(app, 'select coalesce(max(submission_id),0) from submissions').trim());
            const mark2 = maxJob(app);
            const imported = php(app, ['tools/importExport.php', 'NativeImportExportPlugin', 'import', importFile, cp, '--user_name', `${t}mg`]);
            fs.writeFileSync(outFile(`import-${line}.log`), imported);
            fact('importCli', flat(imported, 600));
            const newId = Number(sql(app, `select coalesce(max(submission_id),0) from submissions where context_id=${ctxId} and submission_id > ${maxSub}`).trim());
            fact('imported', {submissionId: newId, publication: sql(app, `select publication_id, status, date_published from publications where submission_id=${newId}`)});
            fact('queuedByImport', jobsAbove(app, mark2));
            const indexRows = () => (on35
                ? sql(app, `select o.type, count(k.keyword_id) from submission_search_objects o left join submission_search_object_keywords k on k.object_id=o.object_id where o.submission_id=${newId} group by o.type order by o.type`)
                : sql(app, `select locale, left(title, 60) from submissions_fulltext where submission_id=${newId} order by 1`)).split('\n').filter(Boolean);
            fact('indexAfterImport', indexRows());
            await signOut(page).catch(() => {});
            const viewPage = await page.goto(app.url(`/index.php/${cp}/${VIEW[app.name]}/${newId}`));
            fact('importedViewStatus', viewPage ? viewPage.status() : null);
            fact('searchAfterImport', await search(word, 'import', newId));

            const batch = jobsAbove(app, mark2).find((l) => /BatchMetadataChangedJob/.test(l));
            if (batch) {
                fact('runQueuedBatch', flat(php(app, [HELPER, path.resolve(app.root), 'queued', batch.split('|')[0]], false), 600));
            } else {
                // nothing queued: index the item alone, as its publish-time UpdateSubmissionSearchJob would (control)
                fact('indexOne', flat(php(app, [HELPER, path.resolve(app.root), 'index', String(newId)], false), 600));
            }
            fact('indexAfterRun', indexRows());
            fact(batch ? 'searchAfterBatchJob' : 'searchAfterIndexOne', await search(word, batch ? 'after-batch' : 'after-index-one', newId));
        }
        fact('serverLog', log.since(from).map((l) => flat(l, 300)));
    } finally {
        await close();
    }
});
