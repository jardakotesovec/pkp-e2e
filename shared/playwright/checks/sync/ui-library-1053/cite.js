// PR review pkp/pkp-lib#13767 (ui-library#1053, pkp-lib#13776, ojs#6060): the Body Text's in-text citations
// linked to a references section in "Export to HTML", "Preview: PDF" and "Create PDF". OJS only (no Body Text
// on OMP and OPS). A tagged submission in Production in `publicknowledge` with three references
// (Alpha, Beta, Gamma, Delta), as `manager.maya`:
//   C1 two paragraphs typed; Beta dragged into the first, Delta into the second; "Save"; the editor's citations
//   C2 the saved document PUT back with a third paragraph citing Beta and Delta at once; the page reloaded
//   (Alpha and Gamma stay uncited; a decoy submission seeded first makes the reference ids differ from the list numbers)
//   C3 "Export" › "Export to HTML": the stored galley's citations, links and references section
//   C4 "Export" › "Preview: PDF": the preview's citations and references; "Create PDF": internal links in the file
//   C5 Delta deleted on "References" (the citations to it stay in the text); "Export to HTML" and "Preview: PDF"
// Run: PROBE_FEATURE=pr-13767 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
// At the base (ui-library 55ec62ee) C3–C5 show what the export did before: no links, the editor's own markers.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir, tag} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const REFS = ['Alpha, A. (2020). First reference.', 'Beta, B. (2021). Second reference.', 'Gamma, G. (2022). Third reference.', 'Delta, D. (2023). Fourth reference.'];
const zlib = require('zlib');
/** Every stream of a PDF inflated where it is Flate, joined with the raw bytes (object streams hold the annotations). */
const pdfText = (buf) => {
    const raw = buf.toString('latin1');
    const parts = [raw];
    const re = /stream\r?\n/g;
    let m;
    while ((m = re.exec(raw))) {
        const start = m.index + m[0].length;
        const end = raw.indexOf('endstream', start);
        if (end < 0) break;
        try { parts.push(zlib.inflateSync(buf.subarray(start, end), {finishFlush: zlib.constants.Z_SYNC_FLUSH}).toString('latin1')); } catch { /* not Flate */ }
        re.lastIndex = end + 'endstream'.length;
    }
    return parts.join('\n');
};

forEachApp(async (app) => {
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const fact = (k, v) => {
        record(`${side}-${k.split(' ')[0]}`, v);
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 2400)}`);
    };
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const t = tag('pr13767');
    // a first submission takes the low reference ids, so the driven one's ids differ from its list numbers
    await app.api.createSubmission({tag: `${t}x`, context: app.contextPath, submitter: 'author.alex', title: `Decoy ${t}`, citationsRaw: ['Decoy one.', 'Decoy two.', 'Decoy three.', 'Decoy four.', 'Decoy five.']});
    const s = await app.api.createSubmission({tag: t, context: app.contextPath, submitter: 'author.alex', title: `Citations ${t}`,
        citationsRaw: REFS, files: [{file: 'article.docx'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction']});
    const sub = s.submissionId;
    const publicationId = Number(String(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`)).trim());
    const refRows = String(sql(app, `select citation_id || '|' || seq || '|' || raw_citation from citations where publication_id = ${publicationId} order by seq`)).trim().split('\n');
    const refs = refRows.map((r) => { const [id, seq, raw] = r.split('|'); return {id, seq: Number(seq), raw}; });
    fact('C0 seed', {submission: sub, publication: publicationId, refs});
    const idOf = (prefix) => refs.find((r) => r.raw.startsWith(prefix)).id;

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
    const api = app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/bodyText`);
    const galleyFile = (label) => {
        const rel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} and g.label = '${label}' order by g.galley_id desc limit 1`)).trim();
        return rel ? path.join(filesDir, rel) : null;
    };
    const readStructure = (root) => {
        const cites = [...root.querySelectorAll('cite')].map((c) => ({
            text: c.textContent, html: c.innerHTML.slice(0, 300), next: c.nextElementSibling?.className === 'body-text-citation-targets' ? c.nextElementSibling.outerHTML.slice(0, 400) : null}));
        const refsSection = root.querySelector('.body-text-references, section[aria-label]');
        const anchors = [...root.querySelectorAll('a[href^="#"]')].map((a) => ({href: a.getAttribute('href'), label: a.getAttribute('aria-label'), text: a.textContent,
            targetExists: !!root.querySelector(`[id="${decodeURIComponent(a.getAttribute('href').slice(1))}"]`)}));
        const entries = [...root.querySelectorAll('[data-type="reference"]')].map((e) => ({tag: e.tagName, id: e.id, refId: e.getAttribute('data-ref-id'), text: e.textContent}));
        return {cites, anchors, entries, section: refsSection ? refsSection.outerHTML.slice(0, 1200) : null,
            text: (root.innerText || root.textContent).replace(/\s+/g, ' ').trim().slice(0, 1500)};
    };
    try {
        await signIn(page, 'manager.maya');
        const frame = new WorkflowPage(page, app.contextPath);
        const body = new BodyTextPage(page, frame);
        await body.open(sub, publicationId);

        // C1: two paragraphs, two dragged citations, Save
        await body.typeAtEnd('First sentence cites Beta.');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Second sentence cites Delta.');
        const items = body.referenceItems();
        await expect(items).toHaveCount(4, {timeout: T});
        fact('C1 the list', (await items.allInnerTexts()).map((x) => flat(x, 160)));
        await body.dragReference(items.nth(1), body.paragraphs().nth(0));
        await page.waitForTimeout(500);
        await body.dragReference(items.nth(3), body.paragraphs().nth(1));
        await page.waitForTimeout(500);
        const cites = await body.citations().evaluateAll((cs) => cs.map((c) => ({text: c.textContent, source: c.getAttribute('data-source')})));
        fact('C1 editor citations', cites);
        await page.screenshot({path: shot('C1-editor')});
        fact('C1 save', (await body.save()).status());

        // C2: grouped citation and a non-numeric one, through the document
        const getDoc = await page.evaluate(async (url) => (await fetch(url)).json(), api);
        const doc = typeof getDoc.bodyTextContent === 'string' ? JSON.parse(getDoc.bodyTextContent) : getDoc.bodyTextContent;
        const src = (ids) => encodeURIComponent(JSON.stringify(ids.map((id) => ({id}))));
        const beta = idOf('Beta'), delta = idOf('Delta');
        doc.content.push({type: 'paragraph', content: [{type: 'text', text: 'Third sentence cites both '},
            {type: 'citation', attrs: {source: src([beta, delta])}, content: [{type: 'text', text: `[${beta}, ${delta}]`}]}, {type: 'text', text: '.'}]});
        fact('C2 sources as the editor wrote them', cites.map((c) => decodeURIComponent(c.source || '')));
        const put = await page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: api, serialized: JSON.stringify(doc)});
        fact('C2 PUT', put);
        await body.reload();
        fact('C2 editor citations after reload', await body.citations().evaluateAll((cs) => cs.map((c) => c.textContent)));
        await body.root().screenshot({path: shot('C2-editor')});

        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        const exportHTML = async () => {
            const sent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
            await exportButton.click();
            await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
            const r = await sent;
            await page.waitForTimeout(1000);
            const err = frame.errorDialog();
            const error = (await err.isVisible().catch(() => false)) ? flat(await err.innerText(), 400) : null;
            return {status: r && r.status(), error};
        };

        // C3: Export to HTML
        fact('C3 export', await exportHTML());
        const htmlPath = galleyFile('HTML');
        if (htmlPath) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            fs.writeFileSync(path.join(outDir(), `${side}-C3-galley.html`), html);
            const view = await page.context().newPage();
            await view.setContent(html);
            fact('C3 galley structure', await view.evaluate((fn) => new Function('root', `return (${fn})(root)`)(document.body), readStructure.toString()));
            await view.screenshot({path: shot('C3-galley'), fullPage: true});
            // follow the first link
            const first = view.locator('a[href^="#"]').first();
            if (await first.count()) {
                await view.setViewportSize({width: 800, height: 200});
                await first.click();
                fact('C3 after following the first link', {hash: await view.evaluate(() => location.hash), target: await view.evaluate(() => {
                    const el = document.getElementById(decodeURIComponent(location.hash.slice(1)));
                    return el ? {text: el.textContent.slice(0, 80), top: Math.round(el.getBoundingClientRect().top)} : null; })});
            }
            await view.close();
        }

        // C4: Preview: PDF, then Create PDF
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        const section = page.locator('section').filter({has: page.getByRole('button', {name: 'Create PDF'})}).last();
        await expect(section.locator('iframe[srcdoc]')).toBeVisible({timeout: T});
        const preview = page.frameLocator('section iframe[srcdoc]');
        await expect(preview.locator('article')).toBeVisible({timeout: T});
        await page.waitForTimeout(2000);
        fact('C4 preview structure', await preview.locator('body').evaluate((b, fn) => new Function('root', `return (${fn})(root)`)(b), readStructure.toString()));
        await section.locator('iframe[srcdoc]').screenshot({path: shot('C4-preview')});
        const sent = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000}).catch(() => null);
        await page.getByRole('button', {name: 'Create PDF'}).click();
        const rp = await sent;
        await page.waitForTimeout(1500);
        const pdfPath = galleyFile('PDF');
        const pdf = pdfPath ? fs.readFileSync(pdfPath) : null;
        if (pdf) fs.writeFileSync(path.join(outDir(), `${side}-C4-generated.pdf`), pdf);
        const latin = pdf ? pdfText(pdf) : '';
        fact('C4 Create PDF', {status: rp && rp.status(), size: pdf && pdf.length, links: (latin.match(/\/Subtype\s*\/Link/g) || []).length,
            goTo: (latin.match(/\/S\s*\/GoTo/g) || []).length, dests: (latin.match(/\/Dest\b/g) || []).length, uri: (latin.match(/\/URI\s*\(/g) || []).length,
            namedDests: (latin.match(/\/Dests\b|\/Names\s*<</g) || []).length, compressed: /\/ObjStm/.test(latin)});
        await section.locator('header button').first().click();
        await expect(exportButton).toBeVisible({timeout: T});

        // C5: delete Delta on "References" (as its "Delete" does); the citations to it stay
        const del = await page.evaluate(async (url) => {
            const r = await fetch(url, {method: 'DELETE', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken}});
            return r.status;
        }, app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/citations/${delta}`));
        fact('C5 DELETE Delta', {status: del, left: String(sql(app, `select count(*) from citations where publication_id = ${publicationId}`)).trim()});
        await body.reload();
        fact('C5 list and citations', {list: (await body.referenceItems().allInnerTexts()).map((x) => flat(x, 80)),
            cites: await body.citations().evaluateAll((cs) => cs.map((c) => c.textContent))});
        const before = galleyFile('HTML') && fs.statSync(galleyFile('HTML')).size;
        fact('C5 export to HTML', await exportHTML());
        await page.screenshot({path: shot('C5-export-error')});
        if (await frame.errorDialog().isVisible().catch(() => false)) await frame.dismissErrorDialog();
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        await page.waitForTimeout(2000);
        fact('C5 preview', {error: (await frame.errorDialog().isVisible().catch(() => false)) ? flat(await frame.errorDialog().innerText(), 300) : null,
            previewOpen: await page.locator('section iframe[srcdoc]').count(), galleySizeBefore: before});
        await page.screenshot({path: shot('C5-preview-error')});
        fact('C dialogs', dialogs);
    } finally {
        await close();
    }
});
