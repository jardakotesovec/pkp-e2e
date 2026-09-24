// U39 claim check, chunk K2 — the Publisher Library (Settings › Workflow tab and
// "View Document Library"), downloads and their file names, the public address,
// the role settings ("Stages", "Permit changes to Settings"), and OMP's
// "Contracts" (docs/specs/U39-submission-and-publisher-libraries.md, lines
// 54–58, 130–139, 146–187, 216–237, 329–342, 361–368, 388–406).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   A — one throwaway account per role the Actors rows name: manager mg,
//       editor ed and production editor pe {OJS OMP}, section editor se
//       (the Moderator on OPS), copyeditor ce, layout editor le, marketing
//       mk, funding coordinator fc, translator tr {OJS OMP}, volume editor
//       ve and chapter author ca {OMP}, author au (the submitter).
//       Publisher Library: "Seeded public guide" (Other, Public Access) and
//       "Seeded private" (Reports). S1 (OJS/OMP at Copyediting, OPS at
//       Production) with every non-manager role assigned and one Library file
//       "Seeded notes" (Other); S2 with its own Library file "S2 file".
//   B — the Editor role with "Permit changes to Settings" unticked {OJS OMP}
//       (A7), a manager mg, an editor ed, an author au, SB; its Publisher
//       Library holds "B public" (Public Access) for "another journal's file".
//
//   PROBE_FEATURE=U39 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U39/K2/k2.js
//   PHASES=tab,public,names,roles,a7,composer,stages (default all; OMP1 rides in tab and names);
//   REUSE=1 reuses the last seeded contexts (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'tab,public,names,roles,a7,composer,stages';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Math.random().toString(36).slice(2, 6);
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);

const SUB_GRID = 'div[id^="component-grid-files-submissiondocuments-submissiondocumentsfilesgrid"]';
const PUB_GRID = 'div[id^="component-grid-settings-library-libraryfileadmingrid"]';
const TAB_NAME = {ojs: 'Publisher Library', omp: 'Press Library', ops: 'Preprint Server Library'};

// ---------------------------------------------------------------------------
// Fixture files, named as the lines need them, written next to the outputs.

function fixtures(app) {
    const pdf = app.name === 'ops' ? 'preprint.pdf' : 'article.pdf';
    const src = path.join(app.root, 'classes/testing/fixtures', pdf);
    const dir = path.join(outDir(), 'files');
    fs.mkdirSync(dir, {recursive: true});
    const base = fs.readFileSync(src);
    const f = {pdf, src};
    for (const name of ['contract.pdf', 'pdf-guide.pdf', 'notes-pdf-draft.pdf', 'notes.pdf', 'guide.pdf', 'own.pdf', 'vdl.pdf', 'deleteme.pdf', 'codes.pdf']) {
        fs.writeFileSync(path.join(dir, name), base);
        f[name] = path.join(dir, name);
    }
    // A different PDF for "Replace file": another body, another size.
    const other = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n'
        + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\n% U39 K2 replacement file, longer than the fixture\n'
        + 'trailer<</Root 1 0 R>>\n%%EOF\n';
    fs.writeFileSync(path.join(dir, 'replacement.pdf'), other);
    f['replacement.pdf'] = path.join(dir, 'replacement.pdf');
    f.sizes = Object.fromEntries(Object.entries(f).filter(([k]) => k.endsWith('.pdf') && k !== 'pdf').map(([k, p]) => [k, fs.statSync(p).size]));
    f.sizes[pdf] = fs.statSync(src).size;
    return f;
}

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const file = path.join(outDir(), `seed-${app.name}.json`);
    if (REUSE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const ops = app.name === 'ops';
    const omp = app.name === 'omp';
    const pdf = ops ? 'preprint.pdf' : 'article.pdf';
    const S = {};

    const t = tag('u39k2a');
    const u = (s) => `${t}${s}`;
    const roles = [['mg', 'manager', 'Mona', 'Manager'], ['se', 'sectionEditor', 'Sean', 'Section'], ['au', 'author', 'Ava', 'Author']];
    if (!ops) {
        roles.push(['ed', 'editor', 'Eddie', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Production'],
            ['ce', 'copyeditor', 'Cora', 'Copy'], ['le', 'layoutEditor', 'Lee', 'Layout'], ['mk', 'marketing', 'Mark', 'Marketing'],
            ['fc', 'funding', 'Fay', 'Funding'], ['tr', 'translator', 'Tom', 'Translator']);
    }
    if (omp) roles.push(['ve', 'volumeEditor', 'Vera', 'Volume'], ['ca', 'chapterAuthor', 'Carl', 'Chapter']);
    const users = roles.map(([k, role, g, f]) => ({username: u(k), roles: [role], givenName: g, familyName: f}));
    const CA = await app.api.createContext({tag: t, context: {name: `U39 K2 ${t}`, acronym: 'K2A', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`},
        users, libraryFiles: [
            {name: 'Seeded public guide', type: 'Other', publicAccess: true, file: pdf},
            {name: 'Seeded private', type: 'Reports', publicAccess: false, file: pdf},
        ]});
    const A = {t, path: CA.path, contextId: CA.contextId, users: Object.fromEntries(roles.map(([k, role]) => [k, {username: u(k), role}])), libraryFiles: CA.libraryFiles};
    const parts = roles.filter(([k]) => !['mg', 'ed', 'pe', 'au'].includes(k)).map(([k, role]) => ({username: u(k), role}));
    const s1 = {tag: `${t}s1`, context: A.path, submitter: u('au'), title: `K2 S1 ${t}`, participants: parts,
        libraryFiles: [{name: 'Seeded notes', type: 'Other', file: pdf}]};
    if (!ops) s1.decisions = ['skipExternalReview'];
    try {
        A.S1 = await app.api.createSubmission(s1);
    } catch (e) {
        console.log(`[${app.name} seed] S1 refused: ${String(e.message || e).slice(0, 600)}`);
        throw e;
    }
    A.S2 = await app.api.createSubmission({tag: `${t}s2`, context: A.path, submitter: u('au'), title: `K2 S2 ${t}`,
        participants: [{username: u('se'), role: 'sectionEditor'}], libraryFiles: [{name: 'S2 file', type: 'Reports', file: pdf}]});
    S.A = A;

    const tb = tag('u39k2b');
    const bu = [['mg', 'manager', 'Bea', 'Manager'], ['au', 'author', 'Bo', 'Author']];
    if (!ops) bu.push(['ed', 'editor', 'Ben', 'Editor']);
    const bspec = {tag: tb, context: {name: `U39 K2 ${tb}`, acronym: 'K2B', contactName: 'K2 Contact', contactEmail: `${tb}contact@mail.test`},
        users: bu.map(([k, role, g, f]) => ({username: `${tb}${k}`, roles: [role], givenName: g, familyName: f})),
        libraryFiles: [{name: 'B public', type: 'Other', publicAccess: true, file: pdf}]};
    if (!ops) bspec.roles = {editor: {permitSettings: false}};
    const CB = await app.api.createContext(bspec);
    const B = {t: tb, path: CB.path, users: Object.fromEntries(bu.map(([k, role]) => [k, {username: `${tb}${k}`, role}])), libraryFiles: CB.libraryFiles};
    B.S = await app.api.createSubmission({tag: `${tb}s`, context: B.path, submitter: `${tb}au`, title: `K2 SB ${tb}`});
    S.B = B;
    fs.writeFileSync(file, JSON.stringify(S, null, 2));
    console.log(`[${app.name} seed]`, JSON.stringify({A: {path: A.path, S1: A.S1.submissionId, S1lib: A.S1.libraryFiles, S2: A.S2.submissionId, S2lib: A.S2.libraryFiles, lib: A.libraryFiles}, B: {path: B.path, S: B.S.submissionId, lib: B.libraryFiles}}));
    return S;
}


// ---------------------------------------------------------------------------
// Screen helpers

function helpers(app, ctxBrowser, page) {
    const h = {};
    const facts = {};
    h.facts = facts;
    h.put = (k, v) => { facts[k] = v; console.log(`[${app.name} ${k}]`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 1800)); };
    h.snap = async (name, extra) => {
        const s = await screen(page);
        record(name, extra ? {...s, extra} : s);
        await shot(page, name).catch(() => {});
        return s;
    };
    h.sect = async (label, fn) => {
        try {
            await fn();
        } catch (e) {
            console.log(`[${app.name} ${label} ERROR]`, String(e.stack || e.message).slice(0, 1200));
            await h.snap(`error-${label}`).catch(() => {});
        }
    };
    const AUTHOR_LEVEL = ['au', 'tr', 've', 'ca'];
    h.wfUrl = (ctx, id, key) => (AUTHOR_LEVEL.includes(key)
        ? app.url(`/index.php/${ctx}/en/dashboard/mySubmissions?workflowSubmissionId=${id}`)
        : app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    h.libButton = () => page.getByRole('button', {name: 'Library', exact: true});
    h.openWf = async (ctx, id, key) => {
        await page.goto(h.wfUrl(ctx, id, key));
        await idle(page);
        await h.libButton().first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        return h.libButton();
    };
    h.subGrid = () => page.locator(SUB_GRID).first();
    h.pubGrid = () => page.locator(PUB_GRID).last();
    h.openLibrary = async () => {
        const lib = h.libButton();
        if (!(await lib.count())) return null;
        await lib.first().click();
        await h.subGrid().waitFor({timeout: 30000});
        await idle(page);
        return h.subGrid();
    };
    h.openVDL = async () => {
        const b = h.subGrid().getByRole('link', {name: 'View Document Library', exact: true});
        if (!(await b.count())) return null;
        await b.first().click();
        await page.locator(PUB_GRID).first().waitFor({timeout: 30000});
        await idle(page);
        return h.pubGrid();
    };
    h.closeDialog = async (name) => {
        const d = page.getByRole('dialog', {name, exact: true}).last();
        const c = d.getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) { await c.click(); await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {}); await idle(page); return true; }
        return false;
    };
    // Structured read of a legacy library grid: its heading, header actions, and every visible row in order.
    h.gridInfo = async (grid) => grid.evaluate((g) => {
        const vis = (e) => !!(e && e.getClientRects().length);
        const text = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const heading = g.querySelector('.header h4');
        const actions = [...g.querySelectorAll('.header a')].filter(vis).map((a) => text(a));
        const rows = [];
        for (const tr of g.querySelectorAll('tbody tr')) {
            if (!vis(tr)) continue;
            const dl = tr.querySelector('a.pkp_linkaction_downloadFile');
            const arrow = tr.querySelector('a.show_extras');
            if (dl) rows.push({file: text(dl), arrow: !!(arrow && vis(arrow)), icon: [...dl.classList].find((c) => c.startsWith('pkp_linkaction_icon_')) || null, href: dl.getAttribute('href').replace(/^.*\/index\.php/, '')});
            else if (/row_controls|row_actions/.test(tr.className) || tr.querySelector('.row_actions')) rows.push({controls: [...tr.querySelectorAll('a')].filter(vis).map((a) => text(a))});
            else rows.push({group: text(tr)});
        }
        const hrefs = [...g.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
        return {heading: text(heading), actions, columns: [...g.querySelectorAll('thead th')].filter(vis).map((th) => text(th)), rows,
            arrows: [...g.querySelectorAll('a.show_extras')].filter(vis).length, publicLinks: hrefs.filter((x) => /downloadPublic/.test(x)).length};
    });
    // Summarise the gridInfo as "Group: file, file | Group: No Items".
    h.groups = (info) => {
        const out = [];
        for (const r of info.rows) {
            if (r.group !== undefined) out.push(r.group === 'No Items' ? '(No Items)' : `[${r.group}]`);
            else if (r.file !== undefined) out.push(`${r.file}${r.arrow ? '>' : ''}`);
        }
        return out.join(' ');
    };
    // Press a link that downloads, in place or in a new tab:
    // {kind: 'download', name, size, url, stayed} | {kind: 'navigated'|'popup', url, text, status} | {kind: 'none'}.
    h.download = async (link, label) => {
        const before = page.url();
        const saveDl = async (d, where) => {
            const p = path.join(outDir(), 'downloads', `${app.name}-${label}-${d.suggestedFilename()}`);
            fs.mkdirSync(path.dirname(p), {recursive: true});
            await d.saveAs(p).catch(() => {});
            return {kind: 'download', where, name: d.suggestedFilename(), size: fs.existsSync(p) ? fs.statSync(p).size : null, url: d.url().replace(/^.*\/index\.php/, ''), pageAfter: page.url().replace(/^.*\/index\.php/, ''), stayed: page.url() === before};
        };
        const statuses = [];
        const onResp = (r) => { if (/download-library-file|downloadLibraryFile|libraryFiles|_library/.test(r.url())) statuses.push({url: r.url().replace(/^.*\/index\.php/, ''), status: r.status(), type: r.headers()['content-type'], disp: r.headers()['content-disposition']}); };
        ctxBrowser.on('response', onResp);
        const dl = page.waitForEvent('download', {timeout: 20000}).then((d) => ({d})).catch(() => null);
        const nav = page.waitForEvent('framenavigated', {timeout: 20000}).then((f) => (f === page.mainFrame() ? {nav: f.url()} : null)).catch(() => null);
        const pop = ctxBrowser.waitForEvent('page', {timeout: 20000}).then((p) => ({p})).catch(() => null);
        await link.click();
        let out;
        const r = await Promise.race([dl, nav.then(async (n) => { if (!n) return null; await sleep(1500); return n; }), pop]);
        if (r && r.d) out = await saveDl(r.d, 'page');
        else if (r && r.p) {
            const p = r.p;
            const d2 = await Promise.race([p.waitForEvent('download', {timeout: 8000}).then((d) => ({d})).catch(() => null), p.waitForLoadState('domcontentloaded', {timeout: 8000}).then(() => sleep(1500)).then(() => null).catch(() => null)]);
            if (d2 && d2.d) out = await saveDl(d2.d, 'new tab');
            else {
                const txt = await p.locator('body').innerText({timeout: 5000}).catch(() => null);
                out = {kind: 'popup', url: p.url().replace(/^.*\/index\.php/, ''), text: flat(txt, 300)};
            }
            await p.close().catch(() => {});
        } else {
            const d2 = await Promise.race([dl, sleep(3000).then(() => null)]);
            if (d2 && d2.d) out = await saveDl(d2.d, 'page');
            else {
                await page.waitForLoadState('domcontentloaded').catch(() => {});
                const txt = await page.locator('body').innerText().catch(() => null);
                out = {kind: page.url() === before ? 'none' : 'navigated', url: page.url().replace(/^.*\/index\.php/, ''), text: flat(txt, 300)};
            }
        }
        ctxBrowser.off('response', onResp);
        out.responses = statuses;
        // The app's download link finishes on a two-second timer; a list redrawn before it fires raises
        // "There is no handler bound to this element!" (handler-error.js), so wait it out before the next action.
        if (out.kind === 'download' && out.where === 'page') await sleep(2100);
        h.put(`download:${label}`, out);
        return out;
    };
    // The library file form on top ("Add a file" or "Edit").
    h.form = () => page.locator('form').filter({has: page.locator('input[name^="libraryFileName"]')}).last();
    h.formRead = async (f) => f.evaluate((form) => {
        const vis = (e) => !!(e && e.getClientRects().length);
        const pa = form.querySelector('input[name="publicAccess"]');
        return {
            id: form.id,
            text: form.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 1500),
            types: [...form.querySelectorAll('select[name="fileType"] option')].map((o) => o.textContent.trim()),
            typeSelected: (form.querySelector('select[name="fileType"]') || {}).selectedOptions ? [...form.querySelector('select[name="fileType"]').selectedOptions].map((o) => o.textContent.trim())[0] : null,
            names: [...form.querySelectorAll('input[name^="libraryFileName"]')].map((i) => ({name: i.name, value: i.value, max: i.maxLength})),
            publicAccess: pa ? {checked: pa.checked, visible: vis(pa)} : null,
            address: (form.innerText.match(/https?:\/\/\S*downloadPublic\S*/) || [null])[0],
            fileInputs: form.querySelectorAll('input[type="file"]').length,
        };
    });
    h.waitUpload = () => page.waitForFunction(() => [...document.querySelectorAll('form input[name="temporaryFileId"]')].some((i) => i.value), null, {timeout: 30000});
    h.fillAdd = async (label, {name, type, description, publicAccess, file, snap = true}) => {
        const f = h.form();
        await f.waitFor({timeout: 30000});
        await idle(page);
        if (snap) await h.snap(`${label}-add-window`);
        const read = await h.formRead(f);
        await f.locator('input[name^="libraryFileName"]').first().fill(name);
        await f.locator('select[name="fileType"]').selectOption({label: type});
        if (description) await f.locator('textarea[name^="description"]').first().fill(description);
        await f.locator('input[type="file"]').first().setInputFiles(file);
        await h.waitUpload();
        if (publicAccess) await f.locator('input[name="publicAccess"]').check();
        await f.getByRole('button', {name: 'OK', exact: true}).click();
        await f.waitFor({state: 'detached', timeout: 30000}).catch(() => note(`${app.name}: the "Add a file" window (${label}) did not close after OK`));
        await idle(page);
        return read;
    };
    h.addFile = async (grid, label, spec) => {
        await grid.getByRole('link', {name: 'Add a file', exact: true}).first().click();
        return h.fillAdd(label, spec);
    };
    // A file row's arrow → {edit, del} links.
    h.rowActions = async (grid, name) => {
        const row = grid.locator('tr.gridRow').filter({has: page.getByRole('link', {name, exact: true})}).first();
        const arrow = row.locator('a.show_extras').first();
        if (!(await arrow.count())) return null;
        await arrow.click();
        const actions = row.locator('xpath=following-sibling::tr[1]');
        await actions.getByRole('link', {name: 'Edit', exact: true}).first().waitFor({timeout: 10000}).catch(() => {});
        return {row, actions, edit: actions.getByRole('link', {name: 'Edit', exact: true}).first(), del: actions.getByRole('link', {name: 'Delete', exact: true}).first(),
            texts: await actions.getByRole('link').allInnerTexts().catch(() => [])};
    };
    h.openEdit = async (grid, name) => {
        const ra = await h.rowActions(grid, name);
        if (!ra) return null;
        await ra.edit.click();
        const f = h.form();
        await f.waitFor({timeout: 30000});
        await page.waitForFunction(() => [...document.querySelectorAll('form input[name^="libraryFileName"]')].some((i) => i.value), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        return f;
    };
    h.formOk = async (f) => {
        await f.getByRole('button', {name: 'OK', exact: true}).click();
        await f.waitFor({state: 'detached', timeout: 30000}).catch(() => {});
        await idle(page);
    };
    h.formCancel = async (f) => {
        const c = f.getByRole('link', {name: 'Cancel', exact: true}).or(f.getByRole('button', {name: 'Cancel', exact: true})).first();
        await c.click();
        await f.waitFor({state: 'detached', timeout: 15000}).catch(() => {});
        await idle(page);
    };
    h.deleteFile = async (grid, name, confirm = true) => {
        const ra = await h.rowActions(grid, name);
        if (!ra) return null;
        await ra.del.click();
        await sleep(800);
        const all = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible, .ui-dialog:visible');
        const texts = await all.allInnerTexts().catch(() => []);
        const dlg = all.filter({hasText: /Are you sure|cannot be undone/}).last();
        const t = (await dlg.count()) ? await dlg.innerText() : texts.join(' || ');
        const heading = (await dlg.count()) ? await dlg.getByRole('heading').allInnerTexts().catch(() => []) : [];
        const btns = (await dlg.count()) ? await dlg.getByRole('button').allInnerTexts().catch(() => []) : [];
        await h.snap(`delete-dialog-${String(name).replace(/\W+/g, '-')}`).catch(() => {});
        const b = dlg.getByRole('button', {name: confirm ? 'OK' : 'Cancel', exact: true}).first();
        if (await b.count()) await b.click(); else note(`${app.name}: the "Delete" dialog for ${name} had no ${confirm ? 'OK' : 'Cancel'} button (${flat(t, 200)})`);
        await idle(page);
        await sleep(500);
        h.put(`delete-dialog:${name}`, {text: flat(t, 300), heading, buttons: btns});
        return flat(t, 300);
    };
    h.fileId = async (grid, name) => {
        const href = await grid.getByRole('link', {name, exact: true}).first().getAttribute('href').catch(() => null);
        const m = href && href.match(/libraryFileId=(\d+)/);
        return m ? Number(m[1]) : null;
    };
    // Open an address in the browser tab and read what it answers: status, headers, a download or the page text.
    h.openAddress = async (url, label) => {
        const resps = [];
        const onResp = (r) => { if (r.url() === url || r.url().includes('downloadPublic')) resps.push({url: r.url().replace(/^.*\/index\.php/, ''), status: r.status(), type: r.headers()['content-type'], disp: r.headers()['content-disposition'], length: r.headers()['content-length']}); };
        page.on('response', onResp);
        const dl = page.waitForEvent('download', {timeout: 8000}).then((d) => ({d})).catch(() => null);
        let err = null;
        try { await page.goto(url, {waitUntil: 'load', timeout: 15000}); } catch (e) { err = String(e.message).split('\n')[0]; }
        const d = await Promise.race([dl, sleep(2500).then(() => null)]);
        let download = null;
        if (d && d.d) {
            const p = path.join(outDir(), 'downloads', `${app.name}-${label}-${d.d.suggestedFilename()}`);
            fs.mkdirSync(path.dirname(p), {recursive: true});
            await d.d.saveAs(p).catch(() => {});
            download = {name: d.d.suggestedFilename(), size: fs.existsSync(p) ? fs.statSync(p).size : null};
        }
        page.off('response', onResp);
        const txt = err ? null : await page.locator('body').innerText().catch(() => null);
        const out = {url: url.replace(/^.*\/index\.php/, ''), responses: resps, download, gotoError: err, text: flat(txt, 200), pageUrl: page.url().replace(/^.*\/index\.php/, '')};
        h.put(`address:${label}`, out);
        return out;
    };
    h.flush = () => {
        const p = path.join(outDir(), `facts-${app.name}.json`);
        const old = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
        fs.writeFileSync(p, JSON.stringify({...old, ...facts}, null, 2));
    };
    return h;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const F = fixtures(app);
    const S = await seed(app);
    const saveSeed = () => fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
    const A = S.A, B = S.B;
    const ops = app.name === 'ops', omp = app.name === 'omp';
    const {context, page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message()}`); console.log(`[${app.name} browser-dialog] ${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
    const h = helpers(app, context, page);
    const U = (k) => (k === 'admin' ? 'admin' : A.users[k].username);
    const settingsUrl = (ctx) => app.url(`/index.php/${ctx}/en/management/settings/workflow`);
    const pub = (ctx, id) => app.url(`/index.php/${ctx}/libraryFiles/downloadPublic/${id}`);
    const tabName = TAB_NAME[app.name];
    const openTab = async (ctx) => {
        await page.goto(settingsUrl(ctx));
        await idle(page);
        const tab = page.getByRole('tab', {name: tabName, exact: true});
        if (!(await tab.count())) return null;
        await tab.click();
        await page.locator(PUB_GRID).first().waitFor({timeout: 30000});
        await idle(page);
        return h.pubGrid();
    };
    const MGR = ops ? 'mg' : 'ed';
    const libId = (list, name) => (list.find((x) => x.name === name) || {}).id;
    const seededPublicId = libId(A.libraryFiles, 'Seeded public guide');
    const seededPrivateId = libId(A.libraryFiles, 'Seeded private');
    const seededNotesId = libId(A.S1.libraryFiles, 'Seeded notes');
    const s2FileId = libId(A.S2.libraryFiles, 'S2 file');
    const bPublicId = libId(B.libraryFiles, 'B public');

    try {
        // =====================================================================
        // Rule 9, Actors row 5 (Settings side), Fields "Public Access" address: the Settings › Workflow tab.
        if (on('tab')) await h.sect('tab', async () => {
            await signIn(page, U('mg'), {contextPath: A.path});
            await page.goto(settingsUrl(A.path));
            await idle(page);
            const heading = await page.locator('main h1').first().innerText().catch(() => null);
            const tabs = await page.getByRole('tab').allInnerTexts();
            await h.snap('tab-page');
            let grid = await openTab(A.path);
            await loc(page, `Settings › Workflow tab "${tabName}"`, page.getByRole('tab', {name: tabName, exact: true}));
            await loc(page, 'library tab grid', page.locator(PUB_GRID).last());
            const info = await h.gridInfo(grid);
            await h.snap('tab-library', {info});
            h.put('tab', {heading, tabs, url: page.url().replace(/^.*\/index\.php/, ''), gridHeading: info.heading, actions: info.actions, columns: info.columns, groups: h.groups(info), arrows: info.arrows, publicLinks: info.publicLinks});

            // "Add a file": the printed address, the type list; then leave once with a name typed.
            await grid.getByRole('link', {name: 'Add a file', exact: true}).first().click();
            let f = h.form();
            await f.waitFor({timeout: 30000});
            await idle(page);
            await h.snap('tab-add-window');
            h.put('tab-add-window', await h.formRead(f));
            await f.locator('input[name^="libraryFileName"]').first().fill('Unsaved typed name');
            await f.locator('input[name^="libraryFileName"]').first().blur();
            dialogs.length = 0;
            const closed = await h.closeDialog('Add a file');
            await sleep(800);
            h.put('tab-add-leave-close', {closedByClose: closed, browserDialogs: [...dialogs], formStillOpen: await h.form().count(), rowAdded: await grid.getByRole('link', {name: 'Unsaved typed name', exact: true}).count()});
            await h.snap('tab-add-left-by-close');
            grid = await openTab(A.path);
            await grid.getByRole('link', {name: 'Add a file', exact: true}).first().click();
            f = h.form();
            await f.waitFor({timeout: 30000});
            await f.locator('input[name^="libraryFileName"]').first().fill('Unsaved typed name 2');
            await f.locator('input[type="file"]').first().setInputFiles(F['guide.pdf']);
            await h.waitUpload();
            await f.locator('input[name^="libraryFileName"]').first().blur();
            dialogs.length = 0;
            await page.goto(app.url(`/index.php/${A.path}/en/management/settings/context`)).catch((e) => h.put('tab-add-leave-goto-error', String(e.message).slice(0, 200)));
            await idle(page);
            h.put('tab-add-leave-page', {browserDialogs: [...dialogs], landed: page.url().replace(/^.*\/index\.php/, '')});
            grid = await openTab(A.path);
            h.put('tab-after-leaves', h.groups(await h.gridInfo(grid)));

            // "Guide": added with Public Access; its "Edit" reads the address with the number.
            await h.addFile(grid, 'tab-guide', {name: 'Guide', type: 'Other', file: F['guide.pdf'], publicAccess: true, snap: false});
            const guideId = await h.fileId(grid, 'Guide');
            let ef = await h.openEdit(grid, 'Guide');
            await h.snap('tab-guide-edit');
            h.put('tab-guide-edit', {...(await h.formRead(ef)), guideId, expected: pub(A.path, guideId)});
            await loc(page, 'Publisher Library "Edit" form', ef);
            await h.formCancel(ef);
            const delText = await h.deleteFile(grid, 'Guide', false);
            h.put('tab-delete-cancel', {dialog: delText, stillListed: await grid.getByRole('link', {name: 'Guide', exact: true}).count()});
            if (omp) await h.addFile(grid, 'tab-contracts', {name: 'Tab contract', type: 'Contracts', file: F['codes.pdf'], snap: false});
            await h.addFile(grid, 'tab-other', {name: 'Tab other', type: 'Other', file: F['codes.pdf'], snap: false});
            const info2 = await h.gridInfo(grid);
            h.put('tab-after-adds', h.groups(info2));
            await h.snap('tab-library-after-adds', {info: info2});
            S.A.guideId = guideId;
            saveSeed();

            // Rule 9: files added here show in S2's "View Document Library", never in its "Submission Library".
            await h.openWf(A.path, A.S2.submissionId, 'mg');
            const sg = await h.openLibrary();
            const si = await h.gridInfo(sg);
            await h.snap('rule9-s2-sublib', {si});
            const vg = await h.openVDL();
            const vi = await h.gridInfo(vg);
            await h.snap('rule9-s2-vdl', {vi});
            h.put('rule9-S2', {sublib: h.groups(si), vdl: h.groups(vi), vdlHeading: vi.heading, vdlActions: vi.actions, vdlPublicLinks: vi.publicLinks});

            // Who opens the tab: manager-level, admin, and a Section Editor for control.
            for (const k of (ops ? ['admin', 'se', 'au'] : ['ed', 'pe', 'admin', 'se', 'ce'])) {
                await signIn(page, U(k), {contextPath: A.path});
                await page.goto(settingsUrl(A.path));
                await idle(page);
                const t = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
                const tabHere = await page.getByRole('tab', {name: tabName, exact: true}).count();
                let add = null;
                if (tabHere) {
                    const g = await openTab(A.path);
                    const gi = await h.gridInfo(g);
                    add = {actions: gi.actions, arrows: gi.arrows};
                }
                await h.snap(`tab-as-${k}`);
                h.put(`tab-as-${k}`, {url: page.url().replace(/^.*\/index\.php/, ''), tab: tabHere, add, text: flat(t, 200)});
            }
        });

        // =====================================================================
        // Rule 10 and Actors row 7: the public address, both ends.
        if (on('public')) await h.sect('public', async () => {
            await signIn(page, U('mg'), {contextPath: A.path});
            let grid = await openTab(A.path);
            const guideId = S.A.guideId || await h.fileId(grid, 'Guide');
            const hrefs = await page.locator('a[href*="downloadPublic"]').count();
            await signOut(page);
            const res = {};
            res.guide = await h.openAddress(pub(A.path, guideId), 'guide-signed-out');
            res.seededPublic = await h.openAddress(pub(A.path, seededPublicId), 'seeded-public-signed-out');
            res.seededPrivate = await h.openAddress(pub(A.path, seededPrivateId), 'seeded-private-unticked');
            await h.snap('public-403-unticked');
            res.subFile = await h.openAddress(pub(A.path, seededNotesId), 'submission-library-file');
            res.s2File = await h.openAddress(pub(A.path, s2FileId), 'submission-library-file-s2');
            res.noSuch = await h.openAddress(pub(A.path, 999999), 'no-such-number');
            res.otherJournal = await h.openAddress(pub(A.path, bPublicId), 'other-journal-file-under-A');
            res.otherJournalOwn = await h.openAddress(pub(B.path, bPublicId), 'other-journal-file-own-address');
            // The journal's public pages carry no link to the address.
            await page.goto(app.url(`/index.php/${A.path}`));
            await idle(page);
            res.homeLinks = await page.locator('a[href*="downloadPublic"]').count();
            await h.snap('public-home');
            // Untick: the address refuses.
            await signIn(page, U('mg'), {contextPath: A.path});
            res.guideSignedIn = await h.openAddress(pub(A.path, guideId), 'guide-signed-in');
            grid = await openTab(A.path);
            let ef = await h.openEdit(grid, 'Guide');
            await ef.locator('input[name="publicAccess"]').uncheck();
            await h.formOk(ef);
            ef = await h.openEdit(grid, 'Guide');
            res.guideEditAfterUntick = await h.formRead(ef);
            await h.formCancel(ef);
            await signOut(page);
            res.guideUnticked = await h.openAddress(pub(A.path, guideId), 'guide-unticked');
            // A deleted file.
            await signIn(page, U('mg'), {contextPath: A.path});
            grid = await openTab(A.path);
            await h.addFile(grid, 'tab-deleteme', {name: 'Delete me', type: 'Other', file: F['deleteme.pdf'], publicAccess: true, snap: false});
            const delId = await h.fileId(grid, 'Delete me');
            res.deleteMeBefore = await h.openAddress(pub(A.path, delId), 'deleteme-before');
            grid = await openTab(A.path);
            res.deleteDialog = await h.deleteFile(grid, 'Delete me', true);
            res.deleteMeListed = await grid.getByRole('link', {name: 'Delete me', exact: true}).count();
            await signOut(page);
            res.deleted = await h.openAddress(pub(A.path, delId), 'deleted');
            // Rule 10c: "Replace file" keeps the number.
            await signIn(page, U('mg'), {contextPath: A.path});
            grid = await openTab(A.path);
            ef = await h.openEdit(grid, 'Seeded public guide');
            res.replaceBefore = await h.formRead(ef);
            await h.snap('public-replace-before');
            await loc(page, 'Edit "Replace file" input', ef.locator('input[type="file"]'));
            await ef.locator('input[type="file"]').first().setInputFiles(F['replacement.pdf']);
            await h.waitUpload();
            await h.snap('public-replace-uploaded');
            await h.formOk(ef);
            ef = await h.openEdit(grid, 'Seeded public guide');
            res.replaceAfter = await h.formRead(ef);
            await h.snap('public-replace-after');
            await h.formCancel(ef);
            res.replaceTabDownload = await h.download(grid.getByRole('link', {name: 'Seeded public guide', exact: true}), 'replaced-from-tab');
            await signOut(page);
            res.replaced = await h.openAddress(pub(A.path, seededPublicId), 'after-replace');
            res.tabPublicLinks = hrefs;
            res.sizes = F.sizes;
            h.put('public', {guideId, delId, seededPublicId, seededPrivateId, seededNotesId, s2FileId, bPublicId, homeLinks: res.homeLinks, tabPublicLinks: hrefs,
                guideEditAfterUntick: res.guideEditAfterUntick, replaceBefore: res.replaceBefore, replaceAfter: res.replaceAfter, deleteDialog: res.deleteDialog, deleteMeListed: res.deleteMeListed, sizes: F.sizes});
        });

        // =====================================================================
        // Rule 8a, A4, OMP1: downloaded names.
        if (on('names')) await h.sect('names', async () => {
            await signIn(page, U(MGR), {contextPath: A.path});
            await h.openWf(A.path, A.S1.submissionId, MGR);
            let grid = await h.openLibrary();
            const add = async (label, name, type, file) => h.addFile(h.subGrid(), label, {name, type, file, snap: false});
            const dl = async (name, label) => h.download(h.subGrid().getByRole('link', {name, exact: true}), label);
            const r = {};
            await h.subGrid().getByRole('link', {name: 'Add a file', exact: true}).first().click();
            r.addWindow = await h.fillAdd('names-contract', {name: 'Contract', type: 'Marketing', file: F['contract.pdf']});
            r.contract = await dl('Contract', 'contract');
            await add('names-contract2', 'Contract 2', 'Marketing', F['contract.pdf']);
            r.contract2 = await dl('Contract 2', 'contract2');
            let ef = await h.openEdit(h.subGrid(), 'Contract');
            r.subEdit = await h.formRead(ef);
            await h.snap('names-sub-edit');
            await ef.locator('select[name="fileType"]').selectOption({label: 'Other'});
            await h.formOk(ef);
            r.afterTypeChange = h.groups(await h.gridInfo(h.subGrid()));
            r.contractAfterType = await dl('Contract', 'contract-after-type');
            await add('names-pdfguide', 'PDF guide', 'Marketing', F['pdf-guide.pdf']);
            r.pdfGuide = await dl('PDF guide', 'pdf-guide');
            await add('names-notesdraft', 'Notes draft', 'Marketing', F['notes-pdf-draft.pdf']);
            r.notesDraft = await dl('Notes draft', 'notes-draft');
            for (const [name, type] of [['Code PER', 'Permissions'], ['Code REP', 'Reports'], ['Code OTH', 'Other']].concat(omp ? [['Code CON', 'Contracts']] : [])) {
                await add(`names-${type}`, name, type, F['codes.pdf']);
                r[name] = await dl(name, name.replace(' ', '-'));
            }
            const gi = await h.gridInfo(h.subGrid());
            r.groups = h.groups(gi);
            await h.snap('names-sublib-after', {gi});
            // Across libraries: the Publisher Library shares the name count.
            await signIn(page, U('mg'), {contextPath: A.path});
            grid = await openTab(A.path);
            await h.addFile(grid, 'names-pl-contract', {name: 'PL contract', type: 'Marketing', file: F['contract.pdf'], snap: false});
            r.plContract = await h.download(grid.getByRole('link', {name: 'PL contract', exact: true}), 'pl-contract');
            // Replace together with a type change: which code does the new name carry?
            await h.addFile(grid, 'names-pl-swap', {name: 'Codes swap', type: 'Marketing', file: F['codes.pdf'], snap: false});
            r.swapBefore = await h.download(grid.getByRole('link', {name: 'Codes swap', exact: true}), 'swap-before');
            ef = await h.openEdit(grid, 'Codes swap');
            await ef.locator('select[name="fileType"]').selectOption({label: 'Permissions'});
            await ef.locator('input[type="file"]').first().setInputFiles(F['replacement.pdf']);
            await h.waitUpload();
            await h.formOk(ef);
            r.swapAfter = await h.download(grid.getByRole('link', {name: 'Codes swap', exact: true}), 'swap-after');
            // Replace alone after an earlier type change: "PL type" added Marketing, edited to Reports, then replaced.
            await h.addFile(grid, 'names-pl-type', {name: 'PL type', type: 'Marketing', file: F['codes.pdf'], snap: false});
            ef = await h.openEdit(grid, 'PL type');
            await ef.locator('select[name="fileType"]').selectOption({label: 'Reports'});
            await h.formOk(ef);
            r.typeOnly = await h.download(grid.getByRole('link', {name: 'PL type', exact: true}), 'pltype-after-type');
            ef = await h.openEdit(grid, 'PL type');
            await ef.locator('input[type="file"]').first().setInputFiles(F['replacement.pdf']);
            await h.waitUpload();
            await h.formOk(ef);
            r.typeThenReplace = await h.download(grid.getByRole('link', {name: 'PL type', exact: true}), 'pltype-after-replace');
            r.tabGroups = h.groups(await h.gridInfo(grid));
            await h.snap('names-tab-after');
            h.put('names', Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && v.kind ? `${v.kind} ${v.name || v.url} ${v.size || ''} stayed=${v.stayed}` : v])));
        });

        // =====================================================================
        // Actors rows 3–6, Rules 6 and 8b–8c, A1: every role on S1.
        if (on('roles')) await h.sect('roles', async () => {
            const keys = ops ? ['admin', 'mg', 'se', 'au'] : ['admin', 'mg', 'ed', 'pe', 'se', 'ce', 'le', 'mk', 'fc', 'tr', 'au'].concat(omp ? ['ve', 'ca'] : []);
            for (const k of keys) await h.sect(`roles-${k}`, async () => {
                await signIn(page, U(k), {contextPath: A.path});
                const lib = await h.openWf(A.path, A.S1.submissionId, k);
                const r = {user: U(k), libraryButton: await lib.count()};
                if (!r.libraryButton) {
                    await h.snap(`roles-${k}-no-library`);
                    r.url = page.url().replace(/^.*\/index\.php/, '');
                    r.text = flat(await page.locator('body').innerText().catch(() => ''), 300);
                    h.put(`roles:${k}`, r);
                    return;
                }
                const grid = await h.openLibrary();
                const si = await h.gridInfo(grid);
                r.sub = {actions: si.actions, groups: h.groups(si), arrows: si.arrows};
                await h.snap(`roles-${k}-sublib`, {si});
                if (k === 'mg') {
                    await loc(page, 'Submission Library "View Document Library"', h.subGrid().getByRole('link', {name: 'View Document Library', exact: true}));
                    await loc(page, 'Submission Library file name (download link)', h.subGrid().getByRole('link', {name: 'Seeded notes', exact: true}));
                    await loc(page, 'Submission Library row arrow', h.subGrid().locator('tr.gridRow', {has: page.getByRole('link', {name: 'Seeded notes', exact: true})}).locator('a.show_extras'));
                }
                const vdl = await h.openVDL();
                if (vdl && k === 'mg') {
                    await loc(page, '"View Document Library" window', page.getByRole('dialog', {name: 'View Document Library', exact: true}));
                    await loc(page, '"View Document Library" grid', h.pubGrid());
                    await loc(page, '"View Document Library" "Add a file"', h.pubGrid().getByRole('link', {name: 'Add a file', exact: true}));
                }
                if (vdl) {
                    const vi = await h.gridInfo(vdl);
                    r.vdl = {heading: vi.heading, actions: vi.actions, groups: h.groups(vi), arrows: vi.arrows, publicLinks: vi.publicLinks};
                    await h.snap(`roles-${k}-vdl`, {vi});
                    if (k === 'ed' || (ops && k === 'mg')) {
                        // A manager-level role changes the Publisher Library from the workflow (Rule 6 "works as on the Settings tab").
                        await h.addFile(vdl, `roles-${k}-vdl`, {name: `VDL upload ${k}`, type: 'Other', file: F['vdl.pdf'], publicAccess: true});
                        const ra = await h.rowActions(h.pubGrid(), `VDL upload ${k}`);
                        r.vdlRowActions = ra && ra.texts;
                        if (ra) {
                            await ra.edit.click();
                            const ef = h.form();
                            await ef.waitFor({timeout: 30000});
                            await idle(page);
                            r.vdlEdit = await h.formRead(ef);
                            await h.snap(`roles-${k}-vdl-edit`);
                            await ef.locator('input[name^="libraryFileName"]').first().fill(`VDL upload ${k} renamed`);
                            await h.formOk(ef);
                        }
                        r.vdlAfter = h.groups(await h.gridInfo(h.pubGrid()));
                        r.vdlAfterSub = h.groups(await h.gridInfo(h.subGrid()));
                    }
                    r.plDownload = await h.download(h.pubGrid().getByRole('link', {name: 'Seeded public guide', exact: true}), `roles-${k}-pl`);
                    if (r.plDownload.kind === 'navigated') {
                        await h.snap(`roles-${k}-pl-navigated`);
                        await h.openWf(A.path, A.S1.submissionId, k);
                        await h.openLibrary();
                    } else await h.closeDialog('View Document Library');
                } else r.vdl = null;
                if (k === 'ce' || k === 'au') {
                    // A file of their own, then its name.
                    await h.addFile(h.subGrid(), `roles-${k}-own`, {name: `Own file ${k}`, type: 'Other', file: F['own.pdf'], snap: false});
                    r.ownListed = h.groups(await h.gridInfo(h.subGrid()));
                    r.ownDownload = await h.download(h.subGrid().getByRole('link', {name: `Own file ${k}`, exact: true}), `roles-${k}-own`);
                    if (r.ownDownload.kind === 'navigated') {
                        await h.snap(`roles-${k}-own-navigated`);
                        await h.openWf(A.path, A.S1.submissionId, k);
                        await h.openLibrary();
                    }
                }
                r.slDownload = await h.download(h.subGrid().getByRole('link', {name: 'Seeded notes', exact: true}), `roles-${k}-sl`);
                if (r.slDownload.kind === 'navigated') await h.snap(`roles-${k}-sl-navigated`);
                h.put(`roles:${k}`, r);
            });
            // Rule 9 from the other side: the editor's VDL upload on the tab and on S2, never in a Submission Library.
            await h.sect('roles-crosscheck', async () => {
                await signIn(page, U('mg'), {contextPath: A.path});
                const grid = await openTab(A.path);
                const ti = await h.gridInfo(grid);
                await h.openWf(A.path, A.S2.submissionId, 'mg');
                const sg = await h.openLibrary();
                const si = await h.gridInfo(sg);
                const vg = await h.openVDL();
                const vi = await h.gridInfo(vg);
                await h.snap('roles-crosscheck-s2-vdl');
                h.put('roles-crosscheck', {tab: h.groups(ti), s2sub: h.groups(si), s2vdl: h.groups(vi)});
            });
        });

        // =====================================================================
        // A7 and "Permit changes to Settings" {OJS OMP}.
        if (on('a7') && !ops) await h.sect('a7', async () => {
            const r = {};
            await signIn(page, B.users.ed.username, {contextPath: B.path});
            await page.goto(app.url(`/index.php/${B.path}/en/dashboard/editorial`));
            await idle(page);
            const sideMenu = async () => (await page.locator('nav').allInnerTexts().catch(() => [])).map((t) => flat(t, 300)).filter((t) => /Settings|Dashboards|Statistics|Users/.test(t));
            r.nav = await sideMenu();
            r.navHasSettings = await page.locator('nav').getByText('Settings', {exact: true}).count();
            await h.snap('a7-ed-dashboard');
            if (A.users.ed) {
                await signIn(page, A.users.ed.username, {contextPath: A.path});
                await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial`));
                await idle(page);
                r.navA = await sideMenu();
                r.navAHasSettings = await page.locator('nav').getByText('Settings', {exact: true}).count();
                await h.snap('a7-ed-default-dashboard');
                await signIn(page, B.users.ed.username, {contextPath: B.path});
            }
            await page.goto(settingsUrl(B.path));
            await idle(page);
            r.settings = {url: page.url().replace(/^.*\/index\.php/, ''), text: flat(await page.locator('body').innerText().catch(() => ''), 300), tab: await page.getByRole('tab', {name: tabName, exact: true}).count()};
            await h.snap('a7-ed-settings');
            await h.openWf(B.path, B.S.submissionId, 'ed');
            await h.openLibrary();
            const vdl = await h.openVDL();
            const vi = await h.gridInfo(vdl);
            r.vdl = {heading: vi.heading, actions: vi.actions, groups: h.groups(vi), arrows: vi.arrows};
            await h.snap('a7-ed-vdl', {vi});
            await h.addFile(vdl, 'a7-ed-add', {name: `Editor upload ${RUN}`, type: 'Other', file: F['vdl.pdf'], snap: true});
            const ef = await h.openEdit(h.pubGrid(), `Editor upload ${RUN}`);
            if (ef) { await ef.locator('input[name^="libraryFileName"]').first().fill(`Editor upload renamed ${RUN}`); await h.formOk(ef); }
            await h.addFile(h.pubGrid(), 'a7-ed-add2', {name: `Editor delete ${RUN}`, type: 'Reports', file: F['vdl.pdf'], snap: false});
            r.deleteDialog = await h.deleteFile(h.pubGrid(), `Editor delete ${RUN}`, true);
            r.vdlAfter = h.groups(await h.gridInfo(h.pubGrid()));
            await h.snap('a7-ed-vdl-after');
            await signIn(page, B.users.mg.username, {contextPath: B.path});
            const grid = await openTab(B.path);
            r.mgTab = h.groups(await h.gridInfo(grid));
            await h.snap('a7-mg-tab');
            // The Roles entry's "Permit changes to Settings" box on B (unticked) and on A (install default).
            const readPermit = async (ctx, label) => {
                await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
                await idle(page);
                await page.getByRole('tab', {name: 'Roles', exact: true}).click();
                await idle(page);
                const gridR = page.locator('[id^="component-grid-settings-roles-usergroupgrid"]').first();
                await gridR.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
                const roleName = app.name === 'omp' ? 'Press editor' : 'Journal editor';
                const row2 = page.getByRole('row').filter({has: page.getByText(roleName, {exact: true})}).first();
                await row2.getByRole('link', {name: 'Settings'}).first().click();
                await page.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
                await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: 30000});
                await idle(page);
                const box = form.locator('input[name="permitSettings"]');
                const out = {present: await box.count(), checked: (await box.count()) ? await box.isChecked() : null, disabled: (await box.count()) ? await box.isDisabled() : null,
                    label: flat(await form.locator('label:has(input[name="permitSettings"]), label[for]').filter({hasText: /Settings/}).first().innerText().catch(() => null), 120)};
                await h.snap(`${label}-role-edit`);
                return out;
            };
            await signIn(page, B.users.mg.username, {contextPath: B.path});
            r.permitB = await readPermit(B.path, 'a7-B');
            await signIn(page, U('mg'), {contextPath: A.path});
            r.permitA = await readPermit(A.path, 'a7-A');
            h.put('a7', r);
        });

        // =====================================================================
        // Actors rows 3 and 6 via "Library Files": the composer's "Download".
        if (on('composer')) await h.sect('composer', async () => {
            const who = ops ? ['se', 'mg'] : ['se'];
            for (const k of who) await h.sect(`composer-${k}`, async () => {
                await signIn(page, U(k), {contextPath: A.path});
                await h.openWf(A.path, A.S1.submissionId, k);
                const buttons = await page.locator('[role="dialog"]:visible button').allInnerTexts();
                const dec = page.getByRole('button', {name: ops ? /^Decline/ : /^Send To Production$/}).first();
                const r = {buttons: buttons.map((b) => b.trim()).filter(Boolean).slice(0, 30), decision: await dec.count()};
                if (!r.decision) { h.put(`composer:${k}`, r); await h.snap(`composer-${k}-no-decision`); return; }
                r.decisionLabel = (await dec.innerText()).trim();
                await dec.click();
                await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
                await idle(page);
                const attach = page.locator('.tox-tbtn:visible').filter({hasText: /^Attach Files$/}).first();
                await attach.waitFor({timeout: 30000});
                await attach.click();
                const win = page.getByRole('dialog', {name: 'Attach Files', exact: true});
                await win.waitFor({timeout: 15000});
                await win.getByRole('button', {name: 'Attach Library Files', exact: true}).first().click();
                const lwin = page.getByRole('dialog', {name: 'Library Files', exact: true});
                await lwin.getByRole('link', {name: 'Download'}).first().waitFor({timeout: 15000}).catch(() => {});
                await idle(page);
                r.list = flat(await lwin.innerText(), 600);
                await h.snap(`composer-${k}-library-files`);
                const item = (name) => lwin.locator('.selectSubmissionFileListItem').filter({hasText: name}).first().getByRole('link', {name: 'Download'}).first();
                await loc(page, '"Library Files" item "Download"', item('Seeded notes'));
                r.slHref = await item('Seeded notes').getAttribute('href').catch(() => null);
                r.sl = await h.download(item('Seeded notes'), `composer-${k}-sl`);
                r.pl = await h.download(item('Seeded public guide'), `composer-${k}-pl`);
                h.put(`composer:${k}`, {...r, slHref: r.slHref && r.slHref.replace(/^.*\/index\.php/, '')});
                dialogs.length = 0;
                await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial`)).catch(() => {});
                h.put(`composer-leave:${k}`, [...dialogs]);
            });
        });

        // =====================================================================
        // Settings bullet 1: a role's "Stages", both ends.
        if (on('stages')) await h.sect('stages', async () => {
            await signIn(page, U('mg'), {contextPath: A.path});
            const rolesGrid = async (label) => {
                await page.goto(app.url(`/index.php/${A.path}/en/management/settings/access`));
                await idle(page);
                await page.getByRole('tab', {name: 'Roles', exact: true}).click();
                await idle(page);
                const g = page.locator('[id^="component-grid-settings-roles-usergroupgrid"]').first();
                await g.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
                const grid = await g.evaluate((el) => {
                    const heads = [...el.querySelectorAll('thead th')].map((th) => th.innerText.trim());
                    const rows = [...el.querySelectorAll('tr.gridRow')].map((tr) => [...tr.querySelectorAll('td')].map((td) => { const i = td.querySelector('input[type=checkbox]'); return i ? (i.checked ? '[x]' : '[ ]') + (i.disabled ? 'd' : '') : td.innerText.trim().replace(/\s+/g, ' '); }).join(' | '));
                    return {heads, rows};
                }).catch((e) => ({error: String(e.message)}));
                await h.snap(label, {grid});
                return grid;
            };
            const openRoleEdit = async (roleName) => {
                const row = page.getByRole('row').filter({has: page.getByText(roleName, {exact: true})}).first();
                await row.getByRole('link', {name: 'Settings'}).click();
                await page.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const form = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
                await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: 30000});
                await idle(page);
                return form;
            };
            const r = {};
            r.gridBefore = await rolesGrid('stages-grid-before');
            if (!ops) {
                for (const [role, want, key] of [['Copyeditor', true, 'ce'], ['Funding coordinator', false, 'fc']]) {
                    const form = await openRoleEdit(role);
                    const boxes = await form.locator('input[type=checkbox]').evaluateAll((els) => els.map((i) => ({name: i.name, label: ((i.closest('li,label') || {}).innerText || '').trim(), checked: i.checked})));
                    const section = await form.evaluate((f) => {
                        const i = f.querySelector('input[name^="assignedStages"], input[name*="tage"]');
                        const fs2 = i && i.closest('fieldset, .section');
                        return fs2 ? fs2.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 300) : null;
                    });
                    await h.snap(`stages-${key}-form`, {boxes});
                    const cb = form.getByRole('checkbox', {name: 'Submission', exact: true});
                    r[`${key}Form`] = {section, boxes: boxes.filter((b) => b.label && b.label.length < 30).map((b) => `${b.checked ? '[x]' : '[ ]'} ${b.label}`), submissionBox: await cb.count()};
                    await cb.setChecked(want);
                    await form.getByRole('button', {name: 'OK', exact: true}).last().click();
                    await idle(page);
                    await sleep(800);
                }
                r.gridAfter = await rolesGrid('stages-grid-after');
                for (const k of ['ce', 'fc']) await h.sect(`stages-${k}`, async () => {
                    await signIn(page, U(k), {contextPath: A.path});
                    await h.openWf(A.path, A.S1.submissionId, k);
                    await h.openLibrary();
                    r[`${k}Download`] = await h.download(h.subGrid().getByRole('link', {name: 'Seeded notes', exact: true}), `stages-${k}-sl`);
                    if (r[`${k}Download`].kind === 'navigated') await h.snap(`stages-${k}-sl-navigated`);
                });
            }
            h.put('stages', r);
        });
    } catch (e) {
        console.log(`[${app.name} error]`, String(e.stack || e.message).slice(0, 1500));
        await h.snap('error').catch(() => {});
    } finally {
        h.flush();
        await close();
    }
});
