// PR review pkp/pkp-lib#13714, ui-library#1044 + ojs#6027: "Send to Text Editor" on a Word file fails with
// "Import failed / WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f" on an install
// served from a subdirectory (pandoc.wasm fetched from the root-absolute `/js/build/pandoc.wasm` Vite emits, the
// 404 page handed to WebAssembly); the PRs also self-host MathJax's dynamic fonts (cdn.jsdelivr.net before).
//
// pkp-e2e serves every app at the domain root, so this starts a second `php -S` beside the dataset fleet's
// server, its docroot a temp dir holding only a symlink `ojs` to the checkout: the same install, DB and files,
// reached at http://127.0.0.1:<fleet port + 20>/ojs (the app derives its base URL from the request). The fleet's
// own server (the domain root) is the control. On OJS's dataset fleet freshly reset to PKP's default test dataset:
//
//   npm run fleet-prep -- --feature pr-13714 --dataset --apps ojs --reset
//   PROBE_FEATURE=pr-13714 PROBE_AGENT=pr PROBE_RUN=<base|head> node bin/probe.js ojs <this file>
//   WHERE=sub,root (default both)
//
// As `dbarnes`, per place (sub, root), on two Production submissions with no galleys:
//   I  "Production Ready Files" › Upload `article.docx` (U48's fixture) › "Send to Text Editor" › the current
//      version › "Confirm": the pandoc.wasm request(s) (address, status, type), the import box's text, an
//      "Import failed" message, the editor's text afterwards, script errors
//   M  "Body Text": a line typed, "Save"; the saved document PUT back with \mathbb{R}, \mathcal{A}, \mathfrak{g}
//      equations, the page reloaded: every request for a MathJax file (address, status) and each equation's
//      SVG (paths drawn, a MathJax error). cdn.jsdelivr.net is answered 404 by the browser here, so a font
//      still fetched from it shows as missing glyphs rather than depending on the VM's network.
//   FAIL_WASM=1: leg I alone, with pandoc.wasm answered 404 (an HTML page) by the browser: the message the
//      import box shows (the PR's `r.ok` check; before it, WebAssembly's "expected magic word")
// No assertions: facts go to result.json and the console; screenshots beside them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawn} = require('child_process');
const {forEachApp, launch, signIn, record, sql, idle, outDir} = require('../../../probe');
const L = require('../../issues/press-send-to-text-editor-leads-nowhere/lib');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const WHERE = (process.env.WHERE || 'sub,root').split(',').map((s) => s.trim()).filter(Boolean);
const DOCX = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/article.docx');
const EQUATIONS = ['\\mathbb{R} \\times \\mathbb{N}', '\\mathcal{A} + \\mathcal{L}', '\\mathfrak{g} \\oplus \\mathfrak{h}'];
const LIST = 'Production Ready Files';
const FAIL_WASM = !!process.env.FAIL_WASM;

async function startSubServer(app, port) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pkp-e2e-13714-'));
    fs.symlinkSync(app.root, path.join(root, 'ojs'));
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const conf = fs.readFileSync(configFile, 'utf8').replace(/^allowed_hosts\s*=.*$/m,
        `allowed_hosts = "${JSON.stringify(['127.0.0.1', `127.0.0.1:${app.port}`, `127.0.0.1:${port}`]).replace(/"/g, '\\"')}"`);
    const subConfig = path.join(root, 'config.inc.php');
    fs.writeFileSync(subConfig, conf);
    const log = fs.openSync(path.join(outDir(), 'sub-server.log'), 'a');
    const proc = spawn('php', ['-d', 'max_execution_time=120', '-S', `127.0.0.1:${port}`, '-t', root], {
        env: {...process.env, PKP_CONFIG_FILE: subConfig, TEST_API_KEY: ''}, stdio: ['ignore', log, log],
    });
    for (let i = 0; i < 50; i++) {
        const ok = await fetch(`http://127.0.0.1:${port}/ojs/README.md`).then((r) => r.ok).catch(() => false);
        if (ok) break;
        await new Promise((r) => setTimeout(r, 200));
    }
    return {base: `http://127.0.0.1:${port}/ojs`, stop: () => { proc.kill('SIGTERM'); fs.rmSync(root, {recursive: true, force: true}); }};
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    if (!app.dataset) throw new Error('subdir.js runs on a dataset fleet (fleet-prep --dataset)');
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const side = process.env.PROBE_RUN || 'run';
    const facts = {side};
    const fact = (k, v) => { facts[k] = v; console.log(`[fact] ${side} ${k}: ${flat(JSON.stringify(v), 2000)}`); };
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const pub = (sub) => Number(String(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`)).trim());
    const subs = String(sql(app, `select s.submission_id from submissions s where s.stage_id = 5 and s.status = 1
        and not exists (select 1 from publication_galleys g where g.publication_id = s.current_publication_id)
        order by s.submission_id`)).trim().split(/\s+/).map(Number).filter(Boolean);
    fact('production submissions with no galleys', subs);
    const subServer = WHERE.includes('sub') ? await startSubServer(app, app.port + 20) : null;
    const bases = {sub: subServer && subServer.base, root: app.baseURL};
    let slot = 0;
    try {
        for (const where of WHERE) {
            const base = bases[where];
            const [importSub, mathSub] = [subs[slot++], subs[slot++]];
            const {page, close} = await launch({...app, baseURL: base});
            const errors = [];
            const assets = [];
            page.on('pageerror', (e) => errors.push(flat(e.message, 300)));
            page.on('console', (m) => { if (m.type() === 'error') errors.push(flat(m.text(), 300)); });
            page.on('response', (r) => {
                const u = r.url();
                if (/pandoc|mathjax|jsdelivr/i.test(u)) assets.push({url: u, status: r.status(), type: r.headers()['content-type'] || null});
            });
            await page.route(/cdn\.jsdelivr\.net/, (route) => {
                assets.push({url: route.request().url(), status: 'answered 404 by the walk (CDN)'});
                return route.fulfill({status: 404, body: ''});
            });
            if (FAIL_WASM) {
                await page.route(/pandoc\.wasm/, (route) => route.fulfill({status: 404, contentType: 'text/html', body: '<!DOCTYPE html><html><body>Not Found</body></html>'}));
            }
            const frame = new WorkflowPage(page, app.contextPath);
            const body = new BodyTextPage(page, frame);
            const openEditorial = async (id, menuKey) => {
                await page.goto(base + frame.editorialUrl(id, menuKey));
                await frame.expectOpen(id);
                await idle(page);
            };
            try {
                await signIn(page, 'dbarnes', {origin: base});

                // I: the import
                const publicationId = pub(importSub);
                await openEditorial(importSub, 'workflow_5');
                fact(`${where} pkp.site on the workflow page`, await page.evaluate(() => window.pkp && window.pkp.site));
                fact(`${where} I upload`, {submission: importSub, ...(await L.uploadToList(page, LIST, DOCX, 'Article Text'))});
                const row = L.fileRow(page, LIST, 'article.docx');
                await row.waitFor({state: 'visible', timeout: T});
                const entries = await L.openRowMenu(page, row);
                fact(`${where} I menu`, entries);
                await page.getByRole('menuitem', {name: 'Send to Text Editor', exact: true}).first().click();
                const w = page.getByRole('dialog').filter({has: page.locator('select[name="sendToVersion"]')}).last();
                await w.waitFor({timeout: T});
                await w.locator('select[name="sendToVersion"]').selectOption(String(publicationId));
                const a0 = assets.length;
                const e0 = errors.length;
                await w.getByRole('button', {name: 'Confirm', exact: true}).click();
                await body.expectLoaded().catch((e) => fact(`${where} I body text page`, flat(e.message, 200)));
                await body.watchImport().catch(() => {});
                let failed = null;
                let text = '';
                for (let i = 0; i < 90; i++) {
                    failed = await page.getByText(/Import failed/i).first().evaluate((el) => (el.closest('[role="alert"], [role="status"], [role="dialog"], .pkpNotification, div') || el).innerText).catch(() => null);
                    text = flat(await body.editorText().catch(() => ''), 300);
                    const busy = await body.importStatus().count().catch(() => 0);
                    if (failed || (text && !busy)) break;
                    await page.waitForTimeout(1000);
                }
                fact(`${where} I import`, {
                    importFailed: flat(failed, 400),
                    steps: (await body.importSteps().catch(() => [])).filter(Boolean),
                    editorText: text,
                    pandocRequests: assets.slice(a0).filter((a) => /pandoc/.test(a.url)),
                    scriptErrors: errors.slice(e0),
                });
                await page.screenshot({path: path.join(outDir(), `${side}-${where}-I-import${FAIL_WASM ? '-fail-wasm' : ''}.png`)});

                if (FAIL_WASM) continue;
                // M: the equations
                const mathPub = pub(mathSub);
                await openEditorial(mathSub, `publication_${mathPub}_bodyText`);
                await body.expectLoaded();
                await body.typeAtEnd('pr13714 equations');
                fact(`${where} M save`, (await body.save()).status());
                const bodyRel = String(sql(app, `select f.path from submission_files sf join files f on f.file_id = sf.file_id
                    where sf.assoc_type = 1048588 and sf.assoc_id = ${mathPub} order by sf.submission_file_id desc limit 1`)).trim();
                const doc = JSON.parse(fs.readFileSync(path.join(filesDir, bodyRel), 'utf8'));
                for (const tex of EQUATIONS) doc.content.push({type: 'paragraph', content: [{type: 'math', attrs: {tex, style: 'display'}}]});
                const put = await page.evaluate(async ({url, serialized}) => {
                    const fd = new FormData();
                    fd.append('bodyText', serialized);
                    const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
                    return r.status;
                }, {url: `${base}/index.php/${app.contextPath}/api/v1/submissions/${mathSub}/publications/${mathPub}/bodyText`, serialized: JSON.stringify(doc)});
                fact(`${where} M PUT`, put);
                const m0 = assets.length;
                const em = errors.length;
                await page.goto('about:blank');
                await openEditorial(mathSub, `publication_${mathPub}_bodyText`);
                await body.expectLoaded();
                await page.waitForTimeout(6000);
                const equations = await page.locator('sciflow-editor svg').evaluateAll((svgs) => svgs.map((s) => ({
                    paths: s.querySelectorAll('path').length,
                    uses: s.querySelectorAll('use').length,
                    error: !!s.querySelector('[data-mjx-error], [data-mml-node="merror"]'),
                    texts: s.querySelectorAll('text').length,
                    label: (s.getAttribute('aria-label') || '').slice(0, 60),
                })));
                fact(`${where} M MathJax`, {
                    config: await page.evaluate(() => ({fonts: window.MathJax && window.MathJax.config && window.MathJax.config.loader && window.MathJax.config.loader.paths && window.MathJax.config.loader.paths.fonts, version: window.MathJax && window.MathJax.version})),
                    requests: assets.slice(m0).filter((a) => /mathjax|jsdelivr/i.test(a.url)).map((a) => ({...a, url: a.url.replace(base, '<base>')})),
                    equations,
                    editorText: flat(await body.editorText().catch(() => ''), 400),
                    scriptErrors: errors.slice(em),
                });
                await page.screenshot({path: path.join(outDir(), `${side}-${where}-M-equations.png`)});
            } catch (e) {
                fact(`${where} stopped`, flat(e.stack, 600));
                await page.screenshot({path: path.join(outDir(), `${side}-${where}-stopped.png`)}).catch(() => {});
            } finally {
                await close();
            }
        }
    } finally {
        if (subServer) subServer.stop();
        record(`subdir-${side}${FAIL_WASM ? '-fail-wasm' : ''}`, facts);
    }
});
