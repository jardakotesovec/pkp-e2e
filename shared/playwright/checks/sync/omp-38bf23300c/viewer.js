// pkp/omp 38bf23300c ("Update PDF.js to 6.4.299", for pkp/pkp-lib#13615; stable-3_5_0 twin
// dade65f368): the commit vendors PDF.js 6's `plugins/generic/pdfJsViewer/pdf.js/web/` but no
// `pdf.js/build/`, which OMP's `.gitignore` line 3 (`build`) ignores, so `viewer.html`'s
// `../build/pdf.mjs` answers 404 and the PDF viewer opens empty for every reader.
// Report docs/reports/2026-10-26-omp-38bf23300c.md; ci-triage row K-omp-pdfjs.
//
// Takes the report's Steps, signed out, on a scratch press with one published book ("Shorelines")
// whose "PDF" format holds a free file (article.pdf), as U69 S3 seeds it: the book's page in the
// catalog, its "PDF" link, the PDF view page. Records the status of every request under
// `pdfJsViewer/pdf.js/build/`, the viewer's page count (`#numPages`) and rendered pages, the page
// errors, and an element screenshot of the viewer's frame (`viewer-frame-<run>-omp.png`).
// On 3.5 the seed's `published` key is refused (harness.md "The stable lines") and its format
// approval answers 500: the book is seeded in Production with the format unapproved, and its
// manager approves the format on "Publication Formats" and publishes through the REST API.
//
// Run:   PROBE_FEATURE=sync PROBE_AGENT=<id> node bin/probe.js omp shared/playwright/checks/sync/omp-38bf23300c/viewer.js
//        PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=sync-3_5 in front for 3.5; PROBE_RUN=before|fix
//        names a run with the plugin checked out at 186107aafe, or OJS's `pdf.js/build/` copied in.
// Fixed when the `pdf.js/build/pdf.mjs` request answers 200 and `#numPages` reads "of 1"
// ("of ⁨1⁩" in PDF.js 6), with a page rendered.
// Facts: .reports/<feature>/<id>/facts[-<run>]-omp.json (the run record lists every 404, the outer
// page's `build/pdf.js` and `web/viewer.js` included, which are U69 A23's and not this fault's).
const fs = require('fs');
const {forEachApp, launch, signIn, record, outFile, idle, tag} = require('../../../probe');

const T = 30_000;
const flat = (s, n = 300) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const rel = (u) => String(u).replace(/^https?:\/\/[^/]+/, '');

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const is35 = app.line === 'stable-3_5_0';
    const press = tag('pdfjs');
    const mg = {username: `${press}mg`, givenName: 'Mona', familyName: 'Manager', email: `${press}mg@mail.test`, roles: ['manager']};
    const au = {username: `${press}au`, givenName: 'Ada', familyName: 'Quill', email: `${press}au@mail.test`, roles: ['author']};
    const facts = {app: app.name, line: app.line || 'main', run: process.env.PROBE_RUN || 'head', press};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 1500)}`);
    };
    try {
        await app.api.createContext({tag: press, context: {name: `Tidewater ${press}`}, users: [mg, au]});
        const book = await app.api.createSubmission({
            tag: `${press}b1`,
            context: press,
            submitter: au.username,
            title: 'Shorelines',
            submitted: true,
            decisions: ['skipExternalReview', 'sendToProduction'],
            ...(is35 ? {} : {published: true, datePublished: '2024-03-05'}),
            // On 3.5 the seed's format approval answers 500 (a Smarty resource of the URN plugin
            // the seed's request has not registered): the manager approves it on screen below.
            publicationFormats: [{name: 'PDF', file: 'article.pdf', ...(is35 ? {approved: false} : {})}],
        });
        const pdf = book.publicationFormats.find((f) => f.name === 'PDF');
        fact('seed', {submissionId: book.submissionId, format: pdf.id, file: pdf.submissionFileId});

        if (is35) {
            // The manager's "Publish": the REST API's publish endpoint, in the manager's session.
            const {page, close} = await launch(app, {record: false});
            try {
                await signIn(page, mg.username, {contextPath: press});
                // "Publication Formats": the PDF row's "Awaiting Approval" › "OK".
                await page.goto(app.url(`/index.php/${press}/en/dashboard/editorial?workflowSubmissionId=${book.submissionId}&workflowMenuKey=publication_publicationFormats`));
                await idle(page);
                const row = page.locator('tr').filter({hasText: 'PDF'}).filter({has: page.locator('.onix_code')}).first();
                await row.waitFor({timeout: T});
                const before = flat(await row.innerText(), 200);
                await row.getByRole('link', {name: /Awaiting Approval|Not Approved/}).first().click();
                const confirm = page.locator('[role="dialog"]:visible').last();
                await confirm.getByRole('button', {name: /^(OK|Yes)$/}).first().click();
                await idle(page);
                await page.waitForTimeout(1_500);
                fact('approve35', {before, after: flat(await row.innerText().catch(() => null), 200)});
                fact('publish35', await page.evaluate(async (id) => {
                    const base = window.pkp.context.apiBaseUrl;
                    const h = {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'Content-Type': 'application/json'};
                    const sub = await (await fetch(`${base}submissions/${id}`, {headers: h})).json();
                    const r = await fetch(`${base}submissions/${id}/publications/${sub.currentPublicationId}/publish`, {
                        method: 'POST', headers: {...h, 'X-Http-Method-Override': 'PUT'}, body: '{}',
                    });
                    return {status: r.status, body: (await r.text()).slice(0, 300)};
                }, book.submissionId));
            } finally {
                await close();
            }
        }

        // The reader, signed out: the book's page, its "PDF" link, the PDF view page.
        const {page, close} = await launch(app);
        const build = [];
        const pageErrors = [];
        page.on('response', (r) => {
            if (/pdfJsViewer\/pdf\.js\/build\//.test(r.url())) build.push({status: r.status(), url: rel(r.url())});
        });
        page.on('requestfailed', (r) => {
            if (/pdfJsViewer\/pdf\.js\/build\//.test(r.url())) build.push({failed: r.failure() && r.failure().errorText, url: rel(r.url())});
        });
        page.on('pageerror', (e) => pageErrors.push(flat(e.message, 300)));
        try {
            await page.goto(app.url(`/index.php/${press}/catalog/book/${book.submissionId}`));
            await idle(page);
            const link = page.locator(`a[href$="/${pdf.id}/${pdf.submissionFileId}"]`).first();
            fact('bookPage', {title: await page.title(), link: flat(await link.innerText().catch(() => null), 80)});
            await link.click();
            await page.waitForURL(/\/catalog\/view\//, {timeout: T});
            const frameEl = page.locator('#pdfCanvasContainer > iframe');
            await frameEl.waitFor({state: 'visible', timeout: T});
            const frame = page.frameLocator('#pdfCanvasContainer > iframe');
            const numPages = frame.locator('#numPages');
            // Up to 30 s for the toolbar's page count (the U69 S3 wait), then what is there.
            await numPages.filter({hasText: /\d/}).waitFor({timeout: T}).catch(() => {});
            await idle(page);
            fact('viewer', {
                url: rel(page.url()),
                title: await page.title(),
                frameSrc: rel(await frameEl.getAttribute('src')),
                numPages: await numPages.textContent().catch(() => null),
                pagesRendered: await frame.locator('.page canvas').count().catch(() => null),
                textLayer: flat(await frame.locator('.page .textLayer').first().innerText({timeout: 2_000}).catch(() => null), 120),
                pdfjsLib: await (await frameEl.elementHandle()).contentFrame()
                    .then((f) => f.evaluate(() => ({defined: typeof globalThis.pdfjsLib !== 'undefined', version: (globalThis.pdfjsLib || {}).version || null})))
                    .catch((e) => ({error: flat(e.message, 120)})),
            });
            // The way round: the bar's own "Download" (a plain link, no PDF.js).
            const dl = await page.locator('header.header_viewable_file a.download').getAttribute('href');
            const dlr = await page.request.get(dl);
            fact('barDownload', {href: rel(dl), status: dlr.status(), type: dlr.headers()['content-type'], disposition: dlr.headers()['content-disposition']});
            fact('buildRequests', build);
            fact('pageErrors', pageErrors);
            const png = outFile('viewer-frame.png');
            await frameEl.screenshot({path: png});
            fact('screenshot', png);
            const mjs = build.find((b) => /\/build\/pdf\.mjs$/.test(b.url));
            fact('readsFixed', !!(mjs && mjs.status === 200 && /\b1\b/.test(facts.viewer.numPages || '')));
            record('viewer', facts);
        } finally {
            await close();
        }
    } finally {
        fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 2));
    }
});
