// U38 claim check, chunk K1 — the "Activity Log & Notes" window itself: who
// gets the header's "Activity Log" and which tabs, the "History" table and
// its columns, loading and reloading, language, the editorial reader who is
// also the author (Rule 9), the date settings, the Site Administrator with
// no journal role (A4), and the neighbouring records the Purpose names
// (docs/specs/U38-submission-activity-log-and-notes.md, lines 10–86,
// 176–199, 248–256, 278–338, 364–374).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   A — every permission level as a throwaway account (manager mg, editor ed
//       and production editor pe {OJS OMP}, section editors se (assigned)
//       and su (not assigned), guest editor ge {OJS}, copyeditor ce {OJS OMP}
//       or editorial board member eb {OPS}, author au, reviewer rv {OJS OMP},
//       reader rd), French as a second UI language. Submissions: S1 (a
//       decision, two files or a galley, a reviewer, a discussion), S0 (no
//       decision), SD (a draft), SP (for the notes and paging legs).
//   D — admin enrolled as Reader beside the automatic manager role, which
//       the admin then ends on their own edit page (A4).
//   E — the date settings, changed on screen.
//   RA / RO {OJS OMP} — a user who is author and Section editor of the same
//       submission; reviewers completed / accepted / declined; RA double-
//       anonymous (the default), RO "Open".
//
//   PROBE_FEATURE=U38 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U38/K1/k1.js
//   PHASES=roles,window,notes,draft,lang,admin,dates,anon,neighbours (default all);
//   REUSE=1 reuses the last seeded contexts (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'roles,window,notes,draft,lang,admin,dates,anon,neighbours';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const rnd = () => Math.random().toString(36).slice(2, 7);
const LOG_BUTTON = /^(Activity Log|Journal d'événements)$/;

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const file = path.join(outDir(), `seed-${app.name}.json`);
    if (REUSE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const ops = app.name === 'ops';
    const ojs = app.name === 'ojs';
    const toReview = ojs ? 'sendExternalReview' : 'skipInternalReview';
    const S = {};

    // A
    const t = tag('u38k1a');
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
        users.push({username: u('rv'), roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'});
    } else {
        users.push({username: u('eb'), roles: ['editorialBoardMember'], givenName: 'Ebba', familyName: 'Board'});
    }
    if (ojs) users.push({username: u('ge'), roles: ['guestEditor'], givenName: 'Gil', familyName: 'Guest'});
    const CA = await app.api.createContext({tag: t, context: {supportedLocales: ['en', 'fr_CA']}, users});
    const A = {t, path: CA.path, users: users.map((x) => x.username)};
    const parts = [{username: u('se'), role: 'sectionEditor'}];
    if (ojs) parts.push({username: u('ge'), role: 'guestEditor'});
    if (!ops) parts.push({username: u('ce'), role: 'copyeditor'});
    const s1 = {tag: `${t}s1`, context: A.path, submitter: u('au'), title: `K1 S1 ${t}`, participants: parts,
        tasks: [{title: `K1 D1 ${t}`, creator: u('mg'), participants: [u('mg'), u('au')]}]};
    if (!ops) {
        s1.files = [{file: 'article.pdf'}, {file: 'notes.md'}];
        s1.decisions = [toReview];
        s1.reviewRounds = [{reviewers: [{username: u('rv'), status: 'accepted'}]}];
    } else {
        s1.decisions = ['decline', 'revertDecline'];
        s1.galleys = [{label: 'PDF', file: 'preprint.pdf'}];
    }
    try {
        A.S1 = await app.api.createSubmission(s1);
    } catch (e) {
        console.log(`[${app.name} seed] S1 first shape refused: ${String(e.message || e).slice(0, 400)}`);
        if (ops) { s1.decisions = ['decline']; A.S1 = await app.api.createSubmission(s1); } else throw e;
    }
    A.S0 = await app.api.createSubmission({tag: `${t}s0`, context: A.path, submitter: u('au'), title: `K1 S0 ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    const sd = {tag: `${t}sd`, context: A.path, submitter: u('au'), title: `K1 SD ${t}`, submitted: false};
    if (!ops) sd.files = [{file: 'article.pdf'}];
    A.SD = await app.api.createSubmission(sd);
    A.SP = await app.api.createSubmission({tag: `${t}sp`, context: A.path, submitter: u('au'), title: `K1 SP ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    S.A = A;

    // D (A4)
    const td = tag('u38k1d');
    const CD = await app.api.createContext({tag: td, users: [
        {username: `${td}mg`, roles: ['manager'], givenName: 'Mina', familyName: 'Manager'},
        {username: `${td}au`, roles: ['author'], givenName: 'Abe', familyName: 'Author'},
        {username: 'admin', roles: ['reader'], givenName: 'Site', familyName: 'Admin'},
    ]});
    const sa = {tag: `${td}s`, context: CD.path, submitter: `${td}au`, title: `K1 SA ${td}`};
    if (!ops) { sa.files = [{file: 'article.pdf'}]; sa.decisions = [toReview]; }
    S.D = {t: td, path: CD.path, SA: await app.api.createSubmission(sa)};
    S.D2 = await seedD2(app);

    // E (dates)
    const te = tag('u38k1e');
    const CE = await app.api.createContext({tag: te, users: [
        {username: `${te}mg`, roles: ['manager'], givenName: 'Dana', familyName: 'Dates'},
        {username: `${te}au`, roles: ['author'], givenName: 'Axel', familyName: 'Author'},
    ]});
    const se1 = {tag: `${te}s`, context: CE.path, submitter: `${te}au`, title: `K1 SE ${te}`};
    if (!ops) { se1.files = [{file: 'article.pdf'}]; se1.decisions = [toReview]; }
    S.E = {t: te, path: CE.path, S: await app.api.createSubmission(se1)};

    // RA / RO (Rule 9)
    if (!ops) {
        for (const [key, prefix, review] of [['RA', 'u38k1r', null], ['RO', 'u38k1o', {defaultReviewMode: 'open'}]]) {
            const tr = tag(prefix);
            const spec = {tag: tr, users: [
                {username: `${tr}ae`, roles: ['author', 'sectionEditor'], givenName: 'Erin', familyName: 'Authoreditor'},
                {username: `${tr}mg`, roles: ['manager'], givenName: 'Milo', familyName: 'Manager'},
                {username: `${tr}r1`, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'One'},
                {username: `${tr}r2`, roles: ['externalReviewer'], givenName: 'Rob', familyName: 'Two'},
                {username: `${tr}r3`, roles: ['externalReviewer'], givenName: 'Ray', familyName: 'Three'},
            ]};
            if (review) spec.review = review;
            const C = await app.api.createContext(spec);
            const sub = await app.api.createSubmission({tag: `${tr}s`, context: C.path, submitter: `${tr}ae`, title: `K1 ${key} ${tr}`,
                participants: [{username: `${tr}ae`, role: 'sectionEditor'}], decisions: [toReview],
                reviewRounds: [{files: [{file: 'article.pdf'}], reviewers: [
                    {username: `${tr}r1`, status: 'completed'},
                    {username: `${tr}r2`, status: 'accepted'},
                    {username: `${tr}r3`, status: 'declined'},
                ]}]});
            S[key] = {t: tr, path: C.path, S: sub};
        }
    }
    fs.writeFileSync(file, JSON.stringify(S, null, 2));
    console.log(`[${app.name} seed]`, JSON.stringify({A: A.path, ids: {S1: A.S1.submissionId, S0: A.S0.submissionId, SD: A.SD.submissionId, SP: A.SP.submissionId}, D: S.D.path, E: S.E.path, RA: S.RA && S.RA.path, RO: S.RO && S.RO.path}));
    return S;
}

// D2 (A4): admin enrolled in an assistant role beside the automatic manager role.
async function seedD2(app) {
    const ops = app.name === 'ops';
    const td2 = tag('u38k1g');
    const assistantKey = ops ? 'editorialBoardMember' : 'copyeditor';
    const CD2 = await app.api.createContext({tag: td2, users: [
        {username: `${td2}mg`, roles: ['manager'], givenName: 'Nora', familyName: 'Manager'},
        {username: `${td2}au`, roles: ['author'], givenName: 'Bo', familyName: 'Author'},
        {username: 'admin', roles: [assistantKey], givenName: 'Site', familyName: 'Admin'},
    ]});
    const sa2 = {tag: `${td2}s`, context: CD2.path, submitter: `${td2}au`, title: `K1 SA2 ${td2}`};
    if (!ops) { sa2.files = [{file: 'article.pdf'}]; sa2.decisions = [app.name === 'ojs' ? 'sendExternalReview' : 'skipInternalReview']; }
    return {t: td2, path: CD2.path, SA: await app.api.createSubmission(sa2), role: assistantKey};
}

// ---------------------------------------------------------------------------
// Helpers

function helpers(app, page, facts) {
    const h = {facts, phase: ''};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.fact = (k, v) => { facts[k] = v; L(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 3000)); };
    h.edUrl = (p, id, key, locale = 'en') => app.url(`/index.php/${p}/${locale}/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    h.browserDialogs = [];
    page.on('dialog', async (d) => {
        h.browserDialogs.push({type: d.type(), message: d.message(), phase: h.phase, step: h.step || '-'});
        L('BROWSER DIALOG', d.type(), d.message());
        if (d.type() === 'beforeunload' || h.acceptConfirm) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.header = () => page.locator('[data-cy="sidemodal-header"]').first();
    h.openWf = async (url, step) => {
        h.step = step || url.replace(/^.*index.php/, '');
        const resp = await page.goto(url).catch((e) => ({err: String(e)}));
        const ok = await h.header().waitFor({timeout: 20000}).then(() => true).catch(() => false);
        await idle(page);
        if (ok) await h.header().getByRole('button').first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(400);
        return {header: ok, status: resp && resp.status ? resp.status() : null, url: page.url()};
    };
    h.headerButtons = async () => (await h.header().getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    h.logButton = () => h.header().getByRole('button', {name: LOG_BUTTON});
    h.log = () => page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
    h.tabs = async () => h.log().locator('.pkp_controllers_informationCenter > ul > li').evaluateAll((lis) => lis.map((li) => ({
        text: li.innerText.trim(), role: li.getAttribute('role'), selected: li.getAttribute('aria-selected'), active: li.classList.contains('ui-tabs-active'),
    }))).catch(() => []);
    h.openLog = async () => {
        await h.logButton().click();
        await h.log().waitFor({timeout: 30000});
        await h.log().locator('table tbody tr, .pkp_notes_list, #newNoteForm').first().waitFor({timeout: 45000}).catch(() => L('log window: nothing arrived'));
        await idle(page);
        await sleep(300);
        return h.log();
    };
    h.tab = (re) => h.log().locator('.pkp_controllers_informationCenter > ul > li > a').filter({hasText: re}).first();
    h.gotoTab = async (re) => {
        await h.tab(re).click();
        await idle(page);
        await h.log().locator('.ui-tabs-panel:visible').first().locator('table tbody tr, .pkp_notes_list').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await sleep(300);
    };
    h.panelVisible = () => h.log().locator('.ui-tabs-panel:visible').first();
    // The History grid, as data.
    h.history = async () => {
        const p = h.panelVisible();
        const table = p.locator('table').first();
        if (!(await table.count())) return {table: false, text: flat(await p.innerText().catch(() => ''), 600)};
        return table.evaluate((tb) => {
            const clean = (s) => (s || '').split('$(function')[0].trim().replace(/\s+/g, ' ');
            const heads = [...tb.querySelectorAll('thead th')].map((th) => clean(th.innerText));
            const rows = [...tb.querySelectorAll('tbody tr.gridRow')].map((tr) => {
                const tds = [...tr.querySelectorAll(':scope > td')];
                return {id: tr.id, cells: tds.map((td) => clean(td.innerText)), toggle: !!tr.querySelector('a.show_extras')};
            });
            const empty = [...tb.querySelectorAll('tbody.empty')].filter((b) => b.offsetParent !== null).map((b) => clean(b.innerText));
            const root = tb.closest('.ui-tabs-panel') || tb.parentElement;
            const inputs = [...root.querySelectorAll('input, select')].filter((e) => e.type !== 'hidden' && e.offsetParent !== null).map((e) => `${e.tagName}:${e.type || ''}:${e.name || e.id}`);
            const pager = [...root.querySelectorAll('.gridPaging, .pkp_linkaction_moreItems, [class*=paging], [class*=pagination]')].map((e) => clean(e.innerText));
            const links = [...root.querySelectorAll('a')].filter((a) => a.offsetParent !== null).map((a) => clean(a.innerText)).filter(Boolean);
            return {table: true, heads, rows, empty, inputs, pager, visibleLinks: [...new Set(links)]};
        });
    };
    // Open a History row's controls ("Settings" arrow) and return the links it shows.
    h.rowControls = async (rowText) => {
        const p = h.panelVisible();
        const row = p.locator('tr.gridRow').filter({hasText: rowText}).first();
        if (!(await row.count())) return {absent: true};
        const toggle = row.locator('a.show_extras');
        if (!(await toggle.count())) return {toggle: false};
        await toggle.click();
        const controls = row.locator('xpath=following-sibling::tr[1]');
        await controls.waitFor({timeout: 10000}).catch(() => {});
        await sleep(200);
        const links = (await controls.locator('a:visible, button:visible').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
        return {toggle: true, links, row: flat(await row.innerText().catch(() => ''), 300)};
    };
    h.notes = async () => {
        const p = h.panelVisible();
        return p.evaluate((root) => {
            const notes = [...root.querySelectorAll('.pkp_notes_list .note')].map((n) => ({
                user: (n.querySelector('.user') || {}).innerText?.trim(),
                date: (n.querySelector('.date') || {}).innerText?.trim(),
                text: ((n.querySelector('.message') || {}).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 200),
                del: !!n.querySelector('button[id^="deleteNote-"]'),
            }));
            const empty = (root.querySelector('.pkp_notes_list .no_notes') || {}).innerText || null;
            const form = root.querySelector('#newNoteForm');
            const formText = form ? form.innerText.trim().replace(/\s+/g, ' ') : null;
            const ta = root.querySelector('textarea[name="newNote"]');
            return {notes, empty, formText, textarea: ta ? {maxlength: ta.getAttribute('maxlength'), value: ta.value} : null,
                buttons: [...root.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())};
        }).catch((e) => ({err: String(e)}));
    };
    h.toasts = async () => (await page.locator('.app__notifications, [role="status"], [role="alert"], .pkpNotification').allInnerTexts().catch(() => [])).map((s) => flat(s, 200)).filter(Boolean);
    h.addNote = async (text) => {
        const p = h.panelVisible();
        const ta = p.locator('textarea[name="newNote"]');
        await ta.fill(text);
        const resp = page.waitForResponse((r) => /save-note|saveNote/.test(r.url()), {timeout: 15000}).then((r) => r.status()).catch(() => null);
        await p.locator('#newNoteForm').getByRole('button', {name: /^(Add Note|Ajouter une note)$/}).click();
        const status = await resp;
        const toast = await page.getByText(/Note posted\.|Note publiée\./).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        await idle(page);
        await sleep(400);
        return {status, toast};
    };
    h.closeLog = async () => {
        const btn = h.log().getByRole('button', {name: /^(Close|Fermer)$/}).first();
        if (await btn.count()) await btn.click().catch(() => {});
        await h.log().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(600);
    };
    return h;
}

// Read the whole window as one reader: header, tabs, History, Notes.
async function readWindow(h, page, name, {notes = true, addNote = null} = {}) {
    const out = {};
    out.buttons = await h.headerButtons();
    if (!(await h.logButton().count())) { await h.snap(`${name}-wf`); return {...out, logButton: false}; }
    await h.openLog();
    out.title = flat(await h.log().locator('.pkp_modal_panel > .header, .pkpModalHeader, h1, h2').first().innerText().catch(() => ''), 120);
    out.tabs = await h.tabs();
    out.first = await h.history();
    await h.snap(`${name}-log`);
    if (notes) {
        const nt = h.tab(/^(Notes)$/);
        if (await nt.count()) {
            await h.gotoTab(/^(Notes)$/);
            out.notes = await h.notes();
            if (addNote) {
                out.add = await h.addNote(addNote);
                out.notesAfter = await h.notes();
            }
            await h.snap(`${name}-notes`);
        }
    }
    await h.closeLog();
    return out;
}

// ---------------------------------------------------------------------------
// Phase roles: every permission level on S1 (Actors rows 1–5; lines 12–52).

async function phaseRoles(app, S, h, page) {
    h.phase = 'roles';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    const ops = app.name === 'ops';
    const id = A.S1.submissionId;
    const order = ['mg', 'admin', 'ed', 'pe', 'se', 'ge', 'su', 'ce', 'eb', 'au', 'rv', 'rd'];
    const readers = ['mg', 'admin', 'ed', 'pe', 'se', 'ge'];
    for (const k of order) {
        const username = k === 'admin' ? 'admin' : u(k);
        if (k !== 'admin' && !A.users.includes(username)) continue;
        try {
            await signIn(page, username, {contextPath: A.path});
            const landing = page.url();
            const o = await h.openWf(h.edUrl(A.path, id), `roles ${k}`);
            const r = {landing, open: o};
            if (!o.header) {
                const s = await h.snap(`roles-${k}-denied`);
                r.text = flat(s.text.dialog || s.text.main, 500);
                if (k === 'au') {
                    const oa = await h.openWf(h.auUrl(A.path, id), 'roles au author view');
                    r.author = {open: oa, buttons: await h.headerButtons()};
                    await h.snap(`roles-au-authorview`);
                }
            } else {
                r.win = await readWindow(h, page, `roles-${k}`, {addNote: readers.includes(k) ? `K1 note by ${k} ${rnd()}` : null});
                // Download / View Email per reader (Actors row 2).
                if (r.win.logButton !== false) {
                    await h.openLog();
                    r.fileRow = await h.rowControls(/uploaded|was uploaded|galley|PDF/);
                    r.emailRow = await h.rowControls(/An email has been sent|email/i);
                    await h.snap(`roles-${k}-controls`);
                    await h.closeLog();
                }
                // The section editor deletes the manager's note (Actors row 5).
                if (k === 'se') {
                    await h.openLog();
                    await h.gotoTab(/^Notes$/);
                    const noteEl = h.panelVisible().locator('.note').filter({hasText: 'K1 note by mg'}).first();
                    if (await noteEl.count()) {
                        await noteEl.locator('button[id^="deleteNote-"]').click();
                        const dlg = page.locator('[data-cy="dialog"], [role="dialog"]').filter({hasText: /delete this note/}).last();
                        await dlg.waitFor({timeout: 10000}).catch(() => {});
                        r.deleteDialog = {text: flat(await dlg.innerText().catch(() => ''), 300), buttons: (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim())};
                        await h.snap('roles-se-delete-dialog');
                        await dlg.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).first().click().catch(() => {});
                        r.deleteToast = await page.getByText('Note deleted.').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
                        await idle(page); await sleep(500);
                        r.notesAfterDelete = await h.notes();
                        await h.snap('roles-se-after-delete');
                    } else r.deleteDialog = 'no mg note';
                    await h.closeLog();
                }
            }
            h.fact(`roles ${k}`, r);
        } catch (e) {
            h.fact(`roles ${k} FAILED`, String(e.stack || e).split('\n').slice(0, 3).join(' | '));
            await h.snap(`roles-${k}-failed`).catch(() => {});
        }
    }
    // Reviewer: their own list and wizard (no workflow header at all).
    if (!ops) {
        await signIn(page, u('rv'), {contextPath: A.path});
        await page.goto(app.url(`/index.php/${A.path}/en/reviewer/submission/${id}`)); await idle(page);
        const s = await h.snap('roles-rv-wizard');
        h.fact('roles rv wizard', {url: s.url, logButton: await page.getByRole('button', {name: LOG_BUTTON}).count(), text: flat(s.text.main, 300)});
    }
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase window: Rule 1, 1a (td1), 2, the stage axis, closing, the sweep.

async function phaseWindow(app, S, h, page) {
    h.phase = 'window';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    await signIn(page, u('mg'), {contextPath: A.path});
    const id = A.S1.submissionId;
    // Before.
    await h.openWf(h.edUrl(A.path, id));
    const before = await h.snap('window-wf-before');
    await loc(page, 'the header "Activity Log" button', page.getByRole('button', {name: 'Activity Log', exact: true}));
    // td1: every DOM change from the click, by a MutationObserver installed first.
    await page.evaluate(() => {
        window.__k1 = [];
        const t0 = performance.now();
        const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const read = () => {
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis).find((d) => /Activity Log & Notes/.test(d.innerText));
            if (!dlg) return 'no window';
            const spin = [...dlg.querySelectorAll('.pkp_loading, .pkp_spinner, .pkpSpinner, [class*=loading], [class*=spinner]')].filter(vis);
            return `tabs=${dlg.querySelectorAll('.pkp_controllers_informationCenter > ul > li').length} spinners=${spin.length}${spin.length ? '(' + spin.map((s) => s.className + ':' + (s.innerText || '').trim()).join(',').slice(0, 80) + ')' : ''} rows=${dlg.querySelectorAll('tbody tr.gridRow').length} form=${!!dlg.querySelector('#newNoteForm')}`;
        };
        let last = '';
        window.__k1obs = new MutationObserver(() => {
            const s = read();
            if (s !== last) { last = s; window.__k1.push(`${Math.round(performance.now() - t0)}ms ${s}`); }
        });
        window.__k1obs.observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style']});
    });
    const t0 = Date.now();
    await h.logButton().click();
    const timeline = [];
    let shotEarly = false;
    for (let i = 0; i < 400; i++) {
        const st = await page.evaluate(() => {
            const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis).find((d) => d.querySelector('.pkp_controllers_informationCenter') || /Activity Log & Notes/.test(d.innerText));
            if (!dlg) return {dialog: false};
            const spin = [...dlg.querySelectorAll('.pkp_loading, .pkp_spinner, .pkpSpinner, [class*=loading], [class*=spinner]')].filter(vis);
            return {dialog: true, spinners: spin.length, spinnerText: spin.map((s) => (s.innerText || s.className).toString().trim().slice(0, 60)).slice(0, 3),
                tabs: dlg.querySelectorAll('.pkp_controllers_informationCenter > ul > li').length, rows: dlg.querySelectorAll('tbody tr.gridRow').length,
                textLen: dlg.innerText.length, text: dlg.innerText.replace(/\s+/g, ' ').slice(0, 160)};
        });
        const ms = Date.now() - t0;
        const last = timeline[timeline.length - 1];
        if (!last || JSON.stringify({...last, ms: 0}) !== JSON.stringify({...st, ms: 0})) timeline.push({...st, ms});
        if (st.dialog && !shotEarly) { await shot(page, 'window-td1-early').catch(() => {}); shotEarly = true; }
        if (st.rows > 0 && last && last.rows === st.rows && ms > 800) break;
        await sleep(100);
    }
    h.fact('window td1 History timeline', timeline);
    await idle(page);
    h.fact('window td1 History DOM states', await page.evaluate(() => window.__k1.slice(0, 40)));
    await page.evaluate(() => { window.__k1 = []; });
    const w = {};
    w.tabs = await h.tabs();
    w.titleText = flat(await h.log().innerText().catch(() => ''), 200);
    w.history = await h.history();
    await h.snap('window-history');
    // Locators for the test author.
    await loc(page, 'the "Activity Log & Notes" window', page.getByRole('dialog', {name: /Activity Log & Notes/}));
    await loc(page, 'the History tab', h.log().getByRole('tab', {name: 'History'}));
    await loc(page, 'the Notes tab', h.log().getByRole('tab', {name: 'Notes'}));
    await loc(page, 'History rows', h.log().locator('tbody tr.gridRow'));
    await loc(page, 'History column headers', h.log().getByRole('columnheader'));
    // Notes: the timeline of the tab switch.
    const t1 = Date.now();
    await h.tab(/^Notes$/).click();
    const tl2 = [];
    for (let i = 0; i < 200; i++) {
        const st = await h.log().evaluate((dlg) => {
            const vis = (e) => e && e.getClientRects().length > 0;
            const panel = [...dlg.querySelectorAll('.ui-tabs-panel')].find(vis);
            const spin = [...dlg.querySelectorAll('.pkp_loading, .pkp_spinner, [class*=loading]')].filter(vis);
            return {panel: !!panel, spinners: spin.length, form: !!(panel && panel.querySelector('#newNoteForm')), textLen: panel ? panel.innerText.length : 0};
        }).catch(() => ({err: true}));
        const ms = Date.now() - t1;
        const last = tl2[tl2.length - 1];
        if (!last || JSON.stringify({...last, ms: 0}) !== JSON.stringify({...st, ms: 0})) tl2.push({...st, ms});
        if (st.form && ms > 800) break;
        await sleep(100);
    }
    h.fact('window td1 Notes timeline', tl2);
    await idle(page);
    h.fact('window td1 Notes DOM states', await page.evaluate(() => window.__k1.slice(0, 40)));
    await page.evaluate(() => { window.__k1 = []; });
    w.notesTabs = await h.tabs();
    w.notes = await h.notes();
    await h.snap('window-notes');
    await loc(page, 'the "Add Note" box', h.log().locator('textarea[name="newNote"]'));
    await loc(page, 'the "Add Note" button', h.log().getByRole('button', {name: 'Add Note', exact: true}));
    // Back to History: does the tab reload (a request)?
    const reqs = [];
    const onReq = (r) => { if (/view-history|viewHistory|fetch-grid|submission-event-log/i.test(r.url())) reqs.push(r.url().replace(/^.*\$\$\$call\$\$\$/, '')); };
    page.on('request', onReq);
    await h.gotoTab(/^History$/);
    page.off('request', onReq);
    w.historyAgainRequests = reqs;
    h.fact('window History again DOM states', await page.evaluate(() => window.__k1.slice(0, 40)));
    await page.evaluate(() => { window.__k1obs.disconnect(); });
    // An email row's "View Email" (the full text, line 18) and a file row's Download.
    w.fileRow = await h.rowControls(/uploaded/);
    w.emailRow = await h.rowControls(/An email has been sent/);
    if (w.emailRow.links && w.emailRow.links.includes('View Email')) {
        await h.panelVisible().getByRole('link', {name: 'View Email'}).first().click();
        await sleep(1500); await idle(page);
        const top = page.locator('[role="dialog"]:visible').last();
        w.viewEmail = flat(await top.innerText().catch(() => ''), 2500);
        await h.snap('window-view-email');
        await top.getByRole('button', {name: /^(Close|OK)$/}).last().click().catch(() => {});
        await sleep(800);
        w.afterViewEmailLogOpen = await h.log().isVisible().catch(() => false);
    }
    // Closing returns to the workflow as it was.
    await h.closeLog();
    const after = await h.snap('window-wf-after');
    w.close = {beforeUrl: before.url, afterUrl: after.url, workflowOpen: await h.header().isVisible().catch(() => false),
        same: flat(before.text.dialog, 600) === flat(after.text.dialog, 600), beforeDialog: flat(before.text.dialog, 300), afterDialog: flat(after.text.dialog, 300)};
    h.fact('window S1', w);
    // Escape inside the window (sweep): which windows close.
    await h.openLog();
    await page.keyboard.press('Escape');
    await sleep(1000);
    const esc = {logOpen: await h.log().isVisible().catch(() => false), workflowOpen: await h.header().isVisible().catch(() => false), url: page.url()};
    await h.snap('window-escape');
    h.fact('window Escape', esc);
    // Stage axis: S0 (first stage) against S1.
    await h.openWf(h.edUrl(A.path, A.S0.submissionId));
    const s0 = await readWindow(h, page, 'window-s0', {notes: true});
    h.fact('window S0 (no decision, first stage)', s0);
    // Leave with something typed and unsaved (sweep).
    await h.openWf(h.edUrl(A.path, A.S0.submissionId));
    await h.openLog();
    await h.gotoTab(/^Notes$/);
    await h.panelVisible().locator('textarea[name="newNote"]').fill('K1 typed and not added');
    h.step = 'close with typed note';
    const nb = h.browserDialogs.length;
    await h.log().getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
    await sleep(1200);
    const leave = {logOpen: await h.log().isVisible().catch(() => false), browserDialogs: h.browserDialogs.slice(nb), dialogs: (await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])).map((s) => flat(s, 150))};
    await h.snap('window-leave-typed');
    // The same close, the browser's question answered OK this time.
    if (leave.logOpen) {
        h.acceptConfirm = true;
        await h.log().getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
        await sleep(1200);
        h.acceptConfirm = false;
        leave.afterOk = {logOpen: await h.log().isVisible().catch(() => false), workflowOpen: await h.header().isVisible().catch(() => false), browserDialogs: h.browserDialogs.slice(nb)};
        await h.snap('window-leave-typed-ok');
    }
    if (!(await h.log().isVisible().catch(() => false))) {
        await h.openLog();
        await h.gotoTab(/^Notes$/);
        leave.reopened = await h.notes();
        await h.closeLog();
    }
    h.fact('window leave typed', leave);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase notes: 1b (td2), the empty box (line 60), paging (Rule 2), note dates.

async function phaseNotes(app, S, h, page) {
    h.phase = 'notes';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    await signIn(page, u('mg'), {contextPath: A.path});
    const id = A.SP.submissionId;
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    const n = {};
    n.historyBefore = await h.history();
    await h.gotoTab(/^Notes$/);
    n.notesBefore = await h.notes();
    await h.snap('notes-empty');
    n.add = await h.addNote('Checked the figures.');
    n.notesAfter = await h.notes();
    n.toasts = await h.toasts();
    await h.snap('notes-after-add');
    await h.gotoTab(/^History$/);
    n.historyAfter = await h.history();
    await h.snap('notes-history-after-add');
    // The empty box.
    await h.gotoTab(/^Notes$/);
    n.empty = await h.addNote('');
    n.notesAfterEmpty = await h.notes();
    await h.snap('notes-after-empty');
    await h.closeLog();
    h.fact('notes 1b and empty', n);
    // Paging: 30 more notes, then History and Notes.
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    await h.gotoTab(/^Notes$/);
    for (let i = 1; i <= 30; i++) await h.addNote(`K1 paging note ${String(i).padStart(2, '0')}`);
    const pn = {notes: await h.notes()};
    pn.count = pn.notes.notes ? pn.notes.notes.length : null;
    pn.firstLast = pn.notes.notes ? [pn.notes.notes[0], pn.notes.notes[pn.notes.notes.length - 1]] : null;
    await h.snap('notes-paging-notes');
    await h.gotoTab(/^History$/);
    const hp = await h.history();
    pn.historyRows = hp.rows ? hp.rows.length : null;
    pn.historyHeads = hp.heads; pn.pager = hp.pager; pn.inputs = hp.inputs; pn.visibleLinks = hp.visibleLinks;
    pn.firstRows = hp.rows ? hp.rows.slice(0, 3) : null;
    pn.lastRows = hp.rows ? hp.rows.slice(-3) : null;
    pn.dates = hp.rows ? [...new Set(hp.rows.map((r) => r.cells[0]))] : null;
    await h.snap('notes-paging-history');
    await h.closeLog();
    h.fact('notes paging', pn);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase draft: td3 — a seeded submission with no decision, a draft, and the
// draft submitted through the wizard.

async function phaseDraft(app, S, h, page) {
    h.phase = 'draft';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    const d = {};
    await signIn(page, u('mg'), {contextPath: A.path});
    await h.openWf(h.edUrl(A.path, A.S0.submissionId));
    await h.openLog();
    d.s0 = await h.history();
    await h.snap('draft-s0-history');
    await h.closeLog();
    // The draft, typed by the manager.
    d.draftOpen = await h.openWf(h.edUrl(A.path, A.SD.submissionId));
    d.draftButtons = await h.headerButtons();
    const ds = await h.snap('draft-sd-wf');
    d.draftText = flat(ds.text.dialog || ds.text.main, 400);
    if (await h.logButton().count()) {
        await h.openLog();
        d.draftHistory = await h.history();
        await h.snap('draft-sd-history');
        await h.closeLog();
    }
    await signOut(page);
    // The author submits the draft through the wizard.
    if (!S.A.SDsubmitted) {
        await signIn(page, u('au'), {contextPath: A.path});
        try {
            if (app.name === 'ojs') {
                const {SubmissionWizardPage} = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPage.js'));
                const w = new SubmissionWizardPage(page, A.path);
                await w.goto(A.SD.submissionId);
                const g = page.getByRole('button', {name: 'Article Text', exact: true});
                if (await g.count()) { await g.first().click().catch(() => {}); await idle(page); }
                for (let i = 0; i < 6; i++) {
                    const cur = await w.currentStepLabel().innerText().catch(() => '');
                    if (/(^|\s)Review$/.test(cur.trim())) break;
                    await w.continueButton().click(); await idle(page); await sleep(800);
                }
                await w.submitAndConfirm();
            } else if (app.name === 'omp') {
                const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
                await page.goto(W.wizardUrl(A.path, A.SD.submissionId)); await idle(page);
                // The seeded file is already there; walk on to the Review step.
                for (const step of ['Details', 'Contributors', 'For the Editors']) await W.continueTo(page, step).catch((e) => h.L('continueTo', step, String(e).slice(0, 120)));
                await W.openReview(page);
                await W.confirmSubmit(page);
            } else {
                const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
                await page.goto(W.wizardUrl(A.path, A.SD.submissionId)); await idle(page);
                await W.completeAndSubmitDraft(page);
            }
            await h.snap('draft-submitted');
            S.A.SDsubmitted = true;
            fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
        } catch (e) {
            d.wizardError = String(e.stack || e).split('\n').slice(0, 3).join(' | ');
            await h.snap('draft-wizard-failed').catch(() => {});
        }
        await signOut(page);
    }
    await signIn(page, u('mg'), {contextPath: A.path});
    await h.openWf(h.edUrl(A.path, A.SD.submissionId));
    if (await h.logButton().count()) {
        await h.openLog();
        d.afterSubmit = await h.history();
        await h.snap('draft-sd-history-after-submit');
        await h.closeLog();
    }
    await signOut(page);
    // A draft begun on the start page (title only), read by the manager: "No Items"?
    try {
        await signIn(page, u('au'), {contextPath: A.path});
        const title = `K1 fresh ${A.t}`;
        if (app.name === 'ojs') {
            const {StartSubmissionPage} = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPage.js'));
            const sp = new StartSubmissionPage(page, A.path);
            await sp.goto(); await idle(page);
            await sp.fillTitle(title);
            if (await sp.checklistBox().count()) await sp.checklistBox().check();
            if (await sp.privacyBox().count()) await sp.privacyBox().check();
            await sp.begin();
        } else {
            const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
            await page.goto(app.url(W.startUrl(A.path))); await idle(page);
            await W.beginSubmission(page, {title});
        }
        const m = page.url().match(/[?&]id=(\d+)/);
        d.freshId = m ? Number(m[1]) : null;
        await h.snap('draft-fresh-wizard');
        await signOut(page);
        if (d.freshId) {
            await signIn(page, u('mg'), {contextPath: A.path});
            d.freshOpen = await h.openWf(h.edUrl(A.path, d.freshId));
            d.freshButtons = await h.headerButtons();
            if (await h.logButton().count()) {
                await h.openLog();
                d.freshHistory = await h.history();
                await h.snap('draft-fresh-history');
                await h.closeLog();
            }
            await signOut(page);
        }
    } catch (e) {
        d.freshError = String(e.stack || e).split('\n').slice(0, 3).join(' | ');
        await h.snap('draft-fresh-failed').catch(() => {});
        await signOut(page).catch(() => {});
    }
    h.fact('draft td3', d);
}

// ---------------------------------------------------------------------------
// Phase lang: Rule 8 (td9) — the same lines read in French and in English;
// a line written by an actor working in French, read in English.

async function phaseLang(app, S, h, page) {
    h.phase = 'lang';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    const id = A.S1.submissionId;
    const l = {};
    await signIn(page, u('mg'), {contextPath: A.path});
    // French reader.
    await h.openWf(h.edUrl(A.path, id, null, 'fr_CA'));
    l.frButtons = await h.headerButtons();
    await h.openLog();
    l.frTabs = await h.tabs();
    l.frTitle = flat(await h.log().innerText().catch(() => ''), 120);
    l.fr = await h.history();
    await h.snap('lang-fr-history');
    // The French actor posts a note.
    await h.gotoTab(/^Notes$/);
    l.frAdd = await h.addNote('Note en français K1.');
    l.frNotes = await h.notes();
    await h.snap('lang-fr-notes');
    await h.gotoTab(/^Historique$/);
    l.frAfter = await h.history();
    await h.closeLog();
    // English reader of the same lines.
    await h.openWf(h.edUrl(A.path, id, null, 'en'));
    await h.openLog();
    l.en = await h.history();
    await h.snap('lang-en-history');
    await h.closeLog();
    // Side by side, row by row.
    if (l.en.rows && l.frAfter.rows) {
        l.pairs = l.en.rows.map((r, i) => ({en: r.cells.slice(1).join(' ¦ ').slice(0, 220), fr: (l.frAfter.rows[i] || {cells: []}).cells.slice(1).join(' ¦ ').slice(0, 220)}));
    }
    h.fact('lang', l);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase admin: A4 — the Site Administrator as manager, then with no role
// but Reader.

async function endOwnManagerRole(h, page, app, ctx) {
    const rem = {};
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await idle(page);
    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
    await table.waitFor({state: 'visible', timeout: 30000}).catch(() => {});
    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
    rem.rowBefore = flat(await adminRow.innerText().catch(() => ''), 300);
    await adminRow.locator('button').last().click();
    await idle(page);
    rem.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
    await idle(page);
    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
    rem.roleRows = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    await h.snap('admin-edit-page');
    const roleRow = page.locator('tr').filter({hasText: /manager/i}).filter({has: page.getByRole('button', {name: /Remove Role/i})}).first();
    if (await roleRow.count()) {
        await roleRow.getByRole('button', {name: /Remove Role/i}).click();
        await idle(page);
        const dlg = page.locator('[role="dialog"]:visible').filter({hasText: /Remove Role/i}).last();
        await dlg.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        const resp = page.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\//.test(r.url()), {timeout: 15000}).catch(() => null);
        await dlg.getByRole('button', {name: /^Remove Role$/i}).click().catch(() => {});
        const rr = await resp;
        rem.removeRoleResponse = rr ? rr.status() : 'no request';
        await idle(page); await sleep(1200);
        rem.roleRowsAfter = await page.locator('tr').filter({has: page.getByRole('button', {name: /Remove Role/i})}).evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
        await h.snap('admin-edit-page-after');
    } else rem.noManagerRow = true;
    return rem;
}

async function phaseAdmin(app, S, h, page) {
    h.phase = 'admin';
    if (!S.D2) { S.D2 = await seedD2(app); fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2)); }
    // D: Reader beside the manager role; D2: an assistant role beside it.
    for (const [key, pfx] of [['D', 'admin'], ['D2', 'admin2']]) {
        const D = S[key];
        const id = D.SA.submissionId;
        const a = {role: D.role || 'reader'};
        try {
            // The manager writes a note first.
            await signIn(page, `${D.t}mg`, {contextPath: D.path});
            await h.openWf(h.edUrl(D.path, id));
            a.mg = await readWindow(h, page, `${pfx}-mg`, {addNote: `K1 note by the manager ${rnd()}.`});
            await signOut(page);
            if (!D.roleEnded) {
                // The administrator as manager (control).
                await signIn(page, 'admin', {contextPath: D.path});
                await h.openWf(h.edUrl(D.path, id));
                a.asManager = await readWindow(h, page, `${pfx}-asmanager`, {notes: true});
                a.remove = await endOwnManagerRole(h, page, app, D.path);
                D.roleEnded = true;
                fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
                await signOut(page).catch(() => {});
            }
            // The administrator without the manager role.
            await signIn(page, 'admin', {contextPath: D.path});
            a.landing = page.url();
            a.open = await h.openWf(h.edUrl(D.path, id));
            a.buttons = await h.headerButtons();
            const s = await h.snap(`${pfx}-norole-wf`);
            a.text = flat(s.text.dialog || s.text.main, 400);
            a.errorDialog = flat(await page.locator('[role="dialog"]:visible').filter({hasText: 'Error'}).last().innerText().catch(() => ''), 200);
            if (await h.logButton().count()) {
                await h.openLog();
                a.tabs = await h.tabs();
                a.firstNotes = await h.notes().catch(() => null);
                a.firstHistory = await h.history().catch(() => null);
                await h.snap(`${pfx}-norole-log`);
                a.add = await h.addNote(`K1 note by the administrator ${rnd()}.`);
                a.notesAfter = await h.notes();
                await h.snap(`${pfx}-norole-notes-after`);
                await h.closeLog();
            }
            // The dashboard the administrator lands on (a request list or an error).
            await page.goto(app.url(`/index.php/${D.path}/en/dashboard/editorial`)); await idle(page);
            const dsh = await h.snap(`${pfx}-norole-dashboard`);
            a.dashboard = flat(dsh.text.main, 300);
        } catch (e) {
            a.error = String(e.stack || e).split('\n').slice(0, 3).join(' | ');
            await h.snap(`${pfx}-failed`).catch(() => {});
        }
        h.fact(`admin A4 ${key}`, a);
        await signOut(page).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Phase dates: Settings bullets 1 and 2 at the default and at another form.

async function phaseDates(app, S, h, page) {
    h.phase = 'dates';
    const E = S.E;
    const id = E.S.submissionId;
    const d = {};
    await signIn(page, `${E.t}mg`, {contextPath: E.path});
    await h.openWf(h.edUrl(E.path, id));
    d.before = await readWindow(h, page, 'dates-default', {addNote: 'K1 note at the default format.'});
    // Settings › Website › Setup › Date & Time.
    await page.goto(app.url(`/index.php/${E.path}/en/management/settings/website`));
    await idle(page);
    await page.locator('#setup-button').first().click().catch(() => {});
    await idle(page);
    await page.getByRole('tab', {name: 'Date & Time'}).first().click().catch((e) => h.L('no Date & Time tab', String(e).slice(0, 100)));
    await idle(page); await sleep(600);
    const form = page.locator('form').filter({hasText: 'Date (Short)'}).first();
    await form.waitFor({timeout: 20000}).catch(() => {});
    d.form = await form.evaluate((f) => [...f.querySelectorAll('fieldset')].map((fs) => ({
        legend: (fs.querySelector('legend') || {}).innerText?.trim(),
        options: [...fs.querySelectorAll('input[type=radio]')].map((r) => ({value: r.value, checked: r.checked, label: (r.closest('label') || r.parentElement).innerText.trim()})),
        text: fs.querySelector('input[type=text]') ? 'custom text box' : null,
    }))).catch((e) => String(e));
    await h.snap('dates-form');
    // Date (Short) → d.m.Y; Date & Time (Short) → Custom "d.m.Y H:i".
    const fsShort = form.locator('fieldset').filter({has: page.locator('legend', {hasText: /^\s*Date \(Short\)/})}).first();
    await fsShort.locator('input[type=radio][value="d.m.Y"]').check().catch((e) => h.L('no d.m.Y radio', String(e).slice(0, 100)));
    const fsDT = form.locator('fieldset').filter({has: page.locator('legend', {hasText: /Date & Time \(Short\)/})}).first();
    const radios = fsDT.locator('input[type=radio]');
    const nR = await radios.count();
    if (nR) await radios.nth(nR - 1).check().catch(() => {});
    const txt = fsDT.locator('input[type=text]').first();
    if (await txt.count()) { await txt.fill('d.m.Y H:i'); }
    const saveResp = page.waitForResponse((r) => /\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).then((r) => r.status()).catch(() => null);
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    d.save = await saveResp;
    d.saved = await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 10000}).then(() => true).catch(() => false);
    await h.snap('dates-form-saved');
    await page.reload(); await idle(page);
    await h.openWf(h.edUrl(E.path, id));
    d.after = await readWindow(h, page, 'dates-changed', {addNote: 'K1 note at the changed format.'});
    h.fact('dates', d);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase anon: Rule 9 (td10) {OJS OMP}.

async function phaseAnon(app, S, h, page) {
    if (app.name === 'ops') return;
    h.phase = 'anon';
    const {ReviewWizardPage} = require(path.resolve(__dirname, '../../../pages/ReviewerPages.js'));
    for (const key of ['RA', 'RO']) {
        const R = S[key];
        const id = R.S.submissionId;
        const out = {};
        const fileName = `k1-${key.toLowerCase()}-reviewer-file.txt`;
        try {
            // r2 uploads a file in the review (step 3).
            if (!R.uploaded) {
                await signIn(page, `${R.t}r2`, {contextPath: R.path});
                const wz = new ReviewWizardPage(page, R.path, {privateBoxLabel: app.name === 'omp' ? 'For editor only' : 'For editor'});
                await page.goto(wz.url(id)); await idle(page);
                await h.snap(`anon-${key}-r2-wizard`);
                for (let i = 0; i < 3; i++) {
                    if (await wz.uploadFileLink.isVisible().catch(() => false)) break;
                    if (await wz.saveAndContinueButton.isVisible().catch(() => false)) {
                        const ci = wz.noCompetingInterestsRadio;
                        if (await ci.count()) await ci.check().catch(() => {});
                        const pv = wz.privacyBox;
                        if (await pv.count() && await pv.isVisible()) await pv.check().catch(() => {});
                        await wz.saveAndContinueButton.click();
                    } else if (await wz.acceptButton.isVisible().catch(() => false)) {
                        await wz.accept();
                    } else if (await wz.continueToStep3Button.isVisible().catch(() => false)) {
                        await wz.continueToStep3Button.click();
                    }
                    await idle(page); await sleep(1200);
                }
                await wz.expectReviewerFilesSettled().catch(() => {});
                await wz.uploadReviewerFile(fileName);
                await h.snap(`anon-${key}-r2-uploaded`);
                R.uploaded = true;
                fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
                await signOut(page);
            }
            // The manager: Modify Review on r1, Mark as Complete, Revert Decision.
            if (!R.modified) {
                await signIn(page, `${R.t}mg`, {contextPath: R.path});
                await h.openWf(h.edUrl(R.path, id));
                await page.getByRole('link', {name: 'Review Round 1'}).first().click().catch(() => {});
                await idle(page);
                const panel = page.locator('[data-cy="reviewer-manager"]');
                await panel.getByRole('row').nth(1).waitFor({timeout: 30000}).catch(() => {});
                const row = () => panel.getByRole('row').filter({hasText: 'Rhea One'});
                const details = () => page.getByRole('dialog', {name: /^Review Details:/});
                const editWin = () => page.getByRole('dialog', {name: /^Modify Review/});
                const confirmDlg = (text) => page.locator('[data-cy="dialog"]').filter({hasText: text});
                out.rowBefore = flat(await row().innerText().catch(() => ''), 300);
                const rr = row().getByRole('button', {name: 'Read Review', exact: true});
                if (await rr.count()) await rr.click();
                else {
                    await row().getByRole('button', {name: 'More Actions'}).click();
                    await page.getByRole('menu').last().getByRole('menuitem', {name: 'Review Details', exact: true}).click();
                }
                await details().waitFor({timeout: 20000});
                await details().getByRole('button', {name: 'Modify Review', exact: true}).and(page.locator(':enabled')).waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                await details().getByRole('button', {name: 'Modify Review', exact: true}).click();
                await confirmDlg('Modify this review?').waitFor({timeout: 10000});
                await confirmDlg('Modify this review?').getByRole('button', {name: 'Modify Review', exact: true}).click();
                await editWin().waitFor({timeout: 20000});
                const body = editWin().frameLocator('iframe.tox-edit-area__iframe').first().locator('body');
                await body.waitFor({timeout: 30000});
                await page.waitForFunction(() => window.tinymce && window.tinymce.get().some((e) => e.initialized), null, {timeout: 20000}).catch(() => {});
                await sleep(600);
                await body.click();
                await page.keyboard.press('ControlOrMeta+a');
                await page.keyboard.type('Revised by the editor K1.');
                await editWin().getByRole('button', {name: 'Save Changes', exact: true}).click();
                await editWin().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await idle(page); await sleep(800);
                await h.snap(`anon-${key}-modified`);
                // Mark as Complete.
                const mc = details().getByRole('button', {name: 'Mark as Complete', exact: true});
                if (await mc.isEnabled().catch(() => false)) {
                    await mc.click();
                    const dlg = confirmDlg('Mark this review as complete?');
                    await dlg.waitFor({timeout: 10000});
                    await dlg.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                    await page.getByText('The review has been marked as complete.').first().waitFor({timeout: 15000}).catch(() => {});
                    await idle(page); await sleep(600);
                }
                const cancel = details().getByRole('button', {name: 'Cancel', exact: true});
                if (await cancel.count()) await cancel.click().catch(() => {});
                await details().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await sleep(800);
                await page.goto(page.url()); await idle(page);
                await panel.getByRole('row').nth(1).waitFor({timeout: 30000}).catch(() => {});
                out.rowComplete = flat(await row().innerText().catch(() => ''), 300);
                // Revert Decision (button or row menu).
                let rev = row().getByRole('button', {name: 'Revert Decision', exact: true});
                if (!(await rev.count())) {
                    await row().getByRole('button', {name: 'More Actions'}).click();
                    const menu = page.getByRole('menu').last();
                    await menu.waitFor({timeout: 10000}).catch(() => {});
                    out.menuComplete = (await menu.getByRole('menuitem').allInnerTexts().catch(() => [])).map((s) => s.trim());
                    rev = menu.getByRole('menuitem', {name: 'Revert Decision'});
                }
                if (await rev.count()) {
                    await rev.first().click();
                    await sleep(800);
                    const dlg = page.locator('[data-cy="dialog"], [role="dialog"]').filter({hasText: /unconsider|revert|Revert/i}).last();
                    await dlg.waitFor({timeout: 10000}).catch(() => {});
                    out.revertDialog = {text: flat(await dlg.innerText().catch(() => ''), 400), buttons: (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim())};
                    await h.snap(`anon-${key}-revert-dialog`);
                    const okb = dlg.getByRole('button', {name: /^(Revert Decision|OK|Yes|Confirm)$/}).last();
                    await okb.click().catch(() => {});
                    await idle(page); await sleep(1200);
                    out.rowAfterRevert = flat(await row().innerText().catch(() => ''), 300);
                } else out.revert = 'no Revert Decision offered';
                R.modified = true;
                fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
                await signOut(page);
            }
            // Reads: the manager (control) and the author-editor.
            for (const who of ['mg', 'ae']) {
                await signIn(page, `${R.t}${who}`, {contextPath: R.path});
                const o = await h.openWf(h.edUrl(R.path, id));
                const r = {open: o, buttons: await h.headerButtons()};
                await h.snap(`anon-${key}-${who}-wf`);
                if (await h.logButton().count()) {
                    await h.openLog();
                    r.history = await h.history();
                    // The author-editor's read keeps only the lines Rule 9 names (reviewer
                    // assignment, acceptance, decline, unconsidered, reviewer files, review
                    // changes); nothing else of that view is saved (see the brief's frame).
                    const named = (x) => /has been assigned to review|has been accepted|has been declined|as unconsidered|was uploaded for file|metadata for file|was modified in this review/.test(x.cells[2] || '');
                    if (who === 'ae') r.history = {heads: r.history.heads, rows: (r.history.rows || []).filter(named)};
                    else await h.snap(`anon-${key}-${who}-history`);
                    r.controls = {};
                    const rows = (r.history.rows || []).filter((x) => x.toggle);
                    for (const x of rows) {
                        const c = await h.rowControls(x.cells[2].slice(0, 40));
                        r.controls[x.cells[2].slice(0, 90)] = c.links;
                    }
                    if (who !== 'ae') await h.snap(`anon-${key}-${who}-controls`);
                    // "View changes" pressed (the manager only; Actors row 3).
                    const vc = h.panelVisible().getByRole('link', {name: 'View changes'}).first();
                    if (who === 'mg' && await vc.count() && await vc.isVisible()) {
                        await vc.click(); await sleep(1500); await idle(page);
                        r.viewChanges = flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => ''), 600);
                        await h.snap(`anon-${key}-mg-view-changes`);
                        await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(Close|OK)$/}).last().click().catch(() => {});
                        await sleep(800);
                    }
                    await h.closeLog();
                }
                out[who] = r;
                await signOut(page);
            }
        } catch (e) {
            out.error = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
            await h.snap(`anon-${key}-failed`).catch(() => {});
        }
        h.fact(`anon ${key}`, out);
    }
}

// ---------------------------------------------------------------------------
// Phase neighbours: the file's "More Information", the discussion's
// "History", the Author's "Notifications" list (lines 25–32), and whether a
// file note or a discussion shows in the submission's own window.

async function phaseNeighbours(app, S, h, page) {
    h.phase = 'neighbours';
    const A = S.A;
    const u = (s) => `${A.t}${s}`;
    const ops = app.name === 'ops';
    const id = A.S1.submissionId;
    const n = {};
    await signIn(page, u('mg'), {contextPath: A.path});
    // The file's "More Information" (OJS, OMP: Submission stage's "Submission Files").
    if (!ops) {
        await h.openWf(h.edUrl(A.path, id, 'workflow_1'));
        const fileRow = page.locator('[role="dialog"]').getByRole('row').filter({hasText: 'article.pdf'}).first();
        await fileRow.waitFor({timeout: 20000}).catch(() => {});
        await fileRow.getByRole('button', {name: /More Actions/}).first().click().catch((e) => h.L('no file row menu', String(e).slice(0, 100)));
        await page.getByRole('menuitem', {name: 'More Information'}).first().click().catch((e) => h.L('no More Information', String(e).slice(0, 100)));
        await sleep(1500); await idle(page);
        const win = page.locator('[role="dialog"]:visible').last();
        await win.locator('table tbody tr').first().waitFor({timeout: 20000}).catch(() => {});
        n.fileWindow = {text: flat(await win.innerText().catch(() => ''), 600), tabs: (await win.getByRole('tab').allInnerTexts().catch(() => [])).map((s) => s.trim())};
        // A file note, then the submission's own Notes.
        const ft = win.getByRole('tab', {name: 'Notes'});
        if (await ft.count()) {
            await ft.click(); await idle(page); await sleep(600);
            await win.locator('textarea[name="newNote"]').fill('K1 file note');
            await win.locator('#newNoteForm').getByRole('button', {name: 'Add Note'}).click().catch(() => {});
            await idle(page); await sleep(1000);
        }
        await h.snap('neighbours-file-window');
        await win.getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
        await sleep(800);
    }
    // The discussion's own "History".
    await h.openWf(h.edUrl(A.path, id));
    const drow = page.getByRole('row').filter({hasText: `K1 D1 ${A.t}`}).first();
    if (await drow.waitFor({timeout: 15000}).then(() => true).catch(() => false)) {
        await drow.getByRole('button', {name: /More Actions/}).first().click().catch(() => {});
        await sleep(400);
        n.discussionMenu = (await page.getByRole('menuitem').allInnerTexts().catch(() => [])).map((s) => s.trim());
        await page.getByRole('menuitem', {name: 'History'}).first().click().catch(() => {});
        await sleep(1500); await idle(page);
        n.discussionHistory = flat(await page.locator('[role="dialog"]:visible').last().innerText().catch(() => ''), 600);
        await h.snap('neighbours-discussion-history');
        await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
        await sleep(800);
    } else n.discussion = 'row not found';
    // The submission's own window after the file note.
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    n.history = await h.history();
    await h.gotoTab(/^Notes$/);
    n.notes = await h.notes();
    await h.snap('neighbours-own-window');
    await h.closeLog();
    await signOut(page);
    // The Author's "Notifications" list.
    await signIn(page, u('au'), {contextPath: A.path});
    await h.openWf(h.auUrl(A.path, id, ops ? null : 'workflow_3'));
    const s = await h.snap('neighbours-author-view');
    n.author = {buttons: await h.headerButtons(), hasNotifications: /Notifications/.test(s.text.dialog || ''), text: flat(s.text.dialog, 900)};
    await signOut(page);
    // A letter to the Author ("Request Revisions" recorded on screen), then the Author's
    // "Notifications" list and the manager's History line for the same email (OJS, OMP).
    if (!ops && !A.letterSent) {
        try {
            await signIn(page, u('mg'), {contextPath: A.path});
            await h.openWf(h.edUrl(A.path, id));
            await page.getByRole('link', {name: 'Review Round 1'}).first().click().catch(() => {});
            await idle(page);
            await page.getByRole('button', {name: 'Request Revisions', exact: true}).first().click();
            const win = page.getByRole('dialog', {name: 'Request Revisions', exact: true});
            await win.getByRole('button', {name: 'Next', exact: true}).click();
            await win.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            for (let i = 0; i < 6; i++) {
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page); await sleep(600);
                const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
                if (await rec.isVisible().catch(() => false)) { await rec.click(); break; }
                await page.getByRole('button', {name: 'Continue', exact: true}).click();
            }
            await page.getByRole('link', {name: 'View Submission'}).first().waitFor({timeout: 30000}).catch(() => {});
            await h.snap('neighbours-letter-recorded');
            await h.openWf(h.edUrl(A.path, id));
            await h.openLog();
            const hl = await h.history();
            n.letterLines = (hl.rows || []).slice(0, 6).map((r) => r.cells.slice(1).join(' | '));
            await h.closeLog();
            await signOut(page);
            A.letterSent = true;
            fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
            await signIn(page, u('au'), {contextPath: A.path});
            await h.openWf(h.auUrl(A.path, id, 'workflow_3'));
            await page.getByRole('link', {name: /Review Round 1/}).first().click().catch(() => {});
            await idle(page); await sleep(800);
            const s2 = await h.snap('neighbours-author-letter');
            n.authorAfterLetter = {hasNotifications: /Notifications/.test(s2.text.dialog || ''), text: flat((s2.text.dialog || '').split(/Notifications/i).slice(1).join(' '), 400)};
            await signOut(page);
        } catch (e) {
            n.letterError = String(e.stack || e).split('\n').slice(0, 3).join(' | ');
            await h.snap('neighbours-letter-failed').catch(() => {});
            await signOut(page).catch(() => {});
        }
    }
    h.fact('neighbours', n);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const S = await seed(app);
    // Facts accumulate across runs of single phases (REUSE=1); a fresh seed starts afresh.
    const factsFile = path.join(outDir(), `facts-${app.name}.json`);
    const facts = REUSE && fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {};
    const {page, close} = await launch(app);
    const h = helpers(app, page, facts);
    const phases = {roles: phaseRoles, window: phaseWindow, notes: phaseNotes, draft: phaseDraft, lang: phaseLang, admin: phaseAdmin, dates: phaseDates, anon: phaseAnon, neighbours: phaseNeighbours};
    try {
        for (const p of PHASES) {
            try {
                await phases[p](app, S, h, page);
            } catch (e) {
                h.fact(`${p} PHASE FAILED`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
                await h.snap(`zz-${p}-failed`).catch(() => {});
                await signOut(page).catch(() => {});
            }
            record('facts', facts);
        }
    } finally {
        facts.browserDialogs = h.browserDialogs;
        record('facts', facts);
        await close();
    }
});
