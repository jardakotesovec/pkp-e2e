// PR review pkp/pkp-lib#13767, round 2 (ui-library#1053 2e7ac2b537: a citation whose text is edited through
// "Selected Element" becomes `citationMode: 'custom'`, and the export leaves custom citations alone; the exported
// references are numbered with the version's list numbers). Which ways of writing a year into a citation keep it,
// all through the editor's own UI, as `manager.maya` on a tagged Production submission in `publicknowledge`
// with Alpha, Beta, Gamma and Delta (a decoy submission first, so reference ids differ from list numbers):
//   Y1 "Smith (2021) found yams." typed, Beta dropped onto "(2021)" (SciFlow turns the bracketed text under the
//      drop into a citation that keeps the text, mode "generated")
//   "Jones found more." and "Gamma was typed." typed as two more paragraphs; Delta and Gamma dropped at their ends
//   Y2 Delta's citation clicked, "Selected Element" › "In-text citation" set to "(2023)", "Update" (the PR's path:
//      mode "custom")
//   Y3 Gamma's citation double-clicked and "2022" typed (a double-click selects the whole citation, so the typing
//      replaces it with plain text: no way to edit a citation in place)
//   E1 Save, "Export to HTML": the galley's citations and its references section
//   Y4 Alpha dropped onto Y2's custom citation (SciFlow merges it, rewriting the text to the ids; the mode stays)
//   E2 Save, "Export to HTML" again
// At the round-2 heads (ui-library 2e7ac2b537): E1 "Smith (2) found yams.", "(2023)" kept; E2 "(54; 51)", the
// database ids. With fix2.diff (bin/try-fix.js): "(2021)", "(2023)", then "(4; 1)".
// Round 3 (ui-library 823859b421) fixes both: the same cases are cite.js R2 and R5 there ("(2022)" kept, "(2; 1)");
// fix2.diff was removed then, superseded by fix3.diff.
// Run: PROBE_FEATURE=pr-13767 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, record, sql, outDir, tag} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const REFS = ['Alpha, A. (2020). First reference.', 'Beta, B. (2021). Second reference.', 'Gamma, G. (2022). Third reference.', 'Delta, D. (2023). Fourth reference.'];

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
    const t = tag('pr13767y');
    await app.api.createSubmission({tag: `${t}x`, context: app.contextPath, submitter: 'author.alex', title: `Decoy ${t}`, citationsRaw: ['Decoy one.', 'Decoy two.', 'Decoy three.', 'Decoy four.', 'Decoy five.']});
    const s = await app.api.createSubmission({tag: t, context: app.contextPath, submitter: 'author.alex', title: `Years ${t}`,
        citationsRaw: REFS, files: [{file: 'article.docx'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction']});
    const sub = s.submissionId;
    const publicationId = Number(String(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`)).trim());
    const refs = String(sql(app, `select citation_id || '|' || seq || '|' || raw_citation from citations where publication_id = ${publicationId} order by seq`))
        .trim().split('\n').map((r) => { const [id, seq, raw] = r.split('|'); return {id, seq: Number(seq), raw}; });
    fact('Y0 seed', {submission: sub, publication: publicationId, refs});

    const {page, close} = await launch(app);
    const galleyFile = (label) => {
        const rel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = ${publicationId} and g.label = '${label}' order by g.galley_id desc limit 1`)).trim();
        return rel ? path.join(filesDir, rel) : null;
    };
    try {
        await signIn(page, 'manager.maya');
        const frame = new WorkflowPage(page, app.contextPath);
        const body = new BodyTextPage(page, frame);
        await body.open(sub, publicationId);
        const items = body.referenceItems();
        await expect(items).toHaveCount(4, {timeout: T});
        const cites = () => body.citations().evaluateAll((cs) => cs.map((c) => ({text: c.textContent, mode: c.getAttribute('data-citation-mode') || 'generated'})));
        const dragTo = async (item, where) => {
            await item.scrollIntoViewIfNeeded();
            const box = await where();
            const from = await item.boundingBox();
            await page.mouse.move(from.x + 20, from.y + from.height / 2);
            await page.mouse.down();
            await page.mouse.move(from.x + 30, from.y + from.height / 2, {steps: 3});
            await page.mouse.move(box.x, box.y, {steps: 15});
            await page.mouse.up();
            await page.waitForTimeout(600);
        };
        // the screen point in the middle of `needle` inside the editor's text
        const pointOf = (needle) => body.editor().evaluate((root, n) => {
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const i = node.nodeValue.indexOf(n);
                if (i < 0) continue;
                const r = document.createRange();
                r.setStart(node, i + 1);
                r.setEnd(node, i + n.length - 1);
                const b = r.getBoundingClientRect();
                return {x: b.x + b.width / 2, y: b.y + b.height / 2};
            }
            return null;
        }, needle);

        // Y1: drop onto a typed "(2021)"
        await body.typeAtEnd('Smith (2021) found yams.');
        let y1point;
        await dragTo(items.nth(1), async () => (y1point = await pointOf('(2021)')));
        fact('Y1 after the drop', {point: y1point, cites: await cites(), text: await body.editorText()});
        await body.root().screenshot({path: shot('Y1-editor')});

        // the other two paragraphs typed first, so no typing follows a citation that ends a paragraph
        // (Ctrl+End there puts the caret inside the citation, and the typing lands in its text)
        await body.focusEnd();
        await page.keyboard.press('Enter');
        await page.keyboard.type('Jones found more.');
        await page.keyboard.press('Enter');
        await page.keyboard.type('Gamma was typed.');
        await body.dragReference(items.nth(3), body.paragraphs().nth(1));
        await page.waitForTimeout(600);
        await body.dragReference(items.nth(2), body.paragraphs().nth(2));
        await page.waitForTimeout(600);
        const all = await cites();
        fact('Y2 dropped', all);
        const delta = all[1].text, gamma = all[2].text;

        // Y2: Selected Element › In-text citation › Update
        await body.citations().filter({hasText: delta}).click();
        const sel = body.section('selected-element');
        if (!(await sel.evaluate((d) => d.open))) await sel.locator('summary.sciflow-body-text__sidebar-summary').click();
        const field = sel.locator('.selection-editor-citation-content [contenteditable="true"], .selection-editor-citation-content.ProseMirror, .selection-editor-citation-content .ProseMirror').first();
        await expect(field).toBeVisible({timeout: T});
        fact('Y2 field before', await field.innerText());
        await field.click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type('(2023)');
        await sel.getByRole('button', {name: 'Update'}).click();
        await page.waitForTimeout(600);
        fact('Y2 after Update', await cites());
        await page.screenshot({path: shot('Y2-selected-element')});

        // Y3: type over the number inside the Gamma citation
        const p = await pointOf(gamma);
        await page.mouse.dblclick(p.x, p.y);
        await page.waitForTimeout(300);
        fact('Y3 selection after double-click', await page.evaluate(() => String(window.getSelection())));
        await page.keyboard.type('2022');
        await page.waitForTimeout(400);
        fact('Y3 after typing', await cites());
        await body.root().screenshot({path: shot('Y3-editor')});

        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        const exportHTML = async (label) => {
            fact(`${label} save`, (await body.save()).status());
            const sent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
            await exportButton.click();
            await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
            const r = await sent;
            await page.waitForTimeout(1000);
            const html = fs.readFileSync(galleyFile('HTML'), 'utf8');
            fs.writeFileSync(path.join(outDir(), `${side}-${label}-galley.html`), html);
            const view = await page.context().newPage();
            await view.setContent(html);
            const got = await view.evaluate(() => ({
                cites: [...document.querySelectorAll('cite')].map((c) => ({text: c.textContent, mode: c.getAttribute('data-citation-mode') || 'generated'})),
                paragraphs: [...document.querySelectorAll('p:not([data-type="reference"])')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
                references: [...document.querySelectorAll('[data-type="reference"]')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()),
            }));
            await view.close();
            fact(`${label} galley`, {status: r && r.status(), ...got});
        };
        await exportHTML('E1');

        // Y4: Alpha dropped onto the custom citation
        await body.reload();
        await expect(body.referenceItems()).toHaveCount(4, {timeout: T});
        await dragTo(body.referenceItems().nth(0), async () => {
            const target = await body.citations().filter({hasText: '2023'}).first().boundingBox();
            return {x: target.x + target.width / 2, y: target.y + target.height / 2};
        });
        fact('Y4 after the merge', await cites());
        await exportHTML('E2');
    } finally {
        await close();
    }
});
