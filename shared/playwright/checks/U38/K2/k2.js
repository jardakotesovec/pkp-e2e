// U38 claim check, chunk K2 — what the "History" lines of the "Activity Log &
// Notes" window say: which actions log a line, the "User" column (event
// lines, "Login As", email lines), the row actions ("Download", "View
// Email", "View changes"), file lines, email lines, publication formats
// {OMP}, the side effects of notes and of opening the window
// (docs/specs/U38-submission-activity-log-and-notes.md, Rules 3–7, Rule 11,
// Side effects, register A1 and OMP1).
//
// Seeds its own scratch context per app (nothing on publicknowledge):
//   users mg (Journal Manager), ed (Journal editor, OJS/OMP), se and s2
//   (Section editor / Series editor / Moderator), au (Author), OJS/OMP rv
//   (reviewer) and ce (copyeditor).
//   F  {OJS OMP} Copyediting, "Submission Files" article.pdf + notes.md
//      seeded by the author, se assigned — file lines, copies, downloads.
//   D  every app: submitted, ed (OPS se) assigned — a discussion with a
//      file, "Notify", "Assign", "Decline Submission" with its email.
//   R  {OJS OMP} review round 1 with a file, ed assigned — the reviewer
//      lines, the review-change line, a decision's reviewer email, the
//      author's revision.
//   P  every app: published — the publish line, a new version, metadata.
//   G  {OPS} an unposted preprint — a galley's file lines.
//   M  {OMP} Production — publication formats.
//   N  every app: submitted, se assigned — notes, "Login As".
//   Seeded on demand: W (a draft the author submits through the wizard, se
//   on it), Q {OPS} (a preprint posted on screen), NOTIFY_SUB=<key> (a fresh
//   submission for "Notify"/"Assign" once D is declined).
//   Phase order matters on one seed: "decline" closes D, so it runs after
//   "disc" and "notify"; "discdel" deletes D's discussion.
//
//   PROBE_FEATURE=U38 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U38/K2/k2.js
//   PHASES=seed,base,... (default all); REUSE=1 reuses the last seed (state-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); the console
// carries the facts the report cites (prefix [app phase]); facts-<app>.json
// collects the structured reads.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'seed,base,files,disc,notify,decline,review,pub,formats,galley,notes,loginas,discdel,wizard';
const PHASES = (process.env.PHASES || ALL).split(',');
const on = (p) => PHASES.includes(p);
const flat = (s, n = 2000) => (s || '').replace(/\s*\n+\s*/g, ' | ').replace(/[ \t]+/g, ' ').slice(0, n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The lines of `after` that `before` lacks (a multiset difference on user + event).
const newLines = (before, after) => {
    const left = (before || []).map((r) => `${r.user}\u0001${r.event}`);
    const out = [];
    for (const r of after || []) {
        const k = `${r.user}\u0001${r.event}`;
        const at = left.indexOf(k);
        if (at >= 0) left.splice(at, 1); else out.push(r);
    }
    return out;
};
const brief = (rows) => (rows || []).map((r) => `${r.user} | ${r.event}${r.arrow ? ' [>]' : ''}`);
const fixture = (app, f) => path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/${f}`);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const stateFile = path.join(outDir(), `state-${app.name}.json`);
    const factsFile = path.join(outDir(), `facts-${app.name}.json`);
    const facts = fs.existsSync(factsFile) ? JSON.parse(fs.readFileSync(factsFile, 'utf8')) : {};
    const saveFacts = () => fs.writeFileSync(factsFile, JSON.stringify(facts, null, 1));
    let phase = '';
    const log = (...a) => console.log(`[${app.name}${phase ? ' ' + phase : ''}]`, ...a);
    const fact = (k, v, quiet) => { facts[k] = v; saveFacts(); if (!quiet) log(k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 1500)); };

    // ---------------------------------------------------------------------
    // Seed
    let S;
    if (process.env.REUSE && fs.existsSync(stateFile)) {
        S = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        log('reusing', S.t);
    } else {
        phase = 'seed';
        const t = tag('u38k2');
        const u = (s) => `${t}${s}`;
        const users = [
            {username: u('mg'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: u('se'), roles: ['sectionEditor'], givenName: 'Sean', familyName: 'Section'},
            {username: u('s2'), roles: ['sectionEditor'], givenName: 'Sara', familyName: 'Second'},
            {username: u('au'), roles: ['author'], givenName: 'Ava', familyName: 'Author'},
        ];
        if (!isOPS) {
            users.push({username: u('ed'), roles: ['editor'], givenName: 'Eddie', familyName: 'Editor'});
            users.push({username: u('rv'), roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'Reviewer'});
            users.push({username: u('ce'), roles: ['copyeditor'], givenName: 'Cora', familyName: 'Copy'});
        }
        const C = await app.api.createContext({tag: t, users});
        S = {t, path: C.path, users: Object.fromEntries(C.users.map((x) => [x.username.slice(t.length), {id: x.id, username: x.username}]))};
        const base = {context: C.path, submitter: u('au')};
        const edKey = isOPS ? 'se' : 'ed';
        S.edKey = edKey;
        const part = (k, role) => ({username: u(k), role});
        const edRole = isOPS ? 'sectionEditor' : 'editor';
        const mk = async (k, spec) => { S[k] = await app.api.createSubmission({...base, tag: `${t}${k.toLowerCase()}`, title: `K2 ${k} ${t}`, ...spec}); };
        if (!isOPS) await mk('F', {files: [{file: 'article.pdf'}, {file: 'notes.md'}], decisions: ['skipExternalReview'], participants: [part('se', 'sectionEditor')]});
        await mk('D', {participants: [part(edKey, edRole), ...(isOPS ? [] : [part('se', 'sectionEditor')])]});
        if (!isOPS) await mk('R', {decisions: [isOMP ? 'skipInternalReview' : 'sendExternalReview'], reviewRounds: [{files: [{file: 'article.pdf'}]}], participants: [part('ed', 'editor')]});
        await mk('P', {published: true, participants: [part(edKey, edRole)]});
        if (isOPS) await mk('G', {participants: [part('se', 'sectionEditor')]});
        if (isOMP) await mk('M', {decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('ed', 'editor')]});
        await mk('N', {participants: [part('se', 'sectionEditor')], ...(isOPS ? {} : {files: [{file: 'article.pdf'}]})});
        fs.writeFileSync(stateFile, JSON.stringify(S, null, 1));
        const ids = {};
        for (const k of ['F', 'D', 'R', 'P', 'G', 'M', 'N']) if (S[k]) ids[k] = {id: S[k].submissionId, pub: S[k].publicationId, stage: S[k].stageId, files: S[k].files, rounds: S[k].reviewRounds};
        log('seeded', S.path, JSON.stringify(ids));
    }
    const U = (k) => S.users[k] && S.users[k].username;
    // A further submission seeded on demand (kept in the state file).
    const lazySub = async (k, spec) => {
        if (!S[k]) {
            S[k] = await app.api.createSubmission({context: S.path, submitter: S.users.au.username, tag: `${S.t}${k.toLowerCase()}`, title: `K2 ${k} ${S.t}`, ...spec});
            fs.writeFileSync(stateFile, JSON.stringify(S, null, 1));
            log('seeded', k, S[k].submissionId);
        }
        return S[k];
    };
    const CP = S.path;
    const wfUrl = (id, key) => app.url(`/index.php/${CP}/en/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const auUrl = (id, key) => app.url(`/index.php/${CP}/en/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    // ---------------------------------------------------------------------
    // Screen helpers (a page per phase)
    const H = (page) => {
        const h = {};
        h.snap = async (name, extra) => { const s = await screen(page); record(name, extra ? {...s, extra} : s); await shot(page, name).catch(() => {}); return s; };
        h.as = async (k) => { await signIn(page, k === 'admin' ? 'admin' : U(k)); };
        h.wf = () => page.getByRole('dialog').filter({has: page.locator('[data-cy="sidemodal-header"]')}).first();
        h.open = async (id, key, label) => {
            await page.goto(wfUrl(id, key));
            await h.wf().locator('[data-cy="sidemodal-header"]').waitFor({timeout: 30000}).catch(() => log('no workflow header', id, key));
            await page.waitForFunction(() => !/Loading|Refreshing data/.test((document.querySelector('[data-cy="sidemodal-header"]') || {}).innerText || ''), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            if (label) await h.snap(label);
        };
        h.reland = async () => { await page.goto(page.url()); await h.wf().locator('[data-cy="sidemodal-header"]').waitFor({timeout: 30000}).catch(() => {}); await idle(page); };
        h.logDialog = () => page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'}).last();
        // Press "Activity Log" and wait for the History grid (rows or "No Items").
        h.openLog = async () => {
            const btn = h.wf().locator('[data-cy="sidemodal-header"]').getByRole('button', {name: 'Activity Log', exact: true}).first();
            if (!(await btn.count())) { log('no Activity Log button'); return null; }
            await btn.click();
            const d = h.logDialog();
            await d.locator('tr.gridRow, td:has-text("No Items")').first().waitFor({timeout: 45000}).catch(() => log('History grid did not fill'));
            await idle(page);
            return d;
        };
        // The History rows: {i, date, user, event, arrow, id}.
        h.rows = async () => h.logDialog().locator('tr.gridRow').evaluateAll((trs) => trs.map((tr, i) => {
            const tds = [...tr.querySelectorAll('td')];
            const txt = (td) => (td ? td.innerText.replace(/\s+/g, ' ').trim() : '');
            return {i, id: tr.id, date: txt(tds[0]), user: txt(tds[1]), event: txt(tds[2]), arrow: !!tr.querySelector('a.show_extras, a.hide_extras'), arrowText: (tr.querySelector('a.show_extras, a.hide_extras') || {}).innerText || null};
        })).catch(() => []);
        h.readLog = async (label, extra) => {
            const d = await h.openLog();
            if (!d) return null;
            const rows = await h.rows();
            await h.snap(label, {rows, ...(extra || {})});
            log(`[${label}]`, JSON.stringify(rows.map((r) => `${r.user} | ${r.event}${r.arrow ? ' [>]' : ''}`)).slice(0, 4000));
            return rows;
        };
        h.closeLog = async () => {
            const d = h.logDialog();
            await d.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await d.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
            await h.reland();
        };
        // Press the row's arrow and read the strip under it.
        h.rowGrid = (i) => h.logDialog().locator('tr.gridRow').nth(i);
        h.expand = async (i) => {
            const tr = h.rowGrid(i);
            const a = tr.locator('a.show_extras').first();
            if (!(await a.count())) return null;
            await a.click();
            await sleep(300);
            const strip = tr.locator('xpath=following-sibling::tr[1]');
            const links = await strip.locator('a').evaluateAll((as) => as.map((x) => ({text: x.innerText.replace(/\s+/g, ' ').trim(), href: x.getAttribute('href'), cls: x.className}))).catch(() => []);
            return {strip, links};
        };
        h.ensureLog = async () => { if (!(await h.logDialog().isVisible().catch(() => false))) await h.openLog(); };
        h.findRow = async (re) => { const rows = await h.rows(); return rows.find((r) => re.test(r.event)); };
        h.download = async (i, label) => {
            const x = await h.expand(i);
            if (!x) return {noArrow: true};
            const link = x.strip.getByRole('link', {name: /Download/}).first();
            if (!(await link.count())) return {links: x.links, noDownload: true};
            await loc(page, `${label}: a History line's "Download"`, link);
            const got = [];
            const onD = (d) => got.push(d);
            page.on('download', onD);
            page.context().on('page', (p) => p.on('download', onD));
            const beforeUrl = page.url();
            await link.click().catch(() => {});
            for (let k = 0; k < 40 && !got.length; k++) await sleep(250);
            page.off('download', onD);
            if (!got.length) {
                const landed = page.url();
                const s = await h.snap(`${label}-no-download`).catch(() => null);
                const res = {links: x.links, noDownloadEvent: true, landed: landed.replace(/^.*index\.php/, ''), landedTitle: s && s.title, landedText: s && flat(s.text.main, 600)};
                if (landed !== beforeUrl) { await page.goto(beforeUrl); await idle(page); }
                return res;
            }
            const d = got[0];
            const file = await d.path().catch(() => null);
            const buf = file ? fs.readFileSync(file) : Buffer.alloc(0);
            return {links: x.links, name: d.suggestedFilename(), size: buf.length, head: buf.subarray(0, 12).toString('latin1'), url: d.url().replace(/^.*index\.php/, '')};
        };
        h.viewEmail = async (i, label) => {
            const x = await h.expand(i);
            if (!x) return {noArrow: true};
            const link = x.strip.getByRole('link', {name: 'View Email'}).first();
            if (!(await link.count())) return {links: x.links, noViewEmail: true};
            await loc(page, `${label}: an email line's "View Email"`, link);
            await link.click();
            const win = page.getByRole('dialog', {name: 'View Email'}).last();
            await win.waitFor({timeout: 20000}).catch(() => {});
            await page.waitForFunction(() => { const ds = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length); const d = ds[ds.length - 1]; return d && /Subject/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const s = await h.snap(label);
            const text = s.text.dialog;
            const html = await win.innerHTML().catch(() => '');
            const heading = await win.getByRole('heading', {level: 1}).first().innerText().catch(() => null);
            await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(500);
            return {links: x.links, heading, text, htmlLen: html.length, html: html.slice(0, 6000)};
        };
        h.dialogs = async () => page.locator('[role="dialog"]:visible').evaluateAll((ds) => ds.map((d) => ({name: d.getAttribute('aria-label') || (d.querySelector('h1,h2') || {}).innerText || '', text: d.innerText.replace(/\s+/g, ' ').slice(0, 800)}))).catch(() => []);
        h.notices = async () => page.locator('.pkpNotification, [role="status"], .pkp_notification, .app__notifications').allInnerTexts().then((a) => a.map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        return h;
    };

    const session = async () => {
        const s = await launch(app);
        s.page.on('dialog', (d) => { log('browser dialog', d.type(), d.message()); d.accept().catch(() => {}); });
        return s;
    };
    const sect = async (name, fn) => {
        phase = name;
        const {page, close} = await session();
        try { await fn(page, H(page)); } catch (e) { log('SECTION FAILED', String(e.stack || e).slice(0, 1500)); await shot(page, `${name}-failure`).catch(() => {}); } finally { await close(); phase = ''; }
    };
    const mailTo = async (k, extra = {}) => {
        const r = await app.mail._search({to: `${U(k)}@mail.test`, ...extra}).catch(() => ({messages: []}));
        return (r.messages || []).map((m) => ({id: m.ID, subject: m.Subject, from: m.From && `${m.From.Name} <${m.From.Address}>`, created: m.Created, snippet: flat(m.Snippet, 160)}));
    };
    const mailCounts = async () => {
        const out = {};
        for (const k of Object.keys(S.users)) out[k] = (await mailTo(k)).length;
        return out;
    };

    // =====================================================================
    // base: the History of each seeded submission, read by the Journal Manager
    if (on('base')) await sect('base', async (page, h) => {
        await h.as('mg');
        for (const k of ['F', 'D', 'R', 'P', 'G', 'M', 'N']) {
            if (!S[k]) continue;
            await h.open(S[k].submissionId, null);
            const rows = await h.readLog(`base-${k}-history`);
            fact(`base.${k}`, rows, true);
            if (k === 'D' && rows && rows.length) {
                // the window's own shape: tabs, columns, the arrows
                const d = h.logDialog();
                fact('base.window', {tabs: await d.getByRole('tab').allInnerTexts().catch(() => []), columns: await d.getByRole('columnheader').allInnerTexts().catch(() => []), title: await d.getByRole('heading', {level: 1}).allInnerTexts().catch(() => [])});
                await loc(page, 'Activity Log window', d);
                await loc(page, 'History grid rows', d.locator('tr.gridRow'));
                await loc(page, 'a History line\'s arrow (a.show_extras)', d.locator('tr.gridRow a.show_extras'));
                // every email line: View Email; every arrow: what its strip holds
                for (const r of rows) {
                    if (!r.arrow) continue;
                    const x = await h.expand(r.i);
                    fact(`base.D.strip.${r.i}`, {event: r.event, links: x && x.links});
                }
                await h.snap('base-D-history-expanded');
            }
            await h.closeLog();
        }
    });

    // =====================================================================
    // files {OJS OMP}: Rule 6 (file lines), 6a (Download), 6b (a revision), td5, td6 (second part), td7
    if (on('files') && !isOPS && S.F) await sect('files', async (page, h) => {
        const P = require('../../../pages/SubmissionFilesPages.js');
        const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
        const frame = new WorkflowPage(page, CP);
        const SUP = isOJS ? 'Research Instrument' : 'Prospectus';
        const id = S.F.submissionId;
        const out = {};
        const only = process.env.STEPS ? process.env.STEPS.split(',') : null;
        const step = async (name, fn) => { if (only && !only.includes(name)) return; try { await fn(); } catch (e) { out[`${name}.error`] = String(e.message).split('\n')[0].slice(0, 300); log(name, 'ERROR', out[`${name}.error`]); await shot(page, `files-${name}-error`).catch(() => {}); } };
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        await h.as('mg');
        await h.open(id, 'workflow_1', 'files-mg-submission-stage');
        let before = await history('files-0-history');
        const list = new P.FileList(page, frame, 'Submission Files');
        // (b) a new file through the wizard
        await step('upload', async () => {
            await list.uploadButton().click();
            const w = new P.UploadWizard(page, 'Upload Submission File');
            await w.expectOpen();
            await w.chooseComponent(SUP);
            await w.attach(fixture(app, 'not-an-image.txt'), 'not-an-image.txt');
            await w.continueTo(P.WIZARD_STEPS[1]);
            await h.snap('files-upload-step2');
            await w.continueTo(P.WIZARD_STEPS[2]);
            await w.complete();
            await h.reland();
        });
        let after = await history('files-1-after-upload');
        out.upload = brief(newLines(before, after)); log('upload adds', JSON.stringify(out.upload)); before = after;
        // (c) td5: a copy into "Draft Files" through "Upload/Select Files"
        await step('copy', async () => {
            await h.open(id, 'workflow_4', 'files-mg-copyediting-stage');
            const drafts = new P.FileList(page, frame, 'Draft Files');
            const sel = await new P.SelectFilesWindow(page).openFrom(drafts);
            await h.snap('files-copy-select-window');
            await sel.showAllStages();
            await h.snap('files-copy-select-all-stages');
            await sel.tick('not-an-image.txt', 'Submission');
            await sel.ok();
            await h.reland();
            out.draftsAfterCopy = await drafts.names().catch(() => null);
            await h.snap('files-copy-drafts-after');
        });
        after = await history('files-2-after-copy');
        out.copy = brief(newLines(before, after)); log('copy adds', JSON.stringify(out.copy)); before = after;
        // (d) td7: a revision of article.pdf (a PNG), then "Download" on the revision line and on the first upload line
        await h.open(id, 'workflow_1');
        await step('revise', async () => {
            await list.uploadButton().click();
            const w = new P.UploadWizard(page, 'Upload Submission File');
            await w.expectOpen();
            await w.chooseRevision('article.pdf');
            await w.attach(fixture(app, 'profile-image-400.png'), 'profile-image-400.png');
            await w.continueTo(P.WIZARD_STEPS[1]);
            out.reviseNameBox = await w.nameBox().inputValue().catch(() => null);
            await w.continueTo(P.WIZARD_STEPS[2]);
            await w.complete();
            await h.reland();
            out.listAfterRevise = await list.names().catch(() => null);
        });
        after = await history('files-3-after-revise');
        out.revise = brief(newLines(before, after)); log('revise adds', JSON.stringify(out.revise)); before = after;
        await step('revise-downloads', async () => {
            await h.openLog();
            const rows = await h.rows();
            out.reviseDownloads = {};
            for (const r of rows) {
                if (!r.arrow) continue;
                if (!/article\.pdf|profile-image|file revision/.test(r.event)) continue;
                await h.ensureLog();
                const got = await h.download(r.i, `files-dl-${r.i}`);
                out.reviseDownloads[r.event] = got;
            }
            await h.snap('files-3-history-downloads');
            await h.closeLog();
            log('revise downloads', JSON.stringify(out.reviseDownloads));
        });
        // 6b: the file's own "History"
        await step('file-history', async () => {
            const nm = (out.listAfterRevise || []).find((n) => /profile|article/.test(n)) || 'profile-image-400.png';
            await list.choose(list.row(nm), 'More Information');
            const info = new P.InformationCenter(page, nm);
            await info.expectOpen();
            await info.expectHistoryLoaded();
            out.fileHistory = await info.historyEvents();
            await h.snap('files-3-file-history');
            const rows = info.historyRows();
            const n = await rows.count();
            out.fileHistoryArrows = [];
            for (let i = 0; i < n; i++) out.fileHistoryArrows.push({event: (await rows.nth(i).locator('td').last().innerText()).trim(), arrow: await rows.nth(i).locator('a.show_extras').count()});
            log('file history', JSON.stringify(out.fileHistoryArrows));
            await info.close();
            await h.reland();
        });
        // (e) td7: another revision, "Cancel" on "2. Review Details"
        await step('revise-cancel', async () => {
            const nm = (out.listAfterRevise || [])[0];
            const target = (out.listAfterRevise || []).find((n) => /profile/.test(n)) || nm;
            await list.uploadButton().click();
            const w = new P.UploadWizard(page, 'Upload Submission File');
            await w.expectOpen();
            await w.chooseRevision(target);
            await w.attach(fixture(app, 'notes.md'), 'notes.md');
            await w.continueTo(P.WIZARD_STEPS[1]);
            await h.snap('files-4-revise-step2-before-cancel');
            await w.cancel();
            await h.reland();
            out.listAfterCancel = await list.names().catch(() => null);
            await h.snap('files-4-list-after-cancel');
        });
        after = await history('files-4-after-revise-cancel');
        out.reviseCancel = brief(newLines(before, after)); log('revise+cancel adds', JSON.stringify(out.reviseCancel), 'list', JSON.stringify(out.listAfterCancel)); before = after;
        await step('cancel-downloads', async () => {
            await h.openLog();
            const rows = await h.rows();
            out.cancelDownloads = {};
            for (const r of rows) {
                if (!r.arrow || !/notes\.md|file revision/.test(r.event)) continue;
                await h.ensureLog();
                out.cancelDownloads[`${r.i} ${r.event}`] = await h.download(r.i, `files-dl2-${r.i}`);
            }
            await h.snap('files-4-history-downloads');
            await h.closeLog();
            log('after-cancel downloads', JSON.stringify(out.cancelDownloads));
        });
        // (f) td6: rename notes.md, then the Download of its first upload line
        await step('rename', async () => {
            await list.choose(list.row('notes.md'), 'Update File Details');
            const e = new P.EditFileWindow(page);
            await e.expectOpen();
            await e.nameBox().fill('Renamed notes');
            await e.save();
            await h.reland();
        });
        after = await history('files-5-after-rename');
        out.rename = brief(newLines(before, after)); log('rename adds', JSON.stringify(out.rename)); before = after;
        await step('rename-download', async () => {
            await h.openLog();
            const r = await h.findRow(/^Revision "notes\.md" was uploaded/);
            out.renameDownload = r ? await h.download(r.i, 'files-dl-renamed') : 'no line';
            await h.snap('files-5-history-download-renamed');
            await h.closeLog();
            log('renamed file first-line download', JSON.stringify(out.renameDownload));
        });
        // (g) td6: delete the renamed file, then its lines
        await step('delete', async () => {
            await list.choose(list.row('Renamed notes'), 'Delete');
            const d = new P.DeleteFileDialog(page);
            out.deleteAnswer = (await d.confirm()).status();
            await h.reland();
        });
        after = await history('files-6-after-delete');
        out.delete = brief(newLines(before, after)); log('delete adds', JSON.stringify(out.delete)); before = after;
        out.notesLinesAfterDelete = brief(after.filter((r) => /notes\.md|Renamed notes/.test(r.event)));
        log('notes lines after delete', JSON.stringify(out.notesLinesAfterDelete));
        out.finalHistory = brief(after);
        fact('files', {...(facts.files || {}), ...out}, true);
    });

    // =====================================================================
    // disc: a discussion with a file, a reply, closing it, a task started and closed
    // (Rule 3 last paragraph, 4c/A1 discussion emails, Rule 6 attached file, Rule 7, td8)
    const PANEL = isOPS ? 'Production Tasks & Discussions' : 'Desk Review Tasks & Discussions';
    const DKEY = isOPS ? 'workflow_5' : 'workflow_1';
    const discName = `K2 disc ${S.t}`;
    const taskName = `K2 task ${S.t}`;
    if (on('disc') && S.D) await sect('disc', async (page, h) => {
        const T = require('../../../pages/TasksDiscussionsPages.js');
        const panel = new T.TasksDiscussionsPanel(page, CP, {title: PANEL});
        const out = {};
        const only = process.env.STEPS ? process.env.STEPS.split(',') : null;
        const step = async (name, fn) => { if (only && !only.includes(name)) return; try { await fn(); } catch (e) { out[`${name}.error`] = String(e.message).split('\n')[0].slice(0, 300); log(name, 'ERROR', out[`${name}.error`]); await shot(page, `disc-${name}-error`).catch(() => {}); } };
        const id = S.D.submissionId;
        const other = isOPS ? ['au'] : ['au', 'se'];
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        await h.as(S.edKey);
        await h.open(id, DKEY, 'disc-ed-stage');
        let before = await history('disc-0-history');
        out.mail0 = await mailCounts();
        await step('create', async () => {
            await panel.expectSettled();
            const add = await panel.openAdd();
            await add.nameField().fill(discName);
            for (const k of other) await add.tick(U(k));
            await add.typeMessage('K2 discussion message with a file.');
            const att = await add.openAttachFiles();
            await att.upload(fixture(app, 'not-an-image.txt'));
            await h.snap('disc-create-window-filled');
            await add.saveExpectClosed();
            await panel.reland();
        });
        let after = await history('disc-1-after-create');
        out.create = brief(newLines(before, after)); log('create adds', JSON.stringify(out.create)); before = after;
        await sleep(2000);
        out.mail1 = await mailCounts();
        out.mailDisc = {};
        for (const k of [...other, S.edKey]) out.mailDisc[k] = await mailTo(k, {contains: 'K2 discussion message'});
        log('discussion mails', JSON.stringify(out.mailDisc));
        // View Email on each new email line (td8)
        await step('viewemail', async () => {
            await h.openLog();
            const rows = await h.rows();
            out.viewEmail = [];
            for (const r of rows.filter((x) => /^An email has been sent/.test(x.event) && out.create.some((c) => c.includes(x.event)))) {
                await h.ensureLog();
                const v = await h.viewEmail(r.i, `disc-viewemail-${r.i}`);
                out.viewEmail.push({event: r.event, user: r.user, ...v, html: undefined, text: v.text});
                await h.reland(); await h.ensureLog();
            }
            await h.closeLog();
            log('view email', JSON.stringify(out.viewEmail.map((v) => ({heading: v.heading, text: flat(v.text, 900)}))));
            // the recipient's copy, for the footer and the attachment
            const m = (out.mailDisc.au || [])[0];
            if (m) {
                const full = await app.mail.fullMessage(m.id);
                out.auCopy = {subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, attachments: (full.Attachments || []).map((a) => a.FileName), textTail: (full.Text || '').slice(-700), text: (full.Text || '').slice(0, 1500)};
                log('au copy', JSON.stringify(out.auCopy));
            }
        });
        // a reply
        await step('reply', async () => {
            await panel.expectSettled();
            const win = await panel.openItem(discName);
            await h.snap('disc-window');
            await win.addNewMessage();
            await win.typeReply('K2 reply two.');
            await win.saveReply();
            await win.close();
            await panel.reland();
        });
        after = await history('disc-2-after-reply');
        out.reply = brief(newLines(before, after)); log('reply adds', JSON.stringify(out.reply)); before = after;
        // closing the discussion
        await step('closedisc', async () => {
            await panel.expectSettled();
            await panel.pressBox(discName, 'Closed');
            await h.snap('disc-close-question');
            await panel.answerRowQuestion('Close this Discussion', 'Yes');
            await panel.reland();
        });
        after = await history('disc-3-after-close');
        out.close = brief(newLines(before, after)); log('close adds', JSON.stringify(out.close)); before = after;
        // a task: created not started, started from the row, closed from the row
        await step('task', async () => {
            await panel.expectSettled();
            const add = await panel.openAdd();
            await add.nameField().fill(taskName);
            await add.taskBox().check();
            for (const k of other) await add.tick(U(k));
            const owner = isOPS ? S.edKey : 'se';
            await add.ownerRadio(U(owner)).check();
            const d = new Date(Date.now() + 7 * 86400000);
            await add.dueDate().fill(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
            await add.startSelect().selectOption({label: T.TEXT.createNotStarted});
            await add.typeMessage('K2 task message.');
            await add.saveExpectClosed();
            await panel.reland();
        });
        after = await history('disc-4-after-task-create');
        out.taskCreate = brief(newLines(before, after)); log('task create adds', JSON.stringify(out.taskCreate)); before = after;
        await step('taskstart', async () => {
            await panel.expectSettled();
            await panel.pressBox(taskName, 'Started');
            await panel.answerRowQuestion('Start this task', 'Yes');
            await panel.reland();
        });
        after = await history('disc-5-after-task-start');
        out.taskStart = brief(newLines(before, after)); log('task start adds', JSON.stringify(out.taskStart)); before = after;
        await step('taskclose', async () => {
            await panel.expectSettled();
            await panel.pressBox(taskName, 'Closed');
            await panel.answerRowQuestion('Close this Task', 'Yes');
            await panel.reland();
            const hist = await panel.openHistory(taskName);
            out.taskOwnHistory = await hist.entries();
            await h.snap('disc-task-own-history');
            await hist.close();
            await panel.reland();
        });
        after = await history('disc-6-after-task-close');
        out.taskClose = brief(newLines(before, after)); log('task close adds', JSON.stringify(out.taskClose), 'own history', JSON.stringify(out.taskOwnHistory)); before = after;
        out.finalHistory = brief(after);
        fact('disc', {...(facts.disc || {}), ...out}, true);
    });

    // =====================================================================
    // notify: the Participants panel's "Notify" and "Assign" (Rule 3 participants, 4a, 4c, A1)
    const name = (k) => ({mg: 'Mona Manager', se: 'Sean Section', s2: 'Sara Second', au: 'Ava Author', ed: 'Eddie Editor', rv: 'Rhea Reviewer', ce: 'Cora Copy'})[k];
    const SEROLE = isOJS ? 'Section editor' : isOMP ? 'Series editor' : 'Moderator';
    if (on('notify') && S.D) await sect('notify', async (page, h) => {
        const SP = require('../../../pages/StageParticipantsPages.js');
        const panel = new SP.ParticipantsPanel(page, CP);
        const out = {};
        const only = process.env.STEPS ? process.env.STEPS.split(',') : null;
        const step = async (nm, fn) => { if (only && !only.includes(nm)) return; try { await fn(); } catch (e) { out[`${nm}.error`] = String(e.message).split('\n')[0].slice(0, 300); log(nm, 'ERROR', out[`${nm}.error`]); await shot(page, `notify-${nm}-error`).catch(() => {}); } };
        const edRole = isOPS ? 'sectionEditor' : 'editor';
        const target = process.env.NOTIFY_SUB ? await lazySub(process.env.NOTIFY_SUB, {participants: [{username: U(S.edKey), role: edRole}]}) : S.D;
        const id = target.submissionId;
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        const pickTemplate = async (win) => {
            const opts = await win.templateSelect().locator('option').evaluateAll((os) => os.map((o) => ({v: o.value, t: o.textContent.trim()})));
            const first = opts.find((o) => o.v && o.t);
            if (first) await win.chooseTemplate(first.t);
            return {options: opts.map((o) => o.t), chosen: first && first.t};
        };
        await h.as(S.edKey);
        await h.open(id, DKEY, 'notify-ed-stage');
        let before = await history('notify-0-history');
        await step('notify', async () => {
            await panel.goto(id, {menuKey: DKEY});
            out.rowsBefore = await panel.rowLines();
            const win = await panel.openNotify(name('au'));
            out.notifyTemplates = await pickTemplate(win);
            await h.snap('notify-window');
            await win.typeMessage('K2 notify message to the author.');
            await win.send();
            await h.reland();
        });
        let after = await history('notify-1-after-notify');
        out.notify = brief(newLines(before, after)); log('notify adds', JSON.stringify(out.notify)); before = after;
        await sleep(1500);
        out.notifyMail = await mailTo('au', {contains: 'K2 notify message'});
        log('notify mail', JSON.stringify(out.notifyMail));
        await step('assign', async () => {
            await panel.goto(id, {menuKey: DKEY});
            const win = await panel.openAssign();
            out.assignRoles = await win.roleOptions();
            await win.chooseRole(SEROLE);
            await win.search('Sara');
            await win.choosePerson(name('s2'));
            out.assignTemplates = await pickTemplate(win);
            await win.typeMessage('K2 assign message to Sara.');
            await h.snap('assign-window-filled');
            await win.ok();
            await h.reland();
        });
        after = await history('notify-2-after-assign');
        out.assign = brief(newLines(before, after)); log('assign adds', JSON.stringify(out.assign)); before = after;
        await sleep(1500);
        out.assignMail = await mailTo('s2', {contains: 'K2 assign message'});
        log('assign mail', JSON.stringify(out.assignMail));
        // View Email on the Notify and Assign lines (sender shown in the window?)
        await step('viewemail', async () => {
            await h.openLog();
            const rows = await h.rows();
            out.viewEmail = [];
            for (const r of rows.filter((x) => /^An email has been sent/.test(x.event) && [...out.notify, ...out.assign].some((c) => c.includes(x.event)))) {
                await h.ensureLog();
                const v = await h.viewEmail(r.i, `notify-viewemail-${r.i}`);
                out.viewEmail.push({event: r.event, user: r.user, heading: v.heading, text: flat(v.text, 1200)});
                await h.reland(); await h.ensureLog();
            }
            await h.closeLog();
            log('view email', JSON.stringify(out.viewEmail));
        });
        fact('notify', {...(facts.notify || {}), ...out}, true);
    });

    // =====================================================================
    // decline: "Decline Submission" with its email, CC and BCC added (Rule 3 decisions, 4c td4, Rule 7 CC/BCC)
    if (on('decline') && S.D) await sect('decline', async (page, h) => {
        const out = {};
        const id = S.D.submissionId;
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        await h.as(S.edKey);
        await h.open(id, DKEY, 'decline-ed-stage');
        let before = await history('decline-0-history');
        try {
            const btn = h.wf().getByRole('button', {name: 'Decline Submission', exact: true}).first();
            await loc(page, 'workflow "Decline Submission"', btn);
            await btn.click();
            await page.waitForURL(/decision\/record/, {timeout: 30000});
            await idle(page);
            await page.locator('.composer__loadingTemplateMask').first().waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await sleep(800);
            const step = page.locator('.pkpStep:not([hidden])');
            await step.getByRole('button', {name: 'Add CC/BCC', exact: true}).click();
            await step.locator('input[name="cc"]').fill(`${U('mg')}@mail.test`);
            await step.locator('input[name="bcc"]').fill(`${U('s2')}@mail.test`);
            await h.snap('decline-wizard-email');
            out.subject = await step.locator('input[name="subject"]').inputValue().catch(() => null);
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            await rec.click();
            await page.getByRole('dialog').filter({hasText: /Submission Declined|declined/i}).first().waitFor({timeout: 45000}).catch(() => log('no completion dialog'));
            await h.snap('decline-recorded');
            out.completion = (await h.dialogs()).map((d) => d.text);
        } catch (e) { out.error = String(e.message).split('\n')[0]; log('decline ERROR', out.error); await shot(page, 'decline-error').catch(() => {}); }
        await h.open(id, DKEY);
        let after = await history('decline-1-after-decline');
        out.decline = brief(newLines(before, after)); log('decline adds', JSON.stringify(out.decline));
        await sleep(1500);
        out.mailAu = await mailTo('au', {subject: out.subject || undefined});
        out.mailCc = await mailTo('mg', {subject: out.subject || undefined});
        log('decline mail au/cc', JSON.stringify({au: out.mailAu, cc: out.mailCc}));
        try {
            await h.openLog();
            const rows = await h.rows();
            const r = rows.find((x) => /^An email has been sent/.test(x.event) && out.decline.some((c) => c.includes(x.event)));
            if (r) {
                const v = await h.viewEmail(r.i, 'decline-viewemail');
                out.viewEmail = {event: r.event, user: r.user, heading: v.heading, text: flat(v.text, 2500)};
                log('decline view email', JSON.stringify(out.viewEmail));
            }
            await h.reland();
            const m = (out.mailAu || [])[0];
            if (m) {
                const full = await app.mail.fullMessage(m.id);
                out.auCopy = {from: full.From, to: full.To, cc: full.Cc, bcc: full.Bcc, textTail: (full.Text || '').slice(-600)};
                log('decline au copy', JSON.stringify(out.auCopy));
            }
        } catch (e) { out.viewError = String(e.message).split('\n')[0]; log('view ERROR', out.viewError); }
        fact('decline', out, true);
    });

    // =====================================================================
    // review {OJS OMP}: the reviewer lines (Rule 3 row "Reviewers and reviews"), 4c senders,
    // Rule 5 "View changes", a decision's reviewer email, "Revised Version Uploaded"
    const RSTEPS = (process.env.RSTEPS || 'add,edit,remind,accept,submit,modify,thank,revisions,revupload,views').split(',');
    const ron = (x) => RSTEPS.includes(x);
    if (on('review') && !isOPS && S.R) {
        const id = S.R.submissionId;
        const RKEY = `workflow_3_${S.R.reviewRounds[0].id}`;
        const rv = {};
        const topWin = (page) => page.locator('[data-cy="active-modal"]').last();
        const rrow = (h) => h.wf().locator('[data-cy="reviewer-manager"]').getByRole('row').filter({hasText: name('rv')});
        const awaitMce = async (page, prefix) => page.waitForFunction((p) => { const t = window.tinymce; return !!(t && t.editors && t.editors.find((e) => e.id.startsWith(p) && e.initialized)); }, prefix, {timeout: 30000}).catch(() => {});
        const hist = async (h, label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        let prev = (facts.review && facts.review.last) || null;
        const diff = async (h, label, key) => { const now = await hist(h, label); const add = brief(newLines(prev || [], now)); rv[key] = add; log(`${key} adds`, JSON.stringify(add)); prev = now; return add; };
        const edSect = async (nm, fn) => sect(nm, async (page, h) => {
            await h.as('ed');
            await h.open(id, RKEY);
            if (!prev) prev = await hist(h, 'review-0-history');
            await fn(page, h);
            fact('review', {...(facts.review || {}), ...rv, last: prev}, true);
        });
        if (ron('add')) await edSect('review-add', async (page, h) => {
            const panel = h.wf().locator('[data-cy="reviewer-manager"]');
            await panel.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            const add = page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')});
            const box = add.locator('.listPanel--selectReviewer input.pkpSearch__input');
            await box.waitFor({timeout: 30000});
            await box.fill('Rhea'); await box.press('Enter'); await idle(page);
            await page.waitForFunction(() => { const ta = document.querySelector('#reviewerFormFooter textarea[name="personalMessage"]'); const m = window.tinyMCE || window.tinymce; return !!(ta && m && m.get(ta.id) && m.get(ta.id).initialized); }, null, {timeout: 30000});
            await add.getByText(`Select ${name('rv')}`).click();
            await idle(page);
            await add.frameLocator('iframe[id^="personalMessage"]').locator('body').filter({hasText: /\w/}).waitFor({timeout: 30000});
            await h.snap('review-add-form');
            await add.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
            await rrow(h).filter({hasText: /Request Sent|Awaiting/}).first().waitFor({timeout: 30000}).catch(() => {});
            await h.reland();
            await diff(h, 'review-1-after-add', 'add');
        });
        if (ron('edit')) await edSect('review-edit', async (page, h) => {
            // the response due date moved to yesterday, so the row offers "Send Reminder"
            await rrow(h).getByRole('button', {name: 'More Actions'}).click();
            rv.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const ed = topWin(page);
            await ed.getByText('Review Type').first().waitFor({timeout: 30000});
            await idle(page);
            const y = new Date(Date.now() - 3 * 86400000);
            const input = ed.locator('input[name="responseDueDate-removed"]').first();
            await input.click();
            const dp = page.locator('#ui-datepicker-div');
            await dp.waitFor({timeout: 10000});
            await dp.locator('select.ui-datepicker-year').selectOption(String(y.getFullYear()));
            await dp.locator('select.ui-datepicker-month').selectOption(String(y.getMonth()));
            await dp.getByRole('link', {name: String(y.getDate()), exact: true}).first().click({timeout: 20000});
            await h.snap('review-edit-window');
            await ed.getByRole('button', {name: 'OK', exact: true}).click();
            await ed.getByText('Review Type').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await h.reland();
            await diff(h, 'review-2-after-edit', 'edit');
        });
        if (ron('remind')) await edSect('review-remind', async (page, h) => {
            const b = rrow(h).getByRole('button', {name: 'Send Reminder', exact: true});
            rv.reminderButton = await b.count();
            await h.snap('review-row-overdue');
            if (rv.reminderButton) {
                await b.click();
                const w = topWin(page);
                await w.getByText('Review Schedule').first().waitFor({timeout: 30000});
                await awaitMce(page, 'message');
                await sleep(500);
                await h.snap('review-reminder-window');
                await w.getByRole('button', {name: 'Send Reminder', exact: true}).click();
                await w.getByText('Review Schedule').first().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await h.reland();
            }
            await diff(h, 'review-3-after-remind', 'remind');
        });
        const rvStep = async (nm, fn) => sect(nm, async (page, h) => {
            await h.as('rv');
            await page.goto(app.url(`/index.php/${CP}/en/reviewer/submission/${id}`));
            await idle(page);
            await fn(page, h);
        });
        if (ron('accept')) {
            await rvStep('review-accept', async (page, h) => {
                await h.snap('review-rv-step1');
                const priv = page.locator('input[name="privacyConsent"]').filter({visible: true});
                if (await priv.count()) await priv.check();
                await page.getByRole('button', {name: /Accept Review, Continue to Step #2/}).click();
                await page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true}).first().waitFor({timeout: 30000}).catch(() => {});
                await h.snap('review-rv-step2');
            });
            await edSect('review-accepted', async (page, h) => { await diff(h, 'review-4-after-accept', 'accept'); });
        }
        if (ron('submit')) {
            await rvStep('review-submit', async (page, h) => {
                const s3 = page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true});
                if (await s3.count()) await s3.first().click();
                const submit = page.getByRole('button', {name: 'Submit Review', exact: true}).filter({visible: true});
                await submit.waitFor({timeout: 30000});
                const body = page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
                await body.click(); await body.pressSequentially('K2 original review comment.');
                const rec = page.locator('select[id="reviewerRecommendationId"]');
                if (await rec.count()) await rec.selectOption({index: 1});
                await h.snap('review-rv-step3');
                await submit.click();
                await page.getByRole('button', {name: 'OK', exact: true}).click();
                await page.getByRole('heading', {name: 'Review Submitted'}).waitFor({timeout: 30000}).catch(() => {});
                await h.snap('review-rv-submitted');
            });
            await edSect('review-submitted', async (page, h) => { await diff(h, 'review-5-after-submit', 'submit'); });
        }
        if (ron('modify')) await edSect('review-modify', async (page, h) => {
            await rrow(h).getByRole('button', {name: 'Read Review', exact: true}).click();
            const read = page.getByRole('dialog', {name: /^Review Details:/});
            await read.getByRole('button', {name: 'Modify Review', exact: true}).waitFor({timeout: 30000});
            await page.waitForFunction(() => true);
            await read.getByRole('button', {name: 'Modify Review', exact: true}).click();
            const conf = page.locator('[data-cy="dialog"]').filter({hasText: 'Modify this review?'});
            await conf.getByRole('button', {name: 'Modify Review', exact: true}).click();
            const em = page.getByRole('dialog', {name: /^Modify Review/});
            await em.waitFor({timeout: 30000});
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), 'reviewDetailsForm-comments-control', {timeout: 30000});
            await page.evaluate(([i, v]) => { const e = window.tinymce.get(i); e.setContent(v); e.fire('change'); }, ['reviewDetailsForm-comments-control', '<p>K2 modified review comment.</p>']);
            await h.snap('review-modify-window');
            await em.getByRole('button', {name: 'Save Changes', exact: true}).click();
            await em.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            // mark complete, so the row offers "Thank Reviewer"
            const mc = read.getByRole('button', {name: 'Mark as Complete', exact: true});
            if (await mc.count()) {
                await mc.click();
                const d = page.locator('[data-cy="dialog"]').filter({hasText: 'Mark this review as complete?'});
                await d.getByRole('button', {name: 'Mark as Complete', exact: true}).click();
                await page.getByText('The review has been marked as complete.').first().waitFor({timeout: 30000}).catch(() => {});
            }
            await read.getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {});
            await h.reland();
            await diff(h, 'review-6-after-modify', 'modify');
            // "View changes" on the review-change line
            await h.openLog();
            const r = await h.findRow(/was modified in this review/);
            if (r) {
                const x = await h.expand(r.i);
                rv.modifyStrip = x && x.links;
                const vc = x && x.strip.getByRole('link', {name: 'View changes'}).first();
                if (vc && await vc.count()) {
                    await loc(page, 'a review-change line\'s "View changes"', vc);
                    await vc.click();
                    const w = page.getByRole('dialog', {name: 'View Review'}).last();
                    await w.waitFor({timeout: 20000}).catch(() => {});
                    await idle(page); await sleep(800);
                    const s = await h.snap('review-view-changes-window');
                    rv.viewChanges = flat(s.text.dialog, 1500);
                    log('view changes', rv.viewChanges);
                }
            }
            await h.closeLog();
        });
        if (ron('thank')) await edSect('review-thank', async (page, h) => {
            const b = rrow(h).getByRole('button', {name: 'Thank Reviewer'});
            rv.thankButton = await b.count();
            await h.snap('review-row-complete');
            if (rv.thankButton) {
                await b.first().click();
                const w = topWin(page);
                await w.getByRole('button', {name: 'Thank Reviewer', exact: true}).waitFor({timeout: 30000});
                await awaitMce(page, 'message');
                await sleep(500);
                await w.getByRole('button', {name: 'Thank Reviewer', exact: true}).click();
                await sleep(1500);
                await h.reland();
            }
            await diff(h, 'review-7-after-thank', 'thank');
        });
        if (ron('revisions')) await edSect('review-revisions', async (page, h) => {
            await h.wf().getByRole('button', {name: 'Request Revisions', exact: true}).click();
            const m = page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
            await m.getByRole('radio', {name: 'Revisions will not be subject to a new round of peer reviews.'}).check();
            await m.getByRole('button', {name: 'Next', exact: true}).click();
            await page.waitForURL(/decision\/record/, {timeout: 30000});
            rv.decisionPages = [];
            for (let i = 0; i < 6; i++) {
                await page.locator('.composer__loadingTemplateMask').first().waitFor({state: 'detached', timeout: 30000}).catch(() => {});
                await idle(page);
                rv.decisionPages.push(await page.locator('h1').first().innerText().catch(() => ''));
                const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
                if (await rec.isVisible().catch(() => false)) { await h.snap('review-revisions-last-step'); await rec.click(); break; }
                await page.getByRole('button', {name: 'Continue', exact: true}).click();
            }
            await page.getByRole('link', {name: /View Submission/}).first().waitFor({timeout: 45000}).catch(() => {});
            await h.snap('review-revisions-recorded');
            await h.open(id, RKEY);
            await diff(h, 'review-8-after-revisions', 'revisions');
        });
        if (ron('revupload')) {
            await sect('review-revupload', async (page, h) => {
                await h.as('au');
                await page.goto(auUrl(id, RKEY));
                await h.wf().locator('[data-cy="sidemodal-header"]').waitFor({timeout: 30000}).catch(() => {});
                await idle(page); await sleep(1000);
                await h.snap('review-au-view');
                const up = h.wf().getByRole('button', {name: 'Upload', exact: true}).first();
                rv.auUpload = await up.count();
                if (rv.auUpload) {
                    await up.click();
                    const w = page.getByRole('dialog').filter({has: page.locator('.pkp_controller_fileUpload')}).last();
                    await w.locator('input[type="file"]').first().waitFor({state: 'attached', timeout: 30000});
                    await idle(page);
                    const g = w.locator('select[id^="genreId"]');
                    if (await g.count() && await g.isEnabled()) await g.selectOption({index: 1});
                    await w.locator('input[type="file"]').first().setInputFiles(fixture(app, 'notes.md'));
                    await w.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
                    await sleep(1000);
                    await w.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                    await w.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await sleep(800);
                    await w.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page); await sleep(1500);
                    await h.snap('review-au-after-upload');
                }
            });
            await edSect('review-revuploaded', async (page, h) => { await diff(h, 'review-9-after-revupload', 'revupload'); });
        }
        // every email line of the submission: "User" beside the window's From and To
        if (ron('views')) await edSect('review-views', async (page, h) => {
            await h.openLog();
            const rows = await h.rows();
            rv.views = [];
            for (const r of rows.filter((x) => /^An email has been sent/.test(x.event))) {
                await h.ensureLog();
                const v = await h.viewEmail(r.i, `review-view-${r.i}`);
                const t = v.text || '';
                rv.views.push({user: r.user, event: r.event, from: (t.match(/From: ([^\n]*)/) || [])[1], to: (t.match(/To: ([^\n]*)/) || [])[1]});
                await h.reland();
            }
            log('views', JSON.stringify(rv.views));
        });
        // the mails the reviewer steps sent
        rv.mail = {rv: await mailTo('rv'), ed: await mailTo('ed'), au: await mailTo('au', {contains: `K2 R ${S.t}`})};
        fact('review', {...(facts.review || {}), ...rv, last: prev}, true);
        log('review mail', JSON.stringify({rv: rv.mail.rv.map((m) => `${m.subject} | ${m.from}`), ed: rv.mail.ed.map((m) => `${m.subject} | ${m.from}`)}));
    }

    // =====================================================================
    // pub: the publish line, a new version, a metadata save (Rule 3 rows "Publishing and versions", "Metadata")
    if (on('pub') && S.P) await sect('pub', async (page, h) => {
        const out = {};
        const id = S.P.submissionId;
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        await h.as('mg');
        await h.open(id, `publication_${S.P.publicationId}_titleAbstract`, 'pub-mg-published');
        let before = await history('pub-0-history');
        out.published = brief(before.filter((r) => /published|posted/.test(r.event)));
        log('publish lines', JSON.stringify(out.published));
        try {
            await page.getByRole('link', {name: 'Create New Version', exact: true}).click();
            const d = page.getByRole('dialog').filter({hasText: /Confirm/}).filter({has: page.locator('select, input[type=radio]')}).last();
            await d.getByRole('button', {name: 'Confirm', exact: true}).waitFor({timeout: 30000});
            await sleep(1500);
            await h.snap('pub-version-dialog');
            const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000});
            await d.getByRole('button', {name: 'Confirm', exact: true}).click();
            const resp = await created;
            out.versionStatus = resp.status();
            out.newPub = (await resp.json().catch(() => ({}))).id;
            await sleep(1500);
        } catch (e) { out.versionError = String(e.message).split('\n')[0]; log('version ERROR', out.versionError); await shot(page, 'pub-version-error').catch(() => {}); }
        await h.open(id, out.newPub ? `publication_${out.newPub}_titleAbstract` : null);
        let after = await history('pub-1-after-version');
        out.version = brief(newLines(before, after)); log('version adds', JSON.stringify(out.version)); before = after;
        try {
            const ifr = page.locator('iframe[id^="titleAbstract-title-control"]').first();
            await ifr.waitFor({timeout: 30000});
            const eid = (await ifr.getAttribute('id')).replace(/_ifr$/, '');
            await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), eid, {timeout: 30000});
            await page.frameLocator(`#${eid}_ifr`).locator('body').click();
            await page.keyboard.press('End');
            await page.keyboard.type(' v2');
            await sleep(300);
            const saved = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 30000});
            await h.wf().getByRole('button', {name: 'Save', exact: true}).first().click();
            out.saveStatus = (await saved).status();
            await sleep(1000);
            await h.snap('pub-title-saved');
        } catch (e) { out.saveError = String(e.message).split('\n')[0]; log('save ERROR', out.saveError); await shot(page, 'pub-save-error').catch(() => {}); }
        await h.reland();
        after = await history('pub-2-after-metadata');
        out.metadata = brief(newLines(before, after)); log('metadata adds', JSON.stringify(out.metadata)); before = after;
        // OPS: a preprint posted on screen
        if (isOPS) {
            const Q = await lazySub('Q', {participants: [{username: U('se'), role: 'sectionEditor'}]});
            await h.open(Q.submissionId, 'workflow_5');
            const b0 = await history('pub-q-0-history');
            try {
                const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
                const postControl = page.getByRole('button', {name: 'Post', exact: true});
                await stageAction.or(postControl).first().waitFor({timeout: 30000});
                if (await stageAction.isVisible()) await stageAction.click();
                await postControl.waitFor({timeout: 30000});
                await postControl.click();
                const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
                await confirm.waitFor({timeout: 30000});
                await h.snap('pub-q-post-confirm');
                const posted = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()), {timeout: 30000});
                await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
                out.postStatus = (await posted).status();
                await sleep(1500);
            } catch (e) { out.postError = String(e.message).split('\n')[0]; log('post ERROR', out.postError); await shot(page, 'pub-q-post-error').catch(() => {}); }
            await h.open(Q.submissionId, 'workflow_5');
            const a0 = await history('pub-q-1-after-post');
            out.post = brief(newLines(b0, a0)); log('post adds', JSON.stringify(out.post));
        }
        fact('pub', out, true);
    });

    // =====================================================================
    // formats {OMP}: Rule 11 and OMP1
    if (on('formats') && isOMP && S.M) await sect('formats', async (page, h) => {
        const out = {};
        const id = S.M.submissionId;
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        const gotoFormats = async () => {
            await h.open(id, `publication_${S.M.publicationId}_titleAbstract`);
            await h.wf().getByRole('link', {name: /^Publication Formats$/}).first().click();
            await idle(page); await sleep(1500); await idle(page);
        };
        const row = () => h.wf().locator('tr').filter({hasText: 'K2 Format'}).first();
        await h.as('ed');
        await h.open(id, 'workflow_5');
        let before = await history('formats-0-history');
        const diff = async (label, key) => { await h.open(id, 'workflow_5'); const a = await history(label); out[key] = brief(newLines(before, a)); log(`${key} adds`, JSON.stringify(out[key])); before = a; };
        try {
            await gotoFormats();
            await h.snap('formats-page');
            if (process.env.FMT_SKIP_ADD) throw new Error('add skipped');
            const add = h.wf().getByRole('button', {name: /Add (publication )?format/i}).or(h.wf().getByRole('link', {name: /Add (publication )?format/i})).first();
            await add.click();
            const nameBox = page.locator('[role="dialog"]:visible').last().locator('input[name^="name"]').first();
            await nameBox.waitFor({timeout: 30000});
            await idle(page);
            await nameBox.fill('K2 Format');
            await h.snap('formats-add-window');
            await page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(Save|OK)$/}).last().click();
            await idle(page); await sleep(1500);
        } catch (e) { out.addError = String(e.message).split('\n')[0]; log('add ERROR', out.addError); await shot(page, 'formats-add-error').catch(() => {}); }
        await diff('formats-1-after-add', 'add');
        // the row's controls
        try {
            await gotoFormats();
            const r = row();
            out.rowHtml = flat(await r.innerText().catch(() => ''), 400);
            out.rowControls = await r.locator('a, button, input').evaluateAll((els) => els.map((e) => ({tag: e.tagName, text: (e.innerText || e.value || '').trim().slice(0, 60), title: e.getAttribute('title'), name: e.getAttribute('name'), cls: e.className.slice(0, 80), checked: e.checked})));
            out.headers = await h.wf().locator('th, [role=columnheader]').allInnerTexts().catch(() => []);
            await h.snap('formats-row');
            log('row', JSON.stringify({row: out.rowHtml, controls: out.rowControls, headers: out.headers}).slice(0, 2500));
        } catch (e) { out.rowError = String(e.message).split('\n')[0]; log('row ERROR', out.rowError); }
        // approve, make available, make unavailable, withdraw approval, delete: each followed by the History
        const press = async (key, re) => {
            try {
                await gotoFormats();
                const link = row().locator('a').filter({hasText: re}).first();
                out[`${key}.label`] = flat(await link.innerText().catch(() => ''), 80);
                await loc(page, `formats row "${out[`${key}.label`]}"`, link);
                await link.click();
                await idle(page); await sleep(1200);
                const ds = await h.dialogs();
                out[`${key}.dialogs`] = ds.slice(1).map((d) => d.text.slice(0, 400));
                await h.snap(`formats-${key}-dialog`);
                const top = page.locator('[role="dialog"]:visible').last();
                const ok = top.getByRole('button', {name: /^(OK|Yes|Save|Confirm|Approve)$/}).last();
                if (await ok.count()) { await ok.click(); await idle(page); await sleep(1500); }
            } catch (e) { out[`${key}.error`] = String(e.message).split('\n')[0]; log(key, 'ERROR', out[`${key}.error`]); await shot(page, `formats-${key}-error`).catch(() => {}); }
            await diff(`formats-${key}-history`, key);
        };
        await press('approve', /Awaiting Approval|Approved/);
        await press('available', /Not Available|Available/);
        await press('unavailable', /^\s*Available|Not Available/);
        await press('unapprove', /Approved|Awaiting Approval/);
        try {
            await gotoFormats();
            await row().locator('a.show_extras').first().click();
            await sleep(500);
            const strip = row().locator('xpath=following-sibling::tr[1]');
            out.stripLinks = await strip.locator('a').allInnerTexts().catch(() => []);
            await strip.getByRole('link', {name: /Delete/}).first().click();
            await idle(page); await sleep(800);
            const top = page.locator('[role="dialog"]:visible').last();
            out.deleteDialog = flat(await top.innerText().catch(() => ''), 300);
            await top.getByRole('button', {name: /^(OK|Yes|Delete)$/}).last().click();
            await idle(page); await sleep(1500);
        } catch (e) { out.deleteError = String(e.message).split('\n')[0]; log('delete ERROR', out.deleteError); await shot(page, 'formats-delete-error').catch(() => {}); }
        await diff('formats-delete-history', 'delete');
        log('formats out', JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => /dialogs|label|error|strip|deleteDialog/.test(k)))).slice(0, 3000));
        fact('formats', out, true);
    });

    // =====================================================================
    // galley {OPS}: a galley's file lines (Rule 6 on a preprint server) and its deletion
    if (on('galley') && isOPS && S.G) await sect('galley', async (page, h) => {
        const out = {};
        const id = S.G.submissionId;
        const history = async (label) => { const r = await h.readLog(label); await h.closeLog(); return r || []; };
        const key = `publication_${S.G.publicationId}_galleys`;
        await h.as('se');
        await h.open(id, key, 'galley-se-page');
        let before = await history('galley-0-history');
        try {
            await h.wf().getByRole('button', {name: /^Add galley$/i}).first().click();
            const form = page.locator('[role="dialog"]:visible').last();
            await form.locator('input[name="label"]').waitFor({timeout: 30000});
            await idle(page);
            await form.locator('input[name="label"]').fill('PDF');
            await form.getByRole('button', {name: /^(Save|OK)$/}).last().click();
            await idle(page);
            const P = require('../../../pages/SubmissionFilesPages.js');
            const w = new P.UploadWizard(page, 'Upload a File Ready for Publication');
            await w.dialog().waitFor({timeout: 30000});
            await w.fileInput().waitFor({state: 'attached', timeout: 30000});
            await idle(page);
            const g = w.componentSelect();
            if (await g.count() && await g.isEnabled()) await g.selectOption({index: 1});
            await w.attach(fixture(app, 'preprint.pdf'), 'preprint.pdf');
            await w.continueTo(P.WIZARD_STEPS[1]);
            await w.continueTo(P.WIZARD_STEPS[2]);
            await w.complete();
            await h.reland();
        } catch (e) { out.addError = String(e.message).split('\n')[0]; log('add ERROR', out.addError); await shot(page, 'galley-add-error').catch(() => {}); }
        let after = await history('galley-1-after-add');
        out.add = brief(newLines(before, after)); log('galley add adds', JSON.stringify(out.add)); before = after;
        try {
            const r = h.wf().locator('tbody tr').filter({hasText: 'PDF'}).first();
            await r.locator('button').last().click();
            out.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
            await page.getByRole('menuitem', {name: 'Delete'}).first().click();
            const d = page.getByRole('dialog', {name: 'Delete'}).last();
            await d.getByRole('button', {name: 'OK', exact: true}).click();
            await sleep(1500);
            await h.reland();
        } catch (e) { out.delError = String(e.message).split('\n')[0]; log('delete ERROR', out.delError); await shot(page, 'galley-del-error').catch(() => {}); }
        after = await history('galley-2-after-delete');
        out.del = brief(newLines(before, after)); log('galley delete adds', JSON.stringify(out.del));
        out.fileLinesAfter = brief(after.filter((x) => /preprint\.pdf/.test(x.event)));
        log('file lines after delete', JSON.stringify(out.fileLinesAfter));
        fact('galley', out, true);
    });

    // =====================================================================
    // notes: the Side effects of a note, its deletion, opening the window, "Download" and "View Email"
    const bell = async (page) => flat(await page.locator('header').getByRole('button', {name: /Tasks/}).first().innerText().catch(() => ''), 40);
    if (on('notes') && S.N) {
        const id = S.N.submissionId;
        const NKEY = isOPS ? 'workflow_5' : 'workflow_1';
        const out = {};
        const readBells = async (tagk) => {
            for (const k of ['se', 'au', 'mg']) await sect(`notes-bell-${k}-${tagk}`, async (page, h) => { await h.as(k); await page.goto(app.url(`/index.php/${CP}/en/dashboard/${k === 'au' ? 'mySubmissions' : 'editorial'}`)); await idle(page); out[`bell.${k}.${tagk}`] = await bell(page); });
        };
        await readBells('before');
        out.mailBefore = await mailCounts();
        await sect('notes', async (page, h) => {
            await h.as('mg');
            await h.open(id, NKEY, 'notes-mg-stage');
            const r0 = await h.readLog('notes-0-history');
            // opening and closing the window twice adds nothing
            await h.closeLog();
            const r1 = await h.readLog('notes-1-history-again');
            out.openAdds = brief(newLines(r0, r1));
            // "Download" and "View Email" on the History
            const fileRow = r1.find((x) => x.arrow && /uploaded/.test(x.event));
            if (fileRow) out.dl = await h.download(fileRow.i, 'notes-dl');
            await h.ensureLog();
            const mailRow = (await h.rows()).find((x) => x.arrow && /^An email has been sent/.test(x.event));
            if (mailRow) { const v = await h.viewEmail(mailRow.i, 'notes-viewemail'); out.viewed = {heading: v.heading}; }
            await h.closeLog();
            const r2 = await h.readLog('notes-2-history-after-actions');
            out.actionsAdd = brief(newLines(r1, r2));
            log('open/download/view add', JSON.stringify({open: out.openAdds, actions: out.actionsAdd, dl: out.dl && out.dl.name}));
            // post a note
            const d = h.logDialog();
            await d.getByRole('tab', {name: 'Notes'}).click();
            await idle(page);
            const box = d.getByRole('textbox', {name: 'Add Note'});
            await box.waitFor({timeout: 30000});
            await h.snap('notes-tab');
            await box.fill('K2 note for the side effects.');
            const t0 = Date.now();
            const noticeSeen = page.getByText('Note posted.').first().waitFor({timeout: 15000}).then(() => Date.now() - t0).catch(() => null);
            await d.getByRole('button', {name: 'Add Note', exact: true}).click();
            out.notePostedNotice = await noticeSeen;
            await idle(page);
            await h.snap('notes-after-post');
            await d.getByRole('tab', {name: 'History'}).click();
            await idle(page); await sleep(800);
            const r3 = await h.rows();
            out.noteAdds = brief(newLines(r2, r3));
            log('note adds', JSON.stringify(out.noteAdds), 'notice ms', out.notePostedNotice);
            // delete the note
            await d.getByRole('tab', {name: 'Notes'}).click();
            await idle(page);
            const del = d.locator('.note').filter({hasText: 'K2 note for the side effects.'}).getByRole('button', {name: 'Delete', exact: true});
            await del.click();
            const conf = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this note?'}).last();
            await conf.getByRole('button', {name: 'OK', exact: true}).waitFor({timeout: 15000});
            const t1 = Date.now();
            const delSeen = page.getByText('Note deleted.').first().waitFor({timeout: 15000}).then(() => Date.now() - t1).catch(() => null);
            await conf.getByRole('button', {name: 'OK', exact: true}).click();
            out.noteDeletedNotice = await delSeen;
            await idle(page);
            await h.snap('notes-after-delete');
            await h.closeLog();
            const r4 = await h.readLog('notes-3-history-after-delete');
            out.deleteAdds = brief(newLines(r3, r4));
            log('delete adds', JSON.stringify(out.deleteAdds), 'notice ms', out.noteDeletedNotice);
            await h.closeLog();
        });
        await sleep(3000);
        out.mailAfter = await mailCounts();
        await readBells('after');
        log('mail before/after', JSON.stringify({b: out.mailBefore, a: out.mailAfter}), 'bells', JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k]) => k.startsWith('bell.')))));
        fact('notes', out, true);
    }

    // =====================================================================
    // loginas: Rule 4b, the administrator acting as the section editor through the Participants row's "Login As"
    if (on('loginas') && S.N) await sect('loginas', async (page, h) => {
        const out = {};
        const id = S.N.submissionId;
        const NKEY = isOPS ? 'workflow_5' : 'workflow_1';
        await h.as('admin');
        await h.open(id, NKEY, 'loginas-admin-stage');
        try {
            const SP = require('../../../pages/StageParticipantsPages.js');
            const panel = new SP.ParticipantsPanel(page, CP);
            await panel.openMenu(name('se'));
            out.menu = await panel.menuLabels();
            await panel.menuItem('Login As').click();
            const d = page.getByRole('dialog').filter({hasText: 'Log in as this user?'}).last();
            await d.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForLoadState('load'); await idle(page);
            out.landed = page.url().replace(/^.*index\.php/, '');
        } catch (e) { out.loginAsError = String(e.message).split('\n')[0]; log('login as ERROR', out.loginAsError); }
        await h.open(id, NKEY, 'loginas-acting-stage');
        const r0 = await h.readLog('loginas-0-history');
        // a note
        try {
            const d = h.logDialog();
            await d.getByRole('tab', {name: 'Notes'}).click(); await idle(page);
            await d.getByRole('textbox', {name: 'Add Note'}).fill('K2 note under Login As.');
            await d.getByRole('button', {name: 'Add Note', exact: true}).click();
            await idle(page); await sleep(800);
        } catch (e) { out.noteError = String(e.message).split('\n')[0]; log('note ERROR', out.noteError); }
        await h.closeLog();
        // a file line: OJS/OMP a file's details saved; OPS a discussion with a file
        try {
            if (!isOPS) {
                const P = require('../../../pages/SubmissionFilesPages.js');
                const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
                const list = new P.FileList(page, new WorkflowPage(page, CP), 'Submission Files');
                await list.choose(list.row('article.pdf'), 'Update File Details');
                const e = new P.EditFileWindow(page);
                await e.expectOpen();
                await e.nameBox().fill('Renamed under Login As');
                await e.save();
            } else {
                const T = require('../../../pages/TasksDiscussionsPages.js');
                const panel = new T.TasksDiscussionsPanel(page, CP, {title: PANEL});
                await panel.expectSettled();
                const add = await panel.openAdd();
                await add.nameField().fill(`K2 loginas ${S.t}`);
                await add.tick(U('au'));
                await add.typeMessage('K2 message under Login As.');
                const att = await add.openAttachFiles();
                await att.upload(fixture(app, 'not-an-image.txt'));
                await add.saveExpectClosed();
            }
            await h.reland();
        } catch (e) { out.fileError = String(e.message).split('\n')[0]; log('file ERROR', out.fileError); await shot(page, 'loginas-file-error').catch(() => {}); }
        const r1 = await h.readLog('loginas-1-history-after');
        out.adds = r1 ? newLines(r0 || [], r1).map((r) => `${r.user} | ${r.event}`) : null;
        log('login-as adds', JSON.stringify(out.adds));
        await h.closeLog();
        fact('loginas', out, true);
    });

    // =====================================================================
    // discdel: td6 first part — the discussion's file line after the discussion is deleted
    if (on('discdel') && S.D) await sect('discdel', async (page, h) => {
        const T = require('../../../pages/TasksDiscussionsPages.js');
        const panel = new T.TasksDiscussionsPanel(page, CP, {title: PANEL});
        const out = {};
        const id = S.D.submissionId;
        await h.as(S.edKey);
        await h.open(id, DKEY);
        const r0 = await h.readLog('discdel-0-history');
        const line0 = (r0 || []).find((x) => /not-an-image\.txt/.test(x.event) && x.user === name(S.edKey));
        out.before = line0 || null;
        if (line0) out.dlBefore = await h.download(line0.i, 'discdel-dl-before');
        await h.closeLog();
        try {
            await panel.expectSettled();
            const dlg = await panel.openDelete(discName);
            await dlg.answer('OK').catch(async () => { await dlg.answer('Yes'); });
            await panel.reland();
        } catch (e) { out.delError = String(e.message).split('\n')[0]; log('delete ERROR', out.delError); await shot(page, 'discdel-error').catch(() => {}); }
        const r1 = await h.readLog('discdel-1-history-after');
        out.adds = brief(newLines(r0, r1));
        const line1 = (r1 || []).find((x) => /not-an-image\.txt/.test(x.event) && x.user === name(S.edKey));
        out.after = line1 || null;
        if (line1 && line1.arrow) out.dlAfter = await h.download(line1.i, 'discdel-dl-after');
        log('discdel', JSON.stringify(out));
        await h.closeLog();
        fact('discdel', out, true);
    });

    // =====================================================================
    // wizard: a draft submitted through the wizard by its author, a section editor already on it
    // (Rule 3 row "Submitting", 4c: the acknowledgement and the automatic editor-assigned email)
    if (on('wizard')) await sect('wizard', async (page, h) => {
        const out = {};
        const W = await lazySub('W', {submitted: false, participants: [{username: U('se'), role: 'sectionEditor'}], ...(isOPS ? {} : {files: [{file: 'article.pdf'}]})});
        const cur = () => page.locator('.pkpSteps__step__label--current');
        const cont = async (label) => {
            const b = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
            for (let a = 0; ; a++) { await b.click(); try { await cur().filter({hasText: label}).waitFor({timeout: 6000}); return; } catch (e) { if (a >= 2) throw e; } }
        };
        try {
            await h.as('au');
            await page.goto(app.url(`/index.php/${CP}/en/submission?id=${W.submissionId}`));
            await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: 30000});
            await idle(page);
            if (isOPS) {
                const labelDialog = page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')});
                for (let a = 0; ; a++) { await page.getByRole('link', {name: 'Add File', exact: true}).click(); try { await labelDialog.first().waitFor({timeout: 5000}); break; } catch (e) { if (a >= 2) throw e; } }
                await labelDialog.locator('input[name="label"]').fill('PDF');
                await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();
                const upload = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
                const g = upload.locator('select[name="genreId"]').first();
                await g.waitFor({timeout: 30000});
                await g.selectOption({label: 'Preprint Text'});
                await upload.locator('input[type="file"]').setInputFiles(fixture(app, 'preprint.pdf'));
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
                await upload.getByRole('button', {name: 'Continue', exact: true}).click();
                await upload.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
                await upload.getByRole('button', {name: 'Continue', exact: true}).click();
                await upload.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
                await upload.getByRole('button', {name: 'Complete', exact: true}).click();
                await upload.waitFor({state: 'hidden', timeout: 30000});
                await idle(page);
            }
            await cont('Details');
            const ab = page.locator('iframe[id*="-abstract-"]');
            if (await ab.count()) { const b = page.frameLocator('iframe[id*="-abstract-"]').first().locator('body'); if (!(await b.innerText().catch(() => '')).trim()) { await b.click(); await b.fill('K2 wizard abstract.'); } }
            await cont('Contributors');
            if (isOPS) { await cont('For Readers'); await page.getByRole('radio', {name: 'This preprint has not been published elsewhere.'}).check(); } else await cont('For the Editors');
            const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000});
            await cont('Review');
            await validated.catch(() => {});
            await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
            await h.snap('wizard-review');
            await page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true}).click();
            const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
            await d.waitFor({timeout: 30000});
            await d.getByRole('button', {name: 'Submit', exact: true}).click();
            await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
            await h.snap('wizard-complete');
        } catch (e) { out.error = String(e.message).split('\n')[0]; log('wizard ERROR', out.error); await shot(page, 'wizard-error').catch(() => {}); }
        await h.as('mg');
        await h.open(W.submissionId, null);
        const rows = await h.readLog('wizard-history');
        out.history = brief(rows);
        const views = [];
        for (const r of (rows || []).filter((x) => /^An email has been sent/.test(x.event))) {
            await h.ensureLog();
            const v = await h.viewEmail(r.i, `wizard-view-${r.i}`);
            const t = v.text || '';
            views.push({user: r.user, event: r.event, from: (t.match(/From: ([^\n]*)/) || [])[1], to: (t.match(/To: ([^\n]*)/) || [])[1]});
            await h.reland();
        }
        out.views = views;
        log('wizard history', JSON.stringify(out.history), 'views', JSON.stringify(views));
        fact('wizard', out, true);
    });

    saveFacts();
});
