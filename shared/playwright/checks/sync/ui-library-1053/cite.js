// PR review pkp/pkp-lib#13767 (ui-library#1053, pkp-lib#13776, ojs#6060): the Body Text's in-text citations
// linked to a references section in "Export to HTML", "Preview: PDF" and "Create PDF". OJS only (no Body Text
// on OMP and OPS). A tagged submission in Production in `publicknowledge` with three references
// (Alpha, Beta, Gamma, Delta), as `manager.maya`:
//   C1 two paragraphs typed; Beta dragged into the first, Delta into the second; "Save"; the editor's citations
//   C2 the saved document PUT back with a third paragraph citing Beta and Delta at once, and a fourth whose citation
//      to Beta reads "(2021)" (a year typed over the marker); the page reloaded
//   (Alpha and Gamma stay uncited; a decoy submission seeded first makes the reference ids differ from the list numbers)
//   C3 "Export" › "Export to HTML": the stored galley's citations, links and references section
//   C4 "Export" › "Preview: PDF": the preview's citations and references; "Create PDF": internal links in the file
//   C5 Delta deleted on "References" (the citations to it stay in the text); "Export to HTML" and "Preview: PDF"
// Round 2 (ui-library 2e7ac2b537): the markers read [2], [4], [2, 4], the list is numbered "2. ", "4. ", and this
// "(2021)" (written in as `generated`) is still exported "(2)" (so in round 3 too: a stored document, not an edit).
// Round 1 at aa2485f872. With fix3.diff (round 3, bin/try-fix.js): R3 "[4, p. 5]", R4 "[1] More text 2020.".
// Run: PROBE_FEATURE=pr-13767 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
// At the base (ui-library 55ec62ee) C3–C5 show what the export did before: no links, the editor's own markers.
// Round 3 (heads ui-library 823859b421, pkp-lib c42f9d3412, ojs 85211820ad): R1–R5, after C1's save, make citations on
// screen in five seeded paragraphs: R1 "(2021)" set in "Selected Element"; R2 Gamma dropped onto a typed "(2022)";
// R3 "[id, p. 5]" set in "Selected Element"; R4 Alpha dropped at a sentence's end, then End and " More text 2020." typed;
// R5 Alpha dropped onto a custom "(2021)" (SciFlow merges). Exported at the round-3 heads: "(2021)", "(2022)",
// "[id, p. 5]" (the database id), R4 typed into the citation and exported with the id, R5 "(2; 1)".
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
        // Round 2 (ui-library 2e7ac2b5, 823859b4: citationMode "custom" on a "Selected Element" text edit and on a drop
        // that wraps text). R1–R5 add paragraphs 3–7 before the save; C2's paragraphs follow them.
        const citeState = () => body.citations().evaluateAll((cs) => cs.map((c) => ({text: c.textContent,
            mode: c.getAttribute('data-citation-mode'), ids: (() => { try { return JSON.parse(decodeURIComponent(c.getAttribute('data-source') || '')).map((i) => i.id); } catch { return null; } })()})));
        // a click on the last paragraph's first letters (body.focusEnd() clicks the editor's middle, which can select a citation)
        const putDoc = (d) => page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: api, serialized: JSON.stringify(d)});
        const newParagraph = async (text) => {
            const last = await body.paragraphs().last().boundingBox();
            await page.mouse.click(last.x + 4, last.y + last.height / 2);
            await page.keyboard.press('ControlOrMeta+End');
            await page.keyboard.press('Enter'); await page.keyboard.type(text); await page.waitForTimeout(300);
        };
        const editInSelectedElement = async (cite, text) => {
            if (!(await cite.count())) return {missing: true, cites: await citeState()};
            await cite.click({timeout: 10_000}).catch(async (e) => { await page.screenshot({path: shot('R-click-failed')}); throw e; });
            await page.waitForTimeout(600);
            const sel = page.locator('details').filter({has: page.locator('summary', {hasText: 'Selected Element'})}).first();
            if (await sel.count() && (await sel.getAttribute('open')) === null) { await sel.locator('summary').first().click(); await page.waitForTimeout(600); }
            const content = page.locator('#citation-content [contenteditable], #citation-content').first();
            if (!(await content.isVisible().catch(() => false))) return 'no In-text citation field';
            await content.click();
            await page.keyboard.press('ControlOrMeta+A');
            await page.keyboard.type(text);
            await page.getByRole('button', {name: 'Update', exact: true}).first().click();
            await page.waitForTimeout(800);
            // fold "Selected Element" again and put a text caret in the first paragraph, so the reference list is back
            // on screen and the next drag starts from a reference, not from a page-wide text selection
            if ((await sel.getAttribute('open')) !== null) await sel.locator('summary').first().click();
            const p0 = await body.paragraphs().first().boundingBox();
            await page.mouse.click(p0.x + 4, p0.y + p0.height / 2);
            await page.waitForTimeout(400);
            return 'updated';
        };
        // drag a listed reference onto a substring of paragraph n (SciFlow wraps the word or (…)/[…] under the drop)
        const dragOntoText = async (item, n, needle) => {
            await item.scrollIntoViewIfNeeded();
            await body.paragraphs().nth(n).scrollIntoViewIfNeeded();
            const pt = await body.paragraphs().nth(n).evaluate((p, needle) => {
                const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
                for (let t = w.nextNode(); t; t = w.nextNode()) {
                    const i = t.data.indexOf(needle);
                    if (i < 0) continue;
                    const r = document.createRange(); r.setStart(t, i + 1); r.setEnd(t, i + needle.length - 1);
                    const b = r.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2};
                }
                return null;
            }, needle);
            if (!pt) return 'needle not found';
            const from = await item.boundingBox();
            await page.mouse.move(from.x + 20, from.y + from.height / 2);
            await page.mouse.down();
            await page.mouse.move(from.x + 30, from.y + from.height / 2, {steps: 3});
            await page.mouse.move(pt.x, pt.y, {steps: 15});
            await page.mouse.up();
            await page.waitForTimeout(600);
            return 'dropped';
        };
        const nth = (i) => body.paragraphs().nth(i).locator('cite').first();
        // a reference's drag and drop as DOM events in the page (dragstart on the reference, dragover and drop on the
        // editor at a point), through the editor's own drop handler and the PR's adapter; `at` is 'end' of paragraph
        // n, a substring of it, or 'cite' (the middle of its first citation). The mouse drags of dragReference() miss
        // once "Selected Element" has opened and shifted the side panel.
        const synthDrag = async (refIndex, n, at) => {
            const item = body.referenceItems().nth(refIndex);
            const para = body.paragraphs().nth(n);
            await para.scrollIntoViewIfNeeded();
            const pt = await para.evaluate((p, at) => {
                let r = document.createRange();
                if (at === 'cite') { const c = p.querySelector('cite'); if (!c) return null; const b = c.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; }
                const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
                let last = null;
                for (let t = w.nextNode(); t; t = w.nextNode()) {
                    if (at !== 'end') { const i = t.data.indexOf(at); if (i >= 0) { r.setStart(t, i + 1); r.setEnd(t, i + at.length - 1); const b = r.getBoundingClientRect(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; } }
                    last = t;
                }
                if (at !== 'end' || !last) return null;
                r.setStart(last, last.data.length - 1); r.setEnd(last, last.data.length);
                const b = r.getBoundingClientRect(); return {x: b.right + 1, y: b.y + b.height / 2};
            }, at);
            if (!pt) return 'no drop point';
            return item.evaluate((el, pt) => {
                const src = el.querySelector('[draggable="true"]') || el.closest('[draggable="true"]') || el;
                const dt = new DataTransfer();
                const ev = (type, target, extra = {}) => target.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, composed: true, dataTransfer: dt, ...extra}));
                ev('dragstart', src);
                const target = document.elementFromPoint(pt.x, pt.y);
                if (!target) return 'nothing at the point';
                ev('dragenter', target, {clientX: pt.x, clientY: pt.y});
                ev('dragover', target, {clientX: pt.x, clientY: pt.y});
                const handled = !ev('drop', target, {clientX: pt.x, clientY: pt.y});
                ev('dragend', src);
                return {types: [...dt.types], target: target.tagName + (target.className ? '.' + String(target.className).split(' ')[0] : ''), handled};
            }, pt);
        };
        // the five paragraphs as plain text through the document (typing them in a row scrambles the editor's text);
        // the citations are then made on screen
        {
            const got = await page.evaluate(async (url) => (await fetch(url)).json(), api);
            const d = typeof got.bodyTextContent === 'string' ? JSON.parse(got.bodyTextContent) : got.bodyTextContent;
            for (const text of ['R1 Selected Element year: Beta.', 'R2 dropped on text: Gamma (2022) says so.', 'R3 Selected Element page: Delta.',
                'R4 typed inline: Alpha.', 'R5 merged onto custom: Beta.']) d.content.push({type: 'paragraph', content: [{type: 'text', text}]});
            fact('R PUT', await putDoc(d));
            await body.reload();
        }
        fact('R paragraphs', await body.paragraphs().allInnerTexts());
        // R1: Beta cited at the end of p3, its text set to "(2021)" in "Selected Element" (the reader's S2, on screen)
        fact('R1 drop', await synthDrag(1, 2, 'end'));
        await page.waitForTimeout(600);
        fact('R1 edit', await editInSelectedElement(nth(2), '(2021)'));
        // R2: Gamma dropped onto the typed "(2022)" in p4 (the wrap path the adapter marks custom)
        const paras = async (k) => fact(k, await body.paragraphs().evaluateAll((ps) => ps.map((p) => p.innerHTML.replace(/<br[^>]*>/g, '').replace(/ data-style="apa"/g, '').slice(0, 300))));
        await paras('R1 paragraphs');
        fact('R2 drop', await synthDrag(2, 3, '(2022)'));
        await paras('R2 paragraphs');
        await page.screenshot({path: shot('R2')});
        // R3: Delta cited at the end of p5, a page added in "Selected Element": the editor's marker kept, "p. 5" after it
        fact('R3 drop', await synthDrag(3, 4, 'end'));
        await page.waitForTimeout(600);
        await paras('R3 paragraphs');
        await page.screenshot({path: shot('R3')});
        const r3text = ((await nth(4).textContent()) || '').replace(/\]\s*$/, ', p. 5]');
        fact('R3 edit', {to: r3text, result: await editInSelectedElement(nth(4), r3text)});
        // R4: Alpha cited at the end of p6, then its digits retyped as a year inside the citation's own text (no panel)
        fact('R4 drop', await synthDrag(0, 5, 'end'));
        await page.waitForTimeout(600);
        // from the keyboard only: a click on the paragraph's first letters, End, and the sentence continued
        // (" More text 2020."), as an editor does after dropping a citation at a sentence's end
        const caret = () => page.evaluate(() => { const s = getSelection(); const n = s.anchorNode; const el = n && (n.nodeType === 3 ? n.parentElement : n);
            return {inCite: !!(el && el.closest('cite')), text: n && n.nodeType === 3 ? n.data : null, offset: s.anchorOffset, collapsed: s.isCollapsed}; });
        const p5 = await body.paragraphs().nth(5).boundingBox();
        await page.mouse.click(p5.x + 4, p5.y + p5.height / 2);
        await page.keyboard.press('End');
        const r4 = {afterEnd: await caret()};
        await page.keyboard.type(' More text 2020.');
        await page.waitForTimeout(300);
        r4.result = await body.paragraphs().nth(5).evaluate((p) => p.innerHTML.replace(/<br[^>]*>/g, '').replace(/ data-style="apa"/g, ''));
        fact('R4 caret', r4);
        await page.waitForTimeout(300);
        // R5: Beta cited at the end of p7, set to "(2021)", then Alpha dragged onto it (SciFlow merges the two)
        fact('R5 drop', await synthDrag(1, 6, 'end'));
        await page.waitForTimeout(600);
        await editInSelectedElement(nth(6), '(2021)');
        fact('R5 merge', await synthDrag(0, 6, 'cite'));
        await page.waitForTimeout(600);
        fact('R editor citations', await citeState());
        fact('R save', (await body.save()).status());
        fact('R paragraphs after', await body.paragraphs().evaluateAll((ps) => ps.map((p) => p.innerHTML.replace(/<br[^>]*>/g, '').slice(0, 300))));
        fact('R editor citations', await citeState());
        await page.screenshot({path: shot('R-editor')});

        // C2: grouped citation and a non-numeric one, through the document
        const getDoc = await page.evaluate(async (url) => (await fetch(url)).json(), api);
        const doc = typeof getDoc.bodyTextContent === 'string' ? JSON.parse(getDoc.bodyTextContent) : getDoc.bodyTextContent;
        const src = (ids) => encodeURIComponent(JSON.stringify(ids.map((id) => ({id}))));
        const beta = idOf('Beta'), delta = idOf('Delta');
        doc.content.push({type: 'paragraph', content: [{type: 'text', text: 'Third sentence cites both '},
            {type: 'citation', attrs: {source: src([beta, delta])}, content: [{type: 'text', text: `[${beta}, ${delta}]`}]}, {type: 'text', text: '.'}]});
        // a year typed over a citation's text (as "Selected Element" › "In-text citation" does), the regression reader's S2
        doc.content.push({type: 'paragraph', content: [{type: 'text', text: 'Fourth sentence: Beta '},
            {type: 'citation', attrs: {source: src([beta])}, content: [{type: 'text', text: '(2021)'}]}, {type: 'text', text: '.'}]});
        fact('C2 sources as the editor wrote them', cites.map((c) => decodeURIComponent(c.source || '')));
        const put = await page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: api, serialized: JSON.stringify(doc)});
        fact('C2 PUT', put);
        await body.reload();
        fact('C2 editor citations after reload', await citeState());
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
