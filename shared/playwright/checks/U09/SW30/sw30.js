// U09 drift sweep SW30 (housekeeping 2026-10-30): the lines of
// docs/specs/U09-custom-pages-and-blocks.md that the kept scripts K1-K5b and I09 do not settle.
// Every phase seeds its own scratch context (tag prefix u09sw), signs in from the roster rule and
// records every screen with screen(); nothing on `publicknowledge` is touched.
//   paths  (three apps) Rule 1, A10, Rule 6a, scenario 2: "Custom Page" items at "nav.dot",
//          "deep/Mixed_1.x", "one/two/three.x" and "about"; the addresses read signed out
//          (and "about/contact", "about/editorialMasthead" under the "about" item)
//   line   (OJS, OMP) Fields, the static page window's line: a journal with English alone under
//          "UI" (no language in the address), and one with English and French under "UI", the
//          manager working in English and then in French
//   pics   (three apps) Rule 29, A16, A17, A18 on the "Custom Page" item window's "Content":
//          pictures over the server's file limit (WEBP, JPEG, GIF), a file over the request
//          limit in the French interface, AVIF/TIFF/HEIC chosen in "Upload", an SVG and a PDF
//          dropped onto "Drop an image here", a BMP dropped and one pasted into the box, then a
//          PNG dropped after them
//   footer (three apps) A16's settings forms: the Vue "Page Footer" box of "Appearance" › "Setup",
//          an SVG and a PDF chosen in "Upload" (nothing saved)
//   a4     (three apps) Rule 26a, A4: a manager working in French saves an English "Block Name"
//          only; the row, the page's script errors as the window loads, the "Sidebar" label's
//          own text (its leading space)
//   a15    (three apps) A15's "any block plugin turned off": "Language Toggle Block" placed, its
//          plugin unticked, then "Save" on "Appearance" › "Setup" with "Sidebar" untouched; the
//          plugin ticked again afterwards (the scratch journal as found)
// Run (one app per process, each phase twice as r1 and r2):
//   PROBE_FEATURE=U09 PROBE_AGENT=ccSW30 PROBE_RUN=r1 PHASES=paths,line,pics,a4 \
//       node bin/probe.js <app> shared/playwright/checks/U09/SW30/sw30.js
// No other script or state file is read; the test pictures are written under the output
// folder's files-sw30/ on each run. Facts: .reports/U09/ccSW30/facts-<run>-<app>.json.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, outDir} = require('../../../probe');
const H = require('../K1/lib');

const ALL = ['paths', 'line', 'pics', 'footer', 'a4', 'a15'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function crc32(buf) {
    let c;
    const table = crc32.t || (crc32.t = Array.from({length: 256}, (_, n) => { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
    let crc = 0xffffffff;
    for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, random) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { const o = y * (w * 3 + 1); for (let x = 0; x < w * 3; x++) raw[o + 1 + x] = random ? (Math.random() * 256) | 0 : (x * 7 + y * 3) & 0xff; }
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: random ? 0 : 9})), chunk('IEND', Buffer.alloc(0))]);
}
function bmp(w, h) {
    const row = Math.ceil((w * 3) / 4) * 4; const size = 54 + row * h; const b = Buffer.alloc(size);
    b.write('BM', 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(row * h, 34);
    for (let i = 54; i < size; i++) b[i] = (i * 13) & 0xff;
    return b;
}
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const pad = (buf, kb) => Buffer.concat([buf, Buffer.alloc(kb * 1024 - buf.length, 7)]);

async function makeFiles(page) {
    const dir = path.join(outDir(), 'files-sw30');
    fs.mkdirSync(dir, {recursive: true});
    await page.goto('about:blank');
    const out = await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 120; c.height = 80;
        const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 120, 80);
        return {jpeg: c.toDataURL('image/jpeg', 0.9).split(',')[1], webp: c.toDataURL('image/webp', 0.9).split(',')[1]};
    });
    const jpeg = Buffer.from(out.jpeg, 'base64');
    const webp = Buffer.from(out.webp, 'base64');
    const small = png(120, 80, false);
    const w = (name, buf) => { const f = path.join(dir, name); fs.writeFileSync(f, buf); return f; };
    return {
        small: w('small.png', small),
        bigWebp: w('big-3mb.webp', pad(webp, 3000)),
        bigJpeg: w('big-3mb.jpg', pad(jpeg, 3000)),
        bigGif: w('big-3mb.gif', pad(GIF, 3000)),
        overPost: w('over-9mb.png', png(1800, 1750, true)),
        avif: w('photo.avif', small),
        tiff: w('photo.tif', small),
        heic: w('photo.heic', small),
        svg: w('drawing.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')),
        pdf: w('doc.pdf', Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')),
        bmp: w('photo.bmp', bmp(60, 40)),
        bmp2: w('drawing.bmp', bmp(40, 30)),
        dropPng: w('dropped.png', png(50, 40, false)),
    };
}

forEachApp(async (app) => {
    const hasStatic = app.name !== 'ops';
    const log = (...a) => console.log(`[sw30 ${app.name}]`, ...a);
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 700)); };
    const t = tag('u09sw');
    const ctxUrl = (ctx, p = '', locale = '') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);
    const seed = async (suffix, extra = {}) => {
        const c = `${t}${suffix}`;
        await app.api.createContext({tag: c, context: {name: `U09 SW30 ${suffix.toUpperCase()} ${c}`, acronym: `SW${suffix.toUpperCase()}`, ...(extra.context || {})},
            users: [{username: `${c}m`, roles: ['manager'], givenName: 'Sami', familyName: 'Weep'}], ...(extra.plugins ? {plugins: extra.plugins} : {})});
        return {ctx: c, mgr: `${c}m`};
    };

    const M = await launch(app);
    const page = M.page;
    const asked = [];
    page.on('dialog', async (d) => { asked.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    const errs = [];
    page.on('pageerror', (e) => errs.push({kind: 'pageerror', text: String(e.message).slice(0, 300), url: page.url()}));
    page.on('console', (m) => { if (m.type() === 'error') errs.push({kind: 'console', text: m.text().slice(0, 300), url: page.url()}); });
    const snap = async (p, name, extra = {}) => {
        const s = await screen(p).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(p, name).catch(() => {});
        return s;
    };
    const step = async (name, fn) => { log(`-- ${name}`); try { return await fn(); } catch (e) { fact(`ERROR-${name}`, String(e.stack || e).slice(0, 900)); await shot(page, `error-${name}`).catch(() => {}); return null; } };
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    /** a public address read signed out in a fresh browser */
    const readPublic = async (url, name) => {
        const V = await launch(app, {record: false});
        try {
            const resp = await V.page.goto(url).catch((e) => ({err: e.message}));
            await idle(V.page).catch(() => {});
            const s = await snap(V.page, name);
            const dom = await V.page.evaluate(() => ({
                url: location.pathname, title: document.title,
                h1: [...document.querySelectorAll('h1')].map((h) => h.innerText.trim()),
                crumbs: document.querySelector('.cmp_breadcrumbs') ? document.querySelector('.cmp_breadcrumbs').innerText.replace(/\s+/g, ' ').trim() : null,
                header: !!document.querySelector('.pkp_structure_head, header'),
                body: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
            })).catch(() => null);
            return {status: resp && resp.status ? resp.status() : resp, ...dom, settled: !!s};
        } finally { await V.close(); }
    };

    // ---- TinyMCE and the picture window (K5's helpers, trimmed) ----------------------------
    const mceBar = (taId) => page.locator(`[id="${taId}"] ~ .tox-tinymce`).first();
    const mceReady = async (taId) => page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), taId, {timeout: T}).catch(() => {});
    const mceGet = async (taId) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), taId).catch(() => null);
    const mceBody = (taId) => page.frameLocator(`[id="${taId}_ifr"]`).locator('body');
    const imgDlg = () => page.locator('.tox-dialog:visible').first();
    const tinyAlerts = async () => page.locator('.tox-dialog:visible').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 300))).catch(() => []);
    const tinyNotices = async () => (await page.locator('.tox-notification:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)).filter(Boolean);
    const closeTinyDialogs = async () => {
        for (let i = 0; i < 4 && (await page.locator('.tox-dialog:visible').count()); i++) {
            const d = page.locator('.tox-dialog:visible').last();
            const b = d.getByRole('button', {name: /^(OK|Ok|Cancel|Close|Annuler|Fermer)$/}).first();
            if (await b.count()) await b.click().catch(() => {}); else await page.keyboard.press('Escape');
            await sleep(400);
        }
    };
    const watchUploads = () => {
        const resps = [];
        const fn = async (r) => { if (/_uploadPublicFile/.test(r.url()) && r.request().method() === 'POST') resps.push({status: r.status(), body: (await r.text().catch(() => '')).slice(0, 300)}); };
        page.on('response', fn);
        return {resps, stop: () => page.off('response', fn)};
    };
    const openUploadTab = async (taId) => {
        await mceBar(taId).getByRole('button', {name: /Insert\/edit image|image/i}).first().click();
        await imgDlg().waitFor({timeout: T});
        await imgDlg().locator('.tox-dialog__body-nav-item').nth(1).click(); // "Upload" (the second tab, whatever the language)
        await sleep(500);
    };
    const browse = async (taId, file, name) => {
        await openUploadTab(taId);
        const w = watchUploads();
        await imgDlg().locator('input[type="file"]').first().setInputFiles(file);
        const end = Date.now() + 15_000;
        while (Date.now() < end && !w.resps.length) await sleep(250);
        await sleep(1800);
        w.stop();
        const out = {file: path.basename(file), kb: Math.ceil(fs.statSync(file).size / 1024), requests: w.resps, alerts: await tinyAlerts(), notices: await tinyNotices()};
        if (name) await snap(page, name);
        await closeTinyDialogs();
        return out;
    };
    const dropOnZone = async (taId, file, name, mime) => {
        await openUploadTab(taId);
        const w = watchUploads();
        const b64 = fs.readFileSync(file).toString('base64');
        const zone = imgDlg().locator('.tox-dropzone').first();
        const has = await zone.count();
        if (has) {
            await zone.evaluate((el, {b64, name, mime}) => {
                const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                const dt = new DataTransfer(); dt.items.add(new File([arr], name, {type: mime}));
                const r = el.getBoundingClientRect(); const o = {dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10};
                el.dispatchEvent(new DragEvent('dragenter', o)); el.dispatchEvent(new DragEvent('dragover', o)); el.dispatchEvent(new DragEvent('drop', o));
            }, {b64, name: path.basename(file), mime});
        }
        await sleep(3000);
        w.stop();
        const out = {file: path.basename(file), zone: has, requests: w.resps, alerts: await tinyAlerts(), notices: await tinyNotices()};
        if (name) await snap(page, name);
        await closeTinyDialogs();
        return out;
    };
    const intoBox = async (taId, file, how, mime) => {
        await mceReady(taId);
        await mceBody(taId).click();
        await page.keyboard.press('Control+End');
        const w = watchUploads();
        const fr = await (await page.locator(`[id="${taId}_ifr"]`).elementHandle()).contentFrame();
        await fr.evaluate(({b64, name, how, mime}) => {
            const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const dt = new DataTransfer(); dt.items.add(new File([arr], name, {type: mime}));
            const body = document.body;
            if (how === 'paste') body.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
            else { const r = body.getBoundingClientRect(); const o = {dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20}; body.dispatchEvent(new DragEvent('dragenter', o)); body.dispatchEvent(new DragEvent('dragover', o)); body.dispatchEvent(new DragEvent('drop', o)); }
        }, {b64: fs.readFileSync(file).toString('base64'), name: path.basename(file), how, mime});
        const end = Date.now() + 10_000;
        while (Date.now() < end && !w.resps.length) await sleep(250);
        await sleep(2500);
        w.stop();
        const html = (await mceGet(taId)) || '';
        return {how, file: path.basename(file), requests: w.resps, notices: await tinyNotices(),
            imgs: [...html.matchAll(/<img[^>]+src="([^"]{0,60})/g)].map((m) => m[1])};
    };
    const openItem = async (ctx, locale = '') => {
        await H.openNav(page, app, ctx, locale);
        if (locale === 'fr_CA') {
            // the link reads "Ajouter un élément" in French: found by the grid's action id
            await H.itemsTable(page).locator('xpath=ancestor::div[contains(@class,"pkp_controllers_grid")][1]').getByRole('link', {name: /^Ajouter/}).first().click();
            await H.itemWindow(page).locator('select[name="menuItemType"]').waitFor({timeout: T});
            await idle(page); await sleep(600);
        } else await H.openItemWindow(page, 'add');
        await H.itemWindow(page).locator('select[name="menuItemType"]').selectOption({value: 'NMI_TYPE_CUSTOM'});
        await sleep(500);
        const id = await H.itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
        await mceReady(id);
        return id;
    };

    try {
        // ---- paths ------------------------------------------------------------------------
        if (on('paths')) await step('paths', async () => {
            const P = await seed('p');
            await as(P.mgr, P.ctx);
            await H.openNav(page, app, P.ctx);
            const saved = {};
            for (const [title, p] of [['Dot page', 'nav.dot'], ['Deep mixed', 'deep/Mixed_1.x'], ['Third part dot', 'one/two/three.x'], ['About us', 'about']]) {
                await H.openItemWindow(page, 'add');
                await H.fillTitle(page, title);
                await H.setType(page, 'Custom Page');
                await H.itemWindow(page).locator('input[name="path"]').fill(p);
                const id = await H.itemWindow(page).locator('textarea[name="content[en]"]').getAttribute('id');
                await H.mceSet(page, id, `${title} text.`);
                const r = await H.itemSave(page);
                saved[p] = {notice: flat(r.notice), windowOpen: r.windowOpen, errors: r.state ? r.state.errors : null};
                if (r.windowOpen) await H.closeItemWindow(page);
            }
            await snap(page, 'p01-items-saved');
            fact('paths-saved', saved);
            fact('paths-items', (await H.grids(page)).items);
            const pages = {};
            for (const p of ['nav.dot', 'deep/Mixed_1.x', 'one/two/three.x', 'about', 'about/contact', 'about/editorialMasthead']) {
                pages[p] = await readPublic(ctxUrl(P.ctx, `/${p}`), `p02-public-${p.replace(/[/.]/g, '_')}`);
            }
            fact('paths-public', pages);
        });

        // ---- line -------------------------------------------------------------------------
        if (on('line') && hasStatic) await step('line', async () => {
            const L1 = await seed('l1', {plugins: {staticpagesplugin: {enabled: true}}});
            const L2 = await seed('l2', {plugins: {staticpagesplugin: {enabled: true}}, context: {supportedLocales: ['en', 'fr_CA']}});
            const readLine = async (ctx, locale, name) => {
                await page.goto('about:blank');
                await page.goto(ctxUrl(ctx, '/management/settings/website', locale));
                await idle(page);
                await page.locator('#staticPages-button').first().click();
                await page.locator('#staticPageGridContainer .pkp_controllers_grid').first().waitFor({timeout: T});
                await idle(page);
                await page.locator('#staticPageGridContainer a[id*="addStaticPage"]').first().click();
                const form = page.locator('form#staticPageForm');
                await form.waitFor({timeout: T});
                await idle(page); await sleep(800);
                await snap(page, name);
                const text = await form.innerText();
                const m = text.replace(/\s+/g, ' ').match(/(This page will be accessible at|Cette page sera accessible)[^]*?(important functions\.|importantes\.|$)/);
                const heading = await page.locator('[role="dialog"]:visible h1').last().innerText().catch(() => null);
                return {heading: flat(heading), line: m ? m[0] : flat(text, 600)};
            };
            await as(L1.mgr, L1.ctx);
            fact('line-one-ui-language', await readLine(L1.ctx, '', 'l01-window-one-ui'));
            await as(L2.mgr, L2.ctx);
            fact('line-two-ui-english', await readLine(L2.ctx, 'en', 'l02-window-two-ui-en'));
            fact('line-two-ui-french', await readLine(L2.ctx, 'fr_CA', 'l03-window-two-ui-fr'));
        });

        // ---- pics -------------------------------------------------------------------------
        if (on('pics')) await step('pics', async () => {
            const files = await makeFiles(page);
            const Q = await seed('q', {context: {supportedLocales: ['en', 'fr_CA']}});
            await as(Q.mgr, Q.ctx);
            let id = await openItem(Q.ctx, 'en');
            await snap(page, 'q01-item-window');
            const o = {};
            o.overWebp = await browse(id, files.bigWebp, 'q02-over-limit-webp');
            o.overJpeg = await browse(id, files.bigJpeg, 'q03-over-limit-jpeg');
            o.overGif = await browse(id, files.bigGif, 'q04-over-limit-gif');
            o.avif = await browse(id, files.avif, 'q05-avif');
            o.tiff = await browse(id, files.tiff, 'q06-tiff');
            o.heic = await browse(id, files.heic, 'q07-heic');
            o.dropSvg = await dropOnZone(id, files.svg, 'q08-drop-svg-zone', 'image/svg+xml');
            o.dropPdf = await dropOnZone(id, files.pdf, 'q09-drop-pdf-zone', 'application/pdf');
            o.dropPngZone = await dropOnZone(id, files.small, 'q10-drop-png-zone', 'image/png');
            o.boxDropBmp = await intoBox(id, files.bmp, 'drop', 'image/bmp');
            await snap(page, 'q11-box-after-bmp-drop');
            o.boxPasteBmp = await intoBox(id, files.bmp2, 'paste', 'image/bmp');
            o.boxDropPngAfter = await intoBox(id, files.dropPng, 'drop', 'image/png');
            await snap(page, 'q12-box-after-png-drop');
            fact('pics', o);
            await H.closeItemWindow(page).catch(() => {});
            // the request limit, the manager working in French
            id = await openItem(Q.ctx, 'fr_CA');
            fact('pics-over-post-french', await browse(id, files.overPost, 'q13-over-post-french'));
            await H.closeItemWindow(page).catch(() => {});
        });

        // ---- footer: the Vue "Page Footer" box of Appearance › Setup, an SVG and a PDF chosen ----
        if (on('footer')) await step('footer', async () => {
            const files = await makeFiles(page);
            const Q = await seed('f');
            await as(Q.mgr, Q.ctx);
            await page.goto(ctxUrl(Q.ctx, '/management/settings/website'));
            await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); // Appearance › Setup (Website's own top tab is also named "Setup")
            await idle(page); await sleep(800);
            const footerId = await page.locator('textarea[id*="pageFooter"]').first().getAttribute('id').catch(() => null);
            if (footerId) {
                await mceReady(footerId);
                fact('pics-footer-svg', await browse(footerId, files.svg, 'q14-footer-svg'));
                fact('pics-footer-pdf', await browse(footerId, files.pdf, 'q15-footer-pdf'));
            } else fact('pics-footer-svg', {footer: 'not found'});
            await snap(page, 'q16-footer-after');
        });
        // ---- a4 ---------------------------------------------------------------------------
        if (on('a4')) await step('a4', async () => {
            const B = await seed('b', {context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, plugins: {customblockmanagerplugin: {enabled: true}}});
            await as(B.mgr, B.ctx);
            const openManager = async (locale) => {
                await page.goto('about:blank');
                await page.goto(ctxUrl(B.ctx, '/management/settings/website', locale));
                await idle(page);
                await page.locator('#plugins-button').first().click(); await idle(page); await sleep(500);
                const row = page.locator('tr.gridRow[id$="-row-customblockmanagerplugin"]').first();
                await row.locator('a.show_extras').first().click(); await sleep(400);
                const rid = await row.getAttribute('id');
                await page.locator(`[id="${rid}-control-row"] a`).filter({visible: true}).first().click();
                const dlg = page.locator('[role="dialog"]:visible').filter({has: page.locator('table[id*="customblock"]')}).first();
                await dlg.waitFor({timeout: T}); await idle(page); await sleep(1200);
                return dlg;
            };
            let dlg = await openManager('fr_CA');
            await dlg.locator('a[id*="addCustomBlock"]').first().click();
            const form = page.locator('form#customBlockForm:visible').first();
            await form.waitFor({timeout: T}); await idle(page); await sleep(800);
            await form.locator('input[name="blockTitle[en]"]').fill('English only');
            const save = page.waitForResponse((r) => /update-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
            await form.locator('button[type="submit"], button:has-text("Enregistrer")').first().click();
            const r = await save; await idle(page); await sleep(1200);
            const rows = async (d) => d.locator('tr.gridRow').evaluateAll((els) => els.map((tr) => ({text: tr.innerText.replace(/\s+/g, ' ').trim(), arrow: !!tr.querySelector('a.show_extras')})));
            await snap(page, 'b01-saved-french');
            const e0 = errs.length;
            const out = {save: r ? r.status() : null, rowsAfterSave: await rows(dlg)};
            dlg = await openManager('fr_CA');
            out.reopenFrench = {rows: await rows(dlg), scriptErrors: errs.slice(e0)};
            await snap(page, 'b02-manager-reopened-french');
            const e1 = errs.length;
            dlg = await openManager('en');
            out.reopenEnglish = {rows: await rows(dlg), scriptErrors: errs.slice(e1)};
            await snap(page, 'b03-manager-reopened-english');
            // the "Sidebar" label's own text
            await page.goto(ctxUrl(B.ctx, '/management/settings/website', 'en'));
            await idle(page);
            await page.locator('#appearance-button').first().click(); await idle(page);
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); // Appearance › Setup (Website's own top tab is also named "Setup")
            await idle(page); await sleep(800);
            out.sidebarLabels = await page.locator('input[type="checkbox"][name="sidebar"]').evaluateAll((els) => els.map((e) => {
                const l = e.closest('label') || (e.id && document.querySelector(`label[for="${e.id}"]`));
                const own = l ? [...l.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('|') : null;
                return {value: e.value, ownText: own ? JSON.stringify(own) : null, label: l ? l.innerText.split('\n')[0] : null};
            })).catch((e) => String(e.message));
            await snap(page, 'b04-sidebar');
            fact('a4', out);
        });
        // ---- a15 --------------------------------------------------------------------------
        if (on('a15')) await step('a15', async () => {
            const G = await seed('g', {context: {supportedLocales: ['en', 'fr_CA']}});
            await as(G.mgr, G.ctx);
            const setup = async () => {
                await page.goto('about:blank');
                await page.goto(ctxUrl(G.ctx, '/management/settings/website', 'en'));
                await idle(page);
                await page.locator('#appearance-button').first().click(); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); // Appearance › Setup (Website's own top tab is also named "Setup")
                await idle(page); await sleep(800);
            };
            const sidebar = async () => page.locator('input[type="checkbox"][name="sidebar"]').evaluateAll((els) => els.map((e) => `${e.value}${e.checked ? ' [x]' : ''}`));
            const out = {};
            await setup();
            const box = page.locator('input[type="checkbox"][name="sidebar"][value="languagetoggleblockplugin"]');
            if (!(await box.isChecked())) {
                await box.check();
                out.place = await H.saveForm(page, 'input[name="sidebar"]');
            }
            out.before = await sidebar();
            // untick the plugin on "Plugins"
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
            const pbox = page.locator('tr.gridRow[id$="-row-languagetoggleblockplugin"] input[type="checkbox"]').first();
            const w = page.waitForResponse((r) => /plugin-grid\/disable/.test(r.url()), {timeout: T}).catch(() => null);
            await pbox.click({noWaitAfter: true}).catch(() => pbox.dispatchEvent('click'));
            await sleep(700);
            const dlg = page.locator('[role="dialog"]:visible').last();
            if (await dlg.count()) { out.ask = flat(await dlg.innerText()); await dlg.getByRole('button', {name: /^(OK|Yes)$/}).first().click(); }
            const r = await w; out.disable = r ? r.status() : null;
            await sleep(800);
            await setup();
            out.listOff = await sidebar();
            await snap(page, 'g01-setup-plugin-off');
            const saveResp = page.waitForResponse((x) => /api\/v1\/contexts\/\d+/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
            out.save = await H.saveForm(page, 'input[name="sidebar"]');
            const sr = await saveResp; out.saveStatus = sr ? sr.status() : null;
            out.errorsShown = (await page.locator('.pkpFormFieldLabel ~ * .pkpFieldError, .pkpFormField__error, [id*="sidebar"] .pkpFieldError, .pkpFieldError').allInnerTexts().catch(() => [])).map((x) => flat(x)).filter(Boolean);
            await snap(page, 'g02-setup-save-refused');
            // tick the plugin again
            await page.locator('#plugins-button').first().click(); await idle(page); await sleep(600);
            await page.locator('tr.gridRow[id$="-row-languagetoggleblockplugin"] input[type="checkbox"]').first().click({noWaitAfter: true}).catch(() => {});
            await sleep(1500); await idle(page);
            await setup();
            out.listOnAgain = await sidebar();
            fact('a15', out);
        });
    } finally {
        fact('dialogs', asked);
        fact('pageErrors', errs.slice(0, 40));
        await M.close();
    }
});
