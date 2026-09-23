// U36 claim check, chunk K4: the submission wizard's "Files" panel (Rule 17), choosing
// the component there (Rule 18, the "Edit {file name}" panel), and the settings that
// modify behavior: Components, the anonymizing link, Stage Assignment, the "Upload
// Files" guidance, the submission languages, the upload limit. All three apps.
// Spec: docs/specs/U36-submission-files.md lines 102–107, 281–308, 330–388.
//
// Per app, three scratch contexts:
//   T  install defaults (mgr, au, se; ce and fc on OJS/OMP). Drafts p1 (the panel), p2
//      (big files, the progress row, leaving mid-upload), g1/g2 (the submit gate, d8);
//      s1 submitted on the Submission stage (the anonymizing link off; one name box).
//      OPS: draft p1 (its "Upload Files" step), s1 in production (a galley's wizard).
//   C  components changed through the `components` seed key, and the "Upload Files"
//      guidance changed on the screen (phase guidance). Drafts c1 (links, the "Other"
//      panel), c2 (the required gate); c3 submitted with article.html (the upload
//      wizard's list, the dependent wizard's list). OPS: c3 in production.
//   E  "Present a link to how to ensure all files are anonymized" on, English + French
//      submission languages; e1 Submission, e2 review (OMP e2i internal too), e4
//      Copyediting with ce assigned, e5 Production, ef a French submission.
//      OPS: e1 in production, ef French.
//
//   PROBE_FEATURE=U36 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U36/K4/k4.js
//   PHASES=seed,settings,panel,big,gate,guidance,comps,ensure,stage,lang,ops (default all;
//   state in .reports/U36/ccK4/k4-state-<app>.json)
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const ALL = ['seed', 'settings', 'panel', 'big', 'gate', 'guidance', 'comps', 'ensure', 'stage', 'lang', 'ops', 'meta'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k4-state-${app.name}.json`);
const MiB = 1024 * 1024;

async function sect(name, fn) {
    try { await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1500)});
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
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 4000),
        buttons: [...d.querySelectorAll('button, a')].filter((b) => b.getClientRects().length).map((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()).filter(Boolean),
    }))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
const wizardDialog = (page) => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();

// The legacy upload wizard's step as data (a trimmed copy of K2's reader).
async function wizardState(page) {
    const wiz = wizardDialog(page);
    if (!(await wiz.count())) return {open: false};
    return wiz.evaluate((d) => {
        const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
        const sel = (q) => {
            const el = d.querySelector(q);
            if (!el) return {present: false};
            return {present: true, visible: vis(el), disabled: el.disabled, options: [...el.options].map((o) => o.text.trim() + (o.selected ? ' *' : ''))};
        };
        const panel = [...d.querySelectorAll('[role=tabpanel]')].find((p) => vis(p) && p.getAttribute('aria-hidden') !== 'true') || d;
        return {
            open: true,
            title: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
            tabs: [...d.querySelectorAll('[role=tab]')].map((t) => f(t.innerText) + (t.getAttribute('aria-selected') === 'true' ? ' *' : '')),
            genre: sel('select[id^="genreId"]'),
            genreLabel: (() => { const s = d.querySelector('select[id^="genreId"]'); const l = s && (d.querySelector(`label[for="${s.id}"]`) || s.closest('.section')?.querySelector('label, .label')); return l ? f(l.innerText) : null; })(),
            ensuringLink: [...d.querySelectorAll('a')].filter((a) => /anonymi/i.test(a.innerText)).map((a) => ({text: f(a.innerText), visible: vis(a), href: a.getAttribute('href')})),
            langButtons: [...panel.querySelectorAll('button')].filter(vis).map((b) => f(b.innerText)).filter(Boolean),
            inputs: [...panel.querySelectorAll('input:not([type=hidden]), textarea, select')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), type: e.type, name: e.name || null, value: e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : (e.value || '').slice(0, 120)})),
            labels: [...panel.querySelectorAll('label, legend, .pkpFormFieldLabel')].filter(vis).map((e) => f(e.innerText)).filter(Boolean).slice(0, 40),
            panelText: f(panel.innerText).slice(0, 2500),
        };
    }).catch((e) => ({error: String(e.message).slice(0, 300)}));
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const FIX = path.join(REPO, `apps/${app.name}/playwright/fixtures/files`);
    const PDF = path.join(FIX, isOPS ? 'preprint.pdf' : 'article.pdf');
    const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
    const MAIN = isOMP ? 'Book Manuscript' : (isOPS ? 'Preprint Text' : 'Article Text');
    const SUPP = isOMP ? 'Prospectus' : 'Research Instrument';
    // The components C changes (the `components` seed key), per app.
    const CMOD = isOMP
        ? {main: 'Glossary', dep: 'Index', removed: 'Table', req: 'Appendix', added: 'K4 Extra'}
        : {main: 'Research Instrument', dep: 'Research Materials', removed: 'Data Set', req: 'Research Results', added: 'K4 Extra'};

    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key) => ctxUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const wizUrl = (ctx, id) => ctxUrl(ctx, `/submission?id=${id}`);

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.T) {
        const mk = async (prefix, ctxExtra, roleUsers, extra = {}) => {
            const t = tag(prefix);
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U36 K4 ${t}`, acronym: 'U36K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`, ...ctxExtra}, users, ...extra});
            record(`seed-context-${prefix}`, ctx);
            return {path: ctx.path || t, u: Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`])), resp: ctx};
        };
        const base = [['mgr', 'manager', 'Mira', 'Manager'], ['au', 'author', 'Ava', 'Author'], ['se', 'sectionEditor', 'Sid', 'Section']];
        const full = isOPS ? base : [...base, ['ce', 'copyeditor', 'Cleo', 'Copyeditor'], ['fc', 'funding', 'Fay', 'Funding']];
        const compsSeed = {
            [CMOD.main]: {supplementary: false},
            [CMOD.dep]: {dependent: true},
            [CMOD.removed]: false,
            [CMOD.req]: {required: true},
            [CMOD.added]: {metadata: 'document'},
        };
        sc.T = await mk('u36k4', {}, full);
        sc.C = await mk('u36k4c', {}, base, {components: compsSeed});
        const eExtra = isOPS ? {} : {review: {showEnsuringLink: true}};
        sc.E = await mk('u36k4e', {supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']}, full, eExtra);
        const sub = async (C, k, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${C.path}${k}`.slice(0, 32), context: C.path, submitter: C.u.au, ...spec});
                C.subs = C.subs || {};
                C.subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, files: r.files};
                log(`[seed ${C.path} ${k}]`, r.submissionId, 'stage', r.stageId);
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); (C.subs = C.subs || {})[k] = {error: String(e.message).slice(0, 600)}; }
        };
        const own = [{file: 'article.pdf'}];
        const part = (C, k, role) => ({username: C.u[k], role});
        if (isOPS) {
            await sub(sc.T, 'p1', {title: 'K4 P1 draft', submitted: false});
            await sub(sc.T, 's1', {title: 'K4 S1 production', participants: [part(sc.T, 'se', 'sectionEditor')]});
            await sub(sc.C, 'c1', {title: 'K4 C1 draft', submitted: false});
            await sub(sc.C, 'c3', {title: 'K4 C3 production', participants: [part(sc.C, 'se', 'sectionEditor')]});
            await sub(sc.E, 'e1', {title: 'K4 E1 production', locale: 'en', participants: [part(sc.E, 'se', 'sectionEditor')]});
            await sub(sc.E, 'ef', {title: {fr_CA: 'K4 EF prépublication', en: 'K4 EF preprint'}, locale: 'fr_CA', participants: [part(sc.E, 'se', 'sectionEditor')]});
        } else {
            const toReview = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
            for (const k of ['p1', 'p2', 'g1', 'g2', 'x1']) await sub(sc.T, k, {title: `K4 ${k.toUpperCase()} draft`, submitted: false});
            await sub(sc.T, 's1', {title: 'K4 S1 submission stage', files: own, participants: [part(sc.T, 'se', 'sectionEditor')]});
            for (const k of ['c1', 'c2']) await sub(sc.C, k, {title: `K4 ${k.toUpperCase()} draft`, submitted: false});
            await sub(sc.C, 'c3', {title: 'K4 C3 submitted', files: [{file: 'article.html', genre: MAIN}, {file: 'notes.md', genre: CMOD.req}], participants: [part(sc.C, 'se', 'sectionEditor')]});
            await sub(sc.E, 'e1', {title: 'K4 E1 submission', locale: 'en', files: own});
            await sub(sc.E, 'e2', {title: 'K4 E2 review', locale: 'en', files: own, decisions: [...toReview, 'requestRevisions'], reviewRounds: [{files: [{file: 'article.pdf'}]}]});
            if (isOMP) await sub(sc.E, 'e2i', {title: 'K4 E2I internal review', locale: 'en', files: own, decisions: ['sendInternalReview']});
            await sub(sc.E, 'e4', {title: 'K4 E4 copyediting', locale: 'en', files: own, decisions: ['skipExternalReview'], participants: [part(sc.E, 'ce', 'copyeditor')]});
            await sub(sc.E, 'e5', {title: 'K4 E5 production', locale: 'en', files: own, decisions: ['skipExternalReview', 'sendToProduction']});
            await sub(sc.E, 'ef', {title: {fr_CA: 'K4 EF soumission', en: 'K4 EF submission'}, locale: 'fr_CA', files: own});
        }
        save(); record('seed', sc);
    }
    if (!sc.T) { log('[k4] no state; run the seed phase first'); return; }

    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => { jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300)}); d.accept().catch(() => {}); });
    const traffic = [];
    page.on('response', (r) => {
        const u = r.url();
        if (/\/api\/v1\/submissions\/\d+\/files|\/_submissions|genre|user-group|userGroup|submit/.test(u) && r.request().method() !== 'GET') {
            const e = {at: new Date().toISOString(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, url: u.replace(/^.*\/index\.php/, '').slice(0, 200), status: r.status()};
            traffic.push(e);
        }
    });
    await page.context().addInitScript(() => {
        window.__notices = [];
        const seen = new WeakSet();
        const sweep = () => {
            document.querySelectorAll('[role="alert"], [role="status"], .pkpNotification, [class*="toast"], [class*="Toast"]').forEach((e) => {
                const t = (e.innerText || '').trim();
                if (t && !seen.has(e)) { seen.add(e); window.__notices.push({t: t.slice(0, 300), at: Date.now()}); }
            });
        };
        new MutationObserver(sweep).observe(document, {subtree: true, childList: true, characterData: true});
    });
    const mark = () => ({t: Date.now(), d: jsDialogs.length, r: traffic.length});
    const since = async (m) => ({jsDialogs: jsDialogs.slice(m.d), traffic: traffic.slice(m.r), notices: await page.evaluate((s) => (window.__notices || []).filter((n) => n.at >= s).map((n) => n.t), m.t).catch(() => [])});
    const signInAs = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    async function openWf(url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(300);
        return label ? snap(page, label) : null;
    }
    const table = (name) => page.locator('[role="dialog"]:visible').first().getByRole('table', {name, exact: true}).first();
    async function rows(name) {
        const t = table(name);
        if (!(await t.count())) return {absent: true};
        await t.locator('tbody tr').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        return t.evaluate((el) => ({
            columns: [...el.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...el.querySelectorAll('tbody tr')].map((tr) => ({
                cells: [...tr.querySelectorAll('td, th')].map((c) => c.innerText.trim().replace(/\s+/g, ' ')),
                badges: [...tr.querySelectorAll('[class*="adge"], [class*="Badge"]')].map((b) => ({text: b.innerText.trim(), cls: b.className, bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color, border: getComputedStyle(b).borderColor})),
            })),
        }));
    }
    const wiz = () => wizardDialog(page);
    const contBtn = () => wiz().getByRole('button', {name: 'Continue', exact: true});
    async function waitContinueEnabled(timeout = 30000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) { if (await contBtn().isEnabled().catch(() => false)) return true; await page.waitForTimeout(200); }
        return false;
    }
    async function pickGenre(label) { const g = wiz().locator('select[id^="genreId"]'); if (await g.count()) await g.selectOption({label}); }
    async function attach(file) { await wiz().locator('input[type="file"]').setInputFiles(file); return waitContinueEnabled(); }
    async function toStep2() {
        await contBtn().click();
        await wiz().getByRole('tab', {name: /^2\./}).and(page.locator('[aria-selected="true"]')).waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await wiz().locator('input[type="text"]:visible, textarea:visible').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
    }
    async function wizCancel() {
        const c = wiz().getByRole('link', {name: 'Cancel', exact: true}).or(wiz().getByRole('button', {name: 'Cancel', exact: true})).first();
        await c.click().catch(() => {});
        await page.waitForTimeout(1000);
        await wiz().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function openUpload(listName) {
        const t = table(listName);
        await t.waitFor({timeout: 30000});
        const container = page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: listName, exact: true})}).last();
        const direct = container.getByRole('button', {name: 'Upload', exact: true});
        if (await direct.count()) {
            await direct.click();
        } else {
            // "Upload/Select Files" window, then its "Upload" link
            await container.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
            const w = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
            await w.waitFor({timeout: 30000}); await idle(page);
            await w.locator('table tr').nth(1).waitFor({timeout: 15000}).catch(() => {});
            await w.getByRole('link', {name: /Upload/}).first().click();
        }
        await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        await idle(page); await page.waitForTimeout(300);
    }
    async function closeUploadSelect() {
        const w = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
        if (await w.count()) {
            await w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await idle(page);
        }
    }

    // ------------------------------------------------------------- the wizard's "Files" panel
    const panel = () => page.locator('.submissionFilesListPanel').first();
    async function panelState() {
        const has = await panel().count();
        const base = {present: !!has, currentStep: flat(await page.locator('.pkpSteps__step__label--current').first().innerText().catch(() => null), 80)};
        if (!has) return base;
        return {...base, ...(await panel().evaluate((p) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e && e.getClientRects().length > 0;
            const before = [];
            let el = p;
            while (el && el.parentElement && before.length === 0) { let s = el.previousElementSibling; while (s) { if (vis(s) && f(s.innerText)) before.unshift(f(s.innerText).slice(0, 700)); s = s.previousElementSibling; } el = el.parentElement; if (el.classList && (el.classList.contains('submissionWizard__step') || el.tagName === 'MAIN')) break; }
            return {
                heading: f((p.querySelector('h2') || {}).innerText),
                headerButtons: [...p.querySelectorAll('.pkpHeader button, .pkpHeader a')].filter(vis).map((b) => f(b.innerText)),
                guidanceAbove: before,
                emptyText: vis(p.querySelector('.listPanel__empty')) ? f(p.querySelector('.listPanel__empty').innerText) : null,
                emptyButtons: [...p.querySelectorAll('.listPanel__empty button')].map((b) => ({text: f(b.innerText), cls: b.className, tag: b.tagName})),
                rows: [...p.querySelectorAll('.listPanel__item--submissionFile')].map((r) => ({
                    text: f(r.innerText).slice(0, 400),
                    name: f((r.querySelector('.listPanel__item--submissionFile__link') || {}).innerText),
                    href: (r.querySelector('.listPanel__item--submissionFile__link') || {href: null}).href,
                    badge: [...r.querySelectorAll('.listPanel--submissionFiles__itemGenre')].map((b) => ({text: f(b.innerText), cls: b.className, bg: getComputedStyle(b).backgroundColor, color: getComputedStyle(b).color, border: getComputedStyle(b).borderColor})),
                    actions: [...r.querySelectorAll('.listPanel__itemActions button')].map((b) => f(b.innerText)),
                    prompt: f((r.querySelector('.listPanel--submissionFiles__setGenreLabel') || {}).innerText) || null,
                    genreButtons: [...r.querySelectorAll('.listPanel--submissionFiles__setGenreButton')].map((b) => ({text: f(b.innerText), tag: b.tagName, role: b.getAttribute('role'), cls: b.className})),
                    spinner: !!r.querySelector('.listPanel--submissionFiles__genreSpinner'),
                    progress: f((r.querySelector('.fileUploadProgress, [class*="rogress"]') || {}).innerText) || null,
                    errors: [...r.querySelectorAll('[class*="rror"]')].map((e) => f(e.innerText)).filter(Boolean),
                })),
                uploaderClasses: (p.querySelector('.fileUploader') || {}).className || null,
            };
        }))};
    }
    const row = (name) => panel().locator('.listPanel__item--submissionFile').filter({hasText: name}).first();
    async function chooseFiles(trigger, files) {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser', {timeout: 15000}), trigger.click()]);
        await chooser.setFiles(files);
    }
    async function waitStored(name, timeout = 60000) {
        await row(name).locator('.listPanel__item--submissionFile__link').waitFor({timeout}).catch(() => {});
        await idle(page);
    }
    async function openWizard(ctx, id, label) {
        await page.goto(wizUrl(ctx, id)); await idle(page);
        await page.locator('.submissionWizard, .submissionFilesListPanel').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
        const st = await panelState();
        if (label) await snap(page, label, {panel: st});
        return st;
    }
    const editPanel = () => page.getByRole('dialog').filter({hasText: 'What kind of file is this?'}).last();
    async function editPanelState() {
        const d = editPanel();
        if (!(await d.count())) return {open: false};
        return d.evaluate((el) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const vis = (e) => e && e.getClientRects().length > 0;
            return {
                open: true,
                name: el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
                heads: [...el.querySelectorAll('h1,h2,h3,legend,.pkpFormFieldLabel')].filter(vis).map((h) => f(h.innerText)),
                descriptions: [...el.querySelectorAll('.pkpFormField__description, .pkpFormFieldLabel + div, p')].filter(vis).map((h) => f(h.innerText)).filter(Boolean).slice(0, 6),
                radios: [...el.querySelectorAll('input[type=radio]')].map((r) => ({label: f((r.closest('label') || document.querySelector(`label[for="${r.id}"]`) || {}).innerText), value: r.value, checked: r.checked})),
                buttons: [...el.querySelectorAll('button')].filter(vis).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                text: f(el.innerText).slice(0, 1500),
            };
        }).catch((e) => ({error: String(e.message)}));
    }
    async function closeEditPanel() {
        const d = editPanel();
        const c = d.getByRole('button', {name: /^Close/}).first();
        if (await c.count()) await c.click(); else await page.keyboard.press('Escape');
        await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await page.waitForTimeout(600); await idle(page);
    }
    async function setGenreLink(fileName, genre) {
        const m = mark();
        const btn = row(fileName).locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: new RegExp(`^\\s*${genre}\\s*$`)}).first();
        const resp = page.waitForResponse((r) => /\/files\/\d+/.test(r.url()) && r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
        await btn.click();
        // the spinner while it saves
        const sp = [];
        for (let i = 0; i < 6; i++) { sp.push(await row(fileName).locator('.listPanel--submissionFiles__genreSpinner').count().catch(() => -1)); await page.waitForTimeout(80); }
        await resp; await idle(page); await page.waitForTimeout(400);
        return {spinnerSamples: sp, ...(await since(m))};
    }
    // Continue through the wizard to its "Review" step.
    async function toReview() {
        const seen = [];
        for (let i = 0; i < 9; i++) {
            const cur = flat(await page.locator('.pkpSteps__step__label--current').first().innerText().catch(() => ''), 60);
            seen.push(cur);
            if (/^Review$/.test(cur)) break;
            const b = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
            if (!(await b.count())) break;
            await b.click(); await idle(page); await page.waitForTimeout(700);
        }
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
        await idle(page);
        return seen;
    }
    async function reviewState() {
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        return {
            submitPresent: await submit.count(), submitDisabled: await submit.isDisabled().catch(() => null),
            filesSection: await page.evaluate(() => {
                const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
                const secs = [...document.querySelectorAll('.submissionWizard__reviewPanel')];
                return secs.map((s) => f(s.innerText).slice(0, 700)).filter((t) => /File|Upload/i.test(t)).slice(0, 3);
            }).catch(() => null),
            errors: await page.locator('.submissionWizard .pkpNotification, .submissionWizard [class*="rror"]').evaluateAll((els) => [...new Set(els.filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean))].slice(0, 12)).catch(() => []),
        };
    }
    async function pressSubmit() {
        const out = {};
        const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
        if (!(await submit.count()) || await submit.isDisabled()) return {pressed: false};
        const m = mark();
        await submit.click();
        const d = page.getByRole('dialog').filter({hasText: /Submit|submit/}).last();
        await d.waitFor({timeout: 20000}).catch(() => {});
        out.dialog = flat(await d.innerText().catch(() => null), 600);
        await d.getByRole('button', {name: 'Submit', exact: true}).click().catch((e) => { out.confirmErr = String(e.message).slice(0, 200); });
        await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000}).catch(() => {});
        await idle(page);
        out.after = await since(m);
        out.heading = await page.locator('h1').first().innerText().catch(() => null);
        out.url = page.url().replace(/^.*\/index\.php/, '');
        return out;
    }

    // ---- Settings screens: read-only reads on T (install defaults) ------------------------
    async function componentsTab(ctx, label) {
        await page.goto(ctxUrl(ctx, '/management/settings/workflow')); await idle(page);
        const sub = page.getByRole('tab', {name: 'Submission', exact: true}).first();
        if (await sub.count()) { await sub.click(); await idle(page); }
        const comp = page.getByRole('tab', {name: 'Components', exact: true}).first();
        await comp.click(); await idle(page);
        await page.locator('[id^="component-grid-settings-genre"] tr.gridRow, tr[id*="genre"]').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const grid = await page.evaluate(() => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const g = [...document.querySelectorAll('[id^="component-grid-settings-genre"]')].find((e) => e.getClientRects().length) || document;
            return {
                heading: f((g.querySelector('h4, h3') || {}).innerText),
                actions: [...g.querySelectorAll('.pkp_linkActions a, .actions a, ul li a')].filter((a) => a.getClientRects().length).map((a) => f(a.innerText)).filter(Boolean),
                rows: [...g.querySelectorAll('tr.gridRow')].map((tr) => ({id: tr.id, text: f(tr.innerText), cls: tr.className, disabled: /disabled/i.test(tr.className) || !!tr.querySelector('.disabled, [disabled]')})),
            };
        });
        await snap(page, label, {grid});
        return grid;
    }
    async function readGenreForm(rowId) {
        const tr = page.locator(`tr#${rowId}`);
        const tog = tr.locator('a.show_extras');
        if (await tog.count()) { await tog.first().click(); await page.waitForTimeout(250); }
        const actions = page.locator(`tr#${rowId} + tr`);
        const acts = await actions.locator('a').allInnerTexts().catch(() => []);
        const edit = actions.getByRole('link', {name: 'Edit', exact: true}).first();
        await edit.click();
        const form = page.locator('#genreForm').last();
        await form.waitFor({timeout: 20000}); await idle(page); await page.waitForTimeout(200);
        const data = await form.evaluate((f0) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            const lab = (e) => f((e.closest('label') || f0.querySelector(`label[for="${e.id}"]`) || {}).innerText);
            const sectionTitle = (e) => { const s = e.closest('.section'); return s ? f((s.querySelector('label.label, legend, .label, label') || {}).innerText) : null; };
            return {
                name: (f0.querySelector('input[name^="name"]') || {}).value,
                boxes: [...f0.querySelectorAll('input[type=checkbox]')].map((c) => ({section: sectionTitle(c), label: lab(c), checked: c.checked, name: c.name})),
                metadata: (() => { const s = f0.querySelector('select[name="category"]'); return s ? {label: sectionTitle(s), selected: s.options[s.selectedIndex].text, options: [...s.options].map((o) => o.text)} : null; })(),
                required: [...f0.querySelectorAll('input[name="required"]')].map((r) => ({label: lab(r), checked: r.checked})),
                key: (() => { const k = f0.querySelector('input[name="key"]'); return k ? {value: k.value, readonly: k.readOnly} : null; })(),
                sectionTitles: [...f0.querySelectorAll('.section > label, .section > .label, legend, label.label')].map((e) => f(e.innerText)).filter(Boolean),
            };
        });
        const win = topWin(page);
        const title = await win.getAttribute('aria-label').catch(() => null);
        await win.getByRole('link', {name: 'Cancel', exact: true}).or(win.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
        await form.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await idle(page);
        return {rowActions: acts.map((t) => flat(t)), title, ...data};
    }
    async function rolesGrid(ctx, label) {
        await page.goto(ctxUrl(ctx, '/management/settings/access')); await idle(page);
        const tab = page.getByRole('tab', {name: 'Roles', exact: true}).first();
        if (await tab.count()) { await tab.click(); await idle(page); }
        await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const grid = await page.evaluate(() => {
            const t = [...document.querySelectorAll('table')].find((x) => x.getClientRects().length && /Permission level/.test(x.innerText));
            if (!t) return null;
            return {head: [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim()),
                rows: [...t.querySelectorAll('tr.gridRow')].map((tr) => [...tr.querySelectorAll('td')].map((td) => { const cb = td.querySelector('input[type=checkbox]'); return cb ? (cb.checked ? '[x]' : '[ ]') + (cb.disabled ? 'dis' : '') : td.innerText.trim().replace(/\s+/g, ' '); }))};
        });
        await snap(page, label, {grid});
        return grid;
    }

    try {
        // =====================================================================
        if (on('settings')) await sect('settings', async () => {
            const T = sc.T; const out = {};
            await signInAs(T.u.mgr, T.path);
            const g = await componentsTab(T.path, 'set-01-components-tab');
            out.tab = g;
            await loc(page, 'Settings › Workflow › Submission › "Components" tab', page.getByRole('tab', {name: 'Components', exact: true}).first());
            out.forms = [];
            for (const r of g.rows) {
                try { out.forms.push({row: r.text, ...(await readGenreForm(r.id))}); } catch (e) { out.forms.push({row: r.text, error: String(e.message).slice(0, 200)}); await page.keyboard.press('Escape').catch(() => {}); await componentsTab(T.path, 'set-01b-components-tab-again').catch(() => {}); }
            }
            // one form open, as a person sees it
            try {
                const r0 = g.rows.find((r) => r.text.includes(MAIN)) || g.rows[0];
                const tr = page.locator(`tr#${r0.id}`);
                const tog = tr.locator('a.show_extras'); if (await tog.count()) { await tog.first().click(); await page.waitForTimeout(250); }
                await page.locator(`tr#${r0.id} + tr`).getByRole('link', {name: 'Edit', exact: true}).first().click();
                await page.locator('#genreForm').last().waitFor({timeout: 20000}); await idle(page);
                await snap(page, 'set-02-component-form-main');
                await topWin(page).getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {}); await idle(page);
            } catch (e) { out.formShotErr = String(e.message).slice(0, 200); }
            record('set-components-forms', out.forms);
            log('[components]', app.name, JSON.stringify(g.rows.map((r) => r.text)));
            for (const f of out.forms) log('  ', flat(f.row, 30), '|', (f.boxes || []).map((b) => `${b.label}${b.checked ? '✓' : ''}`).join(', '), '|', f.metadata && f.metadata.selected, '|', (f.required || []).filter((x) => x.checked).map((x) => flat(x.label, 20)).join(''), '|', f.title);
            // the Review › Setup box (journal, press) / no Review tab (preprint server)
            await page.goto(ctxUrl(T.path, '/management/settings/workflow')); await idle(page);
            out.workflowTabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
            const rv = page.getByRole('tab', {name: 'Review', exact: true}).first();
            if (await rv.count()) {
                await rv.click(); await idle(page);
                const st = page.getByRole('tab', {name: 'Setup', exact: true}).first();
                if (await st.count()) { await st.click(); await idle(page); }
                out.setupHasBox = await page.getByRole('checkbox', {name: /anonymized/}).count();
                await snap(page, 'set-03a-review-setup', {boxOnSetup: out.setupHasBox});
                // the box sits on "Reviewer Guidance" (PKPReviewGuidanceForm)
                const rg = page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).first();
                if (await rg.count()) { await rg.click(); await idle(page); await page.waitForTimeout(600); }
                const box = page.getByRole('checkbox', {name: /anonymized/}).first();
                await box.waitFor({timeout: 15000}).catch(() => {});
                out.ensuring = {count: await box.count(), label: flat(await box.evaluate((e) => (e.closest('label') || {}).innerText).catch(() => null)), checked: await box.isChecked().catch(() => null),
                    group: flat(await box.evaluate((e) => (e.closest('.pkpFormField') || {}).innerText).catch(() => null), 600)};
                await loc(page, 'Settings › Workflow › Review › Setup: the anonymizing-link box', box);
                await snap(page, 'set-03-review-guidance', {ensuring: out.ensuring});
                // the label's own "how to ensure all files are anonymized" button (sweep)
                const lb = page.locator('.pkpFormField').filter({has: page.getByRole('checkbox', {name: /anonymized/})}).getByRole('button', {name: /anonymized/}).first();
                if (await lb.count()) {
                    const m0 = Date.now(); const before = await box.isChecked().catch(() => null);
                    await lb.click().catch(() => {}); await page.waitForTimeout(1000); await idle(page);
                    out.labelButton = {dialogs: (await dialogTexts(page)).map((x) => ({name: x.name, text: flat(x.text, 900), buttons: x.buttons})), boxBefore: before, boxAfter: await box.isChecked().catch(() => null), ms: Date.now() - m0};
                    await snap(page, 'set-03b-label-button-pressed', {labelButton: out.labelButton});
                    const tw = topWin(page);
                    if (await tw.count()) { await tw.getByRole('button', {name: /^(Close|OK)$/}).first().click().catch(() => {}); await idle(page); }
                }
            } else {
                await snap(page, 'set-03-workflow-tabs-no-review', {tabs: out.workflowTabs});
            }
            // the "Upload Files" guidance box
            await page.getByRole('tab', {name: 'Submission', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.getByRole('tab', {name: 'Author Guidance', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.waitForTimeout(800);
            out.guidance = await page.evaluate(() => {
                const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
                return [...document.querySelectorAll('.pkpFormField')].filter((e) => e.getClientRects().length).map((e) => {
                    const lab = f((e.querySelector('.pkpFormFieldLabel, label') || {}).innerText);
                    const ifr = e.querySelector('iframe');
                    const id = ifr ? ifr.id.replace(/_ifr$/, '') : null;
                    const val = id && window.tinymce && window.tinymce.get(id) ? window.tinymce.get(id).getContent({format: 'text'}) : null;
                    return {label: lab, description: f((e.querySelector('.pkpFormField__description') || {}).innerText).slice(0, 300), editorId: id, value: val && f(val).slice(0, 700)};
                });
            });
            await snap(page, 'set-04-author-guidance', {guidance: out.guidance});
            // Languages
            await page.goto(ctxUrl(T.path, '/management/settings/website')); await idle(page);
            await page.getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.waitForTimeout(800);
            out.languages = await page.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({head: [...t.querySelectorAll('th')].map((x) => x.innerText.trim()), rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((td) => { const cb = td.querySelector('input[type=checkbox], input[type=radio]'); return cb ? (cb.checked ? '[x]' : '[ ]') : td.innerText.trim().replace(/\s+/g, ' '); }))})));
            await snap(page, 'set-05-languages', {languages: out.languages});
            out.roles = await rolesGrid(T.path, 'set-06-roles-grid');
            record('set-summary', out);
            log('[settings]', app.name, JSON.stringify({tabs: out.workflowTabs, ensuring: out.ensuring, guidance: out.guidance && out.guidance.map((g) => `${g.label}: ${flat(g.value, 120)}`), languages: out.languages, roles: out.roles}).slice(0, 3000));
        });

        // =====================================================================
        // Phase panel (OJS, OMP): the author's "Files" panel on the draft p1.
        if (on('panel') && !isOPS) await sect('panel', async () => {
            const T = sc.T; const id = sc.T.subs.p1.id; const out = {};
            await signInAs(T.u.au, T.path);
            out.empty = await openWizard(T.path, id, 'pan-01-empty');
            await loc(page, 'wizard "Files" panel', panel());
            await loc(page, 'panel "Add File"', panel().getByRole('button', {name: 'Add File', exact: true}));
            await loc(page, 'empty panel "Upload File" (a link-styled button)', panel().getByRole('button', {name: 'Upload File', exact: true}));
            // the empty-state link opens the file picker
            let m = mark();
            await chooseFiles(panel().getByRole('button', {name: 'Upload File', exact: true}), PDF);
            await waitStored('article.pdf');
            out.afterUpload = await panelState(); out.afterUploadTraffic = await since(m);
            await snap(page, 'pan-02-uploaded-no-component', {panel: out.afterUpload});
            await loc(page, 'row\'s component choice (button styled as a link)', row('article.pdf').locator('.listPanel--submissionFiles__setGenreButton').first());
            // choose the main-work component through its link
            out.setMain = await setGenreLink('article.pdf', MAIN);
            out.afterMain = await panelState();
            await snap(page, 'pan-03-main-chosen', {panel: out.afterMain, set: out.setMain});
            // "Add File" → notes.md → "Other"
            m = mark();
            await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), MD);
            await waitStored('notes.md');
            out.second = await panelState(); out.secondTraffic = await since(m);
            await row('notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: /^\s*Other\s*$/}).first().click();
            await editPanel().waitFor({timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(500);
            out.otherPanel = await editPanelState();
            await snap(page, 'pan-04-other-panel', {edit: out.otherPanel});
            await loc(page, '"Edit {file name}" side panel', editPanel());
            // Save with nothing chosen (sweep)
            m = mark();
            await editPanel().getByRole('button', {name: 'Save', exact: true}).click().catch(() => {});
            await page.waitForTimeout(1200); await idle(page);
            out.saveNothing = {...(await editPanelState()), ...(await since(m))};
            await snap(page, 'pan-05-other-save-nothing', {edit: out.saveNothing});
            if (!(await editPanel().isVisible().catch(() => false))) {
                await row('notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: /^\s*Other\s*$/}).first().click();
                await editPanel().waitFor({timeout: 15000});
            }
            await editPanel().getByRole('radio', {name: SUPP, exact: true}).check();
            m = mark();
            await editPanel().getByRole('button', {name: 'Save', exact: true}).click();
            await editPanel().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(500);
            out.saveSupp = await since(m); out.afterSupp = await panelState();
            await snap(page, 'pan-06-supp-saved', {panel: out.afterSupp, save: out.saveSupp});
            // row "Edit" on article.pdf: change the radio, leave without saving
            await row('article.pdf').getByRole('button', {name: 'Edit', exact: true}).click();
            await editPanel().waitFor({timeout: 15000}); await idle(page); await page.waitForTimeout(400);
            out.editMain = await editPanelState();
            await snap(page, 'pan-07-edit-main', {edit: out.editMain});
            await editPanel().getByRole('radio', {name: 'Other', exact: true}).check().catch(() => {});
            m = mark();
            await closeEditPanel();
            out.leaveUnsaved = {...(await since(m)), panel: await panelState()};
            await snap(page, 'pan-08-edit-closed-unsaved', out.leaveUnsaved);
            // Edit → change → Save: the row's badge
            await row('notes.md').getByRole('button', {name: 'Edit', exact: true}).click();
            await editPanel().waitFor({timeout: 15000}); await idle(page);
            await editPanel().getByRole('radio', {name: 'Other', exact: true}).check();
            m = mark();
            await editPanel().getByRole('button', {name: 'Save', exact: true}).click();
            await editPanel().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(400);
            out.editSaveOther = {...(await since(m)), panel: await panelState()};
            await snap(page, 'pan-09-edit-saved-other', out.editSaveOther);
            // reload: what is stored
            out.reloaded = await openWizard(T.path, id, 'pan-10-reloaded');
            // the name link downloads
            const link = row('article.pdf').locator('.listPanel__item--submissionFile__link');
            await loc(page, 'panel row: the file name link', link);
            const dl = page.waitForEvent('download', {timeout: 20000}).catch(() => null);
            const pop = page.context().waitForEvent('page', {timeout: 6000}).catch(() => null);
            m = mark();
            await link.click();
            const d = await dl; const p = await pop;
            out.download = {download: d ? {name: d.suggestedFilename(), url: d.url().replace(/^.*\/index\.php/, '')} : null, newTab: p ? p.url() : null, stayed: page.url().replace(/^.*\/index\.php/, ''), ...(await since(m))};
            if (p) await p.close().catch(() => {});
            await snap(page, 'pan-11-after-download', {download: out.download});
            // Remove: "No", then "Yes"
            await openWizard(T.path, id);
            await row('notes.md').getByRole('button', {name: 'Remove', exact: true}).click();
            const rm = page.getByRole('dialog', {name: 'Remove'}).last();
            await rm.waitFor({timeout: 10000}).catch(() => {});
            out.removeDialog = (await dialogTexts(page)).slice(-1)[0];
            await snap(page, 'pan-12-remove-dialog', {dialog: out.removeDialog});
            await loc(page, 'panel "Remove" dialog', rm);
            await rm.getByRole('button', {name: 'No', exact: true}).click(); await idle(page);
            out.afterNo = await panelState();
            await row('notes.md').getByRole('button', {name: 'Remove', exact: true}).click();
            await rm.waitFor({timeout: 10000}).catch(() => {});
            m = mark();
            await rm.getByRole('button', {name: 'Yes', exact: true}).click();
            await rm.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(400);
            out.afterYes = {...(await since(m)), panel: await panelState()};
            await snap(page, 'pan-13-removed', out.afterYes);
            out.afterRemoveReload = await openWizard(T.path, id, 'pan-14-removed-reload');
            // a file dropped on the panel
            m = mark();
            out.drop = await page.evaluate(async () => {
                const p = document.querySelector('.submissionFilesListPanel');
                const dt = new DataTransfer();
                dt.items.add(new File(['dropped file body'], 'dropped.txt', {type: 'text/plain'}));
                const r = p.querySelector('.listPanel__items, .listPanel__body') ? p.querySelector('.listPanel__items, .listPanel__body').getBoundingClientRect() : p.getBoundingClientRect();
                const x = r.left + r.width / 2; const y = r.top + Math.min(r.height / 2, 60);
                const ev = (t, el) => el.dispatchEvent(new DragEvent(t, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y}));
                const first = document.elementFromPoint(x, y);
                ev('dragenter', first);
                await new Promise((res) => setTimeout(res, 400));
                const target = document.elementFromPoint(x, y);
                const overlay = document.querySelector('.fileUploader');
                const ob = overlay ? overlay.getBoundingClientRect() : null;
                ev('dragover', target);
                ev('drop', target);
                return {firstTarget: first && first.className, target: target && (target.id || target.className), overlayClass: overlay && overlay.className, overlayBox: ob && {x: Math.round(ob.x), y: Math.round(ob.y), w: Math.round(ob.width), h: Math.round(ob.height)}};
            });
            await waitStored('dropped.txt', 20000);
            out.afterDrop = {...(await since(m)), panel: await panelState()};
            await snap(page, 'pan-15-after-drop', out.afterDrop);
            // a second drop on the panel's header ("Files"), away from the list body
            m = mark();
            out.drop2 = await page.evaluate(async () => {
                const p = document.querySelector('.submissionFilesListPanel');
                const pb = p.getBoundingClientRect();
                const h = p.querySelector('.pkpHeader, h2');
                const hb = h.getBoundingClientRect();
                const dt = new DataTransfer();
                dt.items.add(new File(['dropped on the header'], 'dropped-header.txt', {type: 'text/plain'}));
                const x = hb.left + 20; const y = hb.top + hb.height / 2;
                const ev = (t, el) => el.dispatchEvent(new DragEvent(t, {bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y}));
                ev('dragenter', document.elementFromPoint(x, y));
                await new Promise((res) => setTimeout(res, 400));
                const target = document.elementFromPoint(x, y);
                const ov = document.querySelector('.fileUploader'); const ob = ov.getBoundingClientRect();
                ev('dragover', target); ev('drop', target);
                await new Promise((res) => setTimeout(res, 300));
                // what a drag leaves when it ends without a drop on the uploader
                return {panelBox: {x: Math.round(pb.x), y: Math.round(pb.y), w: Math.round(pb.width), h: Math.round(pb.height)}, point: {x: Math.round(x), y: Math.round(y)}, target: target && (target.id || target.className), overlayBox: {x: Math.round(ob.x), y: Math.round(ob.y), w: Math.round(ob.width), h: Math.round(ob.height)}, overlayClassAfter: ov.className};
            });
            await waitStored('dropped-header.txt', 8000);
            out.afterDrop2 = {...(await since(m)), panel: await panelState()};
            await snap(page, 'pan-16-after-header-drop', out.afterDrop2);
            record('pan-summary', out);
            log('[panel]', app.name, JSON.stringify({empty: out.empty, row: out.afterUpload.rows, main: out.afterMain.rows, set: out.setMain, other: out.otherPanel, saveNothing: out.saveNothing, supp: out.afterSupp.rows, editMain: out.editMain, unsaved: out.leaveUnsaved, reloaded: out.reloaded.rows, dl: out.download, rm: out.removeDialog, yes: out.afterYes, drop: out.drop, afterDrop: out.afterDrop}).slice(0, 9000));
        });

        // =====================================================================
        // Phase big (OJS, OMP): the progress row, "Cancel upload", leaving mid-upload, the size limit.
        if (on('big') && !isOPS) await sect('big', async () => {
            const T = sc.T; const id = sc.T.subs.p2.id; const out = {};
            const dir = path.join(outDir(), 'big'); fs.mkdirSync(dir, {recursive: true});
            const mkFile = (name, bytes, dense) => {
                const fp = path.join(dir, name);
                if (dense) fs.writeFileSync(fp, Buffer.alloc(bytes, 'k')); else { const fd = fs.openSync(fp, 'w'); fs.ftruncateSync(fd, bytes); fs.closeSync(fd); }
                return fp;
            };
            const slow = mkFile('slow-upload.txt', 3 * MiB, true);
            await signInAs(T.u.au, T.path);
            await openWizard(T.path, id, 'big-01-land');
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Network.enable');
            await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 150 * 1024});
            let m = mark();
            await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), slow);
            const samples = [];
            for (let i = 0; i < 8; i++) { await page.waitForTimeout(700); samples.push(await row('slow-upload.txt').innerText().then((t) => flat(t, 200)).catch(() => null)); }
            out.progressSamples = samples;
            await snap(page, 'big-02-uploading', {panel: await panelState(), samples});
            const cancel = row('slow-upload.txt').getByRole('button', {name: /Cancel upload/}).first();
            await loc(page, 'panel row "Cancel upload"', cancel);
            await cancel.click().catch((e) => { out.cancelErr = String(e.message).slice(0, 200); });
            await page.waitForTimeout(1500);
            out.afterCancel = {...(await since(m)), panel: await panelState()};
            await snap(page, 'big-03-after-cancel', out.afterCancel);
            await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
            out.afterCancelReload = await openWizard(T.path, id, 'big-04-after-cancel-reload');
            // leave the page while a file uploads
            await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 150 * 1024});
            m = mark();
            await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), slow);
            await page.waitForTimeout(1500);
            await page.goto(ctxUrl(T.path, '/submissions')).catch((e) => { out.leaveErr = String(e.message).slice(0, 200); });
            await idle(page);
            out.leave = {...(await since(m)), url: page.url().replace(/^.*\/index\.php/, '')};
            await cdp.send('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
            await page.waitForTimeout(3000);
            out.afterLeaveReload = await openWizard(T.path, id, 'big-05-after-leave-reload');
            // the size limit: 101 MiB, exactly 100 MiB, 99 MiB
            for (const [name, bytes] of [['big-101mib.txt', 101 * MiB], ['big-100mib.txt', 100 * MiB], ['big-99mib.txt', 99 * MiB]]) {
                const fp = mkFile(name, bytes, false);
                m = mark();
                await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), fp);
                const until = Date.now() + 90000;
                let st;
                while (Date.now() < until) {
                    st = await panelState();
                    const r = (st.rows || []).find((x) => x.text.includes(name));
                    if (r && (r.name || r.errors.length || /too big|error|responded|larger/i.test(r.text))) break;
                    await page.waitForTimeout(700);
                }
                await idle(page);
                const res = {...(await since(m)), row: ((await panelState()).rows || []).filter((x) => x.text.includes(name))};
                out[name] = res;
                await snap(page, `big-06-${name.replace(/\.txt$/, '')}`, res);
                log(`[${name}]`, JSON.stringify(res).slice(0, 1200));
            }
            // "Cancel upload" on a refused row
            m = mark();
            await row('big-101mib.txt').getByRole('button', {name: /Cancel upload/}).first().click().catch((e) => { out.cancelRefusedErr = String(e.message).slice(0, 200); });
            await page.waitForTimeout(800);
            out.cancelRefused = {...(await since(m)), rows: ((await panelState()).rows || []).map((x) => x.text)};
            await snap(page, 'big-06b-cancel-refused-row', out.cancelRefused);
            out.sizesReload = await openWizard(T.path, id, 'big-07-sizes-reload');
            // free the disk: remove what was stored
            for (const r of (out.sizesReload.rows || []).filter((x) => /big-|slow-upload/.test(x.text) && x.name)) {
                await row(r.name).getByRole('button', {name: 'Remove', exact: true}).click().catch(() => {});
                const rm = page.getByRole('dialog', {name: 'Remove'}).last();
                await rm.getByRole('button', {name: 'Yes', exact: true}).click().catch(() => {});
                await rm.waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page);
            }
            for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
            record('big-summary', out);
            log('[big]', app.name, JSON.stringify({samples: out.progressSamples, cancel: out.afterCancel, cancelReload: out.afterCancelReload.rows, leave: out.leave, leaveReload: out.afterLeaveReload.rows}).slice(0, 5000));
        });

        // =====================================================================
        // Phase gate (OJS, OMP): d8. g1: main file + a file with no component; g2: only a file with no component.
        if (on('gate') && !isOPS) await sect('gate', async () => {
            const T = sc.T; const out = {};
            await signInAs(T.u.au, T.path);
            // g2 first: no required file
            const g2 = sc.T.subs.g2.id;
            await openWizard(T.path, g2);
            await chooseFiles(panel().getByRole('button', {name: 'Upload File', exact: true}), MD);
            await waitStored('notes.md');
            out.g2steps = await toReview();
            out.g2review = await reviewState();
            await snap(page, 'gate-01-g2-review-nofile-component', {review: out.g2review});
            // g2 with the file set to a non-required component
            await openWizard(T.path, g2);
            await row('notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: /^\s*Other\s*$/}).first().click();
            await editPanel().waitFor({timeout: 15000});
            await editPanel().getByRole('radio', {name: SUPP, exact: true}).check();
            await editPanel().getByRole('button', {name: 'Save', exact: true}).click();
            await editPanel().waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page);
            await toReview();
            out.g2reviewSupp = await reviewState();
            await snap(page, 'gate-02-g2-review-supp-only', {review: out.g2reviewSupp});
            // g1: the main file and a file without a component
            const g1 = sc.T.subs.g1.id;
            await openWizard(T.path, g1);
            await chooseFiles(panel().getByRole('button', {name: 'Upload File', exact: true}), PDF);
            await waitStored('article.pdf');
            await setGenreLink('article.pdf', MAIN);
            await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), MD);
            await waitStored('notes.md');
            out.g1panel = await panelState();
            await snap(page, 'gate-03-g1-panel', {panel: out.g1panel});
            out.g1steps = await toReview();
            out.g1review = await reviewState();
            await snap(page, 'gate-04-g1-review', {review: out.g1review});
            // back to Upload Files from Review: the file keeps its question
            const up = page.locator('.pkpSteps__buttons').getByRole('button', {name: /Upload Files/}).first();
            if (await up.count()) { await up.click().catch(() => {}); await idle(page); await page.waitForTimeout(500); out.g1back = await panelState(); await snap(page, 'gate-05-g1-back-to-files', {panel: out.g1back}); await toReview(); }
            out.g1submit = await pressSubmit();
            await snap(page, 'gate-06-g1-after-submit', {submit: out.g1submit});
            // the editor's "Submission Files" list afterwards
            await signInAs(T.u.mgr, T.path);
            await openWf(wfUrl(T.path, g1, 'workflow_1'), 'gate-07-g1-editor-workflow');
            out.g1list = await rows('Submission Files');
            await snap(page, 'gate-08-g1-editor-list', {list: out.g1list});
            record('gate-summary', out);
            log('[gate]', app.name, JSON.stringify(out).slice(0, 6000));
        });

        // =====================================================================
        // Phase guidance: change "Upload Files" on C through the screen, leave the tab with an edit unsaved first.
        if (on('guidance')) await sect('guidance', async () => {
            const C = sc.C; const out = {};
            await signInAs(C.u.mgr, C.path);
            const goGuidance = async () => {
                await page.goto(ctxUrl(C.path, '/management/settings/workflow')); await idle(page);
                await page.getByRole('tab', {name: 'Submission', exact: true}).first().click().catch(() => {}); await idle(page);
                await page.getByRole('tab', {name: 'Author Guidance', exact: true}).first().click(); await idle(page);
                await page.waitForTimeout(800);
            };
            await goGuidance();
            const fieldIds = await page.evaluate(() => [...document.querySelectorAll('.pkpFormField')].filter((e) => e.getClientRects().length).map((e) => ({label: ((e.querySelector('.pkpFormFieldLabel, label') || {}).innerText || '').trim(), id: (e.querySelector('iframe') || {id: ''}).id.replace(/_ifr$/, '')})));
            const f = fieldIds.find((x) => /^Upload Files/.test(x.label));
            out.field = f;
            if (!f || !f.id) throw new Error(`no "Upload Files" box: ${JSON.stringify(fieldIds)}`);
            await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, f.id, {timeout: 20000});
            const body = page.frameLocator(`iframe#${f.id}_ifr`).locator('body');
            // edit, leave the tab unsaved
            await body.click(); await body.fill(`Unsaved guidance ${C.path}.`);
            let m = mark();
            await page.getByRole('tab', {name: 'Metadata', exact: true}).first().click().catch(() => {}); await idle(page);
            out.leaveTab = await since(m);
            await page.getByRole('tab', {name: 'Author Guidance', exact: true}).first().click().catch(() => {}); await idle(page);
            out.backValue = await page.evaluate((id) => window.tinymce.get(id).getContent({format: 'text'}), f.id).catch(() => null);
            await snap(page, 'gui-01-left-tab-unsaved', out);
            m = mark();
            await page.goto(ctxUrl(C.path, '/management/settings/website')).catch(() => {}); await idle(page);
            out.leavePage = await since(m);
            await goGuidance();
            out.valueAfterLeave = await page.evaluate((id) => window.tinymce.get(id) && window.tinymce.get(id).getContent({format: 'text'}), f.id).catch(() => null);
            // now save a custom text
            await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, f.id, {timeout: 20000});
            await body.click(); await body.fill(`K4 custom upload guidance ${C.path}.`);
            const form = page.locator('form, .pkpForm').filter({has: page.locator(`iframe#${f.id}_ifr`)}).first();
            m = mark();
            await form.getByRole('button', {name: 'Save', exact: true}).first().click();
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            out.save = await since(m);
            await snap(page, 'gui-02-saved', {save: out.save});
            await signInAs(C.u.au, C.path);
            out.wizard = await openWizard(C.path, C.subs.c1.id, 'gui-03-author-wizard-custom');
            if (isOPS) out.opsStepText = flat(await page.locator('.submissionWizard').first().innerText().catch(() => null), 1500);
            record('gui-summary', out);
            log('[guidance]', app.name, JSON.stringify(out).slice(0, 3000));
        });

        // =====================================================================
        // Phase comps: C's changed components, on every screen that offers components.
        if (on('comps')) await sect('comps', async () => {
            const C = sc.C; const out = {};
            await signInAs(C.u.mgr, C.path);
            out.tab = await componentsTab(C.path, 'cmp-01-components-tab-changed');
            if (!isOPS) {
                // the editor's list and upload wizard on c3
                await openWf(wfUrl(C.path, C.subs.c3.id, 'workflow_1'), 'cmp-02-c3-workflow');
                out.c3list = await rows('Submission Files');
                await openUpload('Submission Files');
                out.uploadWizard = await wizardState(page);
                await snap(page, 'cmp-03-upload-wizard-step1', {wizard: out.uploadWizard});
                await wizCancel();
                // the HTML file's dependent wizard
                try {
                    const t = table('Submission Files');
                    const r = t.locator('tbody tr').filter({hasText: 'article.html'}).first();
                    await r.getByRole('button', {name: /More Actions/}).first().click(); await page.waitForTimeout(300);
                    out.htmlMenu = await menuItems(page);
                    await page.getByRole('menuitem', {name: 'Update File Details'}).first().click(); await idle(page);
                    const ed = page.getByRole('dialog').filter({hasText: 'Edit a file'}).last();
                    await ed.waitFor({timeout: 20000});
                    const up = ed.locator('[id^="dependentFilesGridDiv"], [id*="dependent"]').getByRole('link', {name: /Upload/}).first();
                    await up.waitFor({timeout: 20000});
                    await up.click();
                    await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                    out.depWizard = await wizardState(page);
                    await snap(page, 'cmp-04-dependent-wizard-step1', {wizard: out.depWizard});
                    await wizCancel();
                    await ed.getByRole('button', {name: 'Cancel', exact: true}).or(ed.getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
                    await idle(page);
                } catch (e) { out.depErr = String(e.message).slice(0, 300); }
                // the author's panel on c1
                await signInAs(C.u.au, C.path);
                await openWizard(C.path, C.subs.c1.id);
                if (!(await row('notes.md').count())) { await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), MD); await waitStored('notes.md'); }
                out.c1panel = await panelState();
                await snap(page, 'cmp-05-c1-panel-links', {panel: out.c1panel});
                await row('notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: /^\s*Other\s*$/}).first().click().catch(() => {});
                await editPanel().waitFor({timeout: 15000}).catch(() => {});
                out.c1other = await editPanelState();
                await snap(page, 'cmp-06-c1-other-panel', {edit: out.c1other});
                await closeEditPanel();
                // choose the promoted component by its link: the badge
                const hasLink = await row('notes.md').locator('.listPanel--submissionFiles__setGenreButton').filter({hasText: new RegExp(`^\\s*${CMOD.main}\\s*$`)}).count();
                if (hasLink) { await setGenreLink('notes.md', CMOD.main); }
                if (!(await row('article.pdf').count())) { await chooseFiles(panel().getByRole('button', {name: 'Add File', exact: true}), PDF); await waitStored('article.pdf'); await setGenreLink('article.pdf', MAIN); }
                out.c1badges = await panelState();
                await snap(page, 'cmp-07-c1-badges', {panel: out.c1badges});
                // c2: the added required component missing
                await openWizard(C.path, C.subs.c2.id);
                if (!(await row('article.pdf').count())) { await chooseFiles(panel().getByRole('button', {name: 'Upload File', exact: true}), PDF); await waitStored('article.pdf'); await setGenreLink('article.pdf', MAIN); }
                await toReview();
                out.c2review = await reviewState();
                await snap(page, 'cmp-08-c2-review-required-missing', {review: out.c2review});
            } else {
                // a galley's wizard on the preprint server
                await openWf(wfUrl(C.path, C.subs.c3.id, `publication_${C.subs.c3.publicationId}_galleys`), 'cmp-02-ops-galleys');
                const add = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Add galley$/i}).first();
                await add.click(); await idle(page);
                const form = topWin(page);
                await form.locator('input[name="label"]').waitFor({timeout: 20000});
                await form.locator('input[name="label"]').fill('PDF');
                await form.getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page);
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                out.uploadWizard = await wizardState(page);
                await snap(page, 'cmp-03-ops-galley-wizard-step1', {wizard: out.uploadWizard});
                await wizCancel();
            }
            record('cmp-summary', out);
            log('[comps]', app.name, JSON.stringify(out).slice(0, 7000));
        });

        // =====================================================================
        // Phase ensure (OJS, OMP): the anonymizing link by stage; T is the off end.
        if (on('ensure') && !isOPS) await sect('ensure', async () => {
            const E = sc.E; const out = {};
            const step1 = async (key, label) => {
                const st = await wizardState(page);
                await snap(page, label, {wizard: st});
                out[key] = {title: st.title, link: st.ensuringLink};
                return st;
            };
            await signInAs(sc.T.u.mgr, sc.T.path);
            await openWf(wfUrl(sc.T.path, sc.T.subs.s1.id, 'workflow_1'));
            await openUpload('Submission Files'); await step1('offSubmission', 'ens-00-off-submission-step1'); await wizCancel();
            await signInAs(E.u.mgr, E.path);
            await openWf(wfUrl(E.path, E.subs.e1.id, 'workflow_1'));
            await openUpload('Submission Files');
            await step1('submission', 'ens-01-submission-step1');
            const link = wiz().getByRole('link', {name: /anonymized/}).first();
            await loc(page, 'upload wizard step 1 "How to ensure all files are anonymized"', link);
            if (await link.count()) {
                const m = mark();
                const pop = page.context().waitForEvent('page', {timeout: 4000}).catch(() => null);
                await link.click(); await page.waitForTimeout(1200); await idle(page);
                const p = await pop;
                out.linkOpens = {dialogs: (await dialogTexts(page)).slice(-1).map((x) => ({name: x.name, text: flat(x.text, 1200), buttons: x.buttons})), newTab: p ? p.url() : null, ...(await since(m))};
                if (p) await p.close().catch(() => {});
                await snap(page, 'ens-02-link-opened', {linkOpens: out.linkOpens});
                const tw = topWin(page);
                if (!(await tw.locator('div[id^="fileUploadWizard"]').count())) { await tw.getByRole('button', {name: /^(Close|OK)$/}).first().click().catch(() => {}); await idle(page); }
            }
            await wizCancel();
            if (isOMP) {
                await openWf(wfUrl(E.path, E.subs.e2i.id), 'ens-03-internal-workflow');
                try { await openUpload('Files for Review'); await step1('internalFilesForReview', 'ens-04-internal-files-for-review-step1'); await wizCancel(); await closeUploadSelect(); } catch (e) { out.internalErr = String(e.message).slice(0, 200); }
            }
            await openWf(wfUrl(E.path, E.subs.e2.id), 'ens-05-review-workflow');
            try { await openUpload('Revisions Uploaded'); await step1('reviewRevisions', 'ens-06-review-revisions-step1'); await wizCancel(); } catch (e) { out.revErr = String(e.message).slice(0, 200); }
            try { await openUpload('Files for Review'); await step1('reviewFilesForReview', 'ens-07-review-files-for-review-step1'); await wizCancel(); await closeUploadSelect(); } catch (e) { out.ffrErr = String(e.message).slice(0, 200); }
            await openWf(wfUrl(E.path, E.subs.e4.id, 'workflow_4'), 'ens-08-copyediting-workflow');
            try { await openUpload('Draft Files'); await step1('copyeditingDraft', 'ens-09-draft-files-step1'); await wizCancel(); await closeUploadSelect(); } catch (e) { out.draftErr = String(e.message).slice(0, 200); }
            try { await openUpload('Copyedited'); await step1('copyedited', 'ens-10-copyedited-step1'); await wizCancel(); await closeUploadSelect(); } catch (e) {
                try { await openUpload('Copyedited Files'); await step1('copyedited', 'ens-10-copyedited-step1'); await wizCancel(); await closeUploadSelect(); } catch (e2) { out.copyeditedErr = String(e2.message).slice(0, 200); }
            }
            await openWf(wfUrl(E.path, E.subs.e5.id, 'workflow_5'), 'ens-11-production-workflow');
            try { await openUpload('Production Ready Files'); await step1('production', 'ens-12-production-step1'); await wizCancel(); } catch (e) { out.prodErr = String(e.message).slice(0, 200); }
            // the E box as the Review › Setup tab shows it
            await page.goto(ctxUrl(E.path, '/management/settings/workflow')); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).first().click().catch(() => {}); await idle(page); await page.waitForTimeout(600);
            out.eBox = await page.getByRole('checkbox', {name: /anonymized/}).first().isChecked().catch(() => null);
            await snap(page, 'ens-13-e-review-setup', {checked: out.eBox});
            record('ens-summary', out);
            log('[ensure]', app.name, JSON.stringify(out).slice(0, 4000));
        });

        // =====================================================================
        // Phase stage (OJS, OMP): the Copyeditor role's "Submission" box on E, both ends, for the assigned ce on e4.
        if (on('stage') && !isOPS) await sect('stage', async () => {
            const E = sc.E; const out = {}; const id = E.subs.e4.id;
            const ceView = async (label) => {
                await signInAs(E.u.ce, E.path);
                const r = {};
                await openWf(wfUrl(E.path, id), `${label}-landing`);
                r.nav = await page.locator('[role="dialog"]:visible').first().evaluate((d) => [...d.querySelectorAll('nav a, nav button, [role="menuitem"], .pkpSideNav a, .pkpSideNav button')].filter((e) => e.getClientRects().length).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 30)).catch(() => []);
                r.tables = await page.locator('[role="dialog"]:visible').first().getByRole('table').evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label') || (t.querySelector('caption') || {}).innerText || null)).catch(() => []);
                await openWf(wfUrl(E.path, id, 'workflow_1'));
                const s = await snap(page, `${label}-submission-stage`);
                r.submissionStage = {text: flat(s.text && s.text.dialog, 700), list: await rows('Submission Files')};
                return r;
            };
            out.before = await ceView('stg-01-ce-before');
            // tick the Copyeditor role's "Submission" box
            await signInAs(E.u.mgr, E.path);
            out.gridBefore = await rolesGrid(E.path, 'stg-02-roles-before');
            const toggle = async (want) => {
                const res = await page.evaluate(() => {
                    const t = [...document.querySelectorAll('table')].find((x) => x.getClientRects().length && /Permission level/.test(x.innerText));
                    const head = [...t.querySelectorAll('thead th')].map((x) => x.innerText.trim());
                    const col = head.indexOf('Submission');
                    const tr = [...t.querySelectorAll('tr.gridRow')].find((r) => /Copyeditor\s*$/.test((r.querySelector('td') || {}).innerText || ''));
                    if (!tr) return {err: 'no row'};
                    const cb = tr.querySelectorAll('td')[col].querySelector('input[type=checkbox]');
                    cb.setAttribute('data-k4', 'stage-box');
                    return {col, checked: cb.checked, id: cb.id};
                });
                if (res.err) return res;
                if (res.checked !== want) {
                    const m = mark();
                    await page.locator('input[data-k4="stage-box"]').click();
                    await page.waitForTimeout(1200); await idle(page);
                    res.after = await since(m);
                }
                return res;
            };
            out.tick = await toggle(true);
            out.gridAfter = await rolesGrid(E.path, 'stg-03-roles-after-tick');
            out.after = await ceView('stg-04-ce-after');
            await signInAs(E.u.mgr, E.path);
            await rolesGrid(E.path, 'stg-05-roles-restore');
            out.untick = await toggle(false);
            out.gridRestored = await rolesGrid(E.path, 'stg-06-roles-restored');
            out.restored = await ceView('stg-07-ce-restored');
            record('stg-summary', out);
            log('[stage]', app.name, JSON.stringify({before: out.before, tick: out.tick, after: out.after, untick: out.untick, restored: out.restored}).slice(0, 5000));
        });

        // =====================================================================
        // Phase lang: the "Name the file" boxes, one-language T vs English + French E (en and fr_CA submissions).
        if (on('lang')) await sect('lang', async () => {
            const out = {};
            const step2 = async (C, sub, label) => {
                if (!isOPS) {
                    await openWf(wfUrl(C.path, sub.id, 'workflow_1'));
                    await openUpload('Submission Files');
                } else {
                    await openWf(wfUrl(C.path, sub.id, `publication_${sub.publicationId}_galleys`));
                    await page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Add galley$/i}).first().click(); await idle(page);
                    const form = topWin(page);
                    await form.locator('input[name="label"]').waitFor({timeout: 20000});
                    await form.locator('input[name="label"]').fill('PDF');
                    await form.getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page);
                    await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                }
                await pickGenre(MAIN); await attach(PDF); await toStep2();
                const st = await wizardState(page);
                await snap(page, label, {wizard: st});
                const fr = wiz().getByRole('button', {name: /French/}).first();
                let frState = null;
                if (await fr.count()) { await fr.click(); await page.waitForTimeout(500); frState = await wizardState(page); await snap(page, `${label}-french-tab`, {wizard: frState}); }
                await wizCancel();
                return {tabsOrButtons: st.langButtons, inputs: st.inputs, labels: st.labels, fr: frState && {buttons: frState.langButtons, inputs: frState.inputs}};
            };
            await signInAs(sc.T.u.mgr, sc.T.path);
            out.oneLanguage = await step2(sc.T, sc.T.subs.s1, 'lng-01-one-language-step2');
            await signInAs(sc.E.u.mgr, sc.E.path);
            out.enSubmission = await step2(sc.E, sc.E.subs.e1, 'lng-02-en-fr-context-en-submission-step2');
            out.frSubmission = await step2(sc.E, sc.E.subs.ef, 'lng-03-en-fr-context-fr-submission-step2');
            // E's Languages grid
            await page.goto(ctxUrl(sc.E.path, '/management/settings/website')); await idle(page);
            await page.getByRole('tab', {name: 'Setup', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.getByRole('tab', {name: 'Languages', exact: true}).first().click().catch(() => {}); await idle(page);
            await page.waitForTimeout(800);
            out.eLanguages = await page.evaluate(() => [...document.querySelectorAll('table')].filter((t) => t.getClientRects().length).map((t) => ({head: [...t.querySelectorAll('th')].map((x) => x.innerText.trim()), rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((td) => { const cb = td.querySelector('input[type=checkbox], input[type=radio]'); return cb ? (cb.checked ? '[x]' : '[ ]') : td.innerText.trim().replace(/\s+/g, ' '); }))})));
            await snap(page, 'lng-04-e-languages', {languages: out.eLanguages});
            record('lng-summary', out);
            log('[lang]', app.name, JSON.stringify(out).slice(0, 5000));
        });

        // =====================================================================
        // Phase ops: the preprint server's "Upload Files" step (no "Files" panel), as the author.
        if (on('ops') && isOPS) await sect('ops', async () => {
            const T = sc.T; const out = {};
            await signInAs(T.u.au, T.path);
            out.panel = await openWizard(T.path, T.subs.p1.id, 'ops-01-author-upload-files-step');
            out.step = await page.evaluate(() => {
                const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
                const w = document.querySelector('.submissionWizard') || document.body;
                return {heads: [...w.querySelectorAll('h1,h2,h3,h4')].filter((e) => e.getClientRects().length).map((e) => f(e.innerText)), text: f(w.innerText).slice(0, 2000),
                    buttons: [...w.querySelectorAll('button, a')].filter((e) => e.getClientRects().length).map((e) => f(e.innerText)).filter(Boolean).slice(0, 40),
                    kindPrompt: /What kind of file is this/.test(w.innerText)};
            });
            record('ops-summary', out);
            log('[ops]', JSON.stringify(out).slice(0, 3000));
        });

        // =====================================================================
        // Phase meta: a component's "File Metadata" decides step 2's fields (Document, Supplementary Content,
        // Artwork; OMP's Appendix: Document with the supplementary box ticked); then the Components tab's
        // own actions ("Order", "Restore Defaults") on T.
        if (on('meta')) await sect('meta', async () => {
            const T = sc.T; const out = {};
            const PNG = path.join(FIX, 'profile-image-400.png');
            await signInAs(T.u.mgr, T.path);
            const openT = async () => {
                if (!isOPS) { await openWf(wfUrl(T.path, T.subs.s1.id, 'workflow_1')); await openUpload('Submission Files'); return; }
                await openWf(wfUrl(T.path, T.subs.s1.id, `publication_${T.subs.s1.publicationId}_galleys`));
                await page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Add galley$/i}).first().click(); await idle(page);
                const form = topWin(page);
                await form.locator('input[name="label"]').waitFor({timeout: 20000});
                await form.locator('input[name="label"]').fill('META');
                await form.getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page);
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
            };
            const comps = isOMP ? [MAIN, 'Prospectus', 'Figure', 'Appendix'] : [MAIN, SUPP];
            for (const g of comps) {
                try {
                    await openT(); await pickGenre(g); await attach(g === 'Figure' ? PNG : PDF); await toStep2();
                    const st = await wizardState(page);
                    out[g] = {labels: st.labels, inputs: st.inputs.map((i) => i.name)};
                    await snap(page, `meta-${g.replace(/\W+/g, '-').toLowerCase()}-step2`, {wizard: st});
                    await wizCancel();
                } catch (e) { out[g] = {error: String(e.message).slice(0, 200)}; await wizCancel().catch(() => {}); }
            }
            if (!isOMP && !isOPS) {
                // Artwork on a journal: "Image", only through the HTML file's dependent wizard (C's c3)
                try {
                    await signInAs(sc.C.u.mgr, sc.C.path);
                    await openWf(wfUrl(sc.C.path, sc.C.subs.c3.id, 'workflow_1'));
                    const r = table('Submission Files').locator('tbody tr').filter({hasText: 'article.html'}).first();
                    await r.getByRole('button', {name: /More Actions/}).first().click(); await page.waitForTimeout(300);
                    await page.getByRole('menuitem', {name: 'Update File Details'}).first().click(); await idle(page);
                    const ed = page.getByRole('dialog').filter({hasText: 'Edit a file'}).last();
                    await ed.locator('[id^="dependentFilesGridDiv"], [id*="dependent"]').getByRole('link', {name: /Upload/}).first().click();
                    await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                    await pickGenre('Image'); await attach(PNG); await toStep2();
                    const st = await wizardState(page);
                    out.Image = {labels: st.labels, inputs: st.inputs.map((i) => i.name)};
                    await snap(page, 'meta-image-dependent-step2', {wizard: st});
                    await wizCancel();
                    await signInAs(T.u.mgr, T.path);
                } catch (e) { out.Image = {error: String(e.message).slice(0, 200)}; }
            }
            // The Components tab's own actions on T (sweep)
            await componentsTab(T.path, 'meta-10-components-tab');
            const grid = page.locator('[id^="component-grid-settings-genre"]').first();
            let m = mark();
            await grid.getByRole('link', {name: 'Order', exact: true}).first().click().catch(() => {}); await idle(page); await page.waitForTimeout(500);
            out.order = {...(await since(m)), links: await grid.locator('a:visible, button:visible').allInnerTexts().catch(() => [])};
            await snap(page, 'meta-11-order-pressed', {order: out.order});
            const done = grid.getByRole('link', {name: /^(Cancel|Done|Save)$/}).or(grid.getByRole('button', {name: /^(Cancel|Done|Save)$/})).first();
            if (await done.count()) { await done.click().catch(() => {}); await idle(page); }
            m = mark();
            await grid.getByRole('link', {name: 'Restore Defaults', exact: true}).first().click().catch(() => {}); await page.waitForTimeout(800);
            out.restoreDialog = (await dialogTexts(page)).slice(-1)[0] || null;
            await snap(page, 'meta-12-restore-defaults-pressed', {dialog: out.restoreDialog, js: await since(m)});
            const ok = topWin(page).getByRole('button', {name: /^(OK|Yes|Confirm)$/}).or(topWin(page).getByRole('link', {name: /^(OK|Yes)$/})).first();
            if (out.restoreDialog && await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(800); }
            out.restore = {...(await since(m))};
            out.afterRestore = await componentsTab(T.path, 'meta-13-after-restore');
            record('meta-summary', out);
            log('[meta]', app.name, JSON.stringify(out).slice(0, 4000));
        });
    } finally {
        await signOut(page).catch(() => {});
        await close();
    }
    log('[done]', app.name);
});
