// U36 claim check, chunk K2: the upload wizard ("1. Upload File", "2. Review
// Details", "3. Confirm", "Cancel", the header "Close"), revising a file and the
// Cancel restore, "Update File Details" ("Edit a file"), dependent files and the
// amendment notice, on OJS and OMP; OPS where it has the wizard (a galley's file).
// Spec: docs/specs/U36-submission-files.md lines 75–95, 152–233, 514–534.
//
// Per app one scratch context T (users mgr, ed2 [a second manager-level
// editor], se, fc [Funding coordinator], au) and, on OJS/OMP, a second context
// T2 with "Present a link to how to ensure all files are anonymized" on and
// English + French submission languages. Submissions (author au, files seeded):
//   sw   Submission stage, au's article.pdf, se+fc assigned  → the wizard step by step as mgr (phase wiz)
//   sx   Submission stage, au's article.pdf, se+fc assigned  → read-only: each role's step 1 (phase roles)
//   sf   Submission stage, au's article.pdf                  → step 2 fields, "Edit a file" (phase fields)
//   r1…r5 Submission stage, au's article.pdf                 → revise + Cancel / Complete (phase revise)
//   sa   Submission stage, au's article.pdf + mgr's notes.md → the Author's row menus (phase author, A2)
//   sv   Review round, revisions requested, a round file     → Revisions Uploaded, amendment notice (phase review)
//   sc   Copyediting                                         → the Copyediting windows' titles (phase copyedit)
//   sp   Production                                          → Production Ready, dependent files (phase prod)
//   T2: l1 Submission stage, l2 review round, l3 production  → the anonymizing link, the name boxes (phase ensure)
// OJS/OPS: g1 production with a PDF galley, g2 with an HTML galley (phase galley).
//
//   PROBE_FEATURE=U36 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U36/K2/k2.js
//   PHASES=seed,wiz,roles,fields,revise,author,review,copyedit,prod,ensure,galley (default all; state in k2-state-<app>.json)
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const ALL = ['seed', 'wiz', 'roles', 'fields', 'revise', 'author', 'review', 'copyedit', 'prod', 'ensure', 'galley', 'lang', 'gpub'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

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
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
    }))).catch(() => []);
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
const wizardDialog = (page) => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();

// Everything step 1–3 of the open wizard shows, as data.
async function wizardState(page) {
    const wiz = wizardDialog(page);
    if (!(await wiz.count())) return {open: false};
    return wiz.evaluate((d) => {
        const vis = (e) => e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
        const labelOf = (el) => {
            const sec = el.closest('.section, fieldset, .pkp_form_section, div');
            const lab = (el.id && d.querySelector(`label[for="${el.id}"]`)) || null;
            const title = el.closest('.section') && el.closest('.section').querySelector('label, .label, legend');
            return (lab && lab.innerText.trim()) || (title && title.innerText.trim()) || (sec && sec.previousElementSibling && sec.previousElementSibling.innerText && sec.previousElementSibling.innerText.trim().slice(0, 200)) || null;
        };
        const sel = (q) => {
            const el = d.querySelector(q);
            if (!el) return {present: false};
            const sec = el.closest('.section');
            return {
                present: true, visible: vis(el), disabled: el.disabled,
                sectionTitle: sec ? (sec.querySelector('label, legend, .label') || {}).innerText?.trim() || flatten(sec.innerText.split('\n')[0]) : null,
                label: labelOf(el),
                options: [...el.options].map((o) => ({text: o.text.trim(), value: o.value, selected: o.selected})),
            };
        };
        function flatten(s) { return (s || '').replace(/\s+/g, ' ').trim(); }
        const tabs = [...d.querySelectorAll('[role=tab]')].map((t) => ({
            text: flatten(t.innerText), selected: t.getAttribute('aria-selected') === 'true',
            disabled: t.getAttribute('aria-disabled') === 'true' || t.classList.contains('ui-state-disabled'),
        }));
        const panel = [...d.querySelectorAll('[role=tabpanel]')].find((p) => vis(p) && p.getAttribute('aria-hidden') !== 'true') || d;
        const uploader = d.querySelector('.pkp_controller_fileUpload');
        const dropLabel = d.querySelector('.pkp_uploader_drop_zone_label');
        const upBtn = d.querySelector('.pkp_uploader_button');
        const btnText = upBtn ? [...upBtn.querySelectorAll('span')].filter(vis).map((s) => flatten(s.innerText)) : null;
        const fname = d.querySelector('.pkpUploaderFilename');
        const buttons = [...d.querySelectorAll('button, a')].filter(vis).map((b) => ({tag: b.tagName.toLowerCase(), text: flatten(b.innerText || b.getAttribute('aria-label') || ''), disabled: !!b.disabled || b.getAttribute('aria-disabled') === 'true' || b.classList.contains('ui-state-disabled')})).filter((b) => b.text);
        const h = [...d.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((e) => flatten(e.innerText));
        const labels = [...panel.querySelectorAll('label, legend, .pkpFormFieldLabel, .pkpFormField__heading, .label')].filter(vis).map((e) => flatten(e.innerText)).filter(Boolean);
        const descs = [...panel.querySelectorAll('.pkpFormField__description, .description, p')].filter(vis).map((e) => flatten(e.innerText)).filter(Boolean).slice(0, 30);
        const inputs = [...panel.querySelectorAll('input:not([type=hidden]), textarea, select')].filter((e) => vis(e) || (e.tagName === 'TEXTAREA' && e.closest('.pkpFormField'))).map((e) => ({
            tag: e.tagName.toLowerCase(), type: e.type, name: e.name || null, id: e.id || null,
            value: e.tagName === 'SELECT' ? (e.options[e.selectedIndex] || {}).text : (e.value || '').slice(0, 200),
            label: labelOf(e), visible: vis(e), disabled: !!e.disabled,
        }));
        const errors = [...d.querySelectorAll('.pkpFieldError, .pkpFormField__error, .error, [class*="rror"]')].filter(vis).map((e) => flatten(e.innerText)).filter(Boolean).slice(0, 10);
        const dep = [...d.querySelectorAll('[id^="dependentFilesGridDiv"], [id*="dependent"]')].filter(vis).map((e) => flatten(e.innerText).slice(0, 800));
        return {
            open: true,
            title: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText.trim()) || null,
            headings: h, tabs,
            revise: sel('select[id^="revisedFileId"]'),
            genre: sel('select[id^="genreId"]'),
            uploader: uploader ? {visible: vis(uploader), dropLabel: dropLabel && vis(dropLabel) ? flatten(dropLabel.innerText) : null, buttonSpans: btnText, fileName: fname && vis(fname) ? flatten(fname.innerText) : null} : null,
            ensuringLink: [...d.querySelectorAll('a')].filter((a) => /anonymi/i.test(a.innerText)).map((a) => ({text: flatten(a.innerText), visible: vis(a)})),
            buttons, labels, descs, inputs, errors, dependent: dep,
            panelText: flatten(panel.innerText).slice(0, 3000),
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
    const HTML = path.join(FIX, isOPS ? 'preprint.html' : 'article.html');
    const PNG = path.join(FIX, 'profile-image-400.png');
    const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
    const REV = path.join(outDir(), 'article-rev.pdf');
    const REV2 = path.join(outDir(), 'second-file.pdf');
    fs.copyFileSync(PDF, REV);
    fs.copyFileSync(PDF, REV2);
    fs.copyFileSync(PDF, path.join(outDir(), 'close-step1.pdf'));
    const MAIN = isOMP ? 'Book Manuscript' : (isOPS ? 'Preprint Text' : 'Article Text');
    const SUPP = isOMP ? 'Prospectus' : 'Research Instrument';

    const ctxUrl = (ctx, p) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (ctx, id, key) => ctxUrl(ctx, `/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorUrl = (ctx, id, key) => ctxUrl(ctx, `/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc.T) {
        const t = tag('u36k2');
        const roleUsers = isOPS
            ? [['mgr', 'manager', 'Mira', 'Manager'], ['ed2', 'manager', 'Bert', 'Second'], ['se', 'sectionEditor', 'Sid', 'Moderator'], ['au', 'author', 'Ava', 'Author']]
            : [['mgr', 'manager', 'Mira', 'Manager'], ['ed2', 'editor', 'Bert', 'Second'], ['se', 'sectionEditor', 'Sid', 'Section'],
                ['fc', 'funding', 'Fay', 'Funding'], ['au', 'author', 'Ava', 'Author']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U36 K2 ${t}`, acronym: 'U36K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.T = ctx.path || t; sc.roleKeys = Object.fromEntries(roleUsers.map(([k, r]) => [k, r]));
        sc.u = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        record('seed-context', ctx);
        const u = sc.u;
        const part = (k) => ({username: u[k], role: sc.roleKeys[k]});
        const own = [{file: 'article.pdf'}];
        const toReview = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
        let seeds;
        if (isOPS) {
            seeds = {
                g1: {title: `K2 G1 pdf galley ${t}`, participants: [part('se')], galleys: [{label: 'PDF', file: 'preprint.pdf'}]},
                g2: {title: `K2 G2 html galley ${t}`, participants: [part('se')], galleys: [{label: 'HTML', file: 'preprint.html'}]},
                g3: {title: `K2 G3 no galley ${t}`, participants: [part('se')]},
            };
        } else {
            seeds = {
                sw: {title: `K2 SW wizard ${t}`, files: own, participants: [part('se'), part('fc')]},
                sx: {title: `K2 SX roles ${t}`, files: own, participants: [part('se'), part('fc')]},
                sf: {title: `K2 SF fields ${t}`, files: own, participants: [part('se')]},
                r1: {title: `K2 R1 revise cancel ${t}`, files: own, participants: [part('se')]},
                r2: {title: `K2 R2 same-user rename ${t}`, files: own, participants: [part('se')]},
                r3: {title: `K2 R3 other-user rename ${t}`, files: own, participants: [part('se')]},
                r4: {title: `K2 R4 renamer revises ${t}`, files: own, participants: [part('se')]},
                r5: {title: `K2 R5 revise complete ${t}`, files: own, participants: [part('se')]},
                sa: {title: `K2 SA author menus ${t}`, files: [{file: 'article.pdf'}, {file: 'notes.md', genre: SUPP, uploader: u.mgr}], participants: [part('se')]},
                sv: {title: `K2 SV revisions ${t}`, files: own, decisions: [...toReview, 'requestRevisions'], reviewRounds: [{files: [{file: 'article.pdf'}]}], participants: [part('se')]},
                sc: {title: `K2 SC copyediting ${t}`, files: own, decisions: ['skipExternalReview'], participants: [part('se')]},
                sp: {title: `K2 SP production ${t}`, files: own, decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se')]},
            };
            if (!isOMP) {
                seeds.g1 = {title: `K2 G1 pdf galley ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se')], galleys: [{label: 'PDF', file: 'article.pdf'}]};
                seeds.g2 = {title: `K2 G2 html galley ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se')], galleys: [{label: 'HTML', file: 'article.html'}]};
                seeds.g3 = {title: `K2 G3 no galley ${t}`, decisions: ['skipExternalReview', 'sendToProduction'], participants: [part('se')]};
            }
        }
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try {
                const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.T, submitter: u.au, ...spec});
                sc.subs[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, files: r.files, galleys: r.galleys, rounds: r.reviewRounds};
                log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId);
            } catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        if (!isOPS) {
            const t2 = tag('u36k2l');
            const ctx2 = await app.api.createContext({tag: t2, context: {name: `U36 K2 L ${t2}`, acronym: 'U36K2L', contactName: 'K2 Contact', contactEmail: `${t2}contact@mail.test`,
                supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA']},
            review: {showEnsuringLink: true},
            users: [{username: `${t2}mgr`, roles: ['manager'], givenName: 'Lia', familyName: 'Manager'}, {username: `${t2}au`, roles: ['author'], givenName: 'Lou', familyName: 'Author'}]});
            record('seed-context2', ctx2);
            sc.T2 = ctx2.path || t2; sc.u2 = {mgr: `${t2}mgr`, au: `${t2}au`};
            const s2 = {
                l1: {title: `K2 L1 submission ${t2}`, files: own},
                l2: {title: `K2 L2 review ${t2}`, files: own, decisions: [...toReview, 'requestRevisions'], reviewRounds: [{files: [{file: 'article.pdf'}]}]},
                l3: {title: `K2 L3 production ${t2}`, files: own, decisions: ['skipExternalReview', 'sendToProduction']},
            };
            sc.subs2 = {};
            for (const [k, spec] of Object.entries(s2)) {
                try {
                    const r = await app.api.createSubmission({tag: `${t2}${k}`, context: sc.T2, submitter: sc.u2.au, locale: 'en', ...spec});
                    sc.subs2[k] = {id: r.submissionId, publicationId: r.publicationId, stageId: r.stageId, files: r.files};
                    log(`[seed2 ${k}]`, r.submissionId, 'stage', r.stageId);
                } catch (e) { log(`[seed2 ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs2[k] = {error: String(e.message).slice(0, 600)}; }
            }
        }
        save(); record('seed', sc);
    }
    if (!sc.T) { log('[k2] no state; run the seed phase first'); return; }
    const u = sc.u; const S = sc.subs || {};

    const {page, close} = await launch(app);
    // The screens' own traffic, observed: the wizard's and file API's requests and the cancel answer.
    const traffic = [];
    const jsDialogs = [];
    let dialogMode = 'accept';
    page.on('dialog', (d) => { jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300), answered: dialogMode}); (dialogMode === 'dismiss' ? d.dismiss() : d.accept()).catch(() => {}); });
    page.on('request', (r) => {
        const url = r.url();
        if (r.method() !== 'GET' && /manage-file-api|file-upload-wizard|FileUploadWizard|ManageFileApi|dependent|submission-files|\/files/.test(url)) {
            traffic.push({at: new Date().toISOString(), method: r.method(), url: url.replace(/^.*\/index\.php/, '').slice(0, 220), post: (r.postData() || '').replace(/csrfToken=[^&]+/, 'csrfToken=…').slice(0, 300)});
        }
    });
    page.on('response', async (r) => {
        if (/cancel-file-upload|cancelFileUpload|save-metadata|saveMetadata|delete-file|deleteFile/.test(r.url())) {
            try { traffic.push({at: new Date().toISOString(), response: r.url().replace(/^.*\/index\.php/, '').slice(0, 160), status: r.status(), body: (await r.text()).slice(0, 300)}); } catch (e) { /* gone */ }
        }
    });
    // Page notices (toasts) raised by an action: a watcher installed in every page.
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
    const mark = () => ({t: Date.now(), d: jsDialogs.length, r: traffic.length});
    const since = async (m) => ({jsDialogs: jsDialogs.slice(m.d), traffic: traffic.slice(m.r), notices: await noticesSince(m.t)});

    const signInAs = async (user, ctx = sc.T) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    async function openWf(url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        await page.waitForTimeout(300);
        if (label) return snap(page, label);
        return null;
    }
    const table = (name) => page.locator('[role="dialog"]:visible').first().getByRole('table', {name, exact: true}).first();
    async function rows(name) {
        const t = table(name);
        if (!(await t.count())) return {absent: true};
        await t.locator('tbody tr').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        return t.evaluate((el) => ({
            columns: [...el.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...el.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td, th')].map((c) => c.innerText.trim().replace(/\s+/g, ' '))),
        }));
    }
    async function openUpload(listName, {button = 'Upload'} = {}) {
        const t = table(listName);
        await t.waitFor({timeout: 30000});
        const container = page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: listName, exact: true})}).last();
        const btn = container.getByRole('button', {name: button, exact: true});
        await loc(page, `"${listName}" › "${button}"`, btn);
        await btn.click();
        await wizardDialog(page).locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        await idle(page);
    }
    async function wizSnap(label, extra) {
        const st = await wizardState(page);
        // what a person sees: Playwright's own visibility of the upload box's parts
        st.shown = {
            // the box is hidden with the class pkp_screen_reader (off-screen, still read aloud), which isVisible() misses
            uploaderScreenReaderOnly: await wiz().locator('.pkp_controller_fileUpload').first().evaluate((e) => e.classList.contains('pkp_screen_reader')).catch(() => null),
            uploadButton: await wiz().locator('.pkp_uploader_button').first().isVisible().catch(() => null),
            dropLabel: await wiz().locator('.pkp_uploader_drop_zone_label').first().isVisible().catch(() => null),
            reviseSelect: await wiz().locator('select[id^="revisedFileId"]').first().isVisible().catch(() => null),
            genreSelect: await wiz().locator('select[id^="genreId"]').first().isVisible().catch(() => null),
        };
        await snap(page, label, {wizard: st, ...(extra || {})});
        log(`[${label}]`, JSON.stringify({title: st.title, tabs: st.tabs && st.tabs.map((x) => `${x.text}${x.selected ? '*' : ''}${x.disabled ? '(dis)' : ''}`), shown: st.shown, genre: st.genre && st.genre.present ? `${st.genre.disabled ? 'dis ' : ''}${(st.genre.options || []).map((o) => o.text + (o.selected ? '*' : '')).join('|')}` : 'absent', revise: st.revise && st.revise.present ? (st.revise.options || []).map((o) => o.text + (o.selected ? '*' : '')).join('|') : 'absent', uploader: st.uploader, cont: (st.buttons || []).filter((b) => /Continue|Complete/.test(b.text))}).slice(0, 900));
        return st;
    }
    const wiz = () => wizardDialog(page);
    const contBtn = () => wiz().getByRole('button', {name: 'Continue', exact: true});
    async function waitContinueEnabled(timeout = 30000) {
        const until = Date.now() + timeout;
        while (Date.now() < until) {
            if (await contBtn().isEnabled().catch(() => false)) return true;
            await page.waitForTimeout(200);
        }
        return false;
    }
    async function pickGenre(label) { const g = wiz().locator('select[id^="genreId"]'); if (await g.count()) await g.selectOption({label}); }
    async function pickRevise(match) {
        const r = wiz().locator('select[id^="revisedFileId"]');
        const opts = await r.locator('option').allTextContents();
        const idx = opts.findIndex((t) => t.includes(match));
        if (idx >= 0) await r.selectOption({index: idx});
        await page.waitForTimeout(300);
        return {opts, idx};
    }
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
        await idle(page); await page.waitForTimeout(500); await idle(page);
    }
    async function wizCancel() {
        const c = wiz().getByRole('link', {name: 'Cancel', exact: true}).or(wiz().getByRole('button', {name: 'Cancel', exact: true})).first();
        await loc(page, 'wizard bottom "Cancel"', c);
        await c.click();
        await page.waitForTimeout(1200);
        await wiz().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400); await idle(page);
        return {stillOpen: (await wiz().count()) > 0 && await wiz().isVisible().catch(() => false)};
    }
    async function wizClose() {
        const c = wiz().getByRole('button', {name: 'Close', exact: true}).first();
        await loc(page, 'wizard header "Close"', c);
        await c.click();
        await page.waitForTimeout(800);
        await wiz().waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400); await idle(page);
        return {stillOpen: (await wiz().count()) > 0 && await wiz().isVisible().catch(() => false)};
    }
    // Fill the step-2 / Edit-a-file name box(es).
    const nameBoxes = (scope) => scope.locator('input[type="text"]:visible').filter({hasNot: page.locator('[readonly]')});
    async function rowMenu(listName, rowText, press, label) {
        const t = table(listName);
        const row = t.locator('tbody tr').filter({hasText: rowText}).first();
        await row.waitFor({timeout: 20000});
        const btn = row.getByRole('button', {name: /More Actions/}).first();
        await btn.click(); await page.waitForTimeout(250);
        const items = await menuItems(page);
        if (press) {
            const it = page.getByRole('menuitem', {name: press}).first();
            await it.click(); await idle(page); await page.waitForTimeout(500); await idle(page);
        } else { await btn.click().catch(() => {}); await page.waitForTimeout(200); }
        if (label) record(`${label}-rowmenu`, {row: rowText, items});
        return items;
    }
    const editDialog = () => page.getByRole('dialog').filter({hasText: 'Edit a file'}).last();
    async function editState() {
        const d = editDialog();
        if (!(await d.count())) return {open: false};
        return d.evaluate((el) => {
            const vis = (e) => e && e.getClientRects().length > 0;
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {
                open: true, text: f(el.innerText).slice(0, 3000),
                labels: [...el.querySelectorAll('label, legend, .pkpFormFieldLabel')].filter(vis).map((e) => f(e.innerText)).filter(Boolean),
                inputs: [...el.querySelectorAll('input:not([type=hidden]), textarea, select')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), type: e.type, name: e.name, id: e.id, value: (e.value || '').slice(0, 200)})),
                buttons: [...el.querySelectorAll('button, a')].filter(vis).map((b) => f(b.innerText || b.getAttribute('aria-label'))).filter(Boolean),
                errors: [...el.querySelectorAll('.pkpFieldError, .pkpFormField__error, [class*="rror"]')].filter(vis).map((e) => f(e.innerText)).filter(Boolean),
            };
        }).catch((e) => ({error: String(e.message)}));
    }
    async function download(locator, label) {
        const dl = page.waitForEvent('download', {timeout: 20000}).catch(() => null);
        const pop = page.context().waitForEvent('page', {timeout: 5000}).catch(() => null);
        await locator.click();
        const d = await dl;
        const p = await pop; if (p) await p.close().catch(() => {});
        let size = null;
        if (d) { try { const fp = await d.path(); size = fs.statSync(fp).size; } catch (e) { /* */ } }
        const out = d ? {fileName: d.suggestedFilename(), size, url: d.url().replace(/^.*\/index\.php/, '').slice(0, 200)} : {noDownload: true};
        record(`${label}-download`, out);
        return out;
    }
    async function moreInfoHistory(listName, rowText, label) {
        await rowMenu(listName, rowText, 'More Information');
        const info = page.getByRole('dialog').filter({hasText: /Information Center/}).last();
        await info.waitFor({timeout: 30000});
        await info.getByText('Event', {exact: true}).first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const hist = await info.evaluate((el) => {
            const f = (s) => (s || '').replace(/\s+/g, ' ').trim();
            return {title: el.getAttribute('aria-label'), tabs: [...el.querySelectorAll('[role=tab]')].map((t) => f(t.innerText)), rows: [...el.querySelectorAll('tr')].filter((t) => t.getClientRects().length).map((tr) => f(tr.innerText)).slice(0, 30), links: [...el.querySelectorAll('a')].filter((a) => a.getClientRects().length).map((a) => f(a.innerText)).filter(Boolean)};
        });
        await snap(page, `${label}-history`, {hist});
        const dls = [];
        // the upload rows' actions sit behind each row's "Settings" toggle (legacy grid)
        const toggles = info.locator('a.show_extras');
        const nt = await toggles.count();
        for (let i = 0; i < nt; i++) { await toggles.nth(0).click().catch(() => {}); await page.waitForTimeout(300); }
        const extras = await info.evaluate((el) => [...el.querySelectorAll('tr')].filter((t) => t.getClientRects().length).map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).slice(0, 30));
        await snap(page, `${label}-history-expanded`, {extras});
        const links = info.getByRole('link', {name: 'Download', exact: true});
        const n = await links.count();
        for (let i = 0; i < n; i++) {
            // a download collapses the rows again: re-open every row's actions first
            while (await info.locator('a.show_extras').count()) { await info.locator('a.show_extras').first().click().catch(() => {}); await page.waitForTimeout(250); if (await links.nth(i).isVisible().catch(() => false)) break; }
            dls.push(await download(links.nth(i), `${label}-history-${i}`));
            await page.waitForTimeout(500);
        }
        await info.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await idle(page);
        return {hist, toggles: nt, extras, downloads: dls};
    }

    try {
        // =====================================================================
        // Phase wiz: the wizard step by step, as the Journal Manager, on "Submission Files".
        if (on('wiz') && S.sw && !isOPS) await sect('wiz', async () => {
            const T = sc.T; const id = S.sw.id; const out = {};
            await signInAs(u.mgr);
            await openWf(wfUrl(T, id, 'workflow_1'), 'wiz-00-workflow');
            out.before = await rows('Submission Files');
            // step 1 as it opens
            await openUpload('Submission Files');
            out.s1open = await wizSnap('wiz-01-step1-open');
            await loc(page, 'wizard dialog', wiz());
            await loc(page, 'wizard revise select', wiz().locator('select[id^="revisedFileId"]'));
            await loc(page, 'wizard component select', wiz().locator('select[id^="genreId"]'));
            await loc(page, 'wizard file input', wiz().locator('input[type="file"]'));
            // a later step pressed before any upload
            await wiz().getByRole('tab', {name: /^3\./}).click({timeout: 3000}).catch((e) => { out.tab3ClickErr = flat(e.message, 120); });
            await page.waitForTimeout(300);
            out.s1afterTab3 = await wizardState(page);
            // component chosen: the upload box appears; Continue still greyed
            await pickGenre(SUPP);
            out.s1genre = await wizSnap('wiz-02-step1-genre');
            // back to "Select …": is the box hidden again?
            const g = wiz().locator('select[id^="genreId"]');
            await g.selectOption({index: 0}); await page.waitForTimeout(300);
            out.s1genreBack = await wizardState(page);
            await pickGenre(SUPP);
            // upload article.pdf, then "Change File" to second-file.pdf
            const CF1 = path.join(outDir(), 'change-first.pdf'); fs.copyFileSync(PDF, CF1);
            const CF2 = path.join(outDir(), 'change-second.pdf'); fs.copyFileSync(PDF, CF2);
            const m1 = mark();
            out.firstAttachEnabled = await attach(CF1);
            out.s1uploaded = await wizSnap('wiz-03-step1-uploaded', {since: await since(m1)});
            // the list behind the window already holds the file?
            out.listBehindAtStep1 = await page.locator('[role="dialog"]').first().getByRole('table', {name: 'Submission Files'}).first().innerText().catch((e) => `ERR ${e.message}`);
            const m2 = mark();
            await wiz().locator('input[type="file"]').setInputFiles(CF2);
            await waitContinueEnabled();
            await page.waitForTimeout(800);
            out.s1changed = await wizSnap('wiz-04-step1-changed', {since: await since(m2)});
            // step 2
            await toStep(2);
            out.s2 = await wizSnap('wiz-05-step2');
            // is step 1 selectable now?
            await wiz().getByRole('tab', {name: /^1\./}).click({timeout: 3000}).catch((e) => { out.tab1ClickErr = flat(e.message, 120); });
            await page.waitForTimeout(400);
            out.s2afterTab1 = (await wizardState(page)).tabs;
            // change the name, continue (saves)
            const nb = nameBoxes(wiz());
            out.s2nameBoxes = await nb.count();
            await nb.first().fill('Wizard Renamed.pdf');
            const m3 = mark();
            await toStep(3);
            out.s3 = await wizSnap('wiz-06-step3', {since: await since(m3)});
            // is step 2 selectable from step 3?
            await wiz().getByRole('tab', {name: /^2\./}).click({timeout: 3000}).catch((e) => { out.tab2ClickErr = flat(e.message, 120); });
            await page.waitForTimeout(800); await idle(page);
            out.s3afterTab2 = await wizSnap('wiz-07-step3-tab2-pressed');
            const backOn2 = out.s3afterTab2.tabs && out.s3afterTab2.tabs.find((x) => x.selected && /^2\./.test(x.text));
            if (backOn2) {
                // back on step 2 from step 3: type a new name and press the one button there
                await nameBoxes(wiz()).first().fill('Back at step two.pdf');
                const mb = mark();
                const btn = wiz().getByRole('button', {name: /^(Continue|Complete)$/}).first();
                out.backOn2Button = flat(await btn.innerText(), 40);
                await btn.click(); await page.waitForTimeout(1500); await idle(page);
                out.backOn2After = {wizard: await wizardState(page), since: await since(mb)};
                await snap(page, 'wiz-07b-back-on-step2-pressed', out.backOn2After);
                if (out.backOn2After.wizard.open) {
                    const c = wiz().getByRole('button', {name: 'Complete', exact: true});
                    if (await c.isVisible().catch(() => false)) await complete(); else await wizClose();
                }
            } else await complete();
            out.afterBack = await rows('Submission Files');
            await openWf(wfUrl(T, id, 'workflow_1'));
            out.afterBackReland = await rows('Submission Files');
            log('[wiz] after back-on-2', JSON.stringify({btn: out.backOn2Button, after: out.afterBack.rows, reland: out.afterBackReland.rows}));
            // a fresh upload to step 3, then "Add Another File" starts again at step 1
            await openUpload('Submission Files');
            await pickGenre(MAIN); await attach(path.join(outDir(), 'close-step1.pdf'));
            await toStep(2); await toStep(3);
            const addAnother = wiz().getByRole('button', {name: 'Add Another File', exact: true}).or(wiz().getByRole('link', {name: 'Add Another File', exact: true})).first();
            await loc(page, 'step 3 "Add Another File"', addAnother);
            out.listBehindAtStep3 = await page.locator('[role="dialog"]').first().getByRole('table', {name: 'Submission Files'}).first().innerText().catch((e) => `ERR ${e.message}`);
            await addAnother.click(); await page.waitForTimeout(800); await idle(page);
            await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
            out.again = await wizSnap('wiz-08-add-another-step1');
            // second file through the restarted wizard, completed
            await pickGenre(MAIN);
            await attach(MD);
            await toStep(2); await toStep(3);
            out.s3b = await wizardState(page);
            await complete();
            out.afterComplete = await rows('Submission Files');
            await snap(page, 'wiz-09-after-complete', {rows: out.afterComplete});
            await openWf(wfUrl(T, id, 'workflow_1'));
            out.afterReland = await rows('Submission Files');
            log('[wiz] after complete', JSON.stringify(out.afterComplete), '| relanded', JSON.stringify(out.afterReland));
            record('wiz-summary', out);
        });

        // Phase wiz-close/cancel: leaving the wizard at each step, both ways.
        if (on('wiz') && S.sw && !isOPS) await sect('leave', async () => {
            const T = sc.T; const id = S.sw.id; const out = {};
            await signInAs(u.mgr);
            const run = async (how, step, fileName, genre, label, {dismiss = false} = {}) => {
                await openWf(wfUrl(T, id, 'workflow_1'));
                const before = await rows('Submission Files');
                await openUpload('Submission Files');
                await pickGenre(genre);
                const f = path.join(outDir(), fileName); fs.copyFileSync(PDF, f);
                await attach(f);
                if (step >= 2) { await toStep(2); await nameBoxes(wiz()).first().fill(`${label} typed name`); }
                if (step >= 3) { await toStep(3); }
                const pre = await wizardState(page);
                const m = mark();
                if (dismiss) dialogMode = 'dismiss';
                const res = how === 'close' ? await wizClose() : await wizCancel();
                dialogMode = 'accept';
                const after = await since(m);
                if (res.stillOpen) { res.stateWhileOpen = await wizardState(page); await snap(page, `leave-${label}-still-open`); await wizClose(); }
                const samePage = await rows('Submission Files');
                await snap(page, `leave-${label}`, {res, after, samePage});
                await openWf(wfUrl(T, id, 'workflow_1'));
                const reland = await rows('Submission Files');
                const r = {how, step, fileName, genre, preTabs: pre.tabs, res, after, before: before.rows && before.rows.length, samePage, reland};
                log(`[leave ${label}]`, JSON.stringify({res, dialogs: after.jsDialogs, notices: after.notices, reland: reland.rows}).slice(0, 700));
                out[label] = r;
            };
            await run('close', 1, 'close-step1.pdf', SUPP, 'close1');
            await run('close', 1, 'close-step1b.pdf', SUPP, 'close1b');
            await run('close', 1, 'close-step1c.pdf', SUPP, 'close1c', {dismiss: true});
            await run('close', 2, 'close-step2.pdf', SUPP, 'close2');
            await run('close', 3, 'close-step3.pdf', SUPP, 'close3');
            await run('cancel', 1, 'cancel-step1.pdf', SUPP, 'cancel1');
            await run('cancel', 2, 'cancel-step2.pdf', SUPP, 'cancel2');
            await run('cancel', 3, 'cancel-step3.pdf', SUPP, 'cancel3');
            record('leave-summary', out);
        });

        // =====================================================================
        // Phase roles: step 1 for each role that opens it (read-only; Cancel before any upload).
        if (on('roles') && S.sx && !isOPS) await sect('roles', async () => {
            const T = sc.T; const id = S.sx.id; const out = {};
            for (const k of ['mgr', 'se', 'fc', 'ed2']) {
                await signInAs(u[k]);
                await openWf(wfUrl(T, id, 'workflow_1'), `roles-${k}-workflow`);
                const t = table('Submission Files');
                const hasUpload = await page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: 'Submission Files', exact: true})}).last().getByRole('button', {name: 'Upload', exact: true}).count();
                out[k] = {list: await t.count(), hasUpload};
                if (hasUpload) {
                    await openUpload('Submission Files');
                    const st = await wizSnap(`roles-${k}-step1`);
                    out[k].title = st.title; out[k].genre = st.genre; out[k].revise = st.revise;
                    out[k].cancel = await wizCancel();
                }
            }
            record('roles-summary', out);
        });

        // =====================================================================
        // Phase fields: step 2 per component, "Edit a file", the empty name.
        if (on('fields') && S.sf && !isOPS) await sect('fields', async () => {
            const T = sc.T; const id = S.sf.id; const out = {};
            await signInAs(u.mgr);
            await openWf(wfUrl(T, id, 'workflow_1'));
            // A. article.pdf as the main component
            await openUpload('Submission Files');
            await pickGenre(MAIN); await attach(PDF);
            await toStep(2);
            out.s2main = await wizSnap('fields-01-step2-main');
            // empty the name and Continue
            const nb = nameBoxes(wiz());
            await nb.first().fill('');
            const m = mark();
            await contBtn().click(); await page.waitForTimeout(1500); await idle(page);
            out.s2empty = await wizSnap('fields-02-step2-empty-continue', {since: await since(m)});
            // restore a name and finish
            await nameBoxes(wiz()).first().fill('article.pdf').catch(() => {});
            if (!(await wiz().getByRole('button', {name: 'Complete', exact: true}).isVisible().catch(() => false))) await toStep(3);
            await complete();
            // B. notes.md as the supplementary component
            await openUpload('Submission Files');
            await pickGenre(SUPP); await attach(MD);
            await toStep(2);
            out.s2supp = await wizSnap('fields-03-step2-supplementary');
            await toStep(3); await complete();
            // C. OMP: an artwork main component ("Figure")
            if (isOMP) {
                await openUpload('Submission Files');
                out.ompGenres = (await wizardState(page)).genre;
                await pickGenre('Figure'); await attach(PNG);
                await toStep(2);
                out.s2art = await wizSnap('fields-04-step2-artwork');
                await toStep(3); await complete();
            }
            out.list = await rows('Submission Files');
            // D. "Update File Details" on the first file
            const menu = await rowMenu('Submission Files', 'article.pdf', 'Update File Details', 'fields-edit');
            out.menu = menu;
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            out.edit = await editState();
            await snap(page, 'fields-05-edit-window', {edit: out.edit});
            // empty name, Save
            const eb = editDialog().locator('input[type="text"]:visible').first();
            await eb.fill('');
            const m2 = mark();
            await editDialog().getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForTimeout(1500); await idle(page);
            out.editEmpty = {state: await editState(), since: await since(m2)};
            await snap(page, 'fields-06-edit-empty-save', out.editEmpty);
            // Cancel with a typed change: any question on the way out?
            if ((await editDialog().count()) && await editDialog().isVisible()) {
                await editDialog().locator('input[type="text"]:visible').first().fill('Typed then cancelled');
                const m3 = mark();
                const c = editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first();
                await loc(page, '"Edit a file" Cancel', c);
                await c.click(); await page.waitForTimeout(1000); await idle(page);
                out.editCancel = {since: await since(m3), open: await editDialog().isVisible().catch(() => false), rows: await rows('Submission Files')};
                await snap(page, 'fields-07-edit-cancel', out.editCancel);
            }
            // Save a real rename: the list at once
            await rowMenu('Submission Files', 'article.pdf', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000});
            await editDialog().locator('input[type="text"]:visible').first().fill('Manuscript');
            const m4 = mark();
            await editDialog().getByRole('button', {name: 'Save', exact: true}).click();
            await editDialog().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
            await page.waitForTimeout(300);
            out.afterSaveAtOnce = await rows('Submission Files');
            out.afterSaveSince = await since(m4);
            await snap(page, 'fields-08-after-save', {rows: out.afterSaveAtOnce, since: out.afterSaveSince});
            // the supplementary file's edit window
            await rowMenu('Submission Files', 'notes.md', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            out.editSupp = await editState();
            await snap(page, 'fields-09-edit-supplementary', {edit: out.editSupp});
            await editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await idle(page);
            record('fields-summary', out);
        });

        // =====================================================================
        // Phase revise: Rule 8, Rule 9, A1.
        if ((on('revise') || on('rev12') || on('rev345')) && S.r1 && !isOPS) await sect('revise', async () => {
            const part12 = on('revise') || on('rev12');
            const part345 = on('revise') || on('rev345');
            const T = sc.T; const out = {};
            const land = async (id) => openWf(wfUrl(T, id, 'workflow_1'));
            const rename = async (who, id, from, to) => {
                await signInAs(u[who]); await land(id);
                await rowMenu('Submission Files', from, 'Update File Details');
                const b = editDialog().locator('input[type="text"]:visible').first();
                await b.waitFor({timeout: 20000}); await b.fill(to);
                await editDialog().getByRole('button', {name: 'Save', exact: true}).click();
                await editDialog().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await idle(page);
                return rows('Submission Files');
            };
            const reviseThen = async (who, id, match, how, label, {step = 1} = {}) => {
                await signInAs(u[who]); await land(id);
                const before = await rows('Submission Files');
                await openUpload('Submission Files');
                const pick = await pickRevise(match);
                const s1 = await wizSnap(`${label}-step1-revise-picked`, {pick});
                const m = mark();
                await attach(REV);
                const s1u = await wizardState(page);
                if (step >= 2) await toStep(2);
                if (step >= 3) await toStep(3);
                const s2 = step >= 2 ? await wizSnap(`${label}-step${step}`) : null;
                let res;
                if (how === 'cancel') {
                    res = await wizCancel();
                    if (res.stillOpen) { res.openState = await wizSnap(`${label}-still-open-after-cancel`); await wizClose(); }
                }
                else if (how === 'complete') { if (step < 3) { if (step < 2) await toStep(2); await toStep(3); } await complete(); res = {completed: true}; }
                const traf = await since(m);
                const samePage = await rows('Submission Files');
                await land(id);
                const after = await rows('Submission Files');
                await snap(page, `${label}-after`, {res, traf, samePage, after});
                log(`[${label}]`, JSON.stringify({before: before.rows, genre: s1.genre && {disabled: s1.genre.disabled, sel: (s1.genre.options || []).filter((o) => o.selected).map((o) => o.text)}, res, cancelResp: traf.traffic.filter((x) => x.response), dialogs: traf.jsDialogs, after: after.rows}).slice(0, 1200));
                return {before, s1: {genre: s1.genre, revise: s1.revise, uploader: s1.uploader}, s1u: {genre: s1u.genre && {disabled: s1u.genre.disabled}, revise: s1u.revise && {disabled: s1u.revise.disabled}}, s2: s2 && {labels: s2.labels, inputs: s2.inputs}, res, traf, samePage, after};
            };
            if (part12) {
            // R1: no rename; Cancel at step 1, then Cancel at step 2
            out.r1a = await reviseThen('mgr', S.r1.id, 'article.pdf', 'cancel', 'rev-r1a');
            out.r1b = await reviseThen('mgr', S.r1.id, 'article.pdf', 'cancel', 'rev-r1b', {step: 2});
            // R2: same user renames, then revises and cancels (d5)
            out.r2rename = await rename('mgr', S.r2.id, 'article.pdf', 'Renamed.pdf');
            out.r2a = await reviseThen('mgr', S.r2.id, 'Renamed.pdf', 'cancel', 'rev-r2a');
            out.r2b = await reviseThen('mgr', S.r2.id, (out.r2a.after.rows || [[null, 'Renamed']])[0][1], 'cancel', 'rev-r2b', {step: 2});
            }
            if (part345) {
            // R3: another user renames; the manager revises and cancels (A1)
            out.r3rename = await rename('ed2', S.r3.id, 'article.pdf', 'Renamed by B.pdf');
            out.r3a = await reviseThen('mgr', S.r3.id, 'Renamed by B', 'cancel', 'rev-r3a');
            out.r3hist = await moreInfoHistory('Submission Files', /article-rev|Renamed/, 'rev-r3');
            // R4: the renamer revises and cancels
            out.r4rename = await rename('ed2', S.r4.id, 'article.pdf', 'Renamed by B.pdf');
            out.r4a = await reviseThen('ed2', S.r4.id, 'Renamed by B', 'cancel', 'rev-r4a');
            // R5: a revision completed (Rule 8), then the file's history and its downloads
            out.r5 = await reviseThen('mgr', S.r5.id, 'article.pdf', 'complete', 'rev-r5', {step: 3});
            out.r5hist = await moreInfoHistory('Submission Files', 'article-rev.pdf', 'rev-r5');
            }
            record(`revise-summary-${part12 ? 'a' : ''}${part345 ? 'b' : ''}`, out);
        });

        // =====================================================================
        // Phase author: A2 on "Submission Files" (Revisions Uploaded is in phase review).
        if (on('author') && S.sa && !isOPS) await sect('author', async () => {
            const T = sc.T; const out = {};
            const k = `sa${Date.now() % 100000}`;
            const r = await app.api.createSubmission({tag: `${sc.T}${k}`.slice(0, 32), context: T, submitter: u.au, title: `K2 author menus ${k}`, files: [{file: 'article.pdf'}, {file: 'notes.md', genre: SUPP, uploader: u.mgr}], participants: [{username: u.se, role: 'sectionEditor'}]});
            const id = r.submissionId; out.sub = id;
            await signInAs(u.au);
            await openWf(authorUrl(T, id, 'workflow_1'), 'author-01-submission');
            out.rows = await rows('Submission Files');
            for (const f of ['article.pdf', 'notes.md']) {
                const items = await rowMenu('Submission Files', f, null);
                out[f] = {items};
                if (items.some((i) => /Update File Details/.test(i))) {
                    const m = mark();
                    await rowMenu('Submission Files', f, 'Update File Details');
                    await page.waitForTimeout(1200); await idle(page);
                    const st = await editState();
                    const dl = await dialogTexts(page);
                    out[f].edit = {state: st, dialogs: dl.slice(1).map((x) => ({name: x.name, text: flat(x.text, 600)})), since: await since(m)};
                    await snap(page, `author-02-edit-${f.replace(/\W+/g, '-')}`, out[f].edit);
                    if (f === 'article.pdf' && st.open && st.inputs && st.inputs.length) {
                        await editDialog().locator('input[type="text"]:visible').first().fill('Manuscript');
                        const m2 = mark();
                        await editDialog().getByRole('button', {name: 'Save', exact: true}).click();
                        await editDialog().waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                        await idle(page);
                        out[f].savedAtOnce = await rows('Submission Files');
                        const until = Date.now() + 8000; let polled = null;
                        while (Date.now() < until) { polled = await rows('Submission Files'); if (JSON.stringify(polled).includes('Manuscript')) break; await page.waitForTimeout(400); }
                        out[f].saved = {rows: polled, msUntilShown: JSON.stringify(polled).includes('Manuscript') ? 8000 - (until - Date.now()) : null, since: await since(m2)};
                        await snap(page, 'author-03-after-save', out[f].saved);
                    } else {
                        // close whatever opened
                        const top = topWin(page);
                        const c = top.getByRole('button', {name: /^(Close|Cancel|OK)$/}).first();
                        if (await c.count()) await c.click().catch(() => {});
                        await idle(page);
                    }
                    await openWf(authorUrl(T, id, 'workflow_1'));
                }
            }
            out.after = await rows('Submission Files');
            // the manager's menus on the same rows, for comparison
            await signInAs(u.mgr);
            await openWf(wfUrl(T, id, 'workflow_1'));
            out.mgr = {};
            for (const f of ['Manuscript', 'article.pdf', 'notes.md']) {
                try { out.mgr[f] = await rowMenu('Submission Files', f, null); } catch (e) { out.mgr[f] = 'row absent'; }
            }
            record('author-summary', out);
            log('[author]', JSON.stringify(out).slice(0, 1500));
        });

        // =====================================================================
        // Phase review: Revisions Uploaded (titles, revise lists, amendment notice, badge, Insert Content),
        // the author's "Upload revisions", "Files for Review" › "Upload/Select Files", A2 on Revisions Uploaded.
        if (on('review') && S.sv && !isOPS) await sect('review', async () => {
            const T = sc.T; const id = S.sv.id; const out = {};
            // author first: "Upload revisions" (title, revise list), upload a revision with a summary
            await signInAs(u.au);
            await openWf(authorUrl(T, id), 'review-01-author-round');
            const upRev = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Upload revisions', exact: true});
            await loc(page, 'author "Upload revisions"', upRev);
            out.authorUploadButton = await upRev.count();
            out.authorRows0 = await rows('Revisions Uploaded');
            if (out.authorUploadButton) {
                await upRev.click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
                await idle(page);
                out.authorStep1 = await wizSnap('review-02-author-step1');
                await pickGenre(MAIN);
                await attach(path.join(FIX, isOMP ? 'article.pdf' : 'article.pdf'));
                await toStep(2);
                out.authorStep2 = await wizSnap('review-03-author-step2');
                // type a summary
                const fr = wiz().frameLocator('iframe').first();
                await fr.locator('body').click().catch(() => {});
                await fr.locator('body').fill('Author summary: corrected figure 2.').catch((e) => { out.summaryFillErr = flat(e.message, 200); });
                await toStep(3); await complete();
                out.authorRows1 = await rows('Revisions Uploaded');
            }
            // author's second upload: the revise list now
            if (out.authorUploadButton) {
                await openWf(authorUrl(T, id));
                await page.locator('[role="dialog"]:visible').first().getByRole('button', {name: 'Upload revisions', exact: true}).click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                out.authorStep1b = await wizSnap('review-04-author-step1-second');
                await wizCancel();
            }
            // Revisions Uploaded "Upload" in the author's list?
            await openWf(authorUrl(T, id));
            out.authorListUpload = await page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: 'Revisions Uploaded', exact: true})}).last().getByRole('button', {name: 'Upload', exact: true}).count();
            // editor: Revisions Uploaded › Upload
            await signInAs(u.mgr);
            await openWf(wfUrl(T, id), 'review-05-editor-round');
            out.edRows0 = await rows('Revisions Uploaded');
            out.frRows0 = await rows('Files for Review');
            await openUpload('Revisions Uploaded');
            out.edStep1 = await wizSnap('review-06-editor-step1');
            await pickGenre(SUPP);
            await attach(MD);
            await toStep(2);
            out.edStep2 = await wizSnap('review-07-editor-step2');
            const fr = wiz().frameLocator('iframe').first();
            await fr.locator('body').click().catch(() => {});
            await fr.locator('body').fill('Editor summary: updated data set.').catch((e) => { out.edSummaryFillErr = flat(e.message, 200); });
            await toStep(3); await complete();
            out.edRows1 = await rows('Revisions Uploaded');
            await snap(page, 'review-08-after-editor-upload', {rows: out.edRows1});
            // Edit a file on a revision: the summary box there
            await rowMenu('Revisions Uploaded', 'notes.md', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            out.edEdit = await editState();
            await snap(page, 'review-09-edit-revision', {edit: out.edEdit});
            await editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await idle(page);
            // Files for Review › Upload/Select Files › its link
            await openWf(wfUrl(T, id));
            const sel = page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: 'Files for Review', exact: true})}).last().getByRole('button', {name: 'Upload/Select Files', exact: true});
            if (await sel.count()) {
                await sel.click();
                const w = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
                await w.waitFor({timeout: 30000}); await idle(page);
                const wt = (await dialogTexts(page)).slice(-1)[0];
                out.selWindow = {name: wt && wt.name, text: flat(wt && wt.text, 800)};
                const link = w.getByRole('link', {name: /Upload/}).first();
                await loc(page, 'Files for Review › Upload/Select Files › upload link', link);
                out.selLink = flat(await link.innerText().catch(() => null), 60);
                await link.click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                out.frStep1 = await wizSnap('review-10-filesforreview-step1');
                await pickGenre(MAIN); await attach(REV2); await toStep(2);
                out.frStep2 = await wizSnap('review-11-filesforreview-step2');
                await wizCancel();
                const c = w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first();
                await c.click().catch(() => {}); await idle(page);
            }
            // badge + Insert Content
            await openWf(wfUrl(T, id));
            out.edRows2 = await rows('Revisions Uploaded');
            const pub = S.sv.publicationId;
            const entry = isOMP ? 'catalogEntry' : 'issue';
            await openWf(wfUrl(T, id, `publication_${pub}_${entry}`), 'review-12-entry-page');
            const ins = page.getByRole('button', {name: 'Insert Content'}).first();
            await ins.waitFor({timeout: 20000}).catch(() => {});
            await loc(page, 'entry page "Insert Content"', ins);
            out.insertButtons = await page.getByRole('button', {name: 'Insert Content'}).count();
            if (out.insertButtons) {
                await ins.click(); await page.waitForTimeout(800); await idle(page);
                const dl = await dialogTexts(page);
                out.insertPanel = dl.slice(-1).map((x) => ({name: x.name, text: flat(x.text, 1500)}));
                await snap(page, 'review-13-insert-content', {insertPanel: out.insertPanel});
                await topWin(page).getByRole('button', {name: /^(Close|Cancel)$/}).first().click().catch(() => {});
            }
            // A2 on Revisions Uploaded: the author's menus
            await signInAs(u.au);
            await openWf(authorUrl(T, id));
            out.auRows = await rows('Revisions Uploaded');
            out.auMenus = {};
            for (const f of ['article.pdf', 'notes.md']) {
                const items = await rowMenu('Revisions Uploaded', f, null).catch(() => 'absent');
                out.auMenus[f] = {items};
                if (Array.isArray(items) && items.some((i) => /Update File Details/.test(i))) {
                    await rowMenu('Revisions Uploaded', f, 'Update File Details');
                    await page.waitForTimeout(1200); await idle(page);
                    out.auMenus[f].edit = await editState();
                    out.auMenus[f].dialogs = (await dialogTexts(page)).slice(1).map((x) => ({name: x.name, text: flat(x.text, 600)}));
                    await snap(page, `review-14-author-edit-${f.replace(/\W+/g, '-')}`, out.auMenus[f]);
                    const top = topWin(page);
                    await top.getByRole('button', {name: /^(Close|Cancel)$/}).first().click().catch(() => {});
                    await idle(page);
                    await openWf(authorUrl(T, id));
                }
            }
            record('review-summary', out);
            log('[review]', JSON.stringify({authorUploadButton: out.authorUploadButton, authorTitle: out.authorStep1 && out.authorStep1.title, edTitle: out.edStep1 && out.edStep1.title, edRows1: out.edRows1, insert: out.insertPanel, auMenus: out.auMenus}).slice(0, 2000));
        });

        // =====================================================================
        // Phase copyedit: the titles inside the Copyediting windows.
        if (on('copyedit') && S.sc && !isOPS) await sect('copyedit', async () => {
            const T = sc.T; const id = S.sc.id; const out = {};
            await signInAs(u.mgr);
            for (const list of ['Draft Files', 'Copyedited Files']) {
                await openWf(wfUrl(T, id, 'workflow_4'));
                const b = page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: list, exact: true})}).last().getByRole('button', {name: 'Upload/Select Files', exact: true});
                await b.click();
                const w = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
                await w.waitFor({timeout: 30000}); await idle(page);
                const link = w.getByRole('link', {name: /Upload/}).first();
                const linkText = flat(await link.innerText().catch(() => null), 60);
                await link.click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                const st = await wizSnap(`copyedit-${list.replace(/\W+/g, '-')}-step1`);
                out[list] = {linkText, title: st.title, genre: st.genre, revise: st.revise};
                await wizCancel();
                await w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
                await idle(page);
            }
            record('copyedit-summary', out);
        });

        // =====================================================================
        // Phase prod: Production Ready Files (empty list: no revise list; then dependent files).
        if (on('prod') && S.sp && !isOPS) await sect('prod', async () => {
            const T = sc.T; const id = S.sp.id; const out = {};
            await signInAs(u.mgr);
            await openWf(wfUrl(T, id, 'workflow_5'), 'prod-01-workflow');
            out.rows0 = await rows('Production Ready Files');
            await openUpload('Production Ready Files');
            out.step1Empty = await wizSnap('prod-02-step1-empty-list');
            await pickGenre(MAIN); await attach(HTML);
            await toStep(2);
            await page.waitForTimeout(1500); await idle(page);
            out.step2Html = await wizSnap('prod-03-step2-html');
            // the Dependent Files list's own controls
            const depDiv = wiz().locator('[id^="dependentFilesGridDiv"]').first();
            out.depText = flat(await depDiv.innerText().catch(() => null), 800);
            const depUp = depDiv.getByRole('link', {name: /Upload|Add/}).first();
            await loc(page, 'step 2 "Dependent Files" upload link', depUp);
            out.depLinks = await depDiv.locator('a:visible').allInnerTexts().catch(() => []);
            if (await depUp.count()) {
                await depUp.click();
                const dw = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
                await page.waitForTimeout(1000);
                const n = await dw.count();
                const dwiz = dw.last();
                await dwiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
                await idle(page);
                out.depWizards = n;
                out.depStep1 = await wizSnap('prod-04-dependent-step1');
                await pickGenre('Image'); await attach(PNG);
                await toStep(2);
                out.depStep2 = await wizSnap('prod-05-dependent-step2');
                await toStep(3);
                out.depStep3 = await wizSnap('prod-06-dependent-step3');
                await complete();
                await page.waitForTimeout(800); await idle(page);
                out.depAfter = flat(await wiz().locator('[id^="dependentFilesGridDiv"]').first().innerText().catch(() => null), 800);
                out.afterDep = await wizSnap('prod-07-main-step2-after-dependent');
            }
            await toStep(3); await complete();
            out.rows1 = await rows('Production Ready Files');
            await snap(page, 'prod-08-after', {rows: out.rows1});
            // Edit a file on the HTML: the dependent list there
            await rowMenu('Production Ready Files', 'article.html', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            await page.waitForTimeout(1200); await idle(page);
            out.editHtml = await editState();
            await snap(page, 'prod-09-edit-html', {edit: out.editHtml});
            await editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await idle(page);
            // second upload: the revise list now shows
            await openWf(wfUrl(T, id, 'workflow_5'));
            await openUpload('Production Ready Files');
            out.step1Second = await wizSnap('prod-10-step1-second');
            await wizCancel();
            // delete the HTML file, then upload it again: its Dependent Files list
            await openWf(wfUrl(T, id, 'workflow_5'));
            await rowMenu('Production Ready Files', 'article.html', 'Delete');
            const conf = page.getByRole('dialog').filter({hasText: 'Are you sure'}).last();
            await conf.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
            await idle(page); await page.waitForTimeout(800);
            out.rowsAfterDelete = await rows('Production Ready Files');
            await openUpload('Production Ready Files');
            await pickGenre(MAIN); await attach(HTML); await toStep(2);
            await page.waitForTimeout(1500); await idle(page);
            out.step2Again = await wizSnap('prod-11-step2-html-again');
            await toStep(3); await complete();
            record('prod-summary', out);
            log('[prod]', JSON.stringify({dep: out.depText, depAfter: out.depAfter, depGenres: out.depStep1 && out.depStep1.genre, rows1: out.rows1, again: out.step2Again && out.step2Again.dependent}).slice(0, 2000));
        });

        // =====================================================================
        // Phase ensure: T2 (anonymizing link on, English + French): link by stage; the name boxes.
        if (on('ensure') && sc.T2 && !isOPS) await sect('ensure', async () => {
            const T = sc.T2; const S2 = sc.subs2; const out = {};
            await signInAs(sc.u2.mgr, T);
            // Submission stage
            await openWf(wfUrl(T, S2.l1.id, 'workflow_1'));
            await openUpload('Submission Files');
            out.l1step1 = await wizSnap('ensure-01-submission-step1');
            const link = wiz().getByRole('link', {name: /anonymized/});
            await loc(page, 'step 1 "How to ensure all files are anonymized"', link);
            if (await link.count()) {
                await link.click(); await page.waitForTimeout(1000); await idle(page);
                const dl = await dialogTexts(page);
                out.linkOpens = dl.slice(-1).map((x) => ({name: x.name, text: flat(x.text, 600)}));
                await snap(page, 'ensure-02-link-opened', {linkOpens: out.linkOpens});
                await topWin(page).getByRole('button', {name: /^(Close|OK|Cancel)$/}).first().click().catch(() => {});
                await idle(page);
            }
            await pickGenre(MAIN); await attach(PDF); await toStep(2);
            out.l1step2 = await wizSnap('ensure-03-submission-step2');
            await wizCancel();
            // review round: Revisions Uploaded and Files for Review
            await openWf(wfUrl(T, S2.l2.id));
            await openUpload('Revisions Uploaded');
            out.l2revStep1 = await wizSnap('ensure-04-revisions-step1');
            await pickGenre(MAIN); await attach(PDF); await toStep(2);
            out.l2revStep2 = await wizSnap('ensure-05-revisions-step2');
            await wizCancel();
            // production
            await openWf(wfUrl(T, S2.l3.id, 'workflow_5'));
            await openUpload('Production Ready Files');
            out.l3step1 = await wizSnap('ensure-06-production-step1');
            await wizCancel();
            // Edit a file on the seeded file: the name boxes there
            await openWf(wfUrl(T, S2.l1.id, 'workflow_1'));
            await rowMenu('Submission Files', 'article.pdf', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            out.l1edit = await editState();
            await snap(page, 'ensure-07-edit-bilingual', {edit: out.l1edit});
            await editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            record('ensure-summary', out);
            log('[ensure]', JSON.stringify({l1: out.l1step1 && out.l1step1.ensuringLink, l2: out.l2revStep1 && out.l2revStep1.ensuringLink, l3: out.l3step1 && out.l3step1.ensuringLink, names2: out.l1step2 && out.l1step2.inputs}).slice(0, 1500));
        });

        // =====================================================================
        // Phase galley (OJS, OPS): Add galley's wizard, "Change File", the HTML galley's dependent list.
        if (on('galley') && S.g1 && !isOMP) await sect('galley', async () => {
            const T = sc.T; const out = {};
            await signInAs(u.mgr);
            const galleysPage = async (k, label) => openWf(wfUrl(T, S[k].id, `publication_${S[k].publicationId}_galleys`), label);
            // Change File on the PDF galley (d4)
            await galleysPage('g1', 'galley-01-page');
            const gRow = page.locator('[role="dialog"]:visible').first().locator('tbody tr').filter({hasText: 'PDF'}).first();
            await gRow.waitFor({timeout: 20000});
            await gRow.locator('button').last().click(); await page.waitForTimeout(300);
            out.g1menu = await menuItems(page);
            await page.getByRole('menuitem', {name: 'Change File'}).first().click();
            await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
            out.changeStep1 = await wizSnap('galley-02-change-file-step1');
            await wizCancel();
            // Add galley → the wizard; step 3
            await galleysPage('g3', 'galley-03-empty-page');
            const add = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /^Add galley$/i}).first();
            await add.click(); await idle(page);
            const form = topWin(page);
            await form.locator('input[name="label"]').waitFor({timeout: 20000});
            await form.locator('input[name="label"]').fill('HTML');
            await form.getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page);
            await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
            out.addStep1 = await wizSnap('galley-04-add-step1');
            await pickGenre(MAIN); await attach(HTML); await toStep(2);
            await page.waitForTimeout(1500); await idle(page);
            out.addStep2 = await wizSnap('galley-05-add-step2-html');
            // a dependent file through the galley's step 2
            const depUp = wiz().locator('[id^="dependentFilesGridDiv"]').first().getByRole('link', {name: /Upload|Add/}).first();
            if (await depUp.count()) {
                await depUp.click();
                await page.waitForTimeout(1000);
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                out.addDepStep1 = await wizSnap('galley-06-dependent-step1');
                await pickGenre('Image'); await attach(PNG); await toStep(2); await toStep(3);
                out.addDepStep3 = await wizSnap('galley-07-dependent-step3');
                await complete();
            }
            await toStep(3);
            out.addStep3 = await wizSnap('galley-08-add-step3');
            await complete();
            await galleysPage('g3', 'galley-09-after-add');
            // the galley's "Edit" window: its dependent list
            const hRow = page.locator('[role="dialog"]:visible').first().locator('tbody tr').filter({hasText: 'HTML'}).first();
            await hRow.locator('button').last().click(); await page.waitForTimeout(300);
            out.g3menu = await menuItems(page);
            await page.getByRole('menuitem', {name: 'Edit'}).first().click();
            await page.waitForTimeout(1500); await idle(page);
            const ed = (await dialogTexts(page)).slice(-1)[0];
            out.galleyEdit = {name: ed && ed.name, text: flat(ed && ed.text, 1500)};
            out.galleyEditDepLinks = await topWin(page).locator('[id^="dependentFilesGridDiv"] a:visible').allInnerTexts().catch(() => []);
            await snap(page, 'galley-10-edit-window', out.galleyEdit);
            await topWin(page).getByRole('button', {name: /^(Cancel|Close)$/}).first().click().catch(() => {});
            await topWin(page).getByRole('link', {name: 'Cancel', exact: true}).first().click().catch(() => {});
            record('galley-summary', out);
            log('[galley]', JSON.stringify({g1menu: out.g1menu, change: out.changeStep1 && {title: out.changeStep1.title, headings: out.changeStep1.headings, genre: out.changeStep1.genre.present, revise: out.changeStep1.revise.present, text: flat(out.changeStep1.panelText, 300)}, addTitle: out.addStep1 && out.addStep1.title, step3: out.addStep3 && out.addStep3.buttons, dep: out.addDepStep1 && out.addDepStep1.genre, edit: out.galleyEdit && flat(out.galleyEdit.text, 300)}).slice(0, 2500));
        });
        // Phase xml: an XML file's step 2 (the other shape of Rule 11), and a PDF's for contrast.
        if (on('xml') && S.sp && !isOPS) await sect('xml', async () => {
            const T = sc.T; const out = {};
            const XML = path.join(outDir(), 'article.xml');
            fs.writeFileSync(XML, '<?xml version="1.0" encoding="UTF-8"?>\n<article><front><title>K2</title></front><body><fig><graphic href="figure.png"/></fig></body></article>\n');
            await signInAs(u.mgr);
            for (const [f, label] of [[XML, 'xml'], [PDF, 'pdf']]) {
                await openWf(wfUrl(T, S.sp.id, 'workflow_5'));
                await openUpload('Production Ready Files');
                await pickGenre(MAIN); await attach(f); await toStep(2);
                await page.waitForTimeout(1500); await idle(page);
                const st = await wizSnap(`xml-${label}-step2`);
                out[label] = {dependent: st.dependent, labels: st.labels};
                await wizCancel();
            }
            record('xml-summary', out);
            log('[xml]', JSON.stringify(out));
        });

        // Phase ensure2: the anonymizing link inside the two select windows (Files for Review; Copyediting's Draft Files).
        if (on('ensure2') && sc.T2 && !isOPS) await sect('ensure2', async () => {
            const T = sc.T2; const out = {};
            if (!sc.subs2.l6) {
                const r = await app.api.createSubmission({tag: `${T}l6`.slice(0, 32), context: T, submitter: sc.u2.au, locale: 'en', title: 'K2 l6 copyediting', files: [{file: 'article.pdf'}], decisions: ['skipExternalReview']});
                sc.subs2.l6 = {id: r.submissionId}; save();
            }
            await signInAs(sc.u2.mgr, T);
            for (const [k, list, stageKey] of [['l2', 'Files for Review', null], ['l6', 'Draft Files', 'workflow_4']]) {
                await openWf(wfUrl(T, sc.subs2[k].id, stageKey));
                const b = page.locator('[role="dialog"]:visible').first().locator('div').filter({has: page.getByRole('table', {name: list, exact: true})}).last().getByRole('button', {name: 'Upload/Select Files', exact: true});
                await b.click();
                const w = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
                await w.waitFor({timeout: 30000}); await idle(page);
                await w.getByRole('link', {name: /Upload/}).first().click();
                await wiz().locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000}); await idle(page);
                const st = await wizSnap(`ensure2-${k}-step1`);
                out[k] = {title: st.title, link: st.ensuringLink};
                await wizCancel();
                await w.getByRole('link', {name: 'Cancel', exact: true}).or(w.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
                await idle(page);
            }
            record('ensure2-summary', out);
            log('[ensure2]', JSON.stringify(out));
        });

        if (on('hist') && S.r5 && !isOPS) await sect('hist', async () => {
            await signInAs(u.mgr);
            await openWf(wfUrl(sc.T, S.r5.id, 'workflow_1'));
            const h5 = await moreInfoHistory('Submission Files', 'article-rev.pdf', 'hist-r5');
            record('hist-summary', {h5});
            log('[hist]', JSON.stringify(h5).slice(0, 2500));
        });

        // =====================================================================
        // Phase lang: T2 submissions whose metadata carries English and French.
        if (on('lang') && sc.T2 && !isOPS) await sect('lang', async () => {
            const T = sc.T2; const out = {};
            const toReview = isOMP ? ['skipInternalReview'] : ['sendExternalReview'];
            if (!sc.subs2.l4) {
                for (const [k, extra] of [['l4', {}], ['l5', {decisions: [...toReview, 'requestRevisions']}]]) {
                    const r = await app.api.createSubmission({tag: `${T}${k}`.slice(0, 32), context: T, submitter: sc.u2.au, locale: 'en', title: {en: `K2 ${k} bilingual`, fr_CA: `K2 ${k} bilingue`}, files: [{file: 'article.pdf'}], ...extra});
                    sc.subs2[k] = {id: r.submissionId, publicationId: r.publicationId};
                }
                save();
            }
            await signInAs(sc.u2.mgr, T);
            await openWf(wfUrl(T, sc.subs2.l4.id, 'workflow_1'));
            await rowMenu('Submission Files', 'article.pdf', 'Update File Details');
            await editDialog().locator('input[type="text"]:visible').first().waitFor({timeout: 20000}).catch(() => {});
            out.edit = await editState();
            await snap(page, 'lang-01-edit-bilingual', {edit: out.edit});
            await editDialog().getByRole('button', {name: 'Cancel', exact: true}).or(editDialog().getByRole('link', {name: 'Cancel', exact: true})).first().click().catch(() => {});
            await openWf(wfUrl(T, sc.subs2.l4.id, 'workflow_1'));
            await openUpload('Submission Files');
            await pickGenre(MAIN); await attach(PDF); await toStep(2);
            out.step2 = await wizSnap('lang-02-step2-bilingual');
            await wizCancel();
            await openWf(wfUrl(T, sc.subs2.l5.id));
            await openUpload('Revisions Uploaded');
            await pickGenre(MAIN); await attach(PDF); await toStep(2);
            out.revStep2 = await wizSnap('lang-03-revision-step2-bilingual');
            out.summaryEditors = await wiz().locator('iframe:visible').count();
            const frTab = wiz().getByRole('button', {name: 'French (Canada)'}).or(wiz().getByRole('tab', {name: 'French (Canada)'})).or(wiz().getByRole('link', {name: 'French (Canada)'})).first();
            await loc(page, 'step 2 language tab "French (Canada)"', frTab);
            await frTab.click().catch((e) => { out.frTabErr = flat(e.message, 200); });
            await page.waitForTimeout(500);
            out.revStep2fr = await wizSnap('lang-04-revision-step2-french-tab');
            out.summaryEditorsFr = await wiz().locator('iframe:visible').count();
            await wizCancel();
            record('lang-summary', out);
            log('[lang]', JSON.stringify({edit: out.edit.inputs, step2: out.step2.inputs.map((i) => i.name), rev: out.revStep2.inputs.map((i) => i.name), revLabels: out.revStep2.labels, iframes: out.summaryEditors}));
        });

        // =====================================================================
        // Phase gpub (OJS, OPS): the HTML galley's dependent list before and after the version is published.
        if (on('gpub') && S.g3 && !isOMP) await sect('gpub', async () => {
            const T = sc.T; const out = {}; const k = 'g3';
            await signInAs(u.mgr);
            const readDep = async (label) => {
                await openWf(wfUrl(T, S[k].id, `publication_${S[k].publicationId}_galleys`));
                const hRow = page.locator('[role="dialog"]:visible').first().locator('tbody tr').filter({hasText: 'HTML'}).first();
                await hRow.waitFor({timeout: 20000});
                await hRow.locator('button').last().click(); await page.waitForTimeout(300);
                const menu = await menuItems(page);
                await page.getByRole('menuitem', {name: 'Edit'}).first().click();
                await page.waitForTimeout(1500); await idle(page);
                const win = topWin(page);
                const grid = win.locator('[id^="dependentFilesGridDiv"]').first();
                await grid.waitFor({timeout: 20000}).catch(() => {});
                const r = {menu, gridText: flat(await grid.innerText().catch(() => null), 600), topLinks: await grid.locator('a:visible').allInnerTexts().catch(() => [])};
                const settings = grid.locator('a.show_extras').first();
                if (await settings.count()) {
                    await settings.click(); await page.waitForTimeout(500);
                    r.rowActions = await grid.locator('tr:visible a:visible').allInnerTexts().catch(() => []);
                }
                r.saveButtons = await win.getByRole('button', {name: /^(Save|Cancel)$/}).allInnerTexts().catch(() => []);
                r.inputsDisabled = await win.locator('input[name="label"]').isDisabled().catch(() => null);
                await snap(page, `gpub-${label}`, r);
                const c = win.getByRole('button', {name: 'Cancel', exact: true}).or(win.getByRole('link', {name: 'Cancel', exact: true})).first();
                if (await c.count()) await c.click().catch(() => {}); else await win.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
                await idle(page);
                return r;
            };
            out.before = await readDep('01-unpublished');
            // publish on screen from Title & Abstract
            await openWf(wfUrl(T, S[k].id, `publication_${S[k].publicationId}_titleAbstract`));
            await page.waitForTimeout(1000); await idle(page);
            if (isOPS) {
                const post = page.getByRole('button', {name: 'Post', exact: true});
                await post.waitFor({timeout: 30000});
                out.pubLabel = 'Post';
                await post.click();
                const conf = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
                await conf.waitFor({timeout: 30000});
                out.confirm = flat(await conf.innerText().catch(() => null), 400);
                const posted = page.waitForResponse((r) => /\/publish/.test(r.url()), {timeout: 30000}).catch(() => null);
                await conf.getByRole('button', {name: 'Post', exact: true}).last().click();
                const pr = await posted; out.publishStatus = pr && pr.status();
                await page.waitForTimeout(1500); await idle(page);
                await snap(page, 'gpub-03-after-publish');
            }
            const pubBtn = page.locator('[data-cy="workflow-controls-right"]').getByRole('button', {name: /^(Publish|Schedule For Publication)$/}).first();
            if (!isOPS) out.pubLabel = flat(await pubBtn.innerText({timeout: 10000}).catch(() => null), 60);
            if (out.pubLabel && !isOPS) {
                const panel = page.locator('[data-cy="active-modal"]').filter({hasText: /Review Publishing Details|Review Posting Details|Review/}).last();
                await pubBtn.click();
                const vs = panel.locator('select[name="versionStage"]');
                if (!(await vs.isVisible({timeout: 5000}).catch(() => false))) { await pubBtn.click(); }
                await vs.waitFor({timeout: 30000}).catch(() => {});
                await vs.selectOption('VoR').catch(() => vs.selectOption({index: 1}).catch(() => {}));
                await panel.locator('select[name="versionIsMinor"]').selectOption('false').catch(() => {});
                const dont = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                if (await dont.isVisible({timeout: 3000}).catch(() => false)) await dont.check();
                await snap(page, 'gpub-02-publish-panel');
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
                await conf.waitFor({timeout: 20000}).catch(() => {});
                out.confirm = flat(await conf.innerText().catch(() => null), 400);
                const pubResp = page.waitForResponse((r) => /\/publish/.test(r.url()), {timeout: 30000}).catch(() => null);
                await conf.getByRole('button', {name: /^(Publish|Post)$/}).last().click().catch((e) => { out.confirmErr = flat(e.message, 200); });
                const pr = await pubResp; out.publishStatus = pr && pr.status();
                await page.waitForTimeout(1500); await idle(page);
                await snap(page, 'gpub-03-after-publish');
            }
            out.after = await readDep('04-published');
            record('gpub-summary', out);
            log('[gpub]', JSON.stringify(out).slice(0, 2000));
        });
    } finally {
        record('traffic', {traffic, jsDialogs});
        await close();
    }
});
