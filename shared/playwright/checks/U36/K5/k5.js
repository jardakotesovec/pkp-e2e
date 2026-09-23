// U36 claim check, chunk K5: the cross-feature pointers checked on their screens, and a galley's
// "Change File" (register A5), on all three apps.
// Spec: docs/specs/U36-submission-files.md lines 389–430 (Cross-feature interactions), 552–559 (A5).
//
// Per app one scratch context T. OJS/OMP users: mgr (manager), se (sectionEditor), ce (copyeditor),
// le (layoutEditor), rv (externalReviewer), au (author); OPS: mgr, se (Moderator), au.
// Submissions (author au):
//   st  every stage passed (review round with a file, accepted, in production), se+ce+le assigned → the stage lists (phase stages)
//   dc  Submission stage, au's article.pdf                    → "Send for Review": "Attach Files" and "Select Files" (phase decision)
//   rv1 review round, a round file, rv accepted              → rv's step 1 files and step 3 upload; editor's "Read Review" (phase review)
//   rr  review round, revisions requested, a round file      → a revision with a Summary of Changes, "Insert Content" (phase insert)
//   pp  Production, article.pdf                                → notes.md onto "Production Ready Files", "Send to Text Editor",
//                                                                Activity Log, a discussion's file, the Submission Library (phases text, log)
//   g1  (OJS, OPS) Production with a PDF galley; g2 with an HTML galley → "Change File", "More Information" (phase galley, A5)
//   OPS: dd a preprint for the "Decline" email's "Attach Files" (phase decision, control)
// Settings (phase settings): Components, "Upload Files" guidance, the anonymizing box, on T.
//
//   PROBE_FEATURE=U36 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U36/K5/k5.js
//   PHASES=seed,galley,gfile,gclose,fmtfile,fmtfile2,wizard,notice,settings,stages,decision,review,insert,text,log,formats
//   (default all; state in k5-state-<app>.json). gclose seeds fresh galleys per run; K5_NEWDC=1 gives decision a fresh submission.
//   Galley phases mutate: galley replaces g1/g2's files, so gfile after galley reads "replacement.pdf" by design.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const ALL = ['seed', 'galley', 'gfile', 'gclose', 'fmtfile', 'fmtfile2', 'wizard', 'notice', 'readmgr', 'settings', 'stages', 'decision', 'review', 'insert', 'text', 'log', 'formats'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k5-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)});
    }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const vis = '[role="dialog"]:visible';
const topWin = (page) => page.locator(vis).last();
const dialogTexts = (page) => page.locator(vis).evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
        text: d.innerText.slice(0, 6000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit]')].filter((b) => b.getClientRects().length).map((b) => (b.getAttribute('aria-label') || b.innerText || b.value || '').trim()).filter(Boolean).slice(0, 60),
        links: [...d.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => a.innerText.trim()).filter(Boolean).slice(0, 60),
    }))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
// The workflow dialog as data: its side menu, headings, buttons, every visible table.
const wfInfo = (page) => page.evaluate(() => {
    const v = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(v);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(v).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => f(th.innerText)),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => f(tr.innerText).slice(0, 200)),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(v);
    const headings = hs.map((e) => f(e.innerText)).filter(Boolean).slice(0, 60);
    const descriptions = hs.map((h) => ({h: f(h.innerText), next: h.nextElementSibling && v(h.nextElementSibling) ? f(h.nextElementSibling.innerText).slice(0, 240) : null})).slice(0, 30);
    const buttons = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean).slice(0, 120);
    const nav = [...root.querySelectorAll('nav a, nav button, [role=navigation] a, [role=navigation] button, [role=menu] a, [class*="sideMenu"] a, [class*="SideMenu"] a, [class*="sideMenu"] button')].filter(v).map((a) => f(a.innerText)).filter(Boolean).slice(0, 60);
    const navAll = [...root.querySelectorAll('[class*="ideMenu"] a, [class*="ideMenu"] button, nav a, nav button')].map((a) => ({text: f(a.textContent), key: a.getAttribute('data-key') || a.getAttribute('href') || null})).filter((x) => x.text).slice(0, 80);
    return {url: location.href, dialogCount: dlgs.length, headings, descriptions, buttons, nav, navAll, tables, text: f(root.innerText).slice(0, 5000)};
});

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const PDF = isOPS ? fx('ops', 'preprint.pdf') : fx(app.name, 'article.pdf');
    const HTML = isOPS ? fx('ops', 'preprint.html') : fx(app.name, 'article.html');
    const MD = fx(isOPS ? 'ojs' : app.name, 'notes.md');
    const REPL = path.join(outDir(), 'replacement.pdf');
    fs.copyFileSync(PDF, REPL);
    const MAIN = isOMP ? 'Book Manuscript' : (isOPS ? 'Preprint Text' : 'Article Text');
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.T}${p}`);
    const workflow = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const authorWorkflow = (id, key, cp) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const roundKey = (s, n = 0) => (s.rounds && s.rounds[n] ? `workflow_${s.rounds[n].stageId}_${s.rounds[n].id}` : 'workflow_3');

    // ---- seed ---------------------------------------------------------------------------------
    if (on('seed') && !sc.T) {
        const t = tag('u36k5');
        const roleUsers = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author']]
            : [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sid', 'Section'], ['ce', 'copyeditor', 'Cleo', 'Copyeditor'],
                ['le', 'layoutEditor', 'Lee', 'Layout'], ['rv', 'externalReviewer', 'Rae', 'Reviewer'], ['au', 'author', 'Ava', 'Author']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U36 K5 ${t}`, acronym: 'KFIVE', contactName: 'K5 Contact', contactEmail: `${t}c@mail.test`}, users});
        sc.T = ctx.path || t;
        sc.u = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        sc.roles = Object.fromEntries(roleUsers.map(([k, r]) => [k, r]));
        save();
        const U = sc.u;
        const part = (k) => ({username: U[k], role: sc.roles[k]});
        const own = [{file: 'article.pdf'}];
        const subs = {};
        const mk = async (k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.T, submitter: U.au, title: `K5 ${k.toUpperCase()} ${t}`, ...spec});
                subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, rounds: r.reviewRounds, ras: r.reviewAssignments, files: r.files, galleys: r.galleys};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'rounds', JSON.stringify(r.reviewRounds), 'galleys', JSON.stringify(r.galleys));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700)); subs[k] = {error: String(e.message).slice(0, 700)}; }
        };
        if (isOPS) {
            await mk('g1', {participants: [part('se')], galleys: [{label: 'PDF', file: 'preprint.pdf'}]});
            await mk('g2', {participants: [part('se')], galleys: [{label: 'HTML', file: 'preprint.html'}]});
            await mk('dd', {participants: [part('se')]});
        } else {
            const se = part('se');
            const toReview = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
            if (isOMP) {
                await mk('st', {files: own, decisions: ['sendInternalReview', 'sendExternalReview', 'accept', 'sendToProduction'], reviewRounds: [{stage: 'internal', files: own}, {stage: 'external', files: own}], participants: [se, part('ce'), part('le')]});
                if (subs.st.error) await mk('st', {files: own, decisions: ['skipInternalReview', 'accept', 'sendToProduction'], reviewRounds: [{files: own}], participants: [se, part('ce'), part('le')]});
            } else {
                await mk('st', {files: own, decisions: ['sendExternalReview', 'accept', 'sendToProduction'], reviewRounds: [{files: own}], participants: [se, part('ce'), part('le')]});
            }
            await mk('dc', {files: own, participants: [se]});
            await mk('rv1', {files: own, decisions: toReview, reviewRounds: [{files: own, reviewers: [{username: U.rv, status: 'accepted'}]}], participants: [se]});
            await mk('rr', {files: own, decisions: [...toReview, 'requestRevisions'], reviewRounds: [{files: own}], participants: [se]});
            await mk('pp', {files: own, decisions: ['skipExternalReview', 'sendToProduction'], participants: [se, part('le')]});
            if (isOJS) {
                await mk('g1', {files: own, decisions: ['skipExternalReview', 'sendToProduction'], participants: [se], galleys: [{label: 'PDF', file: 'article.pdf'}]});
                await mk('g2', {files: own, decisions: ['skipExternalReview', 'sendToProduction'], participants: [se], galleys: [{label: 'HTML', file: 'article.html'}]});
            }
        }
        sc.subs = subs; save();
        record('seed', sc);
    }
    if (!sc.T) { log('[k5] no state; run the seed phase first'); return; }
    const u = sc.u; const S = sc.subs || {};
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => { jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300), url: page.url().replace(/^.*\/index\.php/, '')}); log('[browser dialog]', d.type(), flat(d.message(), 160)); d.accept().catch(() => {}); });
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const t = (e.innerText || '').trim();
                if (t && !seen.has(e)) { seen.add(e); window.__notices.push({t: t.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (since) => page.evaluate((s) => (window.__notices || []).filter((n) => n.at >= s).map((n) => n.t), since).catch(() => []);

    const signInAs = async (user, cp) => { await signIn(page, user, {contextPath: cp || sc.T}); await idle(page); };
    async function openWf(url, label) {
        await page.goto(url); await idle(page);
        await page.locator(vis).first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(300);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message), tables: [], buttons: [], headings: []}));
        if (label) {
            await snap(page, label, {info});
            log(`[${label}]`, 'url:', page.url().replace(/^.*\/index\.php/, '').slice(0, 140), '| headings:', JSON.stringify((info.headings || []).slice(0, 16)), '| tables:', JSON.stringify((info.tables || []).map((x) => `${x.name}: ${x.rows.join(' || ')}`)).slice(0, 900));
        }
        return info;
    }
    async function waitWindow() {
        await topWin(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function closeTop() {
        const top = topWin(page);
        const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) await c.click({timeout: 5000}).catch(() => {});
        else { const x = top.getByRole('button', {name: /Close/}).last(); if (await x.count()) await x.click().catch(() => {}); }
        await idle(page); await page.waitForTimeout(600);
    }
    const tableOf = (name) => page.locator(vis).first().getByRole('table', {name, exact: true}).first();
    async function rowMenu(tableName, rowText, press) {
        const t = tableOf(tableName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button').last();
        await btn.click(); await page.waitForTimeout(300);
        const items = await menuItems(page);
        if (press) {
            const it = page.getByRole('menuitem', {name: press, exact: true}).first();
            if (!(await it.count())) { await btn.click().catch(() => {}); return {items, noItem: true}; }
            await it.click(); await idle(page); await page.waitForTimeout(600); await idle(page);
        } else { await btn.click().catch(() => {}); await page.waitForTimeout(200); }
        return {items};
    }
    // ---- the legacy upload wizard ----
    const wiz = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    async function wizState() {
        const w = wiz();
        if (!(await w.count())) return {open: false};
        return w.evaluate((d) => {
            const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const panel = [...d.querySelectorAll('[role=tabpanel]')].find((p) => v(p) && p.getAttribute('aria-hidden') !== 'true') || d;
            const cur = panel.querySelector('#currentFile, [id*="currentFile"]');
            // what stands under the "Current file" heading, up to the uploader
            let under = null;
            const hs = [...panel.querySelectorAll('h1,h2,h3,h4,label,legend,.label,span,div,p')].filter((e) => f(e.innerText) === 'Current file');
            if (hs.length) {
                const h = hs[hs.length - 1];
                const sib = [];
                let n = h.nextElementSibling;
                for (let i = 0; n && i < 4; i++, n = n.nextElementSibling) sib.push({tag: n.tagName.toLowerCase(), cls: n.className.slice(0, 80), text: f(n.innerText).slice(0, 200), html: n.outerHTML.slice(0, 300)});
                under = {headingTag: h.tagName.toLowerCase(), headingHtml: h.outerHTML.slice(0, 200), parentHtml: h.parentElement.outerHTML.replace(/\s+/g, ' ').slice(0, 900), siblings: sib};
            }
            return {
                open: true,
                title: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
                tabs: [...d.querySelectorAll('[role=tab]')].map((t) => `${f(t.innerText)}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}${t.getAttribute('aria-disabled') === 'true' ? '(dis)' : ''}`),
                headings: [...panel.querySelectorAll('h1,h2,h3,h4,legend,label')].filter(v).map((e) => f(e.innerText)).filter(Boolean),
                genre: [...d.querySelectorAll('select[id^="genreId"]')].map((s) => ({visible: v(s), options: [...s.options].map((o) => o.text.trim())})),
                revise: [...d.querySelectorAll('select[id^="revisedFileId"]')].map((s) => ({visible: v(s), options: [...s.options].map((o) => o.text.trim())})),
                currentFileEl: cur ? f(cur.innerText) : null,
                under,
                uploaderScreenReaderOnly: (() => { const u = d.querySelector('.pkp_controller_fileUpload'); return u ? u.classList.contains('pkp_screen_reader') : null; })(),
                buttons: [...d.querySelectorAll('button, a')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                panelText: f(panel.innerText).slice(0, 2500),
            };
        }).catch((e) => ({error: String(e.message).slice(0, 300)}));
    }
    async function wizSnap(label) {
        const st = await wizState();
        await snap(page, label, {wizard: st});
        log(`[${label}]`, JSON.stringify({title: st.title, tabs: st.tabs, headings: st.headings, genre: st.genre, revise: st.revise, under: st.under && st.under.siblings, text: flat(st.panelText, 400)}).slice(0, 1600));
        return st;
    }
    const contBtn = () => wiz().getByRole('button', {name: 'Continue', exact: true});
    async function waitContinueEnabled(timeout = 30000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) { if (await contBtn().isEnabled().catch(() => false)) return true; await page.waitForTimeout(200); }
        return false;
    }
    async function pickGenre(label) { const g = wiz().locator('select[id^="genreId"]'); if (await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label}); }
    async function attach(file) { await wiz().locator('input[type="file"]').setInputFiles(file); return waitContinueEnabled(); }
    async function toStep(n) {
        await contBtn().click();
        await wiz().getByRole('tab', {name: new RegExp(`^${n}\\.`)}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        if (n === 2) await wiz().locator('input[type="text"]:visible, textarea:visible').first().waitFor({timeout: 20000}).catch(() => {});
        if (n === 3) await wiz().getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function complete() {
        await wiz().getByRole('button', {name: 'Complete', exact: true}).click();
        await wiz().waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(600); await idle(page);
    }
    async function wizCancel() {
        const c = wiz().getByRole('link', {name: 'Cancel', exact: true}).or(wiz().getByRole('button', {name: 'Cancel', exact: true})).first();
        await c.click().catch(() => {});
        await page.waitForTimeout(1000);
        await wiz().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
    }
    async function wizUpload({genre, file, summary}) {
        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
        if (genre) await pickGenre(genre);
        await attach(file); await toStep(2);
        if (summary) {
            const ta = wiz().locator('textarea[id*="summaryOfChanges"]').first();
            if (await ta.count()) {
                const id = await ta.getAttribute('id');
                await page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 20000}).catch(() => {});
                await wiz().frameLocator(`iframe[id^="${id}"]`).locator('body').click();
                await page.keyboard.type(summary); await page.waitForTimeout(300);
            }
        }
        await toStep(3); await complete();
    }

    try {
        // =========================================================================================
        // Phase galley (OJS, OPS): the galley row's menu, "Change File" (A5, d4), "More Information"; OMP control.
        if (on('galley') && !isOMP && S.g1 && S.g1.id) await sect('galley', async () => {
            const out = {};
            const gp = (k) => workflow(S[k].id, `publication_${S[k].publicationId}_galleys`);
            for (const who of ['mgr', 'se']) {
                await signInAs(u[who]);
                for (const [k, label] of [['g1', 'PDF'], ['g2', 'HTML']]) {
                    const info = await openWf(gp(k), `galley-${who}-${k}-page`);
                    out[`${who}-${k}-page`] = {headings: info.headings, tables: info.tables, buttons: info.buttons.filter((b) => /galley|Add|Upload/i.test(b))};
                    const t = page.locator(vis).first().locator('tbody tr').filter({hasText: label}).first();
                    await t.waitFor({timeout: 20000}).catch(() => {});
                    const btn = t.locator('button').last();
                    out[`${who}-${k}-rowButton`] = await btn.evaluate((b) => b.getAttribute('aria-label') || b.innerText.trim()).catch(() => null);
                    await btn.click(); await page.waitForTimeout(300);
                    out[`${who}-${k}-menu`] = await menuItems(page);
                    await snap(page, `galley-${who}-${k}-menu`, {menu: out[`${who}-${k}-menu`]});
                    const cf = page.getByRole('menuitem', {name: 'Change File'}).first();
                    await loc(page, `Galleys row "${label}" › menu item "Change File"`, cf);
                    if (!(await cf.count())) { await btn.click().catch(() => {}); continue; }
                    await cf.click();
                    await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}).catch(() => {});
                    await idle(page); await page.waitForTimeout(500);
                    out[`${who}-${k}-change`] = await wizSnap(`galley-${who}-${k}-changefile-step1`);
                    await loc(page, 'Change File wizard: "Current file" text', wiz().getByText('Current file', {exact: true}));
                    if (who === 'mgr' && k === 'g1') {
                        // leave the step with a file chosen and unsaved: the header "Close"
                        await attach(REPL);
                        out.afterAttach = await wizSnap('galley-mgr-g1-changefile-attached');
                        const before = jsDialogs.length; const t0 = Date.now();
                        await wiz().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                        await page.waitForTimeout(1500); await idle(page);
                        out.closeWithFile = {jsDialogs: jsDialogs.slice(before), notices: await noticesSince(t0), wizardStillOpen: await wiz().isVisible().catch(() => false)};
                        log('[galley close with file]', JSON.stringify(out.closeWithFile));
                        if (out.closeWithFile.wizardStillOpen) await wizCancel();
                        const after = await openWf(gp(k), 'galley-mgr-g1-after-close');
                        out.afterCloseTable = after.tables;
                    } else {
                        await wizCancel();
                    }
                    if (who === 'mgr' && k === 'g2') {
                        // complete a Change File on the HTML galley: what the row says afterwards
                        await page.locator(vis).first().locator('tbody tr').filter({hasText: label}).first().locator('button').last().click();
                        await page.getByRole('menuitem', {name: 'Change File'}).first().click();
                        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                        await attach(REPL); await toStep(2);
                        out.g2step2 = await wizSnap('galley-mgr-g2-changefile-step2');
                        await toStep(3); await complete();
                        const i2 = await openWf(gp(k), 'galley-mgr-g2-after-change');
                        out.g2after = i2.tables;
                        // the second Change File: does "Current file" now name something?
                        await page.locator(vis).first().locator('tbody tr').filter({hasText: label}).first().locator('button').last().click();
                        await page.getByRole('menuitem', {name: 'Change File'}).first().click();
                        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                        out.g2second = await wizSnap('galley-mgr-g2-changefile-second');
                        await wizCancel();
                    }
                    // More Information on the galley
                    await openWf(gp(k));
                    const t2 = page.locator(vis).first().locator('tbody tr').filter({hasText: label}).first();
                    await t2.locator('button').last().click(); await page.waitForTimeout(300);
                    const mi = page.getByRole('menuitem', {name: 'More Information'}).first();
                    if (await mi.count()) {
                        await mi.click(); await waitWindow(); await page.waitForTimeout(800); await idle(page);
                        const d = (await dialogTexts(page)).slice(-1)[0];
                        const tabs = await topWin(page).locator('[role=tab]').evaluateAll((els) => els.map((e) => `${e.innerText.trim()}${e.getAttribute('aria-selected') === 'true' ? '*' : ''}`)).catch(() => []);
                        out[`${who}-${k}-info`] = {title: d && d.name, tabs, text: flat(d && d.text, 1200)};
                        await snap(page, `galley-${who}-${k}-moreinfo`, {info: out[`${who}-${k}-info`]});
                        log(`[galley ${who} ${k} info]`, JSON.stringify(out[`${who}-${k}-info`]).slice(0, 600));
                        await topWin(page).getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                        await idle(page);
                    } else { await page.keyboard.press('Escape').catch(() => {}); }
                }
            }
            record('galley-summary', out);
            log('[galley menus]', JSON.stringify(Object.fromEntries(Object.entries(out).filter(([k2]) => /menu|rowButton/.test(k2)))));
        });

        // Phase gfile (OJS, OPS): which file each galley serves now, read through the publication's "Preview" (g1 after
        // "Change File" + header "Close" at step 1; g2 after a completed "Change File").
        if (on('gfile') && !isOMP && S.g1 && S.g1.id) await sect('gfile', async () => {
            const out = {};
            await signInAs(u.mgr);
            for (const [k, label] of [['g1', 'PDF'], ['g2', 'HTML']]) {
                await openWf(workflow(S[k].id, `publication_${S[k].publicationId}_galleys`));
                const prev = page.locator(vis).first().getByRole('button', {name: 'Preview', exact: true}).last();
                const popP = page.context().waitForEvent('page', {timeout: 15000}).catch(() => null);
                await prev.click();
                let pop = await popP;
                if (!pop) {
                    // a menu of versions or an in-page link
                    const it = page.getByRole('menuitem').first();
                    if (await it.count()) { const p2 = page.context().waitForEvent('page', {timeout: 15000}).catch(() => null); await it.click(); pop = await p2; }
                }
                if (!pop) { await page.waitForTimeout(1500); if (/\/(article|preprint)\/view\//.test(page.url())) pop = page; }
                if (!pop) {
                    await page.waitForTimeout(1000);
                    const ds = await dialogTexts(page);
                    out[k] = {noPreview: true, url: page.url().replace(/^.*\/index\.php/, ''), pages: page.context().pages().map((p) => p.url()), topDialog: ds.length ? {name: ds[ds.length - 1].name, text: flat(ds[ds.length - 1].text, 600), links: ds[ds.length - 1].links} : null, menu: await menuItems(page)};
                    await snap(page, `gfile-${k}-after-preview-click`, {out: out[k]});
                    log(`[gfile ${k}]`, JSON.stringify(out[k]).slice(0, 1200));
                    continue;
                }
                await pop.waitForLoadState('domcontentloaded').catch(() => {}); await pop.waitForTimeout(1500);
                const s = await screen(pop).catch(() => ({}));
                record(`gfile-${k}-preview`, s); await shot(pop, `gfile-${k}-preview`).catch(() => {});
                const gl = pop.locator("a.obj_galley_link, a.galley_link, .galleys_links a, a").filter({hasText: new RegExp(`^\\s*${label}\\s*$`)}).first();
                out[k] = {previewUrl: pop.url().replace(/^.*\/index\.php/, ''), galleyLink: await gl.count()};
                if (await gl.count()) {
                    const href = await gl.getAttribute('href');
                    out[k].galleyHref = (href || '').replace(/^.*\/index\.php/, '');
                    const dl1 = pop.waitForEvent('download', {timeout: 8000}).catch(() => null);
                    await gl.click().catch(() => {});
                    let d = await dl1;
                    if (!d) {
                        await pop.waitForTimeout(1500);
                        await shot(pop, `gfile-${k}-galley-view`).catch(() => {});
                        const dlink = pop.getByRole('link', {name: /Download/}).first();
                        out[k].viewUrl = pop.url().replace(/^.*\/index\.php/, '');
                        out[k].viewTitle = await pop.title().catch(() => null);
                        if (await dlink.count()) { const dl2 = pop.waitForEvent('download', {timeout: 15000}).catch(() => null); await dlink.click().catch(() => {}); d = await dl2; }
                        if (!d && label === 'HTML') out[k].htmlFrameSrc = await pop.locator('iframe').first().getAttribute('src').catch(() => null);
                    }
                    if (d) out[k].downloaded = d.suggestedFilename();
                }
                log(`[gfile ${k}]`, JSON.stringify(out[k]));
                if (pop !== page) await pop.close().catch(() => {});
            }
            record('gfile-summary', out);
        });

        // Phase formats (OMP control): the press's publication menu and its "Publication Formats" page.
        if (on('formats') && isOMP && S.pp && S.pp.id) await sect('formats', async () => {
            await signInAs(u.mgr);
            const i0 = await openWf(workflow(S.pp.id, 'workflow_5'), 'formats-mgr-production');
            const navs = i0.navAll;
            record('formats-nav', {navAll: navs, nav: i0.nav});
            log('[formats nav]', JSON.stringify(i0.nav));
            const i1 = await openWf(workflow(S.pp.id, `publication_${S.pp.publicationId}_galleys`), 'formats-mgr-galleys-key');
            log('[formats galleys key]', page.url().replace(/^.*\/index\.php/, ''), JSON.stringify(i1.headings));
            const pf = page.locator(vis).first().getByRole('link', {name: /Publication Formats/}).or(page.locator(vis).first().getByRole('button', {name: /Publication Formats/})).first();
            await loc(page, 'OMP workflow side menu "Publication Formats"', pf);
            if (await pf.count()) {
                await pf.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
                const i2 = await wfInfo(page);
                await snap(page, 'formats-mgr-page', {info: i2});
                log('[formats page]', JSON.stringify({headings: i2.headings, buttons: i2.buttons, tables: i2.tables}).slice(0, 1500));
                // add a format to see what a format row offers
                const add = page.locator(vis).first().getByRole('button', {name: /Add (publication )?format/i}).or(page.locator(vis).first().getByRole('link', {name: /Add (publication )?format/i})).first();
                await loc(page, 'Publication Formats "Add publication format"', add);
                const hasFormat = (await page.locator(vis).first().locator('tr').filter({hasText: /^\s*PDF/}).count()) > 0 || sc.formatAdded;
                if (await add.count() && !hasFormat) {
                    sc.formatAdded = true; save();
                    await add.click(); await waitWindow(); await page.waitForTimeout(800);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    await snap(page, 'formats-mgr-add-window', {d: d && {name: d.name, text: flat(d.text, 1500)}});
                    const nameBox = topWin(page).locator('input[name^="name"]').first();
                    if (await nameBox.count()) {
                        await nameBox.fill('PDF');
                        await topWin(page).getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                    } else await closeTop();
                    const i3 = await wfInfo(page);
                    await snap(page, 'formats-mgr-after-add', {info: i3});
                    log('[formats after add]', JSON.stringify({buttons: i3.buttons, tables: i3.tables}).slice(0, 1500));
                    // the format row's menu / controls
                    const row = page.locator(vis).first().locator('tbody tr, [class*="listPanel__item"], tr.gridRow').filter({hasText: 'PDF'}).first();
                    if (await row.count()) {
                        const b = row.locator('button, a.show_extras').last();
                        await b.click().catch(() => {}); await page.waitForTimeout(500);
                        const items = await menuItems(page);
                        const extras = await page.locator(vis).first().locator('tr.row_controls:visible, tr:visible').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 20)).catch(() => []);
                        await snap(page, 'formats-mgr-row-menu', {items, extras});
                        log('[formats row]', JSON.stringify({items, extras}).slice(0, 1200));
                        await page.keyboard.press('Escape').catch(() => {});
                    }
                }
            }
        });

        // Phase gclose (OJS, OPS): leaving "Change File" at step 1 with a new file chosen, by the header "Close" and by
        // "Cancel", each on a fresh galley; then which file the galley serves (the publication's Preview).
        if (on('gclose') && !isOMP) await sect('gclose', async () => {
            const out = {run: new Date().toISOString()};
            const own = isOPS ? {} : {files: [{file: 'article.pdf'}], decisions: ['skipExternalReview', 'sendToProduction']};
            const gname = isOPS ? 'preprint.pdf' : 'article.pdf';
            const serve = async (id, label) => {
                // the galley link on the publication's Preview, as the workflow's "Preview" opens it
                await page.getByRole('button', {name: 'Preview', exact: true}).last().click();
                await page.waitForURL(/\/(article|preprint)\/view\//, {timeout: 20000}).catch(() => {});
                await idle(page);
                const gl = page.locator('a').filter({hasText: /^\s*PDF\s*$/}).first();
                await gl.click(); await page.waitForTimeout(1500);
                const dl = page.waitForEvent('download', {timeout: 15000}).catch(() => null);
                await page.getByRole('link', {name: /Download/}).first().click().catch(() => {});
                const d = await dl;
                await shot(page, `gclose-${label}-served`).catch(() => {});
                return d ? d.suggestedFilename() : null;
            };
            for (const how of ['close', 'cancel']) {
                const r = await app.api.createSubmission({tag: tag('u36k5g'), context: sc.T, submitter: u.au, title: `K5 G ${how} ${out.run}`, participants: [{username: u.se, role: 'sectionEditor'}], galleys: [{label: 'PDF', file: gname}], ...own});
                await signInAs(u.mgr);
                await openWf(workflow(r.submissionId, `publication_${r.publicationId}_galleys`));
                await page.locator(vis).first().locator('tbody tr').filter({hasText: 'PDF'}).first().locator('button').last().click();
                const t0 = Date.now();
                const resp = [];
                const onR = async (x) => { if (/upload|cancel|file/i.test(x.url()) && x.request().method() === 'POST') resp.push({status: x.status(), url: x.url().replace(/^.*\/index\.php/, '').slice(0, 160), body: flat(await x.text().catch(() => ''), 200)}); };
                page.on('response', onR);
                await page.getByRole('menuitem', {name: 'Change File'}).first().click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                await attach(REPL);
                const nDialogs = jsDialogs.length;
                if (how === 'close') await wiz().getByRole('button', {name: 'Close', exact: true}).first().click();
                else await wiz().getByRole('link', {name: 'Cancel', exact: true}).first().click();
                await page.waitForTimeout(2000); await idle(page);
                page.off('response', onR);
                const o = {submissionId: r.submissionId, jsDialogs: jsDialogs.slice(nDialogs), notices: await noticesSince(t0), stillOpen: await wiz().isVisible().catch(() => false), posts: resp};
                if (o.stillOpen) { await wiz().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await page.waitForTimeout(1000); }
                await openWf(workflow(r.submissionId, `publication_${r.publicationId}_galleys`), `gclose-${how}-page-after`);
                o.served = await serve(r.submissionId, how);
                out[how] = o;
                log(`[gclose ${how}]`, JSON.stringify(o).slice(0, 1200));
            }
            record(`gclose-summary-${Date.now()}`, out);
        });

        // Phase fmtfile2 (OMP): a publication format's "Change File" completed, then opened again: replace or add?
        if (on('fmtfile2') && isOMP && S.pp && S.pp.id) await sect('fmtfile2', async () => {
            const out = {};
            await signInAs(u.mgr);
            const goFormats = async (label) => {
                await openWf(workflow(S.pp.id, 'workflow_5'));
                await page.locator(vis).first().getByRole('link', {name: /^Publication Formats$/}).first().click();
                await idle(page); await page.waitForTimeout(1200); await idle(page);
                // expand the format's row (its files sit in the category's rows)
                const tog = page.locator(vis).first().locator('a.show_extras, button[aria-expanded="false"], .pkp_linkaction_toggle').first();
                const text = await page.locator(vis).first().locator('table').first().innerText().catch(() => '');
                if (label) await snap(page, label, {tableText: flat(text, 1500)});
                return flat(text, 1500);
            };
            out.before = await goFormats('fmtfile2-before');
            for (const [i, file] of [[1, PDF], [2, REPL]]) {
                await page.locator(vis).first().getByRole('link', {name: 'Change File', exact: true}).first().click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                out[`wiz${i}`] = await wizSnap(`fmtfile2-change-${i}-step1`);
                await pickGenre('Book Manuscript'); await attach(file); await toStep(2); await toStep(3); await complete();
                out[`after${i}`] = await goFormats(`fmtfile2-after-${i}`);
                log(`[fmtfile2 after ${i}]`, out[`after${i}`]);
            }
            // the Production Ready Files list afterwards
            const i5 = await openWf(workflow(S.pp.id, 'workflow_5'), 'fmtfile2-production-after');
            out.production = i5.tables;
            record('fmtfile2-summary', out);
            log('[fmtfile2]', JSON.stringify(out.production));
        });

        // Phase wizard: the submission wizard's "Upload Files" step (the "Files" panel; OPS its galley table) and the
        // "Review" step's word on a missing required component, as the author of a fresh draft with no file.
        if (on('wizard')) await sect('wizard', async () => {
            const out = {};
            if (!sc.draft) {
                const r = await app.api.createSubmission({tag: tag('u36k5d'), context: sc.T, submitter: u.au, title: `K5 DR draft`, submitted: false});
                sc.draft = {id: r.submissionId}; save();
            }
            await signInAs(u.au);
            await page.goto(ctxUrl(`/submission?id=${sc.draft.id}`)); await idle(page);
            await page.locator('main h1, main h2').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForTimeout(1200); await idle(page);
            const read = async (label) => {
                const s = await snap(page, label);
                const h = await page.evaluate(() => [...document.querySelectorAll('main h1, main h2, main h3')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).slice(0, 20));
                const panel = await page.locator('main .submissionFilesListPanel, main .listPanel').first().innerText().catch(() => null);
                const btns = await page.locator('main button:visible').evaluateAll((els) => els.map((b) => `${b.innerText.trim().replace(/\s+/g, ' ')}${b.disabled ? '(dis)' : ''}`).filter(Boolean).slice(0, 40));
                return {h, panel: flat(panel, 800), buttons: btns, text: flat(s.text && s.text.main, 2000)};
            };
            out.upload = await read('wizard-au-upload-files');
            log('[wizard upload]', JSON.stringify({h: out.upload.h, panel: out.upload.panel}).slice(0, 900));
            for (let i = 0; i < 6; i++) {
                const h = [await page.locator('main h1').first().innerText().catch(() => '')];
                if (/Make a Submission: Review/.test(h[0])) break;
                const c = page.locator('button:visible').filter({hasText: /^\s*Continue\s*$/}).last();
                const nC = await c.count();
                log('[wizard step]', i, JSON.stringify(h), 'continue buttons:', nC);
                if (!nC) break;
                await c.click(); await idle(page); await page.waitForTimeout(900);
            }
            out.review = await read('wizard-au-review');
            log('[wizard review]', JSON.stringify({h: out.review.h, buttons: out.review.buttons.filter((b) => /Submit|Upload|Files/.test(b)), text: flat(out.review.text, 900)}).slice(0, 1500));
            record('wizard-summary', out);
        });

        // Phase notice (OJS, OMP): the notice a stage shows when its "Upload/Select Files" window is saved with "OK".
        if (on('notice') && !isOPS) await sect('notice', async () => {
            const out = {};
            await signInAs(u.mgr);
            for (const [key, name] of [[roundKey(S.st), 'review'], ['workflow_4', 'copyediting']]) {
                const n = name === 'review' ? 1 : 2;
                for (let j = 0; j < n; j++) {
                    await openWf(workflow(S.st.id, key));
                    await page.locator(vis).first().getByRole('button', {name: 'Upload/Select Files', exact: true}).nth(j).click();
                    await waitWindow();
                    await topWin(page).locator('table tr').nth(1).waitFor({timeout: 20000}).catch(() => {});
                    await idle(page); await page.waitForTimeout(500);
                    // show every stage's files and tick the first unticked one
                    const all = topWin(page).locator('input[type=checkbox]').filter({hasNot: page.locator('xpath=ancestor::table')}).first();
                    if (await all.count()) { await all.click().catch(() => {}); await idle(page); await page.waitForTimeout(1000); }
                    const box = topWin(page).locator('table input[type=checkbox]:not(:checked)').first();
                    if (await box.count()) await box.check({force: true}).catch(() => {});
                    const t0 = Date.now();
                    await topWin(page).getByRole('button', {name: 'OK', exact: true}).last().click();
                    await page.waitForTimeout(1500); await idle(page);
                    const i = await wfInfo(page);
                    out[`${name}-${j}`] = {notices: await noticesSince(t0), lists: i.tables.map((x) => `${x.name}: ${x.rows.join(' | ')}`)};
                    await snap(page, `notice-${name}-${j}-after-ok`, {out: out[`${name}-${j}`]});
                    log(`[notice ${name} ${j}]`, JSON.stringify(out[`${name}-${j}`]).slice(0, 700));
                }
            }
            record('notice-summary', out);
        });

        // Phase readmgr (OJS, OMP): the same "Read Review" window as the manager level (after phase review).
        if (on('readmgr') && !isOPS) await sect('readmgr', async () => {
            const s = S.rv1;
            await signInAs(u.mgr);
            await openWf(workflow(s.id, roundKey(s)), 'readmgr-round');
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: sc.names.rv}).first();
            await row.waitFor({timeout: 30000}).catch(() => {});
            const rr = row.getByRole('button', {name: /Read Review/}).first();
            if (!(await rr.count())) { record('readmgr-none', {row: flat(await row.innerText().catch(() => null), 300)}); return; }
            await rr.click();
            await page.getByRole('dialog').last().waitFor({timeout: 20000});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /\.pdf/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const d = (await dialogTexts(page)).slice(-1)[0];
            const t = flat(d && d.text, 2500);
            await snap(page, 'readmgr-read-review', {d: {name: d && d.name, text: t}});
            log('[readmgr]', (t || '').replace(/^.*?(Reviewer Files.*?)Reviewer (Recommendation|rating).*$/, '$1'));
            await closeTop();
        });

        // Phase fmtfile (OMP): a publication format's "Change File" and "Select Files" links (the press's analogue of a galley's file).
        if (on('fmtfile') && isOMP && S.pp && S.pp.id) await sect('fmtfile', async () => {
            const out = {};
            await signInAs(u.mgr);
            const goFormats = async () => {
                await openWf(workflow(S.pp.id, 'workflow_5'));
                await page.locator(vis).first().getByRole('link', {name: /^Publication Formats$/}).first().click();
                await idle(page); await page.waitForTimeout(1200); await idle(page);
            };
            for (const linkName of ['Change File', 'Select Files']) {
                await goFormats();
                const l = page.locator(vis).first().getByRole('link', {name: linkName, exact: true}).first();
                await loc(page, `Publication Formats row "${linkName}"`, l);
                if (!(await l.count())) { out[linkName] = {absent: true}; continue; }
                await l.click(); await waitWindow(); await page.waitForTimeout(1200); await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                const isWiz = await wiz().count();
                out[linkName] = {name: d && d.name, text: flat(d && d.text, 1500), buttons: d && d.buttons, links: d && d.links, uploadWizard: isWiz};
                if (isWiz) out[linkName].wizard = await wizSnap(`fmtfile-${linkName.replace(/\s+/g, '-').toLowerCase()}`);
                else {
                    await topWin(page).locator('table tr').nth(1).waitFor({timeout: 15000}).catch(() => {});
                    const g = await topWin(page).evaluate((dd) => ({title: dd.getAttribute('aria-label'), rows: [...dd.querySelectorAll('table tr')].filter((e) => e.offsetParent !== null).map((tr) => { const cb = tr.querySelector('input[type=checkbox]'); return tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) + (cb ? (cb.checked ? ' [x]' : ' [ ]') : ''); })})).catch(() => null);
                    out[linkName].grid = g;
                    await snap(page, `fmtfile-${linkName.replace(/\s+/g, '-').toLowerCase()}`, {d: out[linkName]});
                }
                log(`[fmtfile ${linkName}]`, JSON.stringify(out[linkName]).slice(0, 1200));
                if (isWiz) await wizCancel(); else await closeTop();
            }
            record('fmtfile-summary', out);
        });

        // =========================================================================================
        // Phase settings: Components tab, "Upload Files" guidance box, the anonymizing box; leave a tab unsaved.
        if (on('settings')) await sect('settings', async () => {
            await signInAs(u.mgr);
            await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
            const topTabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
            await snap(page, 'settings-workflow-landing', {topTabs});
            log('[settings tabs]', JSON.stringify(topTabs));
            const sub = page.getByRole('tab', {name: 'Submission', exact: true}).first();
            if (await sub.count()) { await sub.click(); await idle(page); }
            const subTabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
            const comp = page.getByRole('tab', {name: 'Components', exact: true}).first();
            await loc(page, 'Settings › Workflow › Submission › "Components"', comp);
            if (await comp.count()) {
                await comp.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                const grid = await page.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({caption: (t.closest('.pkp_controllers_grid') || t).querySelector('h3, h4, .header span, caption')?.innerText.trim() || null, rows: [...t.querySelectorAll('tbody tr.gridRow')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ')).slice(0, 30)})));
                await snap(page, 'settings-components', {subTabs, grid});
                log('[components]', JSON.stringify(grid).slice(0, 1200));
            }
            // "Author Guidance" › the "Upload Files" box
            const ag = page.getByRole('tab', {name: /Author Guidance|Instructions/}).first();
            await loc(page, 'Settings › Workflow › Submission › "Author Guidance"', ag);
            if (await ag.count()) {
                await ag.click(); await idle(page); await page.waitForTimeout(800); await idle(page);
                const labels = await page.evaluate(() => [...document.querySelectorAll('[role=tabpanel]')].filter((p) => p.getClientRects().length).flatMap((p) => [...p.querySelectorAll('label, legend, .pkpFormFieldLabel')].map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).slice(0, 40));
                const upEd = await page.evaluate(() => { const eds = window.tinymce ? (window.tinymce.get() || []) : []; return eds.map((e) => ({id: e.id, text: e.getContent({format: 'text'}).slice(0, 400)})); });
                await snap(page, 'settings-author-guidance', {labels, editors: upEd});
                log('[author guidance]', JSON.stringify(labels), JSON.stringify(upEd.filter((e) => /upload|Upload|files/i.test(e.id + e.text))).slice(0, 800));
                // type into the Upload Files box, leave unsaved to another tab
                const box = upEd.find((e) => /uploadFilesHelp/i.test(e.id)) || null;
                if (box) {
                    await page.evaluate((i) => { const e = window.tinymce.get(i); e.focus(); e.selection.select(e.getBody(), true); e.selection.collapse(false); }, box.id);
                    await page.keyboard.type(' K5 unsaved text.');
                    const before = jsDialogs.length;
                    const t0 = Date.now();
                    const other = page.getByRole('tab', {name: 'Components', exact: true}).first();
                    await other.click().catch(() => {}); await idle(page); await page.waitForTimeout(600);
                    const back = page.getByRole('tab', {name: /Author Guidance|Instructions/}).first();
                    await back.click().catch(() => {}); await idle(page); await page.waitForTimeout(600);
                    const now = await page.evaluate((i) => window.tinymce.get(i)?.getContent({format: 'text'}).slice(-60), box.id).catch(() => null);
                    const out = {jsDialogs: jsDialogs.slice(before), notices: await noticesSince(t0), boxEndAfterTabHop: now};
                    // leave the page altogether
                    await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
                    out.jsDialogsAfterLeave = jsDialogs.slice(before);
                    const sub2 = page.getByRole('tab', {name: 'Submission', exact: true}).first(); if (await sub2.count()) { await sub2.click(); await idle(page); }
                    const ag2 = page.getByRole('tab', {name: /Author Guidance|Instructions/}).first(); if (await ag2.count()) { await ag2.click(); await idle(page); await page.waitForTimeout(800); }
                    out.afterReload = await page.evaluate((i) => window.tinymce.get(i)?.getContent({format: 'text'}).slice(-60), box.id).catch(() => null);
                    record('settings-leave-unsaved', out);
                    log('[settings leave unsaved]', JSON.stringify(out));
                }
            }
            // Review › the anonymizing box (OJS, OMP); OPS: no Review tab
            await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
            const rev = page.getByRole('tab', {name: 'Review', exact: true}).first();
            await loc(page, 'Settings › Workflow › "Review"', rev);
            if (await rev.count()) {
                await rev.click(); await idle(page);
                const revTabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
                const found = {};
                for (const name of ['Setup', 'Reviewer Guidance']) {
                    const t = page.getByRole('tab', {name, exact: true}).last();
                    if (!(await t.count())) continue;
                    await t.click(); await idle(page); await page.waitForTimeout(800);
                    found[name] = await page.evaluate(() => [...document.querySelectorAll('[role=tabpanel]')].filter((p) => p.getClientRects().length).some((p) => /how to ensure all files are anonymized/i.test(p.innerText)));
                    await snap(page, `settings-review-${name.replace(/\s+/g, '-').toLowerCase()}`, {revTabs, anonymizingHere: found[name]});
                }
                log('[review settings]', JSON.stringify(revTabs), JSON.stringify(found));
            } else {
                await snap(page, 'settings-no-review-tab', {topTabs});
            }
        });

        // =========================================================================================
        // Phase stages (OJS, OMP): which lists each stage shows, per role; OPS: the Production view.
        if (on('stages')) await sect('stages', async () => {
            if (isOPS) {
                await signInAs(u.mgr);
                const i = await openWf(workflow(S.g1.id), 'stages-ops-mgr-production');
                record('stages-ops-summary', {headings: i.headings, tables: i.tables.map((x) => x.name), nav: i.nav});
                return;
            }
            const st = S.st;
            const keys = [['workflow_1', 'submission']];
            for (const r of st.rounds || []) keys.push([`workflow_${r.stageId}_${r.id}`, `review-${r.stageId}`]);
            keys.push(['workflow_4', 'copyediting'], ['workflow_5', 'production']);
            const out = {};
            for (const who of ['mgr', 'se', 'ce', 'le']) {
                await signInAs(u[who]);
                for (const [key, name] of keys) {
                    const i = await openWf(workflow(st.id, key), `stages-${who}-${name}`);
                    out[`${who}-${name}`] = {url: i.url.replace(/^.*\/index\.php/, ''), lists: i.tables.map((x) => x.name), descriptions: i.descriptions.filter((d) => /Files|Uploaded/.test(d.h)), fileButtons: i.buttons.filter((b) => /Upload|Select Files|Download All/.test(b)), nav: i.nav.slice(0, 20)};
                }
            }
            // the author view of every stage
            await signInAs(u.au);
            for (const [key, name] of keys) {
                const i = await openWf(authorWorkflow(st.id, key), `stages-au-${name}`);
                out[`au-${name}`] = {url: i.url.replace(/^.*\/index\.php/, ''), lists: i.tables.map((x) => x.name), fileButtons: i.buttons.filter((b) => /Upload|Select Files|Download All/.test(b)), nav: i.nav.slice(0, 20)};
            }
            // the author's revision gate: rr (revisions requested) against rv1 (none requested)
            for (const k of ['rr', 'rv1']) {
                const i = await openWf(authorWorkflow(S[k].id, roundKey(S[k])), `stages-au-${k}-round`);
                out[`au-${k}-round`] = {lists: i.tables.map((x) => `${x.name}: ${x.rows.join(' | ')}`), fileButtons: i.buttons.filter((b) => /Upload|revision/i.test(b)), headings: i.headings.slice(0, 20)};
            }
            // the review round's file selection and the Copyediting window's tick boxes, as mgr (read, then Cancel)
            await signInAs(u.mgr);
            for (const [key, name] of [[roundKey(st), 'review'], ['workflow_4', 'copyediting']]) {
                await openWf(workflow(st.id, key));
                const btns = page.locator(vis).first().getByRole('button', {name: 'Upload/Select Files', exact: true});
                const n = await btns.count();
                out[`mgr-${name}-selectButtons`] = n;
                for (let j = 0; j < n; j++) {
                    await openWf(workflow(st.id, key));
                    await page.locator(vis).first().getByRole('button', {name: 'Upload/Select Files', exact: true}).nth(j).click();
                    await waitWindow();
                    await topWin(page).locator('table tr').nth(1).waitFor({timeout: 20000}).catch(() => {});
                    await idle(page); await page.waitForTimeout(500);
                    const g = await topWin(page).evaluate((d) => ({title: d.getAttribute('aria-label'), rows: [...d.querySelectorAll('table tr')].filter((e) => e.offsetParent !== null).map((tr) => { const cb = tr.querySelector('input[type=checkbox]'); return tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 140) + (cb ? (cb.checked ? ' [x]' : ' [ ]') : ''); }), boxes: [...d.querySelectorAll('input[type=checkbox]')].filter((e) => e.offsetParent !== null).length})).catch(() => null);
                    out[`mgr-${name}-select-${j}`] = g;
                    await snap(page, `stages-mgr-${name}-select-${j}`, {grid: g});
                    log(`[select ${name} ${j}]`, JSON.stringify(g).slice(0, 600));
                    await closeTop();
                }
            }
            // the Add Reviewer window's file list (the files a reviewer is given), read and cancelled
            await openWf(workflow(S.rv1.id, roundKey(S.rv1)));
            const addRv = page.locator(vis).first().getByRole('button', {name: /^Add Reviewer$/}).first();
            await loc(page, 'Review round "Add Reviewer"', addRv);
            if (await addRv.count()) {
                await addRv.click(); await waitWindow(); await page.waitForTimeout(1200); await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.addReviewer = {name: d && d.name, text: flat(d && d.text, 1500)};
                await snap(page, 'stages-mgr-add-reviewer', {d: out.addReviewer});
                log('[add reviewer]', flat(d && d.text, 500));
                await closeTop();
            }
            record('stages-summary', out);
            log('[stages]', JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v && (v.lists || v)]))).slice(0, 4000));
        });

        // =========================================================================================
        // Phase decision: "Send for Review" (OMP "Send to External Review"?): "Attach Files" › submission files; "Select Files";
        // record; the copy on the round's "Files for Review". OPS: "Decline" email's "Attach Files" (control), cancelled.
        if (on('decision')) await sect('decision', async () => {
            // K5_NEWDC=1: a fresh Submission-stage submission for a repeat of the drive
            if (process.env.K5_NEWDC && !isOPS) {
                const r = await app.api.createSubmission({tag: tag('u36k5dc'), context: sc.T, submitter: u.au, title: 'K5 DC repeat', files: [{file: 'article.pdf'}], participants: [{username: u.se, role: 'sectionEditor'}]});
                S.dc = {id: r.submissionId, publicationId: r.publicationId};
            }
            await signInAs(u.mgr);
            const k = isOPS ? 'dd' : 'dc';
            const i0 = await openWf(workflow(S[k].id, isOPS ? undefined : 'workflow_1'), `decision-${k}-before`);
            const decisionBtns = i0.buttons.filter((b) => /Review|Accept|Decline|Revision|Post|Production|Copyedit/.test(b));
            log('[decision buttons]', JSON.stringify(decisionBtns));
            const want = isOPS ? 'Decline' : (isOMP ? /^(Send to External Review|Send to Internal Review)$/ : /^Send for Review$/);
            const btn = page.locator(vis).first().getByRole('button', {name: want}).first();
            await loc(page, `decision button ${want}`, btn);
            if (!(await btn.count())) { record('decision-no-button', {decisionBtns}); return; }
            await btn.click(); await idle(page);
            for (let i = 0; i < 3 && !/decision\/record/.test(page.url()); i++) {
                await page.waitForTimeout(1500);
                const next = topWin(page).getByRole('button', {name: /^(Next|Yes, Continue|Continue|OK)$/}).first();
                if (await next.count()) { await next.click(); await idle(page); }
            }
            await page.waitForURL(/decision\/record/, {timeout: 20000}).catch(() => {});
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await idle(page); await page.waitForTimeout(800);
            const out = {pressed: String(want), url: page.url().replace(/^.*\/index\.php/, '')};
            const pageRead = async (label) => {
                const s = await snap(page, label);
                const t = s.text && s.text.main;
                const h1 = await page.locator('main h1').first().innerText().catch(() => null);
                return {h1, text: flat(t, 1500)};
            };
            out.p1 = await pageRead('decision-p1');
            log('[decision p1]', JSON.stringify(out.p1).slice(0, 700));
            // "Attach Files" on the email page
            const att = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
            await loc(page, 'decision email "Attach Files"', att);
            if (await att.count()) {
                await att.click(); await waitWindow(); await page.waitForTimeout(600); await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.attachWindow = {name: d && d.name, text: flat(d && d.text, 1500), buttons: d && d.buttons};
                await snap(page, 'decision-attach-window', {d: out.attachWindow});
                log('[attach window]', JSON.stringify(out.attachWindow).slice(0, 900));
                const sfb = topWin(page).getByRole('button', {name: /Attach Submission Files|Submission Files/}).first();
                await loc(page, 'Attach Files › "Attach Submission Files"', sfb);
                if (await sfb.count()) {
                    await sfb.click(); await idle(page); await page.waitForTimeout(1200); await idle(page);
                    const d2 = (await dialogTexts(page)).slice(-1)[0];
                    out.attachSubmissionFiles = {name: d2 && d2.name, text: flat(d2 && d2.text, 1500), buttons: d2 && d2.buttons};
                    await snap(page, 'decision-attach-submission-files', {d: out.attachSubmissionFiles});
                    log('[attach submission files]', JSON.stringify(out.attachSubmissionFiles).slice(0, 900));
                }
                // close every window without attaching
                for (let i = 0; i < 3 && (await page.locator(vis).count()); i++) {
                    const c = topWin(page).getByRole('button', {name: /^(Close|Back|Cancel)$/}).last();
                    if (await c.count()) await c.click().catch(() => {}); else await page.keyboard.press('Escape');
                    await page.waitForTimeout(500);
                }
            }
            if (isOPS) {
                // cancel the decision: nothing recorded
                const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
                if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(500); const cd = topWin(page).getByRole('button', {name: /Cancel Decision/}).first(); if (await cd.count()) { await cd.click(); await idle(page); } }
                out.cancelledTo = page.url().replace(/^.*\/index\.php/, '');
                record('decision-summary', out);
                return;
            }
            // Continue to "Select Files"
            for (let i = 0; i < 5; i++) {
                const h = await page.locator('main h1').first().innerText().catch(() => '');
                if (/Select Files/.test(h) || await page.getByRole('button', {name: 'Record Decision', exact: true}).isVisible().catch(() => false)) break;
                await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); await page.waitForTimeout(600);
            }
            out.select = await pageRead('decision-select-files');
            const panels = await page.evaluate(() => [...document.querySelectorAll('main .listPanel')].map((p) => ({title: (p.querySelector('.listPanel__title, h2, h3') || {}).innerText, items: [...p.querySelectorAll('.listPanel__item')].map((it) => ({text: it.innerText.replace(/\s+/g, ' ').trim().slice(0, 200), checked: it.querySelector('input[type=checkbox]')?.checked ?? null}))})));
            out.selectPanels = panels;
            log('[select files]', JSON.stringify(out.select.h1), JSON.stringify(panels).slice(0, 800));
            // tick the file if unticked, then record
            const cb = page.locator('main .listPanel__item input[type=checkbox]').first();
            if (await cb.count() && !(await cb.isChecked())) await cb.check();
            for (let i = 0; i < 4 && !(await page.getByRole('button', {name: 'Record Decision', exact: true}).isVisible().catch(() => false)); i++) { await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); }
            await page.getByRole('button', {name: 'Record Decision', exact: true}).first().click(); await idle(page);
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length), null, {timeout: 30000}).catch(() => {});
            await page.waitForTimeout(800);
            const done = (await dialogTexts(page)).slice(-1)[0];
            out.recorded = {name: done && done.name, text: flat(done && done.text, 500)};
            await snap(page, 'decision-recorded', {d: out.recorded});
            // the round's lists afterwards
            const after = await openWf(workflow(S.dc.id), 'decision-after-landing');
            // walk to the review stage via its nav entry
            const navRev = page.locator(vis).first().getByRole('link', {name: /Round 1|Review/}).first();
            if (await navRev.count()) { await navRev.click().catch(() => {}); await idle(page); await page.waitForTimeout(800); }
            const i2 = await wfInfo(page);
            await snap(page, 'decision-after-review-round', {info: i2});
            out.after = {landing: after.tables, review: i2.tables, url: i2.url.replace(/^.*\/index\.php/, '')};
            log('[decision after]', JSON.stringify(out.after).slice(0, 900));
            record('decision-summary', out);
        });

        // =========================================================================================
        // Phase review (OJS, OMP): reviewer's step 1 files, step 3 upload through the wizard, submit; editor's "Read Review".
        if (on('review') && !isOPS) await sect('review', async () => {
            const out = {};
            const s = S.rv1;
            const wurl = ctxUrl(`/reviewer/submission/${s.id}`);
            await signInAs(u.rv);
            await page.goto(wurl); await idle(page);
            await page.waitForTimeout(800);
            out.step1 = await snap(page, 'review-rv-step1').then((x) => flat(x.text && x.text.main, 1500));
            log('[rv step1]', flat(out.step1, 600));
            const sc1 = page.getByRole('button', {name: 'Save and continue'});
            if (await sc1.count()) { await sc1.click(); await idle(page); await page.waitForTimeout(800); }
            const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
            if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await idle(page); }
            await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            const s3 = await snap(page, 'review-rv-step3');
            out.step3 = flat(s3.text && s3.text.main, 1800);
            const up = page.getByRole('link', {name: 'Upload File'}).first();
            await loc(page, 'reviewer step 3 "Upload File"', up);
            if (await up.count()) {
                await up.click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}).catch(() => {});
                await idle(page); await page.waitForTimeout(400);
                out.wizStep1 = await wizSnap('review-rv-upload-step1');
                await attach(PDF); await toStep(2);
                out.wizStep2 = await wizSnap('review-rv-upload-step2');
                await toStep(3);
                out.wizStep3 = await wizSnap('review-rv-upload-step3');
                await complete();
                await page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"] tbody tr').first().waitFor({timeout: 20000}).catch(() => {});
                const g = await page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]').first().innerText().catch(() => null);
                out.gridAfter = flat(g, 400);
                await snap(page, 'review-rv-step3-after-upload', {grid: out.gridAfter});
                log('[rv grid after]', out.gridAfter);
            }
            // fill and submit
            await page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body').click().catch(() => {});
            await page.keyboard.type('K5 review comments.');
            const rec = page.locator('select[name="reviewerRecommendationId"], select#reviewerRecommendationId').first();
            if (await rec.count()) { const opts = await rec.locator('option').evaluateAll((els) => els.map((o) => o.value).filter(Boolean)); if (opts.length) await rec.selectOption(opts[0]); }
            await page.getByRole('button', {name: 'Submit Review'}).click().catch(() => {});
            const confirm = page.getByRole('dialog', {name: 'Confirm'});
            if (await confirm.waitFor({timeout: 10000}).then(() => true).catch(() => false)) {
                await confirm.getByRole('button', {name: 'OK', exact: true}).click();
                await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('4.'), null, {timeout: 30000}).catch(() => {});
                await idle(page);
            }
            await snap(page, 'review-rv-submitted');
            // the editor's review window
            await signInAs(u.se);
            await openWf(workflow(s.id, roundKey(s)), 'review-se-round');
            const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: sc.names.rv}).first();
            await row.waitFor({timeout: 30000}).catch(() => {});
            out.editorRow = flat(await row.innerText().catch(() => null), 300);
            const rr = row.getByRole('button', {name: /Read Review/}).first();
            await loc(page, 'Reviewers row "Read Review"', rr);
            if (await rr.count()) {
                await rr.click();
                const dlg = page.getByRole('dialog').last();
                await dlg.waitFor({timeout: 20000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /\.pdf/.test(d.innerText); }, null, {timeout: 20000}).catch(() => {});
                await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.readReview = {name: d && d.name, text: flat(d && d.text, 2500), links: d && d.links};
                await snap(page, 'review-se-read-review', {d: out.readReview});
                log('[read review]', JSON.stringify(out.readReview).slice(0, 1200));
                await closeTop();
            }
            // the round's lists for the editor after the reviewer's upload
            const i3 = await openWf(workflow(s.id, roundKey(s)), 'review-se-round-after');
            out.roundLists = i3.tables;
            record('review-summary', out);
        });

        // =========================================================================================
        // Phase insert: a revision with a Summary of Changes on "Revisions Uploaded"; then "Insert Content" on the
        // publication's entry page (OJS Publication Settings / OMP Catalog Entry?); OPS: the entry page's box (control).
        if (on('insert')) await sect('insert', async () => {
            const out = {};
            await signInAs(u.mgr);
            const k = isOPS ? 'g1' : 'rr';
            if (!isOPS && !sc.revUploaded) {
                await openWf(workflow(S.rr.id, roundKey(S.rr)), 'insert-rr-round-before');
                const dlg = page.locator(vis).first();
                const sec = dlg.locator('div, section').filter({has: page.getByRole('table', {name: 'Revisions Uploaded', exact: true})}).filter({has: page.getByRole('button', {name: 'Upload', exact: true})}).last();
                let upb = sec.getByRole('button', {name: 'Upload', exact: true}).first();
                if (!(await upb.count())) upb = dlg.getByRole('button', {name: 'Upload', exact: true}).last();
                await upb.click(); await idle(page);
                await wizUpload({genre: MAIN, file: PDF, summary: 'K5 corrected figure two.'});
                const i1 = await openWf(workflow(S.rr.id, roundKey(S.rr)), 'insert-rr-round-after');
                out.revisions = i1.tables;
                sc.revUploaded = true; save();
            }
            // the publication menu entries
            const i0 = await openWf(workflow(S[k].id, `publication_${S[k].publicationId}_titleAbstract`), 'insert-publication-menu');
            out.nav = i0.nav;
            log('[insert nav]', JSON.stringify(i0.nav));
            const entry = page.locator(vis).first().getByRole('link', {name: /^(Publication Settings|Catalog Entry|Preprint Entry|Issue)$/i}).or(page.locator(vis).first().getByRole('button', {name: /^(Publication Settings|Catalog Entry|Preprint Entry|Issue)$/i})).first();
            await loc(page, 'publication menu entry page', entry);
            if (await entry.count()) {
                out.entryName = flat(await entry.innerText(), 60);
                await entry.click(); await idle(page); await page.waitForTimeout(1500); await idle(page);
                await page.locator(`${vis} .tox-tinymce, ${vis} iframe`).first().waitFor({timeout: 20000}).catch(() => {});
                const s1 = await snap(page, 'insert-entry-page');
                out.entryText = flat(s1.text && s1.text.dialog, 1800);
                const ic = page.locator(`${vis} .tox-tbtn:visible, ${vis} button:visible`).filter({hasText: /^Insert Content$/});
                out.insertButtons = await ic.count();
                await loc(page, 'entry page "Insert Content"', ic.first());
                log('[insert entry]', out.entryName, 'Insert Content buttons:', out.insertButtons, flat(out.entryText, 400));
                if (out.insertButtons) {
                    await ic.first().click(); await waitWindow(); await page.waitForTimeout(1000); await idle(page);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    out.insertWindow = {name: d && d.name, text: flat(d && d.text, 1500), buttons: d && d.buttons};
                    await snap(page, 'insert-content-window', {d: out.insertWindow});
                    log('[insert window]', JSON.stringify(out.insertWindow).slice(0, 900));
                    await closeTop();
                }
            }
            record('insert-summary', out);
        });

        // =========================================================================================
        // Phase text (OJS, OMP): notes.md onto "Production Ready Files", its menu per role, "Send to Text Editor" window.
        if (on('text') && !isOPS) await sect('text', async () => {
            const out = {};
            await signInAs(u.mgr);
            if (!sc.mdUploaded) {
                await openWf(workflow(S.pp.id, 'workflow_5'), 'text-pp-before');
                const dlg = page.locator(vis).first();
                const upb = dlg.getByRole('button', {name: 'Upload', exact: true}).first();
                await upb.click(); await idle(page);
                await wizUpload({genre: MAIN, file: MD});
                sc.mdUploaded = true; save();
            }
            for (const who of ['mgr', 'se', 'le']) {
                await signInAs(u[who]);
                const i = await openWf(workflow(S.pp.id, 'workflow_5'), `text-${who}-production`);
                out[`${who}-lists`] = i.tables;
                const r = await rowMenu('Production Ready Files', 'notes.md').catch((e) => ({error: String(e.message).slice(0, 200)}));
                out[`${who}-mdMenu`] = r.items || r;
                const r2 = await rowMenu('Production Ready Files', 'article.pdf').catch((e) => ({error: String(e.message).slice(0, 200)}));
                out[`${who}-pdfMenu`] = r2.items || r2;
                log(`[text ${who}]`, JSON.stringify({md: out[`${who}-mdMenu`], pdf: out[`${who}-pdfMenu`]}));
            }
            await signInAs(u.mgr);
            await openWf(workflow(S.pp.id, 'workflow_5'));
            const r = await rowMenu('Production Ready Files', 'notes.md', 'Send to Text Editor');
            if (!r.noItem) {
                await waitWindow(); await page.waitForTimeout(600);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.sendWindow = {name: d && d.name, text: flat(d && d.text, 1200), buttons: d && d.buttons};
                await snap(page, 'text-send-window', {d: out.sendWindow});
                log('[send window]', JSON.stringify(out.sendWindow).slice(0, 700));
                await closeTop();
            }
            record('text-summary', out);
        });

        // =========================================================================================
        // Phase log: Activity Log lines after the upload; a discussion's file; the Submission Library; Publisher Library.
        if (on('log')) await sect('log', async () => {
            const out = {};
            const k = isOPS ? 'g1' : 'pp';
            await signInAs(u.mgr);
            const i0 = await openWf(workflow(S[k].id, isOPS ? undefined : 'workflow_5'), 'log-before');
            out.buttons = i0.buttons;
            // Activity Log
            const al = page.locator(vis).first().getByRole('button', {name: /Activity Log/}).first();
            await loc(page, 'workflow "Activity Log"', al);
            if (await al.count()) {
                await al.click(); await waitWindow();
                await topWin(page).locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                const rows = await topWin(page).locator('table tbody tr').evaluateAll((els) => els.map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 250))).catch(() => []);
                out.activityLog = rows.slice(0, 25);
                await snap(page, 'log-activity', {rows});
                log('[activity log]', JSON.stringify(rows.slice(0, 12)).slice(0, 1500));
                await closeTop();
            }
            // Submission Library
            const lib = page.locator(vis).first().getByRole('button', {name: /Library/}).first();
            await loc(page, 'workflow "Submission Library"', lib);
            if (await lib.count()) {
                out.libraryButton = flat(await lib.innerText(), 60);
                await lib.click(); await waitWindow(); await page.waitForTimeout(800); await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.library = {name: d && d.name, text: flat(d && d.text, 1500), links: d && d.links, buttons: d && d.buttons};
                await snap(page, 'log-submission-library', {d: out.library});
                log('[submission library]', JSON.stringify(out.library).slice(0, 900));
                // upload a library file through its own control, then see whether a workflow list shows it
                const add = topWin(page).getByRole('link', {name: /Upload|Add/}).or(topWin(page).getByRole('button', {name: /Upload|Add/})).first();
                if (await add.count() && !sc.libUploaded) {
                    await add.click(); await waitWindow(); await page.waitForTimeout(800); await idle(page);
                    const d2 = (await dialogTexts(page)).slice(-1)[0];
                    out.libraryAdd = {name: d2 && d2.name, text: flat(d2 && d2.text, 1200)};
                    await snap(page, 'log-library-add-window', {d: out.libraryAdd});
                    log('[library add]', JSON.stringify(out.libraryAdd).slice(0, 700));
                    const w = topWin(page);
                    const nm = w.locator('input[name^="libraryFileName"], input[type=text]:visible').first();
                    if (await nm.count()) await nm.fill('K5 library file');
                    const desc = w.locator('textarea:visible').first();
                    if (await desc.count()) await desc.fill('K5 library description');
                    const ty = w.locator('select').first();
                    if (await ty.count()) { const o = await ty.locator('option').evaluateAll((els) => els.map((x) => x.value).filter(Boolean)); if (o.length) await ty.selectOption(o[0]); }
                    const fi = w.locator('input[type=file]').first();
                    if (await fi.count()) { await fi.setInputFiles(MD); await page.waitForTimeout(2500); await idle(page); }
                    const ok = w.getByRole('button', {name: /^(OK|Save)$/}).last();
                    if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1200); await idle(page); sc.libUploaded = true; save(); }
                    const d3 = (await dialogTexts(page)).slice(-1)[0];
                    out.libraryAfter = {name: d3 && d3.name, text: flat(d3 && d3.text, 800)};
                    await snap(page, 'log-library-after-add', {d: out.libraryAfter});
                }
                for (let i = 0; i < 3 && (await page.locator(vis).count()) > 1; i++) await closeTop();
            }
            // the lists after a library upload
            if (!isOPS) {
                const i1 = await openWf(workflow(S[k].id, 'workflow_1'), 'log-after-library-submission');
                const i2 = await openWf(workflow(S[k].id, 'workflow_5'), 'log-after-library-production');
                out.listsAfterLibrary = {submission: i1.tables, production: i2.tables};
            }
            // a discussion with a file: the discussions panel's "Add", its composer's "Attach Files" › "Upload File"; save
            await openWf(workflow(S[k].id, isOPS ? undefined : 'workflow_5'));
            const panel = page.locator('[data-cy="discussion-manager"]').first();
            const addD = panel.getByRole('button', {name: 'Add', exact: true}).first();
            await loc(page, 'discussions panel "Add"', addD);
            if (await addD.count()) {
                await addD.click(); await idle(page);
                const modal = page.locator('[data-cy="active-modal"]').last();
                await modal.locator('input[name="title"]').waitFor({timeout: 30000}).catch(() => {});
                await page.waitForFunction(() => window.tinymce && window.tinymce.get().length, null, {timeout: 15000}).catch(() => {});
                await idle(page);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.discussionForm = {name: d && d.name, text: flat(d && d.text, 1500), buttons: d && d.buttons};
                await snap(page, 'log-discussion-form', {d: out.discussionForm});
                const at = topWin(page).getByRole('button', {name: 'Attach Files', exact: true}).first();
                await at.waitFor({timeout: 20000}).catch(() => {});
                await loc(page, 'discussion form "Attach Files"', at);
                if (await at.count()) {
                    await at.click(); await waitWindow(); await page.waitForTimeout(800);
                    const d2 = (await dialogTexts(page)).slice(-1)[0];
                    out.discussionAttach = {name: d2 && d2.name, text: flat(d2 && d2.text, 1200), buttons: d2 && d2.buttons};
                    await snap(page, 'log-discussion-attach', {d: out.discussionAttach});
                    log('[discussion attach]', JSON.stringify(out.discussionAttach).slice(0, 700));
                    const upf = topWin(page).getByRole('button', {name: /^Upload File$/}).first();
                    if (await upf.count()) {
                        await upf.click(); await idle(page); await page.waitForTimeout(400);
                        const input = topWin(page).locator('input[type="file"]').first();
                        await input.waitFor({state: 'attached', timeout: 15000});
                        await input.setInputFiles(MD);
                        await page.waitForFunction(() => { const dd = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return dd && /notes\.md/.test(dd.innerText); }, null, {timeout: 30000}).catch(() => {});
                        await idle(page); await page.waitForTimeout(800);
                        const addAtt = topWin(page).getByRole('button', {name: 'Attach Files', exact: true}).last();
                        if (await addAtt.count()) { await addAtt.click(); await idle(page); await page.waitForTimeout(800); }
                    }
                    // back on the form: title, a participant, a message, Save
                    const m2 = page.locator('[data-cy="active-modal"]').last();
                    await m2.locator('input[name="title"]').fill('K5 discussion with a file').catch(() => {});
                    const parts = m2.locator('input[name="participants"]');
                    if (await parts.count()) { const c = parts.first(); if (!(await c.isChecked())) await c.check().catch(() => {}); }
                    const fr = m2.frameLocator('iframe').last();
                    await fr.locator('body').click().catch(() => {}); await fr.locator('body').fill('K5 message with notes.md attached.').catch(() => {});
                    out.formBeforeSave = flat(await m2.innerText().catch(() => ''), 900);
                    await m2.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
                    await page.waitForTimeout(2000); await idle(page);
                    const d3 = (await dialogTexts(page)).slice(-1)[0];
                    out.afterSave = {name: d3 && d3.name, text: flat(d3 && d3.text, 600)};
                    await snap(page, 'log-discussion-saved', {d: out.afterSave});
                    log('[discussion saved]', JSON.stringify(out.afterSave).slice(0, 500));
                }
                for (let i = 0; i < 4 && (await page.locator(vis).count()) > 1; i++) await closeTop();
                if (!isOPS) {
                    const i3 = await openWf(workflow(S[k].id, 'workflow_5'), 'log-after-discussion-production');
                    const i4 = await openWf(workflow(S[k].id, 'workflow_1'), 'log-after-discussion-submission');
                    out.listsAfterDiscussion = {production: i3.tables.map((x) => `${x.name}: ${x.rows.join(' | ')}`), submission: i4.tables.map((x) => `${x.name}: ${x.rows.join(' | ')}`)};
                    log('[lists after discussion]', JSON.stringify(out.listsAfterDiscussion).slice(0, 900));
                }
            }
            // Publisher Library (Settings › Workflow)
            await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
            const tabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()));
            const plTab = page.getByRole('tab', {name: /Library/}).first();
            await loc(page, 'Settings › Workflow "Publisher Library"', plTab);
            if (await plTab.count()) {
                await plTab.click(); await idle(page); await page.waitForTimeout(1000); await idle(page);
                const s = await snap(page, 'log-publisher-library', {tabs});
                out.publisherLibrary = flat(s.text && s.text.main, 1000);
            } else out.settingsTabs = tabs;
            record('log-summary', out);
            log('[log summary]', JSON.stringify({buttons: out.buttons, disc: out.discussionButtons, lib: out.libraryButton, pl: flat(out.publisherLibrary, 200), tabs: out.settingsTabs}).slice(0, 1200));
        });
    } finally {
        record('js-dialogs', jsDialogs);
        await close();
    }
});
