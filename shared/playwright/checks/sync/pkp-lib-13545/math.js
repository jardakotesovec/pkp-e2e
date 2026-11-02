// PR review pkp/pkp-lib#13543, round 4: the reviewers' points on the PDF preview (ui-library#1021,
// blesildaramirez 2026-10-26): equations shown in the preview but missing from the saved PDF, and a link
// clicked in the preview navigating the iframe away from its Back button. Round 4 moves the header, the
// Back button and "Create PDF" out of the iframe and turns equations into images for the PDF. On OJS's
// dataset fleet freshly reset to PKP's default test dataset; records absence, so it runs at the base too.
// As `dbarnes`, a Production submission with no galleys:
//   M0 its "Body Text": a line typed, "Save" (the request's document captured)
//   M1 the document PUT back with a paragraph holding an inline equation, a display equation and a link to
//      the journal's About page; the page reloaded (the editor's rendered equations)
//   M2 "Export" › "Preview: PDF": what sits outside the iframe (header, Back, "Create PDF"), the preview's
//      equations and links
//   M3 the link clicked inside the preview: a new tab, the preview and the Back button stay
//   M4 "Create PDF": the save, the PDF shown, the PDF's bytes (image XObjects)
//   M5 the PDF galley in OJS's PDF.js viewer: its text layer and a screenshot (the equations drawn?)
//   M6 Back: the editor again
// Run: PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const INLINE = 'x^2 + y^3 = \\sqrt{16}';
const DISPLAY = '\\int_0^1 t^2\\,dt = \\frac{1}{3}';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('math.js runs on a dataset fleet (fleet-prep --dataset)');
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
    const pub = (sub) => Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes');
        const sub = Number(String(sql(app, `select s.submission_id from submissions s where s.stage_id = 5 and s.status = 1
            and s.submission_id not in (5, 9, 17) and not exists (select 1 from publication_galleys g where g.publication_id = s.current_publication_id)
            order by s.submission_id limit 1`)).trim());
        const publicationId = pub(sub);
        fact('M0 submission', {submission: sub, publication: publicationId});
        const frame = new WorkflowPage(page, app.contextPath);
        const body = new BodyTextPage(page, frame);
        await body.open(sub, publicationId);
        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        fact('M0 "Export" buttons', await exportButton.count());
        if (!(await exportButton.count())) return;

        // M0: save once, keep the serialized document the editor sends
        let captured = null;
        const onRequest = (r) => {
            if (r.method() === 'PUT' && /\/bodyText$/.test(r.url())) { const b = r.postDataBuffer(); captured = b ? b.toString('utf8') : r.postData(); }
        };
        page.on('request', onRequest);
        await body.typeAtEnd('pr13543 round 4: equations and a link');
        fact('M0 save', (await body.save()).status());
        page.off('request', onRequest);
        // the saved document, read from its file (the request body is multipart and not always exposed)
        const bodyRel = String(sql(app, `select f.path from submission_files sf join files f on f.file_id = sf.file_id
            where sf.assoc_type = 1048588 and sf.assoc_id = ${publicationId} order by sf.submission_file_id desc limit 1`)).trim();
        const saved = bodyRel ? fs.readFileSync(path.join(filesDir, bodyRel), 'utf8') : (captured && (captured.match(/name="bodyText"\r?\n(?:[^\r\n]+\r?\n)*\r?\n([\s\S]*?)\r?\n--/) || [])[1]);
        if (!saved) throw new Error('the saved body text was not found');
        const m = [null, saved];
        const doc = JSON.parse(m[1]);
        const aboutUrl = app.url(`/index.php/${app.contextPath}/about`);
        doc.content.push({type: 'paragraph', content: [
            {type: 'text', text: 'Inline equation '},
            {type: 'math', attrs: {tex: INLINE, style: 'inline'}},
            {type: 'text', text: ' then a link to '},
            {type: 'text', text: 'the About page', marks: [{type: 'anchor', attrs: {href: aboutUrl}}]},
            {type: 'text', text: '.'},
        ]});
        doc.content.push({type: 'paragraph', content: [{type: 'math', attrs: {tex: DISPLAY, style: 'display'}}]});

        // M1: PUT it back as the editor does, reload
        const put = await page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return {status: r.status, body: (await r.text()).slice(0, 200)};
        }, {url: app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/bodyText`), serialized: JSON.stringify(doc)});
        fact('M1 PUT the document with the equations and the link', put);
        await body.open(sub, publicationId);
        await page.waitForTimeout(3000);
        fact('M1 editor', {mathNodes: await page.locator('sciflow-editor math, sciflow-editor [data-tex]').count(), svgs: await page.locator('sciflow-editor svg').count(), link: await page.locator(`sciflow-editor a[href="${aboutUrl}"]`).count()});
        await page.screenshot({path: shot('M1-editor')});

        // M2: the preview. Round 4's DOM (header, Back, "Create PDF" outside the iframe) or round 3's
        // (all inside iframe.body-text-pdf-preview), so this also runs at round 3's head as the control.
        const openPreview = async () => {
            await exportButton.click();
            await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
            await expect(page.locator('iframe.body-text-pdf-preview, iframe[srcdoc]').first()).toBeVisible({timeout: T});
            await page.waitForTimeout(1000);
            const r3 = (await page.locator('iframe.body-text-pdf-preview').count()) > 0;
            const preview = page.frameLocator(r3 ? 'iframe.body-text-pdf-preview' : 'iframe[srcdoc]');
            const section = r3 ? page.locator('iframe.body-text-pdf-preview')
                : page.locator('section').filter({has: page.getByRole('button', {name: 'Create PDF'})}).last();
            return {r3, preview, section,
                create: r3 ? preview.locator('#generate-pdf') : page.getByRole('button', {name: 'Create PDF'}),
                status: r3 ? preview.locator('#pdf-status') : section.locator('footer [role="status"]'),
                header: r3 ? preview.locator('.preview-header') : section.locator('header'),
                back: r3 ? preview.locator('#back-to-editor') : section.locator('header button').first(),
                article: preview.locator('article'),
                pdfFrame: r3 ? preview.locator('#pdf-viewer:not([hidden])') : section.locator('iframe[src^="blob:"]')};
        };
        let ui = await openPreview();
        await expect(ui.article).toBeVisible({timeout: T});
        fact('M2 preview layout', {round: ui.r3 ? 'round 3 (all in the iframe)' : 'round 4 (header and buttons outside)',
            header: flat(await ui.header.innerText(), 120), backLabel: await ui.back.getAttribute('aria-label'),
            buttonsInIframe: await ui.preview.locator('button').count()});
        fact('M2 preview content', {
            mathSvgs: await ui.preview.locator('.body-text-math > svg').count(),
            mathImgs: await ui.preview.locator('.body-text-math img').count(),
            links: await ui.preview.locator('article a[href]').evaluateAll((els) => els.map((a) => ({href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel')}))),
        });
        await ui.section.screenshot({path: shot('M2-pdf-preview')});

        // M3: a link clicked in the preview
        const linkCheck = async () => {
            const link = ui.preview.locator(`article a[href="${aboutUrl}"]`);
            if (!(await link.count())) return 'no link';
            const popup = page.context().waitForEvent('page', {timeout: 10_000}).catch(() => null);
            await link.click();
            const tab = await popup;
            await page.waitForTimeout(2000);
            const out = {
                newTab: tab ? flat(tab.url(), 160) : null,
                previewArticleStillThere: await ui.article.count(),
                frameShowsAboutPage: await ui.preview.locator('body').innerText().then((t) => /About the Journal/i.test(t)).catch((e) => flat(e.message, 80)),
                backButtonStillThere: await ui.back.count(),
            };
            await ui.section.screenshot({path: shot('M3-after-link')});
            if (tab) await tab.close();
            return out;
        };
        if (!ui.r3) fact('M3 link clicked in the preview', await linkCheck());

        // M4: Create PDF
        const sent = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000});
        const t0 = Date.now();
        await ui.create.click();
        const rp = await sent.catch(() => null);
        await expect.poll(async () => flat(await ui.status.innerText()), {timeout: 60_000}).toMatch(/saved|Unable|created/i);
        await page.waitForTimeout(1500);
        fact('M4 Create PDF', {status: rp && rp.status(), seconds: Math.round((Date.now() - t0) / 1000), statusLine: flat(await ui.status.innerText(), 100), pdfShown: await ui.pdfFrame.count()});
        await ui.section.screenshot({path: shot('M4-pdf-created')});
        const row = String(sql(app, `select g.galley_id || '|' || f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} and g.label = 'PDF'`)).trim();
        const [galleyId, rel] = row.split('|');
        if (rel) {
            const b = fs.readFileSync(path.join(filesDir, rel));
            fs.writeFileSync(path.join(outDir(), `${side}-M4-generated.pdf`), b);
            const txt = b.toString('latin1');
            fact('M4 PDF file', {galleyId, size: b.length, magic: txt.slice(0, 8), pages: (txt.match(/\/Type\s*\/Page[^s]/g) || []).length,
                images: (txt.match(/\/Subtype\s*\/Image/g) || []).length, forms: (txt.match(/\/Subtype\s*\/Form/g) || []).length});
        }
        // M6: Back (round 3: then the preview again for M3, whose link click navigates the iframe)
        await ui.back.click();
        await expect(exportButton).toBeVisible({timeout: T});
        fact('M6 back in the editor', {exportVisible: await exportButton.isVisible()});
        if (ui.r3) {
            ui = await openPreview();
            fact('M3 link clicked in the preview', await linkCheck());
        }

        // M5: the PDF galley in OJS's PDF.js viewer
        if (galleyId) {
            await page.goto(app.url(`/index.php/${app.contextPath}/article/view/${sub}/${galleyId}`));
            const viewer = page.frameLocator('iframe').first();
            await expect(viewer.locator('.textLayer').first()).toBeAttached({timeout: T}).catch(() => {});
            await page.waitForTimeout(4000);
            const text = await viewer.locator('.textLayer').first().innerText().catch((e) => 'ERR ' + e.message);
            fact('M5 PDF.js text layer', flat(text, 600));
            await viewer.locator('.page').first().screenshot({path: shot('M5-pdf-page')}).catch(async () => page.screenshot({path: shot('M5-pdf-page')}));
        }
    } finally {
        record(`math-${side}`, facts);
        await close();
    }
});
