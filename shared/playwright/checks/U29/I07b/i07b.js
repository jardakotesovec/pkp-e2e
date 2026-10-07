// U29 claim check, housekeeping chunk I07b (hk07b, 2026-10-07): incidentals row L9 in
// .reports/hk07b/chunks/U29.md.
//   L9  {OJS} "the reviewer recommendations list is built once per request": every screen, email and
//       download that names a review's recommendation, read against the review's stored choice and the
//       language asked for. One scratch journal per run with English and French as form languages:
//         mg  Journal manager (assigned to the submission)      ed  Section editor (assigned)
//         je  Journal editor (assigned)                         au  Author
//         r1, r2, r3  Reviewers, requests accepted
//       Walk:
//         recs      mg: Settings › Workflow › Review › "Reviewer Recommendations"; "Add Recommendation" with an
//                   English and a French name ("I07b Major rework" / "I07b Refonte majeure")
//         rev1      r1, English interface: step 3's "Recommendation" list; "Revisions Required"; "Submit Review";
//                   the "Review complete" emails to mg and ed
//         rev2save  r2, French interface: step 3's list; the custom entry; "Sauvegarder pour plus tard"
//         deact     mg: unticks "Revisions Required" (r1's submitted choice) and the custom entry (r2's saved one)
//         rev2      r2, French interface: step 3 again (the saved, now inactive choice), "Soumettre l'évaluation";
//                   the emails
//         rev3      r3, English interface: step 3's list (neither inactive entry), "Accept Submission", submit;
//                   the emails
//         editor    mg, English then French interface: the Reviewers table, each row's "Read Review" window and its
//                   "Download" › "All sections (XML)"
//         report    mg, English then French interface: Statistics › Reports › "Review Report" (the CSV)
//         decision  mg, English interface: "Request Revisions", the "Notify Authors" letter as it opens and after
//                   "Switch to: French"; French interface: the same page by its address, both languages;
//                   English interface again: the letter switched to French, "Record Decision", the author's email
//       Evidence only: SELECTs of the stored choices and names.
//
// State of the script (2026-10-07): phases recs … report ran once, on one scratch journal (PROBE_RUN=d1, in
// several processes). The decision phase never got past the "Request Revisions" window; the "Next" press it
// lacked is written below but has not been run. The editor phase takes about five minutes per language (three
// windows, each with a download and the table's redraw); run the phases apart when the fleet is shared.
// Phases (PHASES=…; default all), one process; a state file lets a later process resume a run's journal.
// Run twice, each under its own PROBE_RUN:
//   PROBE_RUN=r1 PROBE_FEATURE=U29 PROBE_AGENT=ccI07b node bin/probe.js ojs shared/playwright/checks/U29/I07b/i07b.js
//   PROBE_RUN=r2 …
// OMP and OPS have no reviewer recommendations (spec OMP1; OPS has no review stage): the script skips them.
// No assertions: the script records, the reader judges.
const fs = require('fs');
const {forEachApp, launch, signIn, signOut, switchLanguage, screen, shot, record, loc, note, idle, tag, sql, outFile} = require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['recs', 'rev1', 'rev2save', 'deact', 'rev2', 'rev3', 'editor', 'report', 'decision'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',').map((s) => s.trim());
const on = (p) => PHASES.includes(p);
const T = 30_000;
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const strip = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\//, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CUSTOM_EN = 'I07b Major rework';
const CUSTOM_FR = 'I07b Refonte majeure';

function fact(key, value) {
    record('i07b-facts', {[key]: value}, {merge: true});
    console.log(`[i07b ${RUN} +${Math.round((Date.now() - T0) / 1000)}s] [${key}]`, JSON.stringify(value).slice(0, 2200));
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        console.log(`[i07b ${RUN}] ${app.name}: no reviewer recommendations on this app, nothing to drive`);
        return;
    }
    const db = (q) => { try { return sql(app, q).split('\n').filter(Boolean); } catch (e) { return [`ERROR ${flat(e.message, 200)}`]; } };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    await app.api.bootstrapProbe(app.contextPath);

    const {page, close} = await launch(app);
    page.setDefaultTimeout(T);
    const jsDialogs = [], net = [], pageErrors = [], consoleErrs = [];
    page.on('dialog', async (d) => {
        jsDialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    page.on('response', (r) => { const u = r.url(); if (r.status() >= 400 || /\/api\/|\$\$\$call\$\$\$|reviewer\/|stats\/reports\/report|decision\//.test(u)) net.push({at: Date.now(), m: r.request().method(), u: strip(u).slice(0, 220), s: r.status()}); });
    page.on('pageerror', (e) => pageErrors.push({at: Date.now(), text: flat(e.message, 200), url: strip(page.url())}));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrs.push({at: Date.now(), text: flat(m.text(), 200), url: strip(page.url())}); });
    const since = (arr, t0) => arr.filter((x) => x.at >= t0).map(({at, ...x}) => x);

    let snapN = 0;
    async function snap(name, extra) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), text: {}, screenError: flat(e.message, 200)}; }
        s.lang = await page.evaluate(() => document.documentElement.lang).catch(() => null);
        if (extra) s.facts = extra;
        const n = `i07b-${String(++snapN).padStart(3, '0')}-${name}`;
        record(n, s);
        await shot(page, n).catch(() => {});
        s.name = `${n}-${RUN}-${app.name}`;
        return s;
    }
    async function sect(name, fn) {
        if (!on(name)) return;
        const t0 = Date.now();
        console.log(`[i07b ${RUN} ${app.name}] == ${name}`);
        try { await fn(); } catch (e) {
            fact(`${name}.FAILED`, flat(e.stack || e, 1500));
            await snap(`zz-failed-${name}`).catch(() => {});
        }
        fact(`${name}.crashes`, {server: since(net, t0).filter((r) => r.s >= 500), script: since(pageErrors, t0), consoleErrors: since(consoleErrs, t0).slice(0, 20)});
        const b4 = since(net, t0).filter((r) => r.s >= 400 && r.s < 500);
        if (b4.length) fact(`${name}.4xx`, b4.slice(0, 40));
        const d = since(jsDialogs, t0);
        if (d.length) fact(`${name}.dialogs`, d);
    }
    const go = async (url) => { const r = await page.goto(url).catch((e) => ({err: flat(e.message, 200)})); await idle(page).catch(() => {}); return r; };
    const lang = () => page.evaluate(() => document.documentElement.lang).catch(() => null);
    /** Sign in (the kit lands on the English interface); `fr` then switches through the user menu. */
    async function as(user, ctx, {fr = false} = {}) {
        await signIn(page, user, {contextPath: ctx}); await idle(page).catch(() => {});
        if (fr) {
            if (!(await page.locator('[data-cy="app-user-nav"] button').first().isVisible().catch(() => false))) await go(cu(ctx, '/dashboard'));
            await switchLanguage(page, 'fr_CA');
        }
        return lang();
    }

    // ---------------------------------------------------------------- seed (or resume)
    const stateFile = outFile('i07b-state.json');
    let S = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    if (!S) {
        const t = tag('u29i07b').slice(0, 26) + RUN;
        const who = [['mg', ['manager'], 'Mona', 'Manager'], ['ed', ['sectionEditor'], 'Edda', 'Editor'], ['je', ['editor'], 'Jules', 'Journaled'], ['au', ['author'], 'Ada', 'Author'],
            ['r1', ['externalReviewer'], 'Rowan', 'Firstrev'], ['r2', ['externalReviewer'], 'Sacha', 'Secondrev'], ['r3', ['externalReviewer'], 'Tessa', 'Thirdrev']];
        const res = await app.api.createContext({tag: t,
            context: {name: `U29 I07b ${t}`, primaryLocale: 'en', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], contactName: 'Pat Principal', contactEmail: `${t}pc@mail.test`, country: 'CA'},
            users: who.map(([u, r, g, f]) => ({username: `${t}${u}`, roles: r, givenName: g, familyName: f}))});
        S = {path: res.path || t, id: res.contextId, u: Object.fromEntries(who.map(([u]) => [u, `${t}${u}`])), names: {r1: 'Firstrev', r2: 'Secondrev', r3: 'Thirdrev'}};
        S.title = `I07b review ${t}`;
        const sub = await app.api.createSubmission({tag: `${t}s`.slice(0, 32), context: S.path, submitter: S.u.au, title: S.title, decisions: ['sendExternalReview'],
            participants: [{username: S.u.mg, role: 'manager'}, {username: S.u.ed, role: 'sectionEditor'}, {username: S.u.je, role: 'editor'}],
            reviewRounds: [{reviewers: [{username: S.u.r1, status: 'accepted'}, {username: S.u.r2, status: 'accepted'}, {username: S.u.r3, status: 'accepted'}]}]});
        S.sub = sub.submissionId;
        fs.writeFileSync(stateFile, JSON.stringify(S, null, 1));
        fact('seed', {path: S.path, id: S.id, sub: S.sub, users: S.u});
    }
    const mailOf = (k) => `${S.u[k]}@mail.test`;

    /** The stored side (evidence only): each review's choice, each entry's names and state. */
    function stored(label) {
        const reviews = db(`SELECT u.username, ra.review_id, ra.reviewer_recommendation_id, ra.date_completed IS NOT NULL FROM review_assignments ra JOIN users u ON u.user_id = ra.reviewer_id WHERE ra.submission_id = ${S.sub} ORDER BY ra.review_id`);
        const entries = db(`SELECT r.reviewer_recommendation_id, r.status, s.locale, s.setting_value FROM reviewer_recommendations r JOIN reviewer_recommendation_settings s USING (reviewer_recommendation_id) WHERE r.context_id = ${S.id} AND s.setting_name = 'title' ORDER BY 1, 3`);
        fact(`stored.${label}`, {reviews, entries});
    }

    // ---------------------------------------------------------------- windows
    const dlg = () => page.locator('[role="dialog"]:visible').last();
    const waitModal = async () => { await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 10000}).catch(() => {}); await idle(page); };
    const modalText = async () => flat(await dlg().innerText().catch(() => ''), 800);

    // ---------------------------------------------------------------- the manager's table (after K6)
    const recRoot = () => page.locator('[data-cy="reviewer-recommendation-manager"]');
    async function openRecTab() {
        await go(cu(S.path, '/dashboard')); // leave first: a hash-only goto reloads nothing
        await go(cu(S.path, '/management/settings/workflow'));
        await page.locator('#review-button').click(); await idle(page);
        await page.locator('main [role=tab]').filter({hasText: /^\s*(Reviewer Recommendations|Recommandations)/}).first().click().catch(async () => { await page.locator('#reviewerRecommendations-button').click(); });
        await recRoot().locator('tbody tr').first().waitFor({timeout: T});
        await idle(page);
    }
    const recTable = () => recRoot().evaluate((root) => ({
        columns: [...root.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...root.querySelectorAll('tbody tr')].map((tr) => ({
            title: (tr.querySelector('th, td') || {}).innerText?.trim(),
            checked: tr.querySelector('input[type=checkbox]')?.checked ?? null,
            menu: [...tr.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim()),
        })),
    }));
    const recRow = (title) => recRoot().locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^\\s*${esc(title)}\\s*$`)})}).first();
    async function untick(title) {
        const row = recRow(title);
        const before = await row.locator('input[type=checkbox]').isChecked();
        await row.locator('input[type=checkbox]').click();
        await waitModal();
        const asked = await modalText();
        await dlg().getByRole('button', {name: 'Yes', exact: true}).click();
        await page.waitForFunction(({title, want}) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === title && tr.querySelector('input[type=checkbox]')?.checked === want), {title, want: !before}, {timeout: 10000}).catch(() => {});
        await idle(page);
        return {before, asked};
    }

    // ---------------------------------------------------------------- the reviewer's wizard
    async function step3() {
        await go(cu(S.path, `/reviewer/submission/${S.sub}?step=3`));
        const sel = page.locator('main select[name="reviewerRecommendationId"]').first();
        for (let i = 0; i < 3 && !(await sel.isVisible().catch(() => false)); i++) {
            // an accepted request seeded opens on step 1: its and step 2's own button lead on
            const next = page.locator('main button.submitFormButton:visible').first();
            if (await next.count()) { await next.click().catch(() => {}); await idle(page); }
            await sel.waitFor({state: 'visible', timeout: 10000}).catch(() => {});
        }
        await page.waitForFunction(() => !document.querySelector('main [aria-busy="true"], main .ui-tabs-loading'), null, {timeout: 15000}).catch(() => {});
        await page.waitForFunction(() => { const ta = document.querySelector('main textarea[name="comments"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        return sel;
    }
    const recList = (sel) => sel.evaluate((s) => ({label: (document.querySelector(`label[for="${s.id}"]`) || {}).innerText?.trim(), options: [...s.options].map((o) => ({value: o.value, text: o.text.trim(), selected: o.selected}))}));
    async function typeComment(text) {
        await page.evaluate((text) => { const ta = document.querySelector('main textarea[name="comments"]'); const ed = (window.tinyMCE || window.tinymce).get(ta.id); ed.focus(); ed.selection.select(ed.getBody(), true); ed.selection.collapse(false); return true; });
        await page.keyboard.type(text);
    }
    /** Press the step's submit button, answer its question, wait for step 4; the emails it sent. */
    async function submitReview(label, t0) {
        await page.locator('main button.submitFormButton:visible').first().click();
        await waitModal();
        const asked = await modalText();
        const before = await snap(`${label}-confirm`);
        await dlg().getByRole('button', {name: 'OK', exact: true}).last().click();
        await page.waitForFunction(() => (document.querySelector('[role=tab][aria-selected=true]')?.textContent || '').trim().startsWith('4'), null, {timeout: T}).catch(() => {});
        await idle(page);
        const after = await snap(`${label}-submitted`);
        return {asked, confirmSnap: before.name, afterSnap: after.name, step: flat(await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => ''), 60), mails: await mails(['mg', 'ed', 'je', 'au'], t0)};
    }
    async function mails(keys, t0) {
        const out = {};
        await app.mail.find({to: mailOf('ed'), since: t0, timeoutMs: 20000}).catch(() => {});
        await sleep(1500);
        for (const k of keys.filter((k) => S.u[k])) {
            const res = await app.mail._search({to: mailOf(k), since: t0}).catch(() => ({messages: []}));
            out[k] = [];
            for (const m of res.messages || []) {
                const full = await app.mail.fullMessage(m.ID).catch(() => ({}));
                out[k].push({subject: m.Subject, from: flat(JSON.stringify(m.From), 120), text: flat(full.Text, 1500), html: String(full.HTML || '').slice(0, 6000)});
            }
        }
        return out;
    }

    // ---------------------------------------------------------------- the workflow
    async function openWf() {
        await go(cu(S.path, `/dashboard/editorial?workflowSubmissionId=${S.sub}`));
        await page.waitForFunction((names) => { const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).pop(); return d && names.every((n) => d.innerText.includes(n)); }, Object.values(S.names), {timeout: T}).catch(() => {});
        await idle(page); await sleep(800);
    }
    /** The Reviewers table's rows, found by the reviewers' names (the table's own name follows the language). */
    const reviewerRows = () => page.evaluate((names) => {
        const tables = [...document.querySelectorAll('[role="dialog"] table')].filter((t) => t.offsetParent !== null && names.some((n) => t.innerText.includes(n)));
        const t = tables[0];
        if (!t) return null;
        return {caption: (t.getAttribute('aria-label') || t.querySelector('caption')?.innerText || document.getElementById(t.getAttribute('aria-labelledby') || '')?.innerText || '').trim(),
            columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
            rows: [...t.querySelectorAll('tbody tr')].map((tr) => ({cells: [...tr.querySelectorAll('td, th')].map((c) => c.innerText.trim()), buttons: [...tr.querySelectorAll('button, a')].map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean)}))};
    }, Object.values(S.names));
    const rowOf = (name) => page.locator('[role="dialog"] table tbody tr').filter({hasText: name}).first();
    async function openReview(name) {
        await rowOf(name).locator('button').filter({hasText: /Read Review|Consulter/}).first().click();
        await page.waitForFunction((name) => { const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).pop(); return d && d.innerText.includes(name) && !/Loading|Chargement/.test(d.innerText) && d.querySelector('fieldset, [role=group]'); }, name, {timeout: T}).catch(() => {});
        await idle(page); await sleep(1200);
    }
    async function closeReview() {
        const closeBtn = dlg().locator('button').filter({hasText: /^\s*(Close|Fermer)\s*$/}).first();
        await closeBtn.click({timeout: 5000}).catch(async () => { await dlg().locator('button[aria-label="Close"], button[aria-label="Fermer"]').first().click({timeout: 5000}).catch(() => {}); });
        await sleep(900); await idle(page);
    }
    /**
     * The window's "Download Review Form" menu (its label follows the language), the last entry matching
     * `kind` (/XML/ or /PDF/: "Editor Form Shows All Review Sections (…)"): the file, or what the page
     * shows when none arrives (the menu's link leaves the page for the refusal).
     */
    async function downloadReview(kind, label) {
        const out = {};
        const t0 = Date.now();
        const menuBtn = dlg().locator('button').filter({hasText: /^\s*(Download|Télécharger)/}).first();
        out.button = flat(await menuBtn.innerText({timeout: 5000}).catch(() => ''), 80);
        await menuBtn.click({timeout: 5000}).catch((e) => { out.menuClick = flat(e.message, 160); });
        await sleep(800);
        out.items = (await page.locator('[role="menuitem"]:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
        const item = page.locator('[role="menuitem"]:visible').filter({hasText: kind}).last();
        out.pressed = flat(await item.innerText({timeout: 5000}).catch(() => ''), 80);
        const arrived = page.waitForEvent('download', {timeout: 15000}).then((d) => d).catch((e) => ({err: flat(e.message, 100)}));
        await item.click({timeout: 5000}).catch((e) => { out.itemClick = flat(e.message, 160); });
        const d = await arrived;
        out.requests = since(net, t0).filter((r) => /export/.test(r.u));
        if (d && !d.err) {
            const file = await d.path();
            out.file = d.suggestedFilename();
            out.bytes = fs.statSync(file).size;
            if (/\.xml$/i.test(out.file)) {
                const xml = fs.readFileSync(file, 'utf8');
                fs.writeFileSync(outFile(`${label}.xml`), xml);
                out.recommendation = flat((xml.match(/peer-review-recommendation[\s\S]{0,160}/) || [''])[0], 200);
            } else fs.copyFileSync(file, outFile(`${label}${(out.file.match(/\.\w+$/) || [''])[0]}`));
            await idle(page); await sleep(500);
            return out;
        }
        await sleep(1500);
        const s = await snap(`${label}-no-file`);
        out.noFile = {snap: s.name, url: strip(page.url()), page: flat(await page.locator('body').innerText().catch(() => ''), 300), serverLog: null};
        return out;
    }
    async function readReview(name, label, {download = false} = {}) {
        await openReview(name);
        const s = await snap(label);
        const text = s.text?.dialog || '';
        const out = {snap: s.name,
            recommendationLines: text.split('\n').map((l, i, a) => (/^(Recommendation|Recommandation)\b/.test(l.trim()) ? flat(`${l} ⏎ ${a[i + 1] || ''} ⏎ ${a[i + 2] || ''}`, 200) : null)).filter(Boolean)};
        out.dom = await dlg().evaluate((d) => ({
            topLines: [...d.querySelectorAll('h2')].filter((h) => /:\s*$/.test(h.innerText)).map((h) => `${h.innerText.trim()} ${h.nextElementSibling?.innerText?.trim() ?? ''}`),
            groups: [...d.querySelectorAll('fieldset, [role=group]')].map((g) => g.innerText.trim().replace(/\n+/g, ' / ').slice(0, 200)),
        })).catch(() => null);
        if (download) {
            const back = async () => { await openWf(); await openReview(name); };
            out.xml = await downloadReview(/XML/, `${label}-xml`);
            if (out.xml.noFile) {
                // the other format, then the first again
                await back();
                out.pdf = await downloadReview(/PDF/, `${label}-pdf`);
                if (out.pdf.noFile) await back();
                out.xmlAgain = await downloadReview(/XML/, `${label}-xml-again`);
                if (out.xmlAgain.noFile) await back();
            }
        }
        await closeReview();
        return out;
    }

    // ---------------------------------------------------------------- the decision page
    const stepRoot = () => page.locator('.pkpStep:not([hidden])').first();
    async function letter() {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: T}).catch(() => {});
        const body = stepRoot().frameLocator('iframe').first().locator('body');
        let last = null, text = '';
        for (let i = 0; i < 20; i++) { text = await body.innerText().catch(() => ''); if (text && text === last) break; last = text; await sleep(700); }
        const html = await body.innerHTML().catch(() => '');
        const subject = await stepRoot().locator('input[name="subject"]').first().inputValue().catch(() => null);
        const block = text.split('\n').map((l) => l.trim()).filter((l) => /Reviewer [A-Z]\b|Évaluat|Recomm|Firstrev|Secondrev|Thirdrev|I07b comment/.test(l));
        return {subject, firstLine: flat(text.split('\n').find((l) => l.trim()) || '', 160), reviewerBlock: block.map((l) => flat(l, 200)), switchLine: flat(await stepRoot().locator('.composer__locales').innerText().catch(() => ''), 120), text: flat(text, 3000), htmlBlock: (html.match(/<p><strong>[\s\S]*$/) || [''])[0].slice(0, 2500)};
    }
    async function switchLetter() {
        const link = stepRoot().locator('.composer__locales button').first();
        const name = flat(await link.innerText({timeout: 10000}), 40);
        await link.click({timeout: 10000});
        await waitModal();
        const asked = await modalText();
        await dlg().locator('button').filter({hasText: new RegExp(esc(name))}).first().click();
        await sleep(1500);
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: T}).catch(() => {});
        await idle(page);
        return {to: name, asked};
    }

    try {
        stored('start');

        // ============================================================ recs
        await sect('recs', async () => {
            fact('recs.lang', await as(S.u.mg, S.path));
            await openRecTab();
            const s0 = await snap('recs-table');
            fact('recs.table', {snap: s0.name, ...(await recTable())});
            await loc(page, 'Reviewer Recommendations table', recRoot().locator('table'));
            await recRoot().getByRole('button', {name: 'Add Recommendation', exact: true}).click();
            await waitModal();
            const d = dlg();
            await d.locator('input[name="title-en"]').first().waitFor({timeout: T});
            await d.locator('input[name="title-en"]').first().fill(CUSTOM_EN);
            const switches = (await d.locator('.pkpFormLocales button').allInnerTexts().catch(() => [])).map((x) => x.trim());
            await d.locator('.pkpFormLocales button').filter({hasText: 'French'}).first().click();
            await d.locator('input[name="title-fr_CA"]').first().waitFor({state: 'visible', timeout: T});
            await d.locator('input[name="title-fr_CA"]').first().fill(CUSTOM_FR);
            await d.locator('select[name="type"]').first().selectOption({label: 'Revisions Requested'});
            const statusOptions = await d.locator('select[name="status"]').first().evaluate((s) => [...s.options].map((o) => ({text: o.text.trim(), selected: o.selected}))).catch(() => null);
            const w = await snap('recs-add-window');
            await loc(page, 'Add Recommendation: the French name box', d.locator('input[name="title-fr_CA"]'));
            const saved = page.waitForResponse((r) => /reviewers\/recommendations/.test(r.url()) && r.request().method() === 'POST', {timeout: 15000}).then((r) => r.status()).catch(() => null);
            await d.getByRole('button', {name: 'Save', exact: true}).last().click();
            const status = await saved;
            await page.waitForFunction((t) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === t), CUSTOM_EN, {timeout: 15000}).catch(() => {});
            await idle(page);
            const s1 = await snap('recs-added');
            fact('recs.add', {window: w.name, switches, statusOptions, post: status, after: s1.name, ...(await recTable())});
            // the table in French
            await switchLanguage(page, 'fr_CA');
            await openRecTab();
            const s2 = await snap('recs-table-fr');
            fact('recs.tableFr', {snap: s2.name, lang: await lang(), ...(await recTable())});
            stored('afterAdd');
        });

        // ============================================================ rev1 (English; "Revisions Required")
        await sect('rev1', async () => {
            const l = await as(S.u.r1, S.path);
            const sel = await step3();
            const s = await snap('rev1-step3');
            const list = await recList(sel);
            await loc(page, 'Reviewer wizard step 3: "Recommendation" list', sel);
            await sel.selectOption({label: 'Revisions Required'});
            await typeComment('I07b comment of the first reviewer.');
            const t0 = new Date();
            const r = await submitReview('rev1', t0);
            fact('rev1', {lang: l, snap: s.name, list, chose: 'Revisions Required', ...r});
            stored('afterRev1');
        });

        // ============================================================ rev2save (French; the custom entry, saved for later)
        await sect('rev2save', async () => {
            const l = await as(S.u.r2, S.path, {fr: true});
            const sel = await step3();
            const s = await snap('rev2-step3-fr');
            const list = await recList(sel);
            const pick = list.options.find((o) => o.text === CUSTOM_FR) || list.options.find((o) => o.text === CUSTOM_EN);
            await sel.selectOption(pick.value);
            await typeComment('I07b comment of the second reviewer.');
            const buttons = (await page.locator('main button:visible').allInnerTexts()).map((x) => flat(x, 60)).filter(Boolean);
            const t0 = new Date();
            await page.locator('main button.saveFormButton:visible').first().click();
            await idle(page); await sleep(1500);
            const s2 = await snap('rev2-saved-for-later-fr');
            fact('rev2save', {lang: l, snap: s.name, list, chose: pick, buttons, after: s2.name, afterUrl: strip(page.url()), afterNotices: s2.notices, mails: await mails(['mg', 'ed', 'je'], t0).catch(() => null)});
            stored('afterRev2Save');
        });

        // ============================================================ deact
        await sect('deact', async () => {
            await as(S.u.mg, S.path);
            await openRecTab();
            const before = await recTable();
            const a = await untick('Revisions Required');
            const b = await untick(CUSTOM_EN);
            const s = await snap('recs-deactivated');
            fact('deact', {before: before.rows, revisionsRequired: a, custom: b, snap: s.name, after: (await recTable()).rows});
            await go(cu(S.path, '/dashboard')); await openRecTab();
            const s2 = await snap('recs-deactivated-reloaded');
            fact('deact.reloaded', {snap: s2.name, rows: (await recTable()).rows});
            stored('afterDeact');
        });

        // ============================================================ rev2 (French; the saved, now inactive choice)
        await sect('rev2', async () => {
            const l = await as(S.u.r2, S.path, {fr: true});
            const sel = await step3();
            const s = await snap('rev2-step3-after-deact-fr');
            const list = await recList(sel);
            const t0 = new Date();
            const r = await submitReview('rev2', t0);
            fact('rev2', {lang: l, snap: s.name, list, ...r});
            stored('afterRev2');
        });

        // ============================================================ rev3 (English; an active choice)
        await sect('rev3', async () => {
            const l = await as(S.u.r3, S.path);
            const sel = await step3();
            const s = await snap('rev3-step3');
            const list = await recList(sel);
            await sel.selectOption({label: 'Accept Submission'});
            await typeComment('I07b comment of the third reviewer.');
            const t0 = new Date();
            const r = await submitReview('rev3', t0);
            fact('rev3', {lang: l, snap: s.name, list, chose: 'Accept Submission', ...r});
            stored('afterRev3');
        });

        // ============================================================ editor (the Reviewers table, "Read Review", the XML)
        await sect('editor', async () => {
            for (const [key, fr] of [['en', false], ['fr', true]]) {
                const l = await as(S.u.mg, S.path, {fr});
                await openWf();
                const s = await snap(`editor-reviewers-${key}`);
                const out = {lang: l, snap: s.name, table: await reviewerRows(), windows: {}};
                if (key === 'en') await loc(page, 'Workflow: the Reviewers table', page.getByRole('table', {name: 'Reviewers', exact: true}));
                for (const [rk, name] of Object.entries(S.names)) {
                    out.windows[rk] = await readReview(name, `editor-read-${rk}-${key}`, {download: true}).catch((e) => ({error: flat(e.message, 300)}));
                    // the window marks the review as read and the table redraws
                    await page.waitForFunction((names) => { const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.offsetParent !== null).pop(); return d && names.every((n) => d.innerText.includes(n)); }, Object.values(S.names), {timeout: T}).catch(() => {});
                }
                out.tableAfter = await reviewerRows();
                fact(`editor.${key}`, out);
            }
        });

        // ============================================================ report (Statistics › Reports › "Review Report")
        await sect('report', async () => {
            for (const [key, fr] of [['en', false], ['fr', true]]) {
                const l = await as(S.u.mg, S.path, {fr});
                await go(cu(S.path, '/stats/reports'));
                const s = await snap(`reports-${key}`);
                const link = page.locator('main a[href*="pluginName=ReviewReportPlugin"]').first();
                if (key === 'en') await loc(page, 'Reports: the "Review Report" link', link);
                const linkText = flat(await link.innerText().catch(() => ''), 80);
                const arrived = page.waitForEvent('download', {timeout: 40000}).then((d) => d).catch((e) => ({err: flat(e.message, 160)}));
                await link.click();
                const d = await arrived;
                const out = {lang: l, snap: s.name, linkText};
                if (d && !d.err) {
                    const csv = fs.readFileSync(await d.path(), 'utf8').replace(/^﻿/, '');
                    fs.writeFileSync(outFile(`review-report-${key}.csv`), csv);
                    const lines = csv.split(/\r?\n/).filter(Boolean);
                    const cells = (line) => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; };
                    const head = cells(lines[0]);
                    out.file = d.suggestedFilename();
                    out.columns = head;
                    out.rows = lines.slice(1).map(cells).map((r) => ({reviewer: r[4], family: r[6], recommendation: r[head.length - 2], cellsCount: r.length}));
                } else out.download = d;
                fact(`report.${key}`, out);
            }
        });

        // ============================================================ decision ("Request Revisions" › "Notify Authors")
        await sect('decision', async () => {
            const round = db(`SELECT review_round_id FROM review_rounds WHERE submission_id = ${S.sub} ORDER BY 1`)[0];
            const out = {round};
            // English interface: through the button
            out.enLang = await as(S.u.mg, S.path);
            await openWf();
            await page.locator('[role="dialog"]:visible').getByRole('button', {name: 'Request Revisions', exact: true}).first().click();
            // the button first opens a "Request Revisions" window ("Require New Review Round", two choices, "Next");
            // the 2026-10-07 run stopped here for want of this press, so everything below it has never run
            await waitModal();
            const ask = await snap('decision-request-revisions-window');
            out.window = {snap: ask.name, text: await modalText()};
            await dlg().getByRole('button', {name: 'Next', exact: true}).click({timeout: 10000});
            await page.waitForURL(/decision\/record/, {timeout: T}).catch(() => {});
            await idle(page);
            await stepRoot().locator('iframe').first().waitFor({timeout: T}).catch(() => {});
            out.address = strip(page.url());
            let s = await snap('decision-en-letter-en');
            out.enUiEnLetter = {snap: s.name, heading: flat(await page.locator('.app__pageHeading').innerText().catch(() => ''), 160), steps: (await page.locator('ol.pkpSteps__buttons li').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)), ...(await letter())};
            await loc(page, 'Decision page: the letter\'s "Switch to:" line', stepRoot().locator('.composer__locales'));
            out.enUiSwitch = await switchLetter();
            s = await snap('decision-en-letter-fr');
            out.enUiFrLetter = {snap: s.name, ...(await letter())};
            // French interface: the same page by its address
            await go(cu(S.path, '/dashboard'));
            out.frLang = await as(S.u.mg, S.path, {fr: true});
            await go(cu(S.path, `/decision/record/${S.sub}?decision=4&reviewRoundId=${round}`));
            await stepRoot().locator('iframe').first().waitFor({timeout: T}).catch(() => {});
            s = await snap('decision-fr-letter-first');
            out.frUiFirstLetter = {snap: s.name, lang: await lang(), ...(await letter())};
            out.frUiSwitch = await switchLetter();
            s = await snap('decision-fr-letter-second');
            out.frUiSecondLetter = {snap: s.name, ...(await letter())};
            fact('decision.letters', out);
            // English interface, the letter switched to French, recorded: the author's email
            await go(cu(S.path, '/dashboard'));
            await as(S.u.mg, S.path);
            await go(cu(S.path, `/decision/record/${S.sub}?decision=4&reviewRoundId=${round}`));
            await stepRoot().locator('iframe').first().waitFor({timeout: T}).catch(() => {});
            await letter();
            await switchLetter();
            const sent = {letter: await letter()};
            const t0 = new Date();
            const footer = page.locator('.decision__footer');
            for (let i = 0; i < 4; i++) {
                const rec = footer.getByRole('button', {name: 'Record Decision', exact: true});
                if (await rec.isVisible().catch(() => false)) { sent.stepsBeforeRecord = i; s = await snap('decision-last-step'); sent.lastStep = s.name; await rec.click(); break; }
                await footer.getByRole('button', {name: 'Continue', exact: true}).click();
                await sleep(1200);
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: T}).catch(() => {});
                await idle(page);
            }
            await waitModal(); await sleep(1500);
            s = await snap('decision-recorded');
            sent.after = {snap: s.name, dialog: await modalText()};
            await app.mail.find({to: mailOf('au'), since: t0, timeoutMs: 20000}).catch(() => {});
            sent.mails = await mails(['au', 'r1', 'r2', 'r3'], t0);
            fact('decision.sent', sent);
        });

        stored('end');
        if (ALL.every(on)) note(`ccI07b [ojs]: scratch journal ${S.path} (English and French form languages; manager ${S.u.mg}, reviewers ${S.u.r1} "Revisions Required" then deactivated / ${S.u.r2} "${CUSTOM_FR}" saved for later, deactivated, then submitted / ${S.u.r3} "Accept Submission") on submission ${S.sub}: kept script shared/playwright/checks/U29/I07b/i07b.js.`);
    } finally {
        fact('zz.totals', {server5xx: net.filter((r) => r.s >= 500).map(({at, ...x}) => x), pageErrors: pageErrors.map(({at, ...x}) => x), consoleErrors: consoleErrs.length, jsDialogs: jsDialogs.map(({at, ...x}) => x)});
        await signOut(page).catch(() => {});
        await close();
    }
});
