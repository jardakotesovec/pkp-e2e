// PR review pkp/pkp-lib#13805 (ui-library#1061, pkp-lib#13850, ojs#6102): the PDF made from the Body Text gets
// a metadata header (title, authors with affiliations, journal, issue, pages, DOI, abstract, keywords); the HTML
// export does not. On OJS's dataset fleet freshly reset to PKP's default test dataset.
//   W0 setup, as dbarnes through the API: submission 9 (Production, publication 10) assigned to Vol. 2 No. 1
//      (2015), pages "12-34", keywords; its author given an affiliation (SQL); a line typed and saved
//   W1 "Export" › "Preview: PDF": the preview's header (text and HTML), the GET …/bodyText fields
//   W2 "Create PDF": the PDF's text on page 1 (PDF.js from the app's pdfJsViewer plugin)
//   W3 "Export to HTML": the stored HTML galley holds no metadata
//   W4 the title with inline HTML (`<i>Reason</i> Reclaimed`, as the schema allows): the preview's title
//   W5 as gcox (Layout Editor) on submission 5 (publication 6, given the same issue): the issue line, GET issues/2
//   W6 submission 15 (publication 16) switched to French (fr_CA) with a French title: labels and author line
//   W7 the preview at 1280×700 and 1280×450: "Create PDF" inside the window
// Run: npm run fleet-prep -- --feature pr-13805 --dataset --reset --apps ojs
//      PROBE_FEATURE=pr-13805 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs <this file>
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, record, sql, outDir} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset)');
    if (app.name !== 'ojs') return;
    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const {BodyTextPage} = require('../../../pages/JatsBodyTextPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const facts = {app: app.name, side};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 1600)}`);
    };
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const api = (p) => app.url(`/index.php/${app.contextPath}/api/v1/${p}`);
    const call = (page, method, p, body) => page.evaluate(async ({url, method, body}) => {
        const r = await fetch(url, {method, headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'Content-Type': 'application/json'},
            body: body ? JSON.stringify(body) : undefined});
        let j = null; try { j = await r.json(); } catch { /* not json */ }
        return {status: r.status, json: j};
    }, {url: api(p), method, body});

    const {page, close} = await launch(app);
    await page.setViewportSize({width: 1280, height: 900});
    const frame = new WorkflowPage(page, app.contextPath);
    const body = new BodyTextPage(page, frame);
    const exportButton = page.getByRole('button', {name: 'Export', exact: true});
    const section = page.locator('section').filter({has: page.getByRole('button', {name: 'Create PDF'})}).last();
    const preview = page.frameLocator('section iframe[srcdoc]');

    const openPreview = async (sub, pub, tag) => {
        const got = page.waitForResponse((r) => new RegExp(`publications/${pub}/bodyText$`).test(r.url()) && r.request().method() === 'GET', {timeout: T}).catch(() => null);
        await body.open(sub, pub);
        const g = await got;
        let j = null; try { j = g && await g.json(); } catch { /* */ }
        fact(`${tag} GET bodyText extra fields`, j ? {contextName: j.contextName, pdfLabels: j.pdfLabels} : null);
        const issueCalls = [];
        const onResp = (r) => { if (/\/api\/v1\/issues\/\d+/.test(r.url())) issueCalls.push(`${r.request().method()} ${r.url().replace(/.*api\/v1\//, '')} ${r.status()}`); };
        page.on('response', onResp);
        await exportButton.click();
        await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
        await expect(section.locator('iframe[srcdoc]')).toBeVisible({timeout: T});
        await expect(preview.locator('article')).toBeVisible({timeout: T});
        await page.waitForTimeout(1500);
        page.off('response', onResp);
        fact(`${tag} issue requests`, issueCalls);
        const meta = await preview.locator('body').evaluate(() => {
            const h = document.querySelector('.publication-pdf-metadata');
            return h ? {text: h.innerText, html: h.innerHTML} : {none: document.body.innerText.slice(0, 300)};
        });
        fact(`${tag} preview header text`, meta.text != null ? meta.text.split('\n').map((s) => s.trim()).filter(Boolean) : meta);
        fact(`${tag} preview header html`, flat(meta.html, 1500));
        await page.screenshot({path: shot(`${tag}-preview`)});
        return meta;
    };
    const backToEditor = async () => {
        await section.locator('header button').first().click();
        await expect(exportButton).toBeVisible({timeout: T});
    };
    const pdfText = async (rel) => {
        const b64 = fs.readFileSync(path.join(filesDir, rel)).toString('base64');
        return page.evaluate(async ({b64, base}) => {
            const pdfjs = await import(`${base}/plugins/generic/pdfJsViewer/pdf.js/build/pdf.mjs`);
            pdfjs.GlobalWorkerOptions.workerSrc = `${base}/plugins/generic/pdfJsViewer/pdf.js/build/pdf.worker.mjs`;
            const data = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const doc = await pdfjs.getDocument({data}).promise;
            const p = await doc.getPage(1);
            const c = await p.getTextContent();
            const lines = [];
            let cur = '';
            for (const it of c.items) { cur += it.str; if (it.hasEOL) { lines.push(cur.trim()); cur = ''; } }
            if (cur.trim()) lines.push(cur.trim());
            return {pages: doc.numPages, lines: lines.filter(Boolean).slice(0, 25)};
        }, {b64, base: app.baseURL.replace(/\/$/, '')});
    };

    try {
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));

        // W0 setup
        fact('W0 PUT publication 10', (await call(page, 'PUT', 'submissions/9/publications/10', {
            issueId: 2, pages: '12-34',
            keywords: {en: [{name: 'Argumentation'}, {name: 'Reason & logic'}]},
        })).status);
        const aff = sql(app, `insert into author_affiliations (author_id) values (17) returning author_affiliation_id`);
        const affId = Number(String(aff).trim().split('\n')[0]);
        sql(app, `insert into author_affiliation_settings (author_affiliation_id, locale, setting_name, setting_value) values (${affId}, 'en', 'name', 'University of Siena')`);
        const pub10 = await call(page, 'GET', 'submissions/9/publications/10');
        fact('W0 publication 10', {issueId: pub10.json?.issueId, pages: pub10.json?.pages, keywords: pub10.json?.keywords, fullTitle: pub10.json?.fullTitle,
            authors: (pub10.json?.authors || []).map((a) => ({given: a.givenName, family: a.familyName, aff: a.affiliations, type: a.contributorType, submissionLocale: a.submissionLocale})),
            abstract: flat(pub10.json?.abstract?.en, 120), doiObject: pub10.json?.doiObject, hideAuthor: pub10.json?.hideAuthor});
        await body.open(9, 10);
        await body.typeAtEnd('pr13805 body sentence.');
        fact('W0 save', (await body.save()).status());

        // W1 preview
        await openPreview(9, 10, 'W1');

        // W2 Create PDF
        const create = page.getByRole('button', {name: 'Create PDF'});
        const sent = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000});
        await create.click();
        const rp = await sent.catch(() => null);
        await page.waitForTimeout(1500);
        fact('W2 Create PDF', {status: rp && rp.status(), statusLine: flat(await section.locator('footer [role="status"]').innerText().catch(() => null), 100)});
        const pdfRel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = 10 and g.label = 'PDF'`)).trim();
        if (pdfRel) {
            fs.copyFileSync(path.join(filesDir, pdfRel), path.join(outDir(), `${side}-W2.pdf`));
            fact('W2 PDF page 1 text', await pdfText(pdfRel).catch((e) => 'ERR ' + flat(e.message, 200)));
        }
        await backToEditor();

        // W3 Export to HTML
        await exportButton.click();
        const hsent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000});
        await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
        const hr = await hsent.catch(() => null);
        await page.waitForTimeout(1000);
        const htmlRel = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = 10 and g.label = 'HTML'`)).trim();
        const html = htmlRel ? fs.readFileSync(path.join(filesDir, htmlRel), 'utf8') : '';
        fact('W3 Export to HTML', {status: hr && hr.status(), size: html.length, hasMetadataHeader: /publication-pdf/.test(html),
            hasTitle: /Reason Reclaimed/.test(html), hasAbstractHeading: />Abstract</.test(html), hasJournal: /Journal of Public Knowledge/.test(html), head: flat(html, 300)});

        // W4 title with inline HTML
        fact('W4 PUT title', (await call(page, 'PUT', 'submissions/9/publications/10', {title: {en: '<i>Reason</i> Reclaimed'}})).status);
        const t4 = await call(page, 'GET', 'submissions/9/publications/10');
        fact('W4 fullTitle in the API', t4.json?.fullTitle);
        await openPreview(9, 10, 'W4');
        fact('W4 title element', await preview.locator('.publication-pdf-title').evaluate((e) => ({text: e.textContent, html: e.innerHTML})).catch(() => null));
        const sent4 = page.waitForResponse((r) => /\/bodyText\/pdf$/.test(r.url()) && r.request().method() === 'POST', {timeout: 180_000});
        await create.click();
        fact('W4 Create PDF', (await sent4.catch(() => null))?.status());
        await page.waitForTimeout(1500);
        const pdfRel4 = String(sql(app, `select f.path from publication_galleys g join submission_files sf on sf.submission_file_id = g.submission_file_id
            join files f on f.file_id = sf.file_id where g.publication_id = 10 and g.label = 'PDF'`)).trim();
        if (pdfRel4) {
            fs.copyFileSync(path.join(filesDir, pdfRel4), path.join(outDir(), `${side}-W4.pdf`));
            fact('W4 PDF page 1 text', await pdfText(pdfRel4).catch((e) => 'ERR ' + flat(e.message, 200)));
        }
        await backToEditor();
        await page.goto(app.url(`/index.php/${app.contextPath}/workflow/access/9`)).catch(() => {});

        // W5 Layout Editor on submission 5, same issue
        fact('W5 PUT publication 6', (await call(page, 'PUT', 'submissions/5/publications/6', {issueId: 2, pages: '1-9'})).status);
        await signOut(page);
        await signIn(page, 'gcox');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        fact('W5 GET issues/2 as gcox', (await call(page, 'GET', 'issues/2')).status);
        await openPreview(5, 6, 'W5');
        await backToEditor();
        await signOut(page);

        // W6 French-language submission 15
        sql(app, `update submissions set locale = 'fr_CA' where submission_id = 15`);
        sql(app, `insert into publication_settings (publication_id, locale, setting_name, setting_value) values (16, 'fr_CA', 'title', 'Les maladies de l''igname')`);
        await signIn(page, 'dbarnes');
        await page.goto(app.url(`/index.php/${app.contextPath}/submissions`));
        fact('W6 PUT publication 16', (await call(page, 'PUT', 'submissions/15/publications/16', {issueId: 2, pages: '5-8',
            keywords: {fr_CA: [{name: 'igname'}]}})).status);
        await openPreview(15, 16, 'W6');
        await backToEditor();

        // W7 short windows
        for (const h of [700, 450]) {
            await page.setViewportSize({width: 1280, height: h});
            await body.open(9, 10);
            await exportButton.click();
            await page.getByRole('menuitem', {name: 'Preview: PDF'}).click();
            await expect(section.locator('iframe[srcdoc]')).toBeVisible({timeout: T});
            await page.waitForTimeout(1500);
            const box = async (l) => { const b = await l.boundingBox().catch(() => null); return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; };
            fact(`W7 ${h}px`, {iframe: await box(section.locator('iframe[srcdoc]')), createPdf: await box(create),
                createInViewport: await create.evaluate((e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }).catch(() => null)});
            await page.screenshot({path: shot(`W7-${h}`)});
            await backToEditor();
        }
    } finally {
        record(`walk-${side}`, facts);
        await close();
    }
});
