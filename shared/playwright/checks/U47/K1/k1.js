// U47 claim check, chunk K1: the "Media" page and its list, the "Upload Media File" window, the delete and
// unsaved-changes dialogs, Rules 1–2, 5–6 and 10, Settings bullets 1–3, register A2.
// Spec: docs/specs/U47-media-files.md lines 52–92, 128–183, 231–241, 261–265, 299–323, 451–460.
//
// Per app three scratch contexts:
//   A  install-default components; users mgr (manager), se (sectionEditor), le (layoutEditor, OJS/OMP), au (author).
//   B  every default dependent component's "These are dependent files…" box unticked (Rule 2e, Settings bullet 1).
//   C  MM ("Multimedia"; a press: "HTML Stylesheet") with "File Variants" ticked and "File Metadata" Supplementary
//      Content, and one more component ("Other"; a press: "Glossary") ticked dependent (Settings bullets 1–3).
// Submissions in A (submitter au; OJS/OMP in Production via skipExternalReview + sendToProduction, se (+ le) assigned;
// OPS submitted, se assigned):
//   sL  media: an Image pair (figure.png + figure-hi.png), style.css (HTML Stylesheet), OJS/OPS clip.png (Multimedia);
//       OJS/OPS an HTML galley  → the page per role (q1), row menus, Rule 1 stage lists and Dependent Files, Rule 6
//   sE  no media                 → "No Items", the upload window (q5, q6, q7, 2a–2d), rounds and IDs (q12, A2)
//   sD  an Image pair + style.css → the delete dialog (q14, Rule 5)
//   sR  OJS/OMP in Review         → Rule 10 (q23)
//   sV  published, figure.png     → Rule 1 "the version chosen in the side menu"
// B: sB (Rule 2e, q8). C: sC with MM web + high, Image web + high (q25, q26).
//
//   PROBE_FEATURE=U47 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U47/K1/k1.js
//   PHASES=seed,settings,allvariants,page,upload,failed,progress,docfields,stage1,rounds,delete,unsaved,review,deps,versions,nomedia,variants,leave
//   (default all; state in k1-state-<app>.json in the output dir; the mutating phases run once per seed: delete the
//   state file for a fresh run). No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const ALL = ['seed', 'settings', 'allvariants', 'page', 'upload', 'failed', 'progress', 'docfields', 'stage1', 'rounds', 'delete', 'unsaved', 'review', 'deps', 'versions', 'nomedia', 'variants', 'leave'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const T = 30000;

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 2000)});
    }
}

// Files larger than the probe servers accept (2 MB upload_max_filesize, 8 MB post_max_size): made at run time.
function bigFile(name, mb) {
    const p = path.join(outDir(), name);
    if (!fs.existsSync(p) || fs.statSync(p).size !== mb * 1024 * 1024) fs.writeFileSync(p, Buffer.alloc(mb * 1024 * 1024, 7));
    return p;
}

forEachApp(async (app) => {
    const sf = path.join(outDir(), `k1-state-${app.name}.json`);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const NV = isOMP ? 'HTML Stylesheet' : 'Multimedia'; // a default dependent type without file variants
    const MM = isOMP ? 'HTML Stylesheet' : 'Multimedia'; // the type context C gives file variants
    const EXTRA = isOMP ? 'Glossary' : 'Other';          // a component context C ticks dependent
    const DEPENDENT = isOMP ? ['Image', 'HTML Stylesheet'] : ['Multimedia', 'Image', 'HTML Stylesheet'];
    const htmlName = isOPS ? 'preprint.html' : 'article.html';
    const done = (p) => (sc.done || []).includes(p);
    const markDone = (p) => { sc.done = [...(sc.done || []), p]; save(); };

    // ---- seed -------------------------------------------------------------------------------
    if (on('seed') && !sc.A) {
        const t = tag('u47k1');
        const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sid', 'Section'],
            ...(isOPS ? [] : [['le', 'layoutEditor', 'Lee', 'Layout']]), ['au', 'author', 'Ava', 'Author']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const A = await app.api.createContext({tag: t, users});
        sc.t = t; sc.A = A.path; sc.u = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roles = Object.fromEntries(roleUsers.map(([k, r]) => [k, r]));
        save();
        const tb = `${t}b`, tc = `${t}c`;
        try {
            const B = await app.api.createContext({tag: tb, users: [{username: `${tb}au`, roles: ['author']}],
                components: Object.fromEntries(DEPENDENT.map((n) => [n, {dependent: false}]))});
            sc.B = B.path; sc.uB = `${tb}au`;
        } catch (e) { sc.Berr = String(e.message).slice(0, 700); log('[seed B FAILED]', sc.Berr); }
        try {
            const C = await app.api.createContext({tag: tc, users: [{username: `${tc}au`, roles: ['author']}],
                components: {[MM]: {fileVariants: true, metadata: 'supplementary'}, [EXTRA]: {dependent: true}}});
            sc.C = C.path; sc.uC = `${tc}au`;
        } catch (e) { sc.Cerr = String(e.message).slice(0, 700); log('[seed C FAILED]', sc.Cerr); }
        save();
        const U = sc.u;
        const part = (k) => ({username: U[k], role: sc.roles[k]});
        const prod = isOPS ? {participants: [part('se')]}
            : {decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se'), part('le')]};
        const subs = {};
        const mk = async (k, ctx, submitter, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx, submitter, title: `K1 ${k} Wombatery ${t}`, ...spec});
                subs[k] = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId, galleys: r.galleys, media: r.mediaFiles};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'media', JSON.stringify(r.mediaFiles));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700)); subs[k] = {error: String(e.message).slice(0, 700)}; }
        };
        const pairA = [{file: 'figure.png', pair: 'A'}, {file: 'profile-image-400.png', resolution: 'high_resolution', pair: 'A', name: 'figure-hi.png'}];
        await mk('sL', sc.A, U.au, {...prod,
            ...(isOMP ? {} : {galleys: [{label: 'HTML', file: htmlName}]}),
            mediaFiles: [...pairA, {file: 'not-an-image.txt', genre: 'HTML Stylesheet', name: 'style.css'},
                ...(isOMP ? [] : [{file: 'figure.png', genre: 'Multimedia', name: 'clip.png'}])]});
        await mk('sE', sc.A, U.au, {...prod});
        await mk('sD', sc.A, U.au, {...prod, mediaFiles: [{file: 'figure.png', pair: 'B', name: 'del-web.png'},
            {file: 'profile-image-400.png', resolution: 'high_resolution', pair: 'B', name: 'del-hi.png'},
            {file: 'not-an-image.txt', genre: 'HTML Stylesheet', name: 'del-style.css'}]});
        if (!isOPS) await mk('sR', sc.A, U.au, {decisions: ['sendExternalReview'], participants: [part('se')]});
        await mk('sV', sc.A, U.au, {...prod, ...(isOMP ? {} : {galleys: [{label: 'PDF', file: isOPS ? 'preprint.pdf' : 'article.pdf'}]}),
            mediaFiles: [{file: 'figure.png', name: 'v1-figure.png'}], published: true});
        if (sc.B) await mk('sB', sc.B, sc.uB, isOPS ? {} : {decisions: ['skipExternalReview', 'sendToProduction']});
        if (sc.C) {
            await mk('sC', sc.C, sc.uC, {...(isOPS ? {} : {decisions: ['skipExternalReview', 'sendToProduction']}),
                mediaFiles: [{file: 'figure.png', genre: MM, name: 'mm-web.png'},
                    {file: 'profile-image-400.png', genre: MM, resolution: 'high_resolution', name: 'mm-hi.png'},
                    {file: 'figure.png', genre: 'Image', name: 'img-web.png'},
                    {file: 'profile-image-400.png', genre: 'Image', resolution: 'high_resolution', name: 'img-hi.png'}]});
        }
        sc.subs = subs; save();
        record('seed', sc);
    }
    if (!sc.A) { log('[k1] no state; run the seed phase first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;
    const u = sc.u; const S = sc.subs || {};

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300), url: page.url().replace(/^.*\/index\.php/, '')});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map(({type, message, url}) => ({type, message, url}));
    const reqs = [];
    page.on('request', (r) => { if (/\/api\/v1\//.test(r.url()) && r.method() !== 'GET') reqs.push({at: Date.now(), m: r.method(), url: r.url().replace(/^.*\/api\/v1/, ''), ov: r.headers()['x-http-method-override'] || null}); });
    const resps = [];
    page.on('response', (r) => { if (/\/api\/v1\//.test(r.url()) && r.request().method() !== 'GET') resps.push({at: Date.now(), m: r.request().method(), status: r.status(), url: r.url().replace(/^.*\/api\/v1/, '')}); });
    const postsSince = (t0) => resps.filter((x) => x.at >= t0).map(({m, status, url}) => `${m} ${status} ${url}`);

    const sleep = (ms) => page.waitForTimeout(ms);
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const top = () => page.locator(vis).last();
    const edUrl = (ctx, id, key) => app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const auUrl = (ctx, id, key) => app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const mKey = (pid) => `publication_${pid}_media`;
    const signInAs = async (user, cp) => { await signIn(page, user, {contextPath: cp || sc.A}); await idle(page); };
    async function snap(name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        if (extra) Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    const mediaTable = () => wf().getByRole('table', {name: 'Media Files', exact: true}).first();

    // The Media page as data: headings, the description, the controls, the table rows.
    const mediaInfo = () => page.evaluate(() => {
        const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
        const heads = [...dlg.querySelectorAll('h1,h2,h3')].filter(v).map((h) => `${h.tagName}:${f(h.textContent)}`);
        const t = [...dlg.querySelectorAll('table')].filter(v)[0];
        if (!t) return {heads, table: null, text: f(dlg.innerText).slice(0, 3000)};
        let wrap = t.parentElement;
        for (let i = 0; i < 6 && wrap && !wrap.querySelector('button:not(table button)'); i++) wrap = wrap.parentElement;
        const pos = (b) => (t.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 'above' : 'below');
        const controls = wrap ? [...wrap.querySelectorAll('button')].filter(v).filter((b) => !t.contains(b)).map((b) => ({text: f(b.innerText || b.getAttribute('aria-label')), where: pos(b), disabled: b.disabled})) : [];
        const lab = t.getAttribute('aria-labelledby');
        const rows = [...t.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('td, th')];
            const a = tr.querySelector('a[href]');
            const idCell = cells.find((c) => c.getAttribute('rowspan') || c.querySelector('svg'));
            return {
                cells: cells.map((c) => f(c.innerText)),
                rowspans: cells.map((c) => c.getAttribute('rowspan')),
                name: a ? {text: f(a.innerText), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel')} : null,
                badges: [...tr.querySelectorAll('[class*="badge"], [class*="Badge"], span.rounded-full')].map((b) => f(b.innerText)).filter(Boolean),
                buttons: [...tr.querySelectorAll('button')].filter(v).map((b) => ({text: f(b.innerText), aria: b.getAttribute('aria-label'), disabled: b.disabled})),
                idCell: idCell ? {text: f(idCell.innerText), rowspan: idCell.getAttribute('rowspan'), tag: idCell.tagName} : null,
            };
        });
        const desc = wrap ? [...wrap.querySelectorAll('p')].filter(v).map((p) => f(p.innerText)).filter(Boolean) : [];
        return {
            url: location.href.replace(/^.*\/index\.php/, ''), heads,
            table: {label: lab ? f(document.getElementById(lab)?.innerText) : t.getAttribute('aria-label'),
                columns: [...t.querySelectorAll('thead th')].map((th) => ({text: f(th.innerText), content: f(th.textContent)})), rows, controls, desc},
        };
    }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    const rowsText = (mi) => ((mi && mi.table && mi.table.rows) || []).map((r) => r.cells.join(' | '));

    async function openMedia(ctx, id, pid, name, {author} = {}) {
        await page.goto((author ? auUrl : edUrl)(ctx, id, mKey(pid)));
        await idle(page);
        await mediaTable().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(300);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length)[0]; return d && !d.querySelector('table .pkpSpinner, h3 .pkpSpinner'); }, null, {timeout: 10000}).catch(() => {});
        const mi = await mediaInfo();
        if (name) {
            await snap(name, {media: mi});
            log(`[${name}]`, JSON.stringify({heads: mi.heads, ctrl: mi.table && mi.table.controls, rows: rowsText(mi)}).slice(0, 1200));
        }
        return mi;
    }
    const rowOf = (text) => mediaTable().locator('tbody tr').filter({has: page.getByText(text, {exact: true})}).first();
    async function rowMenu(text, press) {
        const row = rowOf(text);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        if (!(await btn.count())) return {items: [], noButton: true, buttons: await row.getByRole('button').count()};
        await btn.click(); await sleep(300);
        const items = await page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), cls: String(e.className).slice(0, 200), color: getComputedStyle(e).color}))).catch(() => []);
        if (press) {
            const it = page.getByRole('menuitem', {name: press, exact: true}).first();
            if (!(await it.count())) { await btn.click().catch(() => {}); return {items, noItem: true}; }
            await it.click(); await idle(page); await sleep(500);
        } else {
            await btn.click().catch(() => {}); await sleep(200);
        }
        return {items};
    }
    // The topmost window (side modal or confirmation) as data.
    const winInfo = () => page.evaluate(() => {
        const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const ds = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter(v);
        const d = ds[ds.length - 1];
        if (!d) return {open: false, count: 0};
        const lab = d.getAttribute('aria-labelledby'); const des = d.getAttribute('aria-describedby');
        const cards = [...d.querySelectorAll('div.mb-4.rounded.bg-tertiary')].map((c) => ({
            name: f(c.querySelector('.text-base-bold')?.innerText), size: f(c.querySelector('.text-xs-normal')?.innerText),
            remove: [...c.querySelectorAll('button')].map((b) => ({aria: b.getAttribute('aria-label'), text: f(b.innerText), cls: String(b.className).includes('text-negative') ? 'text-negative' : '', color: getComputedStyle(b).color, svg: !!b.querySelector('svg')}))[0] || null,
            errors: [...c.querySelectorAll('.pkpFieldError__message')].map((e) => f(e.innerText)),
            progress: c.querySelector('[role=progressbar], progress, [class*="rogress"]') ? f(c.innerText).match(/\d+%/)?.[0] || 'bar' : null,
            selects: [...c.querySelectorAll('select')].map((s) => s.id.replace(/^.*-(genreId|variantType)-.*$/, '$1')),
        }));
        const selects = [...d.querySelectorAll('select')].filter(v).map((s) => {
            const l = d.querySelector(`label[for="${CSS.escape(s.id)}"]`);
            return {id: s.id.slice(0, 80), label: f(l?.innerText), help: f(l?.nextElementSibling?.innerText), options: [...s.options].map((o) => o.text.trim()),
                selectedIndex: s.selectedIndex, value: s.value, shown: s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : '', disabled: s.disabled};
        });
        const inputs = [...d.querySelectorAll('input:not([type=hidden]), textarea')].filter(v).map((i) => {
            const l = i.id && d.querySelector(`label[for="${CSS.escape(i.id)}"]`);
            return {name: i.name || i.id.slice(0, 60), label: f(l?.innerText), value: i.value, disabled: i.disabled, type: i.type};
        });
        return {open: true, count: ds.length, role: d.getAttribute('role'),
            title: lab ? f(document.getElementById(lab)?.innerText) : d.getAttribute('aria-label'),
            describedBy: des ? f(document.getElementById(des)?.innerText) : null,
            headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter(v).map((h) => `${h.tagName}:${f(h.innerText)}`),
            text: f(d.innerText).slice(0, 2500), html: d.innerHTML.length < 20000 ? null : 'big',
            strong: [...d.querySelectorAll('strong, b')].map((s) => f(s.innerText)),
            cards, selects, inputs,
            buttons: [...d.querySelectorAll('button')].filter(v).map((b) => ({text: f(b.innerText) || null, aria: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})),
            errors: [...d.querySelectorAll('.pkpFieldError__message, .pkpFormField__error, [class*="FieldError"]')].filter(v).map((e) => f(e.innerText)).filter(Boolean)};
    }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    async function winSnap(name, extra = {}) {
        const w = await winInfo();
        await snap(name, {win: w, ...extra});
        log(`[${name}]`, JSON.stringify({title: w.title, count: w.count, cards: w.cards, selects: w.selects, buttons: (w.buttons || []).map((b) => `${b.text || b.aria}${b.disabled ? '(dis)' : ''}`), errors: w.errors}).slice(0, 1600));
        return w;
    }
    const uploadWin = () => page.getByRole('dialog').filter({hasText: 'Upload Media File'}).last();
    async function openUpload() {
        await page.getByRole('button', {name: 'Add Media File', exact: true}).click();
        await uploadWin().waitFor({timeout: T}); await idle(page); await sleep(400);
    }
    const cardCount = () => page.locator(`${vis} div.mb-4.rounded.bg-tertiary`).count();
    async function chooseFiles(files) {
        const n0 = await cardCount();
        const chooserP = page.waitForEvent('filechooser', {timeout: T});
        await uploadWin().getByRole('button', {name: 'Click to upload files', exact: true}).click();
        const ch = await chooserP;
        await ch.setFiles(files);
        await page.waitForFunction((n) => {
            const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1];
            const cards = [...d.querySelectorAll('div.mb-4.rounded.bg-tertiary')];
            return cards.length >= n && cards.every((c) => c.querySelector('select') || c.querySelector('.pkpFieldError__message'));
        }, n0 + files.length, {timeout: 60000}).catch(() => log('[chooseFiles] cards did not settle'));
        await idle(page);
    }
    const cardSel = (fileName, which) => uploadWin().locator('div.mb-4.rounded.bg-tertiary').filter({has: page.getByText(fileName, {exact: true})}).last().locator(`select[id*="-${which}-"]`);
    async function uploadAll(t0) {
        const done = page.waitForResponse((r) => /\/mediaFiles$/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await uploadWin().getByRole('button', {name: 'Upload Files', exact: true}).click();
        const r = await done;
        await uploadWin().waitFor({state: 'detached', timeout: 15000}).catch(() => {});
        await idle(page); await sleep(600);
        return {status: r && r.status(), windowOpen: await uploadWin().isVisible().catch(() => false), posts: postsSince(t0)};
    }
    async function pressClose() {
        await top().getByRole('button', {name: 'Close', exact: true}).first().click();
        await sleep(700); await idle(page);
    }
    async function confirmPress(label) {
        const d = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').filter({has: page.getByRole('button', {name: label, exact: true})}).last();
        await d.getByRole('button', {name: label, exact: true}).click();
        await sleep(800); await idle(page);
    }
    const openCount = () => page.locator(vis).count();

    // =========================================================================================
    // Phase settings: Settings bullets 1–3, the component window on A (defaults) and C (changed).
    if (on('settings') && !done('settings')) await sect('settings', async () => {
        const out = {};
        for (const [ctxKey, names] of [['A', [...DEPENDENT, isOMP ? 'Book Manuscript' : isOPS ? 'Preprint Text' : 'Article Text']], ['C', [MM, EXTRA]]]) {
            const ctx = sc[ctxKey]; if (!ctx) continue;
            await signInAs('admin', ctx);
            await page.goto(app.url(`/index.php/${ctx}/management/settings/workflow`)); await idle(page);
            await page.getByRole('tab', {name: 'Components'}).click(); await idle(page);
            await page.locator('#genresGridContainer table').waitFor({timeout: T}); await idle(page);
            out[`${ctxKey}list`] = await page.locator('#genresGridContainer tr.gridRow').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
            if (ctxKey === 'A') await snap('set-01-components-A');
            for (const n of names) {
                const row = page.locator('#genresGridContainer tr.gridRow').filter({has: page.getByText(n, {exact: true})}).first();
                if (!(await row.count())) { out[`${ctxKey}:${n}`] = 'no row'; continue; }
                await row.locator('a.show_extras').click(); await sleep(300);
                // a legacy grid row's controls live in the NEXT tr (patterns.md pitfall 10)
                const edit = row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first();
                await edit.click(); await idle(page);
                const form = page.locator('form#genreForm');
                await form.waitFor({timeout: T}); await idle(page); await sleep(400);
                out[`${ctxKey}:${n}`] = await form.evaluate((fm) => {
                    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
                    const box = (nm) => { const i = fm.querySelector(`input[name="${nm}"]`); if (!i) return null; const l = i.closest('label') || fm.querySelector(`label[for="${i.id}"]`); return {checked: i.checked, label: f(l ? l.innerText : '')}; };
                    const cat = fm.querySelector('select[name="category"]');
                    const nm = fm.querySelector('input[name^="name"]');
                    return {name: nm ? nm.value : null, dependent: box('dependent'), supplementary: box('supplementary'), supportsFileVariants: box('supportsFileVariants'),
                        category: cat ? {shown: cat.options[cat.selectedIndex]?.text.trim(), options: [...cat.options].map((o) => o.text.trim())} : null,
                        text: f(fm.innerText).slice(0, 1500)};
                });
                if (ctxKey === 'A' && n === 'Image') { await snap('set-02-component-image-A'); await loc(page, 'component window: "These are dependent files…" box', form.locator('input[name="dependent"]')); await loc(page, 'component window: "File Metadata" list', form.locator('select[name="category"]')); }
                if (ctxKey === 'C' && n === MM) await snap('set-03-component-mm-C');
                const cancel = form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first();
                await cancel.click().catch(() => {}); await sleep(700);
                await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
                await idle(page);
                log(`[settings ${ctxKey}:${n}]`, JSON.stringify(out[`${ctxKey}:${n}`]).slice(0, 700));
            }
        }
        record('settings-summary', out);
        markDone('settings');
    });

    // =========================================================================================
    // Phase page: the page per role on sL (q1; Fields; More Actions), the file-name link, "More Information".
    if (on('page') && !done('page')) await sect('page', async () => {
        const out = {};
        const s = S.sL;
        const names = ['figure.png', 'figure-hi.png', 'style.css', ...(isOMP ? [] : ['clip.png'])];
        for (const who of ['mgr', 'se', ...(u.le ? ['le'] : []), 'au']) {
            await signInAs(u[who]);
            const mi = await openMedia(sc.A, s.id, s.pub, `page-01-${who}`, {author: who === 'au'});
            const menus = {};
            for (const n of names) menus[n] = (await rowMenu(n)).items;
            out[who] = {heads: mi.heads, table: mi.table, menus};
            log(`[page ${who}] menus`, JSON.stringify(Object.fromEntries(Object.entries(menus).map(([k, v]) => [k, (v || []).map((x) => x.text)]))));
            // the file name: what pressing it does
            const link = rowOf('figure.png').getByRole('link', {name: 'figure.png', exact: true});
            if (await link.count()) {
                if (who === 'mgr') await loc(page, 'Media page: a row\'s file-name link', link);
                const res = {href: await link.getAttribute('href'), target: await link.getAttribute('target'), rel: await link.getAttribute('rel'), popups: [], responses: [], downloads: []};
                const onResp = (r) => { if (/download-file|downloadFile/.test(r.url())) res.responses.push({status: r.status(), type: r.headers()['content-type'] || null, disposition: r.headers()['content-disposition'] || null, url: r.url().replace(/^.*\/index\.php/, '')}); };
                const onPage = (p) => { res.popups.push({opened: true}); p.on('download', (d) => res.downloads.push(d.suggestedFilename())); };
                page.context().on('response', onResp); page.context().on('page', onPage);
                const popupP = page.context().waitForEvent('page', {timeout: 8000}).catch(() => null);
                await link.click();
                const popup = await popupP;
                if (popup) {
                    await popup.waitForLoadState('load', {timeout: 8000}).catch(() => {});
                    await page.waitForTimeout(1500);
                    res.popupState = {closed: popup.isClosed(), url: popup.isClosed() ? null : popup.url().replace(/^.*\/index\.php/, ''),
                        img: popup.isClosed() ? null : await popup.evaluate(() => { const i = document.querySelector('img'); return i ? {w: i.naturalWidth, h: i.naturalHeight, src: i.src.slice(-80)} : null; }).catch(() => null),
                        text: popup.isClosed() ? null : flat(await popup.locator('body').innerText({timeout: 3000}).catch(() => ''), 300)};
                    if (!popup.isClosed()) await popup.close().catch(() => {});
                }
                page.context().off('response', onResp); page.context().off('page', onPage);
                out[who].nameClick = res;
                log(`[page ${who}] name click`, JSON.stringify(res).slice(0, 500));
            }
        }
        // "More Information" pressed once (sweep), as mgr
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        const mi = await rowMenu('figure.png', 'More Information');
        await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return d && ds.length > 1 && !/Loading/.test(d.innerText) && d.innerText.length > 40; }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await sleep(800);
        out.moreInfo = await winSnap('page-02-more-information', {menu: mi});
        await pressClose().catch(() => {});
        record('page-summary', out);
        markDone('page');
    });

    // =========================================================================================
    // Phase upload: sE, as mgr. "No Items"; the window; Close with none; q5 / 2a; q7 / 2d; 2b; 2c; drop.
    if (on('upload') && !done('upload')) await sect('upload', async () => {
        const out = {};
        const s = S.sE;
        await signInAs(u.mgr);
        out.empty = await openMedia(sc.A, s.id, s.pub, 'up-01-empty');
        // Close with no file: closes at once
        await openUpload();
        out.window = await winSnap('up-02-window');
        await loc(page, 'Upload Media File window', uploadWin());
        await loc(page, 'Upload Media File: "Click to upload files"', uploadWin().getByRole('button', {name: 'Click to upload files', exact: true}));
        let t0 = Date.now();
        await pressClose();
        out.closeEmpty = {openAfter: await openCount(), top: (await winInfo()).title, dialogs: dialogsSince(t0)};
        await sleep(600);
        // q5 / 2a: one image, the two lists
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        out.card = await winSnap('up-03-card');
        await loc(page, 'Upload Media File: "What kind of media is this?"', cardSel('figure.png', 'genreId'));
        await loc(page, 'Upload Media File: "File resolution type"', cardSel('figure.png', 'variantType'));
        await loc(page, 'Upload Media File: "Upload Files"', uploadWin().getByRole('button', {name: 'Upload Files', exact: true}));
        await loc(page, 'Upload Media File: a card\'s "Remove"', uploadWin().getByRole('button', {name: 'Remove', exact: true}));
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'}); await sleep(200);
        out.image = await winSnap('up-04-image');
        await cardSel('figure.png', 'variantType').selectOption({label: 'High resolution'}); await sleep(200);
        out.imageHigh = (await winInfo()).selects;
        await cardSel('figure.png', 'genreId').selectOption({label: NV}); await sleep(200);
        out.switchedToNV = await winSnap('up-05-switched-nv');
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'}); await sleep(200);
        out.backToImage = (await winInfo()).selects;
        // q7 / 2d: Close with a card: the dialog; No; Close; Yes
        t0 = Date.now();
        await pressClose();
        out.closeWithCard = await winSnap('up-06-unsaved-dialog');
        await loc(page, 'unsaved-changes dialog "No"', page.locator('[role=dialog]:visible, [role=alertdialog]:visible').last().getByRole('button', {name: 'No', exact: true}));
        await confirmPress('No');
        out.afterNo = await winSnap('up-07-after-no');
        await pressClose();
        await confirmPress('Yes');
        await sleep(500);
        out.afterYes = {win: await winInfo(), openCount: await openCount(), dialogs: dialogsSince(t0), posts: postsSince(t0)};
        out.listAfterYes = rowsText(await openMedia(sc.A, s.id, s.pub, 'up-08-list-after-yes'));
        // 2b: Remove; then Close with none left
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png'), fx(app.name, 'not-an-image.txt')]);
        out.twoCards = (await winInfo()).cards;
        await uploadWin().locator('div.mb-4.rounded.bg-tertiary').filter({has: page.getByText('not-an-image.txt', {exact: true})}).getByRole('button', {name: 'Remove', exact: true}).click();
        await sleep(400);
        out.afterRemove = await winSnap('up-09-after-remove');
        await uploadWin().getByRole('button', {name: 'Remove', exact: true}).first().click(); await sleep(400);
        out.afterRemoveAll = (await winInfo()).cards;
        t0 = Date.now();
        await pressClose();
        out.closeAfterRemoveAll = {openCount: await openCount(), top: (await winInfo()).title};
        await winSnap('up-10-close-after-remove-all');
        if ((await winInfo()).title === 'Warning') { await confirmPress('Yes'); out.closeAfterRemoveAll.confirmed = true; }
        await sleep(600);
        // Drop on the drop area (a synthesized drop of one PNG), then Upload Files greyed until a type
        await openUpload();
        const b64 = fs.readFileSync(fx(app.name, 'figure.png')).toString('base64');
        await page.evaluate(({b64}) => {
            const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const file = new File([bin], 'dropped.png', {type: 'image/png'});
            const dt = new DataTransfer(); dt.items.add(file);
            const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1];
            const area = [...d.querySelectorAll('div.cursor-pointer')].find((x) => x.textContent.includes('Drag and drop'));
            area.dispatchEvent(new DragEvent('dragover', {dataTransfer: dt, bubbles: true, cancelable: true}));
            area.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
        }, {b64});
        await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return d.querySelector('div.mb-4.rounded.bg-tertiary select, .pkpFieldError__message'); }, null, {timeout: 30000}).catch(() => {});
        out.dropped = await winSnap('up-13-dropped');
        // progress bar: a card read right after the chooser, before the upload finishes (best effort)
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 200 * 1024});
        const chooserP = page.waitForEvent('filechooser', {timeout: T});
        await uploadWin().getByRole('button', {name: 'Click to upload files', exact: true}).click();
        const ch = await chooserP;
        await ch.setFiles([bigFile('big-1mb.png', 1)]);
        await sleep(1500);
        out.progressEarly = (await winInfo()).cards;
        await winSnap('up-14-progress');
        await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
        await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return [...d.querySelectorAll('div.mb-4.rounded.bg-tertiary')].every((c) => c.querySelector('select') || c.querySelector('.pkpFieldError__message')); }, null, {timeout: 30000}).catch(() => {});
        await pressClose();
        if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        record('upload-summary', out);
        log('[upload]', JSON.stringify({closeEmpty: out.closeEmpty, afterYes: out.afterYes && {count: out.afterYes.openCount, posts: out.afterYes.posts}, listAfterYes: out.listAfterYes, afterRemoveAll: out.afterRemoveAll, closeAfterRemoveAll: out.closeAfterRemoveAll, progressEarly: out.progressEarly}).slice(0, 2000));
        markDone('upload');
    });

    // =========================================================================================
    // Phase failed: 2c on sE: sizes the install accepts (3 MB, 9 MB) and one it does not (101 MB, over a 100M
    // php.ini upload_max_filesize / post_max_size); the drop area pressed.
    if (on('failed') && !done('failed')) await sect('failed', async () => {
        const out = {};
        const s = S.sE;
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        // the drop area itself pressed (not the link): a file chooser?
        await openUpload();
        const fc = page.waitForEvent('filechooser', {timeout: 5000}).then(() => true).catch(() => false);
        await uploadWin().getByText('Drag and drop files here.', {exact: true}).click();
        out.dropAreaOpensChooser = await fc;
        // accepted sizes
        await chooseFiles([bigFile('big-3mb.png', 3), bigFile('big-9mb.png', 9)]);
        out.accepted = await winSnap('fail-01-3mb-9mb');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        await sleep(600);
        // refused size next to a good file
        await openUpload();
        const t0 = Date.now();
        await chooseFiles([fx(app.name, 'figure.png'), bigFile('big-101mb.png', 101)]);
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'}); await sleep(300);
        out.failed = await winSnap('fail-02-101mb', {uploads: postsSince(t0)});
        out.failedUploads = postsSince(t0);
        await uploadWin().locator('div.mb-4.rounded.bg-tertiary').filter({has: page.getByText('big-101mb.png', {exact: true})}).getByRole('button', {name: 'Remove', exact: true}).click();
        await sleep(400);
        out.afterRemove = await winSnap('fail-03-101mb-removed');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        record('failed-summary', out);
        log('[failed]', JSON.stringify({chooser: out.dropAreaOpensChooser, accepted: out.accepted.cards.map((c) => `${c.name} ${c.size} ${c.errors.join('/')} ${c.selects.join(',')}`), failed: out.failed.cards.map((c) => `${c.name} ${c.errors.join('/')}`), failedBtn: out.failed.buttons.filter((b) => b.text === 'Upload Files'), uploads: out.failedUploads, afterRemove: out.afterRemove.buttons.filter((b) => b.text === 'Upload Files')}));
        markDone('failed');
    });

    // =========================================================================================
    // Phase allvariants: Settings bullet 2 "ticked at install for Image alone": every component's boxes on A.
    if (on('allvariants') && !done('allvariants')) await sect('allvariants', async () => {
        const out = {};
        await signInAs('admin', sc.A);
        await page.goto(app.url(`/index.php/${sc.A}/management/settings/workflow`)); await idle(page);
        await page.getByRole('tab', {name: 'Components'}).click(); await idle(page);
        await page.locator('#genresGridContainer table').waitFor({timeout: T}); await idle(page);
        const n = await page.locator('#genresGridContainer tr.gridRow').count();
        for (let i = 0; i < n; i++) {
            const row = page.locator('#genresGridContainer tr.gridRow').nth(i);
            const label = (await row.innerText()).replace(/\s+/g, ' ').trim();
            await row.locator('a.show_extras').click(); await sleep(250);
            await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).first().click(); await idle(page);
            const form = page.locator('form#genreForm');
            await form.waitFor({timeout: T}); await idle(page); await sleep(300);
            out[label] = await form.evaluate((fm) => {
                const c = (nm) => { const i = fm.querySelector(`input[name="${nm}"]`); return i ? i.checked : null; };
                const cat = fm.querySelector('select[name="category"]');
                return {name: fm.querySelector('input[name^="name"]')?.value, dependent: c('dependent'), supplementary: c('supplementary'), variants: c('supportsFileVariants'), category: cat ? cat.options[cat.selectedIndex]?.text.trim() : null};
            });
            await form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await form.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await idle(page); await sleep(300);
            await row.locator('a.hide_extras').click().catch(() => {}); await sleep(200);
        }
        record('allvariants-summary', out);
        log('[allvariants]', JSON.stringify(Object.values(out).map((v) => `${v.name}:${v.dependent ? 'D' : '-'}${v.variants ? 'V' : '-'}${v.supplementary ? 'S' : '-'}/${v.category}`)));
        markDone('allvariants');
    });

    // =========================================================================================
    // Phase progress: "Upload Files" while one card is still uploading and the other is ready (throttled upload).
    if (on('progress') && !done('progress')) await sect('progress', async () => {
        const out = {};
        const s = S.sE;
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'}); await sleep(200);
        out.ready = (await winInfo()).buttons.filter((b) => b.text === 'Upload Files');
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: 150 * 1024});
        const chooserP = page.waitForEvent('filechooser', {timeout: T});
        await uploadWin().getByRole('button', {name: 'Click to upload files', exact: true}).click();
        await (await chooserP).setFiles([bigFile('big-1mb.png', 1)]);
        await sleep(1500);
        const w = await winSnap('prog-01-one-uploading');
        out.during = {cards: w.cards.map((c) => `${c.name} ${c.progress || ''} ${c.selects.join(',')}`), button: w.buttons.filter((b) => b.text === 'Upload Files')};
        await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
        await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return [...d.querySelectorAll('div.mb-4.rounded.bg-tertiary')].every((c) => c.querySelector('select') || c.querySelector('.pkpFieldError__message')); }, null, {timeout: 60000}).catch(() => {});
        out.after = (await winInfo()).buttons.filter((b) => b.text === 'Upload Files');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        record('progress-summary', out);
        log('[progress]', JSON.stringify(out));
        markDone('progress');
    });

    // =========================================================================================
    // Phase stage1: Rule 10 at the Submission stage end (OJS, OMP): a submission just submitted, mgr adds a file.
    if (on('stage1') && !done('stage1') && !isOPS) await sect('stage1', async () => {
        const out = {};
        if (!S.sS) {
            const r = await app.api.createSubmission({tag: `${sc.t}sS`, context: sc.A, submitter: u.au, title: `K1 sS Wombatery ${sc.t}`});
            S.sS = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId}; sc.subs = S; save();
        }
        const s = S.sS;
        out.stageId = s.stageId;
        await signInAs(u.mgr);
        out.page = await openMedia(sc.A, s.id, s.pub, 'st1-01-media');
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'});
        out.upload = await uploadAll(Date.now());
        out.after = rowsText(await openMedia(sc.A, s.id, s.pub, 'st1-02-after'));
        record('stage1-summary', out);
        log('[stage1]', JSON.stringify({stage: out.stageId, ctrl: out.page.table && out.page.table.controls.map((c) => c.text), upload: out.upload.status, after: out.after}));
        markDone('stage1');
    });

    // =========================================================================================
    // Phase docfields: Settings bullet 3, the "Document" end: "Edit Metadata" on style.css (HTML Stylesheet) on sL.
    if (on('docfields') && !done('docfields')) await sect('docfields', async () => {
        const s = S.sL;
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        await rowMenu('style.css', 'Edit Metadata');
        await top().getByLabel(/Name of the file/).first().waitFor({timeout: T}).catch(() => {});
        await sleep(400);
        const w = await winSnap('doc-01-edit-style-css');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        record('docfields-summary', {inputs: w.inputs});
        log('[docfields]', JSON.stringify((w.inputs || []).map((i) => i.label)));
        markDone('docfields');
    });

    // =========================================================================================
    // Phase rounds: sE, three "Upload Files" rounds, 2f, the rows, IDs (q12, A2), link / unlink / relink.
    if (on('rounds') && !done('rounds')) await sect('rounds', async () => {
        const out = {};
        const s = S.sE;
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        const round = async (n, files) => {
            await openUpload();
            await chooseFiles(files.map((x) => x.path));
            for (const x of files) {
                await cardSel(x.name, 'genreId').selectOption({label: x.genre}); await sleep(150);
                if (x.high) await cardSel(x.name, 'variantType').selectOption({label: 'High resolution'});
            }
            const before = await winSnap(`rd-0${n}-round${n}-ready`);
            const t0 = Date.now();
            const r = await uploadAll(t0);
            const mi = await mediaInfo();
            await snap(`rd-0${n}-round${n}-list`, {media: mi});
            out[`round${n}`] = {ready: before.buttons, result: r, rows: mi.table && mi.table.rows, at: new Date().toISOString()};
            log(`[round ${n}]`, JSON.stringify(r), JSON.stringify(rowsText(mi)));
        };
        // round 1: figure.png as Image (web) + not-an-image.txt as Image (2f)
        await round(1, [{path: fx(app.name, 'figure.png'), name: 'figure.png', genre: 'Image'}, {path: fx(app.name, 'not-an-image.txt'), name: 'not-an-image.txt', genre: 'Image'}]);
        await sleep(1200);
        // round 2: notes.md / not-an-image.png as NV (a type without file variants)
        const r2 = isOPS ? 'not-an-image.png' : 'notes.md';
        await round(2, [{path: fx(app.name, r2), name: r2, genre: NV}]);
        await sleep(1200);
        // round 3: profile-image-400.png as Image, High resolution
        await round(3, [{path: fx(app.name, 'profile-image-400.png'), name: 'profile-image-400.png', genre: 'Image', high: true}]);
        // the not-an-image.txt name link (2f): what it serves
        const txt = rowOf('not-an-image.txt').getByRole('link').first();
        out.txtHref = await txt.getAttribute('href').catch(() => null);
        // link figure.png ↔ profile-image-400.png through the row's "Manually Link Media"
        const link = async (label, target) => {
            await openMedia(sc.A, s.id, s.pub);
            const m = await rowMenu(label, 'Manually Link Media');
            const form = top();
            await form.locator('select').first().waitFor({timeout: T}); await idle(page); await sleep(300);
            const w = await winInfo();
            if (target) await form.locator('select').first().selectOption({label: target});
            else await form.locator('select').first().selectOption({value: ''});
            const t0 = Date.now();
            const resp = page.waitForResponse((r) => /\/link$/.test(r.url()), {timeout: T}).catch(() => null);
            await form.getByRole('button', {name: 'Link Media', exact: true}).click();
            const r = await resp;
            await sleep(900); await idle(page);
            const mi = await openMedia(sc.A, s.id, s.pub);
            return {menu: m.items && m.items.map((x) => x.text), options: w.selects, status: r && r.status(), posts: postsSince(t0), rows: mi.table && mi.table.rows};
        };
        out.linked = await link('figure.png', 'profile-image-400.png');
        await snap('rd-04-linked', {media: await mediaInfo()});
        out.unlinked = await link('figure.png', null);
        await snap('rd-05-unlinked', {media: await mediaInfo()});
        out.relinked = await link('figure.png', 'profile-image-400.png');
        await snap('rd-06-relinked', {media: await mediaInfo()});
        for (const k of ['linked', 'unlinked', 'relinked']) log(`[rounds ${k}]`, out[k].status, JSON.stringify(out[k].rows && out[k].rows.map((r) => `${r.idCell ? r.idCell.text + '/' + r.idCell.rowspan : '-'} ${r.cells.slice(-5).join(' | ')}`)));
        record('rounds-summary', out);
        markDone('rounds');
    });

    // =========================================================================================
    // Phase delete: sD (q14, Rule 5): the dialog, Cancel, OK; the survivor's ID.
    if (on('delete') && !done('delete')) await sect('delete', async () => {
        const out = {};
        const s = S.sD;
        await signInAs(u.mgr);
        out.before = await openMedia(sc.A, s.id, s.pub, 'del-01-before');
        let m = await rowMenu('del-web.png', 'Delete File');
        out.menu = m.items;
        out.dialog = await winSnap('del-02-dialog');
        out.dialogHtml = await page.locator('[role=dialog]:visible, [role=alertdialog]:visible').last().evaluate((d) => d.innerHTML.replace(/\s+/g, ' ').match(/Are you sure[^<]*<[^>]+>[^<]*<\/[^>]+>[^<]*/)?.[0] || null).catch(() => null);
        await loc(page, 'delete dialog "OK"', page.locator('[role=dialog]:visible, [role=alertdialog]:visible').last().getByRole('button', {name: 'OK', exact: true}));
        let t0 = Date.now();
        await confirmPress('Cancel');
        out.afterCancel = {posts: postsSince(t0), rows: rowsText(await openMedia(sc.A, s.id, s.pub, 'del-03-after-cancel'))};
        m = await rowMenu('del-web.png', 'Delete File');
        t0 = Date.now();
        await confirmPress('OK');
        await sleep(800); await idle(page);
        out.atOnce = {win: (await winInfo()).title, rows: rowsText(await mediaInfo()), posts: postsSince(t0)};
        await snap('del-04-after-ok');
        out.afterReload = await openMedia(sc.A, s.id, s.pub, 'del-05-after-ok-reload');
        // the survivor's menu
        out.survivorMenu = (await rowMenu('del-hi.png')).items;
        // the standalone file: delete too (a file with no counterpart)
        await rowMenu('del-style.css', 'Delete File');
        out.dialog2 = (await winInfo()).text;
        t0 = Date.now();
        await confirmPress('OK');
        out.afterStandalone = {posts: postsSince(t0), rows: rowsText(await openMedia(sc.A, s.id, s.pub, 'del-06-after-standalone'))};
        record('delete-summary', out);
        log('[delete]', JSON.stringify({dialog: out.dialog.text, strong: out.dialog.strong, cancel: out.afterCancel, atOnce: out.atOnce, after: rowsText(out.afterReload), survivorMenu: out.survivorMenu, standalone: out.afterStandalone}).slice(0, 2500));
        markDone('delete');
    });

    // =========================================================================================
    // Phase unsaved: Rule 6 (q15) on sL, as mgr: Edit Metadata, Manually Link Media, Batch Link Media.
    if (on('unsaved') && !done('unsaved')) await sect('unsaved', async () => {
        const out = {};
        const s = S.sL;
        await signInAs(u.mgr);
        const open = async (which) => {
            await openMedia(sc.A, s.id, s.pub);
            if (which === 'batch') await page.getByRole('button', {name: 'Batch Link Media', exact: true}).click();
            else await rowMenu('figure.png', which === 'edit' ? 'Edit Metadata' : 'Manually Link Media');
            await top().locator('form, table').first().waitFor({timeout: T}).catch(() => {});
            await idle(page); await sleep(500);
            if (which === 'batch') await top().locator('table select').first().waitFor({timeout: T}).catch(() => {});
            await sleep(300);
        };
        const change = async (which) => {
            if (which === 'edit') {
                const cap = top().getByLabel(/Caption/).first();
                if (await cap.count()) await cap.fill('Unsaved caption K1'); else await top().getByLabel(/Name of the file/).first().fill('renamed-unsaved.png');
            } else if (which === 'link') {
                await top().locator('select').first().selectOption({value: ''});
            } else {
                await top().locator('table tbody tr').filter({has: page.getByText('figure.png', {exact: true})}).locator('select').first().selectOption({value: ''});
            }
            await sleep(300);
        };
        const cancelBtn = () => top().getByRole('button', {name: 'Cancel', exact: true}).last();
        for (const which of ['edit', 'link', 'batch']) {
            const o = {};
            await open(which);
            o.window = await winSnap(`uns-${which}-01-open`);
            // changed + Cancel → dialog? No → still open with the change
            await change(which);
            let t0 = Date.now();
            await cancelBtn().click(); await sleep(700);
            o.cancelChanged = await winSnap(`uns-${which}-02-cancel-changed`);
            if (o.cancelChanged.title === 'Warning') {
                await confirmPress('No');
                const w = await winInfo();
                o.afterNo = {title: w.title, selects: w.selects, inputs: (w.inputs || []).filter((i) => i.value).map((i) => `${i.label || i.name}=${i.value}`)};
                // Close (header) → dialog → Yes
                await pressClose();
                o.closeChanged = (await winInfo()).title;
                if (o.closeChanged === 'Warning') await confirmPress('Yes');
                await sleep(600);
                o.afterYes = {openCount: await openCount(), top: (await winInfo()).title, posts: postsSince(t0), dialogs: dialogsSince(t0)};
            } else {
                o.afterCancelNoDialog = {openCount: await openCount(), posts: postsSince(t0)};
            }
            // reopened: the change not saved
            await open(which);
            const w2 = await winInfo();
            o.reopened = {selects: w2.selects, inputs: (w2.inputs || []).filter((i) => i.value).map((i) => `${i.label || i.name}=${i.value}`)};
            await snap(`uns-${which}-03-reopened`, {win: w2});
            // no change: Cancel closes at once
            t0 = Date.now();
            await cancelBtn().click(); await sleep(800);
            o.cancelClean = {openCount: await openCount(), top: (await winInfo()).title};
            if (o.cancelClean.top === 'Warning') await confirmPress('Yes');
            await sleep(500);
            // no change: Close closes at once
            await open(which);
            await pressClose();
            o.closeClean = {openCount: await openCount(), top: (await winInfo()).title};
            if (o.closeClean.top === 'Warning') await confirmPress('Yes');
            // changed + Close first → dialog; No; Cancel → dialog; Yes (the other order)
            await sleep(500);
            await open(which);
            await change(which);
            await pressClose();
            o.closeChangedFirst = (await winInfo()).title;
            if (o.closeChangedFirst === 'Warning') { await confirmPress('No'); o.afterNo2 = (await winInfo()).title; await cancelBtn().click(); await sleep(700); o.cancelAfterNo = (await winInfo()).title; if (o.cancelAfterNo === 'Warning') await confirmPress('Yes'); }
            await sleep(500);
            o.listAfter = rowsText(await openMedia(sc.A, s.id, s.pub));
            out[which] = o;
            log(`[unsaved ${which}]`, JSON.stringify({cancelChanged: o.cancelChanged.title, afterNo: o.afterNo, closeChanged: o.closeChanged, afterYes: o.afterYes, cancelClean: o.cancelClean, closeClean: o.closeClean, closeChangedFirst: o.closeChangedFirst, afterNo2: o.afterNo2, cancelAfterNo: o.cancelAfterNo, reopened: o.reopened, list: o.listAfter}).slice(0, 2000));
        }
        await snap('uns-99-list-after', {media: await mediaInfo()});
        record('unsaved-summary', out);
        markDone('unsaved');
    });

    // =========================================================================================
    // Phase review: Rule 10 (q23) on sR (OJS, OMP), as mgr: the side menu, the page, an upload that holds.
    if (on('review') && !done('review') && S.sR && !S.sR.error) await sect('review', async () => {
        const out = {};
        const s = S.sR;
        await signInAs(u.mgr);
        await page.goto(edUrl(sc.A, s.id)); await idle(page); await sleep(800);
        out.nav = await wf().locator('nav a, nav button, [role=treeitem], a, button').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter((x) => x && x.length < 60)).catch(() => []);
        await snap('rev-01-workflow');
        out.page = await openMedia(sc.A, s.id, s.pub, 'rev-02-media');
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'});
        out.upload = await uploadAll(Date.now());
        out.after = rowsText(await openMedia(sc.A, s.id, s.pub, 'rev-03-after-upload'));
        // the same page for the assigned section editor (a sub-editor in Review)
        await signInAs(u.se);
        out.se = await openMedia(sc.A, s.id, s.pub, 'rev-04-se');
        record('review-summary', out);
        log('[review]', JSON.stringify({media: out.nav.filter((x) => /Media/.test(x)), upload: out.upload, after: out.after, seCtrl: out.se.table && out.se.table.controls}).slice(0, 1500));
        markDone('review');
    });

    // =========================================================================================
    // Phase deps: Rule 1 on sL: stage file lists and the HTML galley's Dependent Files carry no media file.
    if (on('deps') && !done('deps')) await sect('deps', async () => {
        const out = {};
        const s = S.sL;
        await signInAs(u.mgr);
        for (const key of isOPS ? ['workflow_5'] : ['workflow_1', 'workflow_5']) {
            await page.goto(edUrl(sc.A, s.id, key)); await idle(page); await sleep(1200); await idle(page);
            const txt = await wf().innerText().catch(() => '');
            out[key] = {tables: await wf().locator('table').evaluateAll((ts) => ts.map((t) => (t.getAttribute('aria-label') || '') + ': ' + t.innerText.replace(/\s+/g, ' ').slice(0, 500))).catch(() => []),
                mentions: ['figure.png', 'figure-hi.png', 'style.css', 'clip.png'].filter((n) => txt.includes(n))};
            await snap(`deps-01-${key}`);
        }
        if (!isOMP) {
            await page.goto(edUrl(sc.A, s.id, `publication_${s.pub}_galleys`)); await idle(page); await sleep(800);
            const row = wf().locator('table tbody tr').filter({has: page.getByText('HTML', {exact: true})}).first();
            await row.getByRole('button', {name: /More Actions/}).first().click(); await sleep(300);
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click();
            await top().locator('#dependentFilesGridDiv, [id^="dependentFilesGridDiv"]').first().waitFor({timeout: 20000}).catch(() => {});
            await idle(page); await sleep(800);
            const dep = top().locator('#dependentFilesGridDiv, [id^="dependentFilesGridDiv"]').first();
            out.dependent = await dep.innerText().catch(() => null);
            await snap('deps-02-html-galley-dependent');
            const c = top().getByRole('link', {name: 'Cancel', exact: true}).or(top().getByRole('button', {name: 'Cancel', exact: true})).first();
            await c.click().catch(() => {}); await sleep(600);
        }
        record('deps-summary', out);
        log('[deps]', JSON.stringify(out).slice(0, 1500));
        markDone('deps');
    });

    // =========================================================================================
    // Phase versions: Rule 1 "the version chosen in the side menu" on sV.
    if (on('versions') && !done('versions')) await sect('versions', async () => {
        const out = {};
        const s = S.sV;
        await signInAs(u.mgr);
        out.v1 = rowsText(await openMedia(sc.A, s.id, s.pub, 'ver-01-v1'));
        const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).or(wf().getByRole('button', {name: 'Create New Version', exact: true})).first();
        out.createOffered = await link.isVisible().catch(() => false);
        if (out.createOffered) {
            await link.click();
            const win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
            await win.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
            await idle(page); await sleep(1000);
            const st = win.locator('select[name="versionStage"]'); if (!(await st.inputValue())) await st.selectOption('VoR');
            const mi = win.locator('select[name="versionIsMinor"]'); if (await mi.isVisible().catch(() => false) && !(await mi.inputValue())) await mi.selectOption('false');
            const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await win.getByRole('button', {name: 'Confirm', exact: true}).click();
            const cr = await created;
            out.createStatus = cr && cr.status();
            const body = cr ? await cr.json().catch(() => null) : null;
            out.newPid = body && body.id;
            sc.sVnewPid = out.newPid; save();
            await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await idle(page);
        }
        if (out.newPid) {
            out.v2 = rowsText(await openMedia(sc.A, s.id, out.newPid, 'ver-02-v2'));
            await openUpload();
            await chooseFiles([fx(app.name, 'not-an-image.txt')]);
            await cardSel('not-an-image.txt', 'genreId').selectOption({label: 'HTML Stylesheet'});
            out.addV2 = await uploadAll(Date.now());
            out.v2after = rowsText(await openMedia(sc.A, s.id, out.newPid, 'ver-03-v2-after-add'));
            // the side menu's version nodes, then the first version's "Media"
            out.tree = await wf().getByRole('treeitem').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 120))).catch(() => []);
            const v1 = wf().getByRole('treeitem').filter({hasText: /1\.0|Version of Record 1/}).first();
            if (await v1.count()) {
                await v1.click().catch(() => {}); await idle(page); await sleep(600);
                const media = v1.locator('a, button').filter({hasText: /^\s*Media\s*$/}).first();
                if (await media.count()) { await media.click().catch(() => {}); await idle(page); await sleep(900); }
            }
            const i4 = await mediaInfo();
            await snap('ver-04-v1-via-menu', {media: i4});
            out.v1ViaMenu = {url: i4.url, heads: i4.heads, rows: rowsText(i4)};
        }
        record('versions-summary', out);
        log('[versions]', JSON.stringify(out).slice(0, 2000));
        markDone('versions');
    });

    // =========================================================================================
    // Phase nomedia: Rule 2e / q8 on context B.
    if (on('nomedia') && !done('nomedia') && S.sB && !S.sB.error) await sect('nomedia', async () => {
        const out = {};
        const s = S.sB;
        await signInAs('admin', sc.B);
        out.page = await openMedia(sc.B, s.id, s.pub, 'nm-01-page');
        await openUpload();
        out.window = await winSnap('nm-02-window');
        out.dropArea = await uploadWin().getByText('Drag and drop files here.').count();
        out.clickLink = await uploadWin().getByRole('button', {name: 'Click to upload files', exact: true}).count();
        await pressClose();
        out.afterClose = {openCount: await openCount(), top: (await winInfo()).title};
        out.batch = null;
        await page.getByRole('button', {name: 'Batch Link Media', exact: true}).click().catch(() => {});
        await sleep(900); await idle(page);
        out.batch = await winSnap('nm-03-batch');
        await pressClose().catch(() => {});
        record('nomedia-summary', out);
        log('[nomedia]', JSON.stringify({text: out.window.text, dropArea: out.dropArea, clickLink: out.clickLink, afterClose: out.afterClose, batch: out.batch && out.batch.text}).slice(0, 1500));
        markDone('nomedia');
    });

    // =========================================================================================
    // Phase variants: Settings bullets 1–3 on context C (q25, q26).
    if (on('variants') && !done('variants') && S.sC && !S.sC.error) await sect('variants', async () => {
        const out = {};
        const s = S.sC;
        await signInAs('admin', sc.C);
        out.page = await openMedia(sc.C, s.id, s.pub, 'var-01-page');
        out.menus = {};
        for (const n of ['mm-web.png', 'mm-hi.png', 'img-web.png']) out.menus[n] = ((await rowMenu(n)).items || []).map((x) => x.text);
        // the upload window: the media-type list and MM's resolution list
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        out.genreOptions = (await winInfo()).selects;
        await cardSel('figure.png', 'genreId').selectOption({label: MM}); await sleep(200);
        out.mmSelects = (await winInfo()).selects;
        await cardSel('figure.png', 'variantType').selectOption({label: 'High resolution'}).catch((e) => { out.mmHighErr = String(e.message).slice(0, 200); });
        await winSnap('var-02-upload-mm-high');
        await cardSel('figure.png', 'genreId').selectOption({label: EXTRA}).catch((e) => { out.extraErr = String(e.message).slice(0, 200); });
        await sleep(200);
        out.extraSelects = (await winInfo()).selects;
        await cardSel('figure.png', 'genreId').selectOption({label: MM}); await sleep(200);
        await cardSel('figure.png', 'variantType').selectOption({label: 'High resolution'}).catch(() => {});
        out.uploadMmHigh = await uploadAll(Date.now());
        out.afterUpload = await openMedia(sc.C, s.id, s.pub, 'var-03-after-upload');
        // Manually Link Media on mm-web.png: its options (an Image offered?)
        await rowMenu('mm-web.png', 'Manually Link Media');
        await top().locator('select').first().waitFor({timeout: T}).catch(() => {});
        out.manual = await winSnap('var-04-manual-mm-web');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        await sleep(500);
        // Batch Link Media: rows
        await page.getByRole('button', {name: 'Batch Link Media', exact: true}).click();
        await top().locator('table').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(600);
        out.batch = await winSnap('var-05-batch');
        out.batchRows = await top().locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => ({text: tr.innerText.replace(/\s+/g, ' ').trim(), options: [...tr.querySelectorAll('select option')].map((o) => o.text.trim()), value: tr.querySelector('select') ? tr.querySelector('select').selectedOptions[0]?.text.trim() : null}))).catch(() => []);
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        await sleep(500);
        // Edit Metadata on mm-web.png (Supplementary Content) and on img-web.png (Artwork); save Description + Date
        await openMedia(sc.C, s.id, s.pub);
        await rowMenu('img-web.png', 'Edit Metadata');
        await top().getByLabel(/Name of the file/).first().waitFor({timeout: T}).catch(() => {});
        await sleep(400);
        out.editImage = await winSnap('var-06-edit-image');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        await sleep(500);
        await openMedia(sc.C, s.id, s.pub);
        await rowMenu('mm-web.png', 'Edit Metadata');
        await top().getByLabel(/Name of the file/).first().waitFor({timeout: T}).catch(() => {});
        await sleep(400);
        out.editMM = await winSnap('var-07-edit-mm');
        const desc = top().getByLabel(/^Description/).first();
        if (await desc.count()) await desc.fill('K1 supplementary description');
        const date = top().locator('input[type="date"], input[name="dateCreated"], input[id*="dateCreated"]').first();
        if (await date.count()) await date.fill('2026-01-15').catch((e) => { out.dateErr = String(e.message).slice(0, 200); });
        const t0 = Date.now();
        await top().getByRole('button', {name: 'Save', exact: true}).click();
        await sleep(1200); await idle(page);
        out.saveMM = {posts: postsSince(t0), top: (await winInfo()).title, errors: (await winInfo()).errors};
        if ((await winInfo()).title === 'Edit Metadata') { await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes'); }
        await openMedia(sc.C, s.id, s.pub);
        await rowMenu('mm-web.png', 'Edit Metadata');
        await top().getByLabel(/Name of the file/).first().waitFor({timeout: T}).catch(() => {});
        await sleep(600);
        out.reopenMM = await winSnap('var-08-edit-mm-reopened');
        await pressClose(); if ((await winInfo()).title === 'Warning') await confirmPress('Yes');
        record('variants-summary', out);
        log('[variants]', JSON.stringify({menus: out.menus, genreOptions: out.genreOptions, mm: out.mmSelects, extra: out.extraSelects, upload: out.uploadMmHigh, after: rowsText(out.afterUpload), manual: out.manual.selects, batchRows: out.batchRows, editImage: (out.editImage.inputs || []).map((i) => i.label), editMM: (out.editMM.inputs || []).map((i) => i.label), save: out.saveMM, reopen: (out.reopenMM.inputs || []).map((i) => `${i.label}=${i.value}`)}).slice(0, 3000));
        markDone('variants');
    });

    // =========================================================================================
    // Phase leave: the upload window with a card, then the browser leaves the page (the sweep's way out).
    if (on('leave') && !done('leave')) await sect('leave', async () => {
        const out = {};
        const s = S.sE;
        await signInAs(u.mgr);
        await openMedia(sc.A, s.id, s.pub);
        const rowsBefore = rowsText(await mediaInfo());
        await openUpload();
        await chooseFiles([fx(app.name, 'figure.png')]);
        await cardSel('figure.png', 'genreId').selectOption({label: 'Image'});
        const t0 = Date.now();
        // a side-menu entry behind the window (the window covers it) and then a full navigation
        await page.goto(app.url(`/index.php/${sc.A}/dashboard/editorial`)).catch((e) => { out.gotoErr = String(e.message).slice(0, 200); });
        await idle(page).catch(() => {}); await sleep(500);
        out.dialogs = dialogsSince(t0);
        out.url = page.url().replace(/^.*\/index\.php/, '');
        out.rowsAfter = rowsText(await openMedia(sc.A, s.id, s.pub, 'leave-01-after'));
        out.rowsBefore = rowsBefore;
        record('leave-summary', out);
        log('[leave]', JSON.stringify(out).slice(0, 1200));
        markDone('leave');
    });

    record('js-dialogs', jsDialogs);
    await close();
});
