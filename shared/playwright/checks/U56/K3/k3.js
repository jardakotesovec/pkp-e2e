// U56 claim check, chunk K3 — an email's window and "Edit Template": the windows'
// fields (spec lines 87–108), Rules 9–15 (231–294), register A4 (552–558) and
// OPS1 (591–599). docs/specs/U56-emails-management.md
//
// Seeds its own scratch contexts per app (nothing is changed on publicknowledge):
//   A — manager mg, author au, editor ed {OJS OMP}: the email's window, editing,
//       adding, refused saves, placeholders, closing without saving, other levels.
//   B — manager: an untouched context; every row's "Edit" is opened (Rule 9),
//       Insert Content read per email (Rule 14), and read again after A's edit
//       (Rule 11 "another journal keeps its own text").
//   D — manager mg, author au: the sending window (decision "Decline
//       Submission") after the default is edited and a template added
//       (Rules 11, 12, 14), and the mail it sends.
//   L — English and French form languages (line 107, Rule 13's primary language).
//
//   PROBE_FEATURE=U56 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U56/K3/k3.js
//   PHASES=walk,window,edit,add,refuse,insert,close,levels,send,lang,ops1,ctxvars (default all)
//   REUSE=1 reuses the contexts of the last run (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); facts-<app>.json
// collects the structured reads; the console carries [app phase] lines.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, tag, outDir} = require('../../../probe');

const ALL = 'walk,window,edit,add,refuse,insert,close,levels,send,lang,ops1,ctxvars';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const BODY = 'editEmailTemplate-body-control-en';
const SIG_ID = 'emailSetup-emailSignature-control';
const esc = (s) => s.replace(/[()]/g, '\\$&');

forEachApp(async (app) => {
    const on = (p) => PHASES.includes(p);
    const ops = app.name === 'ops';
    const seedFile = path.join(outDir(), `seed-${app.name}.json`);
    let S = REUSE && fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : null;
    const person = (t, k, g, f, roles) => ({username: `${t}${k}`, givenName: g, familyName: f, email: `${t}${k}@mail.test`, roles});
    if (!S) {
        const A = tag('u56k3a');
        const usersA = [person(A, 'mg', 'Mona', 'Manager', ['manager']), person(A, 'au', 'Ada', 'Author', ['author'])];
        if (!ops) usersA.push(person(A, 'ed', 'Eda', 'Editor', ['editor']));
        await app.api.createContext({tag: A, users: usersA});
        const B = tag('u56k3b');
        await app.api.createContext({tag: B, users: [person(B, 'mg', 'Bo', 'Manager', ['manager'])]});
        const D = tag('u56k3d');
        await app.api.createContext({tag: D, context: {contactName: 'Dora Contact', contactEmail: `${D}ct@mail.test`},
            users: [person(D, 'mg', 'Dan', 'Manager', ['manager']), person(D, 'au', 'Ada', 'Author', ['author'])]});
        const L = tag('u56k3l');
        await app.api.createContext({tag: L, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [person(L, 'mg', 'Lena', 'Manager', ['manager'])]});
        S = {A, B, D, L};
        fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));
    }
    const {A, B, D, L} = S;
    const saveSeed = () => fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));
    const log = (k, v) => console.log(`[${app.name} ${k}]`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 2500));
    const F = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(k, v); };
    // the emails driven: W the several-template email of fn-k (OPS has no "Review Request"),
    // SGL a one-template email, DEC the email "Decline Submission" sends from the submission stage
    const W = ops ? 'Submission Accepted' : 'Review Request';
    const SGL = ops ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation';
    const DEC = ops ? 'Submission Declined' : 'Submission Declined (Pre-Review)';
    const CTXONLY = 'Password Reset Confirm';

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url(), at: new Date().toISOString()}); log('browser-dialog', `${d.type()} ${d.message()}`); await d.accept().catch(() => {}); });
    const ctx = (t, p) => app.url(`/index.php/${t}${p}`);
    const snap = async (label, extra) => { const s = await screen(page); record(label, extra ? {...s, extra} : s); await shot(page, label).catch(() => {}); return s; };

    // ------------------------------------------------------ Manage Emails page
    async function openManage(t) {
        await page.goto(ctx(t, '/management/settings/manageEmails'));
        await idle(page);
        await page.locator('main').getByRole('button', {name: /^Edit /}).first().waitFor({timeout: 30000});
    }
    const rowNames = () => page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter((s) => /^Edit /.test(s)).map((s) => s.replace(/^Edit (Edit )?/, '')));
    const emailDlg = (name) => page.getByRole('dialog', {name, exact: true}).last();
    const tplDlg = () => page.getByRole('dialog', {name: 'Edit Template'}).last();
    async function closeDlg(d) {
        await d.getByRole('button', {name: 'Close', exact: true}).first().click();
        await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(700); // the modal store's 450 ms slot
    }
    const waitBody = (id = BODY) => page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 15000}).catch(() => {});
    // Press an email's "Edit"; return the kind of window, the data the screen fetched, and whether the spinner showed.
    async function openEmail(name) {
        const btn = page.locator('main').getByRole('button', {name: `Edit ${name}`, exact: true});
        if (!(await btn.count())) return {absent: true};
        const respP = page.waitForResponse((r) => /api\/v1\/(mailables|emailTemplates)\//.test(r.url()) && r.request().method() === 'GET', {timeout: 20000}).catch(() => null);
        const spinP = page.locator('.pkpSpinnerFullScreen').waitFor({state: 'visible', timeout: 3000}).then(() => true).catch(() => false);
        await btn.click();
        const [r, spinner] = await Promise.all([respP, spinP]);
        const data = r && r.ok() ? await r.json().catch(() => null) : null;
        const kind = r && /mailables/.test(r.url()) ? 'multi' : 'single';
        if (r && !r.ok()) return {kind, status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), spinner, failed: true};
        const dlg = kind === 'multi' ? emailDlg(name) : tplDlg();
        await dlg.waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        if (kind === 'single') await waitBody();
        return {kind, data, status: r && r.status(), url: r && r.url().replace(/^.*api\/v1\//, ''), spinner, dlg};
    }
    async function windowRead(dlg) {
        return dlg.evaluate((d) => {
            const items = [...d.querySelectorAll('li')].filter((li) => li.querySelector('button')).map((li) => ({text: li.innerText.replace(/\s+/g, ' ').trim(), buttons: [...li.querySelectorAll('button')].map((b) => b.innerText.trim()), badges: [...li.querySelectorAll('[class*=badge], [class*=Badge]')].map((b) => b.innerText.trim())}));
            const ps = [...d.querySelectorAll('p')].map((p) => p.innerText.trim()).filter(Boolean);
            const heads = [...d.querySelectorAll('h1, h2, h3')].map((h) => h.innerText.trim());
            const buttons = [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => b.innerText.trim() || b.getAttribute('aria-label'));
            return {items, ps, heads, buttons, text: d.innerText};
        });
    }
    async function openDefaultRow(dlg, idx = 0) {
        await dlg.getByRole('button', {name: 'Edit', exact: true}).nth(idx).click();
        await tplDlg().waitFor({timeout: 15000});
        await idle(page);
        await waitBody();
    }
    async function readTemplateWindow() {
        const d = tplDlg();
        return d.evaluate((el) => {
            const vis = (e) => !!e.getClientRects().length;
            return {
                inputs: [...el.querySelectorAll('input, textarea')].filter((e) => e.type !== 'submit' && e.type !== 'hidden').map((e) => ({name: e.name, id: e.id, value: (e.value || '').slice(0, 300), visible: vis(e), maxlength: e.getAttribute('maxlength'), required: e.required || e.getAttribute('aria-required')})),
                bodies: (window.tinymce ? window.tinymce.get() : []).filter((e) => /editEmailTemplate-body/.test(e.id)).map((e) => ({id: e.id, content: e.getContent().slice(0, 4000)})),
                buttons: [...el.querySelectorAll('button')].filter(vis).map((b) => b.innerText.trim() || b.getAttribute('aria-label')).filter(Boolean),
                labels: [...el.querySelectorAll('label, legend, .pkpFormFieldLabel')].filter(vis).map((e) => e.innerText.trim()),
                descriptions: [...el.querySelectorAll('[class*=description]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean),
                errors: [...el.querySelectorAll('.pkpFieldError, .pkpFormField__error, [class*=FormErrors], [class*=formErrors], [class*=errors]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean),
                links: [...el.querySelectorAll('a, [role=link]')].filter(vis).map((a) => ({text: a.innerText.trim(), tag: a.tagName, href: a.getAttribute('href')})),
                text: el.innerText,
            };
        });
    }
    async function typeRich(id, text, {keep = false} = {}) {
        const body = page.frameLocator(`#${id}_ifr`).locator('body');
        await body.click();
        if (!keep) { await page.keyboard.press(SELECT_ALL); await page.keyboard.press('Delete'); }
        if (text) await body.pressSequentially(text, {delay: 5});
        await sleep(300);
    }
    const editorContent = (id = BODY) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id);
    // Press "Save" in "Edit Template"; time "Saved" and the window closing.
    async function saveTemplate(label, {behind} = {}) {
        const d = tplDlg();
        const respP = page.waitForResponse((r) => /api\/v1\/emailTemplates/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000})
            .then(async (r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), override: r.request().headers()['x-http-method-override'] || null, body: (await r.text().catch(() => '')).slice(0, 800)})).catch(() => null);
        const t0 = Date.now();
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await respP;
        const tResp = Date.now() - t0;
        const saved = await d.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 5000}).then(() => Date.now() - t0).catch(() => null);
        // the email's window behind, read by DOM text while the template window is still open
        const behindAtOnce = behind ? await page.locator('[role=dialog]').filter({has: page.getByText('Templates', {exact: true})}).last().evaluate((el) => el.innerText).catch(() => null) : null;
        const closed = await d.waitFor({state: 'hidden', timeout: 8000}).then(() => Date.now() - t0).catch(() => null);
        await sleep(700);
        await idle(page);
        const s = await snap(label, {resp, tResp, saved, closed});
        return {resp, tResp, savedAtMs: saved, closedAtMs: closed, behindAtOnce: behindAtOnce && flat(behindAtOnce, 900), dialog: flat(s.text.dialog, 900)};
    }
    // Press "Save" expecting a refusal: record the window.
    async function refusedSave(label) {
        const d = tplDlg();
        const respP = page.waitForResponse((r) => /api\/v1\/emailTemplates/.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000})
            .then(async (r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), body: (await r.text().catch(() => '')).slice(0, 800)})).catch(() => null);
        if (await d.getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => false)) return {notPressed: 'Save disabled', errors: (await readTemplateWindow()).errors};
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await respP;
        await sleep(1200);
        await idle(page);
        const w = await readTemplateWindow();
        const stillOpen = await d.isVisible().catch(() => false);
        const saveDisabled = await d.getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => null);
        await snap(label, {resp, stillOpen, saveDisabled, errors: w.errors});
        return {resp, stillOpen, saveDisabled, errors: w.errors, links: w.links, text: flat(w.text, 1200)};
    }
    async function insertContentRows(openerScope) {
        await openerScope.getByRole('button', {name: 'Insert Content'}).first().click();
        const ic = page.getByRole('dialog', {name: 'Insert Content'}).last();
        await ic.waitFor({timeout: 15000});
        await idle(page);
        const rows = await ic.locator('li').evaluateAll((lis) => lis.map((li) => ({value: (li.querySelector('.insertContent__item__value') || {}).innerText?.trim(), description: (li.querySelector('.insertContent__item__description') || {}).innerText?.trim(), button: (li.querySelector('button') || {}).innerText?.trim()})));
        return {ic, rows};
    }

    async function phase(name, fn) {
        if (!on(name)) return;
        try { await fn(); } catch (e) {
            log('ERROR ' + name, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
            await snap('zz-error-' + name).catch(() => {});
            await signOut(page).catch(() => {});
        }
    }
    try {
        // ======================================================= walk: every row of an untouched context (Rule 9), Insert Content per email (Rule 14)
        await phase('walk', async () => {
            await signIn(page, `${B}mg`, {contextPath: B});
            await openManage(B);
            const names = await rowNames();
            await snap('w-01-list', {names});
            const out = [];
            const last = 'User Role Masthead Visibility Update Notification';
            const order = names.filter((n) => n !== last).concat(names.includes(last) ? [last] : []);
            for (const n of order) {
                await openManage(B);
                const o = await openEmail(n);
                if (o.absent) { out.push({name: n, absent: true}); continue; }
                if (o.failed) {
                    await sleep(1500);
                    const s = await snap(`w-02-failed-${n.replace(/\W+/g, '')}`);
                    out.push({name: n, kind: o.kind, failed: o.status, url: o.url, spinner: o.spinner, spinnerStill: await page.locator('.pkpSpinnerFullScreen').isVisible().catch(() => false), dialogs: s.aria.dialogs.length});
                    continue;
                }
                const title = await o.dlg.evaluate((el) => (el.querySelector('h1, h2') || {}).innerText?.trim()).catch(() => null);
                const w = await windowRead(o.dlg);
                const rec = {name: n, kind: o.kind, url: o.url, spinner: o.spinner, title, addTemplate: w.buttons.includes('Add Template'), buttons: w.buttons.filter((b) => !/Tasks|\n/.test(b || ''))};
                if (o.kind === 'multi') {
                    rec.items = w.items; rec.ps = w.ps; rec.dataKeys = (o.data.emailTemplates || []).map((t) => t.key); rec.supportsTemplates = o.data.supportsTemplates;
                    if (n === W || n === DEC) await snap(`w-03-window-${n.replace(/\W+/g, '')}`);
                    await closeDlg(o.dlg);
                } else {
                    if (n === SGL) await snap(`w-03-single-${n.replace(/\W+/g, '')}`);
                    await closeDlg(tplDlg());
                }
                out.push(rec);
            }
            F('walk', out);
            F('walk-summary', {multi: out.filter((r) => r.kind === 'multi').map((r) => r.name), single: out.filter((r) => r.kind === 'single' && !r.failed).map((r) => r.name), failed: out.filter((r) => r.failed), noSpinner: out.filter((r) => r.spinner === false).map((r) => r.name), singleWithAdd: out.filter((r) => r.kind === 'single' && r.addTemplate).map((r) => r.name), multiWithoutAdd: out.filter((r) => r.kind === 'multi' && !r.addTemplate).map((r) => r.name)});

            // Insert Content per email: a context-only one, a submission one, a review one (Rule 14, OPS1)
            const ic = {};
            for (const n of [CTXONLY, SGL, W, DEC].concat(ops ? [] : ['Review Request'])) {
                if (ic[n]) continue;
                await openManage(B);
                const o = await openEmail(n);
                if (o.absent || o.failed) { ic[n] = {absent: !!o.absent, failed: o.status}; continue; }
                if (o.kind === 'multi') await openDefaultRow(o.dlg);
                const t = tplDlg();
                const {ic: win, rows} = await insertContentRows(t);
                await snap(`w-04-insert-content-${n.replace(/\W+/g, '')}`);
                if (n === W) await loc(page, 'Insert Content window (template body)', win);
                // search: the box commits on Enter
                const sb = win.getByRole('searchbox').or(win.locator('input[type=search]')).first();
                let search = null;
                if (await sb.count()) {
                    await sb.fill('submission'); await sb.press('Enter'); await sleep(600);
                    search = {phrase: 'submission', values: await win.locator('.insertContent__item__value').allInnerTexts()};
                    await sb.fill(''); await sb.press('Enter'); await sleep(400);
                }
                ic[n] = {rows, search};
                await closeDlg(win);
                await closeDlg(t);
                if (o.kind === 'multi') await closeDlg(emailDlg(n));
            }
            F('walk-insert-content', ic);
            await signOut(page);
        });

        // ======================================================= window: the email's window, untouched (fields 87–95, Rule 10)
        await phase('window', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            await openManage(A);
            const o = await openEmail(W);
            await snap('v-01-email-window');
            const w = await windowRead(o.dlg);
            const box = await o.dlg.evaluate((el) => {
                const panel = [...el.querySelectorAll('*')].find((x) => { const r = x.getBoundingClientRect(); return r.width > 200 && r.width < window.innerWidth - 50 && r.height > 300; });
                const r = panel ? panel.getBoundingClientRect() : el.getBoundingClientRect();
                return {left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth};
            });
            await loc(page, `the email's window (${W})`, o.dlg);
            await loc(page, 'the "Add Template" button', o.dlg.getByRole('button', {name: 'Add Template', exact: true}));
            await loc(page, 'a template row\'s "Edit"', o.dlg.getByRole('button', {name: 'Edit', exact: true}));
            await loc(page, 'the "Templates" heading', o.dlg.getByRole('heading', {name: 'Templates', exact: true}));
            F('v-window', {kind: o.kind, spinner: o.spinner, box, ps: w.ps, heads: w.heads, items: w.items, buttons: w.buttons, templates: (o.data.emailTemplates || []).map((t) => ({key: t.key, id: t.id, name: t.name && t.name.en})), description: o.data.description});
            // Escape on the email's window
            await o.dlg.locator('h2, h1').first().click().catch(() => {});
            await page.keyboard.press('Escape');
            await sleep(900);
            F('v-escape-email-window', {stillOpen: await o.dlg.isVisible().catch(() => false)});
            if (await o.dlg.isVisible().catch(() => false)) await closeDlg(o.dlg);
            await signOut(page);
        });

        // ======================================================= edit: Rule 11 and the Reset button of Rule 10
        await phase('edit', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            await openManage(A);
            let o = await openEmail(W);
            const api0 = (o.data.emailTemplates || [])[0] || {};
            await openDefaultRow(o.dlg);
            const before = await readTemplateWindow();
            await snap('e-01-edit-template-open');
            await loc(page, 'the "Edit Template" window', tplDlg());
            await loc(page, 'the Name box', tplDlg().locator('input[name="name-en"]'));
            await loc(page, 'the Subject box', tplDlg().locator('input[name="subject-en"]'));
            await loc(page, 'the Body editor (iframe)', tplDlg().locator(`#${BODY}_ifr`));
            await loc(page, 'the Save button', tplDlg().getByRole('button', {name: 'Save', exact: true}));
            const toolbar = await tplDlg().locator('.tox-toolbar__primary button, .tox-tbtn').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.innerText.trim()));
            const insertBtn = await tplDlg().getByRole('button', {name: 'Insert Content'}).count();
            const bodyMatchesApi = before.bodies[0] && api0.body && api0.body.en ? before.bodies[0].content.replace(/\s+/g, '').slice(0, 200) === api0.body.en.replace(/\s+/g, '').slice(0, 200) : null;
            const newName = `K3 renamed ${A}`.slice(0, 60);
            const newSubject = `K3 edited subject ${A}`;
            await tplDlg().locator('input[name="name-en"]').fill(newName);
            await tplDlg().locator('input[name="subject-en"]').fill(newSubject);
            const saved = await saveTemplate('e-02-default-saved', {behind: true});
            const rowsAfter = await windowRead(emailDlg(W));
            await snap('e-03-window-after-save');
            F('e-edit-default', {filled: {inputs: before.inputs, bodyStart: before.bodies[0] && before.bodies[0].content.slice(0, 200), bodyMatchesApi, apiName: api0.name, apiSubject: api0.subject}, labels: before.labels, descriptions: before.descriptions, buttons: before.buttons, toolbar, insertBtn, text: flat(before.text, 900), saved, rowsAfter: rowsAfter.items});
            // reopen the same row while the email's window is open: what the form shows now
            await openDefaultRow(emailDlg(W));
            const reopen = await readTemplateWindow();
            await closeDlg(tplDlg());
            await closeDlg(emailDlg(W));
            // after a reload
            await page.reload(); await idle(page);
            await openManage(A);
            o = await openEmail(W);
            const rowsReload = await windowRead(o.dlg);
            await openDefaultRow(o.dlg);
            const afterReload = await readTemplateWindow();
            await snap('e-04-after-reload');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            F('e-edit-reads', {sameRowReopen: reopen.inputs.slice(0, 2), afterReload: {rows: rowsReload.items, inputs: afterReload.inputs.slice(0, 2)}, listRowNames: (await rowNames()).filter((n) => /K3|Review Request|Submission Accepted/.test(n))});
            // the one-template email: edit, save, reopen, every button (fn-k)
            await openManage(A);
            let s = await openEmail(SGL);
            const sBefore = await readTemplateWindow();
            await tplDlg().locator('input[name="subject-en"]').fill(`K3 single edited ${A}`);
            const sSaved = await saveTemplate('e-05-single-saved');
            await openManage(A);
            s = await openEmail(SGL);
            const sAfter = await readTemplateWindow();
            await snap('e-06-single-reopened');
            await closeDlg(tplDlg());
            await page.reload(); await idle(page);
            await openManage(A);
            s = await openEmail(SGL);
            const sReload = await readTemplateWindow();
            await closeDlg(tplDlg());
            F('e-single', {kind: s.kind, before: {inputs: sBefore.inputs.slice(0, 2), buttons: sBefore.buttons}, saved: sSaved, reopened: {inputs: sAfter.inputs.slice(0, 2), buttons: sAfter.buttons}, afterReload: sReload.inputs.slice(0, 2)});
            await signOut(page);
            // another journal of the install (B) keeps its own text
            await signIn(page, `${B}mg`, {contextPath: B});
            await openManage(B);
            o = await openEmail(W);
            const bRows = await windowRead(o.dlg);
            const bTpl = (o.data.emailTemplates || [])[0] || {};
            await snap('e-07-other-journal');
            await closeDlg(o.dlg);
            await openManage(B);
            const bs = await openEmail(SGL);
            const bSgl = bs.data && bs.data.subject;
            await closeDlg(tplDlg());
            F('e-other-journal', {rows: bRows.items, name: bTpl.name, subject: bTpl.subject, single: bSgl});
            await signOut(page);
        });

        // ======================================================= add: Rule 12, A4
        await phase('add', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            await openManage(A);
            const o = await openEmail(W);
            const rows0 = await windowRead(o.dlg);
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}).catch(() => {});
            await idle(page); await waitBody();
            const titles = await page.locator('[role=dialog]:visible').evaluateAll((ds) => ds.map((d) => (d.querySelector('h1, h2') || {}).innerText?.trim()));
            const empty = await readTemplateWindow();
            await snap('a-01-add-template-open');
            const ic = await insertContentRows(tplDlg());
            await closeDlg(ic.ic);
            await tplDlg().locator('input[name="name-en"]').fill(`K3 added ${A}`);
            await tplDlg().locator('input[name="subject-en"]').fill(`K3 added subject ${A}`);
            await typeRich(BODY, 'K3 added body.');
            const saved = await saveTemplate('a-02-added', {behind: true});
            const rows1 = await windowRead(o.dlg);
            await snap('a-03-window-after-add');
            await closeDlg(o.dlg);
            await page.reload(); await idle(page);
            await openManage(A);
            const o2 = await openEmail(W);
            const rows2 = await windowRead(o2.dlg);
            await snap('a-04-window-after-reload');
            // the added row's Edit: filled with what was saved
            await openDefaultRow(o2.dlg, rows2.items.length - 1);
            const addedEdit = await readTemplateWindow();
            await closeDlg(tplDlg());
            await closeDlg(o2.dlg);
            F('a-add', {titles, empty: {inputs: empty.inputs, bodies: empty.bodies, buttons: empty.buttons}, insertRowsCount: ic.rows.length, rowsBefore: rows0.items, saved, rowsAfter: rows1.items, rowsAfterReload: rows2.items, addedEdit: {inputs: addedEdit.inputs.slice(0, 2), body: addedEdit.bodies[0] && addedEdit.bodies[0].content, title: flat(addedEdit.text, 200)}, templatesApi: (o2.data.emailTemplates || []).map((t) => ({key: t.key, id: t.id, name: t.name && t.name.en}))});
            await signOut(page);
        });

        // ======================================================= refuse: Rule 13, fields 103–105
        await phase('refuse', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            const out = {};
            // a new template: all three empty, then one at a time
            await openManage(A);
            let o = await openEmail(W);
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.newAllEmpty = await refusedSave('r-01-new-all-empty');
            // "Jump to next error": where it takes the reader
            const jump = tplDlg().getByText('Jump to next error').first();
            if (await jump.count()) {
                const role = await jump.evaluate((e) => ({tag: e.tagName, role: e.getAttribute('role'), href: e.getAttribute('href')}));
                await jump.click().catch(() => {});
                await sleep(500);
                out.jump = {role, focused: await page.evaluate(() => { const a = document.activeElement; return a ? {tag: a.tagName, name: a.name, id: a.id, text: (a.innerText || '').slice(0, 80)} : null; })};
                await jump.click().catch(() => {});
                await sleep(500);
                out.jump.second = await page.evaluate(() => { const a = document.activeElement; return a ? {tag: a.tagName, name: a.name, id: a.id, text: (a.innerText || '').slice(0, 80)} : null; });
                await loc(page, 'the "Jump to next error" control', jump);
            }
            // Save stays disabled while any flagged field is unfixed: record it while fixing one at a time
            const sd = () => tplDlg().getByRole('button', {name: 'Save', exact: true}).isDisabled();
            const errs = async () => (await readTemplateWindow()).errors;
            out.fixOneAtATime = {};
            await tplDlg().locator('input[name="name-en"]').fill('K3 name');
            out.fixOneAtATime.nameFilled = {saveDisabled: await sd(), errors: await errs()};
            await tplDlg().locator('input[name="subject-en"]').fill('K3 subject');
            out.fixOneAtATime.subjectFilled = {saveDisabled: await sd(), errors: await errs()};
            await typeRich(BODY, 'K3 body.');
            await tplDlg().locator('input[name="name-en"]').click();
            await sleep(500);
            out.fixOneAtATime.bodyTyped = {saveDisabled: await sd(), errors: await errs()};
            await snap('r-02-fixed-one-at-a-time');
            // each field empty on its own, in a fresh "Add Template" window
            const freshAdd = async (fields) => {
                await closeDlg(tplDlg());
                await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
                await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                if (fields.name) await tplDlg().locator('input[name="name-en"]').fill(fields.name);
                if (fields.subject) await tplDlg().locator('input[name="subject-en"]').fill(fields.subject);
                if (fields.body) await typeRich(BODY, fields.body);
                await tplDlg().locator('input[name="name-en"]').click();
                return (await readTemplateWindow()).inputs.slice(0, 2).map((i) => i.value.length);
            };
            out.freshAddStartsEmpty = await freshAdd({});
            await freshAdd({name: 'K3 n', subject: 'K3 s'});
            out.newBodyEmpty = await refusedSave('r-03-new-body-empty');
            await freshAdd({name: 'K3 n', body: 'K3 b.'});
            out.newSubjectEmpty = await refusedSave('r-04-new-subject-empty');
            await freshAdd({subject: 'K3 s', body: 'K3 b.'});
            out.newNameEmpty = await refusedSave('r-05-new-name-empty');
            // the length axis: 256 refused, 255 saved
            await freshAdd({name: 'N'.repeat(256), subject: 'K3 s', body: 'K3 b.'});
            out.name256 = await refusedSave('r-06-name-256');
            out.name256.value = (await tplDlg().locator('input[name="name-en"]').inputValue()).length;
            await tplDlg().locator('input[name="name-en"]').fill(`K3${'n'.repeat(253)}`);
            out.name255 = await saveTemplate('r-07-name-255-saved', {behind: true});
            out.rowsAfter255 = (await windowRead(o.dlg)).items.map((i) => ({text: i.text.slice(0, 60) + (i.text.length > 60 ? '…' : ''), len: i.text.length, buttons: i.buttons}));
            await closeDlg(o.dlg);
            // the refused new template stored nothing: reopen the email (refetch)
            await openManage(A);
            o = await openEmail(W);
            out.afterRefusalsTemplates = (o.data.emailTemplates || []).map((t) => (t.name && t.name.en || '').slice(0, 40));
            // an existing template (the default row): empty each field in turn
            for (const [field, label] of [['subject-en', 'subject'], ['name-en', 'name'], ['body', 'body']]) {
                await openDefaultRow(o.dlg);
                const orig = field === 'body' ? await editorContent() : await tplDlg().locator(`input[name="${field}"]`).inputValue();
                if (field === 'body') await typeRich(BODY, ''); else await tplDlg().locator(`input[name="${field}"]`).fill('');
                out[`existing-${label}-empty`] = await refusedSave(`r-08-existing-${label}-empty`);
                out[`existing-${label}-empty`].orig = (orig || '').slice(0, 80);
                await closeDlg(tplDlg());
                // nothing stored: close the email's window, reopen (refetch), read the default
                await closeDlg(o.dlg);
                await openManage(A);
                o = await openEmail(W);
                const t0 = (o.data.emailTemplates || [])[0] || {};
                out[`existing-${label}-empty`].stored = {name: t0.name && t0.name.en, subject: t0.subject && t0.subject.en, bodyStart: t0.body && t0.body.en && t0.body.en.slice(0, 60)};
            }
            await closeDlg(o.dlg);
            // the one-template email: empty subject
            await openManage(A);
            await openEmail(SGL);
            await tplDlg().locator('input[name="subject-en"]').fill('');
            out.singleSubjectEmpty = await refusedSave('r-09-single-subject-empty');
            await closeDlg(tplDlg());
            await page.reload(); await idle(page);
            await openManage(A);
            const s = await openEmail(SGL);
            out.singleSubjectEmpty.storedAfterReload = s.data && s.data.subject;
            await closeDlg(tplDlg());
            F('r-refuse', out);
            await signOut(page);
        });

        // ======================================================= insert: Rule 14, "Insert" at the cursor, placeholder kept
        await phase('insert', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            await openManage(A);
            const o = await openEmail(W);
            await openDefaultRow(o.dlg);
            await typeRich(BODY, 'K3 alpha omega');
            // put the cursor between "alpha" and " omega"
            for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
            const {ic, rows} = await insertContentRows(tplDlg());
            await snap('i-01-insert-content');
            const target = rows.find((r) => r.value === '{$recipientName}') || rows[0];
            await ic.locator('li').filter({hasText: target.value}).first().getByRole('button', {name: 'Insert'}).click();
            await sleep(900);
            const icOpen = await ic.isVisible().catch(() => false);
            const after1 = await editorContent();
            await snap('i-02-after-insert');
            if (icOpen) await closeDlg(ic);
            // a second insert with the cursor at the end (click at the end of the text)
            const body = page.frameLocator(`#${BODY}_ifr`).locator('body');
            await body.click(); await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End');
            const r2 = await insertContentRows(tplDlg());
            await r2.ic.locator('li').filter({hasText: '{$contextName}'}).first().getByRole('button', {name: 'Insert'}).click();
            await sleep(900);
            const ic2Open = await r2.ic.isVisible().catch(() => false);
            if (ic2Open) await closeDlg(r2.ic);
            const after2 = await editorContent();
            await snap('i-03-after-second-insert');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            F('i-insert', {rows: rows.length, inserted: target.value, windowOpenAfterInsert: icOpen, after1, second: {windowOpenAfterInsert: ic2Open, after2}});
            await signOut(page);
        });

        // ======================================================= close: Rule 15 (fn-p)
        await phase('close', async () => {
            await signIn(page, `${A}mg`, {contextPath: A});
            const out = {};
            await openManage(A);
            let o = await openEmail(W);
            const rows0 = (await windowRead(o.dlg)).items;
            await openDefaultRow(o.dlg);
            const saved0 = await tplDlg().locator('input[name="subject-en"]').inputValue();
            await tplDlg().locator('input[name="subject-en"]').fill('K3 typed not saved X');
            await typeRich(BODY, 'K3 typed body not saved.');
            const nDialogs = dialogs.length;
            await closeDlg(tplDlg());
            out.x = {saved0, askedOnClose: dialogs.length > nDialogs, emailWindowOpen: await o.dlg.isVisible(), rowsUnchanged: JSON.stringify((await windowRead(o.dlg)).items) === JSON.stringify(rows0)};
            await snap('c-01-after-x');
            // the same row's Edit again
            await openDefaultRow(o.dlg);
            out.x.sameRowAgain = {subject: await tplDlg().locator('input[name="subject-en"]').inputValue(), body: (await editorContent() || '').slice(0, 120)};
            await snap('c-02-same-row-again');
            await closeDlg(tplDlg());
            // "Add Template" in between, then the default row again
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.x.addInBetween = {name: await tplDlg().locator('input[name="name-en"]').inputValue(), subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            await closeDlg(tplDlg());
            await openDefaultRow(o.dlg);
            out.x.defaultAfterAdd = {subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            // type again, then Save: which text is stored?  (no: keep the saved state) — close
            await closeDlg(tplDlg());
            // another row in between (the added row, when there is one)
            const items = (await windowRead(o.dlg)).items;
            if (items.length > 1) {
                await openDefaultRow(o.dlg);
                await tplDlg().locator('input[name="subject-en"]').fill('K3 typed again Y');
                await closeDlg(tplDlg());
                await openDefaultRow(o.dlg, 1);
                out.x.otherRow = {subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
                await closeDlg(tplDlg());
                await openDefaultRow(o.dlg);
                out.x.defaultAfterOtherRow = {subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
                await closeDlg(tplDlg());
            }
            // close the email's window, reopen the email: the form is rebuilt from what is stored
            await closeDlg(o.dlg);
            await openManage(A);
            o = await openEmail(W);
            await openDefaultRow(o.dlg);
            out.x.afterReopenEmail = {subject: await tplDlg().locator('input[name="subject-en"]').inputValue(), stored: ((o.data.emailTemplates || [])[0] || {}).subject};
            await snap('c-03-after-reopen-email');
            // Escape instead of the "×"
            await tplDlg().locator('input[name="subject-en"]').fill('K3 typed then Escape Z');
            await page.keyboard.press('Escape');
            await sleep(1000);
            out.escape = {templateOpen: await tplDlg().isVisible().catch(() => false), emailWindowOpen: await emailDlg(W).isVisible().catch(() => false), asked: dialogs.length > nDialogs};
            await snap('c-04-after-escape');
            if (out.escape.templateOpen) await closeDlg(tplDlg());
            if (await emailDlg(W).isVisible().catch(() => false)) {
                await openDefaultRow(emailDlg(W));
                out.escape.sameRowAgain = await tplDlg().locator('input[name="subject-en"]').inputValue();
                await closeDlg(tplDlg());
                await closeDlg(emailDlg(W));
            }
            // one-template email: × then Edit again
            await openManage(A);
            await openEmail(SGL);
            const sSaved = await tplDlg().locator('input[name="subject-en"]').inputValue();
            await tplDlg().locator('input[name="subject-en"]').fill('K3 single typed not saved');
            await closeDlg(tplDlg());
            await openEmail(SGL);
            out.single = {saved: sSaved, againAfterX: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            await snap('c-05-single-again');
            // leave the page with the change unsaved (a screen left with something changed)
            await tplDlg().locator('input[name="subject-en"]').fill('K3 typed then leave');
            await tplDlg().locator('input[name="name-en"]').click();
            const nd = dialogs.length;
            await page.goto(ctx(A, '/management/settings/workflow'));
            await idle(page);
            out.leave = {asked: dialogs.slice(nd), landed: page.url()};
            await openManage(A);
            const s2 = await openEmail(SGL);
            out.leave.stored = s2.data && s2.data.subject;
            await closeDlg(tplDlg());
            F('c-close', out);
            await signOut(page);
        });

        // ======================================================= levels: the same windows as a Site Administrator and a manager-level Journal editor (read-only)
        await phase('levels', async () => {
            const who = ['admin'].concat(ops ? [] : [`${A}ed`]);
            const out = {};
            for (const u of who) {
                await signIn(page, u, {contextPath: A});
                await page.goto(ctx(A, '/management/settings/manageEmails'));
                await idle(page);
                const s0 = await snap(`l-01-${u === 'admin' ? 'admin' : 'editor'}-page`);
                const has = await page.locator('main').getByRole('button', {name: `Edit ${W}`, exact: true}).count();
                const rec = {landed: page.url(), h1: flat(s0.text.main, 120), hasRow: has};
                if (has) {
                    const o = await openEmail(W);
                    const w = await windowRead(o.dlg);
                    rec.window = {items: w.items, buttons: w.buttons.filter((b) => !/\n/.test(b || ''))};
                    await snap(`l-02-${u === 'admin' ? 'admin' : 'editor'}-window`);
                    await openDefaultRow(o.dlg);
                    const t = await readTemplateWindow();
                    rec.template = {inputs: t.inputs.slice(0, 2), buttons: t.buttons.filter((b) => !/\n/.test(b || ''))};
                    await snap(`l-03-${u === 'admin' ? 'admin' : 'editor'}-edit-template`);
                    await closeDlg(tplDlg());
                    await closeDlg(o.dlg);
                }
                out[u === 'admin' ? 'admin' : 'editor'] = rec;
                await signOut(page);
            }
            F('levels', out);
        });

        // ======================================================= send: the sending window after an edit and an added template (Rules 11, 12, 14)
        await phase('send', async () => {
            if (!S.S1) {
                const participants = [{username: `${D}mg`, role: 'manager'}];
                S.S1 = await app.api.createSubmission({tag: `${D}s1`, context: D, submitter: `${D}au`, title: `K3 first ${D}`, participants});
                S.S2 = await app.api.createSubmission({tag: `${D}s2`, context: D, submitter: `${D}au`, title: `K3 second ${D}`, participants});
                saveSeed();
            }
            await signIn(page, `${D}mg`, {contextPath: D});
            const out = {};
            if (!S.edited) {
                await openManage(D);
                const o = await openEmail(DEC);
                await openDefaultRow(o.dlg);
                await tplDlg().locator('input[name="subject-en"]').fill(`K3 DEC edited ${D}`);
                await typeRich(BODY, 'K3 marker for ', {keep: false});
                const {ic} = await insertContentRows(tplDlg());
                await ic.locator('li').filter({hasText: '{$recipientName}'}).first().getByRole('button', {name: 'Insert'}).click();
                await sleep(900);
                if (await ic.isVisible().catch(() => false)) await closeDlg(ic);
                out.editedBody = await editorContent();
                out.editSaved = await saveTemplate('s-01-dec-edited');
                await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
                await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                await tplDlg().locator('input[name="name-en"]').fill(`K3 alt ${D}`.slice(0, 40));
                await tplDlg().locator('input[name="subject-en"]').fill(`K3 alt subject ${D}`);
                await typeRich(BODY, 'K3 alt body.');
                out.addSaved = await saveTemplate('s-02-dec-added', {behind: true});
                out.rows = (await windowRead(o.dlg)).items;
                await closeDlg(o.dlg);
                S.edited = true; saveSeed();
            }
            const openDecline = async (sub, label) => {
                await page.goto(ctx(D, `/dashboard/editorial?workflowSubmissionId=${sub.submissionId}`));
                await idle(page);
                const wf = page.locator('[role="dialog"]:visible').first();
                await wf.waitFor({timeout: 30000});
                const btn = wf.getByRole('button', {name: 'Decline Submission', exact: true}).first();
                await btn.waitFor({timeout: 20000}).catch(() => {});
                if (!(await btn.count())) { await snap(`${label}-no-decline`); return {noButton: true}; }
                await btn.click();
                await page.waitForURL(/decision\/record/, {timeout: 30000}).catch(() => {});
                await idle(page);
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await page.waitForFunction(() => { const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id)); return i && i.value.length > 0; }, null, {timeout: 20000}).catch(() => {});
                await sleep(500);
                await snap(label);
                return page.evaluate(() => {
                    const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id));
                    const tpls = [...document.querySelectorAll('.composer__template__name')].map((e) => e.innerText.trim());
                    const ed = (window.tinymce ? window.tinymce.get() : []).map((e) => e.getContent().slice(0, 600));
                    return {url: location.href, subject: i ? i.value : null, templates: tpls, editors: ed};
                });
            };
            const record1 = async (label) => {
                const postP = page.waitForResponse((r) => /\/decisions/.test(r.url()) && r.request().method() === 'POST', {timeout: 60000}).then((r) => r.status()).catch(() => null);
                for (let i = 0; i < 6; i++) {
                    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                    await idle(page); await sleep(500);
                    const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
                    if (await rec.isVisible().catch(() => false)) { await rec.click(); break; }
                    await page.getByRole('button', {name: 'Continue', exact: true}).click();
                }
                const st = await postP;
                await sleep(1500);
                await snap(label);
                return st;
            };
            const mailTo = `${D}au@mail.test`;
            const mailRead = async (contains) => {
                const m = await app.mail.find({to: mailTo, contains, timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
                if (!m || m.error) return m;
                const full = await app.mail.fullMessage(m.ID);
                return {subject: full.Subject, text: (full.Text || '').replace(/\r/g, '').slice(0, 700)};
            };
            if (!S.sent1) {
                out.composer1 = await openDecline(S.S1, 's-03-composer-default');
                out.record1 = await record1('s-04-recorded-1');
                out.mail1 = await mailRead('K3 marker for');
                S.sent1 = true; saveSeed();
            }
            if (!S.sent2) {
                out.composer2 = await openDecline(S.S2, 's-05-composer-2');
                const altName = `K3 alt ${D}`.slice(0, 40);
                const tb = page.locator('button.composer__template').filter({has: page.locator('.composer__template__name', {hasText: altName})}).first();
                out.altListed = await tb.count();
                if (out.altListed) {
                    await tb.click();
                    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                    await sleep(800);
                    out.afterPick = await page.evaluate(() => { const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id)); return {subject: i ? i.value : null, editors: (window.tinymce ? window.tinymce.get() : []).map((e) => e.getContent().slice(0, 300))}; });
                    await snap('s-06-composer-alt-picked');
                }
                out.record2 = await record1('s-07-recorded-2');
                out.mail2 = await mailRead('K3 alt body');
                S.sent2 = true; saveSeed();
            }
            F('s-send', out);
            await signOut(page);
        });

        // ======================================================= lang: two form languages (line 107, Rule 13's primary language)
        await phase('lang', async () => {
            await signIn(page, `${L}mg`, {contextPath: L});
            await openManage(L);
            const o = await openEmail(W);
            const out = {};
            await openDefaultRow(o.dlg);
            const t = await readTemplateWindow();
            out.edit = {inputs: t.inputs.map((i) => ({name: i.name, visible: i.visible})), bodies: t.bodies.map((b) => b.id), buttons: t.buttons.filter((b) => !/\n/.test(b || ''))};
            await snap('g-01-edit-two-languages');
            await closeDlg(tplDlg());
            // a new template in French only
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const fr = tplDlg().getByRole('button', {name: 'French', exact: true});
            if (await fr.count()) { await fr.click(); await sleep(500); }
            const frVisible = await tplDlg().locator('input[name="name-fr_CA"]').isVisible().catch(() => false);
            if (frVisible) {
                await tplDlg().locator('input[name="name-fr_CA"]').fill('K3 nom');
                await tplDlg().locator('input[name="subject-fr_CA"]').fill('K3 sujet');
                await waitBody('editEmailTemplate-body-control-fr_CA');
                await typeRich('editEmailTemplate-body-control-fr_CA', 'K3 corps.');
            }
            out.frVisible = frVisible;
            out.frenchOnly = await refusedSave('g-02-new-french-only');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            await openManage(L);
            const o2 = await openEmail(W);
            out.templatesAfter = (o2.data.emailTemplates || []).map((x) => x.name);
            await closeDlg(o2.dlg);
            F('g-lang', out);
            await signOut(page);
        });

        // ======================================================= ops1: the initials row in both Insert Content windows (OJS/OMP controls)
        await phase('ops1', async () => {
            await signIn(page, `${B}mg`, {contextPath: B});
            await page.goto(ctx(B, '/management/settings/workflow'));
            await idle(page);
            await page.getByRole('tab', {name: 'Emails', exact: true}).click();
            await idle(page);
            await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, SIG_ID, {timeout: 20000}).catch(() => {});
            const {ic, rows} = await insertContentRows(page.locator('#emails'));
            await snap('o-01-signature-insert-content');
            await closeDlg(ic);
            await openManage(B);
            const o = await openEmail(SGL);
            const r2 = await insertContentRows(tplDlg());
            await snap('o-02-template-insert-content');
            await closeDlg(r2.ic);
            await closeDlg(tplDlg());
            const pick = (rs) => rs.filter((r) => /contextAcronym|contextName|contextSignature/.test(r.value || ''));
            F('o-ops1', {signature: pick(rows), template: pick(r2.rows), rawKeys: {signature: rows.filter((r) => /##/.test(r.description || '')), template: r2.rows.filter((r) => /##/.test(r.description || ''))}, kind: o.kind});
            await signOut(page);
        });

        // ======================================================= ctxvars: which emails' Insert Content lacks the journal's placeholders (Rule 14), from the list the page itself fetches
        await phase('ctxvars', async () => {
            await signIn(page, `${B}mg`, {contextPath: B});
            await openManage(B);
            const names = (await rowNames()).filter((n) => n !== 'User Role Masthead Visibility Update Notification');
            const out = [];
            for (const n of names) {
                await openManage(B);
                const o = await openEmail(n);
                if (o.absent || o.failed) { out.push({name: n, skipped: o.status || 'absent'}); continue; }
                if (o.kind === 'multi') await openDefaultRow(o.dlg);
                const {ic, rows} = await insertContentRows(tplDlg());
                out.push({name: n, kind: o.kind, values: rows.map((x) => x.value)});
                await closeDlg(ic);
            }
            const noCtx = out.filter((m) => m.values && !m.values.includes('{$contextName}'));
            F('ctxvars', {count: out.length, withoutContextName: noCtx});
            if (noCtx.length) {
                await openManage(B);
                const o = await openEmail(noCtx[noCtx.length - 1].name);
                if (o.kind === 'multi') await openDefaultRow(o.dlg);
                await insertContentRows(tplDlg());
                await snap('x-02-insert-content-no-context');
            }
            await signOut(page);
        });

    } catch (e) {
        log('ERROR', String(e.stack || e).split('\n').slice(0, 6).join(' | '));
        await snap('zz-error').catch(() => {});
    } finally {
        record('dialogs', dialogs);
        await close();
    }
});
