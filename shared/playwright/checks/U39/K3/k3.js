// U39 claim check, chunk K3 — "Library Files" in the email composer and the
// cross-feature pointers checked on their screens
// (docs/specs/U39-submission-and-publisher-libraries.md, lines 10–32, 59,
// 188–199, 204–214, 239–327).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   C — manager mg, editor ed {OJS OMP}, section editor se (Moderator on
//       OPS), a recommend-only section editor sr {OJS OMP}, an unassigned
//       section editor se2, guest editor ge {OJS}, copyeditor ce {OJS OMP},
//       author au, reviewer rv {OJS OMP}, reader rd.
//       Publisher Library: "Journal guide" (Other, Public Access), "PL
//       marketing", "PL permissions", "PL reports", "PL public temp" (Other,
//       Public Access; deleted by the script), OMP "PL contracts".
//       S1 (Submission stage; OPS Production): Library "Author contract"
//       (Permissions), "S1 notes" (Other), "S1 marketing" (Marketing).
//       S2: Library "Other submission file". S3 {OJS OMP}: in review, a
//       completed reviewer, se deciding, sr recommending, Library "S3 review
//       file" (Reports). S4 {OJS OMP}: at Production, se and ce assigned,
//       Library "S4 library file". S5: no Library file.
//   E — an empty journal: manager mg, author au, one submission, no library.
//
//   PROBE_FEATURE=U39 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U39/K3/k3.js
//   PHASES=purpose,controls,public,lists,composer,request,recommend,discussion,reply,roles (default all);
//   REUSE=1 reuses the last seed (seed-<app>.json) — only for phases that do not mutate.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app key]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'purpose,controls,public,lists,composer,request,recommend,discussion,reply,roles';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const on = (p) => PHASES.includes(p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').replace(/[ \t]+/g, ' ').slice(0, n);

const SUB_GRID = 'div[id^="component-grid-files-submissiondocuments-submissiondocumentsfilesgrid"]';
const PUB_GRID = 'div[id^="component-grid-settings-library-libraryfileadmingrid"]';
const TAB_NAME = {ojs: 'Publisher Library', omp: 'Press Library', ops: 'Preprint Server Library'};
const NOACCESS = 'The current role does not have access to this operation.';
const NOSTAGE = "You don't currently have access to that stage of the workflow.";

// Every library file name the script seeds or adds, for the absence reads.
const LIB_NAMES = ['Journal guide', 'PL marketing', 'PL permissions', 'PL reports', 'PL public temp', 'PL contracts',
    'Author contract', 'S1 notes', 'S1 marketing', 'Other submission file', 'S3 review file', 'S4 library file',
    'ed doc', 'se doc', 'au doc', 'ce doc', 'ge doc', 'mg doc'];

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const file = path.join(outDir(), `seed-${app.name}.json`);
    if (REUSE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const ops = app.name === 'ops';
    const omp = app.name === 'omp';
    const ojs = app.name === 'ojs';
    const t = tag('u39k3c');
    const u = (k) => `${t}${k}`;
    const roles = [['mg', 'manager', 'Mona', 'Manager'], ['se', 'sectionEditor', 'Sean', 'Section'], ['se2', 'sectionEditor', 'Sue', 'Unassigned'],
        ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Rex', 'Reader']];
    if (!ops) roles.push(['ed', 'editor', 'Eddie', 'Editor'], ['sr', 'sectionEditor', 'Remy', 'Recommender'], ['ce', 'copyeditor', 'Cora', 'Copy'], ['rv', 'externalReviewer', 'Rita', 'Reviewer']);
    if (ojs) roles.push(['ge', 'guestEditor', 'Gus', 'Guest']);
    const plFiles = [
        {name: 'Journal guide', type: 'Other', publicAccess: true},
        {name: 'PL marketing', type: 'Marketing'},
        {name: 'PL permissions', type: 'Permissions'},
        {name: 'PL reports', type: 'Reports'},
        {name: 'PL public temp', type: 'Other', publicAccess: true},
    ];
    if (omp) plFiles.push({name: 'PL contracts', type: 'Contracts'});
    const CC = await app.api.createContext({tag: t, context: {name: `U39 K3 ${t}`, acronym: 'K3C', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`},
        users: roles.map(([k, role, g, f]) => ({username: u(k), roles: [role], givenName: g, familyName: f})), libraryFiles: plFiles});
    const C = {t, path: CC.path, contextId: CC.contextId, users: Object.fromEntries(roles.map(([k, role]) => [k, u(k)])), libraryFiles: CC.libraryFiles};
    const se = {username: u('se'), role: 'sectionEditor'};
    const s1parts = [se];
    if (ojs) s1parts.push({username: u('ge'), role: 'guestEditor'});
    C.S1 = await app.api.createSubmission({tag: `${t}s1`, context: C.path, submitter: u('au'), title: `K3 S1 ${t}`, participants: s1parts,
        libraryFiles: [{name: 'Author contract', type: 'Permissions'}, {name: 'S1 notes', type: 'Other'}, {name: 'S1 marketing', type: 'Marketing'}]});
    C.S2 = await app.api.createSubmission({tag: `${t}s2`, context: C.path, submitter: u('au'), title: `K3 S2 ${t}`, participants: [se],
        libraryFiles: [{name: 'Other submission file', type: 'Other'}]});
    if (!ops) {
        C.S3 = await app.api.createSubmission({tag: `${t}s3`, context: C.path, submitter: u('au'), title: `K3 S3 ${t}`,
            participants: [se, {username: u('sr'), role: 'sectionEditor', recommendOnly: true}],
            decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u('rv'), status: 'completed'}]}],
            libraryFiles: [{name: 'S3 review file', type: 'Reports'}]});
        C.S4 = await app.api.createSubmission({tag: `${t}s4`, context: C.path, submitter: u('au'), title: `K3 S4 ${t}`,
            participants: [se, {username: u('ce'), role: 'copyeditor'}], decisions: ['skipExternalReview', 'sendToProduction'],
            libraryFiles: [{name: 'S4 library file', type: 'Other'}]});
    }
    C.S5 = await app.api.createSubmission({tag: `${t}s5`, context: C.path, submitter: u('au'), title: `K3 S5 ${t}`, participants: [se]});

    const te = tag('u39k3e');
    const CE = await app.api.createContext({tag: te, context: {name: `U39 K3 ${te}`, acronym: 'K3E', contactName: 'K3 Contact', contactEmail: `${te}contact@mail.test`},
        users: [{username: `${te}mg`, roles: ['manager'], givenName: 'Emma', familyName: 'Manager'}, {username: `${te}au`, roles: ['author'], givenName: 'Eve', familyName: 'Author'}]});
    const E = {t: te, path: CE.path, users: {mg: `${te}mg`, au: `${te}au`}};
    E.S = await app.api.createSubmission({tag: `${te}s`, context: E.path, submitter: `${te}au`, title: `K3 SE ${te}`});
    const S = {C, E};
    fs.writeFileSync(file, JSON.stringify(S, null, 2));
    const brief = (s) => s && {id: s.submissionId, stageId: s.stageId, rounds: (s.reviewRounds || []).map((r) => r.id), lib: (s.libraryFiles || []).map((f) => `${f.id}:${f.name}`)};
    console.log(`[${app.name} seed]`, JSON.stringify({C: C.path, pl: C.libraryFiles.map((f) => `${f.id}:${f.name}`), S1: brief(C.S1), S2: brief(C.S2), S3: brief(C.S3), S4: brief(C.S4), S5: brief(C.S5), E: E.path, ES: brief(E.S)}));
    return S;
}

// ---------------------------------------------------------------------------
// Screen helpers

function helpers(app, ctxBrowser, page) {
    const factsFile = path.join(outDir(), `facts-${app.name}.json`);
    const h = {facts: REUSE && fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {}, dialogs: []};
    h.put = (k, v) => { h.facts[k] = v; console.log(`[${app.name} ${k}]`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 2500)); };
    h.flush = () => fs.writeFileSync(path.join(outDir(), `facts-${app.name}.json`), JSON.stringify(h.facts, null, 2));
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
            console.log(`[${app.name} ${label} ERROR]`, String(e.stack || e.message).slice(0, 1500));
            await h.snap(`error-${label}`).catch(() => {});
        }
        h.flush();
    };
    page.on('dialog', async (d) => {
        h.dialogs.push({type: d.type(), message: d.message()});
        console.log(`[${app.name} BROWSER DIALOG]`, d.type(), d.message());
        await d.accept().catch(() => {});
    });
    h.edUrl = (ctx, id, key) => app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (ctx, id, key) => app.url(`/index.php/${ctx}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.header = () => page.locator('[data-cy="sidemodal-header"]').first();
    h.openWf = async (url) => {
        const resp = await page.goto(url).catch((e) => ({err: String(e)}));
        const ok = await h.header().waitFor({timeout: 20000}).then(() => true).catch(() => false);
        await idle(page);
        if (ok) await h.header().getByRole('button').first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(400);
        return {header: ok, status: resp && resp.status ? resp.status() : null, url: page.url().replace(/^.*\/index\.php/, '')};
    };
    h.headerButtons = async () => (await h.header().getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    h.libBtn = () => page.getByRole('button', {name: 'Library', exact: true});
    h.subGrid = () => page.locator(SUB_GRID).first();
    h.pubGrid = () => page.locator(PUB_GRID).last();
    h.openLibrary = async () => {
        await h.libBtn().first().click();
        await h.subGrid().waitFor({timeout: 30000});
        await idle(page);
        await sleep(300);
        return h.subGrid();
    };
    h.openVDL = async () => {
        await h.subGrid().getByRole('link', {name: 'View Document Library', exact: true}).first().click();
        await page.locator(PUB_GRID).first().waitFor({timeout: 30000});
        await idle(page);
        await sleep(300);
        return h.pubGrid();
    };
    h.closeDialog = async (name) => {
        const d = page.getByRole('dialog', {name, exact: true}).last();
        const c = d.getByRole('button', {name: 'Close', exact: true}).first();
        if (await c.count()) { await c.click(); await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {}); await idle(page); return true; }
        return false;
    };
    h.gridInfo = async (grid) => grid.evaluate((g) => {
        const vis = (e) => !!(e && e.getClientRects().length);
        const text = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
        const rows = [];
        for (const tr of g.querySelectorAll('tbody tr')) {
            if (!vis(tr)) continue;
            const dl = tr.querySelector('a.pkp_linkaction_downloadFile');
            const arrow = tr.querySelector('a.show_extras');
            if (dl) rows.push(`${text(dl)}${arrow && vis(arrow) ? ' >' : ''}`);
            else if (!tr.querySelector('.row_actions')) rows.push(`[${text(tr)}]`);
        }
        return {heading: text(g.querySelector('.header h4')), actions: [...g.querySelectorAll('.header a')].filter(vis).map(text), rows};
    });
    // Press a link that downloads, in place or in a new tab.
    h.download = async (link, label) => {
        const before = page.url();
        const responses = [];
        const onResp = (r) => { if (/download-library-file|downloadLibraryFile|libraryFiles/.test(r.url())) responses.push({url: r.url().replace(/^.*\/index\.php/, ''), status: r.status(), type: r.headers()['content-type'], disp: r.headers()['content-disposition']}); };
        ctxBrowser.on('response', onResp);
        const dl = page.waitForEvent('download', {timeout: 20000}).then((d) => ({d})).catch(() => null);
        const nav = page.waitForEvent('framenavigated', {timeout: 20000}).then((f) => (f === page.mainFrame() ? {nav: f.url()} : null)).catch(() => null);
        const pop = ctxBrowser.waitForEvent('page', {timeout: 20000}).then((p) => ({p})).catch(() => null);
        await link.click();
        let out;
        const saveDl = async (d, where) => {
            const p = path.join(outDir(), 'downloads', `${app.name}-${label}-${d.suggestedFilename()}`);
            fs.mkdirSync(path.dirname(p), {recursive: true});
            await d.saveAs(p).catch(() => {});
            return {kind: 'download', where, name: d.suggestedFilename(), size: fs.existsSync(p) ? fs.statSync(p).size : null, stayed: page.url() === before};
        };
        const r = await Promise.race([dl, nav.then(async (n) => { if (!n) return null; await sleep(1500); return n; }), pop]);
        if (r && r.d) out = await saveDl(r.d, 'page');
        else if (r && r.p) {
            const p = r.p;
            const d2 = await Promise.race([p.waitForEvent('download', {timeout: 8000}).then((d) => ({d})).catch(() => null), p.waitForLoadState('domcontentloaded', {timeout: 8000}).then(() => sleep(1500)).then(() => null).catch(() => null)]);
            if (d2 && d2.d) out = await saveDl(d2.d, 'new tab');
            else out = {kind: 'popup', url: p.url().replace(/^.*\/index\.php/, ''), text: flat(await p.locator('body').innerText({timeout: 5000}).catch(() => null), 300)};
            await p.close().catch(() => {});
        } else {
            const d2 = await Promise.race([dl, sleep(3000).then(() => null)]);
            if (d2 && d2.d) out = await saveDl(d2.d, 'page');
            else out = {kind: page.url() === before ? 'none' : 'navigated', url: page.url().replace(/^.*\/index\.php/, ''), text: flat(await page.locator('body').innerText().catch(() => null), 300)};
        }
        ctxBrowser.off('response', onResp);
        out.responses = responses;
        if (out.kind === 'download' && out.where === 'page') await sleep(2100); // the link's 2 s timer (K2-6)
        h.put(`download:${label}`, out);
        return out;
    };
    // The library file form on top ("Add a file" or "Edit").
    h.form = () => page.locator('form').filter({has: page.locator('input[name^="libraryFileName"]')}).last();
    h.addFile = async (grid, {name, type, file}) => {
        await grid.getByRole('link', {name: 'Add a file', exact: true}).first().click();
        const f = h.form();
        await f.waitFor({timeout: 30000});
        await idle(page);
        await f.locator('input[name^="libraryFileName"]').first().fill(name);
        await f.locator('select[name="fileType"]').selectOption({label: type});
        await f.locator('input[type="file"]').first().setInputFiles(file);
        await page.waitForFunction(() => [...document.querySelectorAll('form input[name="temporaryFileId"]')].some((i) => i.value), null, {timeout: 30000});
        await f.getByRole('button', {name: 'OK', exact: true}).click();
        const closed = await f.waitFor({state: 'detached', timeout: 30000}).then(() => true).catch(() => false);
        await idle(page);
        await sleep(500);
        return closed;
    };
    h.rowLinks = async (grid, name) => {
        const row = grid.locator('tr.gridRow').filter({has: page.getByRole('link', {name, exact: true})}).first();
        await row.locator('a.show_extras').first().click();
        await sleep(400);
        const ctl = row.locator('xpath=following-sibling::tr[1]');
        return {edit: ctl.getByRole('link', {name: 'Edit', exact: true}), del: ctl.getByRole('link', {name: 'Delete', exact: true})};
    };
    // ---- the email composer's "Attach Files" ----
    h.attachButton = () => page.locator('.tox-tbtn:visible').filter({hasText: /^Attach Files$/}).first();
    h.composerReady = async () => {
        await h.attachButton().waitFor({timeout: 30000});
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: 30000}).catch(() => {});
        await idle(page);
    };
    h.attachWin = () => page.getByRole('dialog', {name: 'Attach Files', exact: true}).last();
    h.openAttach = async (label) => {
        await h.attachButton().click();
        const win = h.attachWin();
        await win.waitFor({timeout: 30000});
        await win.locator('.fileAttacher h2').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const sources = await win.locator('.fileAttacher').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s*\n+\s*/g, ' | ').trim()));
        await h.snap(`${label}-attach-files`);
        return sources;
    };
    h.libWin = () => page.getByRole('dialog', {name: 'Library Files', exact: true}).last();
    h.openLibraryFiles = async (label) => {
        await h.attachWin().getByRole('button', {name: 'Attach Library Files', exact: true}).first().click();
        const lw = h.libWin();
        await lw.waitFor({timeout: 30000});
        await lw.getByRole('button', {name: 'Back', exact: true}).waitFor({timeout: 30000}).catch(() => {});
        await lw.locator('.selectSubmissionFileListItem, :text("No items found.")').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const items = await lw.locator('.selectSubmissionFileListItem').evaluateAll((els) => els.map((e) => {
            const cb = e.querySelector('input[type=checkbox]');
            const a = e.querySelector('a');
            return {text: e.innerText.replace(/\s*\n+\s*/g, ' | ').trim(), href: a ? a.getAttribute('href').replace(/^.*\/index\.php/, '') : null, target: a ? a.getAttribute('target') : null, checkbox: !!cb};
        }));
        const body = flat(await lw.innerText().catch(() => ''), 3000);
        const s = await h.snap(`${label}-library-files`);
        return {items, body, aria: (s.aria.dialogs.slice(-1)[0] || '').slice(0, 3000)};
    };
    h.libItem = (name) => h.libWin().locator('.selectSubmissionFileListItem').filter({hasText: new RegExp(`(^|\\n|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\n|\\s|$)`)}).first();
    h.attachSelected = async (names) => {
        for (const n of names) await h.libItem(n).locator('input[type=checkbox]').check({force: true});
        await h.libWin().getByRole('button', {name: 'Attach Selected', exact: true}).click();
        await h.libWin().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        return page.locator('.composer__attachment:visible').allInnerTexts();
    };
    // Leave the "Library Files" and "Attach Files" windows: "Back", then the window's "Close" (bounded; never throws).
    h.closeAttachWindows = async () => {
        const back = page.getByRole('dialog', {name: 'Library Files', exact: true}).getByRole('button', {name: 'Back', exact: true}).last();
        if (await back.isVisible().catch(() => false)) { await back.click({timeout: 5000}).catch(() => {}); await idle(page); }
        const close = h.attachWin().getByRole('button', {name: 'Close', exact: true}).last();
        if (await close.isVisible().catch(() => false)) { await close.click({timeout: 5000}).catch(() => {}); await idle(page); }
        if (await h.attachWin().isVisible().catch(() => false)) { await page.keyboard.press('Escape').catch(() => {}); await idle(page); }
    };
    h.noAccess = (t) => [NOACCESS, NOSTAGE].filter((x) => (t || '').includes(x));
    h.absent = (text) => LIB_NAMES.filter((n) => (text || '').includes(n));
    return h;
}

// Open a decision's email page from the workflow (label a regex on the button).
async function openDecision(h, page, url, label) {
    const wf = await h.openWf(url);
    const buttons = (await page.locator('[role="dialog"]:visible button').allInnerTexts()).map((b) => b.trim()).filter(Boolean);
    const dec = page.getByRole('button', {name: label}).first();
    if (!(await dec.count())) return {wf, buttons, decision: null};
    const decisionLabel = (await dec.innerText()).trim();
    await dec.click();
    await page.waitForURL(/decision/, {timeout: 30000}).catch(() => {});
    await idle(page);
    await h.composerReady();
    return {wf, decisionLabel, url: page.url().replace(/^.*\/index\.php/, '')};
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const ops = app.name === 'ops';
    const ojs = app.name === 'ojs';
    const S = await seed(app);
    const C = S.C;
    const E = S.E;
    const U = (k) => C.users[k];
    const pdfName = ops ? 'preprint.pdf' : 'article.pdf';
    const pdf = path.join(app.root, 'classes/testing/fixtures', pdfName);
    const libId = (list, name) => (list.find((f) => f.name === name) || {}).id;
    const {page, context: ctxBrowser, close} = await launch(app);
    const h = helpers(app, ctxBrowser, page);
    // The submission the role drives adds on: S4 on a journal and a press, S2 on a preprint server.
    const SA = ops ? C.S2 : C.S4;
    const edKey = ops ? 'mg' : 'ed';
    try {
        // =====================================================================
        // Purpose 15–20, pointers 241–245: the tab, "Library" per role, adding, reading the Publisher Library.
        if (on('purpose')) await h.sect('purpose', async () => {
            await signIn(page, U('mg'), {contextPath: C.path});
            await page.goto(app.url(`/index.php/${C.path}/en/management/settings/workflow`));
            await idle(page);
            const tabs = (await page.getByRole('tab').allInnerTexts()).map((x) => x.trim());
            await h.snap('purpose-mg-workflow-settings');
            await page.getByRole('tab', {name: TAB_NAME[app.name], exact: true}).click();
            await page.locator(PUB_GRID).first().waitFor({timeout: 30000});
            await idle(page);
            const tab = await h.gridInfo(page.locator(PUB_GRID).first());
            await h.snap('purpose-mg-publisher-tab');
            h.put('purpose:tab', {h1: flat(await page.locator('main h1').first().innerText().catch(() => null), 80), tabs, tab});
            await loc(page, 'Settings › Workflow library tab', page.getByRole('tab', {name: TAB_NAME[app.name], exact: true}));

            const who = ops ? ['mg', 'se', 'au'] : (ojs ? ['ed', 'se', 'ge', 'ce', 'au'] : ['ed', 'se', 'ce', 'au']);
            for (const k of who) await h.sect(`purpose-${k}`, async () => {
                const sub = (k === 'ge') ? C.S1 : SA;
                await signIn(page, U(k), {contextPath: C.path});
                const wf = await h.openWf(k === 'au' ? h.auUrl(C.path, sub.submissionId) : h.edUrl(C.path, sub.submissionId));
                const header = await h.headerButtons();
                const s0 = await h.snap(`purpose-${k}-wf`);
                const r = {wf, header, noAccess: h.noAccess(s0.text.dialog), library: await h.libBtn().count()};
                if (!r.library) { h.put(`purpose:${k}`, r); return; }
                const grid = await h.openLibrary();
                r.before = await h.gridInfo(grid);
                r.addClosed = await h.addFile(h.subGrid(), {name: `${k} doc`, type: 'Other', file: pdf});
                r.after = await h.gridInfo(h.subGrid());
                await h.snap(`purpose-${k}-library-added`);
                const vdl = await h.openVDL();
                r.vdl = await h.gridInfo(vdl);
                await h.snap(`purpose-${k}-vdl`);
                r.guide = await h.download(vdl.getByRole('link', {name: 'Journal guide', exact: true}), `purpose-${k}-guide`);
                await h.closeDialog('View Document Library');
                await h.closeDialog('Submission Library');
                h.put(`purpose:${k}`, r);
            });
            // The pointer to U24 Rule 1b (241–243): an assigned Copyeditor on the Production entry.
            if (!ops) await h.sect('purpose-ce-production', async () => {
                await signIn(page, U('ce'), {contextPath: C.path});
                const wf = await h.openWf(h.edUrl(C.path, C.S4.submissionId, 'workflow_5'));
                const s = await h.snap('purpose-ce-production-entry');
                h.put('purpose:ce-production', {wf, header: await h.headerButtons(), noAccess: h.noAccess(s.text.dialog), text: flat(s.text.dialog, 600)});
            });
        });

        // =====================================================================
        // Purpose 17 (exclusive) and 258–260: who is not "working on a submission".
        if (on('controls')) await h.sect('controls', async () => {
            const probes = [['se2', C.S1, 'editorial'], ['rd', C.S1, 'editorial'], ['rd', C.S1, 'author']];
            if (!ops) probes.push(['ce', C.S1, 'editorial'], ['rv', C.S3, 'editorial'], ['rv', C.S3, 'author'], ['rv', C.S3, 'reviewer']);
            for (const [k, sub, kind] of probes) await h.sect(`controls-${k}-${kind}`, async () => {
                await signIn(page, U(k), {contextPath: C.path});
                const url = kind === 'reviewer' ? app.url(`/index.php/${C.path}/en/reviewer/submission/${sub.submissionId}`)
                    : kind === 'author' ? h.auUrl(C.path, sub.submissionId) : h.edUrl(C.path, sub.submissionId);
                const wf = await h.openWf(url);
                await idle(page);
                const s = await h.snap(`controls-${k}-${kind}`);
                h.put(`controls:${k}-${kind}`, {wf, library: await h.libBtn().count(), vdl: await page.getByText('View Document Library').count(),
                    page: flat(s.text.dialog || s.text.main, 400)});
            });
        });

        // =====================================================================
        // Purpose 21–22, Side effects 210–212: the public address, signed out.
        if (on('public')) await h.sect('public', async () => {
            await signOut(page).catch(() => {});
            const pub = (id) => app.url(`/index.php/${C.path}/libraryFiles/downloadPublic/${id}`);
            for (const name of ['Journal guide', 'PL reports']) {
                const id = libId(C.libraryFiles, name);
                const got = {};
                const resp = page.waitForResponse((r) => r.url().includes(`downloadPublic/${id}`), {timeout: 20000}).catch(() => null);
                const dl = page.waitForEvent('download', {timeout: 8000}).catch(() => null);
                await page.goto(pub(id)).catch((e) => { got.gotoError = String(e.message).split('\n')[0]; });
                const r = await resp;
                if (r) Object.assign(got, {status: r.status(), type: r.headers()['content-type'], disp: r.headers()['content-disposition']});
                const d = await dl;
                if (d) got.download = d.suggestedFilename();
                else { got.text = flat(await page.locator('body').innerText().catch(() => null), 200); await h.snap(`public-${name.replace(/\s+/g, '-')}`); }
                h.put(`public:${name}`, got);
            }
        });

        // =====================================================================
        // Scope 31–32, pointer 254–255: no stage's file list shows a library file.
        if (on('lists')) await h.sect('lists', async () => {
            await signIn(page, U(edKey), {contextPath: C.path});
            const views = ops ? [['S1', C.S1, null], ['S2', C.S2, null]]
                : [['S4-submission', C.S4, 'workflow_1'], ['S4-copyediting', C.S4, 'workflow_4'], ['S4-production', C.S4, 'workflow_5'],
                    ['S3-review', C.S3, `workflow_3_${C.S3.reviewRounds[0].id}`], ['S1-submission', C.S1, 'workflow_1']];
            for (const [label, sub, key] of views) {
                const wf = await h.openWf(h.edUrl(C.path, sub.submissionId, key));
                await sleep(800);
                await idle(page);
                const s = await h.snap(`lists-${label}`);
                h.put(`lists:${label}`, {wf, libraryNamesShown: h.absent(s.text.dialog), files: flat(s.text.dialog, 900)});
            }
            if (ops) {
                // A preprint's galleys: the file behind a galley is chosen in the galley's upload wizard.
                const wf = await h.openWf(h.edUrl(C.path, C.S1.submissionId));
                const gl = page.getByRole('link', {name: 'Galleys', exact: true}).or(page.getByRole('button', {name: 'Galleys', exact: true})).first();
                if (await gl.count()) { await gl.click(); await idle(page); await sleep(600); }
                const s = await h.snap('lists-S1-galleys');
                h.put('lists:S1-galleys', {wf, libraryNamesShown: h.absent(s.text.dialog), text: flat(s.text.dialog, 700)});
            }
            // The Author's view of the same submission.
            await signIn(page, U('au'), {contextPath: C.path});
            const wf = await h.openWf(h.auUrl(C.path, SA.submissionId));
            await sleep(800);
            const s = await h.snap('lists-author');
            h.put('lists:author', {wf, libraryNamesShown: h.absent(s.text.dialog), text: flat(s.text.dialog, 700)});
        });

        // =====================================================================
        // Rule 11 (189–198), Actors row 8 (59), pointers 246–248, Side effects 206–208 and 213–214, 261–262.
        if (on('composer')) await h.sect('composer', async () => {
            const decLabel = /^Decline Submission$/;
            const libs = {};
            // (1) the deciding Section Editor (Moderator) on S1, before any change.
            const firstReaders = ops ? ['se', 'mg'] : ['se', 'ed'];
            for (const k of firstReaders) await h.sect(`composer-${k}`, async () => {
                await signIn(page, U(k), {contextPath: C.path});
                const d = await openDecision(h, page, h.edUrl(C.path, C.S1.submissionId), decLabel);
                const r = {decision: d};
                if (!d.decisionLabel) { await h.snap(`composer-${k}-no-decision`); h.put(`composer:${k}`, r); return; }
                r.sources = await h.openAttach(`composer-${k}`);
                r.lib = await h.openLibraryFiles(`composer-${k}`);
                libs[k] = r.lib.items;
                await loc(page, '"Library Files" window item', h.libWin().locator('.selectSubmissionFileListItem'));
                await loc(page, '"Library Files" item "Download" link', h.libItem('Author contract').getByRole('link', {name: 'Download'}));
                r.dlSub = await h.download(h.libItem('Author contract').getByRole('link', {name: 'Download'}), `composer-${k}-author-contract`);
                r.dlPub = await h.download(h.libItem('Journal guide').getByRole('link', {name: 'Download'}), `composer-${k}-journal-guide`);
                if (k === 'se') {
                    // Attach, then leave the page with the chip in place (the sweep's "leave with something changed").
                    r.chips = await h.attachSelected(['Author contract']);
                    await h.snap('composer-se-chip');
                    h.dialogs.length = 0;
                    await page.goto(app.url(`/index.php/${C.path}/en/dashboard/editorial`)).catch(() => {});
                    await idle(page);
                    r.leaveDialogs = [...h.dialogs];
                } else {
                    await h.closeAttachWindows();
                }
                h.put(`composer:${k}`, r);
            });
            const notesHref = ((libs.se || libs.mg || []).find((i) => /S1 notes/.test(i.text)) || {}).href;

            // (2) changes: rename "Author contract", delete "S1 notes" (Submission Library), delete "PL public temp" (Publisher Library).
            await h.sect('composer-changes', async () => {
                await signIn(page, U(edKey), {contextPath: C.path});
                await h.openWf(h.edUrl(C.path, C.S1.submissionId));
                const grid = await h.openLibrary();
                const r = {before: await h.gridInfo(grid)};
                let links = await h.rowLinks(grid, 'Author contract');
                await links.edit.click();
                const f = h.form();
                await f.waitFor({timeout: 30000});
                await idle(page);
                await f.locator('input[name^="libraryFileName"]').first().fill('Author contract v2');
                await f.getByRole('button', {name: 'OK', exact: true}).click();
                await f.waitFor({state: 'detached', timeout: 30000}).catch(() => {});
                await idle(page);
                await sleep(500);
                links = await h.rowLinks(h.subGrid(), 'S1 notes');
                await links.del.click();
                const conf = page.locator('[role="dialog"]:visible, .pkp_modal_confirmation:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
                await conf.waitFor({timeout: 15000});
                await conf.getByRole('button', {name: 'OK', exact: true}).or(conf.getByRole('link', {name: 'OK', exact: true})).first().click();
                await idle(page);
                await sleep(800);
                r.after = await h.gridInfo(h.subGrid());
                await h.snap('composer-changes-library');
                await h.closeDialog('Submission Library');
                // Publisher Library: "PL public temp" through "View Document Library" is refused to non-managers; delete on the tab as the manager.
                await signIn(page, U('mg'), {contextPath: C.path});
                const tempId = libId(C.libraryFiles, 'PL public temp');
                const pubUrl = app.url(`/index.php/${C.path}/libraryFiles/downloadPublic/${tempId}`);
                await page.goto(app.url(`/index.php/${C.path}/en/management/settings/workflow`));
                await idle(page);
                await page.getByRole('tab', {name: TAB_NAME[app.name], exact: true}).click();
                const tg = page.locator(PUB_GRID).first();
                await tg.waitFor({timeout: 30000});
                await idle(page);
                const tl = await h.rowLinks(tg, 'PL public temp');
                await tl.del.click();
                const conf2 = page.locator('[role="dialog"]:visible, .pkp_modal_confirmation:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
                await conf2.waitFor({timeout: 15000});
                await conf2.getByRole('button', {name: 'OK', exact: true}).or(conf2.getByRole('link', {name: 'OK', exact: true})).first().click();
                await idle(page);
                await sleep(800);
                r.tabAfter = await h.gridInfo(page.locator(PUB_GRID).first());
                await h.snap('composer-changes-tab');
                // The deleted files' addresses, typed.
                await signOut(page).catch(() => {});
                const got = {};
                const resp = page.waitForResponse((x) => x.url().includes(`downloadPublic/${tempId}`), {timeout: 15000}).catch(() => null);
                await page.goto(pubUrl).catch((e) => { got.gotoError = String(e.message).split('\n')[0]; });
                const rr = await resp;
                if (rr) got.status = rr.status();
                got.text = flat(await page.locator('body').innerText().catch(() => null), 200);
                r.tempPublicAfter = got;
                await h.snap('composer-changes-temp-public-after');
                if (notesHref) {
                    await signIn(page, U(edKey), {contextPath: C.path});
                    const g2 = {};
                    const dl = page.waitForEvent('download', {timeout: 8000}).catch(() => null);
                    const rsp = page.waitForResponse((x) => x.url().includes('libraryFileId='), {timeout: 15000}).catch(() => null);
                    await page.goto(app.url(`/index.php${notesHref}`)).catch((e) => { g2.gotoError = String(e.message).split('\n')[0]; });
                    const d = await dl;
                    if (d) g2.download = d.suggestedFilename(); else g2.text = flat(await page.locator('body').innerText().catch(() => null), 200);
                    const rr2 = await rsp;
                    if (rr2) Object.assign(g2, {status: rr2.status(), type: rr2.headers()['content-type'], length: (await rr2.body().catch(() => Buffer.from(''))).length});
                    r.notesHrefAfter = {href: notesHref, ...g2};
                    await h.snap('composer-changes-notes-href-after');
                }
                h.put('composer:changes', r);
            });

            // (3) the deciding editor after the changes: the list, attaching, recording; the email.
            await h.sect('composer-record', async () => {
                await signIn(page, U(edKey), {contextPath: C.path});
                const d = await openDecision(h, page, h.edUrl(C.path, C.S1.submissionId), decLabel);
                const r = {decision: d};
                r.sources = await h.openAttach('composer-record');
                r.lib = await h.openLibraryFiles('composer-record');
                r.chips = await h.attachSelected(['Author contract v2', 'Journal guide']);
                await h.snap('composer-record-chips');
                const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
                await rec.click();
                const done = page.getByRole('dialog', {name: 'Submission Declined', exact: true});
                await done.waitFor({timeout: 60000}).catch(() => {});
                await idle(page);
                const s = await h.snap('composer-record-done');
                r.done = flat(s.text.dialog, 400);
                const to = `${U('au')}@mail.test`;
                const m = await app.mail.find({to, contains: `K3 S1 ${C.t}`, timeoutMs: 30000}).catch((e) => ({error: String(e.message)}));
                if (m && m.ID) {
                    const full = await app.mail.fullMessage(m.ID);
                    r.mail = {subject: full.Subject, to: (full.To || []).map((x) => x.Address), attachments: (full.Attachments || []).map((a) => ({name: a.FileName, type: a.ContentType, size: a.Size}))};
                } else r.mail = m;
                // Everything the author's and section editor's inboxes hold for this submission (Rule 12 / 213–214: nothing else sent).
                r.inbox = {};
                for (const k of ['au', 'se', 'ed', 'mg']) {
                    if (!U(k)) continue;
                    const list = await app.mail._search({to: `${U(k)}@mail.test`}).catch(() => null);
                    r.inbox[k] = list && list.messages ? list.messages.map((x) => x.Subject) : null;
                }
                h.put('composer:record', r);
            });

            // (4) the Activity Log of S1 after adding, renaming, deleting library files (261–262).
            await h.sect('composer-activity', async () => {
                await signIn(page, U(edKey), {contextPath: C.path});
                await h.openWf(h.edUrl(C.path, C.S1.submissionId));
                await page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.locator('table tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                const rows = (await dlg.locator('table tbody tr').allInnerTexts().catch(() => [])).map((x) => flat(x, 300));
                await h.snap('composer-activity-log');
                h.put('composer:activity', {rows, libraryMentions: rows.filter((x) => /librar|Author contract|S1 notes|PL public temp/i.test(x))});
            });

            // (5) the other ends: a submission with no Library file (S5), an empty journal (E).
            await h.sect('composer-s5', async () => {
                await signIn(page, U(edKey), {contextPath: C.path});
                const d = await openDecision(h, page, h.edUrl(C.path, C.S5.submissionId), decLabel);
                if (!d.decisionLabel) { h.put('composer:s5', d); return; }
                await h.openAttach('composer-s5');
                h.put('composer:s5', {decision: d, lib: await h.openLibraryFiles('composer-s5')});
                await h.closeAttachWindows();
            });
            await h.sect('composer-empty', async () => {
                await signIn(page, E.users.mg, {contextPath: E.path});
                const d = await openDecision(h, page, h.edUrl(E.path, E.S.submissionId), decLabel);
                if (!d.decisionLabel) { h.put('composer:empty', d); return; }
                await h.openAttach('composer-empty');
                h.put('composer:empty', {decision: d, lib: await h.openLibraryFiles('composer-empty')});
                await h.closeAttachWindows();
            });
        });

        // =====================================================================
        // Actors row 8 (59), pointer 249–251: the "Request Author Response" page {OJS}; controls on OMP and OPS.
        if (on('request')) await h.sect('request', async () => {
            const round = C.S3 ? C.S3.reviewRounds[0].id : 1;
            const sid = C.S3 ? C.S3.submissionId : C.S1.submissionId;
            const url = app.url(`/index.php/${C.path}/en/reviewResponse/requestAuthorResponse?stageId=3&reviewRoundId=${round}&submissionId=${sid}`);
            const who = ojs ? ['ed', 'se'] : ['mg'];
            for (const k of who) await h.sect(`request-${k}`, async () => {
                await signIn(page, U(k), {contextPath: C.path});
                const r = {};
                const resp = await page.goto(url).catch((e) => ({err: String(e)}));
                r.status = resp && resp.status ? resp.status() : resp;
                await idle(page);
                const heading = page.getByRole('heading', {name: 'Request Author Response', level: 1});
                r.heading = await heading.waitFor({timeout: 20000}).then(() => true).catch(() => false);
                const s = await h.snap(`request-${k}-page`);
                r.page = flat(s.text.main, 500);
                if (!r.heading) { h.put(`request:${k}`, r); return; }
                await h.composerReady();
                r.sources = await h.openAttach(`request-${k}`);
                r.lib = await h.openLibraryFiles(`request-${k}`);
                if (k === 'ed') r.dl = await h.download(h.libItem('S3 review file').getByRole('link', {name: 'Download'}), `request-${k}-s3-file`);
                await h.closeAttachWindows();
                h.put(`request:${k}`, r);
            });
        });

        // =====================================================================
        // Actors row 8 (59): a recommending editor's "Notify Editors" page; the attached library file afterwards.
        if (on('recommend') && !ops) await h.sect('recommend', async () => {
            await signIn(page, U('sr'), {contextPath: C.path});
            const key = `workflow_3_${C.S3.reviewRounds[0].id}`;
            const d = await openDecision(h, page, h.edUrl(C.path, C.S3.submissionId, key), /^Recommend Accept$/);
            const r = {decision: d};
            if (!d.decisionLabel) { await h.snap('recommend-sr-no-button'); h.put('recommend', r); return; }
            r.sources = await h.openAttach('recommend-sr');
            r.lib = await h.openLibraryFiles('recommend-sr');
            r.chips = await h.attachSelected(['S3 review file']);
            await h.snap('recommend-sr-chips');
            await page.getByRole('button', {name: 'Record Decision', exact: true}).click();
            const done = page.getByRole('dialog', {name: 'Recommendation Submitted', exact: true});
            r.done = await done.waitFor({timeout: 60000}).then(() => true).catch(() => false);
            const s = await h.snap('recommend-sr-done');
            r.doneText = flat(s.text.dialog, 300);
            const m = await app.mail.find({to: `${U('se')}@mail.test`, contains: `K3 S3 ${C.t}`, timeoutMs: 30000}).catch((e) => ({error: String(e.message)}));
            if (m && m.ID) {
                const full = await app.mail.fullMessage(m.ID);
                r.mail = {subject: full.Subject, attachments: (full.Attachments || []).map((a) => ({name: a.FileName, size: a.Size}))};
            } else r.mail = m;
            // The deciding Section Editor opens the review stage: the recommendation's discussion and its file.
            await signIn(page, U('se'), {contextPath: C.path});
            await h.openWf(h.edUrl(C.path, C.S3.submissionId, key));
            await sleep(800);
            const s2 = await h.snap('recommend-se-review');
            r.review = flat(s2.text.dialog, 1500);
            const item = page.locator('[data-cy="discussion-manager"] span[id^="discussion_name_"]').first();
            if (await item.count()) {
                r.itemName = (await item.innerText()).trim();
                await item.click();
                await idle(page);
                await sleep(1000);
                const s3 = await h.snap('recommend-se-discussion');
                r.discussion = flat(s3.text.dialog, 1500);
                r.libraryNamesInDiscussion = h.absent(s3.text.dialog);
            }
            h.put('recommend', r);
        });

        // =====================================================================
        // Rule 11 (197–198), pointer 252–253: a discussion's "Attach Files".
        if (on('discussion')) await h.sect('discussion', async () => {
            await signIn(page, U(edKey), {contextPath: C.path});
            await h.openWf(h.edUrl(C.path, C.S5.submissionId));
            await sleep(600);
            const panel = page.locator('[data-cy="discussion-manager"]').first();
            await panel.waitFor({timeout: 30000});
            const r = {panel: flat(await panel.locator('h3').first().innerText().catch(() => null), 80)};
            await panel.locator('button').filter({hasText: /^\s*Add\s*$/}).first().click();
            const win = page.getByRole('dialog').filter({has: page.locator('input[name="title"]')}).last();
            await win.waitFor({timeout: 30000});
            await idle(page);
            await sleep(500);
            await h.snap('discussion-add-window');
            await win.locator('input[name="title"]').fill('K3 unsaved name');
            await win.getByRole('button', {name: 'Attach Files'}).first().click();
            const aw = page.getByRole('dialog', {name: 'Attach Files', exact: true}).last();
            await aw.waitFor({timeout: 30000});
            await idle(page);
            r.sources = await aw.locator('.fileAttacher').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s*\n+\s*/g, ' | ').trim()));
            r.headings = (await aw.getByRole('heading').allInnerTexts()).map((x) => x.trim());
            await h.snap('discussion-attach-files');
            await aw.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await idle(page);
            // Leave the window with a name typed.
            h.dialogs.length = 0;
            await win.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
            await sleep(800);
            const s = await h.snap('discussion-cancel-typed');
            r.cancel = {browserDialogs: [...h.dialogs], dialog: flat(s.text.dialog, 300)};
            const warn = page.getByRole('dialog').filter({hasText: 'The data on this form has changed.'}).last();
            if (await warn.isVisible().catch(() => false)) {
                await warn.getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
                await idle(page);
                await sleep(600);
                r.afterYes = {windowOpen: await win.isVisible().catch(() => false), items: flat(await panel.innerText().catch(() => ''), 400)};
            }
            h.put('discussion', r);
        });
        // =====================================================================
        // Rule 11 (197–198): a reply's "Attach Files" in an existing discussion (the recommendation's, S3) {OJS OMP}.
        if (on('reply') && !ops) await h.sect('reply', async () => {
            await signIn(page, U('se'), {contextPath: C.path});
            await h.openWf(h.edUrl(C.path, C.S3.submissionId, `workflow_3_${C.S3.reviewRounds[0].id}`));
            await sleep(800);
            const item = page.locator('[data-cy="discussion-manager"] span[id^="discussion_name_"]').first();
            const r = {item: await item.count()};
            if (!r.item) { h.put('reply', r); return; }
            r.name = (await item.innerText()).trim();
            await item.click();
            const dw = page.getByRole('dialog', {name: r.name, exact: true}).last();
            await dw.waitFor({timeout: 30000});
            await idle(page);
            const addMsg = dw.getByRole('button', {name: 'Add New Message', exact: true});
            // The button greys once the box is open (U37 note u); a press before the window's scripts attach does nothing, so retry while enabled.
            for (let i = 0; i < 4 && await addMsg.isEnabled().catch(() => false); i++) {
                await addMsg.click({timeout: 5000}).catch(() => {});
                await sleep(1500);
            }
            r.boxOpened = !(await addMsg.isEnabled().catch(() => true));
            await idle(page);
            await h.snap('reply-box');
            r.attachButtons = await dw.getByRole('button', {name: 'Attach Files'}).count();
            await dw.getByRole('button', {name: 'Attach Files'}).last().click();
            const aw = page.getByRole('dialog', {name: 'Attach Files', exact: true}).last();
            await aw.waitFor({timeout: 30000});
            await idle(page);
            r.sources = await aw.locator('.fileAttacher').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s*\n+\s*/g, ' | ').trim()));
            await h.snap('reply-attach-files');
            h.put('reply', r);
        });

        // =====================================================================
        // Pointer 256–257 (*Roles configuration*): the Roles list and a role's "Edit" window, read only (Cancel).
        if (on('roles')) await h.sect('roles', async () => {
            await signIn(page, U('mg'), {contextPath: C.path});
            await page.goto(app.url(`/index.php/${C.path}/en/management/settings/access`));
            await idle(page);
            await page.getByRole('tab', {name: 'Roles', exact: true}).click();
            await idle(page);
            const g = page.locator('[id^="component-grid-settings-roles-usergroupgrid"]').first();
            await g.locator('tr.gridRow').first().waitFor({timeout: 20000});
            const heads = await g.locator('thead th').allInnerTexts();
            await h.snap('roles-grid');
            const r = {heads: heads.map((x) => x.trim())};
            // Which role rows carry the row arrow ("Settings") that leads to "Edit".
            r.arrows = await g.locator('tr.gridRow').evaluateAll((trs) => trs.map((tr) => `${(tr.querySelector('td') || tr).innerText.trim().split('\n').pop()}: ${tr.querySelector('a.show_extras') ? 'arrow' : 'no arrow'}`));
            for (const roleName of [ops ? 'Moderator' : (ojs ? 'Section editor' : 'Series editor'), ops ? 'Preprint Server manager' : (ojs ? 'Journal editor' : 'Press editor')]) {
                await h.sect(`roles-${roleName}`, async () => {
                    const row = page.getByRole('row').filter({has: page.getByText(roleName, {exact: true})}).first();
                    await row.getByRole('link', {name: 'Settings'}).first().click();
                    await page.getByRole('link', {name: 'Edit', exact: true}).first().click();
                    const form = page.getByRole('dialog').filter({has: page.locator('input[name="permitMetadataEdit"]')}).last();
                    await form.locator('input[name="permitMetadataEdit"]').waitFor({timeout: 30000});
                    await idle(page);
                    const read = await form.evaluate((f) => ({
                        text: f.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 2500),
                        boxes: [...f.querySelectorAll('input[type=checkbox]')].map((i) => ({name: i.name, checked: i.checked, disabled: i.disabled, label: ((i.closest('label') || f.querySelector(`label[for="${i.id}"]`) || {}).innerText || '').trim().slice(0, 80)})),
                    }));
                    await h.snap(`roles-edit-${roleName.replace(/\s+/g, '-')}`);
                    r[roleName] = read;
                    await form.getByRole('link', {name: 'Cancel', exact: true}).or(form.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
                    await idle(page);
                    await page.goto(app.url(`/index.php/${C.path}/en/management/settings/access`));
                    await idle(page);
                    await page.getByRole('tab', {name: 'Roles', exact: true}).click();
                    await idle(page);
                    await g.locator('tr.gridRow').first().waitFor({timeout: 20000});
                });
            }
            h.put('roles', r);
        });
    } catch (e) {
        console.log(`[${app.name} error]`, String(e.stack || e.message).slice(0, 1500));
        await h.snap('error').catch(() => {});
    } finally {
        h.flush();
        await close();
    }
});
