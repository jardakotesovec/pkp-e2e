// U38 claim check, chunk K3 — the "Notes" tab of "Activity Log & Notes"
// (Rule 10: listing, 10a adding, 10b long notes, 10c deleting, 10d leaving
// with text typed; register A2, A3) and the cross-feature pointers checked
// on their own screens (the file's "More Information" window, a
// discussion's "History", "View changes", "Login As", the Author's
// "Notifications" list, Rule 3's wording families)
// (docs/specs/U38-submission-activity-log-and-notes.md, lines 200–228,
// 257–277, 348–363).
//
// Seeds its own scratch contexts per app (nothing on publicknowledge):
//   A — manager mg, section editor se (assigned), author au; OJS OMP also
//       editor ed, production editor pe, reviewer rv; OJS guest editor ge
//       (assigned). Submissions: N1 (a file or a galley, a discussion with a
//       first message), N2 (the notes and leaving legs), N3 (the order leg),
//       R {OJS OMP} (in review, a completed review), P {OPS} (a decline on
//       screen for the Author's view).
//   D — the Site Administrator holding an assistant role (Copyeditor; OPS
//       Editorial Board Member) beside the automatic manager role, which the
//       administrator ends on their own Users & Roles edit page.
//
//   PROBE_FEATURE=U38 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U38/K3/k3.js
//   PHASES=notes,levels,leave,filewin,filewin0,scope,order,viewchanges,author,loginas,admin (default all);
//   REUSE=1 reuses the last seeded contexts (seed-<app>.json in the output folder).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'notes,levels,leave,filewin,filewin0,scope,order,viewchanges,author,loginas,admin';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const LOG_BUTTON = /^Activity Log$/;

// ---------------------------------------------------------------------------
// Seeding

async function seed(app) {
    const file = path.join(outDir(), `seed-${app.name}.json`);
    if (REUSE && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const ops = app.name === 'ops';
    const ojs = app.name === 'ojs';
    const toReview = ojs ? 'sendExternalReview' : 'skipInternalReview';
    const t = tag('u38k3a');
    const u = (s) => `${t}${s}`;
    const users = [
        {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
        {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Section'},
        {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
    ];
    if (!ops) {
        users.push({username: u('ed'), roles: ['editor'], givenName: 'Eddie', familyName: 'Editor'});
        users.push({username: u('pe'), roles: ['productionEditor'], givenName: 'Pat', familyName: 'Production'});
        users.push({username: u('rv'), roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'});
    }
    if (ojs) users.push({username: u('ge'), roles: ['guestEditor'], givenName: 'Gil', familyName: 'Guest'});
    const C = await app.api.createContext({tag: t, users});
    const A = {t, path: C.path};
    const parts = [{username: u('se'), role: 'sectionEditor'}];
    if (ojs) parts.push({username: u('ge'), role: 'guestEditor'});
    const n1 = {tag: `${t}n1`, context: A.path, submitter: u('au'), title: `K3 N1 ${t}`, participants: parts,
        tasks: [{title: `K3 D1 ${t}`, creator: u('mg'), participants: [u('mg'), u('au')], message: `K3 discussion message ${t}.`}]};
    if (!ops) n1.files = [{file: 'article.pdf'}];
    else n1.galleys = [{label: 'PDF', file: 'preprint.pdf'}];
    A.N1 = await app.api.createSubmission(n1);
    A.N2 = await app.api.createSubmission({tag: `${t}n2`, context: A.path, submitter: u('au'), title: `K3 N2 ${t}`, participants: parts});
    A.N3 = await app.api.createSubmission({tag: `${t}n3`, context: A.path, submitter: u('au'), title: `K3 N3 ${t}`, participants: [{username: u('se'), role: 'sectionEditor'}]});
    if (!ops) {
        A.R = await app.api.createSubmission({tag: `${t}r`, context: A.path, submitter: u('au'), title: `K3 R ${t}`,
            participants: [{username: u('se'), role: 'sectionEditor'}], decisions: [toReview],
            reviewRounds: [{files: [{file: 'article.pdf'}], reviewers: [{username: u('rv'), status: 'completed'}]}]});
    } else {
        A.P = await app.api.createSubmission({tag: `${t}p`, context: A.path, submitter: u('au'), title: `K3 P ${t}`,
            participants: [{username: u('se'), role: 'sectionEditor'}]});
    }
    const S = {A};
    // D: the administrator in an assistant role.
    const td = tag('u38k3d');
    const assistantKey = ops ? 'editorialBoardMember' : 'copyeditor';
    const CD = await app.api.createContext({tag: td, users: [
        {username: `${td}mg`, roles: ['manager'], givenName: 'Nora', familyName: 'Manager'},
        {username: `${td}au`, roles: ['author'], givenName: 'Bo', familyName: 'Author'},
        {username: 'admin', roles: [assistantKey], givenName: 'Site', familyName: 'Admin'},
    ]});
    S.D = {t: td, path: CD.path, role: assistantKey,
        SA: await app.api.createSubmission({tag: `${td}s`, context: CD.path, submitter: `${td}au`, title: `K3 SA ${td}`})};
    fs.writeFileSync(file, JSON.stringify(S, null, 2));
    const ids = Object.fromEntries(Object.entries(A).filter(([, v]) => v && v.submissionId).map(([k, v]) => [k, v.submissionId]));
    console.log(`[${app.name} seed]`, JSON.stringify({A: A.path, ids, D: S.D.path}));
    return S;
}

function saveSeed(app, S) {
    fs.writeFileSync(path.join(outDir(), `seed-${app.name}.json`), JSON.stringify(S, null, 2));
}

// ---------------------------------------------------------------------------
// Helpers

function helpers(app, page, facts) {
    const h = {facts, phase: ''};
    const L = (...a) => console.log(`[${app.name}${h.phase ? ' ' + h.phase : ''}]`, ...a);
    h.L = L;
    h.fact = (k, v) => { facts[k] = v; L(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 4000)); };
    h.edUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.auUrl = (p, id, key) => app.url(`/index.php/${p}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
    // Browser dialogs (confirm/alert/beforeunload): recorded; accepted only when h.acceptConfirm is set.
    h.browserDialogs = [];
    h.acceptConfirm = false;
    // The page-leave question ("Leave site?") is accepted unless h.dismissUnload is set.
    h.dismissUnload = false;
    page.on('dialog', async (d) => {
        const accept = d.type() === 'beforeunload' ? !h.dismissUnload : h.acceptConfirm;
        h.browserDialogs.push({type: d.type(), message: d.message(), phase: h.phase, step: h.step || '-', answer: accept ? 'accept' : 'dismiss'});
        L('BROWSER DIALOG', d.type(), JSON.stringify(d.message()), accept ? '-> accept' : '-> dismiss', `(${h.step || '-'})`);
        if (accept) await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    h.dialogsSince = (n) => h.browserDialogs.slice(n).map((d) => `${d.type}: ${d.message} (${d.answer})`);
    h.header = () => page.locator('[data-cy="sidemodal-header"]').first();
    h.openWf = async (url, step) => {
        h.step = step || url.replace(/^.*index.php/, '');
        await page.goto(url).catch((e) => L('goto', String(e).slice(0, 120)));
        const ok = await h.header().waitFor({timeout: 20000}).then(() => true).catch(() => false);
        await idle(page);
        if (ok) await h.header().getByRole('button').first().waitFor({timeout: 10000}).catch(() => {});
        await sleep(400);
        return ok;
    };
    h.headerButtons = async () => (await h.header().getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    h.logButton = () => h.header().getByRole('button', {name: LOG_BUTTON});
    h.log = () => page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
    h.tabs = async () => h.log().locator('.pkp_controllers_informationCenter > ul > li').evaluateAll((lis) => lis.map((li) => ({
        text: li.innerText.trim(), selected: li.getAttribute('aria-selected'),
    }))).catch(() => []);
    h.selectedTab = async () => ((await h.tabs()).find((x) => x.selected === 'true') || {}).text || null;
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
    h.historyRows = async () => {
        const table = h.panelVisible().locator('table').first();
        if (!(await table.count())) return null;
        return table.evaluate((tb) => {
            const clean = (s) => (s || '').split('$(function')[0].trim().replace(/\s+/g, ' ');
            return [...tb.querySelectorAll('tbody tr.gridRow')].map((tr) => {
                const tds = [...tr.querySelectorAll(':scope > td')];
                return {date: clean(tds[0] && tds[0].innerText).replace(/^Settings\s*/, ''), user: clean(tds[1] && tds[1].innerText), event: clean(tds[2] && tds[2].innerText), toggle: !!tr.querySelector('a.show_extras')};
            });
        }).catch(() => null);
    };
    // The Notes panel, as data (works on any root holding a notes list: the submission's window or a file's).
    h.readNotes = async (root) => root.evaluate((r) => {
        const clean = (s) => (s || '').trim().replace(/\s+/g, ' ');
        const own = r.querySelector('#informationCenterNotes > .pkp_notes_list') || r.querySelector('.pkp_notes_list');
        const notes = own ? [...own.querySelectorAll(':scope > .note, .note')].filter((n) => n.closest('.pkp_notes_list') === own).map((n) => {
            const msg = n.querySelector('.message');
            const rm = msg ? msg.querySelector('.pkp_controllers_revealMore') : null;
            let html = null;
            if (rm) {
                const c = rm.cloneNode(true);
                c.querySelectorAll('.reveal_more_wrapper, script').forEach((e) => e.remove());
                html = c.innerHTML.trim();
            }
            const btn = rm ? rm.querySelector('.revealMoreButton') : null;
            const wrap = rm ? rm.querySelector('.reveal_more_wrapper') : null;
            return {
                id: n.id,
                user: clean((n.querySelector('.user') || {}).innerText),
                date: clean((n.querySelector('.date') || {}).innerText),
                text: msg ? (msg.innerText || '').replace(/\n?Read More\s*$/, '').trim().slice(0, 400) : null,
                html: html ? html.slice(0, 400) : html,
                height: rm ? Math.round(rm.getBoundingClientRect().height) : null,
                readMoreShown: !!(btn && btn.offsetParent !== null && wrap && getComputedStyle(wrap).display !== 'none'),
                del: !!n.querySelector('button[id^="deleteNote-"]'),
            };
        }) : [];
        const empty = own && own.querySelector('.no_notes') ? clean(own.querySelector('.no_notes').innerText) : null;
        const ta = r.querySelector('textarea[name="newNote"]');
        const form = r.querySelector('#newNoteForm, form[id*="NoteForm"], form[id*="noteForm"]');
        return {
            notes, empty, textarea: ta ? {value: ta.value, maxlength: ta.getAttribute('maxlength')} : null,
            formText: form ? clean(form.innerText) : null,
            buttons: [...r.querySelectorAll('button, a')].filter((b) => b.offsetParent !== null).map((b) => clean(b.innerText)).filter(Boolean),
            earlier: r.querySelector('#showPastNotesLink') ? clean(r.querySelector('#showPastNotesLink').innerText).slice(0, 200) : null,
        };
    }).catch((e) => ({err: String(e).slice(0, 200)}));
    h.notes = async () => h.readNotes(h.panelVisible());
    h.toastWait = async (re) => page.getByText(re).first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
    h.addNoteIn = async (root, text) => {
        const ta = root.locator('textarea[name="newNote"]');
        await ta.fill(text);
        const resp = page.waitForResponse((r) => /save-note|saveNote/i.test(r.url()), {timeout: 15000}).then((r) => r.status()).catch(() => null);
        await root.getByRole('button', {name: 'Add Note', exact: true}).click();
        const status = await resp;
        const toast = await h.toastWait(/Note posted\./);
        await idle(page);
        await sleep(400);
        return {status, toast};
    };
    h.addNote = async (text) => h.addNoteIn(h.panelVisible(), text);
    h.closeLog = async () => {
        const btn = h.log().getByRole('button', {name: /^Close$/}).first();
        if (await btn.count()) await btn.click().catch(() => {});
        await h.log().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await sleep(600);
    };
    h.logOpen = async () => h.log().isVisible().catch(() => false);
    return h;
}

// ---------------------------------------------------------------------------
// Phase notes: Rule 10, 10a, 10b, 10c; A2; td11, td12 — the manager on N2.

async function phaseNotes(app, S, h, page) {
    h.phase = 'notes';
    const A = S.A;
    const id = A.N2.submissionId;
    const n = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    await h.openWf(h.edUrl(A.path, id));
    n.header = await h.headerButtons();
    await h.openLog();
    n.historyBefore = await h.historyRows();
    await h.gotoTab(/^Notes$/);
    n.empty = await h.notes();
    await h.snap('notes-empty');
    await loc(page, 'Notes tab: the note box', h.panelVisible().locator('textarea[name="newNote"]'));
    await loc(page, 'Notes tab: the "Add Note" button', h.panelVisible().getByRole('button', {name: 'Add Note', exact: true}));
    await loc(page, 'Notes tab: the note box by label', h.panelVisible().getByRole('textbox', {name: 'Add Note'}));
    // 10a: a note, then the list, the box and the toast.
    n.add1 = await h.addNote('K3 first note.');
    n.after1 = await h.notes();
    await h.snap('notes-after-first');
    // 10a: History.
    await h.gotoTab(/^History$/);
    n.historyAfter1 = (await h.historyRows() || []).slice(0, 3);
    await h.snap('notes-history-after-first');
    await h.gotoTab(/^Notes$/);
    // A2: the empty box.
    n.addEmpty = await h.addNote('');
    n.afterEmpty = await h.notes();
    await h.snap('notes-after-empty');
    // td11: two lines; then the tags.
    n.addTwo = await h.addNote('First line\nSecond line');
    n.addBold = await h.addNote('<b>bold</b>');
    n.afterTd11 = await h.notes();
    await h.snap('notes-td11');
    // td12: 30 short lines (the collapsed run), a long paragraph, and a short note (control).
    const thirty = Array.from({length: 30}, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`).join('\n');
    n.addThirty = await h.addNote(thirty);
    const para = Array.from({length: 60}, (_, i) => `Sentence ${i + 1} of a long remark about the manuscript and its figures.`).join(' ');
    n.addLong = await h.addNote(para);
    n.addShort = await h.addNote('K3 short note.');
    n.afterTd12 = await h.notes();
    await h.snap('notes-td12');
    // Press "Read More" on every note that shows it.
    const panel = h.panelVisible();
    const rmButtons = panel.locator('.note .revealMoreButton:visible');
    n.readMoreVisibleCount = await rmButtons.count();
    await loc(page, 'Notes tab: a long note\'s "Read More"', panel.getByRole('button', {name: 'Read More', exact: true}));
    if (n.readMoreVisibleCount) {
        await rmButtons.first().click();
        await sleep(600);
        n.afterReadMore = await h.notes();
        await h.snap('notes-td12-readmore-pressed');
    }
    n.dateFormatOk = (n.afterTd12.notes || []).every((x) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} (AM|PM)$/.test(x.date));
    // 10c: Delete — Cancel, then OK.
    await h.gotoTab(/^History$/);
    const hBefore = await h.historyRows() || [];
    n.historyCountBeforeDelete = hBefore.length;
    n.postedBeforeDelete = hBefore.filter((r) => r.event === 'Posted new note.').length;
    await h.gotoTab(/^Notes$/);
    const firstNote = () => h.panelVisible().locator('.pkp_notes_list .note').filter({hasText: 'K3 first note.'}).first();
    await loc(page, 'Notes tab: a note\'s "Delete"', firstNote().getByRole('button', {name: 'Delete', exact: true}));
    await firstNote().getByRole('button', {name: 'Delete', exact: true}).click();
    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this note?'}).last();
    await confirm.waitFor({timeout: 10000}).catch(() => {});
    n.deleteDialog = {text: flat(await confirm.innerText().catch(() => ''), 300), buttons: (await confirm.getByRole('button').allInnerTexts().catch(() => [])).map((s) => s.trim())};
    await h.snap('notes-delete-dialog');
    await loc(page, 'Delete note: the "Confirm" dialog', confirm);
    await confirm.getByRole('button', {name: 'Cancel', exact: true}).click().catch((e) => h.L('no Cancel', String(e).slice(0, 100)));
    await sleep(600);
    n.afterCancel = {stillThere: await firstNote().count(), dialogOpen: await confirm.isVisible().catch(() => false)};
    await h.snap('notes-delete-cancelled');
    await firstNote().getByRole('button', {name: 'Delete', exact: true}).click();
    await confirm.waitFor({timeout: 10000}).catch(() => {});
    const delResp = page.waitForResponse((r) => /delete-note|deleteNote/i.test(r.url()), {timeout: 15000}).then((r) => r.status()).catch(() => null);
    await confirm.getByRole('button', {name: 'OK', exact: true}).click();
    n.deleteStatus = await delResp;
    n.deletedToast = await h.toastWait(/Note deleted\./);
    await idle(page); await sleep(500);
    n.afterDelete = {stillThere: await firstNote().count(), notes: (await h.notes()).notes.map((x) => x.text.slice(0, 40))};
    await h.snap('notes-after-delete');
    await h.gotoTab(/^History$/);
    const hAfter = await h.historyRows() || [];
    n.historyCountAfterDelete = hAfter.length;
    n.postedAfterDelete = hAfter.filter((r) => r.event === 'Posted new note.').length;
    n.historyTopAfterDelete = hAfter.slice(0, 3);
    await h.snap('notes-history-after-delete');
    await h.closeLog();
    h.fact('notes', n);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase levels: another writer (the Section editor adds a note: name, order),
// and every editorial level's "Delete" on notes others wrote; the Author's
// header (control).

async function phaseLevels(app, S, h, page) {
    h.phase = 'levels';
    const A = S.A;
    const id = A.N2.submissionId;
    const out = {};
    const levels = ['se'];
    if (app.name !== 'ops') levels.push('ed', 'pe');
    if (app.name === 'ojs') levels.push('ge');
    levels.push('mg');
    for (const k of levels) {
        const r = {};
        await signIn(page, `${A.t}${k}`, {contextPath: A.path});
        await h.openWf(h.edUrl(A.path, id));
        r.header = await h.headerButtons();
        if (await h.logButton().count()) {
            await h.openLog();
            await h.gotoTab(/^Notes$/);
            if (k === 'se') r.add = await h.addNote('K3 note by the section editor.');
            const nt = await h.notes();
            r.notes = (nt.notes || []).map((x) => `${x.user} | ${x.text.slice(0, 30)} | del=${x.del}`);
            r.delCount = (nt.notes || []).filter((x) => x.del).length;
            r.count = (nt.notes || []).length;
            await h.snap(`levels-${k}-notes`);
            await h.closeLog();
        }
        out[k] = r;
        await signOut(page);
    }
    // The Author (control): the header offers no "Activity Log".
    await signIn(page, `${A.t}au`, {contextPath: A.path});
    await h.openWf(h.auUrl(A.path, id));
    out.au = {header: await h.headerButtons()};
    await h.snap('levels-au-wf');
    await signOut(page);
    h.fact('levels', out);
}

// ---------------------------------------------------------------------------
// Phase leave: 10d / A3 — text typed and not added, then the tab switch, the
// window's "Close", Escape and leaving the page.

async function phaseLeave(app, S, h, page) {
    h.phase = 'leave';
    const A = S.A;
    if (!A.N4) {
        A.N4 = await app.api.createSubmission({tag: `${A.t}n4`, context: A.path, submitter: `${A.t}au`, title: `K3 N4 ${A.t}`,
            participants: [{username: `${A.t}se`, role: 'sectionEditor'}]});
        saveSeed(app, S);
    }
    const out = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    const ta = () => h.panelVisible().locator('textarea[name="newNote"]');
    const away = app.url(`/index.php/${A.path}/en/dashboard/editorial`);
    let id = null;
    // A fresh page and window on "Notes" (a question on leaving the previous page is accepted and logged).
    const fresh = async (step) => {
        h.step = `page left before ${step}`;
        await h.openWf(h.edUrl(A.path, id), step);
        await h.openLog();
        await h.gotoTab(/^Notes$/);
    };
    const state = async () => {
        const open = await h.logOpen();
        return {windowOpen: open, workflowOpen: await h.header().isVisible().catch(() => false),
            selected: open ? await h.selectedTab() : null, box: open ? await h.log().locator('textarea[name="newNote"]').inputValue().catch(() => null) : null};
    };
    const act = async (label, fn, {accept = false, dismissUnload = false} = {}) => {
        const n0 = h.browserDialogs.length;
        h.acceptConfirm = accept;
        h.dismissUnload = dismissUnload;
        h.step = label;
        await fn();
        await sleep(1300); await idle(page);
        h.acceptConfirm = false;
        h.dismissUnload = false;
        const r = {dialogs: h.dialogsSince(n0), ...(await state()), url: page.url().replace(/^.*index\.php/, '').slice(0, 90)};
        await h.snap(`leave-${label}`);
        return r;
    };
    const closeBtn = () => h.log().getByRole('button', {name: /^Close$/}).first();
    const goAway = () => page.goto(away).catch((e) => h.L('goto', String(e).split('\n')[0]));
    for (const [key, sub] of [['n4', A.N4], ['n2', A.N2]]) {
        id = sub.submissionId;
        const o = {};
        // C1: typed, then the window's "Close" (dismissed, then accepted); reopened; then the page left with nothing typed.
        await fresh(`${key}-c1`);
        o.notesBefore = (await h.notes()).notes.length;
        await ta().fill('Draft remark');
        o.c1close = await act(`${key}-c1-close-dismiss`, () => closeBtn().click());
        if (o.c1close.windowOpen) o.c1closeOk = await act(`${key}-c1-close-accept`, () => closeBtn().click(), {accept: true});
        if (!(await h.logOpen())) { await h.openLog(); await h.gotoTab(/^Notes$/); }
        o.c1reopened = {box: await ta().inputValue().catch(() => null), notes: (await h.notes()).notes.length};
        await h.snap(`leave-${key}-c1-reopened`);
        await h.closeLog();
        o.c1leaveAfter = await act(`${key}-c1-page-left-nothing-typed`, goAway, {dismissUnload: true});
        // C2: typed, then "History" (dismissed, then accepted), back to "Notes".
        await fresh(`${key}-c2`);
        await ta().fill('Draft remark');
        o.c2tab = await act(`${key}-c2-tab-dismiss`, () => h.tab(/^History$/).click());
        o.c2tabOk = await act(`${key}-c2-tab-accept`, () => h.tab(/^History$/).click(), {accept: true});
        await h.gotoTab(/^Notes$/);
        o.c2back = {box: await ta().inputValue().catch(() => null)};
        await h.snap(`leave-${key}-c2-back`);
        await h.closeLog();
        o.c2leaveAfter = await act(`${key}-c2-page-left-nothing-typed`, goAway, {dismissUnload: true});
        // C3: typed, then Escape (in the box; then on the window's title).
        await fresh(`${key}-c3`);
        await ta().fill('Draft remark by Escape');
        o.c3escBox = await act(`${key}-c3-escape-in-box`, () => ta().press('Escape'));
        if (await h.logOpen()) {
            await h.log().locator('h1, h2').first().click().catch(() => {});
            o.c3escWin = await act(`${key}-c3-escape-on-window`, () => page.keyboard.press('Escape'));
            if (await h.logOpen()) o.c3escWinOk = await act(`${key}-c3-escape-on-window-accept`, () => page.keyboard.press('Escape'), {accept: true});
        }
        // C4: typed, the box left (a click on the window's title, as a person reaching for a link or the address bar),
        // then another address (the page-leave question dismissed, then accepted).
        await fresh(`${key}-c4`);
        await ta().fill('Draft remark by leaving the page');
        await h.log().locator('h1, h2').first().click().catch(() => {});
        o.c4stay = await act(`${key}-c4-leave-dismiss`, goAway, {dismissUnload: true});
        o.c4go = await act(`${key}-c4-leave-accept`, goAway);
        // Nothing of the drafts was posted.
        await fresh(`${key}-final`);
        o.notesAfter = (await h.notes()).notes.length;
        await h.closeLog();
        out[key] = o;
    }
    h.fact('leave', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// The file's (OJS OMP) or galley's (OPS) "More Information" window on N1.

async function openFileWindow(app, S, h, page, key = 'N1') {
    const A = S.A;
    const id = A[key].submissionId;
    if (app.name !== 'ops') {
        await h.openWf(h.edUrl(A.path, id, 'workflow_1'));
        const fileRow = page.locator('[role="dialog"]').getByRole('row').filter({hasText: 'article.pdf'}).first();
        await fileRow.waitFor({timeout: 20000}).catch(() => {});
        await fileRow.getByRole('button', {name: /More Actions/}).first().click();
        await page.getByRole('menuitem', {name: 'More Information'}).first().click();
        const win = page.getByRole('dialog', {name: 'Information Center: article.pdf', exact: true});
        await win.getByRole('tab').first().waitFor({timeout: 30000});
        await win.locator('table tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page); await sleep(400);
        return win;
    }
    const {WorkflowPage} = require(path.resolve(__dirname, '../../../pages/WorkflowPage.js'));
    const {GalleyFilesPage} = require(path.join(app.suiteDir, 'pages', 'SubmissionFilesPages.js'));
    const wf = new WorkflowPage(page, A.path, {labels: {publicationGroup: 'Preprint'}});
    await h.openWf(h.edUrl(A.path, id));
    await wf.selectPage('Galleys');
    const g = new GalleyFilesPage(page, wf);
    const win = await g.openGalleyInformation('PDF');
    await win.locator('table tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
    await idle(page); await sleep(400);
    return win;
}

async function fileTab(page, win, name) {
    await win.getByRole('tab', {name, exact: true}).click();
    await idle(page);
    await sleep(700);
    return win.getByRole('tabpanel', {name});
}

// Phase filewin: the file's window — tabs, "Search" / "Show events from prior
// versions", "Earlier Revision Notes" (lines 261–264), the empty note (A2's
// cross-reference) and the text typed and not added (A3's cross-reference).

async function phaseFileWin(app, S, h, page) {
    h.phase = 'filewin';
    const A = S.A;
    const out = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    let win = await openFileWindow(app, S, h, page);
    out.title = flat(await win.locator('h1').first().innerText().catch(() => ''), 120);
    out.tabs = (await win.getByRole('tab').allInnerTexts()).map((s) => s.trim());
    const hp = win.getByRole('tabpanel', {name: 'History'});
    out.historyControls = (await hp.locator('a:visible, button:visible').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
    await h.snap('filewin-history');
    const search = hp.locator('a:visible, button:visible').filter({hasText: /^\s*Search\s*$/}).first();
    if (await search.count()) {
        await search.click(); await sleep(800);
        out.searchOpened = flat(await hp.innerText().catch(() => ''), 400);
        out.priorBox = await hp.getByText('Show events from prior versions').count();
        await h.snap('filewin-history-search');
    } else out.search = 'no Search';
    let np = await fileTab(page, win, 'Notes');
    out.notesBefore = await h.readNotes(np);
    await h.snap('filewin-notes');
    // A2 cross-reference: the empty box.
    out.empty = await h.addNoteIn(np, '');
    out.notesAfterEmpty = await h.readNotes(np);
    await h.snap('filewin-notes-after-empty');
    // A3 cross-reference: text typed, tab switch (dismissed, then accepted).
    await np.locator('textarea[name="newNote"]').fill('Draft file remark');
    let n0 = h.browserDialogs.length;
    h.acceptConfirm = false;
    await win.getByRole('tab', {name: 'History', exact: true}).click();
    await sleep(1200);
    out.tabDismiss = {dialogs: h.dialogsSince(n0), selected: await win.getByRole('tab', {name: 'Notes', exact: true}).getAttribute('aria-selected').catch(() => null)};
    n0 = h.browserDialogs.length;
    h.acceptConfirm = true;
    await win.getByRole('tab', {name: 'History', exact: true}).click();
    await sleep(1200);
    h.acceptConfirm = false;
    out.tabAccept = {dialogs: h.dialogsSince(n0), historySelected: await win.getByRole('tab', {name: 'History', exact: true}).getAttribute('aria-selected').catch(() => null)};
    np = await fileTab(page, win, 'Notes');
    out.backBox = await np.locator('textarea[name="newNote"]').inputValue().catch(() => null);
    // Close with text typed (dismissed, then accepted).
    await np.locator('textarea[name="newNote"]').fill('Draft file remark on close');
    n0 = h.browserDialogs.length;
    await win.getByRole('button', {name: 'Close', exact: true}).first().click();
    await sleep(1200);
    out.closeDismiss = {dialogs: h.dialogsSince(n0), windowOpen: await win.isVisible().catch(() => false)};
    await h.snap('filewin-close-dismissed');
    if (await win.isVisible().catch(() => false)) {
        n0 = h.browserDialogs.length;
        h.acceptConfirm = true;
        await win.getByRole('button', {name: 'Close', exact: true}).first().click();
        await sleep(1200);
        h.acceptConfirm = false;
        out.closeAccept = {dialogs: h.dialogsSince(n0), windowOpen: await win.isVisible().catch(() => false)};
    }
    await h.snap('filewin-closed');
    // The page left afterwards, with nothing typed on screen.
    n0 = h.browserDialogs.length;
    h.dismissUnload = true;
    h.step = 'filewin page left after close';
    await page.goto(app.url(`/index.php/${A.path}/en/dashboard/editorial`)).catch((e) => h.L('goto', String(e).split('\n')[0]));
    await sleep(1000);
    h.dismissUnload = false;
    out.leaveAfterClose = {dialogs: h.dialogsSince(n0), url: page.url().replace(/^.*index\.php/, '').slice(0, 90)};
    await h.snap('filewin-page-left-after-close');
    // Reopen: the draft is gone; the empty note is listed.
    win = await openFileWindow(app, S, h, page);
    np = await fileTab(page, win, 'Notes');
    out.reopened = await h.readNotes(np);
    await h.snap('filewin-reopened-notes');
    await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await sleep(800);
    h.fact('filewin', out);
    await signOut(page);
}

// Phase filewin0: the file's window while the file has no note — text typed,
// then "Close" (the other end of the notes axis for A3's cross-reference).

async function phaseFileWin0(app, S, h, page) {
    h.phase = 'filewin0';
    const A = S.A;
    if (!A.N5) {
        const n5 = {tag: `${A.t}n5`, context: A.path, submitter: `${A.t}au`, title: `K3 N5 ${A.t}`};
        if (app.name !== 'ops') n5.files = [{file: 'article.pdf'}]; else n5.galleys = [{label: 'PDF', file: 'preprint.pdf'}];
        A.N5 = await app.api.createSubmission(n5);
        saveSeed(app, S);
    }
    const out = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    const win = await openFileWindow(app, S, h, page, 'N5');
    const np = await fileTab(page, win, 'Notes');
    out.notesBefore = (await h.readNotes(np)).notes.length;
    out.formsInWindow = await win.locator('form').evaluateAll((fs) => fs.map((f) => f.id || f.getAttribute('name') || f.className));
    await np.locator('textarea[name="newNote"]').fill('Draft file remark');
    let n0 = h.browserDialogs.length;
    h.step = 'filewin0 close';
    await win.getByRole('button', {name: 'Close', exact: true}).first().click();
    await sleep(1300);
    out.close = {dialogs: h.dialogsSince(n0), windowOpen: await win.isVisible().catch(() => false)};
    await h.snap('filewin0-close');
    if (out.close.windowOpen) {
        n0 = h.browserDialogs.length;
        h.acceptConfirm = true;
        await win.getByRole('button', {name: 'Close', exact: true}).first().click();
        await sleep(1300);
        h.acceptConfirm = false;
        out.closeOk = {dialogs: h.dialogsSince(n0), windowOpen: await win.isVisible().catch(() => false)};
    }
    // The submission window's forms, for comparison (N4: no notes; N2: notes).
    for (const k of ['N4', 'N2']) {
        await h.openWf(h.edUrl(A.path, A[k].submissionId));
        await h.openLog();
        await h.gotoTab(/^Notes$/);
        out[`forms ${k}`] = await h.log().locator('form').evaluateAll((fs) => fs.map((f) => f.id || f.className));
        await h.closeLog();
    }
    h.fact('filewin0', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase scope: line 206 (a file's notes and a discussion's messages are not
// listed here), lines 265–267 (the discussion's own History), line 275
// (Rule 3's families read on this History).

async function phaseScope(app, S, h, page) {
    h.phase = 'scope';
    const A = S.A;
    const id = A.N1.submissionId;
    const out = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    // A file note.
    const win = await openFileWindow(app, S, h, page);
    const np = await fileTab(page, win, 'Notes');
    out.fileNote = await h.addNoteIn(np, `K3 file note ${A.t}.`);
    out.fileNotes = await h.readNotes(np);
    await h.snap('scope-file-note');
    await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
    await sleep(800);
    // The discussion: its first message, and its own History.
    const T = require(path.resolve(__dirname, '../../../pages/TasksDiscussionsPages.js'));
    const title = app.name === 'ops' ? 'Production Tasks & Discussions' : 'Desk Review Tasks & Discussions';
    const panel = new T.TasksDiscussionsPanel(page, A.path, {title, labels: app.name === 'ops' ? {publicationGroup: 'Preprint'} : {}});
    try {
        await panel.gotoEditorial(id, app.name === 'ops' ? null : 'workflow_1');
        const dname = `K3 D1 ${A.t}`;
        const item = await panel.openItem(dname);
        const s = await h.snap('scope-discussion');
        out.discussion = flat(s.text.dialog, 600);
        await page.getByRole('dialog').last().getByRole('button', {name: /^(Close|Cancel)$/}).last().click().catch(() => {});
        await sleep(800);
        await panel.reland();
        await panel.openMenu(dname);
        out.discussionMenu = await panel.menuLabels();
        await panel.menuItem('History').click();
        await sleep(1500); await idle(page);
        const hs = await h.snap('scope-discussion-history');
        out.discussionHistory = flat(hs.text.dialog, 600);
        await page.getByRole('dialog').last().getByRole('button', {name: /^Close$/}).first().click().catch(() => {});
        await sleep(800);
        void item;
    } catch (e) {
        out.discussionError = String(e.message || e).split('\n')[0];
        await h.snap('scope-discussion-failed').catch(() => {});
    }
    // The submission's own window.
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    out.history = (await h.historyRows() || []).map((r) => `${r.user} | ${r.event}`);
    await h.snap('scope-own-history');
    await h.gotoTab(/^Notes$/);
    out.notes = await h.notes();
    await h.snap('scope-own-notes');
    await h.closeLog();
    h.fact('scope', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase order: "oldest first" (line 200) — 24 notes, two deleted, 8 more,
// read twice (the window reopened in between).

async function phaseOrder(app, S, h, page) {
    h.phase = 'order';
    const A = S.A;
    const id = A.N3.submissionId;
    const out = {};
    const run = (A.orderRuns || 0) + 1;
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    await h.gotoTab(/^Notes$/);
    const pre = `K3 order r${run}`;
    for (let i = 1; i <= 24; i++) await h.addNote(`${pre} ${String(i).padStart(2, '0')}`);
    for (const k of ['05', '12']) {
        const nt = h.panelVisible().locator('.pkp_notes_list .note').filter({hasText: `${pre} ${k}`}).first();
        await nt.getByRole('button', {name: 'Delete', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this note?'}).last();
        await confirm.waitFor({timeout: 10000});
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await h.toastWait(/Note deleted\./);
        await idle(page); await sleep(300);
    }
    for (let i = 25; i <= 32; i++) await h.addNote(`${pre} ${String(i).padStart(2, '0')}`);
    const read = async () => (await h.notes()).notes.map((x) => x.text);
    out.first = await read();
    await h.snap(`order-r${run}-first`);
    await h.closeLog();
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    await h.gotoTab(/^Notes$/);
    out.second = await read();
    await h.snap(`order-r${run}-second`);
    await h.closeLog();
    const inOrder = (arr) => {
        const nums = arr.map((t) => { const m = t.match(/K3 order r(\d+) (\d+)/); return m ? Number(m[1]) * 100 + Number(m[2]) : null; }).filter((x) => x !== null);
        return nums.every((v, i) => i === 0 || v > nums[i - 1]);
    };
    out.firstInOrder = inOrder(out.first);
    out.secondInOrder = inOrder(out.second);
    out.sameTwice = JSON.stringify(out.first) === JSON.stringify(out.second);
    A.orderRuns = run;
    saveSeed(app, S);
    h.fact(`order run ${run}`, out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase viewchanges {OJS OMP}: lines 268–269 — a review modified on screen,
// its History line and "View changes".

async function phaseViewChanges(app, S, h, page) {
    if (app.name === 'ops') return;
    h.phase = 'viewchanges';
    const A = S.A;
    const id = A.R.submissionId;
    const out = {};
    await signIn(page, `${A.t}mg`, {contextPath: A.path});
    if (!A.modified) {
        await h.openWf(h.edUrl(A.path, id));
        await page.getByRole('link', {name: 'Review Round 1'}).first().click().catch(() => {});
        await idle(page);
        const panel = page.locator('[data-cy="reviewer-manager"]');
        await panel.getByRole('row').nth(1).waitFor({timeout: 30000}).catch(() => {});
        const row = () => panel.getByRole('row').filter({hasText: 'Rex Reviewer'});
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
        await page.keyboard.type('Revised by the editor K3.');
        await editWin().getByRole('button', {name: 'Save Changes', exact: true}).click();
        await editWin().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await idle(page); await sleep(800);
        await h.snap('vc-modified');
        const cancel = details().getByRole('button', {name: 'Cancel', exact: true});
        if (await cancel.count()) await cancel.click().catch(() => {});
        await details().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await sleep(800);
        A.modified = true;
        saveSeed(app, S);
    }
    await h.openWf(h.edUrl(A.path, id));
    await h.openLog();
    const rows = await h.historyRows() || [];
    out.reviewLines = rows.filter((r) => /review/i.test(r.event)).map((r) => `${r.user} | ${r.event} | toggle=${r.toggle}`);
    await h.snap('vc-history');
    const line = rows.find((r) => /was modified in this review/.test(r.event));
    if (line) {
        const row = h.panelVisible().locator('tr.gridRow').filter({hasText: 'was modified in this review'}).first();
        await row.locator('a.show_extras').click();
        const controls = row.locator('xpath=following-sibling::tr[1]');
        await controls.waitFor({timeout: 10000}).catch(() => {});
        await sleep(300);
        out.controls = (await controls.locator('a:visible, button:visible').allInnerTexts().catch(() => [])).map((s) => s.trim()).filter(Boolean);
        await h.snap('vc-controls');
        const vc = controls.getByRole('link', {name: 'View changes'}).first();
        await loc(page, 'History: a review line\'s "View changes"', vc);
        if (await vc.count()) {
            await vc.click(); await sleep(1500); await idle(page);
            const d = page.locator('[role="dialog"]:visible').last();
            out.viewChanges = {title: flat(await d.locator('h1, h2').first().innerText().catch(() => ''), 120), text: flat(await d.innerText().catch(() => ''), 600)};
            await h.snap('vc-window');
            await d.getByRole('button', {name: /^(Close|OK)$/}).last().click().catch(() => {});
            await sleep(800);
        }
    } else out.noModifiedLine = true;
    await h.closeLog().catch(() => {});
    h.fact('viewchanges', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase author: lines 272–273 — a decision letter recorded on screen, then
// the Author's view: the "Notifications" list (OJS OMP on R's review stage;
// OPS on P after "Decline Submission").

async function recordDecision(h, page, button) {
    await page.getByRole('button', {name: button, exact: true}).first().click();
    const win = page.getByRole('dialog', {name: button, exact: true});
    if (await win.isVisible().catch(() => false)) {
        await win.getByRole('button', {name: 'Next', exact: true}).click().catch(() => {});
        await win.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    }
    for (let i = 0; i < 6; i++) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await sleep(600);
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        if (await rec.isVisible().catch(() => false)) { await rec.click(); break; }
        await page.getByRole('button', {name: 'Continue', exact: true}).click();
    }
    await page.getByRole('link', {name: 'View Submission'}).first().waitFor({timeout: 30000}).catch(() => {});
}

async function phaseAuthor(app, S, h, page) {
    h.phase = 'author';
    const A = S.A;
    const ops = app.name === 'ops';
    const sub = ops ? A.P : A.R;
    const id = sub.submissionId;
    const out = {};
    if (!A.letterSent) {
        await signIn(page, `${A.t}mg`, {contextPath: A.path});
        await h.openWf(h.edUrl(A.path, id));
        try {
            if (!ops) {
                await page.getByRole('link', {name: 'Review Round 1'}).first().click().catch(() => {});
                await idle(page);
                await recordDecision(h, page, 'Request Revisions');
            } else {
                await recordDecision(h, page, 'Decline Submission');
            }
            await h.snap('author-letter-recorded');
            A.letterSent = true;
            saveSeed(app, S);
        } catch (e) {
            out.letterError = String(e.message || e).split('\n')[0];
            await h.snap('author-letter-failed').catch(() => {});
        }
        await h.openWf(h.edUrl(A.path, id));
        await h.openLog();
        out.managerHistoryTop = (await h.historyRows() || []).slice(0, 4).map((r) => `${r.user} | ${r.event}`);
        await h.closeLog();
        await signOut(page);
    }
    await signIn(page, `${A.t}au`, {contextPath: A.path});
    await h.openWf(h.auUrl(A.path, id, ops ? null : 'workflow_3'));
    if (!ops) { await page.getByRole('link', {name: /Review Round 1/}).first().click().catch(() => {}); await idle(page); await sleep(800); }
    const s = await h.snap('author-view');
    const text = s.text.dialog || '';
    out.author = {header: await h.headerButtons(), hasNotifications: /Notifications/.test(text), after: flat(text.split(/Notifications/).slice(1).join(' '), 400), nav: (await page.getByRole('navigation').last().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)};
    if (ops) {
        // Every entry of the author's side menu, read for a "Notifications" list.
        const links = page.locator('[role="dialog"] nav a, [role="dialog"] nav button');
        const labels = (await links.allInnerTexts().catch(() => [])).map((x) => x.trim()).filter(Boolean);
        out.author.menu = labels;
        for (const l of labels.slice(0, 8)) {
            await links.filter({hasText: l}).first().click().catch(() => {});
            await idle(page); await sleep(600);
            const ss = await screen(page);
            if (/Notifications/.test(ss.text.dialog || '')) out.author[`notificationsOn ${l}`] = flat((ss.text.dialog || '').split(/Notifications/).slice(1).join(' '), 300);
        }
        await h.snap('author-view-ops-last');
    }
    h.fact('author', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------
// Phase loginas: lines 270–271 — the administrator acting as the Section
// editor through the Participants row's "Login As" posts a note; the note's
// writer on "Notes" and the line's "User" on "History".

async function phaseLoginAs(app, S, h, page) {
    h.phase = 'loginas';
    const A = S.A;
    const id = A.N1.submissionId;
    const out = {};
    const key = app.name === 'ops' ? null : 'workflow_1';
    await signIn(page, 'admin', {contextPath: A.path});
    await h.openWf(h.edUrl(A.path, id, key));
    try {
        const SP = require(path.resolve(__dirname, '../../../pages/StageParticipantsPages.js'));
        const panel = new SP.ParticipantsPanel(page, A.path);
        await panel.openMenu('Sean Section');
        out.menu = await panel.menuLabels();
        await panel.menuItem('Login As').click();
        const d = page.getByRole('dialog').filter({hasText: 'Log in as this user?'}).last();
        out.question = flat(await d.innerText().catch(() => ''), 200);
        await d.getByRole('button', {name: 'OK', exact: true}).click();
        await page.waitForLoadState('load'); await idle(page);
        out.landed = page.url().replace(/^.*index\.php/, '');
    } catch (e) { out.loginAsError = String(e.message || e).split('\n')[0]; }
    await h.openWf(h.edUrl(A.path, id, key));
    out.header = await h.headerButtons();
    if (await h.logButton().count()) {
        await h.openLog();
        await h.gotoTab(/^Notes$/);
        out.add = await h.addNote('K3 note under Login As.');
        const nt = await h.notes();
        out.noteWriter = (nt.notes || []).filter((x) => /Login As/.test(x.text)).map((x) => `${x.user} | ${x.date} | del=${x.del}`);
        await h.snap('loginas-notes');
        await h.gotoTab(/^History$/);
        out.historyTop = (await h.historyRows() || []).slice(0, 2).map((r) => `${r.user} | ${r.event}`);
        await h.snap('loginas-history');
        await h.closeLog();
    }
    h.fact('loginas', out);
    await signOut(page).catch(() => {});
    await signOut(page).catch(() => {});
}

// ---------------------------------------------------------------------------
// Phase admin: Actors row 5's second bullet as line 203 cites it — a Site
// Administrator holding only an assistant role in the journal: no "Delete".

async function endOwnManagerRole(h, page, app, ctx) {
    const rem = {};
    await page.goto(app.url(`/index.php/${ctx}/en/management/settings/access`));
    await idle(page);
    const table = page.locator('table').filter({hasText: /\badmin\b/}).first();
    await table.waitFor({state: 'visible', timeout: 30000}).catch(() => {});
    const adminRow = table.locator('tr').filter({hasText: /\badmin\b/}).first();
    await adminRow.locator('button').last().click();
    await idle(page);
    await page.getByRole('menuitem', {name: /^Edit$/}).first().click().catch(() => {});
    await page.waitForURL(/management\/settings\/user\/\d+/, {timeout: 30000}).catch(() => {});
    await idle(page);
    await page.getByRole('button', {name: /Remove Role/i}).first().waitFor({state: 'visible', timeout: 15000}).catch(() => {});
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
    const D = S.D;
    const id = D.SA.submissionId;
    const out = {role: D.role};
    // The manager writes a note.
    if (!D.mgNote) {
        await signIn(page, `${D.t}mg`, {contextPath: D.path});
        await h.openWf(h.edUrl(D.path, id));
        await h.openLog();
        await h.gotoTab(/^Notes$/);
        out.mgAdd = await h.addNote('K3 note by the manager.');
        await h.closeLog();
        await signOut(page);
        D.mgNote = true;
        saveSeed(app, S);
    }
    if (!D.roleEnded) {
        await signIn(page, 'admin', {contextPath: D.path});
        await h.openWf(h.edUrl(D.path, id));
        await h.openLog();
        await h.gotoTab(/^Notes$/);
        const c = await h.notes();
        out.asManager = (c.notes || []).map((x) => `${x.user} | ${x.text.slice(0, 30)} | del=${x.del}`);
        await h.snap('admin-asmanager-notes');
        await h.closeLog();
        out.remove = await endOwnManagerRole(h, page, app, D.path);
        D.roleEnded = true;
        saveSeed(app, S);
        await signOut(page).catch(() => {});
    }
    await signIn(page, 'admin', {contextPath: D.path});
    await h.openWf(h.edUrl(D.path, id));
    out.header = await h.headerButtons();
    if (await h.logButton().count()) {
        await h.openLog();
        out.tabs = await h.tabs();
        out.add = await h.addNote('K3 note by the administrator.');
        const nt = await h.notes();
        out.notes = (nt.notes || []).map((x) => `${x.user} | ${x.text.slice(0, 30)} | del=${x.del}`);
        await h.snap('admin-assistant-notes');
        await h.closeLog();
    } else await h.snap('admin-assistant-wf');
    h.fact('admin', out);
    await signOut(page);
}

// ---------------------------------------------------------------------------

forEachApp(async (app) => {
    const S = await seed(app);
    const factsFile = path.join(outDir(), `facts-${app.name}.json`);
    const facts = REUSE && fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {};
    const {page, close} = await launch(app);
    const h = helpers(app, page, facts);
    const phases = {notes: phaseNotes, levels: phaseLevels, leave: phaseLeave, filewin: phaseFileWin, filewin0: phaseFileWin0, scope: phaseScope, order: phaseOrder,
        viewchanges: phaseViewChanges, author: phaseAuthor, loginas: phaseLoginAs, admin: phaseAdmin};
    try {
        for (const p of PHASES) {
            try {
                await phases[p](app, S, h, page);
            } catch (e) {
                h.fact(`${p} PHASE FAILED`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
                await h.snap(`zz-${p}-failed`).catch(() => {});
                h.acceptConfirm = false;
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
