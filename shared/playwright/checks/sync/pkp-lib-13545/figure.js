// PR review pkp/pkp-lib#13543, round 3: finding 9's fix with a figure. On a new version the export no
// longer revises the file the copied galley shares with the published version; it gives the galley a new
// file. This checks that the figure follows the new file and the published version keeps its own, on
// OJS's dataset fleet freshly reset to PKP's default test dataset. Records absence, so it runs at the
// base too (side.sh). As `dbarnes`, submission 17 (published, publication v1):
//   G1 "Create New Version" (v2); on v2's "Body Text" a line and a figure, "Save", "Export" › "Export to HTML"
//   G2 v2 published (the API's publish), then "Create New Version" (v3): v3's HTML galley shares v2's file
//   G3 v3's "Body Text" (what it carries over), a changed line and the figure, "Save", "Export to HTML"
//   G4 each version's HTML galley: its file, the file's text and <img>, its dependent files; a signed-out
//      reader's view of v2's HTML galley (the figure loads)
// Run: PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const FILES = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files');

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('figure.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1600)}`);
    };
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const html = (publicationId) => {
        const row = String(sql(app, `select g.galley_id || '|' || g.submission_file_id || '|' || f.path from publication_galleys g
            join submission_files sf on sf.submission_file_id = g.submission_file_id join files f on f.file_id = sf.file_id
            where g.publication_id = ${publicationId} and g.label = 'HTML'`)).trim();
        if (!row) return null;
        const [galley, file, rel] = row.split('|');
        const text = fs.readFileSync(path.join(filesDir, rel), 'utf8');
        const deps = String(sql(app, `select coalesce(string_agg(d.submission_file_id || ' ' || coalesce((select setting_value from submission_file_settings s
            where s.submission_file_id = d.submission_file_id and s.setting_name = 'name' limit 1), '-'), ' | ' order by d.submission_file_id), '(none)')
            from submission_files d where d.assoc_type = 515 and d.assoc_id = ${file} and d.file_stage = 17`)).trim();
        return {galley: Number(galley), submissionFile: Number(file), text: flat(text.replace(/<[^>]+>/g, ' '), 80),
            imgs: [...text.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1]), dependents: deps};
    };
    const {page, close} = await launch(app);
    const base = `/index.php/${app.contextPath}/api/v1/submissions/17/publications`;
    const call = async (method, url, body) => {
        const csrfToken = await page.evaluate(() => window.pkp.currentUser.csrfToken);
        const r = await page.request.fetch(app.url(url), {method, headers: {'X-Csrf-Token': csrfToken, 'Content-Type': 'application/json'}, data: body, failOnStatusCode: false});
        let json = null;
        try { json = await r.json(); } catch { json = flat(await r.text(), 160); }
        return {status: r.status(), json};
    };
    const home = () => page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
    const exportOn = async (label, publicationId, line) => {
        const body = new BodyTextPage(page, new WorkflowPage(page, app.contextPath));
        await body.open(17, publicationId);
        fact(`${label} Body Text carried over`, {text: flat(await body.editorText(), 120), figures: await body.figures().count()});
        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        if (!(await exportButton.count())) return fact(`${label} "Export"`, 'absent');
        await body.typeAtEnd(line);
        if (!(await body.figures().count())) {
            fact(`${label} figure upload`, (await body.insertFigure(path.join(FILES, 'figure.png'))).status());
            await expect(body.figures()).toHaveCount(1, {timeout: T});
        }
        fact(`${label} save`, (await body.save()).status());
        await exportButton.click();
        const sent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
        await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
        const r = await sent;
        let j = null; try { j = await r.json(); } catch {}
        fact(`${label} Export to HTML`, {status: r.status(), id: j && j.id, revisionCount: j && j.revisionCount, error: j && j.error});
    };
    try {
        await signIn(page, 'dbarnes');
        await home();
        const v1 = Number(String(sql(app, 'select current_publication_id from submissions where submission_id = 17')).trim());
        const created = await call('POST', `${base}/${v1}/version`, '{}');
        const v2 = created.json && created.json.id;
        fact('G1 Create New Version', {status: created.status, v1, v2});
        if (!v2) return;
        await exportOn('G1', v2, 'pr13543 round 3, version two.');
        fact('G1 v2 HTML', html(v2));
        const published = await call('PUT', `${base}/${v2}/publish`, '{}');
        fact('G2 publish v2', {status: published.status, error: published.json && published.json.error, state: String(sql(app, `select status from publications where publication_id = ${v2}`)).trim()});
        const created3 = await call('POST', `${base}/${v2}/version`, '{}');
        const v3 = created3.json && created3.json.id;
        fact('G2 Create New Version', {status: created3.status, v3});
        if (!v3) return;
        fact('G2 v3 HTML (copied)', html(v3));
        await home();
        await exportOn('G3', v3, 'pr13543 round 3, version three.');
        fact('G4 v3 HTML', html(v3));
        fact('G4 v2 HTML', html(v2));
        const v2html = html(v2);
        if (v2html) {
            const ctx = await page.context().browser().newContext({storageState: {cookies: [], origins: []}});
            const rp = await ctx.newPage();
            await rp.goto(app.url(`/index.php/${app.contextPath}/article/view/17/${v2html.galley}`));
            await rp.waitForTimeout(3000);
            const frame = rp.frameLocator('iframe').first();
            fact('G4 reader, v2 HTML galley', {
                text: flat(await frame.locator('body').innerText().catch(() => null), 120),
                imgs: await frame.locator('img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), loaded: e.complete && e.naturalWidth > 0}))).catch((e) => flat(e.message, 200)),
            });
            await rp.screenshot({path: path.join(outDir(), `${side}-G4-reader-v2.png`)});
            await ctx.close();
        }
    } catch (e) {
        fact('error', flat(e.stack || e.message, 800));
        await page.screenshot({path: path.join(outDir(), `${side}-figure-error.png`)}).catch(() => {});
    } finally {
        record(`figure-${side}`, facts);
        await close();
    }
});
