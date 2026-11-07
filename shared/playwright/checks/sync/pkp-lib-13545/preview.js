// PR review pkp/pkp-lib#13543, round 6: ui-library#1021's e5952751 ("Adjust the preview UI for PDF viewport
// height") and the rebase onto pkp-lib#13714 (MathJax's fonts self-hosted; the rebase merged its loader paths
// into the PR's MathJax setup in useBodyTextEditor.js). Third-party hosts are blocked, so an asset that loads
// only from a CDN fails visibly. On OJS's dataset fleet freshly reset to PKP's default test dataset; runs at
// round 5's heads (r5) as the control. As `dbarnes`, a Production submission with no galleys:
//   P0 its "Body Text": a line typed, "Save"; the document PUT back with an inline and a display equation,
//      one whose glyphs MathJax loads on demand (fraktur, script, double-struck),
//      and 30 paragraphs (longer than one A4 page); the page reloaded
//   P1 before the preview: the panel's heading and the version controls bar
//   P2 "Export" › "Preview: PDF": the heading (hidden visually, still a heading for assistive technology?),
//      the controls bar, the paper's size and type, "Create PDF" inside the window without scrolling,
//      the preview's equations, MathJax font requests and blocked third-party requests
//   P3 the same preview 900 px wide
//   P4 "Create PDF": the save, the PDF's bytes (image and form XObjects), the PDF in OJS's PDF.js viewer
//   P5 Back: heading and controls again
//   P6 the preview again, then side menu "Galleys" while it is open: heading and controls on Galleys
// Run: PROBE_FEATURE=pr-13543 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const INLINE = 'x^2 + y^3 = \\sqrt{16}';
const DISPLAY = '\\int_0^1 t^2\\,dt = \\frac{1}{3}';
// glyphs outside MathJax's base font data, loaded on demand from loader.paths.fonts (pkp-lib#13714)
const DYNAMIC = '\\mathfrak{A} + \\mathscr{L} \\in \\mathbb{R}';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('preview.js runs on a dataset fleet (fleet-prep --dataset)');
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
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const {page, close} = await launch(app);
    const blocked = [];
    const fontRequests = [];
    const local = new URL(app.baseURL).host;
    await page.context().route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (/^(https?|wss?):$/.test(u.protocol) && u.host !== local) {
            blocked.push(flat(u.href, 140));
            return route.abort();
        }
        return route.continue();
    });
    page.on('request', (r) => { if (/mathjax/i.test(r.url())) fontRequests.push(flat(r.url().replace(app.baseURL, ''), 120)); });
    try {
        await signIn(page, 'dbarnes');
        const sub = Number(String(sql(app, `select s.submission_id from submissions s where s.stage_id = 5 and s.status = 1
            and s.submission_id not in (5, 9, 17) and not exists (select 1 from publication_galleys g where g.publication_id = s.current_publication_id)
            order by s.submission_id limit 1`)).trim());
        const publicationId = Number(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`));
        fact('P0 submission', {submission: sub, publication: publicationId});
        const frame = new WorkflowPage(page, app.contextPath);
        const body = new BodyTextPage(page, frame);
        await body.open(sub, publicationId);
        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        if (!(await exportButton.count())) { fact('P0 "Export" buttons', 0); return; }

        // P0: save once, then PUT the document back with equations and a long text
        await body.typeAtEnd('pr13543 round 6: the preview layout');
        fact('P0 save', (await body.save()).status());
        const bodyRel = String(sql(app, `select f.path from submission_files sf join files f on f.file_id = sf.file_id
            where sf.assoc_type = 1048588 and sf.assoc_id = ${publicationId} order by sf.submission_file_id desc limit 1`)).trim();
        const doc = JSON.parse(fs.readFileSync(path.join(filesDir, bodyRel), 'utf8'));
        doc.content.push({type: 'paragraph', content: [
            {type: 'text', text: 'Inline equation '}, {type: 'math', attrs: {tex: INLINE, style: 'inline'}}, {type: 'text', text: ' ends here.'}]});
        doc.content.push({type: 'paragraph', content: [{type: 'math', attrs: {tex: DISPLAY, style: 'display'}}]});
        doc.content.push({type: 'paragraph', content: [{type: 'text', text: 'Dynamic fonts '}, {type: 'math', attrs: {tex: DYNAMIC, style: 'inline'}}, {type: 'text', text: ' end.'}]});
        for (let i = 1; i <= 30; i++) {
            doc.content.push({type: 'paragraph', content: [{type: 'text', text: `Paragraph ${i}. ` + 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(2)}]});
        }
        doc.content.push({type: 'paragraph', content: [{type: 'text', text: 'LAST PARAGRAPH MARKER'}]});
        const put = await page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/bodyText`), serialized: JSON.stringify(doc)});
        fact('P0 PUT the long document', put);
        await body.open(sub, publicationId);
        await page.waitForTimeout(3000);
        fact('P0 editor equations', {svgs: await page.locator('sciflow-editor svg').count()});

        // the panel's heading and the version controls bar
        const layout = async () => page.evaluate(() => {
            const h = [...document.querySelectorAll('h2')].find((e) => /sr-only|text-3xl-bold/.test(e.parentElement?.className || ''));
            const r = h && h.getBoundingClientRect();
            const ctl = document.querySelector('[data-cy="workflow-controls-left"]');
            return {heading: h ? h.textContent.trim() : null, headingWrapper: h ? h.parentElement.className : null,
                headingBox: r ? [Math.round(r.width), Math.round(r.height)] : null, controlsBar: !!ctl,
                primaryClass: document.querySelector('[data-cy="workflow-primary-items"]')?.className};
        });
        const a11yHeading = async (name) => page.getByRole('heading', {name, exact: true}).count();
        const l1 = await layout();
        fact('P1 before the preview', {...l1, headingInA11yTree: l1.heading ? await a11yHeading(l1.heading) : null});
        await page.screenshot({path: shot('P1-editor')});

        // P2: the preview
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        const section = page.locator('section').filter({has: page.getByRole('button', {name: 'Create PDF'})}).last();
        const previewFrame = section.locator('iframe[srcdoc]');
        await expect(previewFrame).toBeVisible({timeout: T});
        const preview = page.frameLocator('section iframe[srcdoc]');
        await expect(preview.locator('article')).toBeVisible({timeout: T});
        await page.waitForTimeout(3000);
        const l2 = await layout();
        fact('P2 heading and controls in the preview', {...l2, headingInA11yTree: l2.heading ? await a11yHeading(l2.heading) : null,
            previewHeader: flat(await section.locator('header').innerText(), 120)});
        const paper = async () => preview.locator('body').evaluate(() => {
            const p = document.querySelector('.preview-paper') || document.querySelector('article');
            const r = p.getBoundingClientRect();
            const cs = getComputedStyle(p);
            const last = [...document.querySelectorAll('p')].find((e) => /LAST PARAGRAPH MARKER/.test(e.textContent));
            const lr = last && last.getBoundingClientRect();
            return {paperClass: p.className, width: Math.round(r.width), height: Math.round(r.height), ratio: +(r.height / r.width).toFixed(3),
                fontSize: cs.fontSize, aspectRatio: cs.aspectRatio, overflowY: cs.overflowY,
                lastParagraphInsidePaper: lr ? lr.bottom <= r.bottom + 1 : null, viewport: [innerWidth, innerHeight],
                scrollHeight: document.documentElement.scrollHeight,
                mathSvgs: document.querySelectorAll('.body-text-math svg, mjx-container svg').length,
                mathText: [...document.querySelectorAll('.body-text-math, mjx-container')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 3)};
        });
        fact('P2 paper', await paper());
        const box = async (loc) => { const b = await loc.boundingBox(); return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
        const create = page.getByRole('button', {name: 'Create PDF'});
        fact('P2 window and controls', {viewport: page.viewportSize(), iframe: await box(previewFrame), footer: await box(section.locator('footer')),
            createPdf: await box(create), createPdfInViewport: await create.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }),
            back: await box(section.locator('header button').first())});
        await page.screenshot({path: shot('P2-preview')});
        // the dialog's scroll container scrolled to the end: does the footer stay in view?
        await page.evaluate(() => document.querySelectorAll('.pkp-modal-scroll-container, [role="dialog"] *').forEach((e) => { if (e.scrollHeight > e.clientHeight + 10 && getComputedStyle(e).overflowY !== 'visible') e.scrollTop = e.scrollHeight; }));
        await page.waitForTimeout(500);
        fact('P2 scrolled to the end', {createPdf: await box(create), createPdfInViewport: await create.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })});
        await page.screenshot({path: shot('P2-preview-scrolled')});
        fact('P2 MathJax requests', {count: fontRequests.length, fonts: [...new Set(fontRequests)].filter((u) => /font/i.test(u)).slice(0, 8)});
        fact('P2 dynamic-font equation in the preview', await preview.locator('p').filter({hasText: 'Dynamic fonts'}).evaluate((p) => {
            const svg = p.querySelector('svg');
            return svg ? {paths: svg.querySelectorAll('path, use').length, width: Math.round(svg.getBoundingClientRect().width), html: p.innerHTML.length,
                errors: [...p.querySelectorAll('[data-mjx-error], mjx-merror, .mjx-error')].map((e) => e.textContent).slice(0, 2)} : {noSvg: p.textContent.slice(0, 80)};
        }).catch((e) => 'ERR ' + flat(e.message, 100)));
        await previewFrame.screenshot({path: shot('P2-preview-frame')});
        fact('P2 blocked third-party requests', [...new Set(blocked)].slice(0, 10));

        // P3: 900 px wide
        await page.setViewportSize({width: 900, height: 900});
        await page.waitForTimeout(1500);
        fact('P3 paper at 900 px', await paper());
        fact('P3 Create PDF at 900 px', {createPdf: await box(create), createPdfInViewport: await create.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })});
        await page.screenshot({path: shot('P3-preview-900')});
        await page.setViewportSize({width: 1280, height: 900});
        await page.waitForTimeout(1000);

        // P4: Create PDF
        const sent = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000});
        const t0 = Date.now();
        await create.click();
        const rp = await sent.catch(() => null);
        const status = section.locator('footer [role="status"]');
        await expect.poll(async () => flat(await status.innerText()), {timeout: 60_000}).toMatch(/saved|Unable|created/i).catch(() => {});
        await page.waitForTimeout(1500);
        fact('P4 Create PDF', {status: rp && rp.status(), seconds: Math.round((Date.now() - t0) / 1000), statusLine: flat(await status.innerText(), 100),
            pdfShown: await section.locator('iframe[src^="blob:"]').count()});
        await page.screenshot({path: shot('P4-pdf-created')});
        const row = String(sql(app, `select g.galley_id || '|' || f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} and g.label = 'PDF'`)).trim();
        const [galleyId, rel] = row.split('|');
        if (rel) {
            const b = fs.readFileSync(path.join(filesDir, rel));
            fs.writeFileSync(path.join(outDir(), `${side}-P4-generated.pdf`), b);
            const txt = b.toString('latin1');
            fact('P4 PDF file', {galleyId, size: b.length, magic: txt.slice(0, 8), pages: (txt.match(/\/Type\s*\/Page[^s]/g) || []).length,
                images: (txt.match(/\/Subtype\s*\/Image/g) || []).length, forms: (txt.match(/\/Subtype\s*\/Form/g) || []).length});
        }

        // P5: Back
        await section.locator('header button').first().click();
        await expect(exportButton).toBeVisible({timeout: T});
        const l5 = await layout();
        fact('P5 back in the editor', {...l5, headingInA11yTree: l5.heading ? await a11yHeading(l5.heading) : null});

        // P6: the preview again, then "Galleys" from the side menu while it is open
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        await expect(previewFrame).toBeVisible({timeout: T});
        fact('P6 preview open', await layout());
        await frame.selectPage('Galleys').catch((e) => fact('P6 selectPage error', flat(e.message, 200)));
        await page.waitForTimeout(1500);
        const l6 = await layout();
        fact('P6 Galleys after leaving the preview', {...l6, headingInA11yTree: l6.heading ? await a11yHeading(l6.heading) : null});
        await page.screenshot({path: shot('P6-galleys')});

        // the PDF in OJS's PDF.js viewer (its drawn page)
        if (galleyId) {
            await page.goto(app.url(`/index.php/${app.contextPath}/article/view/${sub}/${galleyId}`));
            const viewer = page.frameLocator('iframe').first();
            await expect(viewer.locator('.textLayer').first()).toBeAttached({timeout: T}).catch(() => {});
            await page.waitForTimeout(4000);
            fact('P4 PDF.js text layer, page 1', flat(await viewer.locator('.textLayer').first().innerText().catch((e) => 'ERR ' + e.message), 400));
            fact('P4 PDF.js pages', await viewer.locator('.page').count());
            await viewer.locator('.page').first().screenshot({path: shot('P4-pdf-page1')}).catch(async () => page.screenshot({path: shot('P4-pdf-page1')}));
        }
        fact('P blocked third-party requests, whole walk', [...new Set(blocked)].slice(0, 10));
    } finally {
        record(`preview-${side}`, facts);
        await close();
    }
});
