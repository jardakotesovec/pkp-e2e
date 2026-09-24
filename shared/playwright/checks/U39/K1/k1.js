// U39 claim check, chunk K1 — the "Submission Library" window and the shared
// "Add a file" / "Edit" / "Delete" windows, per role, all three apps
// (docs/specs/U39-submission-and-publisher-libraries.md, body lines 34–53,
// 61–129, 140–145, 200–202; register A2, A3, A5, A6; notes td1, td4, td5,
// td7, td8, td9, td10).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   A — one throwaway account per permission level: manager mg, editor ed and
//       production editor pe {OJS OMP}, section editor se (assigned) and su
//       (not assigned), guest editor ge {OJS}, copyeditor ce, layout editor
//       le and funding coordinator fu {OJS OMP}, editorial board member eb
//       {OPS}, author au, reviewer rv {OJS OMP}, reader rd; the site
//       administrator (enrolled by the API). A Publisher Library file.
//       Submissions: S1 (in review on OJS/OMP, a reviewer; a seeded Library
//       file), S2 (Submission stage; its own Library file), SC {OJS OMP}
//       (Copyediting, the layout editor assigned), SP (published), SX
//       (declined).
//   F — two form languages (English, French), for the per-language boxes.
//
//   PROBE_FEATURE=U39 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U39/K1/k1.js
//   PHASES=roles,stages,status,window,add,edit,delete,author,stage,types,readonly,publisher,forms,rule12 (default all);
//   REUSE=1 reuses the last seeded contexts (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'roles,stages,status,window,add,edit,delete,author,stage,types,readonly,publisher,forms,rule12';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').replace(/\s+/g, ' ').slice(0, n);
const SUBGRID = '[id^="component-grid-files-submissiondocuments-submissiondocumentsfilesgrid"]';
const PUBGRID = '[id^="component-grid-settings-library-libraryfileadmingrid"]';
const TABNAME = {ojs: 'Publisher Library', omp: 'Press Library', ops: 'Preprint Server Library'};
const NOACCESS = 'The current role does not have access to this operation.';
const NOSTAGE = "You don't currently have access to that stage of the workflow.";
const noAccessOf = (t) => [NOACCESS, NOSTAGE].filter((x) => (t || '').includes(x));

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const file = path.join(outDir(), `seed-${app.name}.json`);
    if (REUSE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const ops = app.name === 'ops';
    const ojs = app.name === 'ojs';
    const S = {};
    const t = tag('u39k1a');
    const u = (s) => `${t}${s}`;
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Section'},
        {username: u('su'), roles: ['sectionEditor'], givenName: 'Sue', familyName: 'Unassigned'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
        {username: u('rd'), roles: ['reader'], givenName: 'Rita', familyName: 'Reader'},
    ];
    if (!ops) {
        users.push({username: u('ed'), roles: ['editor'], givenName: 'Eddie', familyName: 'Editor'});
        users.push({username: u('pe'), roles: ['productionEditor'], givenName: 'Pat', familyName: 'Production'});
        users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
        users.push({username: u('le'), roles: ['layoutEditor'], givenName: 'Lee', familyName: 'Layout'});
        users.push({username: u('fu'), roles: ['funding'], givenName: 'Fay', familyName: 'Funding'});
        users.push({username: u('rv'), roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'});
    } else {
        users.push({username: u('eb'), roles: ['editorialBoardMember'], givenName: 'Ebba', familyName: 'Board'});
    }
    if (ojs) users.push({username: u('ge'), roles: ['guestEditor'], givenName: 'Gil', familyName: 'Guest'});
    const CA = await app.api.createContext({tag: t, users, libraryFiles: [{name: 'K1 journal file', type: 'Permissions'}]});
    const A = {t, path: CA.path, users: users.map((x) => x.username), journalFiles: CA.libraryFiles};
    const parts = [{username: u('se'), role: 'sectionEditor'}];
    if (ojs) parts.push({username: u('ge'), role: 'guestEditor'});
    if (!ops) for (const [k, r] of [['ce', 'copyeditor'], ['le', 'layoutEditor'], ['fu', 'funding'], ['pe', 'productionEditor']]) parts.push({username: u(k), role: r});
    const withEb = ops ? [...parts, {username: u('eb'), role: 'editorialBoardMember'}] : parts;
    const s1 = {tag: `${t}s1`, context: A.path, submitter: u('au'), title: `K1 S1 ${t}`, participants: withEb,
        libraryFiles: [{name: 'K1 seeded report', type: 'Reports', description: 'Seeded description'}]};
    if (!ops) {
        s1.files = [{file: 'article.pdf'}];
        s1.decisions = [ojs ? 'sendExternalReview' : 'skipInternalReview'];
        s1.reviewRounds = [{reviewers: [{username: u('rv'), status: 'accepted'}]}];
    }
    try {
        A.S1 = await app.api.createSubmission(s1);
        A.ebAssigned = ops;
    } catch (e) {
        console.log(`[${app.name} seed] S1 refused: ${String(e.message || e).slice(0, 400)}`);
        if (!ops) throw e;
        s1.participants = parts; A.S1 = await app.api.createSubmission(s1); A.ebAssigned = false;
    }
    A.S2 = await app.api.createSubmission({tag: `${t}s2`, context: A.path, submitter: u('au'), title: `K1 S2 ${t}`,
        participants: [{username: u('se'), role: 'sectionEditor'}], libraryFiles: [{name: 'K1 other submission file', type: 'Marketing'}]});
    if (!ops) {
        const sc = {tag: `${t}sc`, context: A.path, submitter: u('au'), title: `K1 SC ${t}`, files: [{file: 'article.pdf'}],
            participants: [{username: u('se'), role: 'sectionEditor'}, {username: u('le'), role: 'layoutEditor'}], decisions: ['skipExternalReview']};
        try { A.SC = await app.api.createSubmission(sc); } catch (e) { console.log(`[${app.name} seed] SC refused: ${String(e.message || e).slice(0, 600)}`); }
    }
    const pp = [{username: u('se'), role: 'sectionEditor'}];
    if (!ops) pp.push({username: u('ce'), role: 'copyeditor'});
    else if (A.ebAssigned) pp.push({username: u('eb'), role: 'editorialBoardMember'});
    try {
        const sp = {tag: `${t}sp`, context: A.path, submitter: u('au'), title: `K1 SP ${t}`, participants: pp, published: true};
        if (!ops) sp.files = [{file: 'article.pdf'}];
        A.SP = await app.api.createSubmission(sp);
    } catch (e) { console.log(`[${app.name} seed] SP refused: ${String(e.message || e).slice(0, 600)}`); }
    try {
        A.SX = await app.api.createSubmission({tag: `${t}sx`, context: A.path, submitter: u('au'), title: `K1 SX ${t}`, participants: pp,
            decisions: [ops ? 'decline' : 'initialDecline']});
    } catch (e) { console.log(`[${app.name} seed] SX refused: ${String(e.message || e).slice(0, 600)}`); }
    S.A = A;

    const tf = tag('u39k1f');
    const CF = await app.api.createContext({tag: tf, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
        users: [{username: `${tf}mg`, roles: ['manager'], givenName: 'Fran', familyName: 'Forms'}, {username: `${tf}au`, roles: ['author'], givenName: 'Abe', familyName: 'Author'}]});
    S.F = {t: tf, path: CF.path, SF: await app.api.createSubmission({tag: `${tf}s`, context: CF.path, submitter: `${tf}au`, title: `K1 SF ${tf}`})};
    fs.writeFileSync(file, JSON.stringify(S, null, 2));
    return S;
}

// ---------------------------------------------------------------------------
// Helpers

function helpers(app, page, facts) {
    const h = {facts, phase: ''};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.fact = (k, v) => { facts[`${h.phase}.${k}`] = v; L(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 2500)); };
    h.edUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        h.browserDialogs.push({type: d.type(), message: d.message(), phase: h.phase});
        L('BROWSER DIALOG', d.type(), d.message());
        if (d.type() === 'beforeunload' || h.acceptConfirm) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.downloads = [];
    page.on('download', (d) => { h.downloads.push({url: d.url(), name: d.suggestedFilename()}); L('DOWNLOAD', d.suggestedFilename()); });
    h.header = () => page.locator('[data-cy="sidemodal-header"]').first();
    h.openWf = async (url) => {
        const resp = await page.goto(url).catch((e) => ({err: String(e)}));
        const ok = await h.header().waitFor({timeout: 20000}).then(() => true).catch(() => false);
        await idle(page);
        if (ok) await h.header().getByRole('button').first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(400);
        return {header: ok, status: resp && resp.status ? resp.status() : null, url: page.url()};
    };
    h.headerButtons = async () => (await h.header().getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
    h.libBtn = () => page.getByRole('button', {name: 'Library', exact: true});
    h.libDlg = () => page.getByRole('dialog', {name: 'Submission Library'});
    h.grid = () => h.libDlg().locator(SUBGRID).first();
    h.openLib = async () => {
        await h.libBtn().click();
        await h.libDlg().waitFor({timeout: 30000});
        await h.grid().waitFor({timeout: 30000}).catch(() => L('no Submission Library grid'));
        await idle(page); await sleep(300);
        return h.grid();
    };
    h.closeDlg = async (dlg) => {
        const b = dlg.getByRole('button', {name: 'Close', exact: true}).first();
        h.acceptConfirm = true;
        if (await b.count()) await b.click().catch(() => {});
        await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(600);
        h.acceptConfirm = false;
    };
    h.tasks = async () => (await page.getByRole('button', {name: /^Tasks/}).first().innerText().catch(() => null) || '').replace(/\s+/g, ' ').trim();
    // The grid, as data.
    h.readGrid = async (grid) => grid.evaluate((g) => {
        const clean = (s) => (s || '').split('$(function')[0].replace(/\s+/g, ' ').trim();
        const vis = (e) => !!(e && (e.offsetParent || e.getClientRects().length));
        const heads = [...g.querySelectorAll('thead th')].map((th) => clean(th.innerText));
        const actions = [...g.querySelectorAll(':scope > .header a, :scope > .header button')].filter(vis).map((a) => clean(a.innerText));
        const title = clean((g.querySelector(':scope > .header h4, :scope > .header h3') || {}).innerText || '');
        const groups = [];
        for (const tb of g.querySelectorAll('tbody.category_grid_body')) {
            const trs = [...tb.querySelectorAll(':scope > tr.gridRow')];
            const label = clean(trs[0] ? trs[0].innerText : '');
            const rows = trs.slice(1).map((tr) => {
                const a = tr.querySelector('.gridCellContainer a');
                const icon = a ? [...a.classList].filter((c) => c.startsWith('pkp_linkaction_icon_')).join(' ') : null;
                return {id: tr.id.replace(/^.*-row-/, ''), name: clean(a ? a.innerText : tr.innerText), icon, arrow: !!tr.querySelector('a.show_extras, a.hide_extras'), href: a ? a.getAttribute('href') : null};
            });
            const ph = document.getElementById(`${tb.id}-emptyPlaceholder`);
            groups.push({label, rows: rows.map((r) => ({...r})), empty: ph && vis(ph) ? clean(ph.innerText) : null});
        }
        return {title, heads, actions, groups, text: clean(g.innerText).slice(0, 1500)};
    });
    h.gridNames = (gr) => gr.groups.map((x) => `${x.label}: ${x.rows.length ? x.rows.map((r) => `${r.name}${r.arrow ? '▸' : ''}[${(r.icon || '').replace('pkp_linkaction_icon_', '')}]`).join(', ') : x.empty}`).join(' / ');
    h.row = (grid, name) => grid.locator('tr.gridRow.has_extras').filter({has: page.getByRole('link', {name, exact: true})}).first();
    h.openArrow = async (grid, name) => {
        const row = h.row(grid, name);
        if (!(await row.count())) return {absent: true};
        const toggle = row.locator('a.show_extras');
        const open = await row.locator('a.hide_extras').count();
        if (!(await toggle.count()) && !open) return {arrow: false};
        if (!open) await toggle.click();
        const controls = row.locator('xpath=following-sibling::tr[1]');
        await controls.waitFor({timeout: 10000}).catch(() => {});
        await sleep(250);
        const links = (await controls.locator('a:visible, button:visible').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
        return {arrow: true, links, controls};
    };
    h.rowAction = async (grid, name, action) => {
        const r = await h.openArrow(grid, name);
        if (!r.arrow) return r;
        await r.controls.getByRole('link', {name: action, exact: true}).click();
        return r;
    };
    h.formDlg = (title) => page.getByRole('dialog', {name: title, exact: true}).last();
    h.readForm = async (dlg) => dlg.evaluate((d) => {
        const vis = (e) => !!(e && (e.offsetParent || e.getClientRects().length));
        const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const form = d.querySelector('form#uploadForm') || d.querySelector('form');
        const h1 = clean((d.querySelector('h1') || {}).innerText || '');
        if (!form) return {h1, form: false, text: clean(d.innerText).slice(0, 800)};
        const secLabel = (e) => { const s = e.closest('.section'); const l = s && s.querySelector('label, legend'); return l ? clean(l.innerText) : null; };
        const inputs = [...form.querySelectorAll('input, select, textarea')].filter((e) => e.type !== 'hidden' || /temporaryFileId|publicAccess/.test(e.name)).map((e) => ({
            tag: e.tagName.toLowerCase(), type: e.type, name: e.name, section: secLabel(e), visible: vis(e), maxlength: e.getAttribute('maxlength'), required: e.required,
            value: e.type === 'file' ? '' : (e.value || '').slice(0, 60), len: (e.value || '').length, checked: e.checked,
            options: e.tagName === 'SELECT' ? [...e.options].map((o) => `${o.text}${o.selected ? '*' : ''}=${o.value}`) : undefined,
            lang: e.getAttribute('lang') || (e.name.match(/\[(\w+)\]/) || [])[1] || null,
        }));
        const labels = [...form.querySelectorAll('label, legend')].filter(vis).map((l) => clean(l.innerText)).filter(Boolean);
        const errors = [...form.querySelectorAll('label.error, .error:not(input):not(select):not(textarea), .pkp_form_error, [class*="formError"], .pkpFormField__error')].filter(vis).map((e) => ({text: clean(e.innerText), cls: e.className, section: secLabel(e)})).filter((e) => e.text);
        const invalid = [...form.querySelectorAll('input.error, select.error, textarea.error, [aria-invalid="true"]')].map((e) => e.name);
        const buttons = [...form.querySelectorAll('button, a, input[type=submit]')].filter(vis).map((b) => `${clean(b.innerText || b.value)}<${b.tagName.toLowerCase()}>${b.disabled ? '(dis)' : ''}`).filter((s) => !s.startsWith('<'));
        const quotes = [...form.querySelectorAll('blockquote')].map((b) => clean(b.innerText));
        const uploader = [...form.querySelectorAll('.pkp_uploader, [id*="plupload"], .pkpUploaderDropZone, [class*="upload"]')].filter(vis).map((e) => clean(e.innerText)).filter(Boolean).slice(0, 3);
        const fileTable = [...form.querySelectorAll('table tr')].map((tr) => clean(tr.innerText));
        return {h1, labels, inputs, errors, invalid, buttons, quotes, uploader, fileTable, text: clean(form.innerText).slice(0, 1600)};
    });
    h.pageMsgs = async () => (await page.locator('.pkpNotification:visible, .app__notifications:visible, [role="alert"]:visible, .ui-pnotify:visible, .pkp_notification:visible').allInnerTexts().catch(() => [])).map((s) => flat(s, 200)).filter(Boolean);
    h.pdf = path.join(app.root, 'classes/testing/fixtures', app.name === 'ops' ? 'preprint.pdf' : 'article.pdf');
    h.png = path.join(app.root, 'classes/testing/fixtures', 'profile-image-400.png');
    h.txt = path.join(app.root, 'classes/testing/fixtures', 'not-an-image.txt');
    h.pdfBase = path.basename(h.pdf);
    // Fill and submit an "Add a file" window already open (dlg).
    h.fillAdd = async (dlg, {name, type, description, file, publicAccess, submit = 'ok'} = {}) => {
        const f = dlg.locator('form#uploadForm');
        await f.waitFor({timeout: 30000}); await idle(page); await sleep(300);
        if (name !== undefined) await f.locator('input[name^="libraryFileName"]').first().fill(name);
        if (type) await f.locator('select[name="fileType"]').selectOption({label: type});
        if (description) await f.locator('textarea[name^="description"]').first().fill(description);
        let upload = null;
        if (file) {
            await f.locator('input[type="file"]').first().setInputFiles(file);
            await page.waitForFunction(() => document.querySelector('form#uploadForm input[name="temporaryFileId"]')?.value, null, {timeout: 30000}).catch(() => L('upload: no temporaryFileId'));
            await idle(page); await sleep(300);
            upload = {buttons: (await f.locator('button:visible, a:visible').allInnerTexts()).map((s) => s.trim()).filter(Boolean), text: flat(await f.innerText(), 600)};
        }
        if (publicAccess !== undefined) { const b = f.locator('input[name="publicAccess"]'); if (publicAccess) await b.check(); else await b.uncheck(); }
        const out = {upload};
        if (submit === 'ok') {
            const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /save-file|update-file|saveFile|updateFile/.test(r.url()), {timeout: 8000}).then((r) => r.status()).catch(() => null);
            await f.getByRole('button', {name: 'OK', exact: true}).click();
            out.status = await resp;
            out.closed = await dlg.waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
            await idle(page); await sleep(500);
            if (!out.closed) { out.form = await h.readForm(dlg); out.msgs = await h.pageMsgs(); }
        }
        return out;
    };
    h.openActivity = async () => {
        const b = h.header().getByRole('button', {name: 'Activity Log', exact: true});
        if (!(await b.count())) return null;
        await b.click();
        const log = page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
        await log.waitFor({timeout: 30000});
        await log.locator('table tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page); await sleep(400);
        return log;
    };
    return h;
}

async function signInAs(page, app, user, ctxPath) {
    await signIn(page, user, {contextPath: ctxPath});
    await idle(page);
}

// Open S's workflow and the "Submission Library" as one reader; returns what they see.
async function readerView(app, h, page, ctx, sub, user, {author = false, key = null, label, arrowOn = null} = {}) {
    await signInAs(page, app, user, ctx);
    const url = author ? h.auUrl(ctx, sub.submissionId, key) : h.edUrl(ctx, sub.submissionId, key);
    const wf = await h.openWf(url);
    const out = {wf, headerButtons: await h.headerButtons()};
    const s0 = await h.snap(`${label}-wf`);
    out.noAccess = noAccessOf(s0.text.dialog);
    out.library = await h.libBtn().count();
    if (!wf.header || !out.library) { out.page = flat(s0.text.dialog || s0.text.main, 400); return out; }
    const grid = await h.openLib();
    const s1 = await h.snap(`${label}-lib`);
    out.h1 = flat((s1.aria.dialogs.slice(-1)[0] || '').match(/heading "([^"]+)" \[level=1\]/)?.[1] || '', 80);
    out.grid = await h.readGrid(grid);
    if (arrowOn) {
        const a = await h.openArrow(grid, arrowOn);
        out.arrow = {arrow: a.arrow, links: a.links, absent: a.absent};
        if (a.arrow) await h.snap(`${label}-arrow`);
    }
    await h.closeDlg(h.libDlg());
    out.afterClose = {libOpen: await h.libDlg().isVisible().catch(() => false), workflowOpen: await h.header().isVisible().catch(() => false)};
    return out;
}

// ---------------------------------------------------------------------------
// Phases

async function phaseRoles(app, S, h, page) {
    h.phase = 'roles';
    const A = S.A, ops = app.name === 'ops', ojs = app.name === 'ojs';
    const u = (s) => `${A.t}${s}`;
    const list = [['admin', 'admin'], ['mg', u('mg')], ['se', u('se')], ['au', u('au')]];
    if (!ops) list.push(['ed', u('ed')], ['pe', u('pe')], ['ce', u('ce')], ['le', u('le')], ['fu', u('fu')]);
    if (ojs) list.push(['ge', u('ge')]);
    if (ops) list.push(['eb', u('eb')]);
    for (const [k, user] of list) {
        const r = await readerView(app, h, page, A.path, A.S1, user, {author: k === 'au', label: `roles-${k}`, arrowOn: 'K1 seeded report'});
        h.fact(k, {headerButtons: r.headerButtons, noAccess: r.noAccess, library: r.library, h1: r.h1, heads: r.grid && r.grid.heads, actions: r.grid && r.grid.actions,
            groups: r.grid && h.gridNames(r.grid), arrow: r.arrow, afterClose: r.afterClose, wf: r.wf, page: r.page});
    }
    // Controls: people who are not workflow participants.
    const ctl = [['su', u('su')], ['rd', u('rd')]];
    if (!ops) ctl.push(['rv', u('rv')]);
    for (const [k, user] of ctl) {
        await signInAs(page, app, user, A.path);
        const wf = await h.openWf(h.edUrl(A.path, A.S1.submissionId));
        const s = await h.snap(`roles-${k}-wf`);
        h.fact(`${k}-editorial`, {wf, library: await h.libBtn().count(), page: flat(s.text.dialog || s.text.main, 300)});
        const wf2 = await h.openWf(h.auUrl(A.path, A.S1.submissionId));
        const s2 = await h.snap(`roles-${k}-mysub`);
        h.fact(`${k}-mySubmissions`, {wf: wf2, library: await h.libBtn().count(), page: flat(s2.text.dialog || s2.text.main, 300)});
    }
}

async function phaseStatus(app, S, h, page) {
    h.phase = 'status';
    const A = S.A, ops = app.name === 'ops';
    const u = (s) => `${A.t}${s}`;
    const asst = ops ? (A.ebAssigned ? 'eb' : 'se') : 'ce';
    for (const [sk, sub] of [['S2', A.S2], ['SP', A.SP], ['SX', A.SX], ['SC', A.SC]]) {
        if (!sub) { h.fact(`${sk}`, 'not seeded'); continue; }
        const who = sk === 'S2' ? [['au', true], ['se', false]] : [['au', true], ['mg', false], [asst, false]];
        if (sk === 'SC') who.splice(0, who.length, ['le', false], ['au', true]);
        for (const [k, author] of who) {
            const r = await readerView(app, h, page, A.path, sub, u(k), {author, label: `status-${sk}-${k}`});
            h.fact(`${sk}-${k}`, {headerButtons: r.headerButtons, noAccess: r.noAccess, library: r.library, h1: r.h1, actions: r.grid && r.grid.actions, groups: r.grid && h.gridNames(r.grid), page: r.page});
        }
    }
}

function editorOf(app, A) { return `${A.t}${app.name === 'ops' ? 'mg' : 'ed'}`; }

async function phaseWindow(app, S, h, page) {
    h.phase = 'window';
    const A = S.A;
    await signInAs(page, app, editorOf(app, A), A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    await loc(page, 'workflow header "Library"', h.libBtn());
    const grid = await h.openLib();
    await loc(page, 'dialog "Submission Library"', h.libDlg());
    await loc(page, 'Submission Library grid', grid);
    await loc(page, 'Submission Library "Add a file"', grid.getByRole('link', {name: 'Add a file', exact: true}));
    await loc(page, 'Submission Library "View Document Library"', grid.getByRole('link', {name: 'View Document Library', exact: true}));
    const s = await h.snap('window-S1');
    const g = await h.readGrid(grid);
    h.fact('grid', {title: g.title, heads: g.heads, actions: g.actions, groups: h.gridNames(g)});
    h.fact('dialogAria', (s.aria.dialogs.slice(-1)[0] || '').slice(0, 1500));
    h.fact('1a', {otherSubmissionFileListed: g.text.includes('K1 other submission file'), journalFileListed: g.text.includes('K1 journal file')});
    // The dialog's own buttons (sweep).
    h.fact('dialogButtons', (await h.libDlg().getByRole('button').allInnerTexts()).map((x) => x.trim().replace(/\s+/g, ' ')));
    await h.closeDlg(h.libDlg());
    h.fact('closed', {libOpen: await h.libDlg().isVisible().catch(() => false), workflowOpen: await h.header().isVisible().catch(() => false)});
    // S2's window for the reverse of 1a.
    await h.openWf(h.edUrl(A.path, A.S2.submissionId));
    const g2 = await h.readGrid(await h.openLib());
    await h.snap('window-S2');
    h.fact('S2', h.gridNames(g2));
    await h.closeDlg(h.libDlg());
}

async function phaseAdd(app, S, h, page) {
    h.phase = 'add';
    const A = S.A;
    await signInAs(page, app, editorOf(app, A), A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    let grid = await h.openLib();
    const before = await h.readGrid(grid);
    h.fact('before', h.gridNames(before));
    const add = grid.getByRole('link', {name: 'Add a file', exact: true});
    const addDlg = () => h.formDlg('Add a file');
    // The window as it opens.
    await add.click(); await addDlg().waitFor({timeout: 30000}); await idle(page); await sleep(500);
    const s = await h.snap('add-window');
    await loc(page, 'dialog "Add a file"', addDlg());
    await loc(page, 'Add: "Name" box', addDlg().locator('input[name^="libraryFileName"]').first());
    await loc(page, 'Add: "Type" list', addDlg().locator('select[name="fileType"]'));
    await loc(page, 'Add: "Description" box', addDlg().locator('textarea[name^="description"]').first());
    await loc(page, 'Add: file input', addDlg().locator('input[type="file"]'));
    await loc(page, 'Add: "Upload File"', addDlg().getByRole('button', {name: 'Upload File', exact: true}));
    await loc(page, 'Add: "OK"', addDlg().getByRole('button', {name: 'OK', exact: true}));
    await loc(page, 'Add: "Cancel" (a link)', addDlg().getByRole('link', {name: 'Cancel', exact: true}));
    const f0 = await h.readForm(addDlg());
    h.fact('window', f0);
    h.fact('windowAria', (s.aria.dialogs.slice(-1)[0] || '').slice(0, 2000));
    // td9: OK with every field empty.
    await addDlg().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
    await h.snap('add-empty-ok');
    const fe = await h.readForm(addDlg());
    h.fact('emptyOk', {open: await addDlg().isVisible(), errors: fe.errors, invalid: fe.invalid, msgs: await h.pageMsgs(), browser: h.browserDialogs.slice(-2)});
    // td9: 300 characters into "Name".
    const long = 'N'.repeat(300);
    const nameBox = addDlg().locator('input[name^="libraryFileName"]').first();
    await nameBox.fill(''); await nameBox.pressSequentially(long.slice(0, 20), {delay: 0}); await nameBox.fill(long);
    const viaFill = (await nameBox.inputValue()).length;
    await nameBox.fill(''); await nameBox.pressSequentially(long, {delay: 0});
    h.fact('name300', {kept: (await nameBox.inputValue()).length, viaFill});
    // Only "Name" filled: which refusal remains.
    await nameBox.fill('K1 only name'); await addDlg().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
    const fn = await h.readForm(addDlg());
    await h.snap('add-name-only-ok');
    h.fact('nameOnlyOk', {open: await addDlg().isVisible(), errors: fn.errors, invalid: fn.invalid, msgs: await h.pageMsgs()});
    // td4: name + type, no upload.
    const r4 = await h.fillAdd(addDlg(), {name: 'No file', type: 'Other'});
    await h.snap('add-no-file-ok');
    h.fact('noFileOk', {closed: r4.closed, status: r4.status, errors: r4.form && r4.form.errors, invalid: r4.form && r4.form.invalid, msgs: r4.msgs, browser: h.browserDialogs.slice(-2)});
    // Wait longer: anything later?
    await sleep(3000);
    h.fact('noFileOkLater', {open: await addDlg().isVisible(), msgs: await h.pageMsgs(), text: flat(await addDlg().innerText().catch(() => ''), 400)});
    // Leaving with changes unsaved: the window's Close.
    await addDlg().locator('textarea[name^="description"]').first().click(); await sleep(300);
    const nb = h.browserDialogs.length;
    await addDlg().getByRole('button', {name: 'Close', exact: true}).first().click(); await sleep(1500);
    const leaveDlg = await page.locator('[role="dialog"]:visible').evaluateAll((ds) => ds.map((d) => (d.getAttribute('aria-label') || '') + ' | ' + d.innerText.replace(/\s+/g, ' ').slice(0, 200)));
    await h.snap('add-close-unsaved');
    h.fact('closeUnsaved', {addOpen: await addDlg().isVisible().catch(() => false), dialogs: leaveDlg, browser: h.browserDialogs.slice(nb)});
    if (await addDlg().isVisible().catch(() => false)) await h.closeDlg(addDlg());
    grid = h.grid();
    await idle(page); await sleep(800);
    const afterNoFile = await h.readGrid(grid);
    h.fact('afterNoFile', {noFileRow: afterNoFile.text.includes('No file'), groups: h.gridNames(afterNoFile)});
    // td4 repeat with a file: row added; the uploaded state of the button.
    await add.click();
    const r4b = await h.fillAdd(addDlg(), {name: 'No file', type: 'Other', file: h.pdf});
    h.fact('withFile', {closed: r4b.closed, status: r4b.status, upload: r4b.upload, errors: r4b.form && r4b.form.errors});
    // Rule 3: into an empty group (Permissions).
    await sleep(500);
    await add.click();
    const r3 = await h.fillAdd(addDlg(), {name: 'K1 permission form', type: 'Permissions', description: 'Permission description', file: h.pdf});
    const g3 = await h.readGrid(h.grid());
    await h.snap('add-rule3');
    h.fact('rule3', {closed: r3.closed, groups: h.gridNames(g3)});
    // td5: empty description.
    await add.click(); await addDlg().waitFor();
    const r5 = await h.fillAdd(addDlg(), {name: 'Blank description', type: 'Other', file: h.pdf});
    h.fact('blankDescription', {closed: r5.closed, status: r5.status, errors: r5.form && r5.form.errors, msgs: r5.msgs || await h.pageMsgs()});
    // Any file type: a text file and an image (icons).
    await add.click();
    const rt = await h.fillAdd(addDlg(), {name: 'K1 text file', type: 'Other', file: h.txt});
    await add.click();
    const ri = await h.fillAdd(addDlg(), {name: 'K1 image', type: 'Marketing', file: h.png});
    h.fact('anyType', {txt: {closed: rt.closed, upload: rt.upload && rt.upload.text}, png: {closed: ri.closed}});
    // Two files with the same name and type.
    await add.click(); await h.fillAdd(addDlg(), {name: 'K1 twin', type: 'Other', file: h.pdf});
    await add.click(); await h.fillAdd(addDlg(), {name: 'K1 twin', type: 'Other', file: h.pdf});
    // Cancel after typing and uploading.
    await add.click();
    await h.fillAdd(addDlg(), {name: 'K1 cancelled', type: 'Reports', file: h.pdf, submit: 'none'});
    await addDlg().getByRole('link', {name: 'Cancel', exact: true}).click();
    const cancelClosed = await addDlg().waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
    await idle(page); await sleep(800);
    const gAll = await h.readGrid(h.grid());
    await h.snap('add-after-all');
    h.fact('afterAll', {cancelClosed, cancelledRow: gAll.text.includes('K1 cancelled'), groups: h.gridNames(gAll)});
    // A fresh window: type a name, leave the box, press the window's Close.
    await add.click(); await addDlg().waitFor(); await addDlg().locator('select[name="fileType"] option').nth(1).waitFor({state: 'attached', timeout: 30000}); await idle(page);
    await addDlg().locator('input[name^="libraryFileName"]').first().fill('K1 closed fresh');
    await addDlg().locator('textarea[name^="description"]').first().click(); await sleep(300);
    const nb3 = h.browserDialogs.length;
    await addDlg().getByRole('button', {name: 'Close', exact: true}).first().click(); await sleep(1500);
    h.fact('freshCloseUnsaved', {addOpen: await addDlg().isVisible().catch(() => false), browser: h.browserDialogs.slice(nb3)});
    if (await addDlg().isVisible().catch(() => false)) await h.closeDlg(addDlg());
    await idle(page);
    h.fact('afterFreshClose', {row: (await h.readGrid(h.grid())).text.includes('K1 closed fresh')});
    // Leaving the page with the window typed in.
    await add.click(); await addDlg().waitFor(); await idle(page);
    await addDlg().locator('input[name^="libraryFileName"]').first().fill('K1 left page');
    await addDlg().locator('textarea[name^="description"]').first().click();
    const nb2 = h.browserDialogs.length;
    await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial`)).catch((e) => h.L('leave', String(e).slice(0, 200)));
    await idle(page);
    h.fact('leavePage', {browser: h.browserDialogs.slice(nb2), url: page.url()});
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    const gl = await h.readGrid(await h.openLib());
    h.fact('afterLeave', {leftRow: gl.text.includes('K1 left page')});
    // td5 continued: "Edit" of the blank-description file.
    const e5 = await h.rowAction(h.grid(), 'Blank description', 'Edit');
    const ed = h.formDlg('Edit');
    await ed.waitFor({timeout: 30000}); await idle(page); await sleep(500);
    const fe5 = await h.readForm(ed);
    await h.snap('add-blank-description-edit');
    h.fact('blankDescriptionEdit', {arrow: e5.arrow, description: fe5.inputs.filter((i) => /description/.test(i.name)), labels: fe5.labels});
    await h.closeDlg(ed);
    await h.closeDlg(h.libDlg());
}

async function phaseEdit(app, S, h, page) {
    h.phase = 'edit';
    const A = S.A;
    await signInAs(page, app, editorOf(app, A), A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    await h.openLib();
    const ed = () => h.formDlg('Edit');
    const openEdit = async (name) => { const r = await h.rowAction(h.grid(), name, 'Edit'); await ed().waitFor({timeout: 30000}); await idle(page); await sleep(500); return r; };
    const ra = await openEdit('K1 seeded report');
    await loc(page, 'row arrow (a.show_extras) of "K1 seeded report"', h.row(h.grid(), 'K1 seeded report').locator('a.show_extras, a.hide_extras'));
    await loc(page, 'dialog "Edit"', ed());
    const s = await h.snap('edit-window');
    const f = await h.readForm(ed());
    h.fact('window', {links: ra.links, ...f});
    h.fact('windowAria', (s.aria.dialogs.slice(-1)[0] || '').slice(0, 2000));
    // The same refusals: empty name.
    const nameBox = ed().locator('input[name^="libraryFileName"]').first();
    await nameBox.fill('');
    await ed().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
    const fe = await h.readForm(ed());
    await h.snap('edit-empty-name');
    h.fact('emptyName', {open: await ed().isVisible(), errors: fe.errors, invalid: fe.invalid, msgs: await h.pageMsgs()});
    // "Choose One" in Type.
    await nameBox.fill('K1 seeded report');
    const typeSel = ed().locator('select[name="fileType"]');
    await typeSel.selectOption({index: 0});
    await ed().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500); await idle(page);
    const ft = await h.readForm(ed());
    await h.snap('edit-choose-one');
    h.fact('chooseOne', {open: await ed().isVisible(), errors: ft.errors, invalid: ft.invalid, msgs: await h.pageMsgs(), selected: (ft.inputs.find((i) => i.name === 'fileType') || {}).options});
    // Cancel after a change.
    await typeSel.selectOption({label: 'Marketing'}); await nameBox.fill('K1 cancelled rename');
    await ed().getByRole('link', {name: 'Cancel', exact: true}).click();
    await ed().waitFor({state: 'hidden', timeout: 8000}).catch(() => {});
    await idle(page); await sleep(600);
    const gc = await h.readGrid(h.grid());
    h.fact('cancel', h.gridNames(gc));
    // Rename and move.
    await openEdit('K1 seeded report');
    await ed().locator('input[name^="libraryFileName"]').first().fill('K1 renamed report');
    await ed().locator('select[name="fileType"]').selectOption({label: 'Marketing'});
    const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /update-file/.test(r.url()), {timeout: 8000}).then((r) => r.status()).catch(() => null);
    await ed().getByRole('button', {name: 'OK', exact: true}).click();
    const closed = await ed().waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
    await idle(page); await sleep(800);
    const go = await h.readGrid(h.grid());
    await h.snap('edit-renamed');
    h.fact('renamed', {status: await resp, closed, groups: h.gridNames(go)});
    // Reopen: the saved values and the description.
    await openEdit('K1 renamed report');
    const f2 = await h.readForm(ed());
    h.fact('reopened', {inputs: f2.inputs.filter((i) => i.type !== 'hidden').map((i) => `${i.name}=${i.options ? i.options.find((o) => o.includes('*')) : i.value}`), fileTable: f2.fileTable});
    await h.closeDlg(ed());
    // Leaving "Edit" with a change unsaved, by its Close.
    await openEdit('K1 renamed report');
    await ed().locator('input[name^="libraryFileName"]').first().fill('K1 unsaved change');
    await ed().locator('textarea[name^="description"]').first().click(); await sleep(300);
    const nb = h.browserDialogs.length;
    await ed().getByRole('button', {name: 'Close', exact: true}).first().click(); await sleep(1500);
    h.fact('closeUnsaved', {editOpen: await ed().isVisible().catch(() => false), browser: h.browserDialogs.slice(nb)});
    if (await ed().isVisible().catch(() => false)) await h.closeDlg(ed());
    await idle(page);
    h.fact('afterCloseUnsaved', h.gridNames(await h.readGrid(h.grid())));
    await h.closeDlg(h.libDlg());
}

async function libraryFilesList(app, h, page, A, sub, label) {
    // The decision page's "Attach Files" › "Library Files" for sub (Rule 5's "leaves every Library Files list").
    const dec = 8; // INITIAL_DECLINE; OPS's Decline extends InitialDecline
    const resp = await page.goto(app.url(`/index.php/${A.path}/en/decision/record/${sub.submissionId}?decision=${dec}`)).catch(() => null);
    await idle(page); await sleep(800);
    const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
    const out = {status: resp && resp.status ? resp.status() : null, attach: await attach.count()};
    if (!out.attach) { out.page = flat(await page.locator('main, body').first().innerText().catch(() => ''), 300); return out; }
    await attach.click(); await sleep(800); await idle(page);
    const lb = page.locator('[role="dialog"]:visible').last().getByRole('button', {name: 'Attach Library Files', exact: true}).first();
    out.libraryButton = await lb.count();
    if (!out.libraryButton) return out;
    await lb.click(); await sleep(1000); await idle(page);
    const s = await h.snap(label);
    out.list = flat(s.text.dialog, 800);
    return out;
}

async function phaseDelete(app, S, h, page) {
    h.phase = 'delete';
    const A = S.A;
    await signInAs(page, app, editorOf(app, A), A.path);
    // Before: the S2 file in "Library Files".
    h.fact('libraryFilesBefore', await libraryFilesList(app, h, page, A, A.S2, 'delete-libraryfiles-before'));
    await h.openWf(h.edUrl(A.path, A.S2.submissionId));
    let grid = await h.openLib();
    const g0 = await h.readGrid(grid);
    const row = g0.groups.flatMap((x) => x.rows).find((r) => r.name === 'K1 other submission file');
    // Pressing the name downloads it (the page stays).
    const nd = h.downloads.length; const urlBefore = page.url();
    const dl = page.waitForEvent('download', {timeout: 15000}).catch(() => null);
    await grid.getByRole('link', {name: 'K1 other submission file', exact: true}).click();
    await dl; await sleep(500);
    h.fact('downloadBefore', {downloads: h.downloads.slice(nd), pageStayed: page.url() === urlBefore, href: row && row.href});
    // The dialog, then "Cancel".
    const confirm = () => page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
    await h.rowAction(grid, 'K1 other submission file', 'Delete');
    await confirm().waitFor({timeout: 15000}).catch(() => h.L('no delete confirm'));
    const sc = await h.snap('delete-confirm');
    await loc(page, 'Delete confirmation dialog', confirm());
    h.fact('confirm', {aria: (sc.aria.dialogs.slice(-1)[0] || '').slice(0, 800), text: flat(sc.text.dialog, 400)});
    await confirm().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => h.L('no Cancel button'));
    await sleep(1000); await idle(page);
    h.fact('afterCancel', h.gridNames(await h.readGrid(h.grid())));
    // "OK".
    await h.rowAction(h.grid(), 'K1 other submission file', 'Delete');
    await confirm().waitFor({timeout: 15000});
    const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /delete-file/.test(r.url()), {timeout: 10000}).then((r) => r.status()).catch(() => null);
    await confirm().getByRole('button', {name: 'OK', exact: true}).click();
    const st = await resp; await sleep(1200); await idle(page);
    const g1 = await h.readGrid(h.grid());
    await h.snap('delete-after-ok');
    h.fact('afterOk', {status: st, groups: h.gridNames(g1), msgs: await h.pageMsgs()});
    await h.closeDlg(h.libDlg());
    // After: the name's own address, and "Library Files".
    if (row && row.href) {
        const nd2 = h.downloads.length;
        const r = await page.goto(row.href).catch((e) => ({err: String(e).slice(0, 200)}));
        await sleep(800);
        h.fact('downloadAfter', {status: r && r.status ? r.status() : r, downloads: h.downloads.slice(nd2), text: flat(await page.locator('body').innerText().catch(() => ''), 300)});
        await h.snap('delete-download-after');
    }
    h.fact('libraryFilesAfter', await libraryFilesList(app, h, page, A, A.S2, 'delete-libraryfiles-after'));
    // On S1: delete one twin, then the only file in "Permissions" (the group reads "No Items").
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    grid = await h.openLib();
    for (const name of ['K1 twin', 'K1 permission form']) {
        const r = await h.rowAction(grid, name, 'Delete');
        if (!r.arrow) { h.fact(`delete-${name}`, r); continue; }
        await confirm().waitFor({timeout: 15000});
        await confirm().getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1200); await idle(page);
        h.fact(`after-${name}`, h.gridNames(await h.readGrid(h.grid())));
    }
    await h.snap('delete-s1-after');
    await h.closeDlg(h.libDlg());
}

async function phaseAuthor(app, S, h, page) {
    h.phase = 'author';
    const A = S.A, ops = app.name === 'ops';
    const u = (s) => `${A.t}${s}`;
    const edUser = editorOf(app, A);
    const mailTo = [u('au'), u('se'), ops ? u('mg') : u('ed')].map((x) => `${x}@mail.test`);
    const mailBefore = {};
    for (const m of mailTo) mailBefore[m] = await app.mail.count({to: m}).catch(() => null);
    // The editor adds two files.
    await signInAs(page, app, edUser, A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    const tasksBefore = await h.tasks();
    let grid = await h.openLib();
    for (const name of ['Editor contract', 'Editor report 2']) {
        await grid.getByRole('link', {name: 'Add a file', exact: true}).click();
        await h.fillAdd(h.formDlg('Add a file'), {name, type: 'Other', file: h.pdf});
    }
    h.fact('editorAdded', h.gridNames(await h.readGrid(h.grid())));
    await h.closeDlg(h.libDlg());
    // The Author (td10).
    await signInAs(page, app, u('au'), A.path);
    await h.openWf(h.auUrl(A.path, A.S1.submissionId));
    grid = await h.openLib();
    const a = await h.openArrow(grid, 'Editor contract');
    await h.snap('author-arrow');
    h.fact('authorArrow', {arrow: a.arrow, links: a.links});
    if (a.arrow) {
        await a.controls.getByRole('link', {name: 'Edit', exact: true}).click();
        const ed = h.formDlg('Edit'); await ed.waitFor({timeout: 30000}); await idle(page); await sleep(400);
        await ed.locator('input[name^="libraryFileName"]').first().fill('Renamed by author');
        await ed.getByRole('button', {name: 'OK', exact: true}).click();
        const closed = await ed.waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
        await idle(page); await sleep(800);
        h.fact('authorRenamed', {closed, groups: h.gridNames(await h.readGrid(h.grid()))});
        await h.rowAction(h.grid(), 'Renamed by author', 'Delete');
        const confirm = page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
        await confirm.waitFor({timeout: 15000});
        await confirm.getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1200); await idle(page);
        await h.snap('author-after-delete');
        h.fact('authorDeleted', h.gridNames(await h.readGrid(h.grid())));
    }
    await h.closeDlg(h.libDlg());
    // An assistant-level participant on the second file.
    const asst = ops ? (A.ebAssigned ? 'eb' : 'se') : 'ce';
    await signInAs(page, app, u(asst), A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    if (await h.libBtn().count()) {
        grid = await h.openLib();
        const b = await h.openArrow(grid, 'Editor report 2');
        h.fact(`${asst}Arrow`, {arrow: b.arrow, links: b.links});
        if (b.arrow) {
            await b.controls.getByRole('link', {name: 'Edit', exact: true}).click();
            const ed = h.formDlg('Edit'); await ed.waitFor({timeout: 30000}); await idle(page); await sleep(400);
            await ed.locator('input[name^="libraryFileName"]').first().fill('Renamed by assistant');
            await ed.getByRole('button', {name: 'OK', exact: true}).click();
            await ed.waitFor({state: 'hidden', timeout: 8000}).catch(() => {}); await idle(page); await sleep(800);
            h.fact(`${asst}Renamed`, h.gridNames(await h.readGrid(h.grid())));
            await h.rowAction(h.grid(), 'Renamed by assistant', 'Delete');
            const confirm = page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await confirm.waitFor({timeout: 15000});
            await confirm.getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1200); await idle(page);
            await h.snap(`author-${asst}-after-delete`);
            h.fact(`${asst}Deleted`, h.gridNames(await h.readGrid(h.grid())));
        }
        await h.closeDlg(h.libDlg());
    } else h.fact(`${asst}`, 'no Library button');
    // The editor again.
    await signInAs(page, app, edUser, A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    const tasksAfter = await h.tasks();
    await h.openLib();
    await h.snap('author-editor-reopen');
    h.fact('editorReopen', h.gridNames(await h.readGrid(h.grid())));
    await h.closeDlg(h.libDlg());
    await sleep(2000);
    const mailAfter = {};
    for (const m of mailTo) mailAfter[m] = await app.mail.count({to: m}).catch(() => null);
    h.fact('rule12-mail', {before: mailBefore, after: mailAfter});
    h.fact('rule12-tasks', {before: tasksBefore, after: tasksAfter});
}

async function phaseStage(app, S, h, page) {
    h.phase = 'stage';
    const A = S.A;
    if (app.name === 'ops' || !A.SC) { h.fact('skip', app.name === 'ops' ? 'no assistant on an OPS workflow' : 'SC not seeded'); return; }
    await signInAs(page, app, `${A.t}le`, A.path);
    const wf = await h.openWf(h.edUrl(A.path, A.SC.submissionId, 'workflow_4'));
    const s0 = await h.snap('stage-le-copyediting');
    h.fact('copyediting', {wf, noAccess: noAccessOf(s0.text.dialog), headerButtons: await h.headerButtons(), text: flat(s0.text.dialog, 500)});
    if (!(await h.libBtn().count())) return;
    const grid = await h.openLib();
    const s1 = await h.snap('stage-le-library');
    const g = await h.readGrid(grid);
    h.fact('window', {h1: (s1.aria.dialogs.slice(-1)[0] || '').match(/heading "([^"]+)" \[level=1\]/)?.[1], actions: g.actions, groups: h.gridNames(g)});
    await grid.getByRole('link', {name: 'Add a file', exact: true}).click();
    const r = await h.fillAdd(h.formDlg('Add a file'), {name: 'Layout note', type: 'Other', file: h.pdf});
    const g2 = await h.readGrid(h.grid());
    await h.snap('stage-le-added');
    h.fact('added', {closed: r.closed, status: r.status, groups: h.gridNames(g2)});
    await h.closeDlg(h.libDlg());
}

async function phaseTypes(app, S, h, page) {
    h.phase = 'types';
    const A = S.A;
    await signInAs(page, app, `${A.t}mg`, A.path);
    await h.openWf(h.edUrl(A.path, A.S1.submissionId));
    let grid = await h.openLib();
    await grid.getByRole('link', {name: 'Add a file', exact: true}).click();
    const add = h.formDlg('Add a file'); await add.waitFor(); await add.locator('select[name="fileType"] option').nth(1).waitFor({state: 'attached', timeout: 30000}); await idle(page);
    const opts = await add.locator('select[name="fileType"] option').evaluateAll((os) => os.map((o) => `${o.textContent.trim()}=${o.value}`));
    h.fact('typeOptions', opts);
    await h.closeDlg(add);
    // One file per type, then each file's "Edit" preselection.
    const labels = opts.slice(1).map((o) => o.split('=')[0]);
    for (const l of labels) {
        await h.grid().getByRole('link', {name: 'Add a file', exact: true}).click();
        await h.fillAdd(h.formDlg('Add a file'), {name: `K1 type ${l}`, type: l, file: h.pdf});
    }
    const g = await h.readGrid(h.grid());
    await h.snap('types-groups');
    h.fact('groups', h.gridNames(g));
    const pre = {};
    for (const l of labels) {
        const r = await h.rowAction(h.grid(), `K1 type ${l}`, 'Edit');
        if (!r.arrow) { pre[l] = 'no arrow'; continue; }
        const ed = h.formDlg('Edit'); await ed.waitFor({timeout: 30000}); await idle(page); await sleep(300);
        pre[l] = await ed.locator('select[name="fileType"] option:checked').innerText().catch(() => null);
        if (l === labels[0]) await h.snap('types-edit-first');
        await h.closeDlg(ed);
    }
    h.fact('editPreselect', pre);
    // "View Document Library" groups (read-only reading, the grouping only).
    await h.grid().getByRole('link', {name: 'View Document Library', exact: true}).click();
    const vdl = page.getByRole('dialog', {name: 'View Document Library'});
    await vdl.waitFor({timeout: 30000}).catch(() => {}); await idle(page); await sleep(500);
    const vg = vdl.locator('[id^="component-grid-"]').first();
    if (await vg.count()) { h.fact('viewDocumentLibrary', h.gridNames(await h.readGrid(vg))); await h.snap('types-vdl'); }
    await h.closeDlg(vdl);
    await h.closeDlg(h.libDlg());
    // Settings › Workflow › the library tab.
    await page.goto(app.url(`/index.php/${A.path}/en/management/settings/workflow`)); await idle(page);
    await page.getByRole('tab', {name: TABNAME[app.name], exact: true}).click(); await idle(page);
    const pg = page.locator(PUBGRID).first(); await pg.waitFor({timeout: 30000}); await idle(page);
    h.fact('settingsTab', h.gridNames(await h.readGrid(pg)));
    await h.snap('types-settings-tab');
}

async function phasePublisher(app, S, h, page) {
    h.phase = 'publisher';
    const A = S.A;
    const mg = `${A.t}mg`;
    await signInAs(page, app, mg, A.path);
    const openTab = async () => {
        await page.goto(app.url(`/index.php/${A.path}/en/management/settings/workflow`)); await idle(page);
        await page.getByRole('tab', {name: TABNAME[app.name], exact: true}).click(); await idle(page);
        const pg = page.locator(PUBGRID).first(); await pg.waitFor({timeout: 30000}); await idle(page); await sleep(300);
        return pg;
    };
    let pg = await openTab();
    await loc(page, `Settings › Workflow tab "${TABNAME[app.name]}" grid`, pg);
    await pg.getByRole('link', {name: 'Add a file', exact: true}).click();
    const add = h.formDlg('Add a file'); await add.waitFor({timeout: 30000}); await idle(page); await sleep(400);
    const s = await h.snap('pub-add-window');
    await loc(page, 'pub Add: "Public Access" box', add.locator('input[name="publicAccess"]'));
    const f = await h.readForm(add);
    h.fact('addWindow', f);
    h.fact('addWindowAria', (s.aria.dialogs.slice(-1)[0] || '').slice(0, 2200));
    // A2 on this side: no file.
    const r0 = await h.fillAdd(add, {name: 'K1 pub no file', type: 'Other'});
    h.fact('noFileOk', {closed: r0.closed, status: r0.status, errors: r0.form && r0.form.errors, msgs: r0.msgs});
    if (!r0.closed) await h.closeDlg(add);
    // "Guide", public.
    const tab = page.locator(PUBGRID).first();
    await tab.getByRole('link', {name: 'Add a file', exact: true}).click();
    const rg = await h.fillAdd(h.formDlg('Add a file'), {name: 'Guide', type: 'Other', file: h.pdf, publicAccess: true});
    h.fact('guideAdded', {closed: rg.closed, status: rg.status});
    await tab.getByRole('link', {name: 'Add a file', exact: true}).click();
    await h.fillAdd(h.formDlg('Add a file'), {name: 'K1 to delete', type: 'Reports', file: h.pdf, publicAccess: true});
    const g = await h.readGrid(tab);
    h.fact('tabList', h.gridNames(g));
    // "Edit" of "Guide".
    const r = await h.rowAction(tab, 'Guide', 'Edit');
    const ed = h.formDlg('Edit'); await ed.waitFor({timeout: 30000}); await idle(page); await sleep(500);
    const se = await h.snap('pub-edit-window');
    const fe = await h.readForm(ed);
    h.fact('editWindow', {links: r.links, ...fe});
    h.fact('editWindowAria', (se.aria.dialogs.slice(-1)[0] || '').slice(0, 2200));
    await loc(page, 'pub Edit: "Replace file" upload', ed.locator('input[type="file"]'));
    // The same refusals on this "Edit".
    await ed.locator('input[name^="libraryFileName"]').first().fill('');
    await ed.getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1500);
    const fe2 = await h.readForm(ed);
    h.fact('editEmptyName', {open: await ed.isVisible(), errors: fe2.errors});
    await h.closeDlg(ed);
    const addrOf = (form) => (form.quotes || []).find((q) => /downloadPublic/.test(q));
    const guideAddr = addrOf(fe);
    h.fact('guideAddress', guideAddr);
    // Numbers of "K1 to delete" and of a Submission Library file.
    await h.rowAction(page.locator(PUBGRID).first(), 'K1 to delete', 'Edit');
    const ed2 = h.formDlg('Edit'); await ed2.waitFor({timeout: 30000}); await idle(page); await sleep(400);
    const delAddr = addrOf(await h.readForm(ed2));
    await h.closeDlg(ed2);
    const subFile = (A.S1.libraryFiles || [])[0];
    const base = guideAddr ? guideAddr.replace(/\/\d+$/, '/') : null;
    // Signed out.
    const visit = async (addr, label) => {
        if (!addr) return {addr: null};
        const nd = h.downloads.length;
        let respInfo = null;
        const onResp = (rp) => { if (rp.url() === addr) respInfo = {status: rp.status(), type: rp.headers()['content-type'], disposition: rp.headers()['content-disposition']}; };
        page.on('response', onResp);
        const rr = await page.goto(addr).catch((e) => ({err: String(e).slice(0, 160)}));
        await sleep(1500);
        page.off('response', onResp);
        const out = {addr, respInfo, err: rr && rr.err, url: page.url(), downloads: h.downloads.slice(nd), text: flat(await page.locator('body').innerText().catch(() => ''), 200)};
        await shot(page, label).catch(() => {});
        return out;
    };
    await signOut(page);
    h.fact('outGuide', await visit(guideAddr, 'pub-out-guide'));
    h.fact('outSubmissionFile', await visit(base && subFile ? `${base}${subFile.id}` : null, 'pub-out-subfile'));
    h.fact('outNoSuchNumber', await visit(base ? `${base}999999` : null, 'pub-out-nosuch'));
    h.fact('outToDeleteBefore', await visit(delAddr, 'pub-out-todelete-before'));
    // Signed in: untick "Guide", delete "K1 to delete".
    await signInAs(page, app, mg, A.path);
    const tab2 = await openTab();
    await h.rowAction(tab2, 'Guide', 'Edit');
    const ed3 = h.formDlg('Edit'); await ed3.waitFor({timeout: 30000}); await idle(page); await sleep(400);
    await ed3.locator('input[name="publicAccess"]').uncheck();
    await ed3.getByRole('button', {name: 'OK', exact: true}).click();
    await ed3.waitFor({state: 'hidden', timeout: 8000}).catch(() => {}); await idle(page); await sleep(600);
    await h.rowAction(page.locator(PUBGRID).first(), 'K1 to delete', 'Delete');
    const confirm = page.locator('[role="dialog"]:visible').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
    await confirm.waitFor({timeout: 15000});
    const sc = await h.snap('pub-delete-confirm');
    h.fact('pubConfirm', flat(sc.text.dialog, 300));
    await confirm.getByRole('button', {name: 'OK', exact: true}).click(); await sleep(1200); await idle(page);
    h.fact('tabAfter', h.gridNames(await h.readGrid(page.locator(PUBGRID).first())));
    await signOut(page);
    h.fact('outGuideUnticked', await visit(guideAddr, 'pub-out-guide-unticked'));
    h.fact('outToDeleteAfter', await visit(delAddr, 'pub-out-todelete-after'));
}

async function phaseForms(app, S, h, page) {
    h.phase = 'forms';
    const F = S.F;
    await signInAs(page, app, `${F.t}mg`, F.path);
    await h.openWf(h.edUrl(F.path, F.SF.submissionId));
    const grid = await h.openLib();
    await grid.getByRole('link', {name: 'Add a file', exact: true}).click();
    const add = h.formDlg('Add a file'); await add.waitFor({timeout: 30000}); await idle(page); await sleep(500);
    const s = await h.snap('forms-sub-add');
    const f = await h.readForm(add);
    h.fact('subAdd', {inputs: f.inputs.filter((i) => /libraryFileName|description/.test(i.name)).map((i) => `${i.name}:${i.visible ? 'vis' : 'hid'}`), labels: f.labels, aria: (s.aria.dialogs.slice(-1)[0] || '').slice(0, 1500)});
    // The French box: shown while the English one has focus?
    await add.locator('input[name="libraryFileName[en]"]').focus(); await sleep(600);
    h.fact('focusEnglish', {frVisible: await add.locator('input[name="libraryFileName[fr_CA]"]').isVisible(), aria: ((await screen(page)).aria.dialogs.slice(-1)[0] || '').match(/group:\n\s+- text: Name\*[\s\S]*?(?=\n  - group)/)?.[0]});
    await h.snap('forms-sub-add-focused');
    // Fill the English name only and save: which language boxes are needed.
    await add.locator('input[name="libraryFileName[en]"]').fill('K1 English only');
    await add.locator('select[name="fileType"]').selectOption({label: 'Other'});
    const r = await h.fillAdd(add, {file: h.pdf});
    h.fact('englishOnly', {closed: r.closed, errors: r.form && r.form.errors});
    await h.closeDlg(h.libDlg());
    await page.goto(app.url(`/index.php/${F.path}/en/management/settings/workflow`)); await idle(page);
    await page.getByRole('tab', {name: TABNAME[app.name], exact: true}).click(); await idle(page);
    const pg = page.locator(PUBGRID).first(); await pg.waitFor({timeout: 30000}); await idle(page);
    await pg.getByRole('link', {name: 'Add a file', exact: true}).click();
    const add2 = h.formDlg('Add a file'); await add2.waitFor({timeout: 30000}); await idle(page); await sleep(500);
    const f2 = await h.readForm(add2);
    await h.snap('forms-pub-add');
    h.fact('pubAdd', {inputs: f2.inputs.filter((i) => /libraryFileName|description/.test(i.name)).map((i) => `${i.name}:${i.visible ? 'vis' : 'hid'}`), labels: f2.labels});
    await h.closeDlg(add2);
}

async function phaseRule12(app, S, h, page) {
    h.phase = 'rule12';
    const A = S.A;
    await signInAs(page, app, `${A.t}mg`, A.path);
    for (const [k, sub] of [['S1', A.S1], ['S2', A.S2]]) {
        await h.openWf(h.edUrl(A.path, sub.submissionId));
        const log = await h.openActivity();
        if (!log) { h.fact(k, 'no Activity Log button'); continue; }
        const text = await log.innerText().catch(() => '');
        await h.snap(`rule12-${k}-history`);
        const hits = text.split('\n').filter((l) => /Editor contract|Editor report|Renamed|librar|Blank description|No file|twin|K1 image|K1 text file|permission form|seeded report|other submission file|Layout note/i.test(l));
        h.fact(k, {rows: text.split('\n').length, hits, head: flat(text, 900)});
        await h.closeDlg(log);
    }
}


// Rule 2's read-only list: "View Document Library" as the Author (and as the manager, the control).
async function phaseReadonly(app, S, h, page) {
    h.phase = 'readonly';
    const A = S.A;
    for (const [k, author] of [['au', true], ['se', false], ['mg', false]]) {
        await signInAs(page, app, `${A.t}${k}`, A.path);
        await h.openWf(author ? h.auUrl(A.path, A.S1.submissionId) : h.edUrl(A.path, A.S1.submissionId));
        await h.openLib();
        await h.grid().getByRole('link', {name: 'View Document Library', exact: true}).click();
        const vdl = page.getByRole('dialog', {name: 'View Document Library'});
        await vdl.waitFor({timeout: 30000}).catch(() => {}); await idle(page); await sleep(500);
        const vg = vdl.locator('[id^="component-grid-"]').first();
        await vg.waitFor({timeout: 30000}).catch(() => {}); await idle(page);
        const g = await h.readGrid(vg);
        await h.snap(`readonly-${k}-vdl`);
        h.fact(k, {actions: g.actions, groups: h.gridNames(g), arrows: g.groups.flatMap((x) => x.rows).map((r) => `${r.name}:${r.arrow}`)});
        await h.closeDlg(vdl);
        await h.closeDlg(h.libDlg());
    }
}

// Lines 46–48: where a role's stages are ticked (Settings › Users & Roles › Roles, a role's "Edit").
async function phaseStages(app, S, h, page) {
    h.phase = 'stages';
    const A = S.A;
    await signInAs(page, app, `${A.t}mg`, A.path);
    await page.goto(app.url(`/index.php/${A.path}/en/management/settings/access`)); await idle(page);
    const rolesTab = page.getByRole('tab', {name: 'Roles', exact: true}).or(page.locator('#roles-button')).first();
    if (await rolesTab.count()) await rolesTab.click();
    await idle(page);
    await page.locator('tr.gridRow').first().waitFor({timeout: 30000}).catch(() => {});
    await h.snap('stages-roles-grid');
    h.fact('columns', await page.locator('table thead th').evaluateAll((els) => els.map((e) => e.innerText.trim())).catch(() => []));
    const row = page.locator('tr.gridRow').filter({has: page.locator('td').filter({hasText: /^\s*(Settings\s+)?Author\s*$/})}).first();
    if (!(await row.count())) { h.fact('author row', 'absent'); return; }
    await row.locator('a.show_extras').click(); await idle(page);
    await page.getByRole('link', {name: 'Edit', exact: true}).last().click();
    const form = page.locator('form#userGroupForm');
    await form.waitFor({state: 'visible', timeout: 30000});
    await form.locator('input[name="assignedStages[]"]').first().waitFor({state: 'attached', timeout: 15000}).catch(() => {});
    await idle(page);
    await h.snap('stages-author-edit');
    h.fact('authorEdit', {stages: await form.locator('input[name="assignedStages[]"]').evaluateAll((els) => els.map((e) => `${(e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}${e.checked ? '[x]' : '[ ]'}`)),
        text: flat(await form.innerText(), 900)});
    h.acceptConfirm = true;
    await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial`)).catch(() => {});
    h.acceptConfirm = false;
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const S = await seed(app);
    console.log(`[${app.name} seed]`, JSON.stringify({A: S.A.path, S1: S.A.S1.submissionId, S2: S.A.S2.submissionId, SC: S.A.SC && S.A.SC.submissionId, SP: S.A.SP && S.A.SP.submissionId, SX: S.A.SX && S.A.SX.submissionId, eb: S.A.ebAssigned, F: S.F.path}));
    const facts = {};
    const {page, close} = await launch(app);
    const h = helpers(app, page, facts);
    const phases = {roles: phaseRoles, stages: phaseStages, status: phaseStatus, window: phaseWindow, add: phaseAdd, edit: phaseEdit, delete: phaseDelete,
        author: phaseAuthor, stage: phaseStage, types: phaseTypes, readonly: phaseReadonly, publisher: phasePublisher, forms: phaseForms, rule12: phaseRule12};
    try {
        for (const p of ALL.split(',')) {
            if (!PHASES.includes(p)) continue;
            try { await phases[p](app, S, h, page); } catch (e) {
                h.L('PHASE ERROR', p, String(e.stack || e).slice(0, 900));
                facts[`${p}.ERROR`] = String(e.message || e).slice(0, 500);
                await shot(page, `error-${p}`).catch(() => {});
                await page.goto(app.url('/index.php/index')).catch(() => {});
            }
        }
    } finally {
        facts.browserDialogs = h.browserDialogs;
        record(`facts-${PHASES.length === ALL.split(',').length ? 'all' : PHASES.join('-')}`, facts);
        await close();
    }
});
