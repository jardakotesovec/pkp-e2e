// U21 claim check, housekeeping chunk I21 (2026-11-23): two incidentals rows (U21, 2026-11-20), main only.
//   date  (row a)  three apps: an Author starts a submission on "Make a Submission" ("Begin Submission") and the
//                  draft's dateSubmitted is read where the screens' own traffic carries it (the POST's answer, the
//                  wizard page's embedded state, the dashboards' list and workflow GETs) and where a screen shows
//                  it (My Submissions, the editorial dashboard's "Days" and "Needs editor", the workflow, and on
//                  OJS / OMP Statistics › Reports' "Articles Report" / "Monograph Report" CSV), before and after
//                  the author walks the wizard and submits. The database row is read as evidence beside it.
//   gate  (row b)  three apps: the start page of a Journal (Press, Preprint Server) Manager, an Editor (OJS, OMP),
//                  a Section editor (Series editor, Moderator), an Author and a Reader, with every author-role
//                  group open to self-registration (as installed) and closed (Settings › Users & Roles › Roles,
//                  "Allow user self-registration" unticked on "Author", and on a press "Chapter Author" too; the
//                  press also read with "Author" alone closed). A manager start form loaded while open is pressed
//                  after the groups are closed (what the screen's own POST then answers). The Section editor and,
//                  where the form shows, the Reader press "Begin Submission" on the closed end. Every
//                  POST submissions answer is searched for raw "{$…}" placeholders. "Remove" on the author-role
//                  groups of a fresh context with no members (the only way a context could lose them on screen).
//                  The groups are opened again at the end and the manager's start page read once more.
//   nav   (sweep)  three apps: with every author-role group closed, the manager's and the Author's dashboard
//                  sidebar, its "Start A New Submission" pressed, and the page it lands on (links on it).
//
//   bin/app-lock.sh shared ojs -- env PROBE_FEATURE=U21 PROBE_AGENT=ccI21 PROBE_RUN=r1 node bin/probe.js ojs shared/playwright/checks/U21/I21/i21.js
//   (one app per call: ojs, omp, ops; PROBE_RUN=r1 then r2; PHASES=date,gate,nav narrows, default all three.)
//   No other script or file is read. Each run seeds its own scratch contexts (tag prefix u21i); publicknowledge
//   and the roster are never touched. Facts land in facts-<phase>-<run>-<app>.json, snapshots in
//   <phase>-<step>-<run>-<app>.json/png, CSV downloads in outFile('report-<label>.csv').
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, sql, rawKeys, outFile} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const ALL = ['date', 'gate', 'nav'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const RUN = process.env.PROBE_RUN || 'r1';
const on = (p) => PHASES.includes(p);
const T = 30_000;
const log = (...a) => console.log(`[i21 ${RUN}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endAnchored = (name) => new RegExp(`${esc(name)}\\s*$`);
const REPO = path.resolve(__dirname, '../../../../..');
const FIX = {
    ojs: path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf'),
    omp: path.join(REPO, 'apps/omp/playwright/fixtures/files/article.pdf'),
    ops: path.join(REPO, 'apps/ops/playwright/fixtures/files/preprint.pdf'),
};
const RELATION_NONE = 'This preprint has not been published elsewhere.';

async function sect(name, fn) {
    try { return await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
        record(`${name}-FAILED`, {error: String(e.stack || e).slice(0, 3000)});
        return null;
    }
}

function parseCsv(text) {
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
}

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const L = {
        seLabel: isOMP ? 'Series editor' : isOPS ? 'Moderator' : 'Section editor',
        authorGroups: isOMP ? ['Author', 'Chapter Author'] : ['Author'],
        report: isOJS ? 'Articles Report' : isOMP ? 'Monograph Report' : null,
    };

    let {page, close} = await launch(app);
    // ------------------------------------------------------------------ traffic, console, dialogs
    const traffic = [];
    const errs = [];
    const dialogs = [];
    const bodies = []; // JSON answers of the submissions API (GET and POST), trimmed to the fields read here
    const pick = (o) => (o && typeof o === 'object' ? {id: o.id, dateSubmitted: o.dateSubmitted, submissionProgress: o.submissionProgress, dateLastActivity: o.dateLastActivity, status: o.status, stageId: o.stageId} : o);
    function attach(p) {
        p.on('response', async (r) => {
            const u = r.url();
            if (!/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
            const m = r.request().method();
            const e = {at: Date.now(), m, override: r.request().headers()['x-http-method-override'] || null,
                url: u.replace(/^https?:\/\/[^/]+/, ''), status: r.status()};
            if (m !== 'GET') e.sent = flat(r.request().postData(), 400);
            traffic.push(e);
            if (/\/_?submissions(\/\d+)?(\?|$)/.test(u)) {
                const txt = await r.text().catch(() => null);
                let j = null;
                try { j = JSON.parse(txt); } catch (x) { /* not JSON */ }
                const b = {at: e.at, m: e.override || m, url: e.url.split('&')[0].slice(0, 160), status: e.status};
                if (j && Array.isArray(j.items)) { b.itemsTotal = j.itemsMax; b.items = j.items.map(pick); } else if (j && j.id) b.item = pick(j); else b.raw = flat(txt, 600);
                bodies.push(b);
            }
        });
        p.on('pageerror', (e) => errs.push({at: Date.now(), type: 'pageerror', text: flat(e.message, 300), url: p.url()}));
        p.on('console', (msg) => { if (msg.type() === 'error') errs.push({at: Date.now(), type: 'console', text: flat(msg.text(), 300), url: p.url()}); });
        p.on('dialog', async (d) => {
            dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300), url: p.url()});
            if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
        });
    }
    attach(page);
    const writesSince = (t0) => traffic.filter((x) => x.at >= t0 && x.m !== 'GET').map((x) => ({op: x.override || x.m, url: x.url, status: x.status}));
    const errsSince = (t0) => errs.filter((x) => x.at >= t0);
    const bodiesSince = (t0, id) => bodies.filter((b) => b.at >= t0).map((b) => {
        if (b.items) { const it = b.items.find((x) => x && x.id === id); return {m: b.m, url: b.url, status: b.status, listed: !!it, item: it || null, itemsTotal: b.itemsTotal}; }
        return {m: b.m, url: b.url, status: b.status, item: b.item && (id == null || b.item.id === id) ? b.item : (b.item ? {otherId: b.item.id} : null), raw: b.raw};
    });

    async function snap(name, extra, p = page) {
        let s;
        try { s = await screen(p); } catch (e) { s = {url: p.url(), error: flat(e.message, 300), text: {}}; }
        if (extra) s.facts = extra;
        record(name, s);
        await shot(p, name).catch(() => {});
        return s;
    }
    const as = async (user, ctx, p = page) => { await signIn(p, user, {contextPath: ctx}); await idle(p).catch(() => {}); };
    const dbRow = (id) => { try { return sql(app, `select date_submitted, submission_progress, date_last_activity, stage_id, status from submissions where submission_id = ${Number(id)}`); } catch (e) { return String(e.message).slice(0, 200); } };
    const dbGroup = (id) => { try { return sql(app, `select coalesce(s.setting_value, sa.user_group_id::text) from stage_assignments sa left join user_group_settings s on s.user_group_id = sa.user_group_id and s.setting_name = 'name' and s.locale = 'en' where sa.submission_id = ${Number(id)}`); } catch (e) { return String(e.message).slice(0, 200); } };
    const dbUserGroups = (username, ctxPath) => {
        try {
            return sql(app, `select string_agg(coalesce(s.setting_value, ug.user_group_id::text), ', ' order by s.setting_value) from user_user_groups uug join users u on u.user_id = uug.user_id join user_groups ug on ug.user_group_id = uug.user_group_id left join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' and s.locale = 'en' join ${app.contextTables.table} c on c.${app.contextTables.id} = ug.context_id where u.username = '${username}' and c.path = '${ctxPath}' and (uug.date_end is null or uug.date_end > now())`);
        } catch (e) { return String(e.message).slice(0, 200); }
    };
    const sideNav = async (p = page) => (await p.locator('#app-nav a, nav a').evaluateAll((els) => els.map((a) => (a.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => [])).slice(0, 30);

    // ------------------------------------------------------------------ wizard helpers (after I28)
    const cur = () => page.locator('.pkpSteps__step__label--current');
    const curText = async () => flat(await cur().innerText().catch(() => ''), 80);
    const footer = () => page.locator('.submissionWizard__footer');
    async function continueTo(label) {
        const button = footer().getByRole('button', {name: 'Continue', exact: true});
        for (let attempt = 0; ; attempt++) {
            await button.click({timeout: 15000});
            try { await cur().filter({hasText: endAnchored(label)}).waitFor({timeout: 8000}); await idle(page); return; } catch (e) { if (attempt >= 2) throw e; }
        }
    }
    async function typeRich(id, text, p = page) {
        await p.locator(`#${id}_ifr`).waitFor({state: 'visible', timeout: T});
        await waitForEditorReady(p, id);
        await p.frameLocator(`#${id}_ifr`).locator('body').click();
        await p.keyboard.press('Control+A');
        await p.keyboard.press('Delete');
        if (text) await p.keyboard.type(text);
    }
    const richValue = (id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : null), id).catch(() => null);
    async function ensureAbstract(text) {
        const id = 'titleAbstract-abstract-control-en';
        if (!(await page.locator(`#${id}_ifr`).count())) return 'no abstract box';
        await waitForEditorReady(page, id).catch(() => {});
        if (flat(await richValue(id), 200)) return 'kept';
        await typeRich(id, text);
        return 'typed';
    }
    async function nextStepName() {
        const labels = (await page.locator('.pkpSteps__step__label').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
        const c = await curText();
        const i = labels.findIndex((l) => l === c);
        return labels[i + 1].replace(/^\d+\s*/, '');
    }
    async function continueToReview() {
        const out = {path: []};
        for (let i = 0; i < 8; i++) {
            const c = await curText();
            out.path.push(c);
            if (/Review\s*$/.test(c)) break;
            if (/Details\s*$/.test(c)) out.abstract = await ensureAbstract('An abstract typed by the I21 check.');
            if (/For Readers\s*$/.test(c)) {
                const r = page.getByRole('radio', {name: RELATION_NONE, exact: true});
                if ((await r.count()) && !(await r.isChecked())) { await r.check(); await sleep(300); out.relation = 'checked'; }
            }
            await continueTo(await nextStepName());
        }
        await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page);
        return out;
    }
    const galleyForm = () => page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')}).last();
    const uploadWin = () => page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    async function uploadOnScreen() {
        if (isOJS) {
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
            await chooser.setFiles(FIX.ojs);
            await page.getByRole('button', {name: 'Article Text', exact: true}).click();
            await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText('Article Text').waitFor({timeout: T});
        } else if (isOMP) {
            await page.locator('.submissionFilesListPanel input[type="file"]').setInputFiles(FIX.omp);
            const g = page.locator('.listPanel--submissionFiles__setGenre').getByRole('button', {name: 'Book Manuscript', exact: true});
            await g.waitFor({timeout: T});
            await g.click();
            await page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: 'Book Manuscript'}).first().waitFor({timeout: T});
        } else {
            for (let attempt = 0; ; attempt++) {
                await page.getByRole('link', {name: 'Add File', exact: true}).first().click();
                try { await galleyForm().locator('input[name="label"]').waitFor({timeout: 8000}); break; } catch (e) { if (attempt >= 2) throw e; }
            }
            await idle(page);
            await galleyForm().locator('input[name="label"]').fill('PDF');
            await galleyForm().getByRole('button', {name: 'Save', exact: true}).last().click();
            const w = uploadWin();
            await w.waitFor({state: 'visible', timeout: T});
            await w.locator('select[name="genreId"]').first().waitFor({timeout: 15000});
            await sleep(1500);
            await w.locator('select[name="genreId"]').first().selectOption({label: 'Preprint Text'});
            await sleep(800);
            await w.locator('input[type="file"]').first().setInputFiles(FIX.ops);
            const press = async (btn) => { for (let i = 0; i < 40; i++) { if (await btn.isEnabled().catch(() => false)) break; await sleep(500); } await btn.click({timeout: 5000}); };
            await press(w.getByRole('button', {name: 'Continue', exact: true}).first());
            await w.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: T});
            await press(w.getByRole('button', {name: 'Continue', exact: true}).first());
            await w.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: T});
            await press(w.getByRole('button', {name: 'Complete', exact: true}).first());
            await w.waitFor({state: 'hidden', timeout: T});
        }
        await Promise.race([idle(page).catch(() => {}), sleep(10000)]);
    }
    async function submitNow() {
        const o = {};
        const submit = footer().getByRole('button', {name: 'Submit', exact: true});
        o.button = {count: await submit.count(), disabled: (await submit.count()) ? await submit.isDisabled() : null};
        if (!o.button.count || o.button.disabled) return o;
        await submit.click();
        const confirm = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Submit', exact: true})}).last();
        if (await confirm.waitFor({state: 'visible', timeout: 10000}).then(() => true).catch(() => false)) {
            o.confirmText = flat(await confirm.innerText().catch(() => null), 400);
            await confirm.getByRole('button', {name: 'Submit', exact: true}).click();
        }
        o.completed = await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000}).then(() => true).catch(() => false);
        await idle(page).catch(() => {});
        return o;
    }
    // The wizard page's embedded state (the page's own markup, which the Vue page starts from).
    async function embeddedState() {
        const html = await page.content().catch(() => '');
        const m1 = html.match(/"dateSubmitted":(null|"[^"]*")/);
        const m2 = html.match(/"submissionProgress":(null|"[^"]*")/);
        return {dateSubmitted: m1 ? JSON.parse(m1[1]) : '(not in page)', submissionProgress: m2 ? JSON.parse(m2[1]) : '(not in page)'};
    }

    // Start page by address; what it shows, for the signed-in user.
    async function readStart(ctx, name, p = page) {
        const t0 = Date.now();
        const r = await p.goto(app.url(`/index.php/${ctx}/submission`));
        await idle(p).catch(() => {});
        const o = {status: r ? r.status() : null, url: p.url().replace(/^https?:\/\/[^/]+/, '')};
        o.h1 = flat(await p.locator('h1').first().innerText().catch(() => null), 120);
        o.notAllowed = await p.getByRole('heading', {name: 'Not Allowed'}).count();
        o.beginButton = await p.getByRole('button', {name: 'Begin Submission'}).count();
        o.submitAs = await p.locator('input[type=radio][name="userGroupId"]').evaluateAll((els) => els.map((e) => `${(e.labels && e.labels[0] ? e.labels[0].innerText : '').trim()}${e.checked ? '*' : ''}`)).catch(() => []);
        o.rawKeys = await rawKeys(p).catch(() => null);
        o.sideNav = (await sideNav(p)).filter((x) => /Submission/i.test(x));
        const s = await snap(name, null, p);
        o.mainText = flat((s.text && (s.text.main || s.text.body)) || '', 700);
        o.errors = errsSince(t0);
        return o;
    }
    async function fillStart(title, p = page) {
        await typeRich('startSubmission-title-control', title, p);
        for (const box of [p.getByRole('checkbox', {name: /meets all of these requirements/}), p.getByRole('checkbox', {name: /agree to have my data collected/})]) {
            if (await box.count()) await box.check();
        }
        const radios = await p.getByRole('radio').evaluateAll((els) => els.map((e) => ({name: e.name, checked: e.checked})));
        const groups = {};
        for (const r of radios) (groups[r.name] ||= []).push(r);
        for (const [g, list] of Object.entries(groups)) {
            if (!list.some((r) => r.checked)) await p.locator(`input[type=radio][name="${g}"]`).first().check();
        }
    }
    // "Begin Submission" on a filled form: the POST's answer (status, the body's dateSubmitted, or the refusal).
    async function pressBegin(name, p = page) {
        const t0 = Date.now();
        const posted = p.waitForResponse((r) => r.request().method() === 'POST' && /\/api\/v1\/submissions(\?|$)/.test(r.url()), {timeout: T}).catch(() => null);
        await p.getByRole('button', {name: 'Begin Submission'}).click();
        const r = await posted;
        const o = {status: r ? r.status() : 'no POST'};
        if (r) {
            const txt = await r.text().catch(() => '');
            let j = null;
            try { j = JSON.parse(txt); } catch (e) { /* */ }
            o.sentKeys = Object.keys((() => { try { return r.request().postDataJSON() || {}; } catch (e) { return {}; } })());
            if (r.status() < 400 && j) { o.id = j.id; o.answer = pick(j); } else o.refusal = flat(txt, 600);
            o.placeholders = /\{\$[a-zA-Z]+\}/.test(txt);
        }
        if (o.id) {
            await p.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45_000}).catch(() => {});
            await p.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
            await idle(p).catch(() => {});
        } else {
            await idle(p).catch(() => {});
            await sleep(1000);
            o.shown = flat((await p.locator('.pkpFormError, .pkpFieldError, [role="alert"], .pkpNotification').allInnerTexts().catch(() => [])).join(' | '), 400);
        }
        const s = await snap(name, o, p);
        o.screenNotices = s.notices;
        o.errors = errsSince(t0);
        o.dialogs = dialogs.filter((d) => d.at >= t0);
        return o;
    }

    const ctxBase = (t, label, users) => {
        const body = {tag: t, context: {name: `U21 I21 ${label} ${t}`, contactName: 'I21 Contact', contactEmail: `${t}contact@mail.test`}, users};
        if (isOJS) body.sections = [{abbrev: 'ART', title: 'Articles'}];
        if (isOPS) body.sections = [{abbrev: 'PRE', title: 'Preprints', path: 'preprints'}];
        return body;
    };

    try {
        // ============================================================== date (row a)
        if (on('date')) await sect('date', async () => {
            const F = {app: app.name, run: RUN};
            const t = tag('u21id');
            const users = [{username: `${t}au`, roles: ['author'], givenName: 'Ada', familyName: 'Datecheck'}, {username: `${t}mg`, roles: ['manager'], givenName: 'Mel', familyName: 'Manager'}];
            const C = await app.api.createContext(ctxBase(t, 'date', users));
            const ctx = C.path || t;
            F.ctx = ctx;
            const title = `I21 date ${t}`;
            const AU = `${t}au`, MG = `${t}mg`;

            // 1. The Author starts the submission.
            await as(AU, ctx);
            await readStart(ctx, 'date-01-start');
            await fillStart(title);
            const tBegin = Date.now();
            F.beginAt = new Date(tBegin).toISOString();
            F.begin = await pressBegin('date-02-after-begin');
            const id = F.begin.id;
            F.id = id;
            if (!id) throw new Error(`Begin Submission refused: ${JSON.stringify(F.begin).slice(0, 500)}`);
            F.wizardEmbedded = await embeddedState();
            F.wizardGets = bodiesSince(tBegin, id);
            F.db0 = dbRow(id);
            log('created', id, F.begin.answer, F.wizardEmbedded, F.db0);

            // 2. My Submissions and the author's workflow view, before submitting.
            let t1 = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions`));
            await idle(page);
            await sleep(800);
            const ms0 = await snap('date-03-mysubmissions-draft');
            F.mySubs0 = {row: flat(await page.locator('tbody tr').filter({hasText: title}).first().innerText().catch(() => null), 300), headers: (await page.locator('thead th').allInnerTexts().catch(() => [])).map((x) => flat(x, 40)), api: bodiesSince(t1, id)};
            t1 = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}`));
            await idle(page); await sleep(1500);
            const wfA = await snap('date-04-author-workflow-draft');
            F.authorWorkflow0 = {url: page.url().replace(/^https?:\/\/[^/]+/, ''), dialogText: flat(wfA.text && wfA.text.dialog, 600), api: bodiesSince(t1, id)};
            await signOut(page);

            // 3. The manager: editorial dashboard (Active, Needs editor), the workflow, the report.
            async function managerReads(label) {
                const o = {};
                await as(MG, ctx);
                for (const v of isOPS ? ['active'] : ['active', 'needs-editor']) {
                    const tv = Date.now();
                    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=${v}`));
                    await idle(page); await sleep(1000);
                    await snap(`date-${label}-editorial-${v}`);
                    o[v] = {
                        heading: flat(await page.locator('#app-main h1, main h1').first().innerText().catch(() => null), 120),
                        headers: (await page.locator('thead th').allInnerTexts().catch(() => [])).map((x) => flat(x, 40)),
                        row: flat(await page.locator('tbody tr').filter({hasText: title}).first().innerText().catch(() => null), 300),
                        badges: flat(await page.locator('#app-nav').innerText().catch(() => null), 500),
                        api: bodiesSince(tv, id),
                    };
                }
                const tw = Date.now();
                await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${id}`));
                await idle(page); await sleep(1500);
                const w = await snap(`date-${label}-manager-workflow`);
                o.workflow = {dialogText: flat(w.text && w.text.dialog, 900), api: bodiesSince(tw, id)};
                if (L.report) {
                    const tr = Date.now();
                    await page.goto(app.url(`/index.php/${ctx}/stats/reports`));
                    await idle(page);
                    await snap(`date-${label}-reports`);
                    try {
                        const dl = page.waitForEvent('download', {timeout: 60_000});
                        await page.locator('main').getByRole('link', {name: L.report, exact: true}).click();
                        const d = await dl;
                        const buf = fs.readFileSync(await d.path());
                        const file = outFile(`report-${label}.csv`);
                        fs.writeFileSync(file, buf);
                        let text = buf.toString('utf8');
                        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
                        const rows = parseCsv(text);
                        const header = rows[0] || [];
                        const iDate = header.findIndex((h) => /submitted/i.test(h));
                        const row = rows.find((r) => r.some((c) => c === String(id)) || r.some((c) => c.includes(title)));
                        o.report = {file: path.basename(file), header: header.slice(0, 40), dateColumn: iDate >= 0 ? header[iDate] : null, row: row ? Object.fromEntries(header.map((h, i) => [h, row[i]]).filter(([h, v]) => /id|title|status|submitted|stage|date/i.test(h) && v !== '')) : 'draft not listed', rowsCount: rows.length - 1};
                    } catch (e) {
                        o.report = {error: flat(e.message, 300), errors: errsSince(tr)};
                    }
                }
                await signOut(page);
                return o;
            }
            F.manager0 = await managerReads('05-draft');
            F.db1 = dbRow(id);

            // 4. The author walks the wizard and submits; the date read again.
            await sleep(3000);
            await as(AU, ctx);
            let t2 = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/submission?id=${id}`));
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            F.wizardEmbeddedResume = await embeddedState();
            F.wizardResumeGets = bodiesSince(t2, id);
            await snap('date-06-wizard-resumed');
            await uploadOnScreen();
            F.walk = await continueToReview();
            await snap('date-07-review');
            const tSubmit = Date.now();
            F.submitAt = new Date(tSubmit).toISOString();
            F.submit = await submitNow();
            F.submitWrites = writesSince(tSubmit);
            F.submitAnswers = bodiesSince(tSubmit, id);
            await snap('date-08-after-submit', F.submit);
            F.db2 = dbRow(id);
            // The complete screen reloaded (the wizard address of a submitted submission).
            await page.goto(app.url(`/index.php/${ctx}/submission?id=${id}`));
            await idle(page);
            F.wizardEmbeddedAfter = await embeddedState();
            await snap('date-09-wizard-address-after-submit');
            t1 = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions`));
            await idle(page); await sleep(800);
            await snap('date-10-mysubmissions-submitted');
            F.mySubs1 = {row: flat(await page.locator('tbody tr').filter({hasText: title}).first().innerText().catch(() => null), 300), api: bodiesSince(t1, id)};
            t1 = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}`));
            await idle(page); await sleep(1500);
            const wfA1 = await snap('date-11-author-workflow-submitted');
            F.authorWorkflow1 = {dialogText: flat(wfA1.text && wfA1.text.dialog, 600), api: bodiesSince(t1, id)};
            await signOut(page);
            F.manager1 = await managerReads('12-submitted');
            F.errors = errs;
            F.dialogs = dialogs;
            record('facts-date', F);
            log('date facts', JSON.stringify({id, begin: F.begin.answer, emb: F.wizardEmbedded, db0: F.db0, db2: F.db2, submit: F.submit, rep0: F.manager0.report && F.manager0.report.row, rep1: F.manager1.report && F.manager1.report.row}));
        });

        // ============================================================== gate (row b)
        if (on('gate')) await sect('gate', async () => {
            const F = {app: app.name, run: RUN, reads: {}};
            const t = tag('u21ig');
            const U = (k, roles, g) => ({username: `${t}${k}`, roles, givenName: g, familyName: 'Gatecheck'});
            const users = [U('mg', ['manager'], 'Mona'), U('seo', ['sectionEditor'], 'Sean'), U('sec', ['sectionEditor'], 'Sela'),
                U('au', ['author'], 'Aldo'), U('rdo', ['reader'], 'Rhea'), U('rdc', ['reader'], 'Rolf')];
            if (!isOPS) users.push(U('ed', ['editor'], 'Edda'));
            const C = await app.api.createContext(ctxBase(t, 'gate', users));
            const ctx = C.path || t;
            F.ctx = ctx;
            const who = (k) => `${t}${k}`;
            F.groups0 = Object.fromEntries(users.map((u) => [u.username.slice(t.length), dbUserGroups(u.username, ctx)]));

            // 1. Open end (as installed): every account's start page.
            const openKeys = ['mg', ...(isOPS ? [] : ['ed']), 'seo', 'au', 'rdo'];
            for (const k of openKeys) {
                await as(who(k), ctx);
                F.reads[`open-${k}`] = await readStart(ctx, `gate-01-open-${k}`);
                if (k === 'mg') await loc(page, 'Make a Submission: "Begin Submission"', page.getByRole('button', {name: 'Begin Submission'}));
            }
            F.groupsAfterOpen = {seo: dbUserGroups(who('seo'), ctx), rdo: dbUserGroups(who('rdo'), ctx)};

            // 2. The manager loads the start form (open), and in a second tab closes every author-role group.
            await as(who('mg'), ctx);
            F.reads['stale-form-loaded'] = await readStart(ctx, 'gate-02-mg-form-loaded');
            await fillStart(`I21 gate stale ${t}`);
            const tab = await page.context().newPage();
            attach(tab);
            const {RolesTab} = require('../../../pages/RolesConfigurationPages.js');
            const roles = new RolesTab(tab, ctx, {stages: []});
            F.close = [];
            for (const g of L.authorGroups) {
                await roles.goto();
                const win = await roles.openEdit(g);
                const box = win.optionBox('Allow user self-registration');
                const before = await box.isChecked();
                await box.uncheck();
                await snap(`gate-03-role-${g.replace(/\W+/g, '')}-unticked`, null, tab);
                const resp = await win.save();
                await roles.reload();
                const w2 = await roles.openEdit(g);
                const after = await w2.optionBox('Allow user self-registration').isChecked();
                await w2.cancel();
                F.close.push({group: g, before, save: resp.status(), afterReload: after});
                if (isOMP && g === 'Author') {
                    // the press with "Author" alone closed: the manager's start page in the second tab
                    F.reads['omp-author-only-closed-mg'] = await readStart(ctx, 'gate-04-mg-author-only-closed', tab);
                }
            }
            await snap('gate-05-roles-closed', {close: F.close}, tab);
            await tab.close();
            // the stale form, pressed now
            F.staleBegin = await pressBegin('gate-06-mg-stale-begin');
            if (F.staleBegin.id) {
                F.staleBegin.group = dbGroup(F.staleBegin.id);
                F.staleBegin.db = dbRow(F.staleBegin.id);
                F.staleBegin.step = await curText();
            }
            F.groupsMgAfterStale = dbUserGroups(who('mg'), ctx);

            // 3. Closed end: every account's start page (the readers and section editors not yet seen, twice).
            F.reads['closed-mg'] = await readStart(ctx, 'gate-07-closed-mg');
            const closedKeys = [...(isOPS ? [] : ['ed']), 'sec', 'au', 'rdc'];
            for (const k of closedKeys) {
                await as(who(k), ctx);
                F.reads[`closed-${k}`] = await readStart(ctx, `gate-08-closed-${k}`);
                if (k === 'sec' || k === 'rdc') {
                    F[`groups-${k}-after-first-visit`] = dbUserGroups(who(k), ctx);
                    F.reads[`closed-${k}-again`] = await readStart(ctx, `gate-08-closed-${k}-again`);
                    if (F.reads[`closed-${k}-again`].beginButton) {
                        await fillStart(`I21 gate ${k} ${t}`);
                        F[`begin-${k}`] = await pressBegin(`gate-09-closed-${k}-begin`);
                        if (F[`begin-${k}`].id) F[`begin-${k}`].group = dbGroup(F[`begin-${k}`].id);
                        F[`groups-${k}-after-begin`] = dbUserGroups(who(k), ctx);
                    }
                }
            }
            // the manager's own "Not Allowed" page: the sidebar and the link on it
            await as(who('mg'), ctx);
            F.reads['closed-mg-again'] = await readStart(ctx, 'gate-10-closed-mg-again');
            F.notAllowedLinks = await page.locator('main a, #app-main a').evaluateAll((els) => els.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []);

            // 4. Open again: the manager ticks the boxes back; the start page once more.
            const tab2 = await page.context().newPage();
            attach(tab2);
            const roles2 = new RolesTab(tab2, ctx, {stages: []});
            F.reopen = [];
            for (const g of L.authorGroups) {
                await roles2.goto();
                const win = await roles2.openEdit(g);
                await win.optionBox('Allow user self-registration').check();
                F.reopen.push({group: g, save: (await win.save()).status()});
            }
            await tab2.close();
            F.reads['reopened-mg'] = await readStart(ctx, 'gate-11-reopened-mg');
            await signOut(page);

            // 5. A fresh context with no members in its author-role groups: "Remove" on each (the only screen way
            //    to leave a context without one, which the API's placeholder refusal needs).
            const t3 = tag('u21ir');
            const C3 = await app.api.createContext(ctxBase(t3, 'remove', [{username: `${t3}mg`, roles: ['manager'], givenName: 'Rémy'}]));
            const ctx3 = C3.path || t3;
            await as(`${t3}mg`, ctx3);
            const roles3 = new RolesTab(page, ctx3, {stages: []});
            F.remove = [];
            for (const g of [...L.authorGroups, ...(isOPS ? [] : ['Translator'])]) {
                const t0 = Date.now();
                await roles3.goto();
                const o = {group: g};
                try {
                    const dlg = await roles3.openRemove(g);
                    o.confirmText = await dlg.text();
                    const ans = await dlg.ok();
                    o.answer = ans && ans.status ? {status: ans.status(), body: flat(await ans.text().catch(() => ''), 300)} : null;
                    await idle(page); await sleep(1500);
                    const s = await snap(`gate-12-remove-${g.replace(/\W+/g, '')}`);
                    o.notices = s.notices;
                    await roles3.reload();
                    o.stillListed = (await roles3.rowNames()).includes(g);
                } catch (e) { o.error = flat(e.message, 300); }
                o.errors = errsSince(t0);
                F.remove.push(o);
            }
            await signOut(page);

            F.groupsEnd = Object.fromEntries(users.map((u) => [u.username.slice(t.length), dbUserGroups(u.username, ctx)]));
            F.placeholdersInAnyAnswer = bodies.some((b) => /\{\$[a-zA-Z]+\}/.test(JSON.stringify(b)));
            F.errors = errs;
            F.dialogs = dialogs;
            record('facts-gate', F);
            const brief = Object.fromEntries(Object.entries(F.reads).map(([k, v]) => [k, {h1: v.h1, notAllowed: v.notAllowed, begin: v.beginButton, submitAs: v.submitAs, raw: v.rawKeys && v.rawKeys.length, nav: v.sideNav}]));
            log('gate facts', JSON.stringify({brief, close: F.close, stale: F.staleBegin && {status: F.staleBegin.status, id: F.staleBegin.id, group: F.staleBegin.group, refusal: F.staleBegin.refusal}, sec: F['begin-sec'] && {status: F['begin-sec'].status, group: F['begin-sec'].group, refusal: F['begin-sec'].refusal}, rdc: F['begin-rdc'] && {status: F['begin-rdc'].status, group: F['begin-rdc'].group, refusal: F['begin-rdc'].refusal}, groups: F.groupsEnd, remove: F.remove, placeholders: F.placeholdersInAnyAnswer}));
        });
        // ============================================================== nav (sweep)
        if (on('nav')) await sect('nav', async () => {
            const F = {app: app.name, run: RUN};
            const t = tag('u21in');
            const C = await app.api.createContext(ctxBase(t, 'nav', [{username: `${t}mg`, roles: ['manager'], givenName: 'Nora'}, {username: `${t}au`, roles: ['author'], givenName: 'Nils'}]));
            const ctx = C.path || t;
            F.ctx = ctx;
            await as(`${t}mg`, ctx);
            const {RolesTab} = require('../../../pages/RolesConfigurationPages.js');
            const roles = new RolesTab(page, ctx, {stages: []});
            F.close = [];
            for (const g of L.authorGroups) {
                await roles.goto();
                const win = await roles.openEdit(g);
                await win.optionBox('Allow user self-registration').uncheck();
                F.close.push({group: g, save: (await win.save()).status()});
            }
            for (const [k, home] of [['mg', 'editorial'], ['au', 'mySubmissions']]) {
                await as(`${t}${k}`, ctx);
                await page.goto(app.url(`/index.php/${ctx}/dashboard/${home}`));
                await idle(page); await sleep(800);
                const o = {};
                const s0 = await snap(`nav-01-${k}-dashboard`);
                o.sideNav = await sideNav();
                const entry = page.locator('#app-nav').getByRole('link', {name: 'Start A New Submission'});
                o.entry = await entry.count();
                if (o.entry) {
                    o.href = await entry.first().getAttribute('href');
                    await entry.first().click();
                    await page.waitForLoadState('load');
                    await idle(page).catch(() => {});
                    const s1 = await snap(`nav-02-${k}-after-entry`);
                    o.landed = page.url().replace(/^https?:\/\/[^/]+/, '');
                    o.h1 = flat(await page.locator('h1').first().innerText().catch(() => null), 120);
                    o.begin = await page.getByRole('button', {name: 'Begin Submission'}).count();
                    o.text = flat((s1.text && (s1.text.main || s1.text.body)) || '', 500);
                    o.links = await page.locator('body a').evaluateAll((els) => els.filter((a) => /contact|mailto/i.test(a.getAttribute('href') || '') || /Contact/.test(a.innerText)).map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []);
                    o.backendNav = await page.locator('#app-nav').count();
                }
                void s0;
                F[k] = o;
            }
            await signOut(page);
            F.errors = errs;
            record('facts-nav', F);
            log('nav facts', JSON.stringify({mg: F.mg, au: F.au && {entry: F.au.entry, h1: F.au.h1, begin: F.au.begin}}));
        });
    } finally {
        await close();
    }
});
