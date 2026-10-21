// PR review pkp/pkp-lib#13543 (pkp-lib#13545, ui-library#1021, ojs#5946): the new body-text galley
// endpoints and the galley list's badges, on OJS's dataset fleet freshly reset to PKP's default test
// dataset. Records absence, so it runs unchanged at the base and the head (side.sh). As `dbarnes`:
//   A. submission 5 (Production, not published): POST …/bodyText with HTML twice, POST …/bodyText/pdf,
//      a PDF body that is not a PDF, HTML sent as JSON; the version's galleys after each (database),
//      the "Galleys" page
//   B. submission 9 (Production, not published): a hand-made "PDF" galley first ("Add galley",
//      "article.pdf"), then "Change File" on it ("Revision 1" in the name cell at the head, the U46 S1
//      red), then POST …/bodyText/pdf: what happens to that galley and its file
//   C. submission 17 (published, the dataset's hand-uploaded "PDF" galley): POST …/bodyText/pdf and
//      …/bodyText on the published version; its galleys, the article page a signed-out reader sees
//      and the bytes of the PDF the reader downloads
//   D. the author of submission 17: the same POST, refused
// Round 2 adds (the heads now carry the Body Text's "Export" menu):
//   E. a Production submission with no galleys, its "Body Text" page: text typed, a figure inserted, "Save";
//      "Export" › "Export to HTML" twice (the HTML file, its figure copied beside it, no second copy), the
//      editor's preview of the HTML galley (the figure loads); "Export" › "Preview: PDF" › "Create PDF"
//      (Vivliostyle in the browser): the PDF galley and its bytes; the "Galleys" page
//   F. the image rules of POST …/bodyText: an <img> naming another submission's file (refused), a file:
//      address (refused), an outside https address (kept); files rows before and after a refusal
// Run (side.sh does it):
//   PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
// Facts: .reports/pr-13543/pr/walk-<side>-ojs.json, screenshots beside them.
const path = require('path');
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, record, sql, outDir} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
    + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
const HTML = (n) => `<h1>pr13543 generated ${n}</h1><p>Body text exported from the editor, take ${n}.</p>`;
const FILES = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files');

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {GalleyManager} = require('../../../pages/GalleysPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${app.name} ${k}: ${flat(JSON.stringify(v), 1600)}`);
    };
    const pub = (sub) => Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
    const galleys = (publicationId) => String(sql(app, `select coalesce(string_agg(
            g.galley_id || ' ' || coalesce(g.label,'-') || ' ' || coalesce(g.locale,'-') || ' approved=' || g.is_approved
            || ' file=' || coalesce(g.submission_file_id::text,'-') || ' ' || coalesce(f.mimetype,'-')
            || ' stage=' || coalesce(sf.file_stage::text,'-') || ' revisions=' || (select count(*) from submission_file_revisions r where r.submission_file_id = g.submission_file_id)
            || ' generatedFrom=' || coalesce((select setting_value from publication_galley_settings s where s.galley_id = g.galley_id and s.setting_name = 'generatedFrom'),'-'),
            ' | ' order by g.galley_id), '(none)')
        from publication_galleys g left join submission_files sf on sf.submission_file_id = g.submission_file_id
        left join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId}`)).trim();
    const {page, close} = await launch(app);
    const api = (sub) => app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${pub(sub)}/bodyText`);
    const post = async (url, body, contentType) => {
        const csrfToken = await page.evaluate(() => window.pkp.currentUser.csrfToken);
        const r = await page.request.fetch(url, {method: 'POST', headers: {'X-Csrf-Token': csrfToken, 'Content-Type': contentType}, data: body, failOnStatusCode: false});
        let json = null;
        try { json = await r.json(); } catch { json = flat(await r.text(), 160); }
        const pick = json && typeof json === 'object' ? Object.fromEntries(['id', 'label', 'locale', 'isApproved', 'generatedFrom', 'generatedFromLabel', 'revisionLabel', 'revisionCount', 'error'].filter((k) => k in json).map((k) => [k, json[k]])) : json;
        return {status: r.status(), body: pick};
    };
    const galleyShot = async (name, sub) => {
        const frame = new WorkflowPage(page, app.contextPath);
        const manager = new GalleyManager(page, frame);
        await manager.open(sub, pub(sub));
        const names = await manager.nameCells().allInnerTexts();
        await manager.table().screenshot({path: path.join(outDir(), `${side}-${name}.png`)});
        return names.map((n) => flat(n, 120));
    };
    try {
        const home = () => page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        await signIn(page, 'dbarnes');
        await home();
        // A
        fact('A0 galleys of 5', galleys(pub(5)));
        fact('A1 POST html', await post(api(5), HTML(1), 'text/html; charset=UTF-8'));
        fact('A1 galleys', galleys(pub(5)));
        fact('A2 POST html again', await post(api(5), HTML(2), 'text/html; charset=UTF-8'));
        fact('A2 galleys', galleys(pub(5)));
        fact('A3 POST pdf', await post(api(5) + '/pdf', PDF, 'application/pdf'));
        fact('A3 galleys', galleys(pub(5)));
        fact('A4 POST pdf, not a PDF', await post(api(5) + '/pdf', Buffer.from('hello'), 'application/pdf'));
        fact('A5 POST html as JSON', await post(api(5), JSON.stringify({html: HTML(3)}), 'application/json'));
        fact('A6 Galleys page of 5', await galleyShot('A6-galleys-5', 5));
        // B
        {
            const frame = new WorkflowPage(page, app.contextPath);
            const manager = new GalleyManager(page, frame);
            const names = async () => (await manager.nameCells().allInnerTexts()).map((n) => flat(n, 80));
            await manager.open(9, pub(9));
            const win = await manager.openCreate();
            await win.type(win.labelBox(), 'PDF');
            await win.save();
            await manager.uploadInWizard({component: 'Article Text', file: path.join(FILES, 'article.pdf'), name: 'article.pdf'});
            await expect(manager.rows()).toHaveCount(1, {timeout: T});
            fact('B0 name cells after Add galley', await names());
            fact('B0 galleys', galleys(pub(9)));
            await manager.openChangeFile('PDF');
            await manager.uploadInWizard({file: path.join(FILES, 'replacement.pdf'), name: 'replacement.pdf'});
            await page.waitForTimeout(2000);
            fact('B1 name cells after Change File', await names());
            fact('B1 whole-label row "PDF"', await manager.row('PDF').count());
            fact('B1 galleys', galleys(pub(9)));
            await manager.table().screenshot({path: path.join(outDir(), `${side}-B1-change-file-9.png`)});
            await home();
            fact('B2 POST pdf', await post(api(9) + '/pdf', PDF, 'application/pdf'));
            fact('B2 galleys', galleys(pub(9)));
            fact('B3 Galleys page of 9', await galleyShot('B3-galleys-9', 9));
        }
        // C
        const reader = async (label) => {
            const ctx = await page.context().browser().newContext({storageState: {cookies: [], origins: []}});
            const rp = await ctx.newPage();
            await rp.goto(app.url(`/index.php/${app.contextPath}/article/view/17`));
            const links = await rp.locator('a.obj_galley_link').allInnerTexts();
            await rp.locator('.galleys_links, .item.galleys').first().screenshot({path: path.join(outDir(), `${side}-${label}.png`)}).catch(() => rp.screenshot({path: path.join(outDir(), `${side}-${label}.png`)}));
            const pdfHref = await rp.locator('a.obj_galley_link.pdf').first().getAttribute('href').catch(() => null);
            let pdf = null;
            if (pdfHref) {
                const r = await rp.request.get(pdfHref.replace('/article/view/', '/article/download/'), {failOnStatusCode: false});
                const b = await r.body();
                pdf = {status: r.status(), size: b.length, generated: b.equals(PDF)};
            }
            await ctx.close();
            return {links: links.map((l) => flat(l, 40)), pdfHref, pdf};
        };
        await home();
        fact('C0 status of 17', String(sql(app, `select status from publications where publication_id = ${pub(17)}`)).trim());
        fact('C0 galleys of 17', galleys(pub(17)));
        fact('C0 reader', await reader('C0-reader-17'));
        fact('C1 POST pdf on the published version', await post(api(17) + '/pdf', PDF, 'application/pdf'));
        fact('C1 galleys', galleys(pub(17)));
        fact('C1 reader', await reader('C1-reader-17'));
        fact('C2 POST html on the published version', await post(api(17), HTML(4), 'text/html; charset=UTF-8'));
        fact('C2 galleys', galleys(pub(17)));
        fact('C2 reader', await reader('C2-reader-17'));

        // E (round 2): the Body Text's "Export" menu
        await home();
        const eSub = Number(String(sql(app, `select s.submission_id from submissions s where s.stage_id = 5 and s.status = 1
            and s.submission_id not in (5, 9, 17) and not exists (select 1 from publication_galleys g where g.publication_id = s.current_publication_id)
            order by s.submission_id limit 1`)).trim());
        fact('E0 submission', {submission: eSub, publication: pub(eSub)});
        {
            const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
            const frame = new WorkflowPage(page, app.contextPath);
            const body = new BodyTextPage(page, frame);
            await body.open(eSub, pub(eSub));
            const exportButton = page.getByRole('button', {name: 'Export', exact: true});
            fact('E0 "Export" buttons on the Body Text page', await exportButton.count());
            if (await exportButton.count()) {
                await body.typeAtEnd('pr13543 heading line');
                await page.keyboard.press('Enter');
                await page.keyboard.type('A paragraph typed in the Body Text for round 2.');
                const fig = await body.insertFigure(path.join(FILES, 'figure.png'));
                fact('E1 figure upload', fig.status());
                await expect(body.figures()).toHaveCount(1, {timeout: T});
                fact('E1 save', (await body.save()).status());
                await exportButton.click();
                const items = await page.getByRole('menuitem').allInnerTexts();
                fact('E2 "Export" menu', items.map((i) => flat(i, 60)));
                const exportHtml = async (label) => {
                    if (!(await page.getByRole('menuitem').count())) await exportButton.click();
                    const sent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: T});
                    await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
                    const r = await sent;
                    let j = null; try { j = await r.json(); } catch {}
                    await page.waitForTimeout(1000);
                    const status = await page.getByRole('status').allInnerTexts();
                    fact(`${label} Export to HTML`, {status: r.status(), revisionCount: j && j.revisionCount, generatedFrom: j && j.generatedFrom, id: j && j.id, statusLine: status.map((x) => flat(x, 80))});
                    return j;
                };
                const h1 = await exportHtml('E3');
                fact('E3 galleys', galleys(pub(eSub)));
                const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
                const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
                const htmlFile = () => {
                    const rel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id join files f on f.file_id = sf.file_id where g.publication_id = ${pub(eSub)} and g.label = 'HTML'`)).trim();
                    return rel ? fs.readFileSync(path.join(filesDir, rel), 'utf8') : null;
                };
                const deps = () => String(sql(app, `select coalesce(string_agg(d.submission_file_id || ' ' || f.mimetype || ' ' || coalesce((select setting_value from submission_file_settings s where s.submission_file_id = d.submission_file_id and s.setting_name = 'name' limit 1),'-'), ' | '), '(none)')
                    from publication_galleys g join submission_files d on d.assoc_type = 515 and d.assoc_id = g.submission_file_id and d.file_stage = 17
                    join files f on f.file_id = d.file_id where g.publication_id = ${pub(eSub)} and g.label = 'HTML'`)).trim();
                const html1 = htmlFile();
                fact('E3 HTML file', {size: html1 && html1.length, imgs: html1 && [...html1.matchAll(/<img[^>]*>/g)].map((m) => flat(m[0], 200)), figures: html1 && [...html1.matchAll(/<figure[^>]*>/g)].map((m) => flat(m[0], 200)), head: flat(html1, 300)});
                fact('E3 dependent files of the HTML', deps());
                await exportHtml('E4');
                fact('E4 galleys', galleys(pub(eSub)));
                fact('E4 dependent files of the HTML', deps());
                // the editor's preview of the HTML galley: the figure loads
                if (h1 && h1.id) {
                    await page.goto(app.url(`/index.php/${app.contextPath}/article/view/${eSub}/${h1.id}`));
                    const frameEl = page.frameLocator('iframe').first();
                    await page.waitForTimeout(3000);
                    const imgs = await frameEl.locator('img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), loaded: e.complete && e.naturalWidth > 0}))).catch((e) => String(e.message).slice(0, 200));
                    fact('E5 HTML galley view, images', imgs);
                    await page.screenshot({path: path.join(outDir(), `${side}-E5-html-galley-view.png`)});
                    await body.open(eSub, pub(eSub));
                }
                // PDF through Vivliostyle
                await exportButton.click();
                await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
                const preview = page.frameLocator('iframe.body-text-pdf-preview');
                await expect(preview.locator('#generate-pdf')).toBeVisible({timeout: T});
                fact('E6 PDF preview', {header: flat(await preview.locator('.preview-header').innerText(), 120), button: flat(await preview.locator('#generate-pdf').innerText(), 40), imgs: await preview.locator('#html-preview img').count()});
                await page.locator('iframe.body-text-pdf-preview').screenshot({path: path.join(outDir(), `${side}-E6-pdf-preview.png`)});
                const sentPdf = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000});
                const t0 = Date.now();
                await preview.locator('#generate-pdf').click();
                const rp = await sentPdf.catch((e) => null);
                await expect.poll(async () => flat(await preview.locator('#pdf-status').innerText()), {timeout: 60_000}).toMatch(/saved|Unable/);
                fact('E7 Create PDF', {status: rp && rp.status(), seconds: Math.round((Date.now() - t0) / 1000), statusLine: flat(await preview.locator('#pdf-status').innerText(), 100), viewerShown: await preview.locator('#pdf-viewer').isVisible()});
                fact('E7 galleys', galleys(pub(eSub)));
                const pdfRel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id join files f on f.file_id = sf.file_id where g.publication_id = ${pub(eSub)} and g.label = 'PDF'`)).trim();
                if (pdfRel) {
                    const b = fs.readFileSync(path.join(filesDir, pdfRel));
                    fs.writeFileSync(path.join(outDir(), `${side}-E7-generated.pdf`), b);
                    const txt = b.toString('latin1');
                    fact('E7 PDF file', {size: b.length, magic: txt.slice(0, 8), pages: (txt.match(/\/Type\s*\/Page[^s]/g) || []).length, images: (txt.match(/\/Subtype\s*\/Image/g) || []).length});
                }
                await page.locator('iframe.body-text-pdf-preview').screenshot({path: path.join(outDir(), `${side}-E7-pdf-created.png`)});
                await preview.locator('#back-to-editor').click();
                await expect(exportButton).toBeVisible({timeout: T});
                fact('E8 Galleys page', await galleyShot('E8-galleys', eSub));
            }
        }
        // F: image rules of POST …/bodyText (another submission's file, a file: address, an outside address)
        await home();
        {
            const other = Number(String(sql(app, `select sf.submission_file_id from submission_files sf where sf.submission_id = 17 and sf.file_stage = 10 order by 1 limit 1`)).trim());
            const otherUrl = app.url(`/index.php/${app.contextPath}/$$$call$$$/api/file/file-api/download-file?submissionFileId=${other}&submissionId=17&stageId=5`);
            const files0 = Number(String(sql(app, 'select count(*) from files')).trim());
            fact('F1 POST html, <img> of submission 17\'s file', await post(api(5), `<p>x</p><img src="${otherUrl}">`, 'text/html; charset=UTF-8'));
            fact('F2 POST html, <img src="file:///etc/passwd">', await post(api(5), '<p>x</p><img src="file:///etc/passwd">', 'text/html; charset=UTF-8'));
            fact('F3 files rows before/after the refusals', {before: files0, after: Number(String(sql(app, 'select count(*) from files')).trim())});
            fact('F4 POST html, <img> of an outside https address', await post(api(5), '<p>x</p><img src="https://example.org/a.png">', 'text/html; charset=UTF-8'));
            fact('F4 galleys of 5', galleys(pub(5)));
        }
        // D
        const author = String(sql(app, `select u.username from stage_assignments sa join user_groups ug on ug.user_group_id = sa.user_group_id join users u on u.user_id = sa.user_id where sa.submission_id = 17 and ug.role_id = 65536 limit 1`)).trim();
        await signOut(page, {origin: app.url('')});
        await signIn(page, author);
        await home();
        fact('D1 author ' + author + ' POST pdf', await post(api(17) + '/pdf', PDF, 'application/pdf'));
        fact('D1 galleys', galleys(pub(17)));
    } catch (e) {
        fact('error', flat(e.stack || e.message, 800));
        await page.screenshot({path: path.join(outDir(), `${side}-error.png`)}).catch(() => {});
    } finally {
        record(`walk-${side}`, facts);
        await close();
    }
});
