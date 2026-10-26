// pdfJsViewer 8ae9739 ("Update PDF.js to 6.4.299", pulled into OJS main by d054e2660d, stable-3_5_0 by
// the same tree at 2e27262): the new generic build calls Map.prototype.getOrInsertComputed and URL.parse
// with no polyfill, so a reader whose browser lacks either gets an empty viewer.
// Report docs/reports/2026-10-26-pdfJsViewer-8ae9739.md (deleted 2026-10-26: fixed by pdfJsViewer f24f761 / 3.5
// ce6a128, the legacy build; git has it). Kept for OJS `ore`, whose pointer is still 1d992590f0 (4.10.38):
// run S4 when `ore` takes PDF.js 6. Kept from the regression read rr1026a.
//
//   PROBE_FEATURE=sync PROBE_AGENT=<id> RUN=r1 node bin/probe.js ojs shared/playwright/checks/sync/pdfJsViewer-8ae9739/viewer-browsers.js
//   OLD_BUILD=1d99259 serves the previous plugin tree at the same addresses (the before control).
// Seeds its own scratch journal per run. S1 article PDF reader (render, Download, Print), S2 issue PDF
// galley, S3 document JavaScript in the viewer frame, S4 the viewer with getOrInsertComputed, URL.parse or
// RegExp.escape deleted by an init script (an emulated older browser), plus a control.
// Reads fixed when: s4-<run>-ojs.json noGetOrInsertComputed.view.loaded and noURLparse.view.loaded are
// true with numPagesText "of 1" and no pageErrors (as the old tree reads today).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, record, shot, tag, outDir, serverLog} = require('../../../probe');

const RUN = (process.env.RUN || 'r1') + (process.env.OLD_BUILD ? '-old' : '');
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');

function jsPdf() {
    const objs = [
        '<< /Type /Catalog /Pages 2 0 R /Names << /JavaScript 5 0 R >> /OpenAction 6 0 R /AcroForm << /Fields [7 0 R] >> >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 8 0 R >> >> /Annots [7 0 R] >>',
        null, // contents
        '<< /Names [(rr) << /S /JavaScript /JS (console.println\\("rr1026a-doc-js-ran"\\);) >>] >>',
        '<< /S /JavaScript /JS (console.println\\("rr1026a-openaction-ran"\\);) >>',
        '<< /Type /Annot /Subtype /Widget /FT /Tx /T (f1) /Rect [20 20 200 50] /P 3 0 R /V (x) /DA (/F1 12 Tf 0 g) /AA << /F << /S /JavaScript /JS (event.value = "JSFMT";) >> >> >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    const stream = 'BT /F1 18 Tf 20 150 Td (rr1026a scripting) Tj ET';
    objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    let out = '%PDF-1.7\n';
    const offs = [];
    objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    return out;
}

forEachApp(async (app) => {
    const log = (...a) => console.log(`[rr1026a ${app.name} ${RUN}]`, ...a);
    const slog = serverLog(app);
    const from = slog.mark();
    await app.api.bootstrapProbe(app.contextPath);
    const t = tag(`rr1026a${RUN}`);
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `RR1026a ${RUN} ${t}`, acronym: 'RRA'},
        users: [{username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'}],
        issues: [{volume: 1, number: 1, year: 2025, published: true, galleys: [{label: 'PDF', file: 'article.pdf'}]}],
    });
    const sub = await app.api.createSubmission({tag: `${t}s`, context: ctx.path, submitter: `${t}au`, title: 'Tidal Patterns', abstract: '<p>Tides.</p>', published: true,
        issue: {volume: 1, number: 1, year: 2025}, galleys: [{label: 'PDF', file: 'article.pdf'}]});
    const facts = {ctx: {path: ctx.path, id: ctx.contextId}, sub: {id: sub.submissionId, galleys: sub.galleys}};
    log('seeded', JSON.stringify(facts));
    const cu = (p) => app.url(`/index.php/${ctx.path}${p}`);

    const OLD = process.env.OLD_BUILD; // a pdfJsViewer commit: serve its pdf.js/ tree instead (before control)
    const {execFileSync} = require('child_process');
    const plug = path.join(app.root || 'checkouts/ojs', 'plugins/generic/pdfJsViewer');
    const oldCache = new Map();
    async function session(name, {initScript} = {}) {
        const {page, close} = await launch(app);
        if (initScript) await page.context().addInitScript(initScript);
        if (OLD) {
            await page.context().route(/\/plugins\/generic\/pdfJsViewer\/pdf\.js\//, async (route) => {
                const u = new URL(route.request().url());
                const rel = decodeURIComponent(u.pathname.replace(/^.*\/plugins\/generic\/pdfJsViewer\//, ''));
                try {
                    if (!oldCache.has(rel)) oldCache.set(rel, execFileSync('git', ['-C', plug, 'show', `${OLD}:${rel}`], {maxBuffer: 64 << 20}));
                    const ext = path.extname(rel);
                    const types = {'.mjs': 'text/javascript', '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.ftl': 'text/plain', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream'};
                    await route.fulfill({status: 200, body: oldCache.get(rel), contentType: types[ext] || 'application/octet-stream'});
                } catch (e) { await route.fulfill({status: 404, body: 'not in old tree'}); }
            });
        }
        const ev = {console: [], pageErrors: [], bad: [], requests: []};
        page.on('console', (m) => ev.console.push({type: m.type(), text: flat(m.text(), 300), url: strip(m.location()?.url)}));
        page.on('pageerror', (e) => ev.pageErrors.push(flat(e.message, 300)));
        page.on('response', (r) => { const u = strip(r.url()); if (/pdf\.js|download/.test(u)) ev.requests.push(`${r.status()} ${u.slice(0, 160)}`); if (r.status() >= 400) ev.bad.push(`${r.status()} ${u.slice(0, 160)}`); });
        return {page, close, ev, name};
    }
    const viewerFrame = (page) => page.frames().find((f) => /pdf\.js\/web\/viewer\.html/.test(f.url()));
    async function readViewer(page) {
        const deadline = Date.now() + 30000;
        let r = null;
        while (Date.now() < deadline) {
            const f = viewerFrame(page);
            if (f) {
                r = await f.evaluate(() => {
                    const a = window.PDFViewerApplication;
                    return {hasApp: !!a, loaded: !!(a && a.pdfDocument), pages: a && a.pdfDocument ? a.pdfDocument.numPages : null,
                        numPagesText: document.querySelector('#numPages')?.textContent ?? null,
                        canvases: document.querySelectorAll('.page canvas').length,
                        textLayerChars: (document.querySelector('.textLayer')?.textContent || '').length,
                        errorText: (document.querySelector('#errorWrapper, #viewer-alert')?.textContent || '').trim().slice(0, 200),
                        lang: document.documentElement.lang, version: window.pdfjsLib?.version ?? null};
                }).catch((e) => ({evalError: flat(e.message, 200)}));
                if (r && r.loaded && r.canvases > 0) break;
            }
            await page.waitForTimeout(500);
        }
        return {frameUrl: strip(viewerFrame(page)?.url()), ...r};
    }
    async function viewerDownload(page) {
        const f = viewerFrame(page);
        try {
            const [d] = await Promise.all([page.waitForEvent('download', {timeout: 15000}), f.locator('#downloadButton').click({timeout: 10000})]);
            const p = await d.path();
            return {filename: d.suggestedFilename(), bytes: p ? fs.statSync(p).size : null};
        } catch (e) { return {error: flat(e.message, 200)}; }
    }
    async function viewerPrint(page) {
        const f = viewerFrame(page);
        try {
            await f.evaluate(() => {
                window.__rrPrint = {imgs: 0, beforeprint: 0, afterprint: 0};
                const pc = document.querySelector('#printContainer');
                new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.querySelector && (n.tagName === 'IMG' || n.querySelector('img'))) window.__rrPrint.imgs++; }))).observe(pc, {childList: true, subtree: true});
                window.addEventListener('beforeprint', () => window.__rrPrint.beforeprint++);
                window.addEventListener('afterprint', () => window.__rrPrint.afterprint++);
            });
            await f.locator('#printButton').click({timeout: 10000});
            await page.waitForTimeout(4000);
            return await f.evaluate(() => window.__rrPrint);
        } catch (e) { return {error: flat(e.message, 200)}; }
    }
    const csp = (ev) => ev.console.filter((c) => /Content Security Policy|Refused to/i.test(c.text));

    // ---------------- S1: article PDF reader
    {
        const s = await session('s1');
        await s.page.goto(cu(`/article/view/${sub.submissionId}`));
        const href = await s.page.locator('a.obj_galley_link.pdf').first().getAttribute('href');
        await s.page.locator('a.obj_galley_link.pdf').first().click();
        await s.page.waitForLoadState('load');
        const view = await readViewer(s.page);
        await shot(s.page, `s1-${RUN}-article-reader`).catch(() => {});
        const dl = await viewerDownload(s.page);
        const pr = await viewerPrint(s.page);
        // S3 in the same real frame: open a PDF with document JavaScript
        const f = viewerFrame(s.page);
        const before = s.ev.console.length;
        const js = await f.evaluate(async (src) => {
            const a = window.PDFViewerApplication;
            const data = new Uint8Array([...src].map((c) => c.charCodeAt(0)));
            await a.open({data});
            for (let i = 0; i < 40 && !(a.pdfDocument && a.pdfDocument.numPages); i++) await new Promise((r) => setTimeout(r, 250));
            await new Promise((r) => setTimeout(r, 4000));
            const fld = document.querySelector('.annotationLayer input, .annotationLayer textarea');
            return {pages: a.pdfDocument?.numPages ?? null, scriptingReady: a.pdfScriptingManager ? !!a.pdfScriptingManager.ready : null,
                hasJS: await a.pdfDocument?.hasJSActions?.().catch(() => null), fieldValue: fld ? fld.value : null};
        }, jsPdf()).catch((e) => ({error: flat(e.message, 300)}));
        const jsConsole = s.ev.console.slice(before).filter((c) => /rr1026a|sandbox|quickjs|wasm|scripting/i.test(c.text));
        await shot(s.page, `s3-${RUN}-js-pdf`).catch(() => {});
        const wasmReqs = s.ev.requests.filter((r) => /wasm|iccs|standard_fonts|cmaps/.test(r));
        record(`s1-s3-${RUN}`, {facts, galleyHref: strip(href), view, download: dl, print: pr, cspRefusals: csp(s.ev), pageErrors: s.ev.pageErrors, bad: s.ev.bad, requests: s.ev.requests, s3: {js, jsConsole, wasmReqs}, consoleErrors: s.ev.console.filter((c) => c.type === 'error')});
        log('S1', JSON.stringify({view, dl, pr, csp: csp(s.ev).length, pageErrors: s.ev.pageErrors, bad: s.ev.bad}));
        log('S3', JSON.stringify({js, jsConsole, wasmReqs}));
        await s.close();
    }
    // ---------------- S2: issue PDF galley reader
    {
        const s = await session('s2');
        await s.page.goto(cu('/issue/archive'));
        await s.page.locator('a.title, .obj_issue_summary a').first().click();
        await s.page.waitForLoadState('load');
        const issueUrl = strip(s.page.url());
        const gl = s.page.locator('.galleys_links a.obj_galley_link.pdf, .galleys a.obj_galley_link.pdf').first();
        const href = await gl.getAttribute('href').catch(() => null);
        await gl.click();
        await s.page.waitForLoadState('load');
        const view = await readViewer(s.page);
        await shot(s.page, `s2-${RUN}-issue-reader`).catch(() => {});
        const dl = await viewerDownload(s.page);
        record(`s2-${RUN}`, {issueUrl, galleyHref: strip(href), pageUrl: strip(s.page.url()), view, download: dl, cspRefusals: csp(s.ev), pageErrors: s.ev.pageErrors, bad: s.ev.bad, requests: s.ev.requests, consoleErrors: s.ev.console.filter((c) => c.type === 'error')});
        log('S2', JSON.stringify({issueUrl, href: strip(href), view, dl, csp: csp(s.ev).length, pageErrors: s.ev.pageErrors, bad: s.ev.bad}));
        await s.close();
    }
    // ---------------- S4: emulated browsers lacking one new API each (plus a control with nothing removed)
    const variants = {
        control: null,
        noGetOrInsertComputed: 'delete Map.prototype.getOrInsertComputed; delete WeakMap.prototype.getOrInsertComputed;',
        noRegExpEscape: 'delete RegExp.escape;',
        noURLparse: 'delete URL.parse;',
    };
    const s4 = {};
    for (const [name, script] of Object.entries(variants)) {
        const s = await session(`s4-${name}`, script ? {initScript: script} : {});
        await s.page.goto(cu(`/article/view/${sub.submissionId}`));
        await s.page.locator('a.obj_galley_link.pdf').first().click();
        await s.page.waitForLoadState('load');
        const view = await readViewer(s.page);
        let find = null;
        if (name === 'noRegExpEscape' || name === 'control') {
            const f = viewerFrame(s.page);
            find = await f.evaluate(async () => {
                const a = window.PDFViewerApplication;
                if (!a?.pdfDocument) return {skipped: 'no document'};
                a.eventBus.dispatch('find', {source: null, type: '', query: 'PDF', caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: false, matchDiacritics: false});
                await new Promise((r) => setTimeout(r, 2500));
                return {matches: a.findController?._matchesCountTotal ?? null, highlighted: document.querySelectorAll('.textLayer .highlight').length};
            }).catch((e) => ({error: flat(e.message, 200)}));
        }
        await shot(s.page, `s4-${RUN}-${name}`).catch(() => {});
        s4[name] = {view, find, pageErrors: s.ev.pageErrors, consoleErrors: s.ev.console.filter((c) => c.type === 'error').slice(0, 6)};
        log('S4', name, JSON.stringify(s4[name]).slice(0, 900));
        await s.close();
    }
    record(`s4-${RUN}`, s4);
    record(`serverlog-${RUN}`, {lines: slog.since(from)});
    log('server log lines', slog.since(from).length);
});
