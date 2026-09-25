// U16 claim check, chunk K4: a category's page (the visitor's side). All three apps.
// Spec: docs/specs/U16-categories.md lines 110–120 (the page's parts), 178–220
// (Rules 8–13), 299–300 (Settings 5 "Items per page" / "Page links"); register
// A1, A2, A3, A5, A6, A7, OMP1; footnotes g, i, l, m, td7–td11, td14, f-a1–f-a3,
// f-a5–f-a7, f-omp1.
//
// Seeds per app (scratch, tag prefix u16k4):
//   A  categories "Science" › "Physics" › "Quantum", "Empty Shelf", "Ordering",
//      "Pictured", "Small Picture"; a manager and an author; published items
//      in Physics only, in Science, in Quantum; a submission still in the
//      workflow in Science; {OJS} one scheduled into a future issue in Science;
//      one published in Science then unpublished on screen; "Beta Item",
//      "Alpha Item", "Gamma Item" published in that order into "Ordering".
//   B  "Items per page" 1 (the context key), category "Paged" with three
//      published items.
// Phases (PHASES=a,…; default all, in this order): seed, jobs, read, unpub,
// late, order, feature {OMP}, paging, lists, picture, leave, seeded, signedin.
// State: .reports/U16/<agent>/k4-state-<app>.json; RESEED=1 starts over.
// Run: PROBE_FEATURE=U16 PROBE_AGENT=ccK4 node bin/probe.js <app|all> shared/playwright/checks/U16/K4/k4.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'jobs', 'read', 'unpub', 'late', 'order', 'feature', 'paging', 'lists', 'picture', 'leave', 'seeded', 'signedin'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const T = 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (t, n = 400) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const log = (...a) => console.log('[k4]', new Date().toISOString().slice(11, 19), ...a);

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
        for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; }
    }
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
};
const BIG = {name: 'k4-red-300x200.png', mimeType: 'image/png', buffer: png(300, 200, [220, 0, 0])};
const SMALL = {name: 'k4-blue-40x40.png', mimeType: 'image/png', buffer: png(40, 40, [0, 0, 200])};

// the app's own queue worker (the search index jobs a publish queues); support/jobs.js's
// runJobs() waits on worker 0's server (basePort), which a probe run does not have up
const drainJobs = (app) => {
    try {
        return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 180_000})
            .split('\n').filter((l) => l.trim()).slice(-3).join(' | ');
    } catch (e) { return `error: ${String(e.message).split('\n')[0]}`; }
};

// the visitor's category page as data
const readCategory = async (p) => p.evaluate(() => {
    const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
    const pg = document.querySelector('.page_catalog_category');
    if (!pg) return {page: false, h1: txt(document.querySelector('h1')), body: txt(document.querySelector('.pkp_structure_main, main, body')).slice(0, 600)};
    const crumbs = [...pg.querySelectorAll('.cmp_breadcrumbs li, nav[class*=breadcrumb] li')].map((li) => {
        const a = li.querySelector('a');
        return {text: txt(li).replace(/\s*\/\s*$/, ''), link: a ? a.getAttribute('href') : null, current: li.getAttribute('aria-current') || (li.querySelector('[aria-current]') ? 'inner' : null)};
    });
    const subs = pg.querySelector('nav.subcategories');
    const items = [...pg.querySelectorAll('.obj_article_summary, .obj_preprint_summary, .obj_monograph_summary')].map((e) => txt(e.querySelector('.title, h3, h2, h4')) || txt(e).slice(0, 80));
    const cover = pg.querySelector('.about_section .cover');
    const img = cover ? cover.querySelector('img') : pg.querySelector('.about_section img');
    const known = new Set([...pg.querySelectorAll('.cmp_breadcrumbs a, nav.subcategories a, .obj_article_summary a, .obj_preprint_summary a, .obj_monograph_summary a')]);
    const otherLinks = [...pg.querySelectorAll('a')].filter((a) => !known.has(a)).map((a) => ({text: txt(a), href: a.getAttribute('href'), cls: a.className}));
    return {
        page: true,
        h1: txt(pg.querySelector('h1')),
        count: txt(pg.querySelector('.article_count, .monograph_count, .preprint_count, [class*=_count]')),
        crumbs,
        subcategories: subs ? {heading: txt(subs.querySelector('h2')), links: [...subs.querySelectorAll('a')].map((a) => ({text: txt(a), href: a.getAttribute('href')}))} : null,
        h2: [...pg.querySelectorAll('h2')].map(txt),
        // whether each heading is drawn on screen (the default theme may hide one for screen readers only)
        h2shown: [...pg.querySelectorAll('h2')].map((h) => { const r = h.getBoundingClientRect(); const cs = getComputedStyle(h); return {text: txt(h), w: Math.round(r.width), h: Math.round(r.height), clip: cs.clip, position: cs.position, drawn: r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.clip === 'auto'}; }),
        countShown: (() => { const c = pg.querySelector('.article_count, .monograph_count, .preprint_count, [class*=_count]'); if (!c) return null; const r = c.getBoundingClientRect(); return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width)}; })(),
        items,
        description: txt(pg.querySelector('.about_section .description')),
        descriptionHtml: (pg.querySelector('.about_section .description') || {}).innerHTML?.trim().slice(0, 400) ?? null,
        aboutClass: (pg.querySelector('.about_section') || {}).className || null,
        cover: cover ? {tag: cover.tagName, href: cover.getAttribute('href'), role: cover.getAttribute('role'), tabindex: cover.getAttribute('tabindex'), inLink: !!cover.closest('a')} : null,
        img: img ? {src: img.getAttribute('src'), alt: img.getAttribute('alt'), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: img.clientWidth, height: img.clientHeight, complete: img.complete, inLink: !!img.closest('a')} : null,
        noItemsMessage: /Nothing has been published in this category yet\.|No titles have been published yet\./.test(pg.innerText),
        text: txt(pg).slice(0, 2500),
        otherLinks,
    };
});

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs';
    const isOmp = app.name === 'omp';
    const isOps = app.name === 'ops';
    const CAT = isOps ? 'preprints' : 'catalog';
    const stateFile = path.join(outDir(), `k4-state-${app.name}.json`);
    let st = (!process.env.RESEED && fs.existsSync(stateFile)) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
    const save = () => fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
    const ctxUrl = (ctx, p = '', locale = 'en') => app.url(`/index.php/${ctx}${locale ? '/' + locale : ''}${p}`);
    const fact = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(app.name, k, JSON.stringify(v).slice(0, 1500)); };

    // ======================= seed =======================================================
    if (on('seed') && !st.A) {
        const t = tag('u16k4');
        const tA = `${t}a`;
        const u = (tg, key, roles, given, family) => ({username: `${tg}${key}`, roles, givenName: given, familyName: family});
        const resA = await app.api.createContext({
            tag: tA, context: {name: `U16 K4 A ${tA}`, acronym: 'K4A'},
            users: [u(tA, 'mgr', ['manager'], 'Kira', 'Manager'), u(tA, 'au', ['author'], 'Kai', 'Author')],
            categories: [
                {path: 'science', title: 'Science', children: [{path: 'physics', title: 'Physics', children: [{path: 'quantum', title: 'Quantum'}]}]},
                {path: 'empty', title: 'Empty Shelf'},
                {path: 'order', title: 'Ordering'},
                {path: 'pic', title: 'Pictured'},
                {path: 'small', title: 'Small Picture'},
            ],
            ...(isOjs ? {issues: [{volume: 1, number: 1, year: 2026, published: true}, {volume: 9, number: 1, year: 2030, published: false}]} : {}),
        });
        st.A = {path: tA, id: resA.contextId, mgr: `${tA}mgr`, au: `${tA}au`, cats: resA.categories, subs: {}};
        save();
        const iss = isOjs ? {issue: {volume: 1, number: 1, year: 2026}} : {};
        const mk = async (key, title, cats, extra = {published: true, ...iss}) => {
            const r = await app.api.createSubmission({tag: `${tA}${key}`, context: tA, submitter: `${tA}au`, title, submitted: true, categories: cats, ...extra});
            st.A.subs[key] = r.submissionId; save();
            await sleep(1100);
        };
        await mk('phys', 'Physics Only Item', ['physics']);
        await mk('sci', 'Science Item', ['science']);
        await mk('quan', 'Quantum Item', ['quantum']);
        await mk('wf', 'Workflow Item', ['science'], {});
        if (isOjs) await mk('sched', 'Scheduled Item', ['science'], {published: true, issue: {volume: 9, number: 1, year: 2030}});
        await mk('unpub', 'Unpublished Item', ['science']);
        await mk('beta', 'Beta Item', ['order']);
        await mk('alpha', 'Alpha Item', ['order']);
        await mk('gamma', 'Gamma Item', ['order']);
        const tB = `${t}b`;
        const resB = await app.api.createContext({
            tag: tB, context: {name: `U16 K4 B ${tB}`, acronym: 'K4B'}, itemsPerPage: 1,
            users: [u(tB, 'mgr', ['manager'], 'Bea', 'Manager'), u(tB, 'au', ['author'], 'Ben', 'Author')],
            categories: [{path: 'paged', title: 'Paged'}],
        });
        st.B = {path: tB, id: resB.contextId, mgr: `${tB}mgr`, subs: {}};
        for (const n of [1, 2, 3]) {
            const r = await app.api.createSubmission({tag: `${tB}p${n}`, context: tB, submitter: `${tB}au`, title: `Paged Item ${n}`, submitted: true, published: true, categories: ['paged']});
            st.B.subs[`p${n}`] = r.submissionId; await sleep(1100);
        }
        save();
        fact('seed', st);
    }
    if (!st.A) { log(app.name, 'no seed state; run the seed phase'); return; }

    const {page, close} = await launch(app);
    const vis = await page.context().browser().newContext({viewport: {width: 1280, height: 900}}).then((c) => c.newPage());
    // the visitor page's own responses of 400 and more (the kit's record covers the signed-in page)
    const visResponses = [];
    vis.on('response', (r) => { if (r.status() >= 400) visResponses.push({status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '')}); });
    vis.on('pageerror', (e) => visResponses.push({pageerror: String(e.message).slice(0, 300)}));
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
    // a visitor (not signed in) opens a category page and records it
    const visit = async (ctx, catPath, name, p = vis) => {
        const r = await p.goto(ctxUrl(ctx, `/${CAT}/category/${catPath}`)).catch((e) => ({error: flat(e.message, 200)}));
        await idle(p).catch(() => {});
        await snap(p, name);
        const data = r && r.status ? {status: r.status()} : {status: r ? r.error : null};
        Object.assign(data, await readCategory(p).catch((e) => ({readError: flat(e.message, 200)})));
        return data;
    };
    const asMgr = async (ctx) => { await signIn(page, st[ctx].mgr, {contextPath: st[ctx].path}); await idle(page); };
    // the "Categories" tab and one top-level row's "More Actions" › "Edit"
    const openEdit = async (ctx, catName) => {
        await page.goto(ctxUrl(st[ctx].path, '/management/settings/context')); await idle(page);
        await page.getByRole('tab', {name: 'Categories', exact: true}).first().click(); await idle(page); await sleep(600);
        const row = page.getByRole('row').filter({hasText: catName}).first();
        await row.getByRole('button', {name: /More Actions/}).first().click(); await sleep(400);
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click(); await idle(page); await sleep(1200);
        const dlg = page.getByRole('dialog', {name: /Edit Category/}).first();
        await dlg.locator('input[name="path"]').first().waitFor({timeout: T});
        // the form fills from the fetched category after it renders
        for (let i = 0; i < 20 && !(await dlg.locator('input[name="path"]').first().inputValue()); i++) await sleep(250);
        return dlg;
    };
    const saveWindow = async (dlg) => {
        const w = page.waitForResponse((r) => r.request().method() !== 'GET' && /categor/i.test(r.url()), {timeout: T}).catch(() => null);
        await dlg.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await w; await idle(page); await sleep(1200);
        const open = await page.getByRole('dialog', {name: /Edit Category/}).count();
        return {status: r ? r.status() : null, url: r ? r.url().replace(/^https?:\/\/[^/]+/, '') : null, method: r ? r.request().method() : null, windowStillOpen: open > 0};
    };

    try {
        // ======================= jobs: the index jobs of the seeded publishes ===========
        if (on('jobs')) await step('jobs', async () => {
            // before the drain: the page as the seed left it (the jobs have not run)
            fact('before-jobs', {science: await visit(st.A.path, 'science', 'a-science-before-jobs'), physics: await visit(st.A.path, 'physics', 'a-physics-before-jobs')});
            const sci = st.A.subs.sci;
            await vis.goto(ctxUrl(st.A.path, isOmp ? `/catalog/book/${sci}` : `/${isOps ? 'preprint' : 'article'}/view/${sci}`)); await idle(vis);
            const sItem = await snap(vis, 'a-sci-item-before-jobs');
            fact('item-before-jobs', flat(sItem.text && (sItem.text.main || sItem.text.body), 1500));
            fact('jobs-1', drainJobs(app));
            st.jobs1 = true; save();
        });

        // ======================= read: every page as a visitor ==========================
        if (on('read')) await step('read', async () => {
            const out = {};
            for (const [k, p] of [['science', 'science'], ['physics', 'physics'], ['quantum', 'quantum'], ['empty', 'empty'], ['order', 'order'], ['unknown', 'no-such-category']]) {
                out[k] = await visit(st.A.path, p, `a-${k}`);
            }
            // control: an unknown item's address on the same site (typed), to compare the not-found page
            out.unknownItemControl = await (async () => { const r = await vis.goto(ctxUrl(st.A.path, isOmp ? '/catalog/book/999999' : `/${isOps ? 'preprint' : 'article'}/view/999999`)); await idle(vis); const s2 = await snap(vis, 'a-unknown-item-control'); return {status: r.status(), title: s2.title, text: flat(s2.text && (s2.text.main || s2.text.body), 300)}; })();
            if (isOps) out.opsCatalogAddress = await (async () => { const r = await vis.goto(ctxUrl(st.A.path, '/catalog/category/science')); await idle(vis); await snap(vis, 'a-ops-catalog-address'); return {status: r.status(), url: vis.url(), ...(await readCategory(vis))}; })();
            // what the breadcrumb's links lead to
            await vis.goto(ctxUrl(st.A.path, `/${CAT}/category/quantum`)); await idle(vis);
            const parentLink = vis.locator('.cmp_breadcrumbs a').filter({hasText: 'Physics'}).first();
            await loc(vis, 'category page: breadcrumb parent link', parentLink);
            await loc(vis, 'category page: breadcrumb current step', vis.locator('.cmp_breadcrumbs [aria-current="page"]').first());
            await loc(vis, 'category page: Subcategories nav', vis.locator('nav.subcategories'));
            if (await parentLink.count()) { await parentLink.click(); await idle(vis); out.parentLinkLandsOn = vis.url().replace(/^https?:\/\/[^/]+/, ''); }
            const home = vis.locator('.cmp_breadcrumbs a').filter({hasText: 'Home'}).first();
            if (await home.count()) { await home.click(); await idle(vis); out.homeLinkLandsOn = vis.url().replace(/^https?:\/\/[^/]+/, ''); }
            // the article/book page names its categories
            const sci = st.A.subs.sci;
            await vis.goto(ctxUrl(st.A.path, isOmp ? `/catalog/book/${sci}` : `/${isOps ? 'preprint' : 'article'}/view/${sci}`)); await idle(vis);
            const s = await snap(vis, 'a-sci-item');
            const catLinks = await vis.locator('a[href*="/category/"]').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
            out.itemPage = {catLinks, text: flat(s.text && (s.text.main || s.text.body), 1200)};
            fact('read', out);
        });

        // ======================= unpub: a published item in "Science" unpublished on screen ==
        if (on('unpub') && !st.unpubDone) await step('unpub', async () => {
            const o = {};
            o.before = await visit(st.A.path, 'science', 'a-science-before-unpub');
            await asMgr('A');
            const UNPUB = isOps ? 'Unpost' : 'Unpublish';
            await page.goto(ctxUrl(st.A.path, `/dashboard/editorial?workflowSubmissionId=${st.A.subs.unpub}`)); await idle(page); await sleep(1500);
            const wf = page.locator('[role="dialog"]').first();
            const unBtn = wf.getByRole('button', {name: UNPUB, exact: true}).first();
            await unBtn.waitFor({timeout: T});
            await unBtn.click(); await sleep(800);
            const conf = page.locator('[role="dialog"]').filter({hasText: /unpublish|unpost|Are you sure/i}).last();
            o.confirm = flat(await conf.innerText().catch(() => ''), 300);
            const w = page.waitForResponse((r) => /unpublish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await conf.getByRole('button', {name: new RegExp(`^(${UNPUB}|OK|Yes)$`)}).last().click();
            const r = await w; o.unpublishStatus = r ? r.status() : null;
            await idle(page); await sleep(1500);
            await snap(page, 'a-unpublished-wf');
            await signOut(page);
            o.afterNoJobs = await visit(st.A.path, 'science', 'a-science-after-unpub-nojobs');
            o.jobs = drainJobs(app);
            o.afterJobs = await visit(st.A.path, 'science', 'a-science-after-unpub-jobs');
            st.unpubDone = true; save();
            fact('unpub', o);
        });

        // ======================= late: a third item into "Science", before and after the jobs =
        if (on('late') && !st.lateDone) await step('late', async () => {
            const o = {};
            const r = await app.api.createSubmission({tag: `${st.A.path}late`, context: st.A.path, submitter: st.A.au, title: 'Late Item', submitted: true, published: true, categories: ['science'], ...(isOjs ? {issue: {volume: 1, number: 1, year: 2026}} : {})});
            st.A.subs.late = r.submissionId; save();
            o.beforeJobs = await visit(st.A.path, 'science', 'a-science-late-nojobs');
            await vis.goto(ctxUrl(st.A.path, isOmp ? `/catalog/book/${r.submissionId}` : `/${isOps ? 'preprint' : 'article'}/view/${r.submissionId}`)); await idle(vis);
            const s = await snap(vis, 'a-late-item-nojobs');
            o.itemPage = {catLinks: await vis.locator('a[href*="/category/"]').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))), text: flat(s.text && (s.text.main || s.text.body), 800)};
            o.jobs = drainJobs(app);
            o.afterJobs = await visit(st.A.path, 'science', 'a-science-late-jobs');
            st.lateDone = true; save();
            fact('late', o);
        });

        // ======================= order: every "Order of …" choice, saved, then the page ======
        if (on('order')) await step('order', async () => {
            const o = {runs: []};
            await asMgr('A');
            let dlg = await openEdit('A', 'Ordering');
            await snap(page, 'a-order-window');
            const sel = dlg.locator('select[name="sortOption"]').first();
            await loc(page, 'category window: Order of … select', sel);
            o.options = await sel.evaluate((s) => [...s.options].map((x) => ({value: x.value, label: x.textContent.trim(), selected: x.selected})));
            o.label = flat(await dlg.locator('label[for="editCategory-sortOption-control"], [id*="sortOption"] legend, .pkpFormField--select label').first().innerText().catch(() => null), 120);
            await dlg.getByRole('button', {name: 'Close'}).first().click().catch(() => {}); await sleep(700);
            o.initial = await visit(st.A.path, 'order', 'a-order-initial');
            for (const opt of o.options) {
                dlg = await openEdit('A', 'Ordering');
                await dlg.locator('select[name="sortOption"]').first().selectOption(opt.value);
                const saved = await saveWindow(dlg);
                const pageRead = await visit(st.A.path, 'order', `a-order-${opt.value}`);
                o.runs.push({choice: opt.label, value: opt.value, saved, items: pageRead.items, count: pageRead.count});
            }
            // back to the default
            dlg = await openEdit('A', 'Ordering');
            const def = o.options.find((x) => x.selected) || o.options.find((x) => /newest/i.test(x.label));
            if (def) { await dlg.locator('select[name="sortOption"]').first().selectOption(def.value); await saveWindow(dlg); }
            await signOut(page);
            fact('order', o);
        });

        // ======================= feature {OMP}: a featured book on the category page =========
        if (on('feature') && isOmp) await step('feature', async () => {
            const o = {};
            o.before = (await visit(st.A.path, 'order', 'a-order-feature-before')).items;
            await asMgr('A');
            await page.goto(ctxUrl(st.A.path, '/manageCatalog')); await idle(page);
            await page.locator('.listPanel__item--catalog').first().waitFor({timeout: T});
            await snap(page, 'a-catalog-manage');
            const lastTitle = (o.before && o.before.length) ? o.before[o.before.length - 1] : 'Gamma Item';
            const item = page.locator('.listPanel__item--catalog').filter({hasText: lastTitle}).first();
            const reqs = [];
            const onR = (r) => { if (r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url())) reqs.push({status: r.status(), url: r.url().replace(/^.*\/index\.php/, '')}); };
            page.on('response', onR);
            await item.getByRole('button', {name: /is not featured\. Make this monograph featured\./}).first().click();
            await sleep(1500); await idle(page);
            page.off('response', onR);
            o.featured = lastTitle; o.reqs = reqs;
            await snap(page, 'a-catalog-featured');
            await signOut(page);
            fact('feature-jobs', drainJobs(app));
            o.after = (await visit(st.A.path, 'order', 'a-order-feature-after')).items;
            fact('feature', o);
        });

        // ======================= paging: "Items per page" 1, three items ========================
        if (on('paging')) await step('paging', async () => {
            const o = {};
            o.p1 = await visit(st.B.path, 'paged', 'b-paged-p1');
            const lnk = vis.locator('.page_catalog_category a').filter({hasText: /^\s*2\s*$/}).first();
            await loc(vis, 'category page: page link "2"', lnk);
            if (await lnk.count()) {
                await lnk.click(); await idle(vis); await snap(vis, 'b-paged-p2');
                o.p2 = {url: vis.url().replace(/^https?:\/\/[^/]+/, ''), ...(await readCategory(vis))};
                const nxt = vis.locator('.page_catalog_category a').filter({hasText: /^\s*(>|Next|›|»)\s*$/}).first();
                if (await nxt.count()) { await nxt.click(); await idle(vis); await snap(vis, 'b-paged-p3'); o.p3 = {url: vis.url().replace(/^https?:\/\/[^/]+/, ''), ...(await readCategory(vis))}; }
            }
            fact('paging', o);
        });

        // ======================= lists: Settings › Website › Setup › "Lists", both ends =========
        if (on('lists')) await step('lists', async () => {
            const o = {};
            const openLists = async (ctx) => {
                await page.goto(ctxUrl(st[ctx].path, '/management/settings/website')); await idle(page);
                await page.locator('#setup-button').first().click(); await idle(page); await sleep(400);
                await page.locator('#lists-button').first().click(); await idle(page); await sleep(700);
                return page.locator('[role="tabpanel"]#lists').first();
            };
            const vals = async (pn) => ({itemsPerPage: await pn.locator('input[name="itemsPerPage"]').inputValue(), numPageLinks: await pn.locator('input[name="numPageLinks"]').inputValue()});
            const saveLists = async (pn) => {
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => null);
                await pn.locator('form').first().getByRole('button', {name: 'Save', exact: true}).last().click();
                const r = await w;
                const saved = await pn.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 6000}).then(() => true).catch(() => false);
                return {status: r ? r.status() : null, saved};
            };
            // A: the defaults
            await asMgr('A');
            let pn = await openLists('A');
            await snap(page, 'a-lists');
            o.A = await vals(pn);
            await loc(page, 'Lists tab: Items per page box', pn.locator('input[name="itemsPerPage"]'));
            await loc(page, 'Lists tab: Page links box', pn.locator('input[name="numPageLinks"]'));
            await signOut(page);
            // B: 1 and 10, then Page links 2, then back to 25 (one page)
            await asMgr('B');
            pn = await openLists('B');
            o.B = await vals(pn);
            await snap(page, 'b-lists');
            await pn.locator('input[name="numPageLinks"]').fill('2');
            o.save2 = await saveLists(pn);
            o.links2p1 = await visit(st.B.path, 'paged', 'b-paged-npl2-p1');
            const l2 = vis.locator('.page_catalog_category a').filter({hasText: /^\s*2\s*$/}).first();
            if (await l2.count()) { await l2.click(); await idle(vis); await snap(vis, 'b-paged-npl2-p2'); o.links2p2 = {url: vis.url().replace(/^https?:\/\/[^/]+/, ''), ...(await readCategory(vis))}; }
            pn = await openLists('B');
            await pn.locator('input[name="itemsPerPage"]').fill('25'); await pn.locator('input[name="numPageLinks"]').fill('10');
            o.save25 = await saveLists(pn);
            o.ipp25 = await visit(st.B.path, 'paged', 'b-paged-ipp25');
            // leave the tab with a change unsaved: another tab, then another page
            pn = await openLists('B');
            await pn.locator('input[name="itemsPerPage"]').fill('7'); await pn.locator('input[name="itemsPerPage"]').blur();
            const dialogs = [];
            const onD = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onD);
            await page.locator('#dateTime-button, [role="tab"]:has-text("Date & Time")').first().click().catch(() => {}); await idle(page); await sleep(500);
            await snap(page, 'b-lists-left-tab');
            await page.locator('#lists-button').first().click().catch(() => {}); await sleep(500);
            o.afterTabSwitch = await pn.locator('input[name="itemsPerPage"]').inputValue().catch(() => null);
            await page.goto(ctxUrl(st.B.path, '/management/settings/context')).catch((e) => dialogs.push({gotoError: flat(e.message, 200)}));
            await idle(page);
            page.off('dialog', onD);
            o.leaveDialogs = dialogs;
            pn = await openLists('B');
            o.afterLeave = await vals(pn);
            // restore "Items per page" 1 for a rerun of paging
            await pn.locator('input[name="itemsPerPage"]').fill('1'); o.restore = await saveLists(pn);
            await signOut(page);
            fact('lists', o);
        });

        // ======================= picture: "Cover Image" (big and small) and "Description" ==========
        if (on('picture')) await step('picture', async () => {
            const o = {};
            await asMgr('A');
            for (const [catName, catPath, file, withText] of [['Pictured', 'pic', BIG, true], ['Small Picture', 'small', SMALL, false]]) {
                const r = {};
                const dlg = await openEdit('A', catName);
                const fileIn = dlg.locator('input[type="file"]').first();
                await loc(page, 'category window: Cover Image file input', fileIn);
                await fileIn.setInputFiles(file);
                const alt = dlg.getByRole('textbox', {name: /Alternate text/i}).first();
                r.altBox = await alt.waitFor({timeout: T}).then(() => true).catch(() => false);
                await sleep(800);
                await snap(page, `a-${catPath}-window-uploaded`);
                if (r.altBox) await alt.fill(withText ? 'A red square' : 'A blue square');
                if (withText) {
                    await page.waitForFunction(() => window.tinymce && window.tinymce.get('editCategory-description-control-en') && window.tinymce.get('editCategory-description-control-en').initialized, null, {timeout: T}).catch(() => {});
                    const body = page.frameLocator('#editCategory-description-control-en_ifr').locator('body');
                    await body.click(); await page.keyboard.type('Pictured category description.');
                    await sleep(400);
                }
                r.save = await saveWindow(dlg);
                const reqs = [];
                const onR = (x) => { if (/thumbnail|fullSize/.test(x.url())) reqs.push({status: x.status(), url: x.url().replace(/^https?:\/\/[^/]+/, ''), type: x.headers()['content-type'] || null, length: x.headers()['content-length'] || null}); };
                vis.on('response', onR);
                r.page = await visit(st.A.path, catPath, `a-${catPath}-page`);
                await sleep(500);
                vis.off('response', onR);
                r.imgResponses = reqs;
                const img = vis.locator('.about_section img').first();
                await loc(vis, `category page: picture (${catName})`, img);
                r.imgRole = await vis.getByRole('img').evaluateAll((els) => els.map((e) => ({alt: e.getAttribute('alt'), src: e.getAttribute('src')}))).catch(() => null);
                r.ariaImg = await vis.locator('.about_section').ariaSnapshot().catch(() => null);
                // pressing the picture
                if (await img.count()) {
                    const before = vis.url();
                    const pop = vis.context().waitForEvent('page', {timeout: 2500}).catch(() => null);
                    await img.click({timeout: 5000}).catch((e) => { r.clickError = flat(e.message, 200); });
                    const np = await pop; await sleep(800);
                    r.afterClick = {urlChanged: vis.url() !== before, url: vis.url().replace(/^https?:\/\/[^/]+/, ''), newTab: np ? np.url() : null};
                    if (np) await np.close();
                    // the full-size address the page's "cover" carries, typed into the address bar
                    const full = r.page.cover && r.page.cover.href;
                    if (full) {
                        const fr = await vis.goto(full).catch((e) => ({err: flat(e.message, 200)}));
                        r.fullSize = fr && fr.status ? {status: fr.status(), type: fr.headers()['content-type'] || null, length: fr.headers()['content-length'] || null, url: full.replace(/^https?:\/\/[^/]+/, '')} : fr;
                        await sleep(300);
                    }
                    // the thumbnail address, typed
                    const th = r.page.img && r.page.img.src;
                    if (th) {
                        const tr = await vis.goto(th).catch((e) => ({err: flat(e.message, 200)}));
                        r.thumbnail = tr && tr.status ? {status: tr.status(), type: tr.headers()['content-type'] || null, length: tr.headers()['content-length'] || null} : tr;
                    }
                }
                // the window reopened: what it kept
                const d2 = await openEdit('A', catName);
                await sleep(800);
                await snap(page, `a-${catPath}-window-reopened`);
                r.reopen = {alt: await d2.getByRole('textbox', {name: /Alternate text/i}).first().inputValue().catch(() => null), preview: await d2.locator('img').evaluateAll((els) => els.map((e) => ({src: e.getAttribute('src'), alt: e.getAttribute('alt'), w: e.naturalWidth, h: e.naturalHeight}))).catch(() => null)};
                await d2.getByRole('button', {name: 'Close'}).first().click().catch(() => {}); await sleep(700);
                o[catPath] = r;
            }
            await signOut(page);
            fact('picture', o);
        });

        // ======================= leave: the window left with a change unsaved ======================
        if (on('leave')) await step('leave', async () => {
            const o = {};
            await asMgr('A');
            const dialogs = [];
            const onD = async (d) => { dialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); };
            page.on('dialog', onD);
            let dlg = await openEdit('A', 'Empty Shelf');
            await dlg.locator('input[name="title-en"]').first().fill('Empty Shelf Changed');
            await dlg.locator('select[name="sortOption"]').first().selectOption({index: 0});
            await dlg.getByRole('button', {name: 'Close'}).first().click(); await sleep(900);
            o.afterClose = await snap(page, 'a-leave-window-closed');
            o.windowOpenAfterClose = await page.getByRole('dialog', {name: /Edit Category/}).count();
            o.tabRow = flat(await page.getByRole('row').filter({hasText: 'Empty Shelf'}).first().innerText().catch(() => null), 200);
            dlg = await openEdit('A', 'Empty Shelf');
            o.reopened = {name: await dlg.locator('input[name="title-en"]').first().inputValue(), order: await dlg.locator('select[name="sortOption"]').first().evaluate((s) => s.options[s.selectedIndex].textContent.trim())};
            // a change, then the page left with the window open
            await dlg.locator('input[name="title-en"]').first().fill('Empty Shelf Left');
            await dlg.locator('input[name="title-en"]').first().blur();
            await page.goto(ctxUrl(st.A.path, '/management/settings/website')).catch((e) => dialogs.push({gotoError: flat(e.message, 200)}));
            await idle(page);
            page.off('dialog', onD);
            o.dialogs = dialogs;
            o.visitor = await visit(st.A.path, 'empty', 'a-empty-after-leave');
            await signOut(page);
            fact('leave', o);
        });

        // ======================= seeded: publicknowledge's category pages (read only) ===============
        if (on('seeded')) await step('seeded', async () => {
            const o = {};
            for (const p of ['applied-science', 'comp-sci', 'computer-vision', 'eng', 'social-sciences']) {
                o[p] = await visit(app.contextPath, p, `pk-${p}`);
            }
            fact('seeded', o);
        });

        // ======================= signedin: the manager reads the same page =========================
        if (on('signedin')) await step('signedin', async () => {
            await asMgr('A');
            const s = await visit(st.A.path, 'science', 'a-science-signed-in', page);
            const v = await visit(st.A.path, 'science', 'a-science-visitor-again');
            fact('signedin', {signedIn: {count: s.count, items: s.items}, visitor: {count: v.count, items: v.items}});
            await signOut(page);
        });
    } finally {
        fact('visitor-responses', visResponses);
        await vis.context().close().catch(() => {});
        await close();
    }
});
