// U46 claim check, chunk K1: the "Galleys" page and its list, the delete dialog, Rules 1, 8–10 and 12,
// Side effects, register A5. Spec: docs/specs/U46-galleys.md lines 52–67, 83–94, 154–177, 191–221, 390–398.
//
// Per app (OJS, OPS) one scratch context T (languages en + fr_CA); OMP a scratch press as the absence control.
// Users: OJS mgr (manager), ed (editor, manager level), se (sectionEditor), le (layoutEditor), au (author);
//        OPS mgr, se (Moderator), au.
// Submissions (submitter au; OJS in Production through skipExternalReview + sendToProduction, se + le assigned;
// OPS submitted, se assigned):
//   e0  no galley                         → the empty page per role (q5), then the Production notice (phase notice)
//   g2  PDF + HTML                        → the page with galleys per role, row menus; ordering (Rule 8, q12, A5)
//   dl  PDF + HTML                        → the delete dialog and Rule 9 (q13), files deleted
//   rd  PDF (en) + HTML (fr_CA) + Remote  → Name/Language columns; URL Path + order + publish; the reader (q17), search
//   pb  published, PDF                    → Rule 10 (q14) per role; Rule 1 across versions
//   rv, sb (OJS)  in Review / in Submission → Rule 12 (q16)
//   OJS context D: galley DOIs on (screen), dx in Production with a PDF galley → published on screen (DOIs side effect)
//
//   PROBE_FEATURE=U46 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U46/K1/k1.js
//   PHASES=seed,page,remote,order,delete,notice,log,reader,search,published,rorder,step,tie,dep,versions,stage,doi,a5,omp
//   (default all; state in k1-state-<app>.json; the mutating phases run once per seed: delete the state file for a fresh
//   run). search runs the fleet's queued jobs (php lib/pkp/tools/jobs.php run) before it searches.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fx = (app, f) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${f}`);
const ALL = ['seed', 'page', 'remote', 'order', 'delete', 'notice', 'log', 'reader', 'search', 'published', 'rorder', 'step', 'tie', 'dep', 'versions', 'stage', 'doi', 'a5', 'omp'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const T = 30000;
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1500)});
    }
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const PDF = isOPS ? fx('ops', 'preprint.pdf') : fx('ojs', 'article.pdf');
    const HTMLF = isOPS ? fx('ops', 'preprint.html') : fx('ojs', 'article.html');
    const MAIN = isOPS ? 'Preprint Text' : 'Article Text';
    const pdfName = isOPS ? 'preprint.pdf' : 'article.pdf';
    const htmlName = isOPS ? 'preprint.html' : 'article.html';
    const done = (p) => (sc.done || []).includes(p);
    const markDone = (p) => { sc.done = [...(sc.done || []), p]; save(); };

    // ---- seed -------------------------------------------------------------------------------
    if (on('seed') && !sc.T) {
        const t = tag('u46k1');
        const roleUsers = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author']]
            : isOMP
                ? [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sid', 'Series'], ['au', 'author', 'Ava', 'Author']]
                : [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['se', 'sectionEditor', 'Sid', 'Section'],
                    ['le', 'layoutEditor', 'Lee', 'Layout'], ['au', 'author', 'Ava', 'Author']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U46 K1 ${t}`, acronym: 'KONE', contactName: 'K1 Contact',
            contactEmail: `${t}c@mail.test`, supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}, users});
        sc.T = ctx.path || t;
        sc.t = t;
        sc.u = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.roles = Object.fromEntries(roleUsers.map(([k, r]) => [k, r]));
        save();
        const U = sc.u;
        const part = (k) => ({username: U[k], role: sc.roles[k]});
        const subs = {};
        const mk = async (k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.T, submitter: U.au, title: `K1 ${k.toUpperCase()} Quokkarium ${t}`, ...spec});
                subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, galleys: r.galleys};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'galleys', JSON.stringify(r.galleys));
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 700)); subs[k] = {error: String(e.message).slice(0, 700)}; }
        };
        if (isOMP) {
            await mk('om', {decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se')]});
            if (subs.om.error) await mk('om', {participants: [part('se')]});
        } else {
            const base = isOPS ? {participants: [part('se')]} : {decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se'), part('le')]};
            const G = (label, file, locale) => ({label, file: file === 'pdf' ? pdfName : htmlName, ...(locale ? {locale} : {})});
            await mk('e0', {...base});
            await mk('g2', {...base, galleys: [G('PDF', 'pdf'), G('HTML', 'html')]});
            await mk('dl', {...base, galleys: [G('PDF', 'pdf'), G('HTML', 'html')]});
            await mk('rd', {...base, galleys: [G('PDF', 'pdf', 'en'), G('HTML', 'html', 'fr_CA'), {label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46/remote.pdf'}]});
            await mk('pb', {...base, galleys: [G('PDF', 'pdf')], published: true});
            if (isOJS) {
                await mk('rv', {decisions: ['sendExternalReview'], participants: [part('se')]});
                await mk('sb', {participants: [part('se')]});
            }
        }
        sc.subs = subs; save();
        record('seed', sc);
    }
    if (!sc.T) { log('[k1] no state; run the seed phase first'); return; }
    const u = sc.u; const S = sc.subs || {};
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300), url: page.url().replace(/^.*\/index\.php/, '')});
        log('[browser dialog]', d.type(), flat(d.message(), 160));
        d.accept().catch(() => {});
    });
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"], .app__notifications > *').forEach((e) => {
                const tx = (e.innerText || '').trim();
                if (tx && !seen.has(e)) { seen.add(e); window.__notices.push({t: tx.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (since) => page.evaluate((s) => (window.__notices || []).filter((n) => n.at >= s).map((n) => n.t), since).catch(() => []);

    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const topWin = () => page.locator(vis).last();
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.T}${p}`);
    const edUrl = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const auUrl = (id, key, cp) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const gKey = (pid) => `publication_${pid}_galleys`;
    const readerPath = (id) => (isOPS ? `/preprint/view/${id}` : `/article/view/${id}`);
    const signInAs = async (user, cp) => { await signIn(page, user, {contextPath: cp || sc.T}); await idle(page); };
    async function snap(name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        if (extra) Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    const menuItems = () => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
    // The Galleys page as data: heading, the table, the controls above/below it, each row's cells and buttons.
    const galleyInfo = () => page.evaluate(() => {
        const v = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
        const hs = [...dlg.querySelectorAll("h1,h2,h3")].filter(v).map((h) => `${h.tagName}:${f(h.textContent)}`);
        const tables = [...dlg.querySelectorAll('table')].filter(v).map((t) => {
            const lab = t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && f(document.getElementById(t.getAttribute('aria-labelledby'))?.innerText)) || f(t.querySelector('caption')?.innerText) || null;
            // controls in the table's wrapper, before and after the table element
            let wrap = t.parentElement;
            for (let i = 0; i < 4 && wrap && !wrap.querySelector('button:not(table button)'); i++) wrap = wrap.parentElement;
            const all = wrap ? [...wrap.querySelectorAll('button, a.pkpButton')].filter(v).filter((b) => !t.contains(b)) : [];
            const pos = (b) => (t.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 'above' : 'below');
            return {
                label: lab,
                columns: [...t.querySelectorAll('thead th')].map((th) => ({text: f(th.innerText), textContent: f(th.textContent), srOnly: /sr-only|screen_reader|screenReader/.test(th.className + ' ' + (th.firstElementChild ? th.firstElementChild.className : ''))})),
                controls: all.map((b) => ({text: f(b.innerText || b.getAttribute('aria-label')), where: pos(b), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true'})),
                rows: [...t.querySelectorAll('tbody tr')].map((tr) => {
                    const tds = [...tr.querySelectorAll('td, th')];
                    const first = tds[0];
                    const a = first && first.querySelector('a');
                    const icon = first && first.querySelector('svg, [class*="icon"], [class*="Icon"], img');
                    return {
                        text: f(tr.innerText),
                        cells: tds.map((c) => f(c.innerText)),
                        nameLink: a ? {text: f(a.innerText), href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel')} : null,
                        icon: icon ? {tag: icon.tagName.toLowerCase(), cls: String(icon.getAttribute('class') || '').slice(0, 120), aria: icon.getAttribute('aria-label') || icon.getAttribute('aria-hidden')} : null,
                        buttons: [...tr.querySelectorAll('button')].filter(v).map((b) => ({text: f(b.innerText), aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), labelledby: b.getAttribute('aria-labelledby'), describedby: b.getAttribute('aria-describedby'), disabled: b.disabled, html: b.outerHTML.replace(/\s+/g, ' ').slice(0, 400)})),
                    };
                }),
            };
        });
        const buttons = [...dlg.querySelectorAll('button, a.pkpButton, a[role=button]')].filter(v).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean).slice(0, 80);
        const nav = [...dlg.querySelectorAll('nav a, nav button, [role=treeitem]')].filter(v).map((a) => f(a.innerText)).filter(Boolean).slice(0, 80);
        const notice = [...dlg.querySelectorAll('[class*="otification"], [role=alert], [class*="notice"]')].filter(v).map((e) => f(e.innerText)).filter(Boolean).slice(0, 10);
        return {url: location.href.replace(/^.*\/index\.php/, ''), headings: hs, tables, buttons, nav, notice, text: f(dlg.innerText).slice(0, 4000)};
    }).catch((e) => ({error: String(e.message).slice(0, 300), tables: [], buttons: [], headings: []}));
    async function openPage(url, label, {waitRows = true} = {}) {
        await page.goto(url); await idle(page);
        await page.locator(vis).first().waitFor({timeout: T}).catch(() => {});
        if (waitRows) await page.locator(vis).first().locator('table').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(300);
        const info = await galleyInfo();
        if (label) {
            await snap(label, {info});
            const tb = (info.tables || []).map((x) => `${x.label}: [${x.rows.map((r) => r.text).join(' | ')}] ctrl=${JSON.stringify(x.controls.map((c) => `${c.text}@${c.where}`))}`);
            log(`[${label}]`, info.url.slice(0, 120), '| h:', JSON.stringify(info.headings.slice(0, 6)), '| tables:', JSON.stringify(tb).slice(0, 900));
        }
        return info;
    }
    const galleysTable = () => wf().getByRole('table', {name: 'Galleys', exact: true}).first();
    const rowOf = (label) => wf().locator('table tbody tr').filter({has: page.getByText(label, {exact: true})}).first();
    async function openRowMenu(label) {
        const row = rowOf(label);
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button').last();
        if (!(await btn.count())) return {items: null, noButton: true};
        await btn.click(); await page.waitForTimeout(300);
        const items = await menuItems();
        return {items, btn};
    }
    // Never Escape: it closes the workflow dialog too (patterns.md pitfall 7). Press the open menu's own button again.
    async function closeMenu() {
        const open = page.locator('button[aria-haspopup="menu"][aria-expanded="true"]:visible').first();
        if (await open.count()) { await open.click().catch(() => {}); await page.waitForTimeout(200); }
    }
    async function pickItem(name) {
        await page.getByRole('menuitem', {name, exact: true}).first().click();
        await idle(page); await page.waitForTimeout(500);
    }
    async function dialogTexts() {
        return page.locator(vis).evaluateAll((els) => els.map((d) => ({
            name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
            text: d.innerText.slice(0, 3000),
            buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 40),
        }))).catch(() => []);
    }
    async function waitWindow() {
        await topWin().waitFor({timeout: T}).catch(() => {});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && !/Loading/.test(d.innerText) && d.innerText.length > 20; }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function closeTop() {
        const top = topWin();
        const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
        if (await c.count()) await c.click({timeout: 5000}).catch(() => {});
        await idle(page); await page.waitForTimeout(700);
    }
    // ---- the legacy upload wizard ----
    const wiz = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    const contBtn = () => wiz().getByRole('button', {name: 'Continue', exact: true});
    async function waitContinueEnabled(timeout = 30000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) { if (await contBtn().isEnabled().catch(() => false)) return true; await page.waitForTimeout(200); }
        return false;
    }
    async function toStep(n) {
        await contBtn().click();
        await wiz().getByRole('tab', {name: new RegExp(`^${n}\\.`)}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: T}).catch(() => {});
        await idle(page);
        if (n === 3) await wiz().getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
    }
    async function wizUpload(file) {
        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
        const g = wiz().locator('select[id^="genreId"]');
        if (await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: MAIN});
        await wiz().locator('input[type="file"]').setInputFiles(file);
        await waitContinueEnabled();
        await toStep(2); await toStep(3);
        await wiz().getByRole('button', {name: 'Complete', exact: true}).click();
        await wiz().waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page); await page.waitForTimeout(600); await idle(page);
    }
    async function wizCancel() {
        const c = wiz().getByRole('link', {name: 'Cancel', exact: true}).or(wiz().getByRole('button', {name: 'Cancel', exact: true})).first();
        await c.click().catch(() => {});
        await page.waitForTimeout(800);
        await wiz().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
    }
    // "Add galley" › label › Save › (upload wizard) → file uploaded, or the wizard cancelled when file is null.
    async function addGalley(label, file, name) {
        const out = {};
        await wf().getByRole('button', {name: 'Add galley', exact: true}).click();
        const win = topWin();
        await win.locator('input[name="label"]').waitFor({timeout: T});
        await idle(page);
        out.window = flat((await dialogTexts()).slice(-1)[0]?.name, 80);
        await win.locator('input[name="label"]').fill(label);
        const t0 = Date.now();
        const saved = page.waitForResponse((r) => /add-galley|update-galley|galley/i.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await saved; out.saveStatus = r && r.status();
        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
        await idle(page);
        out.wizardTitle = await wiz().evaluate((d) => d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null).catch(() => null);
        if (name) await snap(`${name}-wizard`);
        if (file) await wizUpload(file); else await wizCancel();
        out.notices = await noticesSince(t0);
        return out;
    }
    const orderInfo = async () => {
        const info = await galleyInfo();
        const t = (info.tables || [])[0] || {rows: [], controls: []};
        return {rows: t.rows.map((r) => r.cells[0] || r.text), controls: t.controls.map((c) => `${c.text}@${c.where}`), rowButtons: t.rows.map((r) => r.buttons), buttons: info.buttons};
    };
    async function mailCounts() {
        const out = {};
        for (const [k, un] of Object.entries(u)) out[k] = await app.mail.count({to: `${un}@mail.test`}).catch(() => null);
        return out;
    }
    async function productionNotice(id, name) {
        const info = await openPage(edUrl(id, 'workflow_5'), name, {waitRows: false});
        const box = await wf().evaluate((d) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const els = [...d.querySelectorAll('[class*="otification"], [class*="otice"], [role=alert], .pkpNotification')].filter((e) => e.getClientRects().length);
            return els.map((e) => f(e.innerText)).filter(Boolean).slice(0, 6);
        }).catch(() => []);
        return {box, hasAssign: /Assign a user to create galleys/.test(info.text), hasAwaiting: /Awaiting Galleys/.test(info.text), headings: info.headings};
    }
    async function openActivityLog() {
        const fetched = page.waitForResponse((r) => r.url().includes('submission-event-log-grid/fetch-grid'), {timeout: T}).catch(() => null);
        await page.getByRole('button', {name: 'Activity Log', exact: true}).first().click();
        await fetched; await idle(page); await page.waitForTimeout(500);
        const d = page.getByRole('dialog', {name: 'Activity Log & Notes', exact: true});
        const lines = await d.locator('tbody tr.gridRow').evaluateAll((rows) => rows.map((tr) => {
            const c = (td) => { if (!td) return ''; const x = td.cloneNode(true); x.querySelectorAll('script, a.show_extras, a.hide_extras').forEach((e) => e.remove()); return (x.textContent || '').replace(/\s+/g, ' ').trim(); };
            const tds = [...tr.querySelectorAll(':scope > td')];
            return {date: c(tds[0]), user: c(tds[1]), event: c(tds[2])};
        })).catch(() => []);
        return {d, lines};
    }
    async function moreInfo(label, name) {
        const m = await openRowMenu(label);
        if (!m.items || !m.items.includes('More Information')) { await closeMenu(); return {items: m.items, offered: false}; }
        await pickItem('More Information'); await waitWindow(); await page.waitForTimeout(800); await idle(page);
        const d = (await dialogTexts()).slice(-1)[0];
        const hist = await topWin().locator('tbody tr').evaluateAll((rows) => rows.map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
        await snap(name, {moreInfo: {title: d && d.name, hist}});
        await topWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await idle(page); await page.waitForTimeout(600);
        return {offered: true, title: d && d.name, history: hist};
    }
    async function readerLinks(url, name) {
        const resp = await page.goto(url).catch((e) => ({err: String(e.message)}));
        await idle(page);
        const links = await page.evaluate(() => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return [...document.querySelectorAll('a.obj_galley_link, a.galley_link, ul.galleys_links a, .galleys_links a, .item.galleys a, .supplementary_galleys_links a')]
                .map((a) => ({text: f(a.innerText), aria: a.getAttribute('aria-label'), href: (a.getAttribute('href') || '').replace(/^.*\/index\.php/, ''), cls: a.className}));
        }).catch(() => []);
        const s = await snap(name, {readerLinks: links, status: resp && resp.status ? resp.status() : resp});
        log(`[${name}]`, JSON.stringify(links));
        return {links, status: resp && resp.status ? resp.status() : null, title: s.title};
    }
    async function publishNow() {
        const s = {};
        if (isOJS) {
            const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
            const pub = new PublicationScreen(page, sc.T);
            const panel = await pub.openPublishPanel();
            await pub.fillVersionDetails(panel);
            const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
            if (await dontAssign.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false)) {
                await pub.awaitAssignmentPreselected(panel).catch(() => {});
                await dontAssign.check();
            }
            await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
            await confirm.waitFor({state: 'visible', timeout: T});
            s.confirm = flat(await confirm.innerText().catch(() => null), 600);
            const published = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
            const r = await published; s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        } else {
            const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
            const postControl = page.getByRole('button', {name: 'Post', exact: true});
            await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
            if (await stageAction.isVisible()) await stageAction.click();
            await postControl.waitFor({state: 'visible', timeout: T});
            await postControl.click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
            await confirm.waitFor({state: 'visible', timeout: T});
            await idle(page);
            for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                const x = confirm.locator(sel);
                if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(val).catch(() => {});
            }
            s.confirm = flat(await confirm.innerText().catch(() => null), 600);
            const posted = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
            const r = await posted; s.status = r ? r.status() : null;
            await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        }
        await idle(page);
        return s;
    }
    // Edit a galley's label and/or URL Path through the row menu's "Edit" › "Save".
    async function editGalley(label, {newLabel, urlPath}, name) {
        const out = {};
        const m = await openRowMenu(label);
        out.items = m.items;
        if (!m.items || !m.items.includes('Edit')) { await closeMenu(); out.noEdit = true; return out; }
        await pickItem('Edit'); await waitWindow();
        const win = topWin();
        await win.locator('input[name="label"]').waitFor({timeout: T}).catch(() => {});
        if (newLabel) await win.locator('input[name="label"]').fill(newLabel);
        if (urlPath != null) await win.locator('input[name="urlPath"]').fill(urlPath).catch((e) => { out.urlPathErr = String(e.message).slice(0, 120); });
        if (name) await snap(`${name}-window`);
        const t0 = Date.now();
        const saved = page.waitForResponse((r) => /galley/i.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await win.getByRole('button', {name: 'Save', exact: true}).last().click();
        const r = await saved; out.saveStatus = r && r.status();
        await page.waitForTimeout(1200); await idle(page);
        out.dialogsAfter = (await dialogTexts()).map((d) => d.name);
        out.notices = await noticesSince(t0);
        if (out.dialogsAfter.length > 1) { out.stillOpen = flat((await dialogTexts()).slice(-1)[0].text, 400); await closeTop(); }
        return out;
    }

    try {
        // =========================================================================================
        // OMP control: a press's publication side menu, and the galleys address typed in.
        if (on('omp') && isOMP && S.om && S.om.id) await sect('omp', async () => {
            await signInAs(u.mgr);
            const i1 = await openPage(edUrl(S.om.id, `publication_${S.om.publicationId}_titleAbstract`), 'omp-01-mgr-titleAbstract', {waitRows: false});
            const i2 = await openPage(edUrl(S.om.id, gKey(S.om.publicationId)), 'omp-02-mgr-galleys-key', {waitRows: false});
            record('omp-summary', {nav: i1.nav, galleysKey: {url: i2.url, headings: i2.headings, tables: i2.tables.map((t) => t.label), buttons: i2.buttons.filter((b) => /galley|Order|Format/i.test(b))}});
            log('[omp nav]', JSON.stringify(i1.nav), '| galleys key headings', JSON.stringify(i2.headings));
        });
        if (isOMP) return;

        // =========================================================================================
        // Phase page: the page with no galley and with galleys, per role (q5, q1, columns, row menus, sweep).
        if (on('page')) await sect('page', async () => {
            const out = {mail0: await mailCounts()};
            const who = isOPS ? ['mgr', 'se', 'au'] : ['mgr', 'ed', 'se', 'le', 'au'];
            for (const w of who) {
                await signInAs(u[w]);
                const url = (k) => (w === 'au' ? auUrl : edUrl)(S[k].id, gKey(S[k].publicationId));
                out[`${w}-e0`] = await openPage(url('e0'), `page-${w}-e0-empty`);
                out[`${w}-g2`] = await openPage(url('g2'), `page-${w}-g2`);
                const menus = {};
                for (const lab of ['PDF', 'HTML']) { const m = await openRowMenu(lab); menus[lab] = m.items; if (m.btn) await snap(`page-${w}-g2-menu-${lab}`, {menu: m.items}); await closeMenu(); }
                out[`${w}-g2-menus`] = menus;
                out[`${w}-rd`] = await openPage(url('rd'), `page-${w}-rd`);
                const rdm = {};
                for (const lab of ['PDF', 'HTML', 'Remote']) { const m = await openRowMenu(lab); rdm[lab] = m.items; if (m.btn && lab === 'Remote') await snap(`page-${w}-rd-menu-Remote`, {menu: m.items}); await closeMenu(); }
                out[`${w}-rd-menus`] = rdm;
                // Sweep: what the remote row's "Change File" does, and the "More Actions" column header as rendered.
                if (w === 'mgr' || (isOPS && w === 'au')) {
                    const m = await openRowMenu('Remote');
                    if (m.items && m.items.includes('Change File')) {
                        await pickItem('Change File');
                        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
                        await idle(page);
                        const d = (await dialogTexts()).slice(-1)[0];
                        out[`${w}-remote-changefile`] = {title: d && d.name, text: flat(d && d.text, 500)};
                        await snap(`page-${w}-rd-remote-changefile`);
                        await wizCancel();
                        await openPage(url('rd'));
                        out[`${w}-remote-after-cancel`] = (await orderInfo()).rows;
                    } else await closeMenu();
                    out[`${w}-thMoreActions`] = await wf().locator('table thead th').last().evaluate((th) => {
                        const r = th.getBoundingClientRect(); const cs = getComputedStyle(th.firstElementChild || th);
                        return {w: r.width, h: r.height, cls: th.className, childCls: th.firstElementChild ? th.firstElementChild.className : null, clip: cs.clip, pos: cs.position};
                    }).catch(() => null);
                }
                if (w === 'mgr') {
                    await loc(page, 'Galleys page: the table', galleysTable());
                    await loc(page, 'Galleys page: "Add galley"', wf().getByRole('button', {name: 'Add galley', exact: true}));
                    await loc(page, 'Galleys page: "Order"', wf().getByRole('button', {name: 'Order', exact: true}));
                    await loc(page, 'Galleys page: row "PDF" "More Actions" button', rowOf('PDF').getByRole('button', {name: 'More Actions'}));
                }
                // Press the PDF label: new tab, download, or refusal (q1, Name column); and the Remote row's label.
                if (w === 'mgr' || w === 'au') {
                    const link = rowOf('PDF').locator('a').first();
                    const res = {count: await link.count()};
                    if (res.count) {
                        res.href = (await link.getAttribute('href')) || '';
                        const popP = page.context().waitForEvent('page', {timeout: 10000}).catch(() => null);
                        const dlP = page.waitForEvent('download', {timeout: 10000}).catch(() => null);
                        await link.click().catch((e) => { res.clickErr = String(e.message).slice(0, 120); });
                        const pop = await popP;
                        if (pop) {
                            const dl2 = pop.waitForEvent('download', {timeout: 8000}).catch(() => null);
                            await pop.waitForLoadState('domcontentloaded').catch(() => {});
                            await pop.waitForTimeout(1500);
                            res.popupUrl = pop.url().replace(/^.*\/index\.php/, '');
                            res.popupTitle = await pop.title().catch(() => null);
                            res.popupText = flat(await pop.locator('body').innerText().catch(() => null), 300);
                            const d2 = await dl2; if (d2) res.popupDownload = d2.suggestedFilename();
                            await pop.close().catch(() => {});
                        }
                        const d = await dlP; if (d) res.download = d.suggestedFilename();
                        res.pageUrlAfter = page.url().replace(/^.*\/index\.php/, '');
                    }
                    out[`${w}-labelPress`] = res;
                    log(`[page ${w} label press]`, JSON.stringify(res));
                }
            }
            out.mail1 = await mailCounts();
            record('page-summary', out);
        });

        // =========================================================================================
        // Phase order: Rule 8 on g2 as the manager (q12, A5); edit and add ("XML", then "EPUB").
        if (on('order') && !done('order')) await sect('order', async () => {
            const out = {mail0: await mailCounts()};
            await signInAs(u.mgr);
            const url = edUrl(S.g2.id, gKey(S.g2.publicationId));
            await openPage(url, 'order-01-before');
            out.before = await orderInfo();
            const orderBtn = wf().getByRole('button', {name: 'Order', exact: true});
            await orderBtn.click(); await page.waitForTimeout(500);
            await snap('order-02-mode');
            out.mode = await orderInfo();
            out.modeCancel = await wf().getByRole('button', {name: 'Cancel', exact: true}).count();
            await loc(page, 'Galleys ordering mode: "Save Order"', wf().getByRole('button', {name: 'Save Order', exact: true}));
            await loc(page, 'Galleys ordering mode: first row buttons', wf().locator('table tbody tr').first().getByRole('button'));
            // the arrows at the ends
            const rows = () => wf().locator('table tbody tr');
            await rows().first().getByRole('button').first().click().catch((e) => { out.upFirstErr = String(e.message).slice(0, 120); });
            await page.waitForTimeout(300);
            out.afterUpFirst = (await orderInfo()).rows;
            await rows().last().getByRole('button').last().click().catch((e) => { out.downLastErr = String(e.message).slice(0, 120); });
            await page.waitForTimeout(300);
            out.afterDownLast = (await orderInfo()).rows;
            // PDF's down arrow, then side menu "Metadata" and back (8c)
            await rowOf('PDF').getByRole('button').last().click(); await page.waitForTimeout(300);
            out.afterPdfDown = (await orderInfo()).rows;
            await snap('order-03-pdf-down-unsaved');
            const navItem = (name) => wf().locator('nav a, nav button, [role=treeitem] a, [role=treeitem] button').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)}).first();
            out.metadataNav = await navItem('Metadata').count();
            const d0 = jsDialogs.length;
            if (out.metadataNav) { await navItem('Metadata').click(); await idle(page); await page.waitForTimeout(800); }
            await snap('order-04-metadata');
            await navItem('Galleys').click().catch(() => {}); await idle(page); await page.waitForTimeout(800);
            await galleysTable().waitFor({timeout: 20000}).catch(() => {});
            await snap('order-05-back-via-menu');
            out.backViaMenu = await orderInfo();
            out.dialogsOnLeave = jsDialogs.slice(d0);
            // Leave by address while in ordering mode
            const oc = wf().getByRole('button', {name: 'Order', exact: true});
            if (await oc.count()) { await oc.click(); await page.waitForTimeout(300); await rowOf('PDF').getByRole('button').last().click().catch(() => {}); }
            const d1 = jsDialogs.length;
            await openPage(url, 'order-06-reload-after-unsaved');
            out.afterReloadUnsaved = await orderInfo();
            out.dialogsOnReload = jsDialogs.slice(d1);
            // 8d before any saved order: add "XML" (a file)
            out.addXml = await addGalley('XML', PDF, 'order-07-add-xml');
            await openPage(url, 'order-08-after-xml');
            out.afterXml = (await orderInfo()).rows;
            // edit XML's label (an edit for the log/mail side effects)
            out.editXml = await editGalley('XML', {newLabel: 'XMLv2'}, 'order-08b-edit-xml');
            await openPage(url, 'order-08c-after-edit');
            out.afterEdit = (await orderInfo()).rows;
            // 8a/8b: Order, move HTML to the top (PDF down), Save Order, reload
            await wf().getByRole('button', {name: 'Order', exact: true}).click(); await page.waitForTimeout(300);
            await rowOf('PDF').getByRole('button').last().click(); await page.waitForTimeout(300);
            out.beforeSave = (await orderInfo()).rows;
            const t0 = Date.now();
            const seqP = page.waitForResponse((r) => /saveSequence|save-sequence/i.test(r.url()), {timeout: T}).catch(() => null);
            await wf().getByRole('button', {name: 'Save Order', exact: true}).click();
            const seq = await seqP; out.saveSeq = seq ? {status: seq.status(), url: seq.url().replace(/^.*\/index\.php/, '').slice(0, 200), body: flat(await seq.text().catch(() => null), 200)} : null;
            await page.waitForTimeout(800); await idle(page);
            out.afterSave = await orderInfo();
            out.saveNotices = await noticesSince(t0);
            await snap('order-09-after-save');
            await openPage(url, 'order-10-reload-after-save');
            out.afterSaveReload = (await orderInfo()).rows;
            // 8d after a saved order: add "EPUB"
            out.addEpub = await addGalley('EPUB', PDF, 'order-11-add-epub');
            await openPage(url, 'order-12-after-epub');
            out.afterEpub = (await orderInfo()).rows;
            out.mail1 = await mailCounts();
            record('order-summary', out);
            log('[order]', JSON.stringify({before: out.before.rows, mode: out.mode, upFirst: out.afterUpFirst, downLast: out.afterDownLast, pdfDown: out.afterPdfDown, back: out.backViaMenu.rows, reload: out.afterReloadUnsaved.rows, xml: out.afterXml, save: out.afterSave.rows, saveReload: out.afterSaveReload, epub: out.afterEpub, seq: out.saveSeq}).slice(0, 3000));
            markDone('order');
        });

        // =========================================================================================
        // Phase delete: Rule 9 on dl (q13): Cancel, OK; the preview's galley link before and after.
        if (on('delete') && !done('delete')) await sect('delete', async () => {
            const out = {mail0: await mailCounts()};
            await signInAs(u.mgr);
            const url = edUrl(S.dl.id, gKey(S.dl.publicationId));
            await openPage(url, 'delete-01-before');
            out.infoPdf = await moreInfo('PDF', 'delete-02-pdf-moreinfo');
            // the reader-side preview address of the PDF galley, read from the Preview page
            await openPage(url);
            const prev = wf().getByRole('button', {name: 'Preview', exact: true}).last();
            out.previewOffered = await prev.count();
            let previewUrl = null;
            if (out.previewOffered) {
                const popP = page.context().waitForEvent('page', {timeout: 8000}).catch(() => null);
                await prev.click();
                const pop = await popP;
                const target = pop || page;
                await target.waitForLoadState('domcontentloaded').catch(() => {}); await target.waitForTimeout(1500);
                previewUrl = target.url();
                out.previewLinks = await target.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /galley|download|view\/\d+\/\d+/.test(a.getAttribute('href') || '') && /PDF|HTML/.test(a.innerText)).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => []);
                await shot(target, 'delete-03-preview-before').catch(() => {});
                if (pop) await pop.close().catch(() => {});
            }
            sc.previewUrl = previewUrl; save();
            out.previewUrl = previewUrl && previewUrl.replace(/^.*\/index\.php/, '');
            log('[delete preview links]', JSON.stringify(out.previewLinks));
            // follow the PDF link from the preview: view page and download
            const pdfLink = (out.previewLinks || []).find((l) => /PDF/.test(l.text));
            const fetchStatus = async (href) => {
                if (!href) return null;
                const abs = href.startsWith('http') ? href : app.url(href);
                const r = await page.request.get(abs, {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 100)}));
                return r.status ? {status: r.status(), ctype: r.headers()['content-type'], disp: r.headers()['content-disposition'] || null, loc: r.headers().location || null} : r;
            };
            if (pdfLink) {
                out.pdfView = await fetchStatus(pdfLink.href);
                out.pdfDownloadHref = pdfLink.href.replace('/view/', '/download/');
                out.pdfDownload = await fetchStatus(out.pdfDownloadHref);
            }
            await openPage(url);
            // Delete › Cancel
            let m = await openRowMenu('PDF'); out.menu = m.items;
            await pickItem('Delete');
            const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await dlg.waitFor({timeout: T}).catch(() => {});
            const dd = (await dialogTexts()).slice(-1)[0];
            out.dialog = {name: dd && dd.name, text: flat(dd && dd.text, 400), buttons: dd && dd.buttons};
            await snap('delete-04-dialog', {dialog: out.dialog});
            await loc(page, 'Delete dialog: "OK"', dlg.getByRole('button', {name: 'OK', exact: true}));
            await loc(page, 'Delete dialog: "Cancel"', dlg.getByRole('button', {name: 'Cancel', exact: true}));
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await page.waitForTimeout(800); await idle(page);
            out.afterCancel = {dialogs: (await dialogTexts()).map((d) => d.name), rows: (await orderInfo()).rows};
            await snap('delete-05-after-cancel');
            await openPage(url, 'delete-06-reload-after-cancel');
            out.afterCancelReload = (await orderInfo()).rows;
            // Delete › OK
            await page.waitForTimeout(600);
            m = await openRowMenu('PDF');
            await pickItem('Delete');
            await dlg.waitFor({timeout: T}).catch(() => {});
            const t0 = Date.now();
            const delP = page.waitForResponse((r) => /delete-galley|deleteGalley/i.test(r.url()), {timeout: T}).catch(() => null);
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            const dr = await delP; out.deleteStatus = dr && dr.status();
            await page.waitForTimeout(1200); await idle(page);
            out.afterOk = {dialogs: (await dialogTexts()).map((d) => d.name), rows: (await orderInfo()).rows, notices: await noticesSince(t0)};
            await snap('delete-07-after-ok');
            await openPage(url, 'delete-08-reload-after-ok');
            out.afterOkReload = (await orderInfo()).rows;
            if (pdfLink) {
                out.pdfViewAfter = await fetchStatus(pdfLink.href);
                out.pdfDownloadAfter = await fetchStatus(out.pdfDownloadHref);
                await page.goto(pdfLink.href.startsWith('http') ? pdfLink.href : app.url(pdfLink.href)).catch(() => {});
                await idle(page);
                await snap('delete-09-old-galley-address');
            }
            if (previewUrl) {
                await page.goto(previewUrl).catch(() => {}); await idle(page);
                out.previewAfter = await page.evaluate(() => [...document.querySelectorAll('a')].filter((a) => /PDF|HTML/.test(a.innerText) && /view|download/.test(a.getAttribute('href') || '')).map((a) => a.innerText.trim())).catch(() => []);
                await snap('delete-10-preview-after');
            }
            out.mail1 = await mailCounts();
            record('delete-summary', out);
            log('[delete]', JSON.stringify({dialog: out.dialog, afterCancel: out.afterCancel, afterOk: out.afterOk, reload: out.afterOkReload, pdfView: out.pdfView, pdfDownload: out.pdfDownload, pdfViewAfter: out.pdfViewAfter, pdfDownloadAfter: out.pdfDownloadAfter, previewAfter: out.previewAfter}).slice(0, 2500));
            markDone('delete');
        });

        // =========================================================================================
        // Phase notice: the Production notice as the assigned editor (se) on e0: before, after adding, after deleting the last.
        if (on('notice') && !done('notice')) await sect('notice', async () => {
            const out = {mail0: await mailCounts()};
            await signInAs(u.se);
            out.before = await productionNotice(S.e0.id, 'notice-01-before');
            await openPage(edUrl(S.e0.id, gKey(S.e0.publicationId)), 'notice-02-galleys');
            out.add = await addGalley('PDF', PDF, 'notice-03-add');
            out.samePageAfterAdd = (await orderInfo()).rows;
            out.afterAdd = await productionNotice(S.e0.id, 'notice-04-after-add');
            await openPage(edUrl(S.e0.id, gKey(S.e0.publicationId)));
            await openRowMenu('PDF'); await pickItem('Delete');
            const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await dlg.waitFor({timeout: T}).catch(() => {});
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForTimeout(1200); await idle(page);
            out.afterDelete = await productionNotice(S.e0.id, 'notice-05-after-delete');
            out.mail1 = await mailCounts();
            record('notice-summary', out);
            log('[notice]', JSON.stringify(out).slice(0, 1500));
            markDone('notice');
        });

        // =========================================================================================
        // Phase log: Activity Log on g2 and dl after the add/edit/order/delete; the XML galley's history (q18).
        if (on('log')) await sect('log', async () => {
            const out = {mail: await mailCounts()};
            await signInAs(u.mgr);
            for (const k of ['g2', 'dl', 'e0']) {
                await openPage(edUrl(S[k].id, gKey(S[k].publicationId)));
                const {lines} = await openActivityLog();
                out[`${k}-log`] = lines;
                await snap(`log-${k}-activity`, {lines});
                await page.getByRole('dialog', {name: 'Activity Log & Notes', exact: true}).getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await idle(page); await page.waitForTimeout(600);
            }
            await openPage(edUrl(S.g2.id, gKey(S.g2.publicationId)));
            out.xmlInfo = await moreInfo('XMLv2', 'log-g2-xml-moreinfo');
            out.pdfInfo = await moreInfo('PDF', 'log-g2-pdf-moreinfo');
            record('log-summary', out);
            log('[log]', JSON.stringify(out).slice(0, 3000));
        });

        // =========================================================================================
        // Phase reader: rd: URL Path on HTML, order HTML first, publish; the reader in English and French (q17); search.
        if (on('reader') && !done('reader')) await sect('reader', async () => {
            const out = {};
            await signInAs(u.mgr);
            const url = edUrl(S.rd.id, gKey(S.rd.publicationId));
            await openPage(url, 'reader-01-rd-before');
            out.editHtml = await editGalley('HTML', {urlPath: 'html-fr'}, 'reader-02-edit-html');
            await openPage(url);
            await wf().getByRole('button', {name: 'Order', exact: true}).click();
            await wf().getByRole('button', {name: 'Save Order', exact: true}).waitFor({timeout: T}).catch(() => {});
            // HTML first: PDF's down arrow (its last button)
            await rowOf('PDF').getByRole('button').last().click(); await page.waitForTimeout(300);
            out.orderShown = (await orderInfo()).rows;
            await wf().getByRole('button', {name: 'Save Order', exact: true}).click(); await page.waitForTimeout(1000); await idle(page);
            await openPage(url, 'reader-03-rd-ordered');
            out.orderSaved = (await orderInfo()).rows;
            await openPage(edUrl(S.rd.id, `publication_${S.rd.publicationId}_titleAbstract`), null, {waitRows: false});
            out.publish = await publishNow();
            await snap('reader-04-published');
            await signOut(page).catch(() => {});
            out.en = await readerLinks(ctxUrl(readerPath(S.rd.id)), 'reader-05-landing-en');
            out.fr = await readerLinks(ctxUrl(`/fr_CA${readerPath(S.rd.id)}`), 'reader-06-landing-fr');
            // where the remote link leads, without leaving the machine
            const rem = (out.en.links || []).find((l) => /Remote/.test(l.text));
            if (rem) {
                const r = await page.request.get(rem.href.startsWith('http') ? rem.href : app.url(`/index.php${rem.href}`), {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 100)}));
                out.remoteHop = r.status ? {status: r.status(), location: r.headers().location || null} : r;
                const dl = (rem.href || '').replace('/view/', '/download/');
                const r2 = await page.request.get(dl.startsWith('http') ? dl : app.url(`/index.php${dl}`), {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 100)}));
                out.remoteDownloadHop = r2.status ? {status: r2.status(), location: r2.headers().location || null} : r2;
            }
            const html = (out.en.links || []).find((l) => /HTML/.test(l.text));
            if (html) {
                await page.goto(app.url(html.href.startsWith('/') ? `/index.php${html.href}` : html.href)).catch(() => {});
                await idle(page); await snap('reader-07-html-galley-view');
                out.htmlViewUrl = page.url().replace(/^.*\/index\.php/, '');
            }
            record('reader-summary', out);
            log('[reader]', JSON.stringify(out).slice(0, 3000));
            markDone('reader');
        });

        // =========================================================================================
        // Phase rorder: on the published rd, the up arrow (Remote up twice), Save Order, and the reader's order at once.
        if (on('rorder') && !done('rorder')) await sect('rorder', async () => {
            const out = {};
            await signInAs(u.mgr);
            const url = edUrl(S.rd.id, gKey(S.rd.publicationId));
            await openPage(url, 'rorder-01-before');
            out.before = (await orderInfo()).rows;
            await wf().getByRole('button', {name: 'Order', exact: true}).click();
            await wf().getByRole('button', {name: 'Save Order', exact: true}).waitFor({timeout: T}).catch(() => {});
            await page.waitForTimeout(300);
            await rowOf('Remote').getByRole('button').first().click(); await page.waitForTimeout(300);
            out.afterUp1 = (await orderInfo()).rows;
            await rowOf('Remote').getByRole('button').first().click(); await page.waitForTimeout(300);
            out.afterUp2 = (await orderInfo()).rows;
            await snap('rorder-02-shown');
            const seqP = page.waitForResponse((r) => /save-sequence/i.test(r.url()), {timeout: T}).catch(() => null);
            await wf().getByRole('button', {name: 'Save Order', exact: true}).click();
            const seq = await seqP; out.seq = seq && seq.status();
            await page.waitForTimeout(800);
            await openPage(url, 'rorder-03-reload');
            out.saved = (await orderInfo()).rows;
            await signOut(page).catch(() => {});
            out.reader = await readerLinks(ctxUrl(readerPath(S.rd.id)), 'rorder-04-landing');
            record('rorder-summary', out);
            log('[rorder]', JSON.stringify(out).slice(0, 1500));
            markDone('rorder');
        });

        // =========================================================================================
        // Phase step: one press of a down arrow moves a row how far? g2 (four galleys), first row down ×1, ×2, then last
        // row up ×1; nothing saved (the page is reloaded after).
        if (on('step')) await sect('step', async () => {
            const out = {};
            await signInAs(u.mgr);
            const url = edUrl(S.g2.id, gKey(S.g2.publicationId));
            await openPage(url, 'step-01-before');
            out.before = (await orderInfo()).rows;
            await wf().getByRole('button', {name: 'Order', exact: true}).click();
            await wf().getByRole('button', {name: 'Save Order', exact: true}).waitFor({timeout: T}).catch(() => {});
            await page.waitForTimeout(400);
            const rows = () => wf().locator('table tbody tr');
            const first = out.before[0];
            await rowOf(first).getByRole('button').last().click(); await page.waitForTimeout(400);
            out.down1 = (await orderInfo()).rows;
            await rowOf(first).getByRole('button').last().click(); await page.waitForTimeout(400);
            out.down2 = (await orderInfo()).rows;
            const lastLabel = out.down2[out.down2.length - 1];
            await rowOf(lastLabel).getByRole('button').first().click(); await page.waitForTimeout(400);
            out.lastUp1 = (await orderInfo()).rows;
            await snap('step-02-after-moves');
            await openPage(url, 'step-03-reload');
            out.reload = (await orderInfo()).rows;
            record('step-summary', out);
            log('[step]', JSON.stringify(out));
        });

        // =========================================================================================
        // Phase tie: no order ever saved (three galleys): does editing one change the list's order? (8d follow-up)
        if (on('tie') && !done('tie')) await sect('tie', async () => {
            const out = {};
            const tq = await app.api.createSubmission({tag: `${sc.t}tq`, context: sc.T, submitter: u.au, title: `K1 TQ Quokkarium ${sc.t}`,
                ...(isOPS ? {} : {decisions: ['skipExternalReview', 'sendToProduction']}),
                galleys: [{label: 'Alpha', urlRemote: 'https://example.org/a.pdf'}, {label: 'Beta', urlRemote: 'https://example.org/b.pdf'}, {label: 'Gamma', urlRemote: 'https://example.org/c.pdf'}]});
            sc.tq = {id: tq.submissionId, publicationId: tq.publicationId}; save();
            await signInAs(u.mgr);
            const url = edUrl(tq.submissionId, gKey(tq.publicationId));
            await openPage(url, 'tie-01-seeded');
            out.seeded = (await orderInfo()).rows;
            for (const [from, to] of [['Alpha', 'Alpha1'], ['Beta', 'Beta1'], ['Gamma', 'Gamma1']]) {
                out[`edit-${from}`] = (await editGalley(from, {newLabel: to})).saveStatus;
                await openPage(url, `tie-02-after-${from}`);
                out[`after-${from}`] = (await orderInfo()).rows;
            }
            record('tie-summary', out);
            log('[tie]', JSON.stringify(out));
            markDone('tie');
        });

        // =========================================================================================
        // Phase dep: Rule 9's dependent files: a dependent file on dl's HTML galley, then the galley deleted; the
        // dependent file's own download address (as its grid row links it) before and after.
        if (on('dep') && !done('dep')) await sect('dep', async () => {
            const out = {};
            await signInAs(u.mgr);
            const url = edUrl(S.dl.id, gKey(S.dl.publicationId));
            await openPage(url, 'dep-01-before');
            await openRowMenu('HTML'); await pickItem('Edit'); await waitWindow(); await page.waitForTimeout(800); await idle(page);
            let up = topWin().locator('[id^="component-grid-files-dependent"], [id^="dependentFilesGridDiv"], [id*="ependent"]').getByRole('link', {name: /Upload/}).first();
            out.uploadLink = await up.count();
            await snap('dep-02-edit-window');
            if (out.uploadLink) {
                await up.click(); await idle(page);
                const dw = page.locator(vis).last();
                await dw.locator('input[type="file"]').first().waitFor({state: 'attached', timeout: T});
                await idle(page);
                const genre = dw.locator('select[id^="genreId"]');
                if (await genre.count()) {
                    const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
                    out.depGenres = opts.map((o) => o.text);
                    const pick = opts.find((o) => o.text === 'Image') || opts.find((o) => o.value && !/^Select/i.test(o.text));
                    if (pick) await genre.selectOption(pick.value);
                }
                await dw.locator('input[type="file"]').first().setInputFiles(fx(isOPS ? 'ops' : 'ojs', 'profile-image-400.png'));
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role=dialog] button')].filter((x) => x.innerText.trim() === 'Continue' && x.getClientRects().length).pop(); return b && !b.disabled; }, null, {timeout: T}).catch(() => {});
                await dw.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(800);
                await dw.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page); await page.waitForTimeout(500);
                await dw.getByRole('button', {name: 'Complete', exact: true}).click().catch(() => {}); await idle(page);
                await page.waitForTimeout(1200); await idle(page);
                const grid = topWin().locator('[id^="component-grid-files-dependent"], [id*="ependent"]').first();
                out.depLinks = await grid.locator('a').evaluateAll((as) => as.filter((a) => /download|file-api/i.test(a.getAttribute('href') || '')).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => []);
                if (!out.depLinks.length) out.depLinks = await topWin().locator('a').evaluateAll((as) => as.filter((a) => /download-file/i.test(a.getAttribute('href') || '')).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => []);
                await snap('dep-03-edit-after-dependent', {depLinks: out.depLinks});
            }
            await closeTop();
            const get = async (href) => {
                const r = await page.request.get(href.startsWith('http') ? href : app.url(href), {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 100)}));
                return r.status ? {status: r.status(), ctype: r.headers()['content-type'], disp: r.headers()['content-disposition'] || null} : r;
            };
            out.depBefore = [];
            for (const l of out.depLinks || []) out.depBefore.push({text: l.text, ...(await get(l.href))});
            await openPage(url);
            await openRowMenu('HTML'); await pickItem('Delete');
            const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
            await dlg.waitFor({timeout: T}).catch(() => {});
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForTimeout(1200); await idle(page);
            await openPage(url, 'dep-04-after-delete');
            out.rowsAfter = (await orderInfo()).rows;
            out.depAfter = [];
            for (const l of out.depLinks || []) out.depAfter.push({text: l.text, ...(await get(l.href))});
            const {lines} = await openActivityLog();
            out.logTop = lines.slice(0, 6);
            await snap('dep-05-activity-log', {lines: lines.slice(0, 10)});
            record('dep-summary', out);
            log('[dep]', JSON.stringify(out).slice(0, 2500));
            markDone('dep');
        });

        // =========================================================================================
        // Phase search: the site's background jobs run (the fleets run with the job runner off), then a word only in the
        // HTML galley ("Dependent") and, as the control, the title word, on the journal's / server's Search page.
        if (on('search')) await sect('search', async () => {
            const out = {};
            const {execFileSync} = require('child_process');
            const root = path.resolve(REPO, app.root || `checkouts/${app.name}`);
            try {
                out.jobs = flat(execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: root, env: {...process.env, PKP_CONFIG_FILE: path.join(root, 'config.test.inc.php')}, encoding: 'utf8', timeout: 240000}), 300);
            } catch (e) { out.jobsErr = flat(String(e.stdout || e.message), 300); }
            await signOut(page).catch(() => {});
            for (const [k, q] of [['galleyWord', 'Dependent'], ['titleWord', 'Quokkarium']]) {
                await page.goto(ctxUrl(`/search/search?query=${encodeURIComponent(q)}`)); await idle(page);
                const s = await snap(`search-${k}`);
                const body = (await page.locator('body').innerText().catch(() => '')) || '';
                out[k] = {noResults: /No Results/.test(body), hits: body.split('\n').filter((l) => /Quokkarium/.test(l)).slice(0, 8)};
            }
            record('search-summary', out);
            log('[search]', JSON.stringify(out).slice(0, 1500));
        });

        // =========================================================================================
        // Phase published: Rule 10 (q14) on rd (published on screen) and pb (seeded published), per role.
        if (on('published') && !done('published')) await sect('published', async () => {
            const out = {};
            const who = isOPS ? ['mgr', 'se', 'au'] : ['mgr', 'se', 'le', 'au'];
            for (const w of who) {
                await signInAs(u[w]);
                for (const k of ['pb', 'rd']) {
                    const url = (w === 'au' ? auUrl : edUrl)(S[k].id, gKey(S[k].publicationId));
                    const info = await openPage(url, `pub-${w}-${k}`);
                    const m = await openRowMenu('PDF'); await closeMenu();
                    out[`${w}-${k}`] = {headings: info.headings, controls: (info.tables[0] || {}).controls, rows: (info.tables[0] || {rows: []}).rows.map((r) => r.text), menu: m.items};
                }
            }
            // the manager edits the label on the published rd; the reader's link text at once
            await signInAs(u.mgr);
            await openPage(edUrl(S.rd.id, gKey(S.rd.publicationId)));
            out.edit = await editGalley('PDF', {newLabel: 'PDF (corrected)'}, 'pub-10-edit-label');
            await openPage(edUrl(S.rd.id, gKey(S.rd.publicationId)), 'pub-11-after-edit');
            // Order on a published version: PDF (corrected) to the top, Save Order
            await wf().getByRole('button', {name: 'Order', exact: true}).click().catch(() => {}); await page.waitForTimeout(300);
            const pdfRow = rowOf('PDF (corrected)');
            await pdfRow.getByRole('button').first().click().catch(() => {}); await page.waitForTimeout(200);
            await pdfRow.getByRole('button').first().click().catch(() => {}); await page.waitForTimeout(200);
            out.pubOrderShown = (await orderInfo()).rows;
            const seqP = page.waitForResponse((r) => /saveSequence|save-sequence/i.test(r.url()), {timeout: T}).catch(() => null);
            await wf().getByRole('button', {name: 'Save Order', exact: true}).click().catch(() => {});
            const seq = await seqP; out.pubSaveSeq = seq && seq.status();
            await page.waitForTimeout(800);
            await openPage(edUrl(S.rd.id, gKey(S.rd.publicationId)), 'pub-12-after-order');
            out.pubOrderSaved = (await orderInfo()).rows;
            await signOut(page).catch(() => {});
            out.readerAfter = await readerLinks(ctxUrl(readerPath(S.rd.id)), 'pub-13-landing-after-edit');
            // Add galley on the published pb as the manager (the whole set still works)
            await signInAs(u.mgr);
            await openPage(edUrl(S.pb.id, gKey(S.pb.publicationId)));
            out.pbAdd = await addGalley('HTML', HTMLF, 'pub-14-pb-add');
            await openPage(edUrl(S.pb.id, gKey(S.pb.publicationId)), 'pub-15-pb-after-add');
            out.pbAfterAdd = (await orderInfo()).rows;
            await signOut(page).catch(() => {});
            out.pbReader = await readerLinks(ctxUrl(readerPath(S.pb.id)), 'pub-16-pb-landing');
            record('published-summary', out);
            log('[published]', JSON.stringify(out).slice(0, 3500));
            markDone('published');
        });

        // =========================================================================================
        // Phase versions: Rule 1 on pb: a new version, a galley added there, the first version's list through the side menu.
        if (on('versions') && !done('versions')) await sect('versions', async () => {
            const out = {};
            await signInAs(u.mgr);
            await openPage(edUrl(S.pb.id, gKey(S.pb.publicationId)), 'ver-01-v1');
            const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).first();
            out.createOffered = await link.isVisible().catch(() => false);
            if (out.createOffered) {
                await link.click();
                const win = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
                await win.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
                await idle(page); await page.waitForTimeout(1200);
                const st = win.locator('select[name="versionStage"]'); if (!(await st.inputValue())) await st.selectOption('VoR');
                const mi = win.locator('select[name="versionIsMinor"]'); if (await mi.isVisible().catch(() => false) && !(await mi.inputValue())) await mi.selectOption('false');
                const created = page.waitForResponse((r) => /\/publications\/\d+\/version/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await win.getByRole('button', {name: 'Confirm', exact: true}).click();
                const cr = await created;
                out.createStatus = cr && cr.status();
                const body = cr ? await cr.json().catch(() => null) : null;
                out.newPid = body && body.id;
                sc.pbNewPid = out.newPid; save();
                await win.waitFor({state: 'detached', timeout: T}).catch(() => {});
                await idle(page);
            }
            if (out.newPid) {
                const i2 = await openPage(edUrl(S.pb.id, gKey(out.newPid)), 'ver-02-v2');
                out.v2 = {headings: i2.headings, rows: (await orderInfo()).rows, nav: i2.nav};
                out.addV2 = await addGalley('EPUB', null, 'ver-03-v2-add-nofile');
                const i3 = await openPage(edUrl(S.pb.id, gKey(out.newPid)), 'ver-04-v2-after-add');
                out.v2after = (i3.tables[0] || {rows: []}).rows.map((r) => ({text: r.text, nameLink: r.nameLink}));
                // the side menu: every version node, then the first version's "Galleys"
                out.nav = i3.nav;
                const tree = await wf().getByRole('treeitem').evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160), expanded: e.getAttribute('aria-expanded')}))).catch(() => []);
                out.tree = tree;
                const v1 = wf().getByRole('treeitem').filter({hasText: /1\.0|Version of Record 1/}).first();
                if (await v1.count()) {
                    await v1.click().catch(() => {}); await idle(page); await page.waitForTimeout(600);
                    const gal = v1.locator('a, button').filter({hasText: /^\s*Galleys\s*$/}).first();
                    if (await gal.count()) { await gal.click().catch(() => {}); await idle(page); await page.waitForTimeout(800); }
                }
                const i4 = await galleyInfo();
                await snap('ver-05-v1-via-menu', {info: i4});
                out.v1ViaMenu = {url: i4.url, headings: i4.headings, rows: (i4.tables[0] || {rows: []}).rows.map((r) => r.text)};
                const i5 = await openPage(edUrl(S.pb.id, gKey(S.pb.publicationId)), 'ver-06-v1-by-address');
                out.v1ByAddress = (i5.tables[0] || {rows: []}).rows.map((r) => r.text);
            }
            record('versions-summary', out);
            log('[versions]', JSON.stringify(out).slice(0, 3000));
            markDone('versions');
        });

        // =========================================================================================
        // Phase stage: Rule 12 (q16) on OJS: the Editor (unassigned, manager level) and the assigned Section Editor
        // on an article in Review (rv) and in Submission (sb).
        if (on('stage') && isOJS && !done('stage')) await sect('stage', async () => {
            const out = {};
            for (const w of ['ed', 'se', 'le']) {
                await signInAs(u[w]);
                for (const k of ['rv', 'sb']) {
                    const i0 = await openPage(edUrl(S[k].id), `stage-${w}-${k}-landing`, {waitRows: false});
                    const i1 = await openPage(edUrl(S[k].id, gKey(S[k].publicationId)), `stage-${w}-${k}-galleys`);
                    out[`${w}-${k}`] = {landingNav: i0.nav, galleysInNav: i0.nav.includes('Galleys'), url: i1.url, headings: i1.headings, tables: i1.tables.map((t) => ({label: t.label, controls: t.controls, rows: t.rows.map((r) => r.text)})), text: flat(i1.text, 300)};
                }
            }
            await signInAs(u.ed);
            await openPage(edUrl(S.rv.id, gKey(S.rv.publicationId)));
            out.edAddRv = await addGalley('PDF', PDF, 'stage-10-ed-rv-add');
            await openPage(edUrl(S.rv.id, gKey(S.rv.publicationId)), 'stage-11-ed-rv-after');
            out.edRvRows = (await orderInfo()).rows;
            await signInAs(u.se);
            await openPage(edUrl(S.sb.id, gKey(S.sb.publicationId)));
            out.seAddSb = await addGalley('PDF', PDF, 'stage-12-se-sb-add');
            await openPage(edUrl(S.sb.id, gKey(S.sb.publicationId)), 'stage-13-se-sb-after');
            out.seSbRows = (await orderInfo()).rows;
            record('stage-summary', out);
            log('[stage]', JSON.stringify(out).slice(0, 3500));
            markDone('stage');
        });

        // =========================================================================================
        // Phase doi (OJS): a scratch journal D with galley DOIs ticked and a prefix; publish on screen; the DOIs page.
        if (on('doi') && isOJS && !done('doi')) await sect('doi', async () => {
            const out = {};
            if (!sc.D) {
                const t = tag('u46k1d');
                const ctx = await app.api.createContext({tag: t, context: {name: `U46 K1 DOI ${t}`, acronym: 'KDOI', contactName: 'K1 Contact', contactEmail: `${t}c@mail.test`},
                    users: [{username: `${t}mgr`, roles: ['manager']}, {username: `${t}au`, roles: ['author']}]});
                sc.D = {path: ctx.path || t, mgr: `${t}mgr`, au: `${t}au`}; save();
            }
            const D = sc.D.path;
            await signInAs(sc.D.mgr, D);
            await page.goto(ctxUrl('/management/settings/distribution', D)); await idle(page);
            await page.getByRole('tab', {name: 'DOIs', exact: true}).first().click().catch(() => {});
            await idle(page); await page.waitForTimeout(800);
            await snap('doi-01-settings');
            out.types = await page.locator('input[name="enabledDoiTypes"]').evaluateAll((els) => els.map((e) => `${e.value}:${e.checked}`)).catch(() => []);
            await page.locator('input[name="enabledDoiTypes"][value="representation"]').check({force: true}).catch((e) => { out.tickErr = String(e.message).slice(0, 100); });
            await page.locator('input[name="doiPrefix"]').fill('10.99999').catch((e) => { out.prefixErr = String(e.message).slice(0, 100); });
            out.creationTime = await page.locator('select[name="doiCreationTime"]').inputValue().catch(() => null);
            const form = page.locator('form').filter({has: page.locator('input[name="doiPrefix"]')}).first();
            await form.getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            out.typesAfter = await page.locator('input[name="enabledDoiTypes"]').evaluateAll((els) => els.map((e) => `${e.value}:${e.checked}`)).catch(() => []);
            await snap('doi-02-settings-saved');
            if (!sc.dx) {
                const r = await app.api.createSubmission({tag: `${sc.D.au}dx`, context: D, submitter: sc.D.au, title: `K1 DX ${sc.D.au}`,
                    decisions: ['skipExternalReview', 'sendToProduction'], galleys: [{label: 'PDF', file: 'article.pdf'}]});
                sc.dx = {id: r.submissionId, publicationId: r.publicationId, galleys: r.galleys}; save();
            }
            const readDois = async (name) => {
                await page.goto(ctxUrl('/dois', D)); await idle(page); await page.waitForTimeout(1000);
                const exp = page.getByRole('button', {name: /View more details|Expand|details/i});
                const n = await exp.count();
                for (let i = 0; i < n; i++) await exp.nth(i).click().catch(() => {});
                await page.waitForTimeout(600);
                const s = await snap(name);
                return flat(s.text && s.text.main, 1500);
            };
            out.doisBefore = await readDois('doi-03-dois-before');
            await openPage(edUrl(sc.dx.id, `publication_${sc.dx.publicationId}_titleAbstract`, D), null, {waitRows: false});
            out.publish = await publishNow();
            out.doisAfter = await readDois('doi-04-dois-after');
            // the galley's DOI as the galley window shows it
            await openPage(edUrl(sc.dx.id, gKey(sc.dx.publicationId), D), 'doi-05-galleys');
            record('doi-summary', out);
            log('[doi]', JSON.stringify(out).slice(0, 3500));
            markDone('doi');
        });

        // =========================================================================================
        // Phase remote (sweep): the remote row's "Change File" completed, on a published remote galley.
        if (on('remote') && !done('remote')) await sect('remote', async () => {
            const out = {};
            if (!S.rm) {
                const r = await app.api.createSubmission({tag: `${sc.t}rm`, context: sc.T, submitter: u.au, title: `K1 RM Quokkarium ${sc.t}`,
                    ...(isOPS ? {participants: [{username: u.se, role: 'sectionEditor'}]} : {decisions: ['skipExternalReview', 'sendToProduction'], participants: [{username: u.se, role: 'sectionEditor'}]}),
                    galleys: [{label: 'Remote', locale: 'en', urlRemote: 'https://example.org/u46/rm.pdf'}], published: true});
                S.rm = {id: r.submissionId, publicationId: r.publicationId, galleys: r.galleys}; sc.subs = S; save();
            }
            await signOut(page).catch(() => {});
            out.readerBefore = await readerLinks(ctxUrl(readerPath(S.rm.id)), 'remote-01-landing-before');
            await signInAs(u.mgr);
            const url = edUrl(S.rm.id, gKey(S.rm.publicationId));
            await openPage(url, 'remote-02-page');
            await openRowMenu('Remote'); await pickItem('Change File');
            await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}).catch(() => {});
            await wizUpload(PDF);
            const i = await openPage(url, 'remote-03-after-changefile');
            out.row = (i.tables[0] || {rows: []}).rows.map((r) => ({text: r.text, nameLink: r.nameLink}));
            const m = await openRowMenu('Remote'); out.menuAfter = m.items; await closeMenu();
            out.edit = await (async () => {
                await openRowMenu('Remote'); await pickItem('Edit'); await waitWindow();
                const win = topWin();
                const r = {remoteBox: await win.locator('input[name="remotelyHostedContent"]').isChecked().catch(() => null), urlRemote: await win.locator('input[name="urlRemote"]').inputValue().catch(() => null)};
                await snap('remote-04-edit-window', r);
                await closeTop();
                return r;
            })();
            await signOut(page).catch(() => {});
            out.readerAfter = await readerLinks(ctxUrl(readerPath(S.rm.id)), 'remote-05-landing-after');
            const l = (out.readerAfter.links || [])[0];
            if (l) {
                const r = await page.request.get(app.url(`/index.php${l.href}`), {maxRedirects: 0}).catch((e) => ({err: String(e.message).slice(0, 100)}));
                out.hop = r.status ? {status: r.status(), location: r.headers().location || null} : r;
            }
            record('remote-summary', out);
            log('[remote]', JSON.stringify(out).slice(0, 2500));
            markDone('remote');
        });

        // =========================================================================================
        // Phase a5:the Contributors list's ordering arrows next to the galleys' (A5).
        if (on('a5')) await sect('a5', async () => {
            const out = {};
            await signInAs(u.mgr);
            await openPage(edUrl(S.dl.id, `publication_${S.dl.publicationId}_contributors`), 'a5-01-contributors', {waitRows: false});
            const ob = wf().getByRole('button', {name: 'Order', exact: true}).first();
            out.contribOrder = await ob.count();
            if (out.contribOrder) {
                await ob.click(); await page.waitForTimeout(500);
                out.contribArrows = await wf().locator('button').evaluateAll((els) => els.filter((b) => b.getClientRects().length).map((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label')})).filter((b) => /position|Increase|Decrease/i.test(`${b.aria} ${b.text}`))).catch(() => []);
                await snap('a5-02-contributors-order', {arrows: out.contribArrows});
                await wf().getByRole('button', {name: /^(Cancel|Save Order)$/}).first().click().catch(() => {});
            }
            await openPage(edUrl(S.g2.id, gKey(S.g2.publicationId)));
            await wf().getByRole('button', {name: 'Order', exact: true}).click(); await page.waitForTimeout(400);
            out.galleyArrows = await wf().locator('table tbody tr').evaluateAll((rows) => rows.map((tr) => [...tr.querySelectorAll('button')].map((b) => ({text: b.innerText.trim(), aria: b.getAttribute('aria-label'), title: b.getAttribute('title'), srOnly: [...b.querySelectorAll('.sr-only, .pkp_screen_reader, [class*="sr-only"]')].map((s) => s.textContent.trim())}))));
            // accessible names as the browser computes them
            out.galleyArrowAria = await page.accessibility ? null : null;
            const snapA = await page.locator(vis).first().locator('table').first().ariaSnapshot().catch(() => null);
            out.galleyTableAria = snapA && snapA.slice(0, 1500);
            await snap('a5-03-galleys-order', {arrows: out.galleyArrows});
            record('a5-summary', out);
            log('[a5]', JSON.stringify(out).slice(0, 2500));
        });
    } finally {
        record('js-dialogs', {jsDialogs});
        await close();
    }
});
