// PR review check — pkp/pkp-lib#13563, pkp/jatsTemplate#126 with the pointer bump pkp/ojs#5954: an unstructured
// reference's identifiers (DOI, arXiv ID, handle, URN) are tagged as <pub-id> inside its <mixed-citation> in the
// generated JATS, and every pub-id-type written is one JATS 1.2 allows. One journal, PKP's default test dataset,
// metadata lookup off as installed. It changes the data: reset the fleet first, for each side.
//
//   npm run fleet-prep -- --feature sync-13563 --dataset 1 --reset --apps ojs
//   PROBE_FEATURE=sync-13563 PROBE_AGENT=<base|head> node bin/probe.js ojs shared/playwright/checks/sync/jatsTemplate-126/references.js
//   php shared/playwright/checks/sync/jatsTemplate-123/validate-dtd.php checkouts/ojs .reports/sync-13563/<id>/*.xml
//
//   0 (as dbarnes) the generated JATS of every version of every submission, as loaded       → asloaded-<s>-<p>.xml
//   1 submission 5: Publication › "References", the lines of REFS typed in the box, "Add"    → shot 1-references
//   2 the stored references: identifiers picked out of the text, structured or not
//   3 by the citations API (the "Edit citation" form's request): a DOI set by hand on a reference whose text
//     has none; title and author on a reference with a URN (structured); title and an author row with empty
//     names on a reference with a handle (structured, U42 A13)
//   4 a data citation per identifier type of the "Identifier type" list, one with an author row with empty names
//   5 "JATS XML": the page (the reference list in view), its "Download", the API's copy        → refs-5-download.xml, refs-5.xml
//   6 submission 17, published: unpublished, three of the lines as its references, published again,
//     "Make available with publication": the signed-out download                              → public-17.xml
//
// Facts go to facts-references-ojs.json (each <ref> on one line); no assertions. At the plugin's base 06e35f8 a
// <mixed-citation> holds the text alone, and the URN and five data-citation types get a pub-id-type the DTD
// refuses; at the PR head 1849b22 (2026-10-20) each identifier the text holds is a <pub-id>, a web address an
// <ext-link>, and the Mike reference's DOI is marked inside the Wiley address (U48 A24).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, idle, record, shot, outDir} = require('../../../probe');

const CTX = 'publicknowledge';
const T = 30_000;
const REFS = [
    'Alpha, A. (2020). A cited work. Journal of Tests, 1(1), 1-2. https://doi.org/10.1234/alpha.',
    'Bravo, B. (2021). A second work. Journal of Tests, 2(1), 3-4. doi:10.1234/BRAVO',
    'Charlie, C. (2019). A preprint. arXiv:2001.12345v2',
    'Delta, D. (2018). A thesis. hdl:10419/12345. Accessed 2020-01-01.',
    'Echo, E. (2017). A report. urn:nbn:de:101:1-2017123456',
    'Foxtrot, F. (2016). A web page. https://example.org/page?a=1&b=2 (accessed 2020).',
    'Golf, G. (2015). A work with no identifier.',
    'Hotel, H. (2014). A publisher page. https://journals.example.org/article/view/10.1234/hotel/pdf',
    'India, I. (2013). A work and its erratum. https://doi.org/10.1234/india and https://doi.org/10.1234/india.e1',
    'Juliet, J. (2012). A preprint with a DOI. https://doi.org/10.48550/arXiv.2101.00001 arXiv:2101.00001',
    'Kilo, K. (2011). A link with an apostrophe. https://example.org/kilo\'s-page',
    'Lima, L. (2010). Both forms. doi:10.1234/lima https://doi.org/10.1234/lima',
    'Mike, M. (2009). A publisher page and the DOI. https://onlinelibrary.wiley.com/doi/full/10.1002/abc.124. doi:10.1002/abc.124',
    'November, N. (2008). A thesis. hdl:10419/67890',
    'Oscar, O. (2007). A report. urn:nbn:de:101:1-2007999',
];
const PUBLISHED = [REFS[0], REFS[2], REFS[7]];
const DATA_TYPES = {DOI: '10.5061/dryad.alpha', Accession: 'GSE12345', PURL: 'https://purl.org/example/data', ARK: 'ark:/12345/x6', URI: 'https://example.org/dataset',
    ARXIV: '2001.12345', ECLI: 'ECLI:NL:HR:2009:BH1234', Handle: '10419/54321', ISSN: '1234-5678', ISBN: '978-3-16-148410-0', PMID: '12345678', PMCID: 'PMC1234567', UUID: '123e4567-e89b-12d3-a456-426614174000'};

async function sessionApi(page, method, url, data) {
    return page.evaluate(async ({method, url, data}) => {
        const token = window.pkp?.currentUser?.csrfToken || null;
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json', 'X-Csrf-Token': token || ''},
            body: data === undefined ? undefined : JSON.stringify(data),
            credentials: 'same-origin',
        });
        const text = await res.text();
        let body = null;
        try { body = JSON.parse(text); } catch (e) { body = text.slice(0, 800); }
        return {status: res.status, body};
    }, {method, url, data});
}

/** Each <ref> of a JATS document on one line. */
const refs = (xml) => (xml.match(/<ref [\s\S]*?<\/ref>/g) || []).map((s) => s.replace(/\s*\n\s*/g, ''));
const pick = (c) => Object.fromEntries(['id', 'seq', 'rawCitation', 'doi', 'arxiv', 'handle', 'urn', 'url', 'title', 'isStructured'].map((k) => [k, c[k] ?? null]));

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the plugin ships in OJS alone
    if (!app.dataset) throw new Error('references.js runs on a dataset fleet only (fleet-prep --dataset)');
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[fact] ${k}: ${JSON.stringify(v).slice(0, 2500)}`);
    };
    const api = (p) => app.url(`/index.php/${CTX}/api/v1/${p}`);
    const save = (name, text) => fs.writeFileSync(path.join(outDir(), name), text);

    let p17Id = null;
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'dbarnes', {contextPath: CTX});
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial`));
        await idle(page);

        const sub = async (sid) => (await sessionApi(page, 'GET', api(`submissions/${sid}`))).body;
        const pubUrl = (sid, pid) => api(`submissions/${sid}/publications/${pid}`);
        const jats = async (key, sid, pid, name) => {
            const r = await sessionApi(page, 'GET', `${pubUrl(sid, pid)}/jats`);
            if (r.status === 200 && typeof r.body?.jatsContent === 'string') {
                save(name, r.body.jatsContent);
                if (key) fact(key, {status: 200, generated: r.body.isDefaultContent, file: name, refs: refs(r.body.jatsContent)});
                return r.body.jatsContent;
            }
            if (key) fact(key, {status: r.status, body: r.body});
            return null;
        };

        // 0: everything as loaded
        const list = await sessionApi(page, 'GET', api('submissions?count=100'));
        const asLoaded = [];
        for (const item of list.body?.items ?? []) {
            for (const p of (await sub(item.id)).publications ?? []) {
                const xml = await jats(null, item.id, p.id, `asloaded-${item.id}-${p.id}.xml`);
                asLoaded.push(`${item.id}/${p.id}:${xml === null ? 'none' : `${xml.length}${/<ref-list/.test(xml) ? '+refs' : ''}`}`);
            }
        }
        fact('0 as loaded (submission/version:bytes)', asLoaded);

        // 1: the references typed in the workflow's box
        const s5 = await sub(5);
        const p5 = s5.publications.at(-1);
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial?workflowSubmissionId=5`));
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').first();
        const entry = dlg.getByRole('link', {name: 'References', exact: true}).first();
        if (!(await entry.isVisible().catch(() => false))) {
            await dlg.getByRole('link', {name: 'Publication', exact: true}).first().click({timeout: T});
            await idle(page);
        }
        await entry.click({timeout: T});
        await idle(page);
        const box = dlg.getByRole('textbox', {name: /^References/}).first();
        await box.waitFor({state: 'visible', timeout: T});
        await box.fill(REFS.join('\n'));
        const added = page.waitForResponse((r) => /\/citations/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Add', exact: true}).click();
        const res = await added;
        await dlg.locator('tbody tr').filter({hasText: 'Oscar, O.'}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page);
        fact('1 "Add"', {status: res ? res.status() : null, url: res ? res.url().replace(/^.*\/api\/v1\//, '') : null});
        await shot(page, '1-references').catch(() => {});

        // 2: what was stored
        const cites = async () => {
            const r = await sessionApi(page, 'GET', `${pubUrl(5, p5.id)}/citations?count=100`);
            return (r.body?.items ?? r.body ?? []);
        };
        // the list answers a summary without the text, so each reference is read in full
        const stored = [];
        for (const c of await cites()) stored.push((await sessionApi(page, 'GET', `${pubUrl(5, p5.id)}/citations/${c.id}`)).body ?? c);
        fact('2 stored references', stored.map(pick));
        const byName = (n) => stored.find((c) => (c.rawCitation || '').startsWith(n));

        // 3: identifiers and details set by hand
        const edit = async (key, name, data) => {
            const c = byName(name);
            if (!c) return fact(key, {notFound: name});
            const r = await sessionApi(page, 'PUT', `${pubUrl(5, p5.id)}/citations/${c.id}`, data);
            fact(key, {status: r.status, stored: r.status === 200 ? pick(r.body) : r.body});
        };
        await edit('3 a DOI set by hand, not in the text (Golf)', 'Golf, G.', {doi: '10.1234/golf'});
        await edit('3 title and author on the URN reference (Echo)', 'Echo, E.', {title: 'A report', authors: [{givenName: 'Erin', familyName: 'Echo'}]});
        await edit('3 title and an empty author row on the handle reference (Delta)', 'Delta, D.', {title: 'A thesis', authors: [{givenName: '', familyName: ''}]});

        // 4: one data citation per identifier type
        const dc = [];
        for (const [type, identifier] of Object.entries(DATA_TYPES)) {
            const data = {title: `Data with ${type}`, relationshipType: 'supporting', identifierType: type, identifier};
            data.authors = type === 'URI' ? [{givenName: '', familyName: ''}] : [{givenName: 'Dana', familyName: 'Data'}];
            const r = await sessionApi(page, 'POST', `${pubUrl(5, p5.id)}/dataCitations`, data);
            dc.push({type, status: r.status, error: r.status >= 400 ? r.body : undefined});
        }
        fact('4 data citations added', dc);

        // 5: the "JATS XML" page, its download, the API
        await page.goto(app.url(`/index.php/${CTX}/dashboard/editorial?workflowSubmissionId=5`));
        await idle(page);
        const jatsEntry = dlg.getByRole('link', {name: 'JATS XML', exact: true}).first();
        if (!(await jatsEntry.isVisible().catch(() => false))) {
            await dlg.getByRole('link', {name: 'Publication', exact: true}).first().click({timeout: T}).catch(() => {});
            await idle(page);
        }
        await jatsEntry.click({timeout: T}).catch((e) => fact('5 "JATS XML" not pressed', e.message.slice(0, 200)));
        await idle(page);
        await page.waitForTimeout(1500);
        const shown = await page.evaluate(() => {
            const code = [...document.querySelectorAll('[role="dialog"] pre, [role="dialog"] code')].find((e) => e.textContent.includes('<ref-list'));
            if (!code) return null;
            const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const at = node.textContent.indexOf('Alpha, A.');
                if (at < 0) continue;
                const range = document.createRange();
                range.setStart(node, at);
                range.setEnd(node, at + 1);
                let scroller = node.parentElement;
                while (scroller && !(scroller.scrollHeight > scroller.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
                (scroller || document.scrollingElement).scrollBy(0, range.getBoundingClientRect().top - 200);
                break;
            }
            return (code.textContent.match(/<ref-list>[\s\S]*?<\/ref-list>/) || [null])[0];
        });
        fact('5 "JATS XML" page', {refList: shown ? refs(shown) : null});
        await page.waitForTimeout(500);
        await shot(page, '5-jats-page').catch(() => {});
        try {
            const [download] = await Promise.all([
                page.waitForEvent('download', {timeout: 15_000}),
                dlg.getByRole('button', {name: /download/i}).or(dlg.getByRole('link', {name: /download/i})).first().click({timeout: 5000}),
            ]);
            const file = path.join(outDir(), 'refs-5-download.xml');
            await download.saveAs(file);
            fact('5 "Download"', {name: download.suggestedFilename(), refs: refs(fs.readFileSync(file, 'utf8'))});
        } catch (e) {
            fact('5 "Download"', {notTaken: e.message.slice(0, 200)});
        }
        await jats('5 API', 5, p5.id, 'refs-5.xml');

        // 6: the published route
        const p17 = (await sub(17)).publications.at(-1);
        p17Id = p17.id;
        const un = await sessionApi(page, 'PUT', `${pubUrl(17, p17.id)}/unpublish`);
        const put = await sessionApi(page, 'PUT', pubUrl(17, p17.id), {citationsRaw: PUBLISHED.join('\n')});
        const pub = await sessionApi(page, 'PUT', `${pubUrl(17, p17.id)}/publish`);
        const vis = await sessionApi(page, 'PUT', `${pubUrl(17, p17.id)}/jats/visibility`, {jatsPublicVisibility: true});
        fact('6 submission 17 republished', {unpublish: un.status, references: put.status, publish: pub.status, status: pub.body?.status, visibility: vis.status,
            error: [un, put, pub, vis].filter((r) => r.status >= 400).map((r) => r.body)});
    } finally {
        await close();
    }
    if (p17Id) {
        const dl = await fetch(api(`submissions/17/publications/${p17Id}/jats/download`));
        const text = await dl.text();
        if (dl.status === 200) save('public-17.xml', text);
        fact('6 signed-out download', {status: dl.status, type: dl.headers.get('content-type'), refs: dl.status === 200 ? refs(text) : text.slice(0, 300)});
    }
    record('facts-references', facts);
    fs.writeFileSync(path.join(outDir(), `facts-references-${app.name}.json`), JSON.stringify(facts, null, 2));
});
