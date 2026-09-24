// U10 claim check, chunk K2: the home page's composition, on all three apps.
// Spec: docs/specs/U10-appearance-and-theming.md lines 206–285 (Rules 10–19:
// "Journal Content Organization", one page per journal, the order top to
// bottom, "Latest Publications", "Current Issue", the categories, "Latest
// preprints", featured books and new releases, the homepage image,
// "Additional Content"), register OJS2, OJS3, OMP1, OPS1; footnotes m, n, o,
// p, q, td4, td15–td22, f-ojs2, f-ojs3, f-omp1, f-ops1.
//
// Seeds its own scratch contexts (tag prefix u10k2), signs in as each
// context's own scratch manager, reads every public page as a signed-out
// visitor, and records every screen with screen():
//   E  nothing set and nothing published (the empty end of Rule 12, td15's
//      no-issue read, td4 on a press, Rule 16's heading with nothing posted)
//   F  every part on: a highlight, a homepage image, the summary, one
//      announcement shown on the home page, "Additional Content", categories
//      with a subcategory; OJS a published issue with one article, three
//      articles published with no issue (A, B, C), one published into an
//      issue not yet published (D), one submitted first and published last
//      on screen (Z); OMP two published books, featured and new releases;
//      OPS eleven posted preprints
//   N  {OJS} one article published with no issue and "Theme" never saved:
//      OJS2, the first issue created and then published on screen
//   U  {OJS} one unpublished issue: td15's second read
//
//   PROBE_FEATURE=U10 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U10/K2/k2.js
//   PHASES=seed,empty,ojs2,build,full,zpub,latest,preprints,featured,image,cats,issue,sweep,unpub,early,none2
//   (default: all; later phases reuse k2-state-<app>.json from the seed phase)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'empty', 'ojs2', 'build', 'full', 'zpub', 'latest', 'preprints', 'featured', 'image', 'cats', 'issue', 'sweep', 'unpub', 'early', 'none2'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 20_000;
const REPO = path.resolve(__dirname, '../../../../..');
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- pictures -----------------------------------------------------------------
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
    small: {name: 'k2-home-small.png', mimeType: 'image/png', buffer: png(300, 100, [30, 140, 160])},
    big: {name: 'k2-home-big.png', mimeType: 'image/png', buffer: png(2000, 400, [160, 60, 30])},
};

// ---- helpers ------------------------------------------------------------------
const ctxUrl = (app, ctxPath, p = '', locale = '') => app.url(`/index.php/${ctxPath}${locale ? '/' + locale : ''}${p}`);

async function snap(page, name, extra = {}) {
    const s = await screen(page).catch((e) => ({screenError: String(e.message || e)}));
    record(name, {...s, ...extra});
    await shot(page, name).catch(() => {});
    return s;
}

/** Open Settings › Website on a top tab and a side tab (ids as the page gives them). */
async function openTab(page, app, P, topId, sideId, {reload = true} = {}) {
    if (reload) {
        await page.goto('about:blank');
        await page.goto(ctxUrl(app, P, '/management/settings/website'));
        await idle(page);
    }
    const top = page.locator(`#${topId}-button`).first();
    await top.waitFor({timeout: T});
    if ((await top.getAttribute('aria-selected')) !== 'true') { await top.click(); await idle(page); }
    if (sideId) {
        const side = page.locator(`#${sideId}-button`).first();
        await side.waitFor({timeout: T});
        if ((await side.getAttribute('aria-selected')) !== 'true') { await side.click(); await idle(page); }
    }
    await sleep(500);
    return page.locator(`[role="tabpanel"]#${sideId || topId}`).first();
}

/** A Vue form's fields as data. */
async function formFields(panel) {
    return panel.evaluate((root) => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        return {
            fields: [...root.querySelectorAll('.pkpFormField')].filter((f) => f.offsetParent !== null).map((f) => ({
                label: txt(f.querySelector('.pkpFormFieldLabel, legend, .pkpFormField__heading, label')),
                description: txt(f.querySelector('.pkpFormField__description')),
                options: [...f.querySelectorAll('input[type=radio], input[type=checkbox]')].map((i) => ({type: i.type, name: i.name, value: i.value, checked: i.checked, label: txt(i.closest('label')) || (i.labels && i.labels[0] ? txt(i.labels[0]) : null)})),
                texts: [...f.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=file]), textarea')].map((i) => ({name: i.name, id: i.id, value: i.value})),
            })),
            buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({text: txt(b), disabled: b.disabled})),
        };
    }).catch((e) => ({error: String(e.message || e)}));
}

/** Press a form's "Save" and wait for the request and the "Saved" note. */
async function saveIn(page, scope) {
    const resp = page.waitForResponse((r) => /^(PUT|POST)$/.test(r.request().method()) && /\/api\/v1\//.test(r.url()) && !/temporaryFiles/.test(r.url()), {timeout: T}).catch(() => null);
    await scope.getByRole('button', {name: 'Save', exact: true}).last().click();
    const r = await resp;
    const saved = await scope.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    await idle(page);
    const errors = await scope.locator('.pkpFieldError').allInnerTexts().catch(() => []);
    return {status: r ? r.status() : null, url: r ? r.url().replace(/^.*\/index\.php/, '') : null, saved, errors};
}

const THEME = {
    toc: "Include the current issue's table of contents",
    recent: 'Include recent most published articles',
    cats: 'Include a listing of categories',
    summary: /^Show the (journal|press|server) summary on the homepage\.$/,
    hdr: /^Show the homepage image as the header background\.$/,
};

/** Set the "Theme" tab's boxes as given ({toc, recent, cats, summary, hdr}), save, and return the form before and after. */
async function setTheme(page, app, P, want) {
    const panel = await openTab(page, app, P, 'appearance', 'theme');
    await panel.locator('.pkpFormField').first().waitFor({timeout: T});
    const before = await formFields(panel);
    for (const [k, v] of Object.entries(want)) {
        await panel.getByRole('checkbox', {name: THEME[k], exact: typeof THEME[k] === 'string'}).setChecked(v);
    }
    const save = await saveIn(page, panel);
    return {before, save, after: await formFields(panel)};
}

async function typeRich(page, id, text) {
    await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: T});
    const frame = page.locator(`[id="${id}_ifr"]`);
    await frame.contentFrame().locator('body').click();
    await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
    await sleep(300);
}

async function uploadHomeImage(page, app, P, file, alt) {
    const panel = await openTab(page, app, P, 'appearance', 'appearance-setup');
    const w = page.waitForResponse((r) => /temporaryFiles/.test(r.url()), {timeout: 10_000}).catch(() => null);
    await page.locator('[id="appearanceSetup-homepageImage-hiddenFileId-en"]').setInputFiles(file);
    const up = await w;
    await sleep(1200); await idle(page);
    if (alt !== undefined) {
        const altBox = page.locator('[id="appearanceSetup-homepageImage-control-en"]').locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]').locator('input[type="text"], textarea').first();
        await altBox.fill(alt);
    }
    const save = await saveIn(page, panel);
    return {upload: up ? up.status() : null, save};
}

/** What the visitor's home page holds, part by part, top to bottom. */
async function homeRead(page) {
    return page.evaluate(() => {
        const txt = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
        const rel = (h) => (h || '').replace(/^https?:\/\/[^/]+/, '');
        const root = document.querySelector('.page_index_journal, .page_homepage, .page_index_server');
        const label = (c) => {
            const cl = (c.className || '').toString();
            if (/highlights/.test(cl)) return 'carousel';
            if (/homepage_image/.test(cl) || c.tagName === 'IMG') return 'homepage image';
            if (/categoryHeader/.test(cl)) return 'categories';
            if (/homepage_about/.test(cl)) return 'about';
            if (/cmp_announcements/.test(cl)) return 'announcements';
            if (/latest_articles/.test(cl)) return 'latest publications';
            if (/current_issue/.test(cl)) return 'current issue';
            if (/additional_content/.test(cl)) return 'additional content';
            if (/cmp_monographs_list/.test(cl)) return `monographs: ${txt(c.querySelector('.title, h2, h3'))}`;
            if (/archiveHeader/.test(cl)) return 'search + category links';
            if (/homepage_latest_preprints/.test(cl)) return 'latest preprints';
            return `${c.tagName.toLowerCase()}.${cl}`;
        };
        const parts = root ? [...root.children].map((c) => {
            const r = c.getBoundingClientRect();
            return {part: label(c), cls: (c.className || '').toString(), heading: txt(c.querySelector('h2, h3')), text: (txt(c) || '').slice(0, 300), height: Math.round(r.height), top: Math.round(r.top + scrollY)};
        }) : null;
        const hi = root ? root.querySelector(':scope > .homepage_image img, :scope > img') : null;
        const list = (sel, scope = document) => [...scope.querySelectorAll(sel)].map((e) => txt(e));
        const links = (scope) => (scope ? [...scope.querySelectorAll('a')].map((a) => ({text: txt(a), href: rel(a.getAttribute('href'))})) : null);
        const latest = document.querySelector('.latest_articles');
        const ci = document.querySelector('.current_issue');
        const lp = document.querySelector('.homepage_latest_preprints');
        const ah = document.querySelector('.archiveHeader');
        const siteName = document.querySelector('.pkp_site_name a');
        return {
            url: location.href,
            title: document.title,
            rootClass: root ? root.className : null,
            parts,
            partOrder: parts ? parts.filter((p) => p.height > 0 || /homepage image/.test(p.part)).map((p) => p.part) : null,
            homepageImage: hi ? {src: rel(hi.getAttribute('src')), hasAlt: hi.hasAttribute('alt'), alt: hi.getAttribute('alt'), natural: [hi.naturalWidth, hi.naturalHeight], shown: [Math.round(hi.getBoundingClientRect().width), Math.round(hi.getBoundingClientRect().height)], parent: hi.parentElement.className, outer: hi.outerHTML.slice(0, 300)} : null,
            header: (() => { const h = document.querySelector('.pkp_structure_head'); const cs = h ? getComputedStyle(h) : null; return h ? {bgImage: cs.backgroundImage.slice(0, 200), inline: [...document.querySelectorAll('style')].map((s) => s.textContent).filter((s) => /pkp_structure_head/.test(s)).map((s) => s.slice(0, 300))} : null; })(),
            siteName: siteName ? {text: txt(siteName), href: rel(siteName.getAttribute('href'))} : null,
            carousel: list('.highlights .swiper-slide'),
            categories: links(document.querySelector('.categoryHeader')),
            about: (() => { const a = document.querySelector('.homepage_about'); return a ? {heading: txt(a.querySelector('h2')), text: txt(a)} : null; })(),
            announcements: (() => { const a = document.querySelector('.cmp_announcements'); return a ? {heading: txt(a.querySelector('h2')), text: txt(a).slice(0, 300), links: links(a)} : null; })(),
            latest: latest ? {heading: txt(latest.querySelector('h2')), items: list('.latest_articles .obj_article_summary .title'), text: txt(latest), links: links(latest), pageInfo: list('.latest_articles .cmp_pagination, .latest_articles .pkp_pagination')} : null,
            currentIssue: ci ? {heading: txt(ci.querySelector('h2')), name: txt(ci.querySelector('.current_issue_title')), toc: list('.current_issue .obj_article_summary .title'), text: txt(ci).slice(0, 400), links: links(ci)} : null,
            monographLists: [...document.querySelectorAll('.cmp_monographs_list')].map((m) => ({heading: txt(m.querySelector('.title, h2, h3')), items: list('.obj_monograph_summary .title', m)})),
            archiveHeader: ah ? {search: [...ah.querySelectorAll('input, button')].map((i) => ({tag: i.tagName, type: i.type, name: i.name, text: txt(i) || i.getAttribute('aria-label') || i.value})), links: links(ah.querySelector('.archiveHeader_categories'))} : null,
            latestPreprints: lp ? {heading: txt(lp.querySelector('h2')), items: list('.homepage_latest_preprints li .title, .homepage_latest_preprints li h3'), count: lp.querySelectorAll('ul > li').length, links: links(lp).filter((l) => !/preprint\/view/.test(l.href))} : null,
            additional: txt(document.querySelector('.additional_content')),
            pagination: [...document.querySelectorAll('.cmp_pagination')].map((p) => ({text: txt(p), links: links(p)})),
            mainText: (txt(document.querySelector('.pkp_structure_main')) || '').slice(0, 1500),
            sidebar: (txt(document.querySelector('.pkp_structure_sidebar')) || '').slice(0, 300),
            footer: (txt(document.querySelector('.pkp_structure_footer_wrapper, .pkp_structure_footer')) || '').slice(0, 300),
            skipLinks: [...document.querySelectorAll('.cmp_skip_to_content a')].map((a) => ({text: txt(a), href: a.getAttribute('href')})),
        };
    });
}

async function visitHome(vis, app, P, name, {qs = '', suffix = ''} = {}) {
    await vis.goto(ctxUrl(app, P, suffix) + qs);
    await idle(vis);
    await vis.waitForFunction(() => [...document.images].every((i) => i.complete), null, {timeout: 8000}).catch(() => {});
    const h = await homeRead(vis).catch((e) => ({error: String(e.message || e)}));
    await snap(vis, name, {home: h});
    return h;
}

/** A page other than the home page: does it carry the additional content? */
async function visitOther(vis, url, name) {
    const resp = await vis.goto(url);
    await idle(vis);
    const o = await vis.evaluate(() => ({url: location.href, additional: document.querySelector('.additional_content') ? document.querySelector('.additional_content').innerText.trim() : null, hasWelcome: document.body.innerText.includes('Welcome text'), h1: (document.querySelector('h1') || {}).innerText || null})).catch((e) => ({error: String(e.message || e)}));
    await snap(vis, name, {other: {...o, status: resp ? resp.status() : null}});
    return {...o, status: resp ? resp.status() : null};
}

// ---- the drive ------------------------------------------------------------------
forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOmp = app.name === 'omp';
    const isOps = app.name === 'ops';
    let st = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const save = () => fs.writeFileSync(stateFile(app), JSON.stringify(st, null, 2));
    const facts = {};
    const fact = (k, v) => { facts[k] = v; record('facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 1500)); };

    // ---- seed ---------------------------------------------------------------
    if (on('seed') || !st) {
        const e = tag('u10k2e');
        const f = tag('u10k2f');
        const mgr = (t, g) => ({username: `${t}m`, roles: ['manager'], givenName: g, familyName: 'Manager'});
        const E = await app.api.createContext({tag: e, context: {name: `U10 K2 E ${e}`, acronym: 'K2E'}, users: [mgr(e, 'Eli')]});
        const specF = {
            tag: f,
            context: {name: `U10 K2 F ${f}`, acronym: 'K2F', description: {en: '<p>The K2 summary text.</p>'}},
            users: [mgr(f, 'Fay'), {username: `${f}a`, roles: ['author'], givenName: 'Fin', familyName: 'Author'}],
            categories: [{path: 'k2sci', title: 'K2 Science', children: [{path: 'k2sub', title: 'K2 Sub'}]}, {path: 'k2arts', title: 'K2 Arts'}],
            enableAnnouncements: true,
            numAnnouncementsHomepage: 1,
            announcements: [{title: {en: 'K2 news'}, descriptionShort: {en: '<p>K2 short news.</p>'}, description: {en: '<p>K2 full news.</p>'}}],
        };
        if (isOjs) specF.issues = [{volume: 1, number: 1, year: 2026, published: true}, {volume: 1, number: 2, year: 2026, published: false}];
        const F = await app.api.createContext(specF);
        st = {E: e, F: f, idE: E.contextId, idF: F.contextId, mE: `${e}m`, mF: `${f}m`, aF: `${f}a`, subs: {}};
        if (isOjs) st.issuesF = F.issues;
        save();
        const sub = async (key, extra) => {
            const r = await app.api.createSubmission({tag: `${f}${key}`, context: f, submitter: `${f}a`, title: `K2 ${key.toUpperCase()} ${f}`, ...extra});
            st.subs[key] = {id: r.submissionId, publicationId: r.publicationId, status: r.status, stageId: r.stageId}; save();
            await sleep(1500);
        };
        if (isOjs) {
            await sub('z', {decisions: ['skipExternalReview', 'sendToProduction']});
            await sub('i', {published: true, issue: {volume: 1, number: 1, year: 2026}});
            await sub('a', {published: true});
            await sub('b', {published: true});
            await sub('c', {published: true});
            try { await sub('d', {published: true, issue: {volume: 1, number: 2, year: 2026}}); } catch (err) { st.subs.dErr = String(err.message || err).slice(0, 400); save(); }
            const n = tag('u10k2n');
            await app.api.createContext({tag: n, context: {name: `U10 K2 N ${n}`, acronym: 'K2N'}, users: [mgr(n, 'Ned'), {username: `${n}a`, roles: ['author']}]});
            const nr = await app.api.createSubmission({tag: `${n}s`, context: n, submitter: `${n}a`, title: `K2 N article ${n}`, published: true});
            const u = tag('u10k2u');
            await app.api.createContext({tag: u, context: {name: `U10 K2 U ${u}`, acronym: 'K2U'}, users: [mgr(u, 'Uma')], issues: [{volume: 1, number: 1, year: 2026, published: false}]});
            Object.assign(st, {N: n, mN: `${n}m`, subN: nr.submissionId, U: u, mU: `${u}m`});
        } else if (isOmp) {
            await sub('m1', {published: true});
            await sub('m2', {published: true});
        } else {
            for (let i = 1; i <= 11; i++) await sub(`p${String(i).padStart(2, '0')}`, {published: true});
        }
        save();
        note(`K2 ${app.name}: scratch E ${st.E} (empty), F ${st.F} (every part; ${isOjs ? 'issues 1/1 published + 1/2 not, subs z,i,a,b,c,d' : isOmp ? 'books m1, m2' : 'preprints p01–p11'})${isOjs ? `, N ${st.N} (one article, no issue), U ${st.U} (one unpublished issue)` : ''}`);
        log('seeded', JSON.stringify(st));
    }
    const {E, F} = st;

    const mgrB = await launch(app);
    const visB = await launch(app);
    const page = mgrB.page;
    const vis = visB.page;
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push({type: d.type(), message: d.message()}); (d.type() === 'beforeunload' ? d.accept() : d.dismiss()).catch(() => {}); });
    const step = async (name, fn) => {
        try { await fn(); } catch (err) {
            log('STEP FAILED', name, String(err.message || err).slice(0, 500));
            fact(`error-${name}`, String(err.message || err).slice(0, 800));
            await snap(page, `err-${name}`).catch(() => {});
        }
    };
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };

    try {
        // ======================= empty (E) ===========================================
        if (on('empty')) {
            await step('empty-visitor', async () => {
                const h = await visitHome(vis, app, E, 'e-home');
                const h2 = await visitHome(vis, app, E, 'e-home-index', {suffix: '/index'});
                await loc(vis, 'Home: the page root', vis.locator('.page_index_journal, .page_homepage, .page_index_server'));
                await loc(vis, 'Home: the header name link', vis.locator('.pkp_site_name a'));
                // the header's name leads home from another page
                await vis.goto(ctxUrl(app, E, '/about')); await idle(vis);
                const nameHref = await vis.locator('.pkp_site_name a').first().getAttribute('href').catch(() => null);
                await vis.locator('.pkp_site_name a').first().click(); await idle(vis);
                fact('empty-home', {parts: h.partOrder, mainText: h.mainText, latestPreprints: h.latestPreprints, archiveHeader: h.archiveHeader, index: {url: h2.url, parts: h2.partOrder}, nameHref, nameLeadsTo: vis.url()});
            });
            await step('empty-manager', async () => {
                await as(st.mE, E);
                const th = await openTab(page, app, E, 'appearance', 'theme');
                await th.locator('.pkpFormField').first().waitFor({timeout: T});
                const theme = await formFields(th);
                await snap(page, 'e-theme', {form: theme});
                await loc(page, 'Theme: "Include the current issue\'s table of contents"', th.getByRole('checkbox', {name: THEME.toc, exact: true}));
                const su = await openTab(page, app, E, 'appearance', 'appearance-setup', {reload: false});
                const setup = await formFields(su);
                await snap(page, 'e-setup', {form: setup});
                const ad = await openTab(page, app, E, 'appearance', 'advanced', {reload: false});
                const adv = await formFields(ad);
                await snap(page, 'e-advanced', {form: adv});
                fact('empty-forms', {theme: theme.fields && theme.fields.map((x) => ({label: x.label, options: x.options.map((o) => `${o.checked ? '[x]' : '[ ]'} ${o.label}`)})), setup: setup.fields && setup.fields.map((x) => ({label: x.label, options: x.options.map((o) => `${o.checked ? '[x]' : '[ ]'} ${o.label}`)})), advanced: adv.fields && adv.fields.map((x) => ({label: x.label, texts: x.texts.map((t) => `${t.name}=${t.value}`)}))});
                if (isOmp) {
                    // td4: tick "Featured Books" and "New Releases" with no book featured or new
                    const su2 = await openTab(page, app, E, 'appearance', 'appearance-setup');
                    await su2.getByRole('checkbox', {name: 'Display featured books on the home page'}).check();
                    await su2.getByRole('checkbox', {name: 'Display new releases on the home page'}).check();
                    const s = await saveIn(page, su2);
                    await snap(page, 'e-setup-omp-ticked', {save: s});
                    const h = await visitHome(vis, app, E, 'e-home-omp-ticked');
                    fact('td4-empty-ticked', {save: s, parts: h.partOrder, lists: h.monographLists, mainText: h.mainText});
                }
            });
            if (isOjs) {
                await step('td15-reads', async () => {
                    await as(st.mU, st.U);
                    const th = await openTab(page, app, st.U, 'appearance', 'theme');
                    await th.locator('.pkpFormField').first().waitFor({timeout: T});
                    const u = await formFields(th);
                    await snap(page, 'u-theme', {form: u});
                    const hu = await visitHome(vis, app, st.U, 'u-home');
                    await as('manager.maya', 'publicknowledge');
                    const thp = await openTab(page, app, 'publicknowledge', 'appearance', 'theme');
                    await thp.locator('.pkpFormField').first().waitFor({timeout: T});
                    const pk = await formFields(thp);
                    await snap(page, 'pk-theme', {form: pk});
                    const org = (ff) => (ff.fields || []).filter((x) => /Content Organization/.test(x.label || '')).map((x) => x.options.map((o) => `${o.checked ? '[x]' : '[ ]'} ${o.label}`));
                    fact('td15', {unpublishedIssue: org(u), uHome: hu.partOrder, publicknowledge: org(pk)});
                    await signOut(page);
                });
            }
        }

        // ======================= OJS2 on N ===========================================
        if (on('ojs2') && isOjs) {
            await step('ojs2', async () => {
                const N = st.N;
                const o = {};
                o.before = await visitHome(vis, app, N, 'n-home-before');
                await as(st.mN, N);
                let th = await openTab(page, app, N, 'appearance', 'theme');
                await th.locator('.pkpFormField').first().waitFor({timeout: T});
                o.themeBefore = await formFields(th);
                await snap(page, 'n-theme-before', {form: o.themeBefore});
                // the first issue, created on screen, not published
                await page.goto(ctxUrl(app, N, '/manageIssues')); await idle(page);
                await page.getByRole('link', {name: 'Create Issue', exact: true}).first().click();
                const fm = page.locator('form#issueForm');
                await fm.waitFor({state: 'visible', timeout: T});
                await fm.locator('input[name="volume"]').fill('1');
                await fm.locator('input[name="number"]').fill('1');
                await fm.locator('input[name="year"]').fill('2026');
                await fm.locator('input[name="title[en]"]').fill('K2 first issue');
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /\/update-issue/.test(r.url()), {timeout: T});
                await fm.getByRole('button', {name: 'Save', exact: true}).click();
                o.create = (await w).status();
                await idle(page);
                await snap(page, 'n-issue-created', {create: o.create});
                o.afterCreate = await visitHome(vis, app, N, 'n-home-after-create');
                th = await openTab(page, app, N, 'appearance', 'theme');
                await th.locator('.pkpFormField').first().waitFor({timeout: T});
                o.themeAfterCreate = await formFields(th);
                await snap(page, 'n-theme-after-create', {form: o.themeAfterCreate});
                // publish it
                await page.goto(ctxUrl(app, N, '/manageIssues')); await idle(page);
                const row = page.locator('tr.gridRow').filter({hasText: 'K2 first issue'});
                await row.first().waitFor({state: 'visible', timeout: T});
                await row.first().locator('a.show_extras').click();
                await page.getByRole('link', {name: 'Publish Issue', exact: true}).click();
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.locator('#sendIssueNotification').waitFor({state: 'visible', timeout: T});
                await dlg.locator('#sendIssueNotification').uncheck().catch(() => {});
                const w2 = page.waitForResponse((r) => r.request().method() === 'POST' && /\/publish-issue/.test(r.url()), {timeout: T});
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                o.publish = (await w2).status();
                await idle(page);
                o.afterPublish = await visitHome(vis, app, N, 'n-home-after-publish');
                const org = (ff) => (ff.fields || []).filter((x) => /Content Organization/.test(x.label || '')).map((x) => x.options.map((q) => `${q.checked ? '[x]' : '[ ]'} ${q.label}`));
                fact('ojs2', {
                    before: {parts: o.before.partOrder, latest: o.before.latest && o.before.latest.items, current: o.before.currentIssue},
                    themeBefore: org(o.themeBefore), create: o.create,
                    afterCreate: {parts: o.afterCreate.partOrder, latest: o.afterCreate.latest, current: o.afterCreate.currentIssue, mainText: o.afterCreate.mainText},
                    themeAfterCreate: org(o.themeAfterCreate), publish: o.publish,
                    afterPublish: {parts: o.afterPublish.partOrder, latest: o.afterPublish.latest, current: o.afterPublish.currentIssue},
                });
                await signOut(page);
            });
        }

        // ======================= build F on screen ===================================
        if (on('build') || on('buildhl')) {
            await as(st.mF, F);
            if (on('build')) await step('build-theme', async () => {
                const want = {summary: true};
                if (isOjs) Object.assign(want, {toc: true, recent: true, cats: true});
                const r = await setTheme(page, app, F, want);
                await snap(page, 'f-theme-saved', {r});
                fact('build-theme', {save: r.save});
            });
            if (on('build')) await step('build-setup', async () => {
                const r = await uploadHomeImage(page, app, F, FILES.small, 'Our building');
                let omp = null;
                if (isOmp) {
                    const su = await openTab(page, app, F, 'appearance', 'appearance-setup');
                    await su.getByRole('checkbox', {name: 'Display featured books on the home page'}).check();
                    await su.getByRole('checkbox', {name: 'Display new releases on the home page'}).check();
                    omp = await saveIn(page, su);
                }
                await snap(page, 'f-setup-saved', {r, omp});
                fact('build-setup', {r, omp});
            });
            if (on('build')) await step('build-additional', async () => {
                const ad = await openTab(page, app, F, 'appearance', 'advanced');
                await typeRich(page, 'appearanceAdvanced-additionalHomeContent-control-en', 'Welcome text');
                const s = await saveIn(page, ad);
                await snap(page, 'f-advanced-saved', {save: s});
                await loc(page, 'Advanced: "Additional Content" editor', page.locator('[id="appearanceAdvanced-additionalHomeContent-control-en_ifr"]'));
                fact('build-additional', s);
            });
            await step('build-highlight', async () => {
                const {HighlightsTab} = require(path.join(REPO, 'apps', app.name, 'playwright/pages/HighlightsPages.js'));
                if (isOmp) {   // the OMP suite's page object takes the path on goto() and names the label buttonLabel
                    const tab = new HighlightsTab(page);
                    await tab.goto(F);
                    await tab.add({title: 'K2 slide', description: 'K2 slide text', url: 'https://example.org/k2', buttonLabel: 'K2 go'});
                } else {
                    const tab = new HighlightsTab(page, F);
                    await tab.goto();
                    await tab.addHighlight({title: 'K2 slide', description: 'K2 slide text', url: 'https://example.org/k2', label: 'K2 go'});
                }
                await snap(page, 'f-highlight-added');
                fact('build-highlight', 'added');
            });
            if (isOmp && on('build')) {
                await step('build-catalog', async () => {
                    await page.goto(ctxUrl(app, F, '/manageCatalog')); await idle(page);
                    await page.locator('.listPanel__item--catalog').first().waitFor({timeout: T});
                    await snap(page, 'f-catalog-before');
                    const reqs = [];
                    const onR = (r) => { if (/saveDisplayFlags|saveFeaturedOrder|order/.test(r.url()) && r.request().method() !== 'GET') reqs.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '')}); };
                    page.on('response', onR);
                    for (const key of ['m1', 'm2']) {
                        const item = page.locator('.listPanel__item--catalog').filter({hasText: `K2 ${key.toUpperCase()} `});
                        await item.getByRole('button', {name: 'This monograph is not featured. Make this monograph featured.'}).click();
                        await sleep(1500); await idle(page);
                        await item.getByRole('button', {name: 'This monograph is not a new release. Make this monograph a new release.'}).click();
                        await sleep(1500); await idle(page);
                    }
                    page.off('response', onR);
                    await loc(page, 'Catalog: an item\'s feature toggle', page.locator('.listPanel__item--catalog__select--first').first());
                    const items = await page.locator('.listPanel__item--catalog').evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), featured: e.classList.contains('-isFeatured'), sr: [...e.querySelectorAll('.-screenReader')].map((s) => s.innerText.trim())})));
                    await snap(page, 'f-catalog-flagged', {items, reqs});
                    fact('build-catalog', {items, reqs});
                });
            }
            await signOut(page);
        }

        // ======================= full home page (F) ==================================
        if (on('full')) {
            await step('full', async () => {
                const h = await visitHome(vis, app, F, 'f-home-full');
                await loc(vis, 'Home: the homepage image', vis.locator('.page_index_journal > .homepage_image img, .page_homepage > img, .page_index_server > img'));
                await loc(vis, 'Home: "Additional Content"', vis.locator('.additional_content'));
                const about = await visitOther(vis, ctxUrl(app, F, '/about'), 'f-about');
                const archive = await visitOther(vis, ctxUrl(app, F, isOjs ? '/issue/archive' : isOmp ? '/catalog' : '/preprints'), 'f-archive');
                const item = await visitOther(vis, ctxUrl(app, F, isOjs ? `/article/view/${st.subs.a.id}` : isOmp ? `/catalog/book/${st.subs.m1.id}` : `/preprint/view/${st.subs.p01.id}`), 'f-item');
                const annPage = await visitOther(vis, ctxUrl(app, F, '/announcement'), 'f-announcements');
                fact('full', {parts: h.partOrder, partsDetail: h.parts && h.parts.map((p) => ({part: p.part, heading: p.heading, height: p.height})), image: h.homepageImage, categories: h.categories, about: h.about, announcements: h.announcements && h.announcements.heading, latest: h.latest, currentIssue: h.currentIssue, monographLists: h.monographLists, archiveHeader: h.archiveHeader, latestPreprints: h.latestPreprints, additional: h.additional, carousel: h.carousel, otherPages: {about, archive, item, annPage}});
            });
        }

        // ======================= Z: submitted first, published last (OJS3) ===========
        if (on('zpub') && isOjs) {
            await step('zpub', async () => {
                await as(st.mF, F);
                const z = st.subs.z;
                await page.goto(ctxUrl(app, F, `/dashboard/editorial?workflowSubmissionId=${z.id}&workflowMenuKey=publication_${z.publicationId}_titleAbstract`));
                await idle(page); await sleep(1500); await idle(page);
                const out = {};
                const pubBtn = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
                out.pubLabel = flat(await pubBtn.innerText({timeout: 15000}).catch(() => null), 60);
                await snap(page, 'z-workflow', {out});
                const panel = page.locator('[data-cy="active-modal"]').last();
                await pubBtn.click();
                await sleep(1500);
                const vs = page.locator('select[name="versionStage"]');
                if (await vs.isVisible({timeout: 5000}).catch(() => false)) {
                    await vs.selectOption('VoR').catch(() => vs.selectOption({index: 1}).catch(() => {}));
                    await page.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
                }
                const dont = page.getByRole('radio', {name: "Don't Assign To An Issue"});
                out.dontOffered = await dont.isVisible({timeout: 3000}).catch(() => false);
                if (out.dontOffered) await dont.check();
                await snap(page, 'z-publish-panel', {out});
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click().catch(async () => { await page.getByRole('button', {name: 'Confirm', exact: true}).last().click(); });
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
                await conf.waitFor({timeout: 20000}).catch(() => {});
                out.confirm = flat(await conf.innerText().catch(() => null), 300);
                const pr = page.waitForResponse((r) => /\/publish/.test(r.url()), {timeout: 30000}).catch(() => null);
                await conf.getByRole('button', {name: /^(Publish|Post)$/}).last().click().catch((e) => { out.confirmErr = flat(e.message, 200); });
                const r = await pr; out.publishStatus = r && r.status();
                await sleep(1500); await idle(page);
                await snap(page, 'z-after-publish', {out});
                const h = await visitHome(vis, app, F, 'f-home-after-z');
                fact('zpub', {out, latest: h.latest && h.latest.items, pageInfo: h.latest && h.latest.text && h.latest.text.slice(-80)});
                await signOut(page);
            });
        }

        // ======================= "Latest Publications" paging (td17) ================
        if (on('latest') && isOjs) {
            await step('latest', async () => {
                await as(st.mF, F);
                const panel = await openTab(page, app, F, 'setup', 'lists');
                const ipp = panel.locator('input[name="itemsPerPage"]');
                const npl = panel.locator('input[name="numPageLinks"]');
                const defaults = {itemsPerPage: await ipp.inputValue(), numPageLinks: await npl.inputValue()};
                await snap(page, 'f-lists-defaults', {defaults});
                await ipp.fill('1'); await npl.fill('2');
                const s = await saveIn(page, panel);
                const pages = {};
                const h1 = await visitHome(vis, app, F, 'f-home-latest-p1');
                pages.p1 = {items: h1.latest && h1.latest.items, text: h1.latest && h1.latest.text, links: h1.latest && h1.latest.links.filter((l) => !/article\/view/.test(l.href))};
                for (const n of [2, 3]) {
                    const h = await visitHome(vis, app, F, `f-home-latest-p${n}`, {qs: `?publishedPublicationsPage=${n}`});
                    pages[`p${n}`] = {items: h.latest && h.latest.items, text: h.latest && h.latest.text, links: h.latest && h.latest.links.filter((l) => !/article\/view/.test(l.href))};
                }
                // the last page, reached by the ">>" link from the first
                await vis.goto(ctxUrl(app, F)); await idle(vis);
                const last = vis.locator('.latest_articles a').filter({hasText: /^>>$/});
                pages.lastLinkCount = await last.count();
                if (pages.lastLinkCount) {
                    await last.first().click(); await idle(vis);
                    const h = await homeRead(vis);
                    await snap(vis, 'f-home-latest-last', {home: h});
                    pages.last = {url: h.url, items: h.latest && h.latest.items, text: h.latest && h.latest.text, links: h.latest && h.latest.links.filter((l) => !/article\/view/.test(l.href))};
                }
                // a page past the end
                const past = await visitHome(vis, app, F, 'f-home-latest-p9', {qs: '?publishedPublicationsPage=9'});
                pages.p9 = {parts: past.partOrder, latest: past.latest};
                // back to the defaults
                const panel2 = await openTab(page, app, F, 'setup', 'lists');
                await panel2.locator('input[name="itemsPerPage"]').fill(defaults.itemsPerPage);
                await panel2.locator('input[name="numPageLinks"]').fill(defaults.numPageLinks);
                const back = await saveIn(page, panel2);
                fact('td17', {defaults, save: s, pages, back});
                await signOut(page);
            });
        }

        // ======================= "Latest preprints" (td20) ===========================
        if (on('preprints') && isOps) {
            await step('preprints', async () => {
                const h = await visitHome(vis, app, F, 'f-home-preprints');
                await as(st.mF, F);
                const panel = await openTab(page, app, F, 'setup', 'lists');
                const ipp = panel.locator('input[name="itemsPerPage"]');
                const def = await ipp.inputValue();
                await ipp.fill('1');
                const s = await saveIn(page, panel);
                const h1 = await visitHome(vis, app, F, 'f-home-preprints-ipp1');
                const arch = await visitOther(vis, ctxUrl(app, F, '/preprints'), 'f-preprints-archive-ipp1');
                const archLinks = await vis.locator('.cmp_pagination a').evaluateAll((els) => els.map((a) => a.innerText.trim())).catch(() => []);
                const panel2 = await openTab(page, app, F, 'setup', 'lists');
                await panel2.locator('input[name="itemsPerPage"]').fill(def);
                const back = await saveIn(page, panel2);
                const seeded = Object.entries(st.subs).map(([k, v]) => `${k}:${v.id}`);
                fact('td20', {seeded, full: {count: h.latestPreprints && h.latestPreprints.count, items: h.latestPreprints && h.latestPreprints.items, links: h.latestPreprints && h.latestPreprints.links, pagination: h.pagination}, ipp1: {save: s, count: h1.latestPreprints && h1.latestPreprints.count, items: h1.latestPreprints && h1.latestPreprints.items, pagination: h1.pagination}, archiveAtIpp1: {archLinks}, back});
                await signOut(page);
            });
        }

        // ======================= featured and new releases (Rule 17, OMP) ============
        if (on('featured') && isOmp) {
            await step('featured', async () => {
                await as(st.mF, F);
                const out = {};
                out.home0 = (await visitHome(vis, app, F, 'f-home-featured-0')).monographLists;
                await page.goto(ctxUrl(app, F, '/manageCatalog')); await idle(page);
                await page.locator('.listPanel__item--catalog').first().waitFor({timeout: T});
                const orderBtn = page.getByRole('button', {name: /^Order Features$/});
                out.orderOffered = await orderBtn.count();
                out.buttons = await page.locator('.listPanel--catalog button, .listPanel__header button, main button').evaluateAll((els) => [...new Set(els.filter((b) => b.offsetParent !== null).map((b) => b.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))]).catch(() => []);
                await snap(page, 'f-catalog-order-0', {out});
                if (out.orderOffered) {
                    await orderBtn.first().click(); await idle(page); await sleep(500);
                    await snap(page, 'f-catalog-ordering');
                    const firstDown = page.getByRole('button', {name: /Decrease position of|Move .* down/}).first();
                    out.downCount = await page.getByRole('button', {name: /Decrease position of|Move .* down/}).count();
                    if (out.downCount) await firstDown.click();
                    await sleep(400);
                    const reqs = [];
                    const onR = (r) => { if (r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url())) reqs.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '')}); };
                    page.on('response', onR);
                    await page.getByRole('button', {name: /^Save Order$/}).first().click().catch((e) => { out.saveOrderErr = flat(e.message, 200); });
                    await sleep(2000); await idle(page);
                    page.off('response', onR);
                    out.orderReqs = reqs;
                    await snap(page, 'f-catalog-ordered', {out});
                }
                out.home1 = (await visitHome(vis, app, F, 'f-home-featured-1')).monographLists;
                // untick "Featured Books", then "New Releases"
                let su = await openTab(page, app, F, 'appearance', 'appearance-setup');
                await su.getByRole('checkbox', {name: 'Display featured books on the home page'}).uncheck();
                out.saveF = await saveIn(page, su);
                const h2 = await visitHome(vis, app, F, 'f-home-featured-off');
                out.home2 = {parts: h2.partOrder, lists: h2.monographLists};
                su = await openTab(page, app, F, 'appearance', 'appearance-setup');
                await su.getByRole('checkbox', {name: 'Display new releases on the home page'}).uncheck();
                out.saveN = await saveIn(page, su);
                const h3 = await visitHome(vis, app, F, 'f-home-newrel-off');
                out.home3 = {parts: h3.partOrder, lists: h3.monographLists};
                // the catalog's own pages still carry the flags
                out.catalogPage = await visitOther(vis, ctxUrl(app, F, '/catalog'), 'f-catalog-public');
                out.newReleasesPage = await visitOther(vis, ctxUrl(app, F, '/catalog/newReleases'), 'f-newreleases-public');
                su = await openTab(page, app, F, 'appearance', 'appearance-setup');
                await su.getByRole('checkbox', {name: 'Display featured books on the home page'}).check();
                await su.getByRole('checkbox', {name: 'Display new releases on the home page'}).check();
                out.saveBack = await saveIn(page, su);
                fact('rule17', out);
                await signOut(page);
            });
        }

        // ======================= the homepage image (td21) ===========================
        if (on('image')) {
            await step('image', async () => {
                await as(st.mF, F);
                const out = {};
                const h0 = await visitHome(vis, app, F, 'f-home-image-small');
                out.small = {image: h0.homepageImage, order: h0.partOrder, mainWidth: await vis.locator('.pkp_structure_main').evaluate((m) => Math.round(m.getBoundingClientRect().width)).catch(() => null)};
                out.aria = await vis.locator('.page_index_journal, .page_homepage, .page_index_server').first().ariaSnapshot({timeout: 5000}).catch(() => null);
                // "Header Background Image" ticked
                out.hdrOn = await setTheme(page, app, F, {hdr: true}).then((r) => r.save);
                const h1 = await visitHome(vis, app, F, 'f-home-image-hdr');
                const about = await visitHome(vis, app, F, 'f-about-image-hdr', {suffix: '/about'});
                out.hdr = {image: h1.homepageImage, header: h1.header, aboutHeader: about.header};
                out.hdrOff = await setTheme(page, app, F, {hdr: false}).then((r) => r.save);
                // a picture wider than the page
                out.big = await uploadHomeImage(page, app, F, FILES.big);
                const h2 = await visitHome(vis, app, F, 'f-home-image-big');
                out.bigShown = h2.homepageImage;
                // the alternate text read back on the tab
                const su = await openTab(page, app, F, 'appearance', 'appearance-setup');
                out.altOnTab = await page.locator('[id="appearanceSetup-homepageImage-control-en"]').locator('xpath=ancestor::div[contains(@class,"pkpFormField")][1]').locator('input[type="text"], textarea').first().inputValue().catch(() => null);
                await snap(page, 'f-setup-after-big', {form: await formFields(su)});
                fact('td21', out);
                await signOut(page);
            });
        }

        // ======================= the categories (td19) ===============================
        if (on('cats')) {
            await step('cats', async () => {
                const out = {};
                if (isOjs) {
                    await as(st.mF, F);
                    out.save = (await setTheme(page, app, F, {toc: false, recent: false, cats: true})).save;
                    const h = await visitHome(vis, app, F, 'f-home-cats-only');
                    out.home = {parts: h.partOrder, categories: h.categories, mainText: h.mainText.slice(0, 600)};
                    await loc(vis, 'Home: the category links', vis.locator('.categoryHeader .categories_listing a'));
                    // E: the box ticked with no category
                    await as(st.mE, E);
                    out.saveE = (await setTheme(page, app, E, {toc: false, recent: false, cats: true})).save;
                    const he = await visitHome(vis, app, E, 'e-home-cats-nocat');
                    out.noCat = {parts: he.partOrder, html: await vis.locator('.page_index_journal').innerHTML().then((x) => x.replace(/\s+/g, ' ').slice(0, 600)).catch(() => null)};
                    await signOut(page);
                }
                // follow the first category link (OJS row, OPS archive header)
                const h = await visitHome(vis, app, F, 'f-home-cats-follow');
                const links = isOjs ? h.categories : isOps ? (h.archiveHeader || {}).links : null;
                out.links = links;
                if (links && links.length) {
                    await vis.locator(isOjs ? '.categoryHeader a' : '.archiveHeader_categories a').first().click();
                    await idle(vis);
                    const cat = await snap(vis, 'f-category-page');
                    out.follow = {url: vis.url(), h1: flat(await vis.locator('h1').first().innerText().catch(() => null), 100), text: flat(cat.text && cat.text.main, 400)};
                }
                fact('td19', out);
            });
        }

        // ======================= "Current Issue" (td18) and none ticked ==============
        if (on('issue') && isOjs) {
            await step('issue', async () => {
                await as(st.mF, F);
                const out = {};
                out.saveToc = (await setTheme(page, app, F, {toc: true, recent: false, cats: false})).save;
                const h = await visitHome(vis, app, F, 'f-home-toc-only');
                out.toc = {parts: h.partOrder, current: h.currentIssue};
                await loc(vis, 'Home: "View All Issues" (its name ends in a space)', vis.getByRole('link', {name: /^View All Issues\s*$/}));
                const va = vis.getByRole('link', {name: /^View All Issues\s*$/});
                if (await va.count()) { await va.first().click(); await idle(vis); out.viewAll = {url: vis.url(), h1: flat(await vis.locator('h1').first().innerText().catch(() => null), 80)}; await snap(vis, 'f-view-all-issues'); }
                // "Publishing Mode": OJS will not be used to publish
                await page.goto('about:blank');
                await page.goto(ctxUrl(app, F, '/management/settings/distribution')); await idle(page);
                await page.locator('[id="access-button"]').first().click(); await idle(page); await sleep(500);
                const radios = await page.locator('input[name="publishingMode"]').evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (e.closest('label') || e.parentElement).innerText.trim()})));
                out.radios = radios;
                await snap(page, 'f-access-before', {radios});
                const idxNone = radios.findIndex((r) => /will not be used to publish/.test(r.label));
                await page.locator('input[name="publishingMode"]').nth(idxNone).check({force: true});
                out.saveNone = await saveIn(page, page.locator('form').filter({has: page.locator('input[name="publishingMode"]')}).first());
                const hn = await visitHome(vis, app, F, 'f-home-mode-none');
                out.modeNone = {parts: hn.partOrder, current: hn.currentIssue, mainText: hn.mainText.slice(0, 400)};
                const idxOpen = radios.findIndex((r) => /open access/i.test(r.label));
                await page.goto('about:blank');
                await page.goto(ctxUrl(app, F, '/management/settings/distribution')); await idle(page);
                await page.locator('[id="access-button"]').first().click(); await idle(page); await sleep(500);
                await page.locator('input[name="publishingMode"]').nth(idxOpen).check({force: true});
                out.saveOpen = await saveIn(page, page.locator('form').filter({has: page.locator('input[name="publishingMode"]')}).first());
                const ho = await visitHome(vis, app, F, 'f-home-mode-open');
                out.modeOpen = {parts: ho.partOrder};
                // untick every box
                out.saveNoneTicked = (await setTheme(page, app, F, {toc: false, recent: false, cats: false})).save;
                const h0 = await visitHome(vis, app, F, 'f-home-none-ticked');
                out.noneTicked = {parts: h0.partOrder, mainText: h0.mainText.slice(0, 500)};
                const th = await openTab(page, app, F, 'appearance', 'theme');
                out.themeAfterNone = (await formFields(th)).fields.filter((x) => /Content Organization/.test(x.label || '')).map((x) => x.options.map((q) => `${q.checked ? '[x]' : '[ ]'} ${q.label}`));
                await snap(page, 'f-theme-none-ticked');
                // all three back on
                out.saveAll = (await setTheme(page, app, F, {toc: true, recent: true, cats: true})).save;
                fact('td18', out);
                await signOut(page);
            });
        }

        // ======================= sweep: the home page's controls; leaving "Theme" =====
        if (on('sweep')) {
            await step('sweep-home', async () => {
                const out = {};
                const h = await visitHome(vis, app, F, 'f-home-sweep');
                out.parts = h.partOrder;
                // the carousel's button
                const slideBtn = vis.locator('.highlights a').filter({hasText: 'K2 go'});
                out.slideLink = await slideBtn.first().getAttribute('href').catch(() => null);
                // the announcement's links
                const annLinks = h.announcements ? h.announcements.links : [];
                out.annLinks = annLinks;
                const annMore = vis.locator('.cmp_announcements a[href]').first();
                if (await annMore.count()) { await annMore.click(); await idle(vis); out.annFollow = {url: vis.url(), h1: flat(await vis.locator('h1').first().innerText().catch(() => null), 80)}; await snap(vis, 'f-ann-follow'); }
                // the skip links
                out.skipLinks = h.skipLinks;
                // OPS: the search box
                if (isOps) {
                    await vis.goto(ctxUrl(app, F)); await idle(vis);
                    const q = vis.locator('.archiveHeader input[type="text"], .archiveHeader input[name="query"]').first();
                    out.searchBox = await q.count();
                    if (out.searchBox) {
                        await q.fill('K2 P03');
                        await vis.locator('.archiveHeader button, .archiveHeader input[type="submit"]').first().click();
                        await idle(vis);
                        const s = await snap(vis, 'f-home-search');
                        out.search = {url: vis.url(), text: flat(s.text && s.text.main, 500)};
                    }
                }
                // OJS: an article summary's title link and the current issue's links
                if (isOjs) {
                    await vis.goto(ctxUrl(app, F)); await idle(vis);
                    out.latestLinks = await vis.locator('.latest_articles a').evaluateAll((els) => els.map((a) => ({t: a.innerText.trim().slice(0, 60), h: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '')})));
                    out.issueLinks = await vis.locator('.current_issue a').evaluateAll((els) => els.map((a) => ({t: a.innerText.trim().slice(0, 60), h: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '')})));
                }
                if (isOmp) {
                    await vis.goto(ctxUrl(app, F)); await idle(vis);
                    out.bookLinks = await vis.locator('.cmp_monographs_list a').evaluateAll((els) => els.map((a) => ({t: a.innerText.trim().slice(0, 60), h: (a.getAttribute('href') || '').replace(/^https?:\/\/[^/]+/, '')})));
                }
                fact('sweep-home', out);
            });
            await step('sweep-theme-leave', async () => {
                await as(st.mF, F);
                const out = {};
                const n0 = dialogs.length;
                let th = await openTab(page, app, F, 'appearance', 'theme');
                const box = isOjs ? th.getByRole('checkbox', {name: THEME.cats, exact: true}) : th.getByRole('checkbox', {name: THEME.summary});
                out.before = await box.isChecked();
                await box.setChecked(!out.before);
                await page.locator('#appearance-setup-button').click(); await idle(page); await sleep(300);
                await page.locator('#theme-button').click(); await idle(page); await sleep(300);
                th = page.locator('[role="tabpanel"]#theme').first();
                out.afterSideTab = await (isOjs ? th.getByRole('checkbox', {name: THEME.cats, exact: true}) : th.getByRole('checkbox', {name: THEME.summary})).isChecked();
                await snap(page, 'f-theme-unsaved-back', {out});
                await page.goto(ctxUrl(app, F, '/dashboard/editorial')).catch(() => {}); await idle(page);
                out.dialogs = dialogs.slice(n0);
                th = await openTab(page, app, F, 'appearance', 'theme');
                out.afterLeave = await (isOjs ? th.getByRole('checkbox', {name: THEME.cats, exact: true}) : th.getByRole('checkbox', {name: THEME.summary})).isChecked();
                const h = await visitHome(vis, app, F, 'f-home-after-unsaved');
                out.homeParts = h.partOrder;
                // OPS1 / OMP: the summary off, then back on
                if (!isOjs) {
                    out.summaryOff = (await setTheme(page, app, F, {summary: false})).save;
                    const hs = await visitHome(vis, app, F, 'f-home-summary-off');
                    out.summaryOffParts = hs.partOrder;
                    out.summaryOn = (await setTheme(page, app, F, {summary: true})).save;
                }
                fact('sweep-theme-leave', out);
                await signOut(page);
            });
        }
        // ======================= an issue unpublished after its article (Rule 13's second end) ===
        if (on('unpub') && isOjs) {
            await step('unpub', async () => {
                await as(st.mF, F);
                const out = {};
                await page.goto(ctxUrl(app, F, '/manageIssues')); await idle(page);
                const back = page.getByRole('tab', {name: 'Back Issues'}).or(page.getByRole('link', {name: 'Back Issues', exact: true})).first();
                await back.click(); await idle(page); await sleep(800);
                const row = page.locator('tr.gridRow').filter({hasText: 'Vol. 1 No. 1 (2026)'}).filter({visible: true});
                await row.first().waitFor({state: 'visible', timeout: T});
                await row.first().locator('a.show_extras').click();
                const un = page.getByRole('link', {name: 'Unpublish Issue', exact: true});
                out.offered = await un.count();
                await snap(page, 'f-backissues-row', {out});
                await un.first().click();
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.waitFor({timeout: T});
                out.confirm = flat(await dlg.innerText().catch(() => null), 300);
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /unpublish/i.test(r.url()), {timeout: T}).catch(() => null);
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                const r = await w; out.status = r && r.status();
                await idle(page);
                await snap(page, 'f-issue-unpublished', {out});
                const h = await visitHome(vis, app, F, 'f-home-after-unpublish');
                out.home = {parts: h.partOrder, latest: h.latest && h.latest.items, pageInfo: h.latest && h.latest.text && h.latest.text.slice(-40), current: h.currentIssue};
                const art = await visitOther(vis, ctxUrl(app, F, `/article/view/${st.subs.i.id}`), 'f-article-i-after-unpublish');
                out.articleI = art;
                fact('unpub', out);
                await signOut(page);
            });
        }
        // ======================= published at once into a future issue (Rule 13's second end) ===
        if (on('early') && isOjs) {
            await step('early', async () => {
                const out = {};
                if (!st.subs.y) {
                    const r = await app.api.createSubmission({tag: `${F}y`, context: F, submitter: st.aF, title: `K2 Y ${F}`, decisions: ['skipExternalReview', 'sendToProduction']});
                    st.subs.y = {id: r.submissionId, publicationId: r.publicationId}; save();
                }
                await as(st.mF, F);
                const y = st.subs.y;
                await page.goto(ctxUrl(app, F, `/dashboard/editorial?workflowSubmissionId=${y.id}&workflowMenuKey=publication_${y.publicationId}_titleAbstract`));
                await idle(page); await sleep(1500); await idle(page);
                const pubBtn = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
                await pubBtn.click({timeout: 15000});
                await sleep(1500);
                const vs = page.locator('select[name="versionStage"]');
                if (await vs.isVisible({timeout: 5000}).catch(() => false)) {
                    await vs.selectOption('VoR').catch(() => vs.selectOption({index: 1}).catch(() => {}));
                    await page.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
                }
                await page.getByRole('radio', {name: 'Assign To Future Issue and Publish Immediately'}).check();
                await sleep(800);
                const sels = await page.locator('[data-cy="active-modal"] select, [role="dialog"] select').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({name: e.name, id: e.id, options: [...e.options].map((o) => ({v: o.value, t: o.textContent.trim()}))})));
                out.selects = sels;
                const issueSel = sels.find((x) => x.options.some((o) => /No\. 2/.test(o.t)));
                if (issueSel) {
                    const sel = page.locator(issueSel.id ? `[id="${issueSel.id}"]` : `select[name="${issueSel.name}"]`);
                    await sel.selectOption(issueSel.options.find((o) => /No\. 2/.test(o.t)).v);
                }
                await snap(page, 'y-publish-panel', {out});
                await page.getByRole('button', {name: 'Confirm', exact: true}).last().click();
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
                await conf.waitFor({timeout: 20000}).catch(() => {});
                out.confirm = flat(await conf.innerText().catch(() => null), 400);
                const pr = page.waitForResponse((r) => /\/publish/.test(r.url()), {timeout: 30000}).catch(() => null);
                await conf.getByRole('button', {name: /^(Publish|Schedule|OK)$/}).last().click().catch((e) => { out.confirmErr = flat(e.message, 200); });
                const r = await pr; out.publishStatus = r && r.status();
                await sleep(1500); await idle(page);
                await snap(page, 'y-after-publish', {out});
                const h = await visitHome(vis, app, F, 'f-home-after-y');
                out.home = {parts: h.partOrder, latest: h.latest && h.latest.items, pageInfo: h.latest && h.latest.text && h.latest.text.slice(-40)};
                out.articleY = await visitOther(vis, ctxUrl(app, F, `/article/view/${y.id}`), 'f-article-y');
                fact('early', out);
                await signOut(page);
            });
        }
        // ======================= every organization box unticked, again, with the request the tab sends ===
        if (on('none2') && isOjs) {
            await step('none2', async () => {
                const out = {};
                const org = (ff) => (ff.fields || []).filter((x) => /Content Organization/.test(x.label || '')).map((x) => x.options.map((q) => `${q.checked ? '[x]' : '[ ]'} ${q.label}`));
                for (const [key, ctx, mgr] of [['N', st.N, st.mN], ['F', F, st.mF]]) {
                    const o = {};
                    await as(mgr, ctx);
                    const seq = key === 'N' ? [['recentOnly', {toc: false, recent: true, cats: false}], ['none', {toc: false, recent: false, cats: false}]] : [['none', {toc: false, recent: false, cats: false}]];
                    for (const [label, want] of seq) {
                        const reqs = [];
                        const onReq = (r) => { if (/\/theme$/.test(r.url()) && r.method() !== 'GET') reqs.push({method: r.method(), override: r.headers()['x-http-method-override'] || null, body: (r.postData() || '').slice(0, 1500)}); };
                        page.on('request', onReq);
                        const r = await setTheme(page, app, ctx, want);
                        page.off('request', onReq);
                        const th = await openTab(page, app, ctx, 'appearance', 'theme');
                        await th.locator('.pkpFormField').first().waitFor({timeout: T});
                        const back = await formFields(th);
                        await snap(page, `none2-${key}-${label}-theme-reloaded`, {reqs});
                        const h = await visitHome(vis, app, ctx, `none2-${key}-${label}-home`);
                        o[label] = {save: r.save, afterClicks: org(r.after), reqs, reloaded: org(back), home: h.partOrder};
                    }
                    out[key] = o;
                    await signOut(page);
                }
                fact('none2', out);
            });
        }
    } finally {
        record('dialogs', {dialogs});
        await mgrB.close();
        await visB.close();
    }
});
