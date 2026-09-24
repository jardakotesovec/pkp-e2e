// U10 claim check, chunk K3: Settings › Website › "Appearance" › "Setup" (the
// upload boxes with their alternate text, per language; "Page Footer";
// "Sidebar" order and ticks; the OMP catalog fields), the header, footer and
// sidebar of the public pages, the site's list of journals for the thumbnail,
// a block plugin disabled under Settings › Website › "Plugins" while placed,
// then "Save" on "Setup". All three apps.
// Spec: docs/specs/U10-appearance-and-theming.md lines 40–64, 83–99, 286–348,
// 473–484, 503–506; register A1, A2, A4; footnotes c, d, f, q, r, s, f-a1,
// f-a2, f-a4, td3, td4, td23–td27.
//
// Seeds per app (scratch, tag prefix u10k3):
//   A  en + fr_CA (UI and Forms), one manager: the upload boxes, logo,
//      thumbnail, homepage image, footer, the unsaved leave
//   B  en only, one manager: a new journal's "Setup", "Advanced", Plugins;
//      the sidebar (Rules 23–24); OMP's catalog fields (td4)
//   C  en only, one manager: Rule 25 / A4 with "Language Toggle Block"
//   D  en only, the Custom Block Manager on (harness key): a custom block's
//      entry in "Sidebar", and A4's custom-block sentence
// Phases (PHASES=a,…; default all): seed, fresh, uploads, logo, thumb, home,
// footer, sidebar, custom, r25, omp, extra, admin
// Run: PROBE_FEATURE=U10 PROBE_AGENT=ccK3 node bin/probe.js <app|all> shared/playwright/checks/U10/K3/k3.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'fresh', 'uploads', 'logo', 'thumb', 'home', 'footer', 'sidebar', 'custom', 'r25', 'omp', 'extra', 'admin'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k3]', ...a);
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);

// ---- files -----------------------------------------------------------------
const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
};
const png = (w, h, [r, g, b]) => {
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (w * 3 + 1)] = 0;
        for (let x = 0; x < w; x++) {
            const o = y * (w * 3 + 1) + 1 + x * 3;
            const stripe = (x + y) % 20 < 10;
            raw[o] = stripe ? r : 255; raw[o + 1] = stripe ? g : 255; raw[o + 2] = stripe ? b : 255;
        }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const FILES = {
    logo1: {name: 'k3-logo-red.png', mimeType: 'image/png', buffer: png(300, 80, [200, 30, 30])},
    logo2: {name: 'k3-logo-blue.png', mimeType: 'image/png', buffer: png(180, 60, [30, 30, 200])},
    logo3: {name: 'k3-logo-green.png', mimeType: 'image/png', buffer: png(240, 70, [30, 160, 30])},
    thumb: {name: 'k3-thumb.png', mimeType: 'image/png', buffer: png(120, 120, [120, 30, 160])},
    home: {name: 'k3-home.png', mimeType: 'image/png', buffer: png(600, 200, [30, 140, 160])},
    favicon: {name: 'k3-favicon.png', mimeType: 'image/png', buffer: png(32, 32, [0, 0, 0])},
    pdf: {name: 'k3-doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')},
    css: {name: 'k3-style.css', mimeType: 'text/css', buffer: Buffer.from('body { outline: 1px solid red; }\n')},
};

forEachApp(async (app) => {
    const ctxUrl = (ctx, p = '', locale = 'en') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(app.name, k, JSON.stringify(v).slice(0, 900)); };
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));

    // ---- seed ----------------------------------------------------------------
    if (on('seed') || !st) {
        const t = tag('u10k3');
        const mk = async (suffix, extra = {}) => {
            const tg = `${t}${suffix}`;
            const res = await app.api.createContext({tag: tg, context: {name: `U10 K3 ${suffix.toUpperCase()} ${tg}`, acronym: `K3${suffix.toUpperCase()}`, ...(extra.context || {})},
                users: [{username: `${tg}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}], ...(extra.rest || {})});
            return {path: tg, mgr: `${tg}mgr`, name: `U10 K3 ${suffix.toUpperCase()} ${tg}`, id: res && (res.contextId || res.id || (res.context && res.context.id)) || null};
        };
        const bi = {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']};
        st = {
            t,
            A: await mk('a', {context: bi}),
            B: await mk('b'),
            C: await mk('c', {context: {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA']}}),
            D: await mk('d', {rest: {plugins: {customblockmanagerplugin: {enabled: true}}}}),
        };
        saveState();
        fact('seed', st);
    }

    // RESEED=C (letters): recreate those scratch contexts on a later build or after a failed drive
    if (process.env.RESEED && st) {
        for (const L of process.env.RESEED.split(',')) {
            const tg = `${tag('u10k3')}${L.toLowerCase()}`;
            const extra = L === 'C' ? {context: {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA']}} : L === 'A' ? {context: {primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}} : L === 'D' ? {rest: {plugins: {customblockmanagerplugin: {enabled: true}}}} : {};
            await app.api.createContext({tag: tg, context: {name: `U10 K3 ${L} ${tg}`, acronym: `K3${L}`, ...(extra.context || {})}, users: [{username: `${tg}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'}], ...(extra.rest || {})});
            st[L] = {path: tg, mgr: `${tg}mgr`, name: `U10 K3 ${L} ${tg}`};
        }
        saveState();
        fact('reseed', st);
    }

    const M = await launch(app);
    const V = await launch(app);
    const page = M.page;
    const vis = V.page;
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url()}); d.accept().catch(() => {}); });
    const uploadsSent = [];
    page.on('request', (r) => { if (/temporaryFiles|_uploadPublicFile/.test(r.url())) uploadsSent.push({method: r.method(), url: r.url().replace(/^https?:\/\/[^/]+/, '')}); });

    const snap = async (p, name, extra = {}) => {
        const s = await screen(p).catch((e) => ({error: String(e.message || e)}));
        record(name, {...s, ...extra});
        await shot(p, name).catch(() => {});
        return s;
    };
    const STEPS = process.env.STEPS ? process.env.STEPS.split(',') : null;
    const step = async (name, fn) => {
        if (STEPS && !STEPS.includes(name)) return null;
        log(app.name, '== step', name);
        try { return await fn(); } catch (e) {
            fact(`ERROR-${name}`, String(e.stack || e).slice(0, 900));
            await shot(page, `error-${name}`).catch(() => {});
            if (process.env.STOP === '1') throw e;
            return null;
        }
    };
    const asMgr = async (ctx) => { await signIn(page, st[ctx].mgr, {contextPath: st[ctx].path}); await idle(page); };

    // ---- Settings › Website ---------------------------------------------------
    const openWebsite = async (ctx, top) => {
        await page.goto(ctxUrl(ctx, '/management/settings/website'));
        await idle(page);
        await page.locator(`#${top}-button`).first().click();
        await idle(page); await sleep(600);
    };
    const openSide = async (ctx, side) => {   // appearance side tab: Theme | Setup | Editorial Masthead | Advanced
        await openWebsite(ctx, 'appearance');
        await page.locator('#appearance').getByRole('tab', {name: side, exact: true}).first().click();
        await idle(page); await sleep(800);
    };
    const setupForm = () => page.locator('#appearance-setup form').first();
    const advForm = () => page.locator('#advanced form').first();
    const sidebarList = async () => page.locator('#appearance-setup input[name="sidebar"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: ((e.closest('label') || e.parentElement).querySelector('.pkpFormField--options__optionLabel') || {}).textContent?.trim()})));
    const tickSidebar = async (value, want) => { await page.locator(`#appearance-setup input[name="sidebar"][value="${value}"]`).first().setChecked(want); await sleep(200); };
    const findValue = (list, re) => (list.find((o) => re.test(o.value) || re.test(o.label || '')) || {}).value;
    const saveForm = async (form) => {
        const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await form.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await w;
        let body = null;
        try { body = r ? await r.json() : null; } catch { body = null; }
        const saved = await form.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        await sleep(500);
        const errors = await form.locator('.pkpFieldError').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => {
            const f = e.closest('.pkpFormField, fieldset');
            const lab = f ? (f.querySelector('legend, label') || {}).textContent : null;
            return {field: lab ? lab.replace(/\s+/g, ' ').trim() : null, text: e.textContent.replace(/\s+/g, ' ').trim()};
        })).catch(() => []);
        const notice = (await page.locator('.pkpFormPage__errors, .pkpFormErrors, .pkpFormPage__status, [role="alert"], .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)).filter(Boolean);
        const bodyKeys = body && typeof body === 'object' ? Object.keys(body).slice(0, 20) : null;
        const bodyErr = body && typeof body === 'object' && !body.id ? JSON.stringify(body).slice(0, 600) : null;
        return {status: r ? r.status() : null, method: r ? r.request().method() : null, override: r ? r.request().headers()['x-http-method-override'] || null : null, saved, errors, notice, bodyKeys, bodyErr};
    };
    const saveSetup = () => saveForm(setupForm());
    const typeFooter = async (text, locale = 'en', {replace = true} = {}) => {
        const fid = `appearanceSetup-pageFooter-control-${locale}`;
        await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, fid, {timeout: T});
        const frame = page.locator(`[id="${fid}_ifr"]`);
        await frame.contentFrame().locator('body').click();
        if (replace) { await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); }
        else await page.keyboard.press('Control+End');
        await page.keyboard.type(text);
        await sleep(300);
        return page.evaluate((id) => window.tinymce.get(id).getContent(), fid);
    };
    const footerValue = async (locale = 'en') => page.evaluate((id) => (window.tinymce && window.tinymce.get(id) ? window.tinymce.get(id).getContent() : null), `appearanceSetup-pageFooter-control-${locale}`).catch(() => null);

    // upload boxes: <formId>-<field>-control-<locale>; the style sheet has no locale
    const ctlId = (formId, field, locale) => `${formId}-${field}-control${locale ? '-' + locale : ''}`;
    const inputId = (formId, field, locale) => `${formId}-${field}-hiddenFileId${locale ? '-' + locale : ''}`;
    const boxState = async (formId, field, locale) => {
        const c = page.locator(`[id="${ctlId(formId, field, locale)}"]`);
        if (!(await c.count())) return {present: false};
        const field$ = c.locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]');
        return field$.evaluate((root) => {
            const vis = (e) => e && e.offsetParent !== null;
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const img = root.querySelector('img');
            return {
                present: true,
                visible: vis(root),
                text: txt(root),
                buttons: [...root.querySelectorAll('button')].filter(vis).map((b) => txt(b) || b.getAttribute('aria-label')).filter(Boolean),
                inputs: [...root.querySelectorAll('input:not([type=file]), textarea')].map((i) => {
                    const lab = i.id ? root.querySelector(`label[for="${i.id}"]`) : null;
                    return {id: i.id, type: i.type, value: i.value, visible: vis(i), label: lab ? txt(lab) : null, describedBy: i.getAttribute('aria-describedby')};
                }),
                descriptions: [...root.querySelectorAll('.pkpFormField__description, [id$="-description"]')].filter(vis).map(txt),
                img: img ? {src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, '').slice(0, 200), alt: img.getAttribute('alt'), natural: [img.naturalWidth, img.naturalHeight]} : null,
                errors: [...root.querySelectorAll('.pkpFieldError, .dz-error-message, [class*="error"]')].filter(vis).map(txt).filter(Boolean),
                dzPreviews: root.querySelectorAll('.dz-preview').length,
                fileLink: [...root.querySelectorAll('a')].filter(vis).map((a) => ({text: txt(a), href: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '')})),
            };
        });
    };
    const upload = async (formId, field, locale, file) => {
        const before = uploadsSent.length;
        const w = page.waitForResponse((r) => /temporaryFiles/.test(r.url()), {timeout: 8000}).catch(() => null);
        await page.locator(`[id="${inputId(formId, field, locale)}"]`).setInputFiles(file);
        const r = await w;
        await sleep(1200); await idle(page);
        return {sent: uploadsSent.slice(before), status: r ? r.status() : null, box: await boxState(formId, field, locale)};
    };
    // a file dropped on the box: the drop event the browser fires for a real drag from the desktop
    const drop = async (formId, field, locale, file) => {
        const before = uploadsSent.length;
        const dz = page.locator(`[id="${formId}-${field}-dropzone${locale ? '-' + locale : ''}"]`);
        await dz.evaluate((el, f) => {
            const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
            const dt = new DataTransfer();
            dt.items.add(new File([bytes], f.name, {type: f.mimeType}));
            for (const type of ['dragenter', 'dragover', 'drop']) el.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, dataTransfer: dt}));
        }, {b64: file.buffer.toString('base64'), name: file.name, mimeType: file.mimeType});
        await sleep(2000); await idle(page);
        return {sent: uploadsSent.slice(before), box: await boxState(formId, field, locale)};
    };
    const altInput = (formId, field, locale) => page.locator(`[id="${ctlId(formId, field, locale)}"]`).locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]').locator('input[type="text"], textarea').first();
    const pressInBox = async (formId, field, locale, name) => {
        const f = page.locator(`[id="${ctlId(formId, field, locale)}"]`).locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]');
        await f.getByRole('button', {name, exact: true}).first().click();
        await sleep(700);
        return boxState(formId, field, locale);
    };

    // ---- Plugins grid -----------------------------------------------------------
    const pluginRow = (id) => page.locator(`tr.gridRow[id$="-row-${id}"]`).first();
    const blockRows = async () => page.locator('tr.gridRow[id*="settingsplugingrid"]').evaluateAll((trs) => trs.map((tr) => {
        const box = tr.querySelector('input[type=checkbox]');
        const tb = tr.closest('tbody');
        return {id: tr.id.replace(/^.*-row-/, ''), category: tb ? tb.id.replace(/^.*-category-/, '').replace(/-.*$/, '') : null, text: tr.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), checked: box ? box.checked : null};
    }).filter((r) => /block/i.test(r.category || '') || /block/i.test(r.id)));
    const setPlugin = async (id, want) => {
        const row = pluginRow(id);
        await row.waitFor({timeout: T});
        const box = row.getByRole('checkbox').first();
        const was = await box.isChecked();
        if (was === want) return {was, changed: false};
        const w = page.waitForResponse((r) => /plugin-grid\/(enable|disable)/.test(r.url()), {timeout: T}).catch(() => null);
        await box.click({noWaitAfter: true});
        await sleep(800);
        let ask = null;
        const dlg = page.locator('[role="dialog"]:visible').last();
        if (await dlg.count()) {
            ask = flat(await dlg.innerText().catch(() => ''), 400);
            const ok = dlg.getByRole('button', {name: /^(OK|Yes)$/}).first();
            if (await ok.count()) await ok.click();
        }
        const r = await w;
        await sleep(900); await idle(page);
        const toast = (await page.locator('.pkp_notification, .pkpNotification, [class*="toast"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
        return {was, changed: true, ask, status: r ? r.status() : null, toast, now: await box.isChecked().catch(() => null)};
    };

    // ---- the public side --------------------------------------------------------
    const pub = async (ctx, p, name, locale = 'en') => {
        let status = null;
        try { const r = await vis.goto(ctx === 'index' ? app.url(`/index.php/index/${locale}${p}`) : ctxUrl(ctx, p, locale)); status = r ? r.status() : null; } catch (e) { status = String(e.message || e); }
        await idle(vis).catch(() => {});
        await vis.waitForFunction(() => [...document.images].every((i) => i.complete), null, {timeout: 5000}).catch(() => {});
        const d = await vis.evaluate(() => {
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)}; };
            const sn = document.querySelector('.pkp_site_name');
            const a = sn && sn.querySelector('a');
            const img = sn && sn.querySelector('img');
            const side = document.querySelector('.pkp_structure_sidebar');
            const fc = document.querySelector('.pkp_footer_content');
            const brand = document.querySelector('.pkp_brand_footer');
            const main = document.querySelector('.pkp_structure_main');
            return {
                lang: document.documentElement.lang,
                pageCls: (document.querySelector('.pkp_structure_page') || {}).className || null,
                header: {
                    linkHref: a ? (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '') : null, linkCls: a ? a.className : null, linkText: txt(a),
                    img: img ? {src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), hasAlt: img.hasAttribute('alt'), alt: img.getAttribute('alt'), width: img.getAttribute('width'), height: img.getAttribute('height'), natural: [img.naturalWidth, img.naturalHeight], rendered: box(img)} : null,
                    html: sn ? sn.outerHTML.replace(/\s+/g, ' ').slice(0, 700) : null,
                },
                footer: {content: fc ? txt(fc) : null, contentHtml: fc ? fc.innerHTML.replace(/\s+/g, ' ').trim().slice(0, 300) : null, contentBeforeBrand: fc && brand ? !!(fc.compareDocumentPosition(brand) & Node.DOCUMENT_POSITION_FOLLOWING) : null, contentBox: box(fc), brandBox: box(brand), brandText: txt(brand)},
                sidebar: {present: !!side, box: box(side), blocks: side ? [...side.querySelectorAll('.pkp_block')].map((b) => ({id: b.id || null, cls: b.className, heading: txt(b.querySelector('h2, h3, .title')), content: txt(b).slice(0, 120)})) : []},
                mainBox: box(main),
                homeImg: (() => { const hi = document.querySelector('.homepage_image img, .homepage_image, img.homepage_image'); const i = document.querySelector('.homepage_image img') || [...document.images].find((x) => /homepageImage/.test(x.getAttribute('src') || '')); return i ? {src: (i.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), hasAlt: i.hasAttribute('alt'), alt: i.getAttribute('alt'), natural: [i.naturalWidth, i.naturalHeight], wrapperCls: i.parentElement ? i.parentElement.className : null, outer: i.outerHTML.slice(0, 300)} : (hi ? {wrapper: hi.outerHTML.slice(0, 300)} : null); })(),
                headings: [...document.querySelectorAll('.pkp_structure_main h1, .pkp_structure_main h2, .pkp_structure_main h3')].map(txt).filter(Boolean).slice(0, 20),
            };
        });
        const headerAria = await vis.locator('.pkp_site_name').first().ariaSnapshot({timeout: 3000}).catch(() => null);
        const sidebarAria = d.sidebar.present ? await vis.locator('.pkp_structure_sidebar').first().ariaSnapshot({timeout: 3000}).catch(() => null) : null;
        const s = await screen(vis).catch(() => null);
        record(name, {status, url: vis.url(), ...d, headerAria, sidebarAria, screen: s});
        await shot(vis, name).catch(() => {});
        return {status, url: vis.url().replace(/^https?:\/\/[^/]+/, ''), ...d, headerAria, sidebarAria};
    };
    const side = (x) => ({present: x.sidebar.present, blocks: x.sidebar.blocks.map((b) => `${b.id || b.cls}|${b.heading || ''}`), pageCls: x.pageCls, mainW: x.mainBox && x.mainBox.w, mainX: x.mainBox && x.mainBox.x, sideBox: x.sidebar.box});
    const hdr = (x) => ({link: x.header.linkHref, cls: x.header.linkCls, text: x.header.linkText, img: x.header.img, aria: x.headerAria});

    try {
        // ======================= fresh (B, untouched) ==========================
        if (on('fresh')) {
            await asMgr('B');
            await step('fresh-setup', async () => {
                await openSide(st.B.path, 'Setup');
                const list = await sidebarList();
                const tabs = await page.locator('[role="tab"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({id: e.id, text: e.innerText.trim(), sel: e.getAttribute('aria-selected')})));
                const fields = await setupForm().evaluate((f) => [...f.querySelectorAll('.pkpFormField, fieldset')].filter((e) => e.offsetParent !== null && !e.parentElement.closest('.pkpFormField')).map((e) => ({
                    label: ((e.querySelector('.pkpFormFieldLabel, legend') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
                    cls: e.className, help: (e.querySelector('[id$="-tooltip-en"], [id*="-tooltip"]') || {}).textContent || null,
                    description: (e.querySelector('.pkpFormField__description') || {}).textContent || null,
                    helpIcon: !!e.querySelector('.tooltipButton'),
                })));
                const omp = app.name === 'omp' ? await page.evaluate(() => ({
                    featured: [...document.querySelectorAll('#appearance-setup input[name="displayFeaturedBooks"]')].map((i) => i.checked),
                    newReleases: [...document.querySelectorAll('#appearance-setup input[name="displayNewReleases"]')].map((i) => i.checked),
                    order: [...document.querySelectorAll('#appearance-setup input[name="catalogSortOption"]')].map((i) => ({value: i.value, checked: i.checked, label: i.closest('label').innerText.trim()})),
                })) : null;
                const footerEn = await footerValue('en');
                const toolbar = await page.locator('#appearance-setup .tox-toolbar__primary button').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label')));
                const boxes = {};
                for (const f of ['pageHeaderLogoImage', `${app.name === 'ojs' ? 'journal' : app.name === 'omp' ? 'press' : 'server'}Thumbnail`, 'homepageImage']) boxes[f] = await boxState('appearanceSetup', f, 'en');
                const buttonsInForm = await setupForm().locator('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((b) => (b.innerText.trim() || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ')).filter(Boolean));
                const saveIsLast = await setupForm().evaluate((f) => { const bs = [...f.querySelectorAll('button')].filter((b) => b.offsetParent !== null); const last = bs[bs.length - 1]; return last ? last.innerText.trim() : null; });
                await snap(page, 'fresh-setup', {list, tabs, fields, omp, footerEn, toolbar, boxes, buttonsInForm, saveIsLast});
                fact('fresh-setup', {list, fields, omp, footerEn, toolbar, boxes, saveIsLast});
                // the help icon: hover each and read the bubble
                const helps = [];
                for (const icon of await page.locator('#appearance-setup .tooltipButton').all()) {
                    await icon.hover().catch(() => {});
                    await sleep(700);
                    const bubble = flat(await page.locator('.v-popper__popper--shown, .v-popper__popper[aria-hidden="false"], [role="tooltip"]').last().innerText().catch(() => null), 300);
                    const lab = flat(await icon.locator('xpath=ancestor::div[contains(@class,"pkpFormField__heading")][1]').innerText().catch(() => null), 80);
                    helps.push({label: lab, bubble});
                    await page.mouse.move(5, 5); await sleep(300);
                }
                fact('fresh-help-hover', helps);
                // the "Sidebar" field: arrows, drag handle, the boxes' accessible names
                const aria = await page.locator('#appearance-setup fieldset.pkpFormField--optionsOrderable').first().ariaSnapshot().catch(() => null);
                const rowParts = await page.locator('#appearance-setup fieldset.pkpFormField--optionsOrderable label').evaluateAll((ls) => ls.map((l) => ({handle: !!l.querySelector('.orderer__dragDrop'), up: (l.querySelector('.orderer__up') || {}).textContent?.trim() || null, down: (l.querySelector('.orderer__down') || {}).textContent?.trim() || null, upType: (l.querySelector('.orderer__up') || {}).type || null})));
                fact('fresh-sidebar-parts', {aria, rowParts});
                await loc(page, 'Appearance › Setup: the "Sidebar" field', page.locator('#appearance-setup fieldset.pkpFormField--optionsOrderable'));
                await loc(page, 'Appearance › Setup: a "Sidebar" box by block name', page.locator('#appearance-setup input[name="sidebar"][value="languagetoggleblockplugin"]'));
                await loc(page, 'Appearance › Setup: a block\'s up arrow', page.getByRole('button', {name: 'Increase position of Language Toggle Block', exact: true}));
                await loc(page, 'Appearance › Setup: the "Logo" file input (en)', page.locator('#appearanceSetup-pageHeaderLogoImage-hiddenFileId-en'));
                await loc(page, 'Appearance › Setup: the "Save" button', setupForm().getByRole('button', {name: 'Save', exact: true}));
            });
            await step('fresh-tabs', async () => {
                // each side tab: one form, "Save" at its foot
                const out = {};
                for (const [top, sides] of [['appearance', ['Theme', 'Setup', 'Editorial Masthead', 'Advanced']], ['setup', ['Lists', 'Date & Time']]]) {
                    await openWebsite(st.B.path, top);
                    for (const s of sides) {
                        await page.locator(`#${top}`).getByRole('tab', {name: s, exact: true}).first().click();
                        await idle(page); await sleep(700);
                        const panel = page.locator(`[role="tabpanel"]:visible`).filter({has: page.locator('form')}).last();
                        out[`${top}/${s}`] = await panel.evaluate((p) => {
                            const forms = [...p.querySelectorAll('form')].filter((f) => f.offsetParent !== null);
                            return forms.map((f) => { const bs = [...f.querySelectorAll('button')].filter((b) => b.offsetParent !== null); const saves = bs.filter((b) => b.innerText.trim() === 'Save'); const last = bs[bs.length - 1]; const fr = f.getBoundingClientRect(); const sr = saves[0] ? saves[0].getBoundingClientRect() : null; return {saves: saves.length, lastButton: last ? last.innerText.trim() : null, saveAtFoot: sr ? Math.round(fr.bottom - sr.bottom) : null, id: p.id}; });
                        }).catch((e) => String(e.message));
                    }
                }
                fact('fresh-tabs', out);
            });
            await step('fresh-advanced', async () => {
                await openSide(st.B.path, 'Advanced');
                const boxes = {styleSheet: await boxState('appearanceAdvanced', 'styleSheet', null), favicon: await boxState('appearanceAdvanced', 'favicon', 'en')};
                const accepts = await page.locator('#advanced input[type=file]').evaluateAll((els) => els.map((e) => ({id: e.id, accept: e.accept})));
                const covers = app.name === 'omp' ? {w: await page.locator('input[name="coverThumbnailsMaxWidth"]').inputValue().catch(() => null), h: await page.locator('input[name="coverThumbnailsMaxHeight"]').inputValue().catch(() => null)} : null;
                await snap(page, 'fresh-advanced', {boxes, accepts, covers});
                fact('fresh-advanced', {boxes, accepts, covers});
            });
            await step('fresh-plugins', async () => {
                await openWebsite(st.B.path, 'plugins');
                await page.locator('tr.gridRow[id*="settingsplugingrid"]').first().waitFor({timeout: T});
                const rows = await blockRows();
                await snap(page, 'fresh-plugins', {rows});
                fact('fresh-plugins-blocks', rows);
                await loc(page, 'Plugins: the Language Toggle Block row\'s box', pluginRow('languagetoggleblockplugin').getByRole('checkbox'));
            });
            await step('fresh-public', async () => {
                const x = await pub(st.B.path, '', 'fresh-public-home');
                const y = await pub(st.B.path, '/about', 'fresh-public-about');
                fact('fresh-public', {home: {hdr: hdr(x), side: side(x), footer: x.footer}, about: {hdr: hdr(y), side: side(y), footer: y.footer}});
            });
        }

        // ======================= uploads (A): td3, the boxes, per language =====
        if (on('uploads')) {
            await asMgr('A');
            const A = st.A.path;
            await step('up-locales', async () => {
                await openSide(A, 'Setup');
                const before = await page.locator('#appearance-setup .pkpFormLocales').innerText().catch(() => null);
                await snap(page, 'up-setup-en', {before});
                await page.locator('#appearance-setup .pkpFormLocales').getByRole('button', {name: 'French'}).click();
                await sleep(800);
                const after = await page.locator('#appearance-setup .pkpFormLocales').innerText().catch(() => null);
                const visibleLabels = await setupForm().locator('.pkpFormFieldLabel, legend').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
                await snap(page, 'up-setup-fr-shown', {after, visibleLabels});
                fact('up-locales', {before, after, visibleLabels});
            });
            await step('up-refused', async () => {
                await openSide(A, 'Setup');
                const viaInput = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.pdf);
                await snap(page, 'up-logo-pdf-input', {viaInput});
                await openSide(A, 'Setup');
                const viaDrop = await drop('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.pdf);
                await snap(page, 'up-logo-pdf-drop', {viaDrop});
                fact('up-logo-pdf', {viaInput, viaDrop});
                await openSide(A, 'Advanced');
                const cssPng = await drop('appearanceAdvanced', 'styleSheet', null, FILES.favicon);
                await snap(page, 'up-style-png-drop', {cssPng});
                await openSide(A, 'Advanced');
                const cssPngInput = await upload('appearanceAdvanced', 'styleSheet', null, FILES.favicon);
                await snap(page, 'up-style-png-input', {cssPngInput});
                await openSide(A, 'Advanced');
                const favPdf = await drop('appearanceAdvanced', 'favicon', 'en', FILES.pdf);
                fact('up-advanced-refused', {cssPng, cssPngInput, favPdf});
                // accepted files on Advanced: what each box shows (left unsaved)
                await openSide(A, 'Advanced');
                const css = await upload('appearanceAdvanced', 'styleSheet', null, FILES.css);
                const fav = await upload('appearanceAdvanced', 'favicon', 'en', FILES.favicon);
                await snap(page, 'up-advanced-accepted', {css, fav});
                fact('up-advanced-accepted', {css, fav});
            });
            await step('up-refused-after', async () => {
                // after a refused file: what "Save" does, and whether a picture can follow
                await openSide(A, 'Setup');
                const refused = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.pdf);
                const footerMsg = flat(await setupForm().locator('.pkpFormPage__footer').innerText().catch(() => null), 200);
                const nReq = uploadsSent.length;
                const reqs = [];
                const onReq = (r) => { if (r.method() !== 'GET') reqs.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); };
                const saveBtn = setupForm().getByRole('button', {name: 'Save', exact: true});
                const saveDisabled = await saveBtn.isDisabled();
                page.on('request', onReq);
                if (!saveDisabled) await saveBtn.click();
                // the footer's "Jump to next error"
                const jump = setupForm().getByRole('button', {name: /Jump to next error/}).or(setupForm().getByRole('link', {name: /Jump to next error/})).first();
                const hasJump = await jump.count();
                if (hasJump) await jump.click().catch(() => {});
                await sleep(1500);
                page.off('request', onReq);
                const focused = await page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName}#${e.id}` : null; });
                const afterSave = {saveDisabled, hasJump, focused, footer: flat(await setupForm().locator('.pkpFormPage__footer').innerText().catch(() => null), 200), saved: await setupForm().locator('[role="status"]:has-text("Saved")').count(), box: await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en')};
                await snap(page, 'up-refused-then-save', {refused: refused.box, footerMsg, reqs, afterSave});
                // the user's ways to a second file: "Upload File" (the file chooser), a drop, the preview's own remove link
                const upBtn = page.locator('#appearanceSetup-pageHeaderLogoImage-clickable-en');
                const uploadDisabled = await upBtn.isDisabled().catch(() => null);
                let fc = null;
                if (uploadDisabled === false) {
                    const chooser = page.waitForEvent('filechooser', {timeout: 8000}).catch(() => null);
                    await upBtn.click();
                    fc = await chooser;
                    if (fc) await fc.setFiles(FILES.logo1);
                    await sleep(2500); await idle(page);
                }
                const rmLink = page.locator('#appearanceSetup-pageHeaderLogoImage-control-en .dz-remove, #appearanceSetup-pageHeaderLogoImage-control-en a:has-text("Remove file")').first();
                const rmVisible = await rmLink.isVisible().catch(() => false);
                const rmBox = await rmLink.boundingBox().catch(() => null);
                const rmStyle = await rmLink.evaluate((a) => { const cs = getComputedStyle(a); return {display: cs.display, opacity: cs.opacity, visibility: cs.visibility, fontSize: cs.fontSize}; }).catch(() => null);
                const dropped = await drop('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo1);
                const next = {uploadDisabled, chooserOpened: !!fc, rmVisible, rmBox, rmStyle, sent: dropped.sent, box: dropped.box};
                const inputs = await page.locator('#appearance-setup input[type=file]').evaluateAll((els) => els.map((e) => e.id || '(no id)'));
                const footerNext = flat(await setupForm().locator('.pkpFormPage__footer').innerText().catch(() => null), 200);
                const saveDisabledNext = await saveBtn.isDisabled();
                // and after removing the picture again
                const removedNext = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove').catch((e) => String(e.message));
                const saveDisabledRemoved = await saveBtn.isDisabled();
                fact('up-refused-after-next', {saveDisabledNext, removedNext: removedNext.buttons || removedNext, saveDisabledRemoved, footerRemoved: flat(await setupForm().locator('.pkpFormPage__footer').innerText().catch(() => null), 200)});
                await snap(page, 'up-refused-then-picture', {next, footerNext});
                fact('up-refused-after', {inputs, chooserOpened: next.chooserOpened, footerMsg, reqsOnSave: reqs, afterSave, next: {sent: next.sent, buttons: next.box.buttons, errors: next.box.errors, img: next.box.img && next.box.img.natural}, footerNext});
            });
            await step('up-accepted', async () => {
                await openSide(A, 'Setup');
                const empty = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                const dropped = await drop('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo1);
                await snap(page, 'up-logo-dropped', {dropped});
                await loc(page, 'Appearance › Setup: the "Logo" box\'s "Alternate text"', altInput('appearanceSetup', 'pageHeaderLogoImage', 'en'));
                const removed = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                await snap(page, 'up-logo-removed', {removed});
                let restored = null;
                const hasRestore = removed.buttons && removed.buttons.includes('Restore Original');
                if (hasRestore) { restored = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Restore Original'); await snap(page, 'up-logo-restored-empty', {restored}); }
                fact('up-logo-accepted', {empty, dropped, removed, hasRestore, restored});
                // unsaved: a side-tab switch, then leaving the page
                const up = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo1);
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').fill('Unsaved logo');
                await page.locator('#appearance').getByRole('tab', {name: 'Theme', exact: true}).first().click();
                await idle(page); await sleep(600);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click();
                await idle(page); await sleep(600);
                const afterSwitch = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                const vis1 = await pub(A, '', 'up-unsaved-public');
                const nd = dialogs.length;
                await page.locator('#appearance-setup').click({position: {x: 5, y: 5}}).catch(() => {});
                await page.goto(ctxUrl(A, '/management/settings/context')).catch((e) => fact('up-leave-goto', String(e.message)));
                await idle(page);
                const leftTo = page.url().replace(/^https?:\/\/[^/]+/, '');
                await openSide(A, 'Setup');
                const back = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                await snap(page, 'up-unsaved-back', {back});
                fact('up-unsaved', {uploaded: up.box, afterSwitch, public: hdr(vis1), dialogs: dialogs.slice(nd), leftTo, back});
            });
        }

        // ======================= logo (A): td23, A2, Rule 20 ======================
        if (on('logo')) {
            await asMgr('A');
            const A = st.A.path;
            await step('logo-alt', async () => {
                await openSide(A, 'Setup');
                const up = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo1);
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').fill('Journal logo');
                const save = await saveSetup();
                const box = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                await snap(page, 'logo-alt-saved', {save, box});
                const home = await pub(A, '', 'logo-alt-public-home');
                const about = await pub(A, '/about', 'logo-alt-public-about');
                const fr = await pub(A, '', 'logo-alt-public-home-fr', 'fr_CA');
                await loc(vis, 'public header: the logo link', vis.locator('.pkp_site_name a.is_img'));
                // where the link leads
                await vis.goto(ctxUrl(A, '/about')); await idle(vis);
                await vis.locator('.pkp_site_name a').first().click(); await idle(vis);
                const leadsTo = vis.url().replace(/^https?:\/\/[^/]+/, '');
                fact('logo-alt', {upStatus: up.status, save, box, home: hdr(home), about: hdr(about), fr: hdr(fr), leadsTo});
            });
            await step('logo-restore', async () => {
                await openSide(A, 'Setup');
                const opened = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                const up = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo2);
                const removed = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const restored = removed.buttons.includes('Restore Original') ? await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Restore Original') : null;
                await snap(page, 'logo-restore', {opened, up: up.box, removed, restored});
                const removed2 = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const restored2 = removed2.buttons.includes('Restore Original') ? await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Restore Original') : null;
                fact('logo-restore', {opened, afterUpload: up.box, removed, restored, removedOriginal: removed2, restored2});
            });
            await step('logo-noalt', async () => {
                await openSide(A, 'Setup');
                await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const up = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo3);
                const alt = await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').inputValue().catch(() => null);
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').fill('');
                const save = await saveSetup();
                await snap(page, 'logo-noalt-saved', {save, altBefore: alt});
                const home = await pub(A, '', 'logo-noalt-public-home');
                const namedLinks = await vis.locator('.pkp_site_name').getByRole('link').evaluateAll((els) => els.length);
                fact('logo-noalt', {altPrefilled: alt, save, home: hdr(home), namedLinks});
            });
            await step('logo-remove', async () => {
                await openSide(A, 'Setup');
                const removed = await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const save = await saveSetup();
                await snap(page, 'logo-removed-saved', {save, removed});
                const home = await pub(A, '', 'logo-removed-public-home');
                const about = await pub(A, '/about', 'logo-removed-public-about');
                fact('logo-remove', {removed, save, home: hdr(home), about: hdr(about)});
            });
        }

        // ======================= thumbnail (A): td24, Rule 21 =====================
        if (on('thumb')) {
            await asMgr('A');
            const A = st.A.path;
            const field = `${app.name === 'ojs' ? 'journal' : app.name === 'omp' ? 'press' : 'server'}Thumbnail`;
            await step('thumb', async () => {
                await openSide(A, 'Setup');
                const up = await upload('appearanceSetup', field, 'en', FILES.thumb);
                await altInput('appearanceSetup', field, 'en').fill('Thumb');
                const save = await saveSetup();
                await snap(page, 'thumb-saved', {save, box: await boxState('appearanceSetup', field, 'en')});
                let status = null;
                try { const r = await vis.goto(app.url('/index.php/index/en'), {timeout: 60_000}); status = r ? r.status() : null; } catch (e) { status = String(e.message); }
                await idle(vis).catch(() => {});
                const entry = await vis.evaluate((p) => {
                    const links = [...document.querySelectorAll(`a[href*="/index.php/${p}"]`)];
                    const li = links.length ? links[0].closest('li, .journal, .press, .server, article, div') : null;
                    const img = li ? li.querySelector('img') : null;
                    return {count: document.querySelectorAll('.journals li, .presses li, .servers li, ul.journals > li').length, links: links.length, html: li ? li.outerHTML.replace(/\s+/g, ' ').slice(0, 1200) : null,
                        img: img ? {src: (img.getAttribute('src') || '').replace(/^https?:\/\/[^/]+/, ''), hasAlt: img.hasAttribute('alt'), alt: img.getAttribute('alt'), natural: [img.naturalWidth, img.naturalHeight]} : null};
                }, A);
                const li = vis.locator(`a[href*="/index.php/${A}"]`).first().locator('xpath=ancestor::li[1]');
                if (await li.count()) { await li.scrollIntoViewIfNeeded().catch(() => {}); await li.screenshot({path: path.join(outDir(), `thumb-site-entry-${app.name}.png`)}).catch(() => {}); }
                const aria = await li.ariaSnapshot({timeout: 3000}).catch(() => null);
                record('thumb-site-index', {status, entry, aria, title: await vis.title()});
                fact('thumb', {upStatus: up.status, save, siteStatus: status, entry, aria});
            });
        }

        // ======================= homepage image (A): A1, Settings 11 ===============
        if (on('home')) {
            await asMgr('A');
            const A = st.A.path;
            await step('home', async () => {
                await openSide(A, 'Setup');
                const up = await upload('appearanceSetup', 'homepageImage', 'en', FILES.home);
                await altInput('appearanceSetup', 'homepageImage', 'en').fill('Home picture');
                const save = await saveSetup();
                await snap(page, 'home-saved', {save, box: await boxState('appearanceSetup', 'homepageImage', 'en')});
                await page.reload(); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {});
                await idle(page); await sleep(700);
                const reloaded = await boxState('appearanceSetup', 'homepageImage', 'en');
                const home = await pub(A, '', 'home-public');
                const imgAria = await vis.locator('img[src*="homepageImage"]').first().ariaSnapshot({timeout: 3000}).catch(() => null);
                const about = await pub(A, '/about', 'home-public-about');
                fact('home', {upStatus: up.status, save, reloaded, homeImg: home.homeImg, imgAria, onAbout: about.homeImg});
            });
        }

        // ======================= footer (A): td25, Rule 22 ===========================
        if (on('footer')) {
            await asMgr('A');
            const A = st.A.path;
            await step('footer', async () => {
                await openSide(A, 'Setup');
                const typed = await typeFooter('Footer line');
                const save = await saveSetup();
                await snap(page, 'footer-saved', {save, typed});
                const home = await pub(A, '', 'footer-public-home');
                const about = await pub(A, '/about', 'footer-public-about');
                const fr = await pub(A, '', 'footer-public-home-fr', 'fr_CA');
                fact('footer', {typed, save, home: home.footer, about: about.footer, fr: fr.footer});
            });
        }

        // ======================= sidebar (B): td26, Rules 23–24 =======================
        if (on('sidebar')) {
            await asMgr('B');
            const B = st.B.path;
            await step('sb-arrange', async () => {
                await openSide(B, 'Setup');
                const list0 = await sidebarList();
                const lt = findValue(list0, /languagetoggle/i);
                const wf = findValue(list0, /webfeed/i);
                await tickSidebar(lt, true);
                await tickSidebar(wf, true);
                const list1 = await sidebarList();
                // the second of the two ticked (in list order) up with its arrow
                const ticked = list1.filter((o) => o.checked);
                const second = ticked[1];
                const nReq = uploadsSent.length;
                const reqs = [];
                const onReq = (r) => { if (r.method() !== 'GET') reqs.push(`${r.method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')}`); };
                page.on('request', onReq);
                await page.getByRole('button', {name: `Increase position of ${second.label}`, exact: true}).click();
                await sleep(800);
                page.off('request', onReq);
                const list2 = await sidebarList();
                await snap(page, 'sb-arranged-unsaved', {list0, list1, second, list2, reqs});
                const save = await saveSetup();
                await page.reload(); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(700);
                const list3 = await sidebarList();
                await snap(page, 'sb-saved-reloaded', {list3});
                const home = await pub(B, '', 'sb-public-home');
                const about = await pub(B, '/about', 'sb-public-about');
                fact('sb-arrange', {list0, list1, moved: second.label, reqsOnArrow: reqs, list2, save, list3, home: side(home), about: side(about), homeAria: home.sidebarAria});
            });
            await step('sb-drag', async () => {
                await openSide(B, 'Setup');
                const before = await sidebarList();
                const rows = page.locator('#appearance-setup fieldset.pkpFormField--optionsOrderable label');
                const n = await rows.count();
                const src = rows.nth(n - 1).locator('.orderer__dragDrop');
                const dst = rows.nth(0);
                await src.dragTo(dst).catch((e) => fact('sb-drag-error', String(e.message)));
                await sleep(800);
                const after1 = await sidebarList();
                // a manual mouse drag as well
                const sb = await rows.nth(n - 1).locator('.orderer__dragDrop').boundingBox();
                const db = await rows.nth(0).boundingBox();
                if (sb && db) {
                    await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
                    await page.mouse.down();
                    for (let i = 1; i <= 10; i++) { await page.mouse.move(sb.x + sb.width / 2, sb.y + (db.y - sb.y) * i / 10 + 2); await sleep(40); }
                    await page.mouse.up();
                }
                await sleep(800);
                const after2 = await sidebarList();
                await snap(page, 'sb-dragged-unsaved', {before, after1, after2});
                fact('sb-drag', {before: before.map((o) => o.label), afterDragTo: after1.map((o) => o.label), afterMouse: after2.map((o) => o.label)});
            });
            await step('sb-untick', async () => {
                await openSide(B, 'Setup');
                const list = await sidebarList();
                for (const o of list.filter((x) => x.checked)) await tickSidebar(o.value, false);
                const save = await saveSetup();
                const home = await pub(B, '', 'sb-none-public-home');
                const about = await pub(B, '/about', 'sb-none-public-about');
                fact('sb-untick', {save, home: side(home), about: side(about)});
            });
            await step('sb-added-later', async () => {
                // one block placed, then a plugin with a block enabled: where its box lands
                await openSide(B, 'Setup');
                const list = await sidebarList();
                const lt = findValue(list, /languagetoggle/i);
                await tickSidebar(lt, true);
                const save = await saveSetup();
                await openWebsite(B, 'plugins');
                const en = await setPlugin('developedbyblockplugin', true);
                await openSide(B, 'Setup');
                const after = await sidebarList();
                await snap(page, 'sb-added-later', {after, en});
                fact('sb-added-later', {save, enable: en, after});
                // back as it was
                await openWebsite(B, 'plugins');
                fact('sb-added-later-restore', await setPlugin('developedbyblockplugin', false));
            });
        }

        // ======================= custom (D): the custom block's entry; A4 custom ==========
        if (on('custom')) {
            await asMgr('D');
            const D = st.D.path;
            const managerDialog = () => page.locator('[role="dialog"]:visible').filter({has: page.locator('[id*="customblock"], [id*="customBlock"]')}).first();
            await step('cb-add', async () => {
                await openSide(D, 'Setup');
                const list0 = await sidebarList();
                const lt = findValue(list0, /languagetoggle/i);
                await tickSidebar(lt, true);
                const save0 = await saveSetup();
                await openWebsite(D, 'plugins');
                const row = pluginRow('customblockmanagerplugin');
                const opener = row.locator('a.show_extras');
                if (await opener.count()) { await opener.first().click(); await sleep(400); }
                const id = await row.getAttribute('id');
                await page.locator(`[id="${id}-control-row"]`).getByRole('link', {name: 'Manage Custom Blocks', exact: true}).first().click();
                await managerDialog().waitFor({timeout: T});
                await idle(page); await sleep(500);
                await managerDialog().getByRole('link', {name: 'Add Block', exact: true}).first().click();
                const form = page.locator('form#customBlockForm:visible').first();
                await form.waitFor({timeout: T}); await idle(page);
                await form.locator('input[name="blockTitle[en]"]').fill('K3 Partners');
                const ta = form.locator('textarea[name^="blockContent"]').first();
                const tid = await ta.getAttribute('id');
                await page.waitForFunction((x) => window.tinymce && window.tinymce.get(x) && window.tinymce.get(x).initialized, tid, {timeout: T}).catch(() => {});
                await page.locator(`[id="${tid}_ifr"]`).contentFrame().locator('body').click();
                await page.keyboard.type('Partner list');
                const w = page.waitForResponse((r) => /update-?custom-?block/i.test(r.url()), {timeout: T}).catch(() => null);
                await form.locator('button[id^="submitFormButton"], button[type=submit]').first().click();
                const r = await w;
                await sleep(1200); await idle(page);
                await openSide(D, 'Setup');
                const list1 = await sidebarList();
                await snap(page, 'cb-added-sidebar', {list0, list1});
                st.D.block = findValue(list1, /k3-partners|partners/i);
                saveState();
                fact('cb-add', {save0, blockSave: r ? r.status() : null, list0, list1});
            });
            await step('cb-a4', async () => {
                // the custom block placed, the manager plugin off, "Save" on "Setup" with a new footer
                await openSide(D, 'Setup');
                if (st.D.block) await tickSidebar(st.D.block, true);
                const save1 = await saveSetup();
                const x = await pub(D, '', 'cb-placed-public');
                await openWebsite(D, 'plugins');
                const off = await setPlugin('customblockmanagerplugin', false);
                await openSide(D, 'Setup');
                const listOff = await sidebarList();
                await typeFooter('Footer line');
                const save2 = await saveSetup();
                await snap(page, 'cb-a4-refused', {listOff, save2});
                const y = await pub(D, '', 'cb-off-public');
                await openWebsite(D, 'plugins');
                const onAgain = await setPlugin('customblockmanagerplugin', true);
                fact('cb-a4', {save1, placed: side(x), off, listOff, save2, offPublic: side(y), onAgain});
            });
        }

        // ======================= r25 (C): td27, Rule 25, A4 ============================
        if (on('r25')) {
            await asMgr('C');
            const C = st.C.path;
            await step('r25-place', async () => {
                await openSide(C, 'Setup');
                const list0 = await sidebarList();
                const lt = findValue(list0, /languagetoggle/i);
                const wf = findValue(list0, /webfeed/i);
                await tickSidebar(lt, true); await tickSidebar(wf, true);
                // "Language Toggle Block" first
                let l = await sidebarList();
                for (let i = 0; i < 6 && l.findIndex((o) => o.value === lt) > l.findIndex((o) => o.value === wf); i++) {
                    await page.getByRole('button', {name: `Increase position of ${l.find((o) => o.value === lt).label}`, exact: true}).click();
                    await sleep(400);
                    l = await sidebarList();
                }
                const save = await saveSetup();
                l = await sidebarList();
                const x = await pub(C, '', 'r25-placed-public');
                st.C.lt = lt; st.C.wf = wf; saveState();
                fact('r25-place', {save, list: l, public: side(x)});
            });
            await step('r25-off', async () => {
                await openWebsite(C, 'plugins');
                const off = await setPlugin('languagetoggleblockplugin', false);
                await snap(page, 'r25-plugin-off', {off});
                await openSide(C, 'Setup');
                const list = await sidebarList();
                await snap(page, 'r25-sidebar-off', {list});
                const x = await pub(C, '', 'r25-off-public');
                const y = await pub(C, '/about', 'r25-off-public-about');
                await openSide(C, 'Setup');
                const typed = await typeFooter('Footer line');
                const save = await saveSetup();
                await snap(page, 'r25-footer-save-refused', {save, typed});
                const z = await pub(C, '', 'r25-off-public-after-save');
                fact('r25-off', {off, list, public: side(x), about: side(y), save, footerAfter: z.footer.content});
            });
            await step('r25-on', async () => {
                await openWebsite(C, 'plugins');
                const onAgain = await setPlugin('languagetoggleblockplugin', true);
                await openSide(C, 'Setup');
                const list = await sidebarList();
                const footer = await footerValue();
                await snap(page, 'r25-sidebar-on-again', {list, footer});
                const x = await pub(C, '', 'r25-on-public');
                fact('r25-on', {onAgain, list, footer, public: side(x)});
            });
            await step('r25-changed', async () => {
                await openWebsite(C, 'plugins');
                const off = await setPlugin('languagetoggleblockplugin', false);
                await openSide(C, 'Setup');
                const listOff = await sidebarList();
                // change the "Sidebar" list: untick and tick "Web Feed Plugin" again
                await tickSidebar(st.C.wf, false); await tickSidebar(st.C.wf, true);
                const save = await saveSetup();
                const listSaved = await sidebarList();
                await snap(page, 'r25-changed-saved', {listOff, save, listSaved});
                const x = await pub(C, '', 'r25-changed-public-off');
                await openWebsite(C, 'plugins');
                const onAgain = await setPlugin('languagetoggleblockplugin', true);
                await openSide(C, 'Setup');
                const listOn = await sidebarList();
                await snap(page, 'r25-changed-on-again', {listOn});
                const y = await pub(C, '', 'r25-changed-public-on');
                fact('r25-changed', {off, listOff, save, listSaved, publicOff: side(x), onAgain, listOn, publicOn: side(y), footer: y.footer.content});
            });
        }

        // ======================= omp (B): td4 =================================
        if (on('omp') && app.name === 'omp') {
            await asMgr('B');
            const B = st.B.path;
            await step('omp-td4', async () => {
                const before = await pub(B, '', 'omp-home-before');
                await openSide(B, 'Setup');
                const opened = await page.evaluate(() => ({
                    featured: [...document.querySelectorAll('#appearance-setup input[name="displayFeaturedBooks"]')].map((i) => i.checked),
                    newReleases: [...document.querySelectorAll('#appearance-setup input[name="displayNewReleases"]')].map((i) => i.checked),
                    order: [...document.querySelectorAll('#appearance-setup input[name="catalogSortOption"]')].filter((i) => i.checked).map((i) => i.value),
                }));
                await page.locator('#appearance-setup input[name="displayFeaturedBooks"]').check();
                await page.locator('#appearance-setup input[name="displayNewReleases"]').check();
                const save = await saveSetup();
                await page.reload(); await idle(page);
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page); await sleep(700);
                const reread = await page.evaluate(() => ({
                    featured: [...document.querySelectorAll('#appearance-setup input[name="displayFeaturedBooks"]')].map((i) => i.checked),
                    newReleases: [...document.querySelectorAll('#appearance-setup input[name="displayNewReleases"]')].map((i) => i.checked),
                    order: [...document.querySelectorAll('#appearance-setup input[name="catalogSortOption"]')].filter((i) => i.checked).map((i) => i.value),
                }));
                await snap(page, 'omp-td4-saved', {opened, save, reread});
                const after = await pub(B, '', 'omp-home-after');
                const catalog = await pub(B, '/catalog', 'omp-catalog');
                fact('omp-td4', {opened, save, reread, headingsBefore: before.headings, headingsAfter: after.headings, mainBefore: flat((await vis.locator('.pkp_structure_main').innerText().catch(() => '')), 50), catalogHeadings: catalog.headings});
            });
        }

        // ======================= extra: the logo's size at its other end, a French logo, the Browse Block elsewhere ====
        if (on('extra')) {
            await asMgr('A');
            const A = st.A.path;
            await step('logo-wide', async () => {
                await openSide(A, 'Setup');
                const cur = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                if (cur.buttons.includes('Remove')) await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const up = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', {name: 'k3-logo-wide.png', mimeType: 'image/png', buffer: png(1600, 160, [200, 120, 0])});
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').fill('Wide logo');
                const save = await saveSetup();
                const home = await pub(A, '', 'logo-wide-public-home');
                const vw = await vis.evaluate(() => ({viewport: window.innerWidth, header: Math.round(document.querySelector('.pkp_site_name').getBoundingClientRect().width), scrollW: document.documentElement.scrollWidth}));
                fact('logo-wide', {upStatus: up.status, save: save.status, img: home.header.img, vw});
            });
            await step('logo-fr', async () => {
                await openSide(A, 'Setup');
                await page.locator('#appearance-setup .pkpFormLocales').getByRole('button', {name: 'French'}).click();
                await sleep(600);
                const cur = await boxState('appearanceSetup', 'pageHeaderLogoImage', 'en');
                if (cur.buttons.includes('Remove')) await pressInBox('appearanceSetup', 'pageHeaderLogoImage', 'en', 'Remove');
                const en = await upload('appearanceSetup', 'pageHeaderLogoImage', 'en', FILES.logo1);
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'en').fill('Logo EN');
                const fr = await upload('appearanceSetup', 'pageHeaderLogoImage', 'fr_CA', FILES.logo2);
                await altInput('appearanceSetup', 'pageHeaderLogoImage', 'fr_CA').fill('Logo FR');
                const typed = await typeFooter('Pied de page', 'fr_CA');
                const save = await saveSetup();
                await snap(page, 'logo-fr-saved', {save});
                const hEn = await pub(A, '', 'logo-fr-public-en');
                const hFr = await pub(A, '', 'logo-fr-public-fr', 'fr_CA');
                fact('logo-fr', {en: en.status, fr: fr.status, typed, save: save.status, visitorEn: hdr(hEn), footerEn: hEn.footer.content, visitorFr: hdr(hFr), footerFr: hFr.footer.content});
            });
            if (app.name !== 'omp') {
                await asMgr('B');
                const B = st.B.path;
                await step('browse-elsewhere', async () => {
                    await openWebsite(B, 'plugins');
                    const en = await setPlugin('browseblockplugin', true);
                    await openSide(B, 'Setup');
                    const list = await sidebarList();
                    const v = findValue(list, /browse/i);
                    if (v) await tickSidebar(v, true);
                    const save = await saveSetup();
                    const x = await pub(B, '', 'browse-elsewhere-public');
                    // put it back: untick, save, disable
                    await openSide(B, 'Setup');
                    if (v) await tickSidebar(v, false);
                    const save2 = await saveSetup();
                    await openWebsite(B, 'plugins');
                    const off = await setPlugin('browseblockplugin', false);
                    fact('browse-elsewhere', {enable: en, list, save: save.status, public: side(x), aria: x.sidebarAria, save2: save2.status, off: off.now});
                });
            }
        }

        // ======================= admin: the second permission level on "Setup" ==========
        if (on('admin')) {
            await step('admin-setup', async () => {
                await signIn(page, 'admin');
                await idle(page);
                await openSide(st.B.path, 'Setup');
                const list = await sidebarList();
                const labels = await setupForm().locator('.pkpFormFieldLabel, legend').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
                await snap(page, 'admin-setup', {list, labels});
                fact('admin-setup', {labels, list});
            });
        }
    } finally {
        fact('dialogs', dialogs);
        await M.close().catch(() => {});
        await V.close().catch(() => {});
    }
});
