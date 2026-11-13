// rr4, ui-library#1053 round 4 (1eaf184462): S1 (a middle reference deleted), S2 (documents stored before the
// commit), S3 (side panel ids vs editor numbers). A fresh tagged submission in Production; never a reset.
// Kept from the regression reader rr4 (run m1, 2026-11-13). With fix4.diff (bin/try-fix.js, run fix4): S1 reads "[?]"
// (Beta, deleted) and "[2]" (Gamma) instead of two "[2]".
// Run: PROBE_FEATURE=pr-13767 PROBE_AGENT=pr PROBE_RUN=<side> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-1053/markers.js
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
    const {ReferencesPage} = require('../../../pages/CitationsPages.js');
    const {expect} = require('@playwright/test');
    const side = process.env.PROBE_RUN || 'run';
    const fact = (k, v) => { record(`${side}-${k.split(' ')[0]}`, v); console.log(`[fact] ${k}: ${flat(JSON.stringify(v), 2400)}`); };
    const shot = (name) => path.join(outDir(), `${side}-${name}.png`);
    const configFile = path.isAbsolute(app.configFile) ? app.configFile : path.resolve(__dirname, '../../../../..', app.configFile);
    const filesDir = (fs.readFileSync(configFile, 'utf8').match(/^files_dir\s*=\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const t = tag('rr4m');
    // a decoy first, so the driven submission's reference ids differ from its list numbers
    await app.api.createSubmission({tag: `${t}x`, context: app.contextPath, submitter: 'author.alex', title: `Decoy ${t}`, citationsRaw: ['Decoy one.', 'Decoy two.', 'Decoy three.']});
    const s = await app.api.createSubmission({tag: t, context: app.contextPath, submitter: 'author.alex', title: `Markers ${t}`,
        citationsRaw: REFS, files: [{file: 'article.docx'}], decisions: ['sendExternalReview', 'accept', 'sendToProduction']});
    const sub = s.submissionId;
    const publicationId = Number(String(sql(app, `select current_publication_id from submissions where submission_id = ${sub}`)).trim());
    const refs = String(sql(app, `select citation_id || '|' || seq || '|' || raw_citation from citations where publication_id = ${publicationId} order by seq`)).trim().split('\n')
        .map((r) => { const [id, seq, raw] = r.split('|'); return {id, seq: Number(seq), raw}; });
    fact('seed', {submission: sub, publication: publicationId, refs});
    const idOf = (prefix) => refs.find((r) => r.raw.startsWith(prefix)).id;
    const [alpha, beta, gamma, delta] = ['Alpha', 'Beta', 'Gamma', 'Delta'].map(idOf);

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(d.message()); d.accept().catch(() => {}); });
    const api = app.url(`/index.php/${app.contextPath}/api/v1/submissions/${sub}/publications/${publicationId}/bodyText`);
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
        const putDoc = (d) => page.evaluate(async ({url, serialized}) => {
            const fd = new FormData();
            fd.append('bodyText', serialized);
            const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': window.pkp.currentUser.csrfToken, 'X-Http-Method-Override': 'PUT'}, body: fd});
            return r.status;
        }, {url: api, serialized: JSON.stringify(d)});
        const getDoc = async () => { const g = await page.evaluate(async (url) => (await fetch(url)).json(), api); return typeof g.bodyTextContent === 'string' ? JSON.parse(g.bodyTextContent) : g.bodyTextContent; };
        const storedCites = (d) => { const out = []; const walk = (n) => { if (n.type === 'citation') out.push({text: (n.content || []).map((c) => c.text).join(''), mode: n.attrs?.citationMode, marker: n.attrs?.ojsCitationMarker, source: decodeURIComponent(n.attrs?.source || '')}); (n.content || []).forEach(walk); }; walk(d); return out; };
        const citeState = () => body.citations().evaluateAll((cs) => cs.map((c) => ({text: c.textContent, mode: c.getAttribute('data-citation-mode'),
            ids: (() => { try { return JSON.parse(decodeURIComponent(c.getAttribute('data-source') || '')).map((i) => i.id); } catch { return null; } })()})));
        const panel = () => body.referenceItems().evaluateAll((items) => items.map((i) => ({id: i.querySelector('.reference-id')?.textContent ?? null, text: i.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)})));
        const src = (ids) => encodeURIComponent(JSON.stringify(ids.map((id) => ({id}))));
        const cite = (ids, text, mode) => ({type: 'citation', attrs: {source: src(ids), ...(mode ? {citationMode: mode} : {})}, content: [{type: 'text', text}]});
        const para = (...content) => ({type: 'paragraph', content: content.map((c) => (typeof c === 'string' ? {type: 'text', text: c} : c))});

        // S2: a body text as the round-3 editor stored it (no ojsCitationMarker anywhere)
        const legacy = {type: 'doc', content: [
            para('L1 plain Beta: ', cite([beta], `[${beta}]`), '.'),
            para('L2 page cites Delta: ', cite([delta], `[${delta}, p. 5]`, 'custom')),
            para('L3 typed on: Alpha.', cite([alpha], `[${alpha}] More text 2020.`, 'generated')),
            para('L4 Gamma: ', cite([gamma], `[${gamma}]`), '.'),
        ]};
        fact('S2 PUT legacy', await putDoc(legacy));
        await body.reload();
        await page.waitForTimeout(1500);
        fact('S2 editor citations after load', await citeState());
        fact('S2 unsaved badge after load', await body.unsavedBadge().isVisible().catch(() => null));
        fact('S3 side panel', await panel());
        await page.screenshot({path: shot('S2-S3-editor')});

        const exportButton = page.getByRole('button', {name: 'Export', exact: true});
        const exportHTML = async () => {
            const sent = page.waitForResponse((r) => /\/bodyText$/.test(r.url()) && r.request().method() === 'POST', {timeout: 15_000}).catch(() => null);
            await exportButton.click();
            await page.getByRole('menuitem', {name: 'Export to HTML'}).click();
            const r = await sent;
            await page.waitForTimeout(1500);
            const err = frame.errorDialog();
            const error = (await err.isVisible().catch(() => false)) ? flat(await err.innerText(), 500) : null;
            return {status: r && r.status(), error};
        };
        fact('S2 export', await exportHTML());
        const htmlPath = galleyFile('HTML');
        if (htmlPath) {
            const html = fs.readFileSync(htmlPath, 'utf8');
            fs.writeFileSync(path.join(outDir(), `${side}-S2-galley.html`), html);
            const view = await page.context().newPage();
            await view.setContent(html);
            fact('S2 galley citations', await view.evaluate(() => [...document.querySelectorAll('cite')].map((c) => ({
                text: c.textContent, linked: [...c.querySelectorAll('a')].map((a) => ({href: a.getAttribute('href'), text: a.textContent})),
                marker: c.getAttribute('data-ojs-citation-marker'), mode: c.getAttribute('data-citation-mode')}))));
            fact('S2 galley entries', await view.evaluate(() => [...document.querySelectorAll('[data-type="reference"]')].map((e) => e.textContent.trim().slice(0, 60))));
            await view.close();
        } else fact('S2 galley', 'no HTML galley');

        // S1: a fresh document saved by this commit's editor: Beta and Gamma cited, then Beta deleted on "References"
        fact('S1 PUT', await putDoc({type: 'doc', content: [para('P1 cites Beta: ', cite([beta], `[${beta}]`), '.'), para('P2 cites Gamma: ', cite([gamma], `[${gamma}]`), '.')]}));
        await body.reload();
        await page.waitForTimeout(1500);
        fact('S1 editor before save', await citeState());
        fact('S3 side panel (S1 doc)', await panel());
        fact('S1 save', (await body.save()).status());
        fact('S1 stored after save', storedCites(await getDoc()));
        await page.screenshot({path: shot('S1-before-delete')});

        const references = new ReferencesPage(page, frame);
        await references.open();
        await references.deleteRow('Beta, B. (2021)');
        fact('S1 references left', String(sql(app, `select citation_id || ' ' || seq || ' ' || left(raw_citation, 12) from citations where publication_id = ${publicationId} order by seq`)).trim().split('\n'));
        await body.openFromMenu();
        await page.waitForTimeout(1500);
        fact('S1 editor after delete', await citeState());
        fact('S1 side panel after delete', await panel());
        await page.screenshot({path: shot('S1-after-delete')});
        // a fresh page load too, so the result does not hang on the SPA's state
        await body.reload();
        await page.waitForTimeout(1500);
        fact('S1 editor after reload', await citeState());
        fact('S1 export', await exportHTML());
        await page.screenshot({path: shot('S1-export')});
        fact('dialogs', dialogs);
    } finally {
        await close();
    }
});
