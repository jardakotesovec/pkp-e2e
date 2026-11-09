// U13 housekeeping chunk H09 (2026-11-09): the incidentals row "Article and issue PDF galley reader
// (pdfJsViewer b7e5188047, PDF.js 6.4.299)": every viewer load logs "Applying inline style violates
// ... 'style-src 'self''", and on `ore` the text layer read 0 characters and the find bar 0 matches.
// Does the reader's search, text layer and text selection work on a dataset PDF that holds text?
//
// Spec: docs/specs/U13-article-landing-page-and-reading.md, Fields "The PDF reader page" (the viewer's
// search control, the highlighting tools), Rule 11. OMP's book PDF view page (U69's surface) carries the
// same pdf.js tree and is driven as the control.
//
// Drives a dataset fleet (PKP's default dataset), read-only: nothing is saved server-side (the viewer's
// highlight stays in the browser), so no scratch context is seeded. Per app it picks a published item with
// a PDF galley/format by SQL (OJS: the articles with one; OPS: the first preprint; OMP: the first book),
// and per role (ROLES, default "visitor,dbarnes") opens the item's page, presses the PDF link and reads on
// the reader page:
//   load    the viewer's console lines (with their source location), the securitypolicyviolation events
//           of every frame (directive, source file, line, sample) and the stack of each style-attribute
//           write the viewer makes (Element.setAttribute('style') / innerHTML with style=, wrapped by an
//           init script that only records)
//   text    the document's extractable text (PDF.js getTextContent of page 1) beside what the page's
//           .textLayer holds once drawn (polled to a settled read), and the first spans' style attribute,
//           computed position and box
//   find    the toolbar's search pressed, a word of the page typed, Enter: the match count, #findMsg, the
//           highlighted matches
//   select  a mouse drag over the first line of text: the selection's text
//   open    (visitor) the viewer's Tools menu › "Open file" given apps/ojs/playwright/fixtures/files/article.pdf,
//           the PDF the `ore` row was read with: its own text (getTextContent) and its text layer
//   bare    once per app, before the roles: the first item's reader in a plain Chromium (no kit launch(),
//           so no disable-motion <style> injected into the viewer frame): its console lines and text layer
//   sweep   the toolbar's visible buttons, the sidebar toggle (thumbnails), zoom in, the "Highlight" tool
//           pressed and dragged over the line (highlight editors made), then the return arrow pressed with
//           that highlight unsaved (the dialogs on the way out), and the PDF link pressed again (the highlight kept?)
// Run each twice (r1, r2 on main; s1, s2 on stable-3_5_0), one app per call:
//   bin/app-lock.sh shared ojs -- env PROBE_RUN=r1 PROBE_FEATURE=issues-cc09a PKP_E2E_DATASET=5 PROBE_AGENT=cc09a PROBE_NOTES_FEATURE=U13 node bin/probe.js ojs shared/playwright/checks/U13/H09/h09.js
//   PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=s1 PROBE_FEATURE=issues-cc09a-3_5 PKP_E2E_DATASET=5 PROBE_AGENT=cc09a node bin/probe.js ops shared/playwright/checks/U13/H09/h09.js
// Outputs: h09-<role>-<run>-<app>.json, h09-bare-<run>-<app>.json (+ .png shots) in the agent folder. No other script or file.
const {forEachApp, launch, signIn, screen, shot, record, loc, idle, serverLog, sql} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const FIXTURE = require('path').resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/article.pdf');
const ROLES = (process.env.ROLES || 'visitor,dbarnes').split(',').map((s) => s.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');

// Runs in every frame before its scripts: records CSP violations and the viewer's style-attribute writes.
function watchStyles() {
    window.__h09 = {csp: [], styleWrites: [], styleWriteCount: 0};
    const stack = () => (new Error().stack || '').split('\n').slice(2, 6).map((l) => l.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/g, ''));
    document.addEventListener('securitypolicyviolation', (e) => {
        if (window.__h09.csp.length < 20) {
            window.__h09.csp.push({directive: e.violatedDirective, effective: e.effectiveDirective, blocked: e.blockedURI,
                source: String(e.sourceFile || '').replace(/https?:\/\/[^/]+/, ''), line: e.lineNumber, col: e.columnNumber, sample: e.sample, disposition: e.disposition});
        }
    }, true);
    const setAttr = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
        if (String(name).toLowerCase() === 'style') {
            window.__h09.styleWriteCount++;
            if (window.__h09.styleWrites.length < 8) window.__h09.styleWrites.push({via: 'setAttribute', tag: this.tagName, value: String(value).slice(0, 120), stack: stack()});
        }
        return setAttr.call(this, name, value);
    };
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(Element.prototype, 'innerHTML', {
        configurable: true, get: desc.get,
        set(v) {
            if (/\sstyle\s*=/i.test(String(v))) {
                window.__h09.styleWriteCount++;
                if (window.__h09.styleWrites.length < 8) window.__h09.styleWrites.push({via: 'innerHTML', tag: this.tagName, value: String(v).slice(0, 160), stack: stack()});
            }
            return desc.set.call(this, v);
        },
    });
}

function targets(app) {
    if (app.name === 'omp') {
        const rows = sql(app, `select p.submission_id, pf.publication_format_id from publications p join publication_formats pf on pf.publication_id=p.publication_id
            join submission_files sf on sf.assoc_type=521 and sf.assoc_id=pf.publication_format_id join files f on f.file_id=sf.file_id
            where p.status=3 and f.mimetype='application/pdf' and coalesce(pf.remote_url,'')='' order by 1 limit 1`).split('\n').filter(Boolean);
        return rows.map((r) => ({id: r.split('|')[0], page: `/catalog/book/${r.split('|')[0]}`, link: '.obj_monograph_full a[href*="/catalog/view/"]'}));
    }
    const rows = sql(app, `select distinct p.submission_id from publications p join publication_galleys g on g.publication_id=p.publication_id
        join submission_files sf on sf.submission_file_id=g.submission_file_id join files f on f.file_id=sf.file_id
        join submissions s on s.submission_id=p.submission_id and s.current_publication_id=p.publication_id
        where p.status=3 and f.mimetype='application/pdf' order by 1 limit ${app.name === 'ojs' ? 2 : 1}`).split('\n').filter(Boolean);
    const kind = app.name === 'ops' ? 'preprint' : 'article';
    return rows.map((id) => ({id, page: `/${kind}/view/${id}`, link: 'a.obj_galley_link.pdf'}));
}

// The viewer's Tools menu › "Open file", given the campaign fixture article.pdf: its text layer and its own text.
async function openFixture(page, fr) {
    const o = {};
    try {
        await fr.locator('#secondaryToolbarToggleButton').click({timeout: 4000});
        await sleep(400);
        const btn = fr.locator('#secondaryOpenFile');
        o.buttonVisible = await btn.isVisible().catch(() => null);
        o.buttonLabel = flat(await btn.innerText().catch(() => null), 60);
        if (!o.buttonVisible) return o;
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: 8000}), btn.click({timeout: 4000})]);
        await chooser.setFiles(FIXTURE);
        const t0 = Date.now();
        while (Date.now() - t0 < 15000) {
            o.read = await fr.evaluate(async () => {
                const a = window.PDFViewerApplication;
                const tl = document.querySelector('.page[data-page-number="1"] .textLayer');
                let own = null;
                try { const tc = await (await a.pdfDocument.getPage(1)).getTextContent(); own = {items: tc.items.length, chars: tc.items.map((i) => i.str).join('').length}; } catch (e) { own = {error: String(e.message).slice(0, 100)}; }
                return {title: document.title, pages: a.pdfDocument?.numPages ?? null, canvases: document.querySelectorAll('.page canvas').length, textLayerChars: tl ? tl.textContent.length : null, own};
            }).catch((e) => ({error: flat(e.message, 120)}));
            if (o.read && /article\.pdf/.test(o.read.title || '') && o.read.canvases > 0 && Date.now() - t0 > 4000) break;
            await sleep(500);
        }
        await shot(page, `h09-visitor-${RUN}-openfile-article`).catch(() => {});
    } catch (e) { o.error = flat(e.message, 200); }
    return o;
}

// A plain Chromium with nothing injected (no kit launch(), so no disable-motion stylesheet): the reader's
// console lines and text layer as a reader's own browser has them.
async function bareControl(app, t) {
    const {chromium} = require('playwright');
    const browser = await chromium.launch();
    const o = {console: [], pageErrors: []};
    try {
        const context = await browser.newContext({viewport: {width: 1280, height: 900}});
        const page = await context.newPage();
        page.on('console', (m) => o.console.push({type: m.type(), text: flat(m.text(), 300), url: rel(m.location()?.url).replace(/\?.*$/, ''), line: m.location()?.lineNumber}));
        page.on('pageerror', (e) => o.pageErrors.push(flat(e.message, 300)));
        await page.goto(app.url(`/index.php/${app.contextPath}${t.page}`));
        await page.locator(t.link).first().click();
        await page.waitForLoadState('load');
        let fr = null;
        const t0 = Date.now();
        while (Date.now() - t0 < 25000) {
            fr = page.frames().find((f) => /pdf\.js\/web\/viewer\.html/.test(f.url()));
            if (fr) {
                o.read = await fr.evaluate(() => { const tl = document.querySelector('.page[data-page-number="1"] .textLayer'); return {loaded: !!window.PDFViewerApplication?.pdfDocument, textLayerChars: tl ? tl.textContent.length : 0, injectedStyles: document.querySelectorAll('style').length}; }).catch(() => null);
                if (o.read && o.read.textLayerChars > 0) break;
            }
            await page.waitForTimeout(500);
        }
        await page.waitForTimeout(1500);
        o.csp = o.console.filter((c) => /Content Security Policy|Refused to/i.test(c.text));
    } catch (e) { o.error = flat(e.message, 200); } finally { await browser.close(); }
    return o;
}

forEachApp(async (app) => {
    const say = (...a) => console.log(`[h09 ${app.name} ${RUN}]`, ...a);
    const slog = serverLog(app);
    const plan = targets(app);
    say('targets', JSON.stringify(plan));
    if (plan[0]) {
        const bare = await bareControl(app, plan[0]);
        record(`h09-bare-${RUN}`, bare);
        say('bare', JSON.stringify({read: bare.read, csp: bare.csp && bare.csp.length, errors: bare.console.filter((c) => c.type === 'error').length, pageErrors: bare.pageErrors.length}));
    }
    for (const role of ROLES) {
        const {page, context, close} = await launch(app);
        const out = {role, line: app.line || 'main', items: []};
        const cons = [];
        const pageErrors = [];
        const dialogs = [];
        page.on('console', (m) => cons.push({type: m.type(), text: flat(m.text(), 300), url: rel(m.location()?.url).replace(/\?.*$/, ''), line: m.location()?.lineNumber, frame: !m.location()?.url ? 'unknown (an injected script)' : /viewer\.html|pdf\.js/.test(m.location().url) ? 'viewer' : 'page'}));
        page.on('pageerror', (e) => pageErrors.push(flat(e.message, 300)));
        page.on('dialog', (d) => { dialogs.push({type: d.type(), message: flat(d.message(), 200), at: rel(page.url())}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
        await context.addInitScript(watchStyles);
        try {
            if (role !== 'visitor') await signIn(page, role, {contextPath: app.contextPath});
            for (const t of plan) {
                const it = {target: t};
                const from = slog.mark();
                const c0 = cons.length;
                await page.goto(app.url(`/index.php/${app.contextPath}${t.page}`));
                await idle(page);
                it.itemPage = await screen(page);
                const link = page.locator(t.link).first();
                await loc(page, `${app.name === 'omp' ? 'book' : 'item'} page: the PDF link`, page.locator(t.link));
                it.linkText = flat(await link.innerText().catch(() => null), 80);
                it.linkHref = rel(await link.getAttribute('href').catch(() => null));
                await link.click();
                await page.waitForLoadState('load');
                const fr0 = Date.now();
                let fr = null;
                while (!fr && Date.now() - fr0 < 20000) { fr = page.frames().find((f) => /pdf\.js\/web\/viewer\.html/.test(f.url())); if (!fr) await sleep(250); }
                it.readerUrl = rel(page.url());
                it.frameUrl = rel(fr && fr.url());
                if (!fr) { it.noFrame = true; out.items.push(it); continue; }
                // ---- text: settle the page's text layer
                const tl0 = Date.now();
                let text = null;
                let prevChars = -1;
                while (Date.now() - tl0 < 25000) {
                    text = await fr.evaluate(async () => {
                        const a = window.PDFViewerApplication;
                        if (!a || !a.pdfDocument) return {loaded: false};
                        if (!window.__h09tl) { window.__h09tl = []; a.eventBus.on('textlayerrendered', (e) => window.__h09tl.push(e.pageNumber)); }
                        const pg = document.querySelector('.page[data-page-number="1"]');
                        const tl = pg && pg.querySelector('.textLayer');
                        const spans = tl ? [...tl.querySelectorAll('span[role="presentation"], span:not(.markedContent):not(.endOfContent)')].filter((s) => s.childElementCount === 0 && s.textContent.trim()) : [];
                        let expected = null;
                        try {
                            const tc = await (await a.pdfDocument.getPage(1)).getTextContent();
                            expected = {items: tc.items.length, chars: tc.items.map((i) => i.str).join('').length, sample: tc.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 200)};
                        } catch (e) { expected = {error: String(e.message).slice(0, 120)}; }
                        return {loaded: true, version: window.pdfjsLib?.version ?? null, pages: a.pdfDocument.numPages, numPagesText: (document.querySelector('#numPages')?.textContent || '').trim(),
                            canvases: document.querySelectorAll('.page canvas').length, textLayer: !!tl, textLayerChars: tl ? tl.textContent.length : 0, spanCount: spans.length,
                            textlayerrenderedSeen: window.__h09tl.slice(), expected,
                            spans: spans.slice(0, 3).map((s) => { const cs = getComputedStyle(s); const r = s.getBoundingClientRect(); return {text: s.textContent.slice(0, 60), styleAttr: (s.getAttribute('style') || '').slice(0, 200), position: cs.position, left: cs.left, top: cs.top, fontSize: cs.fontSize, color: cs.color, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]}; })};
                    }).catch((e) => ({evalError: flat(e.message, 200)}));
                    if (text && text.loaded && text.textLayerChars > 0 && prevChars === text.textLayerChars) break;
                    if (text && text.loaded && text.canvases > 0 && text.textLayerChars === 0 && Date.now() - tl0 > 15000) break;
                    prevChars = text && text.textLayerChars;
                    await sleep(500);
                }
                it.text = text;
                it.readerScreen = await screen(page);
                it.toolbarAria = flat(await fr.locator('#toolbarContainer').ariaSnapshot().catch((e) => `ERR ${e.message}`), 3000);
                await shot(page, `h09-${role}-${RUN}-reader-${t.id}`).catch(() => {});
                await loc(page, 'PDF reader: the viewer frame', page.locator('iframe[src*="viewer.html"]'));
                // ---- find
                const word = ((text && text.expected && text.expected.sample) || '').split(/[^A-Za-z]+/).find((w) => w.length >= 4) || 'the';
                it.find = {word};
                await fr.locator('#viewFindButton').click({timeout: 5000}).catch((e) => { it.find.openErr = flat(e.message, 120); });
                await sleep(400);
                it.find.barOpen = await fr.evaluate(() => !document.querySelector('#findbar')?.classList.contains('hidden')).catch(() => null);
                await fr.locator('#findInput').fill(word).catch((e) => { it.find.fillErr = flat(e.message, 120); });
                await fr.locator('#findInput').press('Enter').catch(() => {});
                await sleep(2500);
                it.find.read = await fr.evaluate(() => ({count: (document.querySelector('#findResultsCount')?.innerText || '').trim(), msg: (document.querySelector('#findMsg')?.innerText || '').trim(),
                    inputState: document.querySelector('#findInput')?.getAttribute('data-status') || null,
                    highlighted: document.querySelectorAll('.textLayer .highlight').length, selectedMatch: document.querySelectorAll('.textLayer .highlight.selected').length,
                    total: window.PDFViewerApplication?.findController?.matchesCount?.total ?? null})).catch((e) => ({error: flat(e.message, 160)}));
                await shot(page, `h09-${role}-${RUN}-find-${t.id}`).catch(() => {});
                await fr.locator('#findInput').press('Escape').catch(() => {});
                await sleep(300);
                // ---- select: drag over the first line of text
                const mark = await fr.evaluate(() => {
                    const tl = document.querySelector('.page[data-page-number="1"] .textLayer');
                    const s = tl && [...tl.querySelectorAll('span')].find((x) => x.childElementCount === 0 && x.textContent.trim().length >= 4);
                    if (!s) return null;
                    s.setAttribute('data-h09', 'line');
                    return s.textContent.slice(0, 80);
                }).catch(() => null);
                it.select = {span: mark};
                const dragLine = async () => {
                    const box = await fr.locator('[data-h09="line"]').boundingBox().catch(() => null);
                    if (!box) return null;
                    const y = box.y + box.height / 2;
                    await page.mouse.move(box.x + 1, y);
                    await page.mouse.down();
                    await page.mouse.move(box.x + box.width - 1, y, {steps: 12});
                    await page.mouse.up();
                    await sleep(600);
                    return box;
                };
                if (mark) {
                    it.select.box = await dragLine();
                    it.select.selection = await fr.evaluate(() => String(getSelection()).slice(0, 120)).catch((e) => `ERR ${e.message}`);
                    await shot(page, `h09-${role}-${RUN}-select-${t.id}`).catch(() => {});
                    await fr.evaluate(() => getSelection().removeAllRanges()).catch(() => {});
                }
                // ---- sweep: toolbar, thumbnails, zoom, Highlight
                const sw = {};
                sw.buttons = await fr.evaluate(() => [...document.querySelectorAll('#toolbarContainer button')].filter((b) => b.offsetParent !== null)
                    .map((b) => ({id: b.id, label: (b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 50), disabled: b.disabled}))).catch(() => null);
                await fr.locator('#viewsManagerToggleButton').click({timeout: 4000}).catch((e) => { sw.sidebarErr = flat(e.message, 120); });
                await sleep(1500);
                sw.sidebar = await fr.evaluate(() => ({open: document.querySelector('#outerContainer')?.classList.contains('viewsManagerOpen') ?? null, thumbnails: document.querySelectorAll('#thumbnailsView .thumbnail, #thumbnailsView [class*="thumbnail"]').length,
                    thumbImgs: document.querySelectorAll('#thumbnailsView img, #thumbnailsView canvas').length})).catch((e) => ({error: flat(e.message, 120)}));
                await fr.locator('#viewsManagerToggleButton').click({timeout: 4000}).catch(() => {});
                await sleep(600);
                const scale = () => fr.evaluate(() => window.PDFViewerApplication?.pdfViewer?.currentScale ?? null).catch(() => null);
                sw.scaleBefore = await scale();
                await fr.locator('#zoomInButton').click({timeout: 4000}).catch((e) => { sw.zoomErr = flat(e.message, 120); });
                await sleep(800);
                sw.scaleAfter = await scale();
                await fr.locator('#zoomOutButton').click({timeout: 4000}).catch(() => {});
                await sleep(800);
                await fr.locator('#editorHighlightButton').click({timeout: 4000}).catch((e) => { sw.highlightErr = flat(e.message, 120); });
                await sleep(800);
                sw.highlightPressed = await fr.locator('#editorHighlightButton').getAttribute('aria-pressed').catch(() => null);
                if (mark) {
                    await fr.evaluate(() => { const s = document.querySelector('[data-h09="line"]'); if (s) s.scrollIntoView({block: 'center'}); }).catch(() => {});
                    await sleep(400);
                    await dragLine();
                    await sleep(800);
                }
                sw.highlightEditors = await fr.evaluate(() => document.querySelectorAll('.highlightEditor').length).catch(() => null);
                sw.storageModified = await fr.evaluate(() => window.PDFViewerApplication?.pdfDocument?.annotationStorage?.size ?? null).catch(() => null);
                await shot(page, `h09-${role}-${RUN}-highlight-${t.id}`).catch(() => {});
                it.frames = await Promise.all(page.frames().map(async (f) => ({url: rel(f.url()).replace(/\?.*$/, ''), h09: await f.evaluate(() => window.__h09 || null).catch(() => null)})));
                // ---- leave with the highlight unsaved: the return arrow
                const d0 = dialogs.length;
                await page.locator('header.header_view a.return, a.return').first().click({timeout: 5000}).catch((e) => { sw.returnErr = flat(e.message, 120); });
                await page.waitForLoadState('load').catch(() => {});
                await sleep(1500);
                sw.leave = {dialogs: dialogs.slice(d0), url: rel(page.url())};
                sw.afterLeave = await screen(page).then((s) => ({url: rel(s.url), title: s.title})).catch((e) => ({error: flat(e.message, 120)}));
                // ---- reopen the reader (the read after the leave): is the highlight kept?
                await page.locator(t.link).first().click().catch((e) => { sw.reopenErr = flat(e.message, 120); });
                await page.waitForLoadState('load').catch(() => {});
                let fr2 = null;
                const r0 = Date.now();
                while (Date.now() - r0 < 20000) {
                    fr2 = page.frames().find((f) => /pdf\.js\/web\/viewer\.html/.test(f.url()));
                    const ok = fr2 && await fr2.evaluate(() => !!window.PDFViewerApplication?.pdfDocument && document.querySelectorAll('.page canvas').length > 0).catch(() => false);
                    if (ok) break;
                    await sleep(400);
                }
                await sleep(1500);
                sw.reopened = fr2 ? await fr2.evaluate(() => ({highlightEditors: document.querySelectorAll('.highlightEditor').length, storage: window.PDFViewerApplication?.pdfDocument?.annotationStorage?.size ?? null})).catch((e) => ({error: flat(e.message, 120)})) : {noFrame: true};
                // ---- the Tools menu's "Open file" with the campaign's own fixture (the PDF the `ore` row was seen with)
                if (role === 'visitor' && fr2) it.openFile = await openFixture(page, fr2);
                it.sweep = sw;
                it.console = cons.slice(c0);
                it.cspConsole = it.console.filter((c) => /Content Security Policy|Refused to/i.test(c.text));
                it.serverLog = slog.since(from);
                out.items.push(it);
                say(role, t.id, JSON.stringify({text: text && {chars: text.textLayerChars, spans: text.spanCount, expected: text.expected && text.expected.chars, tlr: text.textlayerrenderedSeen}, find: it.find.read, sel: it.select.selection, hl: sw.highlightEditors, csp: it.cspConsole.length, dialogs: sw.leave.dialogs.length}));
            }
        } catch (e) {
            out.error = flat(e.stack, 800);
            say('ERROR', out.error);
        } finally {
            out.pageErrors = pageErrors;
            out.dialogs = dialogs;
            record(`h09-${role}-${RUN}`, out);
            await close();
        }
    }
});
