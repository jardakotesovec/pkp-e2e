// U56 claim check, chunk K1 — Settings › Workflow › "Emails" tab: its fields
// (spec lines 52–75), Rules 1–5 (109–174), Side effects and Settings that
// modify behavior (339–406), register A1 (522–530).
// docs/specs/U56-emails-management.md
//
// Seeds its own scratch contexts per app (nothing is changed on publicknowledge):
//   A — manager mg, author au, editor ed {OJS OMP}; principal contact
//       "Cora Contact" <A ct@mail.test>. The tab is driven and saved here,
//       drafts are submitted through the wizard, templates are edited,
//       reset and removed, and "Reset All" runs once.
//   S — a fresh context read for Rule 2's list (which installed templates
//       hold {$contextSignature}): every row's "Edit" is opened and the
//       template the screen fetches is read.
//   L — English and French as form languages (Settings bullet 9).
//
//   PROBE_FEATURE=U56 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U56/K1/k1.js
//   PHASES=seeded,tab,sig,rows,side,sigall,lang,m404,roles (default all; m404 reads the seeded context only);
//   REUSE=1 reuses the contexts of the last run (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); facts-<app>.json
// collects the structured reads; the console carries [app phase] lines.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'seeded,tab,sig,rows,side,sigall,lang,m404,roles';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const SIG_ID = 'emailSetup-emailSignature-control';

forEachApp(async (app) => {
    const on = (p) => PHASES.includes(p);
    const ops = app.name === 'ops';
    const seedFile = path.join(outDir(), `seed-${app.name}.json`);
    let S = REUSE && fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : null;
    if (!S) {
        const A = tag('u56k1a');
        const users = [
            {username: `${A}mg`, givenName: 'Mona', familyName: 'Manager', email: `${A}mg@mail.test`, roles: ['manager']},
            {username: `${A}au`, givenName: 'Ada', familyName: 'Author', email: `${A}au@mail.test`, roles: ['author']},
        ];
        if (!ops) users.push({username: `${A}ed`, givenName: 'Eda', familyName: 'Editor', email: `${A}ed@mail.test`, roles: ['editor']});
        await app.api.createContext({tag: A, context: {contactName: 'Cora Contact', contactEmail: `${A}ct@mail.test`}, users});
        const L = tag('u56k1l');
        await app.api.createContext({tag: L, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [{username: `${L}mg`, givenName: 'Lena', familyName: 'Manager', email: `${L}mg@mail.test`, roles: ['manager']}]});
        S = {A, L, drafts: 0};
        fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));
    }
    const A = S.A;
    const u = (k) => `${A}${k}`;
    const L = S.L;
    const log = (k, v) => console.log(`[${app.name} ${k}]`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 2500));
    const F = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(k, v); };
    const saveSeed = () => fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url(), at: new Date().toISOString()}); log('browser-dialog', `${d.type()} ${d.message()}`); await d.accept().catch(() => {}); });
    const ctx = (t, p) => app.url(`/index.php/${t}${p}`);
    const snap = async (label, extra) => { const s = await screen(page); record(label, extra ? {...s, extra} : s); await shot(page, label).catch(() => {}); return s; };

    // ---------------------------------------------------------------- the tab
    const panel = () => page.locator('#emails');
    async function openTab(t) {
        await page.goto(ctx(t, '/management/settings/workflow'));
        await idle(page);
        await page.getByRole('tab', {name: 'Emails', exact: true}).click();
        await idle(page);
        await panel().locator('input[name="submissionAcknowledgement"]').first().waitFor({timeout: 30000});
        await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, SIG_ID, {timeout: 20000}).catch(() => {});
    }
    async function tabState() {
        return page.evaluate((sigId) => {
            const p = document.querySelector('#emails');
            const vis = (e) => !!e.getClientRects().length;
            const radios = {};
            [...p.querySelectorAll('input[type=radio]')].forEach((e) => { (radios[e.name] = radios[e.name] || []).push({value: e.value, checked: e.checked, visible: vis(e), label: (e.closest('label') || {}).innerText?.trim()}); });
            const texts = [...p.querySelectorAll('input[type=text], input[type=email]')].map((e) => ({name: e.name, value: e.value, visible: vis(e)}));
            const ed = window.tinymce && window.tinymce.get(sigId);
            const errors = [...p.querySelectorAll('.pkpFieldError, .pkpFormField__error, [id$="-error"]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean);
            const status = [...p.querySelectorAll('[role=status]')].map((e) => e.innerText.trim()).filter(Boolean);
            const link = p.querySelector('a[href*="manageEmails"]');
            const legends = [...p.querySelectorAll('legend, label.pkpFormFieldLabel, .pkpFormFieldLabel')].filter(vis).map((e) => e.innerText.trim());
            return {radios, texts, signature: ed ? ed.getContent() : null, errors, status, link: link && {text: link.innerText.trim(), href: link.getAttribute('href')}, legends, text: p.innerText};
        }, SIG_ID);
    }
    const radio = (name, idx) => panel().locator(`input[name="${name}"]`).nth(idx);
    async function pick(name, idx) { await radio(name, idx).check(); await sleep(150); }
    async function pageBar() {
        return (await page.locator('.app__notifications, [role=alert], .pkpNotification, .pkpFormPage__status, .pkpFormErrors').allInnerTexts().catch(() => [])).map((s) => flat(s, 300)).filter(Boolean);
    }
    async function saveTab(label) {
        const respP = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000})
            .then(async (r) => ({status: r.status(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, body: (await r.text().catch(() => '')).slice(0, 600)})).catch(() => null);
        await panel().getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await respP;
        const saved = await panel().locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        const statusText = await panel().locator('[role="status"]').allInnerTexts().catch(() => []);
        await idle(page);
        const st = await tabState();
        const bar = await pageBar();
        await snap(label, {resp, saved, statusText, st, bar});
        return {resp, saved, statusText, errors: st.errors, bar, st};
    }
    async function typeRich(id, text) {
        const ifr = page.locator(`#${id}_ifr`);
        const body = (await ifr.count()) ? page.frameLocator(`#${id}_ifr`).locator('body') : page.locator(`#${id}`);
        await body.click();
        await page.keyboard.press(SELECT_ALL);
        await page.keyboard.press('Delete');
        if (text) await body.pressSequentially(text, {delay: 5});
        await sleep(300);
    }
    const editorContent = (id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id);

    // ------------------------------------------------------ Manage Emails page
    async function openManage(t) {
        await page.goto(ctx(t, '/management/settings/manageEmails'));
        await idle(page);
        await page.locator('main').getByRole('button', {name: /^Edit /}).first().waitFor({timeout: 30000});
    }
    // an "Edit" button reads "Edit" plus a screen-reader "Edit {name}": strip both
    const rowNames = () => page.evaluate(() => [...document.querySelectorAll('main button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter((s) => /^Edit /.test(s)).map((s) => s.replace(/^Edit (Edit )?/, '')));
    async function manageNames(t, label) {
        await openManage(t);
        const names = await rowNames();
        await snap(label, {names});
        return names;
    }
    async function closeTop(nameRe) {
        const d = page.getByRole('dialog', {name: nameRe}).last();
        await d.getByRole('button', {name: 'Close', exact: true}).first().click();
        await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(700); // the modal store's 450 ms slot
    }
    // Press an email's "Edit"; return the kind of window and the data the screen fetched for it.
    async function openEmail(name) {
        const btn = page.locator('main').getByRole('button', {name: `Edit ${name}`, exact: true});
        if (!(await btn.count())) return {absent: true};
        const respP = page.waitForResponse((r) => /api\/v1\/(mailables|emailTemplates)\//.test(r.url()) && r.request().method() === 'GET', {timeout: 20000}).catch(() => null);
        await btn.click();
        const r = await respP;
        const data = r ? await r.json().catch(() => null) : null;
        const kind = r && /mailables/.test(r.url()) ? 'multi' : 'single';
        const dlg = kind === 'multi' ? page.getByRole('dialog', {name, exact: true}) : page.getByRole('dialog', {name: 'Edit Template'});
        await dlg.last().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        if (kind === 'single') await page.waitForFunction(() => window.tinymce && window.tinymce.get('editEmailTemplate-body-control-en') && window.tinymce.get('editEmailTemplate-body-control-en').initialized, null, {timeout: 15000}).catch(() => {});
        return {kind, data, status: r && r.status(), dlg: dlg.last()};
    }
    async function windowRows(dlg) {
        return dlg.evaluate((d) => {
            const h = [...d.querySelectorAll('h2, h3')].find((x) => /Templates/.test(x.innerText));
            const root = h ? h.closest('div, section') : d;
            const items = [...d.querySelectorAll('li, tr')].filter((li) => li.querySelector('button')).map((li) => ({text: li.innerText.replace(/\s+/g, ' ').trim(), buttons: [...li.querySelectorAll('button')].map((b) => b.innerText.trim())}));
            return {items, text: d.innerText, rootText: root ? root.innerText : null};
        });
    }
    async function readTemplateWindow() {
        const d = page.getByRole('dialog', {name: 'Edit Template'}).last();
        return d.evaluate((el) => ({
            inputs: [...el.querySelectorAll('input, textarea')].filter((e) => e.type !== 'submit').map((e) => ({name: e.name, id: e.id, value: (e.value || '').slice(0, 200)})),
            bodies: (window.tinymce ? window.tinymce.get() : []).filter((e) => /editEmailTemplate-body/.test(e.id)).map((e) => ({id: e.id, content: e.getContent().slice(0, 3000)})),
            buttons: [...el.querySelectorAll('button')].map((b) => b.innerText.trim() || b.getAttribute('aria-label')).filter(Boolean),
            errors: [...el.querySelectorAll('.pkpFieldError, .pkpFormField__error, .pkpFormErrors, [class*=formError]')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()),
            text: el.innerText,
        }));
    }
    // In an open "Edit Template" window: set the subject (and body when given), Save, wait for the window to close.
    async function editTemplateFields({subject, body, name}, label) {
        const d = page.getByRole('dialog', {name: 'Edit Template'}).last();
        await page.waitForFunction(() => window.tinymce && window.tinymce.get('editEmailTemplate-body-control-en') && window.tinymce.get('editEmailTemplate-body-control-en').initialized, null, {timeout: 15000}).catch(() => {});
        if (name !== undefined) await d.locator('input[name="name-en"]').fill(name);
        if (subject !== undefined) await d.locator('input[name="subject-en"]').fill(subject);
        if (body !== undefined) await typeRich('editEmailTemplate-body-control-en', body);
        const respP = page.waitForResponse((r) => /api\/v1\/emailTemplates/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).then((r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), override: r.request().headers()['x-http-method-override'] || null})).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await respP;
        const saved = await d.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 5000}).then(() => true).catch(() => false);
        const closed = await d.waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
        await sleep(700);
        await idle(page);
        const s = await snap(label, {resp, saved, closed});
        return {resp, saved, closed, dialog: s.text.dialog};
    }
    // Edit an email's default template: one-template emails open straight into "Edit Template"; the others through the default row.
    async function editDefault(name, fields, label) {
        const o = await openEmail(name);
        if (o.absent) return {absent: true};
        if (o.kind === 'multi') {
            await o.dlg.getByRole('button', {name: 'Edit', exact: true}).first().click();
            await page.getByRole('dialog', {name: 'Edit Template'}).last().waitFor({timeout: 15000});
            await idle(page);
        }
        const before = await readTemplateWindow();
        const r = await editTemplateFields(fields, label);
        let rows = null;
        if (o.kind === 'multi') { rows = await windowRows(o.dlg); await closeTop(new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`)); }
        return {kind: o.kind, before: {inputs: before.inputs}, ...r, rows};
    }
    async function readDefault(name) {
        const o = await openEmail(name);
        if (o.absent) return {absent: true};
        let tpl = o.data;
        if (o.kind === 'multi') {
            tpl = (o.data.emailTemplates || [])[0];
            const rows = await windowRows(o.dlg);
            await closeTop(new RegExp(`^${name.replace(/[()]/g, '\\$&')}$`));
            return {kind: 'multi', subject: tpl && tpl.subject, name: tpl && tpl.name, rows: rows.items, templates: (o.data.emailTemplates || []).map((t) => ({key: t.key, name: t.name && t.name.en, subject: t.subject && t.subject.en}))};
        }
        await closeTop(/^Edit Template$/);
        return {kind: 'single', subject: tpl && tpl.subject, name: tpl && tpl.name};
    }

    // ------------------------------------------------------ wizard + mail
    async function submitDraft(label, {expectAck = true} = {}) {
        S.drafts += 1; saveSeed();
        const dt = `${A}d${S.drafts}`;
        const title = `K1 draft ${dt}`;
        const {submissionId} = await app.api.createSubmission({tag: dt, context: A, submitter: u('au'), title, submitted: false});
        await signIn(page, u('au'), {contextPath: A});
        const out = {submissionId, title};
        try {
            if (app.name === 'ojs') {
                const {SubmissionWizardPage} = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPage.js'));
                const w = new SubmissionWizardPage(page, A);
                await w.goto(submissionId);
                await w.expectStep('Upload Files');
                await w.uploadFile();
                await w.continueTo('Details');
                await w.continueTo('Contributors');
                await w.continueTo('For the Editors');
                await w.continueToReview(submissionId);
                await w.submitAndConfirm();
            } else {
                const W = require(path.join(app.suiteDir, 'pages', 'SubmissionWizardPages.js'));
                await page.goto(W.wizardUrl(A, submissionId));
                await idle(page);
                if (app.name === 'omp') await W.completeAndSubmitDraft(page, `ms-${dt}.txt`); else await W.completeAndSubmitDraft(page);
            }
            out.submitted = true;
        } catch (e) {
            out.error = String(e.stack || e).split('\n').slice(0, 3).join(' | ');
        }
        await snap(`${label}-submitted`, out);
        out.submittedAt = new Date().toISOString();
        await signOut(page);
        return out;
    }
    async function ackMail(to, title) {
        const m = await app.mail.find({to, contains: title, timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
        if (!m || m.error) return m;
        const full = await app.mail.fullMessage(m.ID);
        const text = (full.Text || '').replace(/\r/g, '');
        return {id: m.ID, subject: full.Subject, to: (full.To || []).map((a) => a.Address), cc: (full.Cc || []).map((a) => a.Address), bcc: (full.Bcc || []).map((a) => a.Address),
            textTail: text.slice(-400), htmlTail: (full.HTML || '').slice(-600), created: m.Created};
    }
    // Every message whose text carries the context's tag (the context name is on every one of them), newest first.
    async function tagMessages() {
        const base = app.mail.url || process.env.MAILPIT_URL || 'http://127.0.0.1:8025';
        const r = await fetch(`${base}/api/v1/search?query=${encodeURIComponent(A)}&limit=200`).then((x) => x.json()).catch((e) => ({error: String(e)}));
        return (r.messages || []).map((m) => ({created: m.Created, subject: m.Subject, to: (m.To || []).map((a) => a.Address)}));
    }

    try {
        // ======================================================= seeded (read-only)
        if (on('seeded')) {
            await signIn(page, 'manager.maya', {contextPath: app.contextPath});
            await openTab(app.contextPath);
            const s = await snap('s-seeded-tab');
            const st = await tabState();
            await page.locator('#emails').getByRole('button', {name: 'Insert Content'}).click();
            const ic = page.getByRole('dialog', {name: 'Insert Content'});
            await ic.waitFor({timeout: 15000});
            await idle(page);
            const is = await snap('s-seeded-insert-content');
            await closeTop(/^Insert Content$/);
            F('seeded', {signature: st.signature, radios: st.radios, texts: st.texts, link: st.link, insertContent: is.text.dialog});
            await signOut(page);
        }

        // ======================================================= tab (scratch A, manager)
        if (on('tab')) {
            await signIn(page, u('mg'), {contextPath: A});
            await openTab(A);
            const s0 = await snap('t-01-arrival');
            const st0 = await tabState();
            F('t-arrival', {signature: st0.signature, radios: st0.radios, texts: st0.texts, link: st0.link, legends: st0.legends});
            F('t-arrival-text', st0.text);
            await loc(page, 'Emails tab: panel', panel());
            await loc(page, 'Emails tab: "Submission Confirmation" radios', panel().locator('input[name="submissionAcknowledgement"]'));
            await loc(page, 'Emails tab: Save', panel().getByRole('button', {name: 'Save', exact: true}));
            await loc(page, 'Emails tab: signature editor iframe', page.locator(`#${SIG_ID}_ifr`));
            await loc(page, 'Emails tab: "Add and edit templates" link', panel().getByRole('link', {name: 'Add and edit templates'}));
            const sigLink = await page.frameLocator(`#${SIG_ID}_ifr`).locator('a').first().evaluate((a) => ({text: a.innerText, href: a.getAttribute('href')})).catch(() => null);
            F('t-signature-link', {sigLink, contextHome: ctx(A, '')});

            // Insert Content on the signature: rows, then one "Insert"
            await panel().getByRole('button', {name: 'Insert Content'}).click();
            const ic = page.getByRole('dialog', {name: 'Insert Content'});
            await ic.waitFor({timeout: 15000});
            await idle(page);
            const is = await snap('t-02-insert-content');
            const rows = await ic.getByRole('listitem').allInnerTexts();
            await loc(page, 'Insert Content window (signature)', ic);
            // search in the window
            const sb = ic.getByRole('searchbox');
            let search = null;
            if (await sb.count()) {
                await sb.fill('url'); await sb.press('Enter'); await sleep(500);
                search = {url: (await ic.getByRole('listitem').allInnerTexts()).map((x) => flat(x, 80))};
                await sb.fill(''); await sb.press('Enter'); await sleep(300);
            }
            await ic.getByRole('listitem').filter({hasText: '{$contextName}'}).getByRole('button', {name: 'Insert'}).click();
            await sleep(800);
            const icOpen = await ic.isVisible().catch(() => false);
            const afterInsert = await editorContent(SIG_ID);
            if (icOpen) await closeTop(/^Insert Content$/);
            F('t-insert-content', {rows: rows.map((r) => flat(r, 160)), search, windowStaysOpenAfterInsert: icOpen, signatureAfterInsert: afterInsert});

            // Rule 4: the copy fields follow the confirmation, before any Save
            await pick('submissionAcknowledgement', 2);
            const r4off = await tabState();
            await snap('t-03-rule4-do-not-send');
            await pick('submissionAcknowledgement', 1);
            const r4only = await tabState();
            await pick('submissionAcknowledgement', 0);
            const r4all = await tabState();
            const vis = (st) => ({primary: (st.radios.copySubmissionAckPrimaryContact || []).map((r) => r.visible), anyone: (st.texts.find((x) => x.name === 'copySubmissionAckAddress') || {}).visible});
            F('t-rule4', {off: vis(r4off), only: vis(r4only), all: vis(r4all), offChecked: r4off.radios.submissionAcknowledgement});

            // Leaving with unsaved changes: another tab, then another page (the signature still holds the inserted placeholder)
            await pick('notifyAllAuthors', 1);
            const nBefore = dialogs.length;
            await page.getByRole('tab', {name: 'Submission', exact: true}).first().click();
            await idle(page);
            await sleep(500);
            const afterTabSwitch = {dialogs: dialogs.slice(nBefore), selected: await page.getByRole('tab', {name: 'Submission', exact: true}).first().getAttribute('aria-selected')};
            await page.getByRole('tab', {name: 'Emails', exact: true}).click();
            await idle(page);
            const backOnTab = await tabState();
            // blur the editor so the form has noticed every change
            await page.locator('main h1').first().click().catch(() => {});
            const n2 = dialogs.length;
            await page.goto(ctx(A, '/dashboard/editorial')).catch((e) => log('leave-goto', String(e).slice(0, 120)));
            await idle(page);
            const leaveDialogs = dialogs.slice(n2);
            await openTab(A);
            const back = await tabState();
            await snap('t-04-after-leaving-unsaved');
            F('t-leave-unsaved', {afterTabSwitch, backOnTabNotify: backOnTab.radios.notifyAllAuthors.map((r) => r.checked), leaveDialogs, afterReturn: {notify: back.radios.notifyAllAuthors.map((r) => r.checked), signature: back.signature}});

            // Rule 1: a refused value keeps the whole tab unsaved
            await pick('editorialStatsEmail', 1);
            await panel().locator('input[name="copySubmissionAckAddress"]').fill('not-an-email');
            const bad = await saveTab('t-05-refused-save');
            await openTab(A);
            const afterBad = await tabState();
            await snap('t-05b-refused-save-reloaded');
            F('t-refused', {resp: bad.resp, saved: bad.saved, statusText: bad.statusText, errors: bad.errors, bar: bad.bar, fieldBlock: flat(bad.st.text.split('Notify Anyone')[1] || '', 400), reloaded: {stats: afterBad.radios.editorialStatsEmail.map((r) => r.checked), anyone: afterBad.texts}});

            // the comma-separated list
            await panel().locator('input[name="copySubmissionAckAddress"]').fill(`${u('c1')}@mail.test,${u('c2')}@mail.test`);
            const comma = await saveTab('t-06-comma-list');
            await openTab(A);
            const afterComma = await tabState();
            F('t-comma', {resp: comma.resp, saved: comma.saved, errors: comma.errors, bar: comma.bar, reloadedAnyone: afterComma.texts.find((x) => x.name === 'copySubmissionAckAddress')});

            // a valid save: signature marker, primary contact yes, one extra address
            await typeRich(SIG_ID, `K1 signature ${A}`);
            await pick('copySubmissionAckPrimaryContact', 0);
            await panel().locator('input[name="copySubmissionAckAddress"]').fill(`${u('cc')}@mail.test`);
            const good = await saveTab('t-07-save');
            const samePage = await tabState();
            await openTab(A);
            const reloaded = await tabState();
            await snap('t-07b-save-reloaded');
            F('t-save', {resp: good.resp, saved: good.saved, statusText: good.statusText, errors: good.errors, bar: good.bar,
                samePage: {signature: samePage.signature, primary: samePage.radios.copySubmissionAckPrimaryContact, anyone: samePage.texts},
                reloaded: {signature: reloaded.signature, primary: reloaded.radios.copySubmissionAckPrimaryContact.map((r) => r.checked), anyone: reloaded.texts, stats: reloaded.radios.editorialStatsEmail.map((r) => r.checked), notify: reloaded.radios.notifyAllAuthors.map((r) => r.checked)}});
            // the link to Manage Emails, pressed
            await panel().getByRole('link', {name: 'Add and edit templates'}).click();
            await idle(page);
            await snap('t-08-link-lands');
            F('t-link', {url: page.url(), h1: await page.locator('main h1').first().innerText().catch(() => null)});
            note(`ccK1 · Settings › Workflow › "Emails" (${app.name}): the tab panel is #emails; radios by name (submissionAcknowledgement allAuthors/submittingAuthor/"on" for "Do not send an email.", copySubmissionAckPrimaryContact true/false, notifyAllAuthors, editorialStatsEmail, OPS postedAcknowledgement), "Notify Anyone" input[name=copySubmissionAckAddress]; the signature is TinyMCE ${SIG_ID} (one text, no -en suffix), typed through #${SIG_ID}_ifr; the Save answers on POST contexts/{id} with X-Http-Method-Override PUT and shows [role=status] "Saved".`);
            await signOut(page);
        }

        // ======================================================= sig: the signature in sent mail (Rule 2, Settings 1, 3, 4; Side effects)
        if (on('sig')) {
            // the phase's own given: the signature marker saved (a re-run finds whatever the last run left)
            await signIn(page, u('mg'), {contextPath: A});
            await openTab(A);
            if (!/K1 signature/.test((await tabState()).signature || '')) { await typeRich(SIG_ID, `K1 signature ${A}`); await saveTab('g-00-signature-given'); }
            await signOut(page);
            const D1 = await submitDraft('g-01-d1');
            const m1 = await ackMail(`${u('au')}@mail.test`, D1.title);
            F('g-d1', {D1, mail: m1});
            // drop the placeholder from "Submission Confirmation" and mark its subject
            await signIn(page, u('mg'), {contextPath: A});
            await openManage(A);
            await snap('g-02-manage');
            const edit = await editDefault(ops ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation', {subject: `K1 edited subject {$contextName} ${A}`, body: 'K1 body without the signature placeholder, {$recipientName}.'}, 'g-03-template-edited');
            F('g-edit', edit);
            await signOut(page);
            const D2 = await submitDraft('g-04-d2');
            const m2 = await ackMail(`${u('au')}@mail.test`, 'K1 body without the signature placeholder');
            const m1again = m1 && m1.id ? await app.mail.fullMessage(m1.id).then((f) => ({subject: f.Subject, textTail: (f.Text || '').slice(-200)})).catch(() => null) : null;
            F('g-d2', {D2, mail: m2, d1Reread: m1again});
            // Reset All on this context: the installed text back, nothing mailed
            await signIn(page, u('mg'), {contextPath: A});
            await openManage(A);
            const beforeReset = await tagMessages();
            const resetAt = new Date().toISOString();
            await page.locator('main').getByRole('button', {name: 'Reset All', exact: true}).click();
            const rd = page.getByRole('dialog', {name: 'Reset All'});
            await rd.waitFor({timeout: 10000});
            await snap('g-05-reset-all-confirm');
            await Promise.all([page.waitForEvent('load', {timeout: 30000}).catch(() => null), rd.getByRole('button', {name: 'Reset All', exact: true}).click()]);
            await idle(page);
            await snap('g-06-reset-all-reloaded');
            const afterReset = await readDefault(ops ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation');
            await openTab(A);
            const tabAfterReset = await tabState();
            // empty the signature and save
            await typeRich(SIG_ID, '');
            const emptied = await saveTab('g-07-signature-emptied');
            await openTab(A);
            const emptiedReloaded = await tabState();
            await snap('g-07b-signature-emptied-reloaded');
            await signOut(page);
            const D3 = await submitDraft('g-08-d3');
            const m3 = await ackMail(`${u('au')}@mail.test`, D3.title);
            const afterAll = await tagMessages();
            F('g-reset-and-empty', {resetAt, afterReset, signatureAfterResetAll: tabAfterReset.signature, emptied: {resp: emptied.resp, saved: emptied.saved, samePage: emptied.st.signature, reloaded: emptiedReloaded.signature}, D3, mail: m3,
                messagesSinceReset: afterAll.filter((m) => m.created > resetAt), countBefore: beforeReset.length});
            // put the marker back for the later phases
            await signIn(page, u('mg'), {contextPath: A});
            await openTab(A);
            await typeRich(SIG_ID, `K1 signature ${A}`);
            await saveTab('g-09-signature-restored');
            await signOut(page);
        }

        // ======================================================= rows: Rule 3 and Settings 2, 5–7
        if (on('rows')) {
            await signIn(page, u('mg'), {contextPath: A});
            const base = await manageNames(A, 'r-01-baseline');
            const ackName = ops ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation';
            const targets = [ackName, 'Submission Confirmation (Other Authors)', 'Notify Other Authors', 'Statistics Report Notification'].concat(ops ? ['Posted Acknowledgement', 'Submission Acknowledgement (No Moderation Required)'] : []);
            const marks = {};
            for (const n of targets) {
                if (!base.includes(n)) { marks[n] = {absentAtBaseline: true}; continue; }
                await openManage(A);
                const cur = await readDefault(n);
                const orig = cur.subject && cur.subject.en;
                await openManage(A);
                marks[n] = await editDefault(n, {subject: `${orig} K1M`}, `r-02-mark-${n.replace(/\W+/g, '')}`);
                marks[n].orig = orig;
            }
            F('r-baseline', {count: base.length, names: base, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, {kind: v.kind, resp: v.resp, closed: v.closed, absent: v.absentAtBaseline}]))});
            const choices = [
                {label: 'ack-submitting', field: 'submissionAcknowledgement', idx: 1, back: 0},
                {label: 'ack-off', field: 'submissionAcknowledgement', idx: 2, back: 0},
                {label: 'notify-assigned', field: 'notifyAllAuthors', idx: 1, back: 0},
                {label: 'stats-off', field: 'editorialStatsEmail', idx: 1, back: 0},
            ].concat(ops ? [{label: 'posted-off', field: 'postedAcknowledgement', idx: 1, back: 0}] : []);
            const res = {};
            for (const c of choices) {
                await openTab(A);
                const radiosBefore = (await tabState()).radios[c.field];
                await pick(c.field, c.idx);
                const sv = await saveTab(`r-03-${c.label}-saved`);
                await openTab(A);
                const re = await tabState();
                await snap(`r-03b-${c.label}-reloaded`);
                const names = await manageNames(A, `r-04-${c.label}-list`);
                const lost = base.filter((n) => !names.includes(n));
                const gained = names.filter((n) => !base.includes(n));
                // search the lost rows by name with Enter (Rule 7's way): nothing found
                const searches = {};
                for (const n of lost) {
                    const box = page.locator('main').getByRole('searchbox').or(page.locator('main input[type=search]')).first();
                    await box.fill(n); await box.press('Enter'); await idle(page); await sleep(400);
                    searches[n] = await rowNames();
                }
                let noAck = null;
                if (c.label === 'ack-off') {
                    await signOut(page);
                    const D = await submitDraft('r-05-ack-off-draft');
                    const control = await app.mail.find({to: `${u('mg')}@mail.test`, contains: D.title, timeoutMs: 30000}).then((m) => ({subject: m.Subject})).catch((e) => ({error: String(e.message).slice(0, 150)}));
                    const ackCount = await app.mail.count({to: `${u('au')}@mail.test`, contains: D.title});
                    noAck = {D, control, ackCount};
                    await signIn(page, u('mg'), {contextPath: A});
                }
                await openTab(A);
                await pick(c.field, c.back);
                const svBack = await saveTab(`r-06-${c.label}-back`);
                const names2 = await manageNames(A, `r-07-${c.label}-list-back`);
                const kept = {};
                for (const n of lost) { await openManage(A); kept[n] = await readDefault(n); }
                res[c.label] = {radiosBefore, save: {resp: sv.resp, saved: sv.saved, errors: sv.errors}, reloadedRadios: re.radios[c.field], copyFieldsVisible: {primary: (re.radios.copySubmissionAckPrimaryContact || []).map((r) => r.visible), anyone: re.texts.find((x) => x.name === 'copySubmissionAckAddress')},
                    count: names.length, lost, gained, searches, noAck, back: {saved: svBack.saved, count: names2.length, returned: lost.filter((n) => names2.includes(n))}, keptAfterReturn: Object.fromEntries(Object.entries(kept).map(([k, v]) => [k, v.subject && v.subject.en]))};
                F(`r-${c.label}`, res[c.label]);
            }
            await signOut(page);
        }

        // ======================================================= side: a saved template in the sending window; Reset/Remove
        if (on('side')) {
            if (!S.S1) {
                const participants = [{username: u('mg'), role: 'manager'}];
                S.S1 = await app.api.createSubmission({tag: `${A}s1`, context: A, submitter: u('au'), title: `K1 decision ${A}`, participants});
                saveSeed();
            }
            await signIn(page, u('mg'), {contextPath: A});
            const names = await manageNames(A, 'x-01-list');
            const declines = names.filter((n) => /^Submission Declined/.test(n));
            const edits = {};
            for (const n of declines) {
                await openManage(A);
                const cur = await readDefault(n);
                await openManage(A);
                edits[n] = await editDefault(n, {subject: `K1 ${n.replace(/\W+/g, '')} edited ${A}`}, `x-02-edit-${n.replace(/\W+/g, '')}`);
                edits[n].orig = cur.subject && cur.subject.en;
                // Add Template
                await openManage(A);
                const o = await openEmail(n);
                if (o.kind === 'multi') {
                    await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
                    await page.getByRole('dialog', {name: 'Edit Template'}).last().waitFor({timeout: 15000});
                    await idle(page);
                    edits[n].add = await editTemplateFields({name: `K1 added ${n.replace(/\W+/g, '')}`, subject: `K1 added subject ${A}`, body: 'K1 added body.'}, `x-03-add-${n.replace(/\W+/g, '')}`);
                    edits[n].rows = await windowRows(o.dlg);
                    await snap(`x-04-window-${n.replace(/\W+/g, '')}`);
                    await closeTop(new RegExp(`^${n.replace(/[()]/g, '\\$&')}$`));
                }
            }
            F('x-edits', edits);
            // the decision window
            const readDecision = async (label) => {
                await page.goto(ctx(A, `/dashboard/editorial?workflowSubmissionId=${S.S1.submissionId}`));
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
                const s = await snap(label);
                const comp = await page.evaluate(() => {
                    const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id));
                    const tpls = [...document.querySelectorAll('main [class*="composer__template"]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
                    const ed = (window.tinymce ? window.tinymce.get() : []).map((e) => e.getContent().slice(0, 300));
                    return {url: location.href, subject: i ? i.value : null, templates: [...new Set(tpls)], editors: ed};
                });
                return comp;
            };
            const dec1 = await readDecision('x-05-decision-edited');
            F('x-decision-edited', dec1);
            // Reset the default, Remove the added
            const undo = {};
            for (const n of declines) {
                await openManage(A);
                const o = await openEmail(n);
                if (o.kind !== 'multi') { await closeTop(/^Edit Template$/); continue; }
                const rowsBefore = await windowRows(o.dlg);
                const reset = o.dlg.getByRole('button', {name: 'Reset', exact: true}).first();
                const out = {rowsBefore: rowsBefore.items};
                if (await reset.count()) {
                    await reset.click();
                    const cd = page.getByRole('dialog', {name: 'Reset Template'});
                    await cd.waitFor({timeout: 10000});
                    out.resetConfirm = flat(await cd.innerText(), 400);
                    await snap(`x-06-reset-confirm-${n.replace(/\W+/g, '')}`);
                    await cd.getByRole('button', {name: 'Reset Template', exact: true}).click();
                    await cd.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                    await idle(page); await sleep(700);
                    out.rowsAfterReset = (await windowRows(o.dlg)).items;
                }
                const remove = o.dlg.getByRole('button', {name: 'Remove', exact: true}).first();
                if (await remove.count()) {
                    await remove.click();
                    const cd = page.getByRole('dialog', {name: 'Remove Template'});
                    await cd.waitFor({timeout: 10000});
                    out.removeConfirm = flat(await cd.innerText(), 400);
                    await snap(`x-07-remove-confirm-${n.replace(/\W+/g, '')}`);
                    await cd.getByRole('button', {name: 'Remove Template', exact: true}).click();
                    await cd.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                    await idle(page); await sleep(700);
                    out.rowsAfterRemove = (await windowRows(o.dlg)).items;
                }
                await snap(`x-08-window-after-undo-${n.replace(/\W+/g, '')}`);
                await closeTop(new RegExp(`^${n.replace(/[()]/g, '\\$&')}$`));
                await openManage(A);
                out.reread = await readDefault(n);
                undo[n] = out;
            }
            F('x-undo', undo);
            const dec2 = await readDecision('x-09-decision-after-undo');
            F('x-decision-after-undo', dec2);
            // the submission's Activity Log after the template saves, reset and remove
            await page.goto(ctx(A, `/dashboard/editorial?workflowSubmissionId=${S.S1.submissionId}`));
            await idle(page);
            const logBtn = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Activity Log/}).first();
            let activity = null;
            if (await logBtn.count()) {
                await logBtn.click();
                const lg = page.getByRole('dialog').filter({has: page.locator('.pkp_controllers_informationCenter')}).last();
                await lg.waitFor({timeout: 30000}).catch(() => {});
                await lg.locator('table tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                activity = flat(await lg.innerText().catch(() => ''), 1500);
                await snap('x-10-activity-log');
            }
            const msgs = await tagMessages();
            F('x-log-and-mail', {activity, messages: msgs});
            await signOut(page);
        }

        // ======================================================= sigall: which installed templates hold {$contextSignature} (Rule 2)
        if (on('sigall')) {
            const T = tag('u56k1s');
            await app.api.createContext({tag: T, users: [{username: `${T}mg`, givenName: 'Sig', familyName: 'Manager', email: `${T}mg@mail.test`, roles: ['manager']}]});
            await signIn(page, `${T}mg`, {contextPath: T});
            const names = await manageNames(T, 'a-01-list');
            const out = [];
            for (const n of names) {
                await openManage(T);
                const o = await openEmail(n);
                if (o.absent) { out.push({name: n, absent: true}); continue; }
                const tpls = o.kind === 'multi' ? (o.data && o.data.emailTemplates) || [] : [o.data];
                out.push({name: n, kind: o.kind, status: o.status, templates: tpls.filter(Boolean).map((t) => ({key: t.key, name: t.name && t.name.en, sig: /\{\$contextSignature\}/.test((t.body && t.body.en) || '')}))});
                await closeTop(o.kind === 'multi' ? new RegExp(`^${n.replace(/[()]/g, '\\$&')}$`) : /^Edit Template$/).catch(() => {});
            }
            F('a-sigall', {count: names.length, withSig: out.filter((x) => x.templates && x.templates.some((t) => t.sig)).map((x) => x.name), kinds: out.map((x) => `${x.name}:${x.kind}`), failed: out.filter((x) => x.absent || x.status !== 200).map((x) => x.name)});
            await signOut(page);
        }

        // ======================================================= lang: two form languages (Settings bullet 9)
        if (on('lang')) {
            await signIn(page, `${L}mg`, {contextPath: L});
            await openManage(L);
            const n = ops ? 'Submission Accepted' : 'Review Request';
            const o = await openEmail(n);
            const out = {kind: o.kind};
            if (o.kind === 'multi') {
                await o.dlg.getByRole('button', {name: 'Edit', exact: true}).first().click();
                await page.getByRole('dialog', {name: 'Edit Template'}).last().waitFor({timeout: 15000});
                await idle(page);
                await snap('l-01-edit-template');
                out.edit = await readTemplateWindow();
                await closeTop(/^Edit Template$/);
                await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
                await page.getByRole('dialog', {name: 'Edit Template'}).last().waitFor({timeout: 15000});
                await idle(page);
                await snap('l-02-add-template');
                out.add = await editTemplateFields({name: 'K1 English only', subject: 'K1 English subject', body: 'K1 English body.'}, 'l-03-add-saved');
                out.rowsAfterAdd = (await windowRows(o.dlg)).items;
                // empty the English subject of the default
                await o.dlg.getByRole('button', {name: 'Edit', exact: true}).first().click();
                const d = page.getByRole('dialog', {name: 'Edit Template'}).last();
                await d.waitFor({timeout: 15000});
                await idle(page);
                await d.locator('input[name="subject-en"]').fill('');
                await d.getByRole('button', {name: 'Save', exact: true}).click();
                await sleep(1500);
                await idle(page);
                await snap('l-04-empty-english-subject');
                out.emptied = await readTemplateWindow();
                out.emptiedStillOpen = await d.isVisible();
                await closeTop(/^Edit Template$/);
                await closeTop(new RegExp(`^${n}$`));
                await openManage(L);
                out.reread = await readDefault(n);
            }
            F('l-languages', out);
            await signOut(page);
        }

        // ======================================================= m404: a listed email whose template the install lacks (sweep of the Manage Emails page; read-only, seeded press)
        if (on('m404')) {
            await signIn(page, 'manager.maya', {contextPath: app.contextPath});
            await openManage(app.contextPath);
            const n = 'User Role Masthead Visibility Update Notification';
            const btn = page.locator('main').getByRole('button', {name: `Edit ${n}`, exact: true});
            const out = {listed: await btn.count()};
            if (out.listed) {
                const respP = page.waitForResponse((r) => /api\/v1\/(mailables|emailTemplates)\//.test(r.url()), {timeout: 20000}).catch(() => null);
                await btn.click();
                const r = await respP;
                out.response = r ? {status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), body: (await r.text().catch(() => '')).slice(0, 300)} : null;
                await sleep(1500);
                const s1 = await snap('m-01-after-edit');
                await sleep(5000);
                const s2 = await snap('m-02-after-edit-6s');
                out.dialogs = await page.getByRole('dialog').count();
                out.spinner = await page.locator('.app__fullScreenSpinner, [class*=fullScreenSpinner], [class*=spinner]:visible').count();
                out.notices = await pageBar();
                out.dialogText = s2.text.dialog;
                // does the page still respond: another row's Edit
                const ob = page.locator('main').getByRole('button', {name: 'Edit Submission Confirmation', exact: true});
                out.otherRowClick = await ob.click({timeout: 8000}).then(() => 'clicked').catch((e) => flat(String(e.message), 300));
                await sleep(1500);
                out.otherRowDialogs = await page.getByRole('dialog').allInnerTexts().then((a) => a.map((x) => flat(x, 150))).catch(() => null);
                await snap('m-03-other-row');
            }
            F('m-404', out);
            await signOut(page);
        }

        // ======================================================= roles: the tab as the other manager-level accounts (read-only)
        if (on('roles')) {
            const who = ops ? ['admin'] : [u('ed'), 'admin'];
            const out = {};
            for (const w of who) {
                await signIn(page, w, {contextPath: A});
                await openTab(A);
                const st = await tabState();
                await snap(`o-tab-${w === 'admin' ? 'admin' : 'ed'}`);
                out[w] = {radios: Object.fromEntries(Object.entries(st.radios).map(([k, v]) => [k, v.map((r) => r.label)])), texts: st.texts.map((x) => x.name), link: st.link, buttons: await panel().getByRole('button').allInnerTexts()};
                await signOut(page);
            }
            F('o-roles', out);
        }
    } finally {
        record('dialogs', dialogs);
        await close();
    }
});
