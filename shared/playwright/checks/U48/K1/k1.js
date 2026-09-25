// U48 claim check K1: the workflow "JATS XML" page (Purpose, Actors' JATS rows, Fields & validation, Rules 1–9,
// register A1, A6, A7, A10), OJS; OMP and OPS get the absence controls.
//   PROBE_FEATURE=U48 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U48/K1/k1.js
//   PHASES=seed,roles,stage1,minfo,a1,upload,binary,revise,generated,body,publish,versions,extra,bodytext,send,plugin,ctrl (default all, in that order: extra needs the version publish schedules; state in
//   .reports/U48/ccK1/k1-state-<app>.json, so a phase can be re-run alone; delete the state file to reseed)
// No assertions: every screen is recorded with screen() (+ PNG) and the facts go to k1-facts-<app>.json.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const T = 30_000;
const ALL = ['seed', 'roles', 'stage1', 'minfo', 'a1', 'upload', 'binary', 'revise', 'generated', 'body', 'publish', 'versions', 'extra', 'bodytext', 'send', 'plugin', 'ctrl'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k1]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const fx = (f) => path.join(REPO, `apps/ojs/playwright/fixtures/files/${f}`);
const own = (f) => path.join(__dirname, f);

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k1-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 3000)); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u48k1');
        S.t = t;
        const U = (p, k, role, g, f, extra = {}) => ({username: `${p}${k}`, roles: [role], givenName: g, familyName: f, ...extra});
        const ctxBase = (p, name) => ({name: `U48 K1 ${name} ${p}`, acronym: 'KONE', contactName: 'K1 Contact', contactEmail: `${p}c@mail.test`});
        const sub = async (ctx, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: ctx.path, submitter: ctx.u.au, title: `K1 ${k} Kestrel ${t}`, ...spec});
                log('seed', k, r.submissionId, r.publicationId, r.stageId, r.status);
                return {id: r.submissionId, pub: r.publicationId, stageId: r.stageId, status: r.status, jats: r.jats};
            } catch (e) { log('seed FAILED', k, String(e.message).slice(0, 700)); return {error: String(e.message).slice(0, 700)}; }
        };
        S.s = {};
        if (isOJS) {
            const p = `${t}j`;
            const keys = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Eda', 'Editor'], ['pe', 'productionEditor', 'Pat', 'Production'],
                ['se', 'sectionEditor', 'Sid', 'Section'], ['se0', 'sectionEditor', 'Sal', 'NoPerm'], ['ge', 'guestEditor', 'Gus', 'Guest'],
                ['ge1', 'guestEditor', 'Gia', 'GuestPerm'], ['le', 'layoutEditor', 'Lee', 'Layout'], ['le1', 'layoutEditor', 'Lia', 'LayoutPerm'],
                ['ce', 'copyeditor', 'Cec', 'Copyeditor'], ['fc', 'funding', 'Fay', 'Funding'], ['au', 'author', 'Ava', 'Author']];
            const r = await app.api.createContext({tag: p, context: ctxBase(p, 'journal'),
                users: keys.map(([k, role, g, f]) => U(p, k, role, g, f, k === 'au' ? {affiliation: 'Kestrel University'} : {})),
                issues: [{volume: 1, number: 1, year: 2027}]});
            S.J = {path: r.path || p, u: Object.fromEntries(keys.map(([k]) => [k, `${p}${k}`])), roles: Object.fromEntries(keys.map(([k, role]) => [k, role]))};
            save();
            const J = S.J;
            const P = (k, can) => ({username: J.u[k], role: J.roles[k], ...(can === undefined ? {} : {canChangeMetadata: can})});
            const prod = {decisions: ['skipExternalReview', 'sendToProduction']};
            const all = [P('se'), P('se0', false), P('ge'), P('ge1', true), P('le'), P('le1', true), P('pe'), P('ce')];
            S.s.P = await sub(J, 'P', {...prod, participants: all, jats: {file: 'article.xml'}});
            S.s.R = await sub(J, 'R', {decisions: ['sendExternalReview'], participants: [P('fc'), P('se')], jats: {file: 'article.xml'}});
            S.s.R0 = await sub(J, 'R0', {decisions: ['sendExternalReview'], participants: [P('fc')]});
            S.s.G = await sub(J, 'G', {...prod, abstract: '<p>Kestrel abstract intro.</p><ul><li>First kestrel item</li><li>Second kestrel item</li></ul>',
                citationsRaw: ['Kestrel, A. (2020). First kestrel reference. Journal of Birds, 1(1), 1-2.', 'Falcon, B. (2021). Second kestrel reference. Raptor Studies, 2(3), 4-5.'],
                dataCitations: [{title: 'Kestrel dataset', relationshipType: 'supporting', repository: 'Zenodo', year: 2024}]});
            S.s.H = await sub(J, 'H', {...prod, galleys: [{label: 'HTML', file: 'article.html'}]});
            S.s.F = await sub(J, 'F', {...prod, galleys: [{label: 'PDF', file: 'article.pdf'}]});
            S.s.U1 = await sub(J, 'U1', {...prod, participants: [P('le')]});
            S.s.U2 = await sub(J, 'U2', prod);
            S.s.PUB = await sub(J, 'PUB', {...prod, participants: [P('se'), P('le')], jats: {file: 'article.xml', makePublic: true}, galleys: [{label: 'PDF', file: 'article.pdf'}]});
            S.s.SP = await sub(J, 'SP', {...prod, participants: [P('se')], jats: {file: 'article.xml', makePublic: true}, published: true});
            S.s.SCH = await sub(J, 'SCH', {...prod, participants: [P('se')], jats: {file: 'article.xml'}});
            S.s.V1 = await sub(J, 'V1', {...prod, galleys: [{label: 'PDF', file: 'article.pdf'}], published: true});
            S.s.V2 = await sub(J, 'V2', {...prod, galleys: [{label: 'HTML', file: 'article.html'}], published: true});
            S.s.B = await sub(J, 'B', {...prod, citationsRaw: ['Kestrel, A. (2020). Body reference one.', 'Falcon, B. (2021). Body reference two.']});
            S.s.H2 = await sub(J, 'H2', prod);
            // a journal with the JATS Template Plugin off (Rule 7's "cannot be produced" end)
            const q = `${t}q`;
            try {
                const r2 = await app.api.createContext({tag: q, context: ctxBase(q, 'plugin-off'), plugins: {jatstemplateplugin: {enabled: false}},
                    users: [U(q, 'mgr', 'manager', 'Mira', 'Manager'), U(q, 'au', 'author', 'Ava', 'Author')]});
                S.Q = {path: r2.path || q, u: {mgr: `${q}mgr`, au: `${q}au`}};
                S.s.Q = await sub(S.Q, 'Q', prod);
            } catch (e) { S.Qerr = String(e.message).slice(0, 600); log('plugin-off ctx FAILED', S.Qerr); }
        } else {
            const p = `${t}x`;
            const r = await app.api.createContext({tag: p, context: ctxBase(p, app.name), users: [U(p, 'mgr', 'manager', 'Mira', 'Manager'), U(p, 'au', 'author', 'Ava', 'Author')]});
            S.X = {path: r.path || p, u: {mgr: `${p}mgr`, au: `${p}au`}};
            S.s.X = await sub(S.X, 'X', {decisions: app.name === 'ops' ? [] : ['skipExternalReview', 'sendToProduction'], published: false});
            S.s.XP = await sub(S.X, 'XP', {published: true});
        }
        S.seeded = true;
        save();
        fact('seed', S);
    }
    if (!S.seeded) { log('not seeded'); return; }

    const {page, close} = await launch(app);
    const jsDialogs = [];
    let dialogMode = 'accept';
    page.on('dialog', (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200), '->', dialogMode);
        (dialogMode === 'dismiss' && d.type() !== 'beforeunload' ? d.dismiss() : d.accept()).catch(() => {});
    });
    const dialogsSince = (t0) => jsDialogs.filter((d) => d.at >= t0).map((d) => `${d.type}: ${d.message}`);
    const resps = [];
    page.on('response', (r) => {
        const m = r.request().method();
        const u = r.url();
        if (m !== 'GET' || r.status() >= 400 || /\/jats|\/bodyText/.test(u)) resps.push({at: Date.now(), m, s: r.status(), url: u.replace(/^.*\/index\.php/, '').slice(0, 200)});
    });
    const respsSince = (t0) => resps.filter((p) => p.at >= t0).map((p) => `${p.m} ${p.s} ${p.url}`);
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, .pkp_notification, .ui-pnotify, [class*="toast"], [class*="Toast"], [data-sonner-toast]').forEach((e) => {
                const t = (e.innerText || '').trim();
                if (t && !seen.has(e)) { seen.add(e); window.__notices.push({t: t.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const noticesSince = async (t0) => page.evaluate((x) => (window.__notices || []).filter((n) => n.at >= x).map((n) => n.t), t0).catch(() => []);

    async function snap(name, extra = {}) {
        let sc;
        try { sc = await screen(page); } catch (e) { sc = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(sc, extra);
        record(name, sc);
        await shot(page, name).catch(() => {});
        return sc;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    const wfUrl = (ctx, sid, key, author) => app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${sid}${key ? `&workflowMenuKey=${key}` : ''}`);
    const vis = '[role="dialog"]:visible';
    const wf = () => page.locator(vis).first();
    const jp = () => page.locator('.jatsPanel').first();

    // The workflow menu, every entry (label, level) in DOM order.
    async function menu() {
        return page.evaluate(() => {
            const v = (e) => e && e.getClientRects().length > 0;
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
            const nav = dlg.querySelector('nav') || dlg;
            return [...nav.querySelectorAll('a')].map((a) => {
                const c = a.className || '';
                let level = 1;
                if (/!px-(7|9)\b/.test(c)) level = 2;
                if (/!px-(10|12)\b/.test(c)) level = 3;
                if (/!px-(14|16)\b/.test(c)) level = 4;
                return `${'>'.repeat(level - 1)}${f(a.textContent)}${v(a) ? '' : '(hidden)'}`;
            }).filter((x) => x.replace(/[>()]|hidden/g, ''));
        }).catch((e) => [`error ${e.message}`]);
    }
    // Unfold every version node so its pages are listed.
    async function unfoldVersions() {
        const nodes = page.locator(`${vis} nav a`).filter({hasText: /^\s*Version\b/});
        const n = await nodes.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
            const a = nodes.nth(i);
            const exp = await a.getAttribute('aria-expanded').catch(() => null);
            if (exp === 'false' || exp === null) { await a.click().catch(() => {}); await sleep(300); }
        }
    }

    // The "JATS XML" page as data.
    async function jatsInfo() {
        await Promise.race([
            page.locator('.jatsPanel .filePanel__ready').waitFor({state: 'visible', timeout: T}),
            page.getByText(/not have access|not allowed|not authorized|Error/i).first().waitFor({timeout: T}),
        ]).catch(() => {});
        await idle(page); await sleep(300);
        return page.evaluate(() => {
            const v = (e) => e && e.getClientRects().length > 0;
            const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
            const p = document.querySelector('.jatsPanel');
            const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
            const h2 = [...dlg.querySelectorAll('.pkp-modal-scroll-container h2, main h2, h2')].filter(v).map((h) => f(h.textContent)).slice(0, 3);
            if (!p || !v(p)) return {present: false, heading: h2, text: f(dlg.innerText).slice(-800), url: location.href.replace(/^.*\/index\.php/, '')};
            const header = p.querySelector('.filePanel__header');
            const btns = header ? [...header.querySelectorAll('button')].filter(v).map((b) => `${f(b.innerText)}${b.disabled ? '[disabled]' : ''}`) : [];
            const cb = p.querySelector('input[type=checkbox]');
            const code = p.querySelector('.filePanel__fileContent');
            const codeEl = code && code.querySelector('pre, code');
            const coloured = code ? code.querySelectorAll('span[class]').length : 0;
            const editable = code ? !!code.querySelector('textarea, [contenteditable=true], input') : null;
            const foot = p.querySelector('.filePanel__defaultContentFooter, .filePanel__fileContentFooter');
            return {
                present: true, heading: h2, boxHeading: f(p.querySelector('h2')?.textContent),
                buttons: btns,
                box: cb ? {label: f(cb.closest('label')?.innerText || cb.getAttribute('aria-label')), checked: cb.checked, disabled: cb.disabled} : null,
                footer: foot ? f(foot.innerText) : null,
                xmlHead: code ? f(code.innerText).slice(0, 600) : null,
                xml: code ? code.innerText : null,
                coloured, editable, codeTag: codeEl ? codeEl.tagName : null,
                url: location.href.replace(/^.*\/index\.php/, ''),
            };
        }).catch((e) => ({error: String(e.message)}));
    }
    async function openJats(ctx, sid, pid, name, {author, extra = {}} = {}) {
        const t0 = Date.now();
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_jats`, author));
        await idle(page);
        await sleep(300);
        const errBox = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
        const errOpen = await errBox.isVisible().catch(() => false);
        const info = await jatsInfo();
        if (errOpen) { info.errorWindow = flat(await errBox.innerText().catch(() => ''), 300); if (name) await snap(`${name}-error`, {jats: strip(info)}); await closeError(); }
        await unfoldVersions();
        info.menu = await menu();
        info.resps = respsSince(t0).filter((x) => !/^GET 200/.test(x) || /jats/.test(x)).slice(0, 12);
        const xml = info.xml; delete info.xml;
        if (name) await snap(name, {jats: info, ...extra});
        info.xml = xml;
        log(`[${name}]`, JSON.stringify({heading: info.heading, buttons: info.buttons, box: info.box, footer: info.footer, present: info.present}));
        return info;
    }
    const strip = (i) => { if (!i) return i; const {xml, ...rest} = i; return rest; };
    async function pressDownload() {
        const {captureDownload} = require(path.join(REPO, 'shared/playwright/pages/SubmissionFilesPages.js'));
        const t0 = Date.now();
        try {
            const {download, newTab} = await captureDownload(page, () => jp().getByRole('button', {name: 'Download', exact: true}).click(), {timeout: 20000});
            const fp = await download.path().catch(() => null);
            const head = fp ? fs.readFileSync(fp).slice(0, 200).toString('utf8') : null;
            return {name: download.suggestedFilename(), newTab, size: fp ? fs.statSync(fp).size : null, head: flat(head, 200), resps: respsSince(t0), dialogs: dialogsSince(t0)};
        } catch (e) {
            await idle(page);
            return {error: flat(e.message, 200), resps: respsSince(t0), notices: await noticesSince(t0), dialogs: dialogsSince(t0), url: page.url().replace(/^.*\/index\.php/, '')};
        }
    }
    async function upload(file) {
        const t0 = Date.now();
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', {timeout: 15000}),
            jp().getByRole('button', {name: 'Upload', exact: true}).click(),
        ]);
        const accept = await chooser.element().getAttribute('accept').catch(() => null);
        const resp = page.waitForResponse((r) => /\/jats(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await chooser.setFiles(file);
        const r = await resp;
        await idle(page); await sleep(1500);
        const info = await jatsInfo();
        const errDlg = await closeError();
        return {post: r ? r.status() : null, accept, multiple: chooser.isMultiple(), notices: await noticesSince(t0), resps: respsSince(t0), info: strip(info), xmlHead: info.xmlHead, errDlg};
    }
    // An "Error" window left open by a refused or failed call: its text, then "OK".
    async function closeError() {
        const err = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
        if (!(await err.isVisible().catch(() => false))) return null;
        const txt = flat(await err.innerText(), 300);
        await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await err.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(500);
        return txt;
    }
    async function moreInfo(name) {
        const t0 = Date.now();
        const all = [];
        const onResp = (r) => all.push(`${r.request().method()} ${r.status()} ${r.url().replace(/^.*\/index\.php/, '').slice(0, 160)}`);
        page.on('response', onResp);
        await jp().getByRole('button', {name: 'More Information', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({hasText: /Information Center/}).last();
        const opened = await dlg.waitFor({state: 'visible', timeout: 20000}).then(() => true).catch(() => false);
        await idle(page); await sleep(800);
        const out = {opened, resps: respsSince(t0), notices: await noticesSince(t0)};
        if (opened) {
            out.title = await dlg.evaluate((d) => { const l = d.getAttribute('aria-labelledby'); return d.getAttribute('aria-label') || (l && document.getElementById(l)?.innerText.trim()) || d.querySelector('h1')?.innerText.trim(); }).catch(() => null);
            out.tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
            const hist = dlg.getByRole('tab', {name: 'History', exact: true});
            if (await hist.count()) {
                await hist.click().catch(() => {});
                await dlg.locator('tr.gridRow, tr.empty, .pkp_helpers_text_center').first().waitFor({state: 'visible', timeout: 10000}).catch(() => {});
                await idle(page); await sleep(800);
            }
            out.history = await dlg.locator('tr.gridRow').evaluateAll((rs) => rs.map((r) => (r.innerText || '').replace(/\s+/g, ' ').trim())).catch(() => []);
            out.text = flat(await dlg.innerText().catch(() => ''), 900);
            out.allResps = all.filter((x) => !/\.(js|css|png|svg|woff2?)(\?|$)/.test(x)).slice(0, 20);
            out.dialogs = dialogsSince(t0);
            const notesTab = dlg.getByRole('tab', {name: 'Notes', exact: true});
            if (await notesTab.count()) {
                await notesTab.click().catch(() => {}); await idle(page); await sleep(1000);
                out.notesText = flat(await dlg.getByRole('tabpanel').last().innerText().catch(() => ''), 300);
            }
            page.off('response', onResp);
            if (name) await snap(name, {info: out});
            const t1 = Date.now();
            await dlg.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await idle(page); await sleep(1200);
            out.afterClose = respsSince(t1).filter((x) => /jats/.test(x));
        } else {
            out.text = flat(await page.locator(vis).last().innerText().catch(() => ""), 600); page.off("response", onResp);
            if (name) await snap(name, {info: out});
        }
        return out;
    }
    const boxLabel = () => jp().getByText('Make available with publication', {exact: true});
    async function watchBox() {
        await page.evaluate(() => {
            const cb = document.querySelector('.jatsPanel input[type=checkbox]');
            window.__boxLog = [];
            if (!cb) return;
            new MutationObserver(() => window.__boxLog.push({d: cb.disabled, c: cb.checked, at: Date.now()})).observe(cb, {attributes: true});
        }).catch(() => {});
    }
    async function toggleBox(answer, name) {
        const t0 = Date.now();
        await watchBox();
        const before = (await jatsInfo()).box;
        await boxLabel().click();
        const dlg = page.getByRole('dialog').filter({hasText: /JATS XML Download/}).last();
        const opened = await dlg.waitFor({state: 'visible', timeout: 10000}).then(() => true).catch(() => false);
        const out = {before, opened};
        if (opened) {
            out.dialog = flat(await dlg.innerText(), 400);
            out.dialogButtons = await dlg.getByRole('button').allInnerTexts().catch(() => []);
            out.boxWhileOpen = (await jatsInfo()).box;
            if (name) await snap(`${name}-dialog`, {toggle: out});
            await dlg.getByRole('button', {name: answer, exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        }
        await idle(page); await sleep(2000);
        out.after = (await jatsInfo()).box;
        out.boxLog = await page.evaluate(() => window.__boxLog || []).catch(() => []);
        out.resps = respsSince(t0); out.notices = await noticesSince(t0); out.dialogs = dialogsSince(t0);
        out.errorsOnScreen = await page.locator('[role=alert]:visible, .pkp_notification:visible, [role=dialog]:visible').evaluateAll((es) => es.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 200))).catch(() => []);
        if (name) await snap(`${name}-after`, {toggle: out});
        const err = page.getByRole('dialog').filter({hasText: /^\s*Error/}).last();
        if (await err.isVisible().catch(() => false)) {
            out.errorDialog = flat(await err.innerText(), 200);
            await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await err.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await sleep(1500);
            out.afterOk = (await jatsInfo()).box;
            if (name) await snap(`${name}-after-ok`, {toggle: out});
        }
        return out;
    }
    async function reloadBox(ctx, sid, pid, name) {
        const i = await openJats(ctx, sid, pid, name);
        return i.box;
    }
    async function articleLinks(ctx, sid, name) {
        await page.goto(app.url(`/index.php/${ctx}/article/view/${sid}`)); await idle(page);
        const links = await page.locator('a').evaluateAll((as) => as.filter((a) => /JATS/i.test(a.innerText)).map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')})));
        if (name) await snap(name, {links});
        return links;
    }
    const xmlFacts = (xml) => {
        if (!xml) return null;
        const has = (re) => re.test(xml);
        const m = (re) => { const x = xml.match(re); return x ? flat(x[1] || x[0], 300) : null; };
        const bodyM = xml.match(/<body>([\s\S]*?)<\/body>/);
        return {
            journalTitle: m(/<journal-title>([\s\S]*?)<\/journal-title>/), issn: (xml.match(/<issn[^>]*>[^<]*<\/issn>/g) || []),
            publisher: m(/<publisher-name>([\s\S]*?)<\/publisher-name>/),
            subject: m(/<subj-group[\s\S]*?<subject>([\s\S]*?)<\/subject>/), articleTitle: m(/<article-title>([\s\S]*?)<\/article-title>/),
            contribs: (xml.match(/<contrib [\s\S]*?<\/contrib>/g) || []).map((c) => flat(c, 300)), aff: (xml.match(/<aff[\s\S]*?<\/aff>/g) || []).map((c) => flat(c, 200)),
            abstract: m(/<abstract[^>]*>([\s\S]*?)<\/abstract>/), abstractList: has(/<abstract[\s\S]*<list[\s\S]*<\/abstract>/), listType: m(/<list ([^>]*)>/),
            kwd: (xml.match(/<kwd>[\s\S]*?<\/kwd>/g) || []), license: m(/<license[^>]*>([\s\S]*?)<\/license>/) || m(/(<license[^>]*\/?>)/), permissions: has(/<permissions/),
            funding: m(/<funding-group>([\s\S]*?)<\/funding-group>/), issue: m(/<issue[^>]*>([\s\S]*?)<\/issue>/), volume: m(/<volume[^>]*>([\s\S]*?)<\/volume>/),
            pubDate: (xml.match(/<pub-date[\s\S]*?<\/pub-date>/g) || []).map((c) => flat(c, 150)),
            refs: (xml.match(/<ref [\s\S]*?<\/ref>|<ref>[\s\S]*?<\/ref>/g) || []).map((c) => flat(c, 200)),
            dataCit: (xml.match(/publication-type="data"/g) || []).length,
            body: bodyM ? flat(bodyM[1], 600) : null, bodyParas: bodyM ? (bodyM[1].match(/<p>/g) || []).length : 0,
            bodyEscapedTags: bodyM ? /&lt;/.test(bodyM[1]) : null, subArticle: has(/<sub-article/), length: xml.length,
        };
    };
    async function publishOnScreen(ctx, sid, pid) {
        const t0 = Date.now();
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_titleAbstract`)); await idle(page); await sleep(800);
        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
        const pub = new PublicationScreen(page, ctx);
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        if (await dontAssign.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false)) {
            await sleep(1500);
            await dontAssign.check();
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        const pr = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        const rr = await pr;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
        await idle(page);
        return {publish: rr && rr.status(), resps: respsSince(t0).filter((x) => !/^GET/.test(x)), notices: await noticesSince(t0)};
    }
    async function createNewVersion(name) {
        const link = wf().getByRole('link', {name: 'Create New Version', exact: true}).or(wf().getByRole('button', {name: 'Create New Version', exact: true})).first();
        await link.waitFor({state: 'visible', timeout: 15000}).catch(() => {});
        if (!(await link.isVisible().catch(() => false))) return {offered: false};
        await link.click();
        const w = page.getByRole('dialog').filter({has: page.locator('select[name="versionStage"]')}).last();
        await w.locator('select[name="versionStage"]').waitFor({state: 'visible', timeout: T});
        await idle(page); await sleep(1500);
        const stage = w.locator('select[name="versionStage"]');
        if (!(await stage.inputValue())) await stage.selectOption('VoR');
        const minor = w.locator('select[name="versionIsMinor"]');
        if (await minor.isVisible().catch(() => false)) { if (!(await minor.inputValue())) await minor.selectOption('false'); }
        if (name) await snap(`${name}-window`);
        const r = page.waitForResponse((x) => /\/publications\/\d+\/version/.test(x.url()) && x.request().method() === 'POST', {timeout: T}).catch(() => null);
        await w.getByRole('button', {name: 'Confirm', exact: true}).click();
        const resp = await r;
        let newPub = null;
        if (resp) { try { newPub = (await resp.json()).id; } catch (e) { /* none */ } }
        await w.waitFor({state: 'detached', timeout: T}).catch(() => {});
        await idle(page);
        return {offered: true, status: resp && resp.status(), newPub};
    }
    // Galleys page: add an HTML galley through "Add galley" + the upload wizard (U46 K3's path).
    const galleyForm = () => page.locator('form[id$="GalleyForm"]:visible').last();
    const wizard = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    async function addGalleyOnScreen(ctx, sid, pid, label, file) {
        const t0 = Date.now();
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_galleys`)); await idle(page); await sleep(800);
        const b = page.getByRole('button', {name: 'Add galley', exact: true}).first();
        if (!(await b.isVisible().catch(() => false))) return {offered: false};
        await b.click();
        await galleyForm().locator('input[name="label"]').waitFor({state: 'attached', timeout: T}); await idle(page); await sleep(400);
        await galleyForm().locator('[name="label"]').fill(label);
        await galleyForm().getByRole('button', {name: 'Save', exact: true}).last().click();
        await wizard().locator('input[type="file"]').waitFor({state: 'attached', timeout: T}); await idle(page);
        const g = wizard().locator('select[id^="genreId"]');
        if (await g.count() && await g.isVisible().catch(() => false)) await g.selectOption({label: 'Article Text'});
        await wizard().locator('input[type="file"]').setInputFiles(file);
        const cont = wizard().getByRole('button', {name: 'Continue', exact: true});
        for (let i = 0; i < 150 && !(await cont.isEnabled().catch(() => false)); i++) await sleep(200);
        for (const n of [2, 3]) {
            await cont.click();
            await wizard().getByRole('tab', {name: new RegExp(`^${n}\\.`)}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: T}).catch(() => {});
            await idle(page);
        }
        await wizard().getByRole('button', {name: 'Complete', exact: true}).click();
        await wizard().waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page); await sleep(700);
        return {offered: true, resps: respsSince(t0).filter((x) => !/^GET/.test(x)).slice(0, 12)};
    }
    async function deleteGalleyOnScreen(ctx, sid, pid, label) {
        const t0 = Date.now();
        await page.goto(wfUrl(ctx, sid, `publication_${pid}_galleys`)); await idle(page); await sleep(800);
        const row = page.locator('[data-cy="galley-manager"] tbody tr').filter({hasText: label}).first();
        await row.waitFor({timeout: 20000});
        await row.getByRole('button', {name: /More Actions/}).first().click(); await sleep(300);
        await page.getByRole('menuitem', {name: 'Delete', exact: true}).first().click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you wish to delete this item?'}).last();
        await dlg.waitFor({timeout: 15000});
        await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        await sleep(1500); await idle(page);
        return {resps: respsSince(t0).filter((x) => !/^GET/.test(x))};
    }

    const J = S.J; const s = S.s || {};
    try {
        // ============================================================ roles: who sees what on "JATS XML" (Actors 33–51, Rule 8 unpublished end)
        if (on('roles') && isOJS) await sect('roles', async () => {
            const out = {};
            for (const k of ['admin', 'mgr', 'ed', 'pe', 'se', 'se0', 'ge', 'ge1', 'le', 'le1', 'ce']) {
                await sect(`roles-${k}`, async () => {
                    await as(k === 'admin' ? 'admin' : J.u[k], J.path);
                    const i = await openJats(J.path, s.P.id, s.P.pub, `roles-P-${k}`);
                    out[k] = strip(i);
                    if (k === 'le' || k === 'ce') {
                        out[`${k}.download`] = await pressDownload();
                        if ((i.buttons || []).some((b) => /^More Information/.test(b))) out[`${k}.moreInfo`] = await moreInfo(`roles-P-${k}-moreinfo`);
                    }
                });
            }
            // The Funding Coordinator on a submission in Review (d1): uploaded file, then the generated XML.
            await sect('roles-fc', async () => {
                await as(J.u.fc, J.path);
                const i = await openJats(J.path, s.R.id, s.R.pub, 'roles-R-fc');
                out.fcR = strip(i);
                out['fcR.download'] = await pressDownload();
                await snap('roles-R-fc-after-download', {dl: out['fcR.download']});
                const i2 = await openJats(J.path, s.R.id, s.R.pub, null);
                if (i2.buttons.some((b) => /^More Information/.test(b))) out['fcR.moreInfo'] = await moreInfo('roles-R-fc-moreinfo');
                const i3 = await openJats(J.path, s.R0.id, s.R0.pub, 'roles-R0-fc');
                out.fcR0 = strip(i3);
                out['fcR0.download'] = await pressDownload();
                // Body Text by address on the Review submission (no Production access)
                await page.goto(wfUrl(J.path, s.R.id, `publication_${s.R.pub}_bodyText`)); await idle(page); await sleep(1500);
                out.fcBodyTextByUrl = flat((await snap('roles-R-fc-bodytext-url')).text?.dialog, 600);
            });
            // The section editor on the same Review submission (the "any stage" end)
            await sect('roles-seR', async () => {
                await as(J.u.se, J.path);
                out.seR = strip(await openJats(J.path, s.R.id, s.R.pub, 'roles-R-se'));
            });
            // The author: the workflow as the author sees it, and the JATS page typed by address
            await sect('roles-au', async () => {
                await as(J.u.au, J.path);
                await page.goto(wfUrl(J.path, s.P.id, null, true)); await idle(page); await sleep(800);
                await unfoldVersions();
                out.auMenu = await menu();
                await snap('roles-P-au-workflow', {menu: out.auMenu});
                out.auJatsUrl = strip(await openJats(J.path, s.P.id, s.P.pub, 'roles-P-au-jats-url', {author: true}));
                out.auJatsUrlEditorial = strip(await openJats(J.path, s.P.id, s.P.pub, 'roles-P-au-jats-url-editorial'));
            });
            fact('roles', out);
        });

        // ============================================================ stage1: a submission still in the Submission stage (the "any stage" end of line 34)
        if (on('stage1') && isOJS) await sect('stage1', async () => {
            const out = {};
            if (!s.S1) {
                const r = await app.api.createSubmission({tag: `${S.t}S1`, context: J.path, submitter: J.u.au, title: `K1 S1 Kestrel ${S.t}`, participants: [{username: J.u.se, role: 'sectionEditor'}]});
                s.S1 = {id: r.submissionId, pub: r.publicationId, stageId: r.stageId}; save();
            }
            for (const k of ['mgr', 'se']) {
                await as(J.u[k], J.path);
                const i = await openJats(J.path, s.S1.id, s.S1.pub, `stage1-${k}`);
                out[k] = {present: i.present, buttons: i.buttons, box: i.box, footer: i.footer, menu: i.menu};
            }
            fact('stage1', out);
        });

        // ============================================================ minfo: "More Information" per level (Rule 6, d1), History tab read to the end
        if (on('minfo') && isOJS) await sect('minfo', async () => {
            const out = {};
            for (const k of ['mgr', 'se', 'pe', 'le', 'le1', 'ge']) {
                await sect(`minfo-${k}`, async () => {
                    await as(J.u[k], J.path);
                    await openJats(J.path, s.P.id, s.P.pub, null);
                    out[k] = await moreInfo(`minfo-P-${k}`);
                });
            }
            await sect('minfo-fc', async () => {
                await as(J.u.fc, J.path);
                await openJats(J.path, s.R.id, s.R.pub, null);
                out.fc = await moreInfo('minfo-R-fc');
            });
            fact('minfo', out);
        });

        // ============================================================ a1: the tick box for those who may not edit (A1, d2) + the manager's control
        if (on('a1') && isOJS) await sect('a1', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            const st = await openJats(J.path, s.P.id, s.P.pub, null);
            if (st.box && st.box.checked) out.reset = await toggleBox('Confirm', null);
            for (const k of ['le', 'ge', 'se0']) {
                await sect(`a1-${k}`, async () => {
                    await as(J.u[k], J.path);
                    const i = await openJats(J.path, s.P.id, s.P.pub, `a1-${k}-open`);
                    out[k] = {open: {buttons: i.buttons, box: i.box}};
                    if (!i.box || i.box.disabled) return;
                    out[k].tick = await toggleBox('Confirm', `a1-${k}-tick`);
                    out[k].reload = await reloadBox(J.path, s.P.id, s.P.pub, `a1-${k}-reload`);
                });
            }
            await sect('a1-mgr', async () => {
                await as(J.u.mgr, J.path);
                await openJats(J.path, s.P.id, s.P.pub, 'a1-mgr-open');
                out.mgr = {};
                out.mgr.tickCancel = await toggleBox('Cancel', 'a1-mgr-tick-cancel');
                out.mgr.tickConfirm = await toggleBox('Confirm', 'a1-mgr-tick-confirm');
                out.mgr.reload1 = await reloadBox(J.path, s.P.id, s.P.pub, 'a1-mgr-reload1');
                out.mgr.untickCancel = await toggleBox('Cancel', 'a1-mgr-untick-cancel');
                out.mgr.untickConfirm = await toggleBox('Confirm', 'a1-mgr-untick-confirm');
                out.mgr.reload2 = await reloadBox(J.path, s.P.id, s.P.pub, 'a1-mgr-reload2');
            });
            // the unticked-then-refused end: tick as manager, then untick as the layout editor
            await sect('a1-le-untick', async () => {
                await as(J.u.mgr, J.path);
                await openJats(J.path, s.P.id, s.P.pub, null);
                out.mgrTickAgain = await toggleBox('Confirm', null);
                await as(J.u.le, J.path);
                await openJats(J.path, s.P.id, s.P.pub, 'a1-le-untick-open');
                out.leUntick = await toggleBox('Confirm', 'a1-le-untick');
                out.leUntickReload = await reloadBox(J.path, s.P.id, s.P.pub, 'a1-le-untick-reload');
            });
            fact('a1', out);
        });

        // ============================================================ upload: any file (d4, A10), Download (d11), More Information, published link serving it
        if (on('upload') && isOJS) await sect('upload', async () => {
            const out = {};
            if (!s.UP) {
                const r = await app.api.createSubmission({tag: `${S.t}UP`, context: J.path, submitter: J.u.au, title: `K1 UP Kestrel ${S.t}`, decisions: ['skipExternalReview', 'sendToProduction'],
                    participants: [{username: J.u.le, role: 'layoutEditor'}]});
                s.UP = {id: r.submissionId, pub: r.publicationId}; save();
            }
            await as(J.u.mgr, J.path);
            const g0 = await openJats(J.path, s.UP.id, s.UP.pub, 'up-01-generated');
            out.generated = strip(g0);
            out.dlGenerated = await pressDownload();
            out.pubIdOnPage = s.UP.pub;
            out.txt = await upload(fx('not-an-image.txt'));
            await snap('up-02-after-txt', {up: out.txt});
            out.moreInfo = await moreInfo('up-04-moreinfo');
            out.afterMoreInfo = strip(await jatsInfo());
            out.dlUploaded = await pressDownload();
            // tick the box and publish the version on screen, then the article page's link serves the PNG
            out.tick = await toggleBox('Confirm', 'up-05-tick');
            out.publish = await sect('up-publish', () => publishOnScreen(J.path, s.UP.id, s.UP.pub));
            out.afterPublishMgr = strip(await openJats(J.path, s.UP.id, s.UP.pub, 'up-06-published-mgr'));
            out.constOnPage = await page.evaluate(() => ({STATUS_PUBLISHED: window.pkp?.const?.STATUS_PUBLISHED ?? null, STATUS_SCHEDULED: window.pkp?.const?.STATUS_SCHEDULED ?? null, SUBMISSION_FILE_JATS: window.pkp?.const?.SUBMISSION_FILE_JATS ?? null})).catch((e) => String(e.message));
            out.links = await articleLinks(J.path, s.UP.id, 'up-07-article');
            if (out.links.length) {
                const t0 = Date.now();
                const {captureDownload} = require(path.join(REPO, 'shared/playwright/pages/SubmissionFilesPages.js'));
                try {
                    const lr = page.waitForResponse((r) => /jats|download/i.test(r.url()) && r.request().method() === 'GET', {timeout: 20000}).catch(() => null);
                    const {download, newTab} = await captureDownload(page, () => page.locator('a').filter({hasText: /JATS/}).first().click(), {timeout: 20000});
                    const rr = await lr;
                    const fp = await download.path().catch(() => null);
                    const buf = fp ? fs.readFileSync(fp) : null;
                    out.linkServes = {name: download.suggestedFilename(), newTab, size: buf ? buf.length : null, png: buf ? buf.slice(1, 4).toString() === 'PNG' : null,
                        type: rr ? rr.headers()['content-type'] : null, status: rr ? rr.status() : null};
                } catch (e) {
                    out.linkServes = {error: flat(e.message, 200), url: page.url(), resps: respsSince(t0)};
                    await snap('up-08-article-link-followed', {serves: out.linkServes});
                }
            }
            // le assigned on U1 (no metadata permission) on the screen-published version
            await as(J.u.le, J.path);
            out.afterPublishLe = strip(await openJats(J.path, s.UP.id, s.UP.pub, 'up-09-published-le'));
            await as('admin', J.path);
            out.afterPublishAdmin = strip(await openJats(J.path, s.UP.id, s.UP.pub, 'up-10-published-admin'));
            fact('upload', out);
        });

        // ============================================================ binary: a PNG and a PDF as the first upload, and a PNG over a text file (A10's other end)
        if (on('binary') && isOJS) await sect('binary', async () => {
            const out = {};
            for (const k of ['U3', 'U4', 'U5']) {
                if (!s[k]) {
                    const r = await app.api.createSubmission({tag: `${S.t}${k}`, context: J.path, submitter: J.u.au, title: `K1 ${k} Kestrel ${S.t}`, decisions: ['skipExternalReview', 'sendToProduction']});
                    s[k] = {id: r.submissionId, pub: r.publicationId}; save();
                }
            }
            await as(J.u.mgr, J.path);
            await openJats(J.path, s.U3.id, s.U3.pub, 'bin-01-U3');
            out.pngFirst = await upload(fx('figure.png'));
            await snap('bin-02-U3-after-png', {up: out.pngFirst});
            out.pngReopen = strip(await openJats(J.path, s.U3.id, s.U3.pub, 'bin-03-U3-reopen'));
            out.pngReopen2 = strip(await openJats(J.path, s.U3.id, s.U3.pub, 'bin-04-U3-reopen-again'));
            out.pngDownload = await pressDownload();
            out.pngMoreInfo = await moreInfo('bin-04b-U3-moreinfo');
            await openJats(J.path, s.U4.id, s.U4.pub, null);
            out.pdfFirst = await upload(fx('article.pdf'));
            await snap('bin-05-U4-after-pdf', {up: out.pdfFirst});
            out.pdfReopen = strip(await openJats(J.path, s.U4.id, s.U4.pub, 'bin-06-U4-reopen'));
            await openJats(J.path, s.U5.id, s.U5.pub, null);
            out.txtThenPng = {txt: await upload(fx('not-an-image.txt'))};
            out.txtThenPng.png = await upload(fx('figure.png'));
            await snap('bin-07-U5-txt-then-png', {up: out.txtThenPng});
            out.txtThenPng.reopen = strip(await openJats(J.path, s.U5.id, s.U5.pub, 'bin-08-U5-reopen'));
            // the way back: "Delete" on the broken page, then an XML upload
            const del = jp().getByRole('button', {name: 'Delete', exact: true});
            if (await del.isVisible().catch(() => false)) {
                await del.click();
                const dlg = page.getByRole('dialog').filter({hasText: /Confirm deleting JATS XML/}).last();
                if (await dlg.waitFor({state: 'visible', timeout: 10000}).then(() => true).catch(() => false)) {
                    const t0 = Date.now();
                    await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click();
                    await idle(page); await sleep(2000);
                    out.deleteBroken = {resps: respsSince(t0), err: await closeError(), after: strip(await jatsInfo())};
                }
            } else out.deleteBroken = 'no Delete on screen';
            out.afterDeleteReopen = strip(await openJats(J.path, s.U5.id, s.U5.pub, 'bin-09-U5-after-delete'));
            fact('binary', out);
        });

        // ============================================================ revise: two XML uploads (d10), download names (d11), Delete (Rule 5)
        if (on('revise') && isOJS) await sect('revise', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            await openJats(J.path, s.U2.id, s.U2.pub, 'rev-01-generated');
            out.first = await upload(fx('article.xml'));
            await snap('rev-02-after-first', {up: out.first});
            out.dlFirst = await pressDownload();
            out.moreInfo1 = await moreInfo('rev-03-moreinfo-first');
            await sleep(1100);
            out.second = await upload(own('jats-second.xml'));
            await snap('rev-04-after-second', {up: out.second});
            out.moreInfo2 = await moreInfo('rev-05-moreinfo-second');
            out.dlSecond = await pressDownload();
            out.reopen = strip(await openJats(J.path, s.U2.id, s.U2.pub, 'rev-06-reopen'));
            // Delete: Cancel, then "Delete JATS File"
            const del = jp().getByRole('button', {name: 'Delete', exact: true});
            await del.click();
            let dlg = page.getByRole('dialog').filter({hasText: /Confirm deleting JATS XML/}).last();
            await dlg.waitFor({state: 'visible', timeout: 10000});
            out.deleteDialog = flat(await dlg.innerText(), 400);
            out.deleteButtons = await dlg.getByRole('button').allInnerTexts();
            await snap('rev-07-delete-dialog', {text: out.deleteDialog});
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).click();
            await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await idle(page); await sleep(800);
            out.afterCancel = strip(await jatsInfo());
            await snap('rev-08-after-cancel', {jats: out.afterCancel});
            await sleep(600);
            await page.evaluate(() => {
                window.__delLog = [];
                const b = [...document.querySelectorAll('.jatsPanel .filePanel__header button')].find((x) => x.innerText.trim() === 'Delete');
                if (b) new MutationObserver(() => window.__delLog.push({d: b.disabled, at: Date.now()})).observe(b, {attributes: true});
            });
            const t0 = Date.now();
            await del.click();
            dlg = page.getByRole('dialog').filter({hasText: /Confirm deleting JATS XML/}).last();
            await dlg.waitFor({state: 'visible', timeout: 10000});
            await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click();
            await idle(page); await sleep(2000);
            out.delLog = await page.evaluate(() => window.__delLog).catch(() => null);
            out.afterDelete = strip(await jatsInfo());
            out.deleteResps = respsSince(t0); out.deleteNotices = await noticesSince(t0);
            await snap('rev-09-after-delete', {jats: out.afterDelete});
            out.afterDeleteReopen = strip(await openJats(J.path, s.U2.id, s.U2.pub, 'rev-10-after-delete-reopen'));
            fact('revise', out);
        });

        // ============================================================ generated: what the XML carries (Rule 2, d7) and re-generation (Rule 1)
        if (on('generated') && isOJS) await sect('generated', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            const g = await openJats(J.path, s.G.id, s.G.pub, 'gen-01-G');
            out.G = {info: strip(g), facts: xmlFacts(g.xml)};
            fs.writeFileSync(path.join(outDir(), `gen-G-${app.name}.xml`), g.xml || '');
            // a metadata change on "Title & Abstract", then the page again (Rule 1)
            await page.goto(wfUrl(J.path, s.G.id, `publication_${s.G.pub}_titleAbstract`)); await idle(page); await sleep(1500);
            const title = page.locator(`${vis} [id*="title-control-en"], ${vis} input[name="title-en"]`).first();
            let changed = null;
            try {
                if (await title.count()) {
                    const tag = await title.evaluate((e) => e.tagName);
                    if (tag === 'INPUT') await title.fill(`K1 G Retitled ${S.t}`);
                    else { await title.click(); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.type(`K1 G Retitled ${S.t}`); }
                    const t0 = Date.now();
                    await page.locator(vis).getByRole('button', {name: 'Save', exact: true}).last().click();
                    await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).catch(() => {});
                    changed = respsSince(t0).filter((x) => !/^GET/.test(x));
                }
            } catch (e) { changed = `error ${flat(e.message, 200)}`; }
            out.titleSave = changed;
            await snap('gen-02-title-saved');
            // keywords on "Metadata"
            await page.goto(wfUrl(J.path, s.G.id, `publication_${s.G.pub}_metadata`)); await idle(page); await sleep(1500);
            await snap('gen-03-metadata');
            try {
                const kw = page.locator(`${vis} input[id*="keywords"]`).first();
                if (await kw.count()) {
                    await kw.fill('kestrelword'); await kw.press('Enter'); await sleep(800);
                    const t0 = Date.now();
                    await page.locator(vis).getByRole('button', {name: 'Save', exact: true}).last().click();
                    await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).catch(() => {});
                    out.kwSave = respsSince(t0).filter((x) => !/^GET/.test(x));
                } else out.kwSave = 'no keywords input';
            } catch (e) { out.kwSave = `error ${flat(e.message, 200)}`; }
            await snap('gen-04-metadata-saved');
            const g2 = await openJats(J.path, s.G.id, s.G.pub, 'gen-05-G-again');
            out.G2 = {facts: xmlFacts(g2.xml)};
            fs.writeFileSync(path.join(outDir(), `gen-G2-${app.name}.xml`), g2.xml || '');
            // the Funding page: what it offers
            await page.goto(wfUrl(J.path, s.G.id, `publication_${s.G.pub}_funding`)); await idle(page); await sleep(1500);
            out.fundingPage = flat((await snap('gen-06-funding')).text?.dialog, 800);
            // the published seed SP: license and pub-date
            const sp = await openJats(J.path, s.V1.id, s.V1.pub, 'gen-07-V1-published');
            out.SP = xmlFacts(sp.xml);
            fs.writeFileSync(path.join(outDir(), `gen-SP-${app.name}.xml`), sp.xml || '');
            fact('generated', out);
        });

        // ============================================================ extra: ISSNs, license, funder and an issue in the generated XML (Rule 2's remaining items)
        if (on('extra') && isOJS) await sect('extra', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            await sect('extra-issn', async () => {
                await page.goto(app.url(`/index.php/${J.path}/management/settings/context`)); await idle(page);
                const tab = page.getByRole('tab', {name: 'Masthead', exact: true}).first();
                await tab.waitFor({timeout: T});
                if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
                await page.locator('[id^="masthead-onlineIssn-control"]').first().waitFor({state: 'visible', timeout: T}); await idle(page); await sleep(1000);
                await page.locator('[id^="masthead-onlineIssn-control"]').first().fill('0378-5955');
                await page.locator('[id^="masthead-printIssn-control"]').first().fill('1050-124X');
                const c = page.locator('select[id^="masthead-country-control"]').first();
                if (await c.count() && !(await c.inputValue())) await c.selectOption({label: 'Iceland'});
                const f = page.locator('form').filter({has: page.locator('[id^="masthead-onlineIssn-control"]')}).first();
                const t0 = Date.now();
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).catch(() => {});
                out.issnSave = respsSince(t0).filter((x) => !/^GET/.test(x));
                await snap('ext-01-masthead-saved');
            });
            await sect('extra-license', async () => {
                await page.goto(wfUrl(J.path, s.G.id, `publication_${s.G.pub}_license`)); await idle(page); await sleep(1500);
                let sc = await snap('ext-02-permissions');
                const lic = page.locator(`${vis} input[id*="licenseUrl"]`).first();
                if (await lic.count()) {
                    await lic.fill('https://creativecommons.org/licenses/by/4.0/');
                    const t0 = Date.now();
                    await page.locator(vis).getByRole('button', {name: 'Save', exact: true}).last().click();
                    await page.locator('[role="status"]').filter({hasText: 'Saved'}).first().waitFor({timeout: 15000}).catch(() => {});
                    out.licSave = respsSince(t0).filter((x) => !/^GET/.test(x));
                    sc = await snap('ext-03-permissions-saved');
                } else out.licSave = `no licenseUrl input; page: ${flat(sc.text?.dialog, 300)}`;
            });
            await sect('extra-funder', async () => {
                const {FundingScreen, stubRegistrySearch} = require(path.join(app.suiteDir, 'pages', 'FundingPages.js'));
                await stubRegistrySearch(page);
                await page.goto(wfUrl(J.path, s.G.id, `publication_${s.G.pub}_funding`)); await idle(page); await sleep(1500);
                const fs2 = new FundingScreen(page);
                await fs2.addFunder('Kestrel Foundation', {grants: [{grantNumber: 'KF-42'}]});
                await snap('ext-04-funder-added');
                out.funder = 'added';
            });
            const g = await openJats(J.path, s.G.id, s.G.pub, 'ext-05-G-jats');
            out.G = xmlFacts(g.xml);
            fs.writeFileSync(path.join(outDir(), `ext-G-${app.name}.xml`), g.xml || '');
            // the scheduled version without its uploaded file: the issue in the generated XML
            await openJats(J.path, s.SCH.id, s.SCH.pub, null);
            if (await jp().getByRole('button', {name: 'Delete', exact: true}).isVisible().catch(() => false)) {
                await jp().getByRole('button', {name: 'Delete', exact: true}).click();
                const dlg = page.getByRole('dialog').filter({hasText: /Confirm deleting JATS XML/}).last();
                await dlg.waitFor({state: 'visible', timeout: 10000});
                await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click();
                await idle(page); await sleep(2000);
            }
            const sch = await openJats(J.path, s.SCH.id, s.SCH.pub, 'ext-06-SCH-generated');
            out.SCH = xmlFacts(sch.xml);
            fs.writeFileSync(path.join(outDir(), `ext-SCH-${app.name}.xml`), sch.xml || '');
            fact('extra', out);
        });

        // ============================================================ body: the full-text part (Rule 2a, A6 d9, A7 d8)
        if (on('body') && isOJS) await sect('body', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            const h = await openJats(J.path, s.H.id, s.H.pub, 'body-01-H-html');
            out.H = xmlFacts(h.xml); fs.writeFileSync(path.join(outDir(), `body-H-${app.name}.xml`), h.xml || '');
            const f = await openJats(J.path, s.F.id, s.F.pub, 'body-02-F-pdf');
            out.F = xmlFacts(f.xml);
            // two paragraphs + a heading, added on screen (A7's axis)
            out.H2add = await sect('body-H2-add', () => addGalleyOnScreen(J.path, s.H2.id, s.H2.pub, 'HTML', own('two-paras.html')));
            const h2 = await openJats(J.path, s.H2.id, s.H2.pub, 'body-03-H2-two-paras');
            out.H2 = xmlFacts(h2.xml); fs.writeFileSync(path.join(outDir(), `body-H2-${app.name}.xml`), h2.xml || '');
            // d9 part 1: V1 published with a PDF galley; new version; an HTML galley on the new version
            await sect('body-V1', async () => {
                await page.goto(wfUrl(J.path, s.V1.id, `publication_${s.V1.pub}_galleys`)); await idle(page); await sleep(800);
                const c = await createNewVersion('body-04-V1-create');
                out.V1create = c; s.V1.pub2 = c.newPub; save();
                if (c.newPub) {
                    out.V1add = await addGalleyOnScreen(J.path, s.V1.id, c.newPub, 'HTML', own('two-paras.html'));
                    await snap('body-05-V1-v2-galleys');
                    const v2 = await openJats(J.path, s.V1.id, c.newPub, 'body-06-V1-v2-jats');
                    out.V1v2 = xmlFacts(v2.xml);
                    const v1 = await openJats(J.path, s.V1.id, s.V1.pub, 'body-07-V1-v1-jats');
                    out.V1v1 = xmlFacts(v1.xml);
                }
            });
            // d9 part 2: V2 published with the HTML galley; new version; the new version's copy deleted
            await sect('body-V2', async () => {
                await page.goto(wfUrl(J.path, s.V2.id, `publication_${s.V2.pub}_galleys`)); await idle(page); await sleep(800);
                const c = await createNewVersion('body-08-V2-create');
                out.V2create = c; s.V2.pub2 = c.newPub; save();
                if (c.newPub) {
                    const a = await openJats(J.path, s.V2.id, c.newPub, 'body-09-V2-v2-jats-copied');
                    out.V2v2copied = xmlFacts(a.xml);
                    out.V2del = await deleteGalleyOnScreen(J.path, s.V2.id, c.newPub, 'HTML');
                    await snap('body-10-V2-v2-galleys-after-delete');
                    const b = await openJats(J.path, s.V2.id, c.newPub, 'body-11-V2-v2-jats-no-galley');
                    out.V2v2noGalley = xmlFacts(b.xml);
                }
            });
            fact('body', out);
        });

        // ============================================================ publish: Rule 8 on a screen-published and a scheduled version; Rule 9 on a published one
        if (on('publish') && isOJS) await sect('publish', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            out.pre = strip(await openJats(J.path, s.PUB.id, s.PUB.pub, 'pub-01-before'));
            out.publish = await sect('pub-publish', () => publishOnScreen(J.path, s.PUB.id, s.PUB.pub));
            await snap('pub-02-published-titleabstract');
            for (const [k, u] of [['mgr', J.u.mgr], ['admin', 'admin'], ['se', J.u.se], ['le', J.u.le]]) {
                await sect(`pub-${k}`, async () => {
                    await as(u, J.path);
                    const i = await openJats(J.path, s.PUB.id, s.PUB.pub, `pub-03-published-${k}`);
                    out[k] = strip(i);
                    if (k === 'se' && i.buttons.some((b) => /^More Information/.test(b))) out.seMoreInfo = await moreInfo('pub-04-published-se-moreinfo');
                });
            }
            await as(J.u.mgr, J.path);
            // the offered "Upload" used on the published version
            await openJats(J.path, s.PUB.id, s.PUB.pub, null);
            if (await jp().getByRole('button', {name: 'Upload', exact: true}).isVisible().catch(() => false)) {
                out.uploadOnPublished = await upload(own('jats-second.xml'));
                await snap('pub-04b-published-after-upload', {up: out.uploadOnPublished});
            }
            out.linksBefore = await articleLinks(J.path, s.PUB.id, 'pub-05-article-before');
            await openJats(J.path, s.PUB.id, s.PUB.pub, null);
            out.untick = await toggleBox('Confirm', 'pub-06-untick');
            out.linksAfterUntick = await articleLinks(J.path, s.PUB.id, 'pub-07-article-after-untick');
            await openJats(J.path, s.PUB.id, s.PUB.pub, null);
            out.tick = await toggleBox('Confirm', 'pub-08-tick');
            out.linksAfterTick = await articleLinks(J.path, s.PUB.id, 'pub-09-article-after-tick');
            // the seeded published version (the harness's case), for comparison
            out.SP = strip(await openJats(J.path, s.SP.id, s.SP.pub, 'pub-10-seed-published-mgr'));
            // the offered "Delete" used on the seeded published version
            if (await jp().getByRole('button', {name: 'Delete', exact: true}).isVisible().catch(() => false)) {
                const t0 = Date.now();
                await jp().getByRole('button', {name: 'Delete', exact: true}).click();
                const dlg = page.getByRole('dialog').filter({hasText: /Confirm deleting JATS XML/}).last();
                await dlg.waitFor({state: 'visible', timeout: 10000});
                await dlg.getByRole('button', {name: 'Delete JATS File', exact: true}).click();
                await idle(page); await sleep(2000);
                out.deleteOnPublished = {resps: respsSince(t0), err: await closeError(), after: strip(await jatsInfo())};
                await snap('pub-10b-seed-published-after-delete', {del: out.deleteOnPublished});
            }
            // scheduled on screen to the future issue
            await sect('pub-schedule', async () => {
                await page.goto(wfUrl(J.path, s.SCH.id, `publication_${s.SCH.pub}_titleAbstract`)); await idle(page); await sleep(800);
                const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                const pub = new PublicationScreen(page, J.path);
                await pub.scheduleToFutureIssue(/Vol\.? 1,? No\.? 1/);
                await idle(page);
                await snap('pub-11-scheduled-titleabstract');
            });
            const sc = await openJats(J.path, s.SCH.id, s.SCH.pub, 'pub-12-scheduled-mgr');
            out.SCH = strip(sc);
            out.SCHconst = await page.evaluate(() => ({STATUS_PUBLISHED: window.pkp?.const?.STATUS_PUBLISHED ?? null, STATUS_SCHEDULED: window.pkp?.const?.STATUS_SCHEDULED ?? null})).catch(() => null);
            await as(J.u.se, J.path);
            out.SCHse = strip(await openJats(J.path, s.SCH.id, s.SCH.pub, 'pub-13-scheduled-se'));
            fact('publish', out);
        });

        // ============================================================ versions: the box on a new version (Fields "unticked on every new version"), both pages per version (22)
        if (on('versions') && isOJS) await sect('versions', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            const v1 = await openJats(J.path, s.PUB.id, s.PUB.pub, 'ver-01-v1');
            out.v1 = {box: v1.box, buttons: v1.buttons, footer: v1.footer};
            const c = await createNewVersion('ver-02-create');
            out.create = c; s.PUB.pub2 = c.newPub; save();
            if (c.newPub) {
                const v2 = await openJats(J.path, s.PUB.id, c.newPub, 'ver-03-v2');
                out.v2 = strip(v2);
                out.v1again = strip(await openJats(J.path, s.PUB.id, s.PUB.pub, 'ver-04-v1-again'));
            }
            fact('versions', out);
        });

        // ============================================================ bodytext: the "Body Text" page's fields (73–89)
        if (on('bodytext') && isOJS) await sect('bodytext', async () => {
            const out = {};
            await as(J.u.mgr, J.path);
            const openBT = async (sub, pid, name) => {
                const t0 = Date.now();
                await page.goto(wfUrl(J.path, sub.id, `publication_${pid}_bodyText`)); await idle(page);
                await page.locator('.sciflow-body-text').waitFor({state: 'visible', timeout: T}).catch(() => {});
                await sleep(2500); await idle(page);
                const info = await page.evaluate(() => {
                    const v = (e) => e && e.getClientRects().length > 0;
                    const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
                    const root = document.querySelector('.sciflow-body-text');
                    if (!root) return {present: false};
                    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(v)[0] || document.body;
                    const h2 = [...dlg.querySelectorAll('.pkp-modal-scroll-container h2')].filter(v).map((h) => f(h.textContent)).slice(0, 2);
                    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}; };
                    const deep = (node, sel, acc = []) => { node.querySelectorAll(sel).forEach((e) => acc.push(e)); node.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) deep(e.shadowRoot, sel, acc); }); return acc; };
                    const fb = root.querySelector('sciflow-formatbar');
                    const tools = fb ? deep(fb.shadowRoot || fb, 'button, select, [role=button], [role=combobox]').filter(v).map((b) => f(b.getAttribute('aria-label') || b.getAttribute('title') || b.innerText || b.value) + (b.disabled ? '[disabled]' : '')) : [];
                    const ed = root.querySelector('sciflow-editor');
                    const edText = ed ? f((ed.shadowRoot ? ed.shadowRoot.textContent : ed.innerText)) : null;
                    const aside = root.querySelector('aside');
                    const sections = [...root.querySelectorAll('details')].map((d) => {
                        const inner = [...d.querySelectorAll('*')].map((e) => e.shadowRoot ? f(e.shadowRoot.textContent) : '').filter(Boolean).join(' | ');
                        return {key: d.dataset.sidebarSection, open: d.open, summary: f(d.querySelector('summary')?.innerText), text: f(d.innerText).slice(0, 400), shadow: inner.slice(0, 500)};
                    });
                    const saveRow = aside ? [...aside.querySelectorAll('button')].filter(v).map((b) => `${f(b.innerText)}${b.getAttribute('aria-pressed') ? `[pressed=${b.getAttribute('aria-pressed')}]` : ''}${b.disabled ? '[disabled]' : ''}`) : [];
                    const badge = root.querySelector('.sciflow-body-text__unsaved');
                    const conv = root.querySelector('.sciflow-body-text__main > :not(section):not(h2)');
                    return {present: true, heading: h2, asideLabel: aside?.getAttribute('aria-label'), panelTitle: f(root.querySelector('.sciflow-body-text__panel-title')?.innerText),
                        editorBox: r(root.querySelector('.sciflow-body-text__editor-section')), asideBox: r(aside), tools, edText: edText ? edText.slice(0, 300) : edText,
                        sections, saveRow, badgeVisible: v(badge) && getComputedStyle(badge).display !== 'none', converter: conv ? f(conv.innerText).slice(0, 300) : null,
                        required: [...root.querySelectorAll('[required], [aria-required=true], .pkpFormFieldLabel__required')].length};
                }).catch((e) => ({error: String(e.message)}));
                info.resps = respsSince(t0).filter((x) => /bodyText/.test(x) || !/^GET 200/.test(x));
                if (name) await snap(name, {bt: info});
                return info;
            };
            out.B = await openBT(s.B, s.B.pub, 'bt-01-B');
            out.H = await openBT(s.H, s.H.pub, 'bt-02-H-no-refs');
            out.B2 = await openBT(s.B, s.B.pub, null);
            // the toolbar through the aria snapshot of the formatbar
            out.toolbarAria = await page.locator('sciflow-formatbar').first().ariaSnapshot().catch((e) => `error ${e.message}`);
            // the Insert and Table menus
            for (const m of ['Insert', 'Table']) {
                try {
                    const b = page.locator('sciflow-formatbar').getByRole('button', {name: new RegExp(`^${m}`)}).first();
                    if (await b.count()) {
                        await b.click(); await sleep(600);
                        out[`menu${m}`] = await page.locator('sciflow-formatbar').ariaSnapshot().catch(() => null);
                        await snap(`bt-03-menu-${m}`);
                        await b.click().catch(() => {});
                        await sleep(300);
                    } else out[`menu${m}`] = 'no button';
                } catch (e) { out[`menu${m}`] = `error ${flat(e.message, 200)}`; }
            }
            // type in the editor: badge, then Save ("Saved"), then heading → outline
            const ed = page.locator('sciflow-editor .ProseMirror').first();
            const edOk = await ed.waitFor({state: 'visible', timeout: T}).then(() => 1).catch(() => 0);
            out.badgeBeforeTyping = (await openBTstate()).badgeVisible;
            out.editable = edOk;
            if (edOk) {
                await ed.click(); await page.keyboard.type('Kestrel body line. '); await sleep(800);
                out.afterType = await openBTstate();
                out.toolbarWhileTyping = await page.locator('sciflow-formatbar').first().ariaSnapshot().catch(() => null);
                await snap('bt-04-typed', {state: out.afterType});
                await page.evaluate(() => {
                    window.__saveLog = [];
                    const b = [...document.querySelectorAll('.sciflow-body-text aside button')][0];
                    if (b) new MutationObserver(() => window.__saveLog.push({t: b.innerText.trim(), at: Date.now()})).observe(b, {subtree: true, childList: true, characterData: true});
                });
                const t0 = Date.now();
                await page.locator('.sciflow-body-text aside').getByRole('button', {name: 'Save', exact: true}).click();
                await sleep(400);
                out.saveLabelSoon = await page.locator('.sciflow-body-text aside button').first().innerText().catch(() => null);
                await sleep(2500); await idle(page);
                out.saveLog = await page.evaluate(() => window.__saveLog).catch(() => null);
                out.saveResps = respsSince(t0); out.saveNotices = await noticesSince(t0);
                out.afterSave = await openBTstate();
                await snap('bt-05-saved', {state: out.afterSave});
                // a heading → outline; fullscreen toggle
                await ed.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter'); await page.keyboard.type('Kestrel Heading');
                const style = page.locator('sciflow-formatbar').getByRole('combobox').first().or(page.locator('sciflow-formatbar').getByRole('button', {name: /Text style|Paragraph/}).first());
                try {
                    if (await style.count()) {
                        const tagName = await style.evaluate((e) => e.tagName);
                        if (tagName === 'SELECT') await style.selectOption({label: 'Heading 1'});
                        else {
                            await style.click(); await sleep(500);
                            out.textStyleMenu = await page.locator('sciflow-formatbar').first().ariaSnapshot().catch(() => null);
                            await page.locator('sciflow-formatbar').getByRole('menuitem', {name: /Heading 1/}).or(page.locator('sciflow-formatbar').getByRole('option', {name: /Heading 1/})).first().click({timeout: 5000});
                        }
                    }
                } catch (e) { out.headingErr = flat(e.message, 200); }
                await sleep(800);
                const outline = page.locator('details[data-sidebar-section="outline"] summary');
                for (let i = 0; i < 2; i++) {
                    if (await page.locator('details[data-sidebar-section="outline"]').evaluate((d) => d.open).catch(() => true)) break;
                    await outline.click().catch(() => {}); await sleep(600);
                }
                out.outlineAria = await page.locator('details[data-sidebar-section="outline"]').ariaSnapshot().catch((e) => `error ${e.message}`);
                await page.locator('details[data-sidebar-section="outline"]').getByRole('button').first().hover().catch(() => {}); await sleep(500);
                out.outlineAriaHover = await page.locator('details[data-sidebar-section="outline"]').ariaSnapshot().catch((e) => `error ${e.message}`);
                out.outlineInsertRef = await page.locator('details[data-sidebar-section="outline"]').getByText(/Insert ref/i).count().catch(() => null);
                await snap('bt-06b-outline-hover');
                out.withHeading = await openBTstate();
                await snap('bt-06-heading-outline', {state: out.withHeading});
                const fsb = page.locator('.sciflow-body-text aside').getByRole('button', {name: /Fullscreen/}).first();
                await fsb.click().catch(() => {}); await sleep(600);
                out.fullscreen = await openBTstate();
                await snap('bt-07-fullscreen', {state: out.fullscreen});
                await page.locator('.sciflow-body-text aside').getByRole('button', {name: /Exit fullscreen/}).first().click().catch(() => {}); await sleep(600);
                // select a word → "Selected Element"
                await ed.locator('p').first().dblclick().catch(() => {}); await sleep(600);
                out.selected = await openBTstate();
                out.toolbarWithSelection = await page.locator('sciflow-formatbar').first().ariaSnapshot().catch(() => null);
                // "Insert table": does a "Table" menu appear in the toolbar?
                await ed.locator('p').first().click().catch(() => {}); await page.keyboard.press('End');
                try {
                    await page.locator('sciflow-formatbar').getByRole('button', {name: 'Insert', exact: true}).click(); await sleep(400);
                    await page.locator('sciflow-formatbar').getByRole('menuitem', {name: 'Insert table'}).click(); await sleep(800);
                    await snap('bt-08b-insert-table-window');
                    const w = page.getByRole('dialog').filter({hasText: /table/i}).last();
                    if (await w.isVisible().catch(() => false)) {
                        out.tableWindow = flat(await w.innerText(), 300);
                        const ok = w.getByRole('button', {name: /^(Insert|OK|Create)/}).first();
                        if (await ok.count()) await ok.click();
                        await sleep(800);
                    }
                    const cell = ed.locator('td, th').first();
                    if (await cell.count()) { await cell.click(); await sleep(500); }
                    out.toolbarInTable = await page.locator('sciflow-formatbar').first().ariaSnapshot().catch(() => null);
                    await snap('bt-08c-in-table');
                } catch (e) { out.tableErr = flat(e.message, 200); }
                await snap('bt-08-selected', {state: out.selected});
                // leave with the change unsaved: another publication page from the menu (dismiss, then accept)
                const t1 = Date.now();
                dialogMode = 'dismiss';
                await page.locator(`${vis} nav a`).filter({hasText: /^\s*JATS XML\s*$/}).first().click().catch(() => {});
                await sleep(1500);
                out.leaveDismiss = {dialogs: dialogsSince(t1), url: page.url().replace(/^.*\/index\.php/, '')};
                await snap('bt-09-leave-dismissed');
                dialogMode = 'accept';
                const t2 = Date.now();
                await page.locator(`${vis} nav a`).filter({hasText: /^\s*JATS XML\s*$/}).first().click().catch(() => {});
                await sleep(1500); await idle(page);
                out.leaveAccept = {dialogs: dialogsSince(t2), url: page.url().replace(/^.*\/index\.php/, '')};
                await snap('bt-10-left');
                out.reopen = await openBT(s.B, s.B.pub, 'bt-11-reopen');
            }
            async function openBTstate() {
                return page.evaluate(() => {
                    const v = (e) => e && e.getClientRects().length > 0;
                    const f = (x) => (x || '').replace(/\s+/g, ' ').trim();
                    const root = document.querySelector('.sciflow-body-text');
                    const aside = root?.querySelector('aside');
                    const badge = root?.querySelector('.sciflow-body-text__unsaved');
                    return {
                        fullscreenClass: root?.classList.contains('sciflow-body-text--fullscreen'),
                        saveRow: aside ? [...aside.querySelectorAll('button')].filter(v).map((b) => `${f(b.innerText)}${b.getAttribute('aria-pressed') ? `[pressed=${b.getAttribute('aria-pressed')}]` : ''}`) : [],
                        badgeVisible: !!badge && v(badge) && getComputedStyle(badge).display !== 'none',
                        sections: root ? [...root.querySelectorAll('details')].map((d) => ({key: d.dataset.sidebarSection, open: d.open, text: f(d.innerText).slice(0, 300),
                            shadow: [...d.querySelectorAll('*')].map((e) => e.shadowRoot ? f(e.shadowRoot.textContent) : '').filter(Boolean).join(' | ').slice(0, 300)})) : [],
                    };
                }).catch((e) => ({error: String(e.message)}));
            }
            fact('bodytext', out);
        });

        // ============================================================ send: Purpose's "imports … a file sent from a file list" (the Markdown end)
        if (on('send') && isOJS) await sect('send', async () => {
            const out = {};
            if (!s.T1) {
                const r = await app.api.createSubmission({tag: `${S.t}T1`, context: J.path, submitter: J.u.au, title: `K1 T1 Kestrel ${S.t}`, files: [{file: 'notes.md'}], decisions: ['skipExternalReview', 'sendToProduction']});
                s.T1 = {id: r.submissionId, pub: r.publicationId}; save();
            }
            await as(J.u.mgr, J.path);
            await page.goto(wfUrl(J.path, s.T1.id, 'workflow_1')); await idle(page); await sleep(1500);
            await snap('send-01-submission-stage');
            const row = page.locator(`${vis} table tbody tr`).filter({hasText: 'notes.md'}).first();
            await row.waitFor({timeout: T});
            const btn = row.getByRole('button').last();
            await btn.click(); await sleep(400);
            out.items = await page.locator('[role="menuitem"]:visible').allInnerTexts().catch(() => []);
            const it = page.getByRole('menuitem', {name: 'Send to Text Editor', exact: true}).first();
            if (await it.count()) {
                await it.click(); await idle(page); await sleep(1500);
                const w = page.locator(vis).last();
                out.window = flat(await w.innerText().catch(() => ''), 800);
                out.windowButtons = await w.getByRole('button').allInnerTexts().catch(() => []);
                await snap('send-02-window', {items: out.items});
                const t0 = Date.now();
                const sel = w.locator('select').first();
                out.options = await sel.locator('option').allInnerTexts().catch(() => []);
                const lab = out.options.find((o) => /Unassigned version|Version of Record/.test(o));
                if (lab) await sel.selectOption({label: lab.trim()}).catch((e) => { out.selectErr = flat(e.message, 200); });
                await sleep(400);
                await snap('send-02b-window-chosen');
                const go = w.getByRole('button', {name: /^(Confirm|Send|OK|Send to Text Editor)$/}).last();
                if (await go.count()) {
                    await go.click(); await idle(page); await sleep(3000);
                    out.after = {resps: respsSince(t0).filter((x) => !/^GET 200/.test(x)), notices: await noticesSince(t0), url: page.url().replace(/^.*\/index\.php/, '')};
                    await snap('send-03-after', {after: out.after});
                }
            } else { await btn.click().catch(() => {}); }
            await page.goto(wfUrl(J.path, s.T1.id, `publication_${s.T1.pub}_bodyText`)); await idle(page);
            await page.locator('sciflow-editor .ProseMirror').first().waitFor({state: 'visible', timeout: T}).catch(() => {});
            await sleep(3000);
            out.editorText = flat(await page.locator('sciflow-editor .ProseMirror').first().innerText().catch(() => null), 400);
            await snap('send-04-bodytext', {text: out.editorText});
            fact('send', out);
        });

        // ============================================================ plugin: the JATS Template Plugin off (Rule 7's "cannot be produced")
        if (on('plugin') && isOJS && S.Q) await sect('plugin', async () => {
            const out = {};
            await as(S.Q.u.mgr, S.Q.path);
            const q = await openJats(S.Q.path, s.Q.id, s.Q.pub, 'plug-01-off');
            out.Q = strip(q); out.Qfacts = xmlFacts(q.xml);
            await page.goto(app.url(`/index.php/${S.Q.path}/management/settings/website#plugins`)); await idle(page); await sleep(1500);
            const row = page.locator('tr').filter({hasText: 'JATS Template Plugin'}).first();
            out.pluginRow = flat(await row.innerText().catch(() => null), 300);
            out.pluginChecked = await row.locator('input[type=checkbox]').first().isChecked().catch(() => null);
            await snap('plug-02-plugins-row', {row: out.pluginRow, checked: out.pluginChecked});
            fact('plugin', out);
        });

        // ============================================================ ctrl: OMP and OPS publication menus (the exclusivity controls)
        if (on('ctrl') && !isOJS) await sect('ctrl', async () => {
            const out = {};
            await as(S.X.u.mgr, S.X.path);
            for (const k of ['X', 'XP']) {
                const sub = s[k];
                if (!sub || sub.error) { out[k] = sub; continue; }
                await page.goto(wfUrl(S.X.path, sub.id, null)); await idle(page); await sleep(1000);
                await unfoldVersions();
                out[k] = {menu: await menu()};
                await snap(`ctrl-${k}-menu`, {menu: out[k].menu});
                // the JATS key typed into the address
                await page.goto(wfUrl(S.X.path, sub.id, `publication_${sub.pub}_jats`)); await idle(page); await sleep(1500);
                const sc = await snap(`ctrl-${k}-jats-url`);
                out[k].jatsUrl = {heading: flat(sc.text?.dialog, 300)};
                await page.goto(wfUrl(S.X.path, sub.id, `publication_${sub.pub}_bodyText`)); await idle(page); await sleep(1500);
                const sc2 = await snap(`ctrl-${k}-bodytext-url`);
                out[k].bodyTextUrl = {heading: flat(sc2.text?.dialog, 300)};
            }
            out.articlePage = await page.goto(app.url(`/index.php/${S.X.path}/${app.name === 'ops' ? 'preprint/view' : 'catalog/book'}/${s.XP.id}`)).then(() => true).catch(() => false);
            await idle(page);
            out.jatsLinks = await page.locator('a').evaluateAll((as) => as.filter((a) => /JATS/i.test(a.innerText)).map((a) => a.innerText.trim())).catch(() => null);
            await snap('ctrl-published-page', {links: out.jatsLinks});
            fact('ctrl', out);
        });
    } finally {
        save();
        await close();
    }
});
