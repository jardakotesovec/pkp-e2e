// U56 claim check, chunk K4 — undoing and languages: Rules 16–18 (Reset, Remove,
// one-template emails, spec lines 295–312), Rule 20 (several languages, 321–328),
// Cross-feature interactions (407–443), register A5 and A6 (559–578).
// docs/specs/U56-emails-management.md
//
// Seeds its own scratch contexts per app (publicknowledge is only read):
//   R — manager mg, author au, principal contact "Rita Contact" <R ct@mail.test>:
//       Reset (Rule 16), Remove and the sending window (Rule 17, A5), one-template
//       emails and the API behind their missing reset (Rule 18, A6, note f-a6),
//       Reset All as the only way back, cross-feature reads.
//   L — English and French form languages, manager mg (Rule 20).
//   N — announcements on, manager mg, reader rd: the notification footer of a sent
//       announcement against the "New Announcement" template (Cross-feature, U05 bullet).
//
//   PROBE_FEATURE=U56 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U56/K4/k4.js
//   PHASES=reset,remove,cross,one,lang,langfr,composer,seeded,notify (default all)
//   REUSE=1 reuses the contexts of the last run (seed-<app>.json).
//
// No assertions: every screen is recorded with screen()/shot(); facts-<app>.json
// collects the structured reads; the console carries [app phase] lines.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL = 'reset,remove,cross,one,lang,langfr,composer,seeded,notify';
const PHASES = (process.env.PHASES || ALL).split(',');
const REUSE = process.env.REUSE === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const SELECT_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const BODY = 'editEmailTemplate-body-control-en';

forEachApp(async (app) => {
    const on = (p) => PHASES.includes(p);
    const ops = app.name === 'ops';
    const omp = app.name === 'omp';
    const seedFile = path.join(outDir(), `seed-${app.name}.json`);
    let S = REUSE && fs.existsSync(seedFile) ? JSON.parse(fs.readFileSync(seedFile, 'utf8')) : null;
    const person = (t, k, g, f, roles) => ({username: `${t}${k}`, givenName: g, familyName: f, email: `${t}${k}@mail.test`, roles});
    if (!S) {
        const R = tag('u56k4r');
        await app.api.createContext({tag: R, context: {contactName: 'Rita Contact', contactEmail: `${R}ct@mail.test`},
            users: [person(R, 'mg', 'Mona', 'Manager', ['manager']), person(R, 'au', 'Ada', 'Author', ['author'])]});
        const L = tag('u56k4l');
        await app.api.createContext({tag: L, context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [person(L, 'mg', 'Lena', 'Manager', ['manager'])]});
        const N = tag('u56k4n');
        await app.api.createContext({tag: N, enableAnnouncements: true,
            users: [person(N, 'mg', 'Nora', 'Manager', ['manager']), person(N, 'rd', 'Rudi', 'Reader', ['reader'])]});
        S = {R, L, N};
        fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));
    }
    const {R, L, N} = S;
    const saveSeed = () => fs.writeFileSync(seedFile, JSON.stringify(S, null, 2));
    const log = (k, v) => console.log(`[${app.name} ${k}]`, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 3000));
    const F = (k, v) => { record('facts', {[k]: v}, {merge: true}); log(k, v); };
    // the emails driven (OPS has no "Review Request" and no "Submission Confirmation")
    const W = ops ? 'Submission Accepted' : 'Review Request';
    const DEC = ops ? 'Submission Declined' : 'Submission Declined (Pre-Review)';
    const SGL = ops ? 'Submission Acknowledgement (Pending Moderation)' : 'Submission Confirmation';
    const PRC = 'Password Reset Confirm';
    const MASTHEAD = 'User Role Masthead Visibility Update Notification';

    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => { dialogs.push({type: d.type(), message: d.message(), url: page.url(), at: new Date().toISOString()}); log('browser-dialog', `${d.type()} ${d.message()}`); await d.accept().catch(() => {}); });
    const ctx = (t, p) => app.url(`/index.php/${t}${p}`);
    const snap = async (label, extra) => { const s = await screen(page); record(label, extra ? {...s, extra} : s); await shot(page, label).catch(() => {}); return s; };

    // ------------------------------------------------------ Manage Emails page helpers
    async function openManage(t) {
        await page.goto(ctx(t, '/management/settings/manageEmails'));
        await idle(page);
        await page.locator('main').getByRole('button', {name: /^Edit /}).first().waitFor({timeout: 30000});
    }
    const rowNames = () => page.evaluate(() => [...document.querySelectorAll('.manageEmails__listPanel .listPanel__item .listPanel__itemTitle')].map((e) => e.innerText.trim()));
    const emailDlg = (name) => page.getByRole('dialog', {name, exact: true}).last();
    const tplDlg = () => page.getByRole('dialog', {name: 'Edit Template'}).last();
    async function closeDlg(d) {
        await d.getByRole('button', {name: 'Close', exact: true}).first().click();
        await d.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        await sleep(700); // the modal store's 450 ms slot
    }
    const waitBody = (id = BODY) => page.waitForFunction((i) => window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized, id, {timeout: 15000}).catch(() => {});
    async function openEmail(name) {
        const btn = page.locator('main').getByRole('button', {name: `Edit ${name}`, exact: true});
        if (!(await btn.count())) return {absent: true};
        const respP = page.waitForResponse((r) => /api\/v1\/(mailables|emailTemplates)\//.test(r.url()) && r.request().method() === 'GET', {timeout: 20000}).catch(() => null);
        await btn.click();
        const r = await respP;
        const data = r && r.ok() ? await r.json().catch(() => null) : null;
        const kind = r && /mailables/.test(r.url()) ? 'multi' : 'single';
        const url = r && r.url().replace(/^.*api\/v1\//, '');
        if (r && !r.ok()) return {kind, status: r.status(), url, failed: true};
        const dlg = kind === 'multi' ? emailDlg(name) : tplDlg();
        await dlg.waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        if (kind === 'single') await waitBody();
        return {kind, data, url, dlg};
    }
    // the rows of an email's window: name, badge, buttons
    const windowRows = (dlg) => dlg.evaluate((d) => [...d.querySelectorAll('.listPanel__item')].map((li) => ({
        name: (li.querySelector('.listPanel__itemSubtitle') || li).innerText.replace(/\s+/g, ' ').trim(),
        badge: (li.querySelector('.pkpBadge') || {}).innerText?.trim() || null,
        buttons: [...li.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
    })));
    const row = (dlg, name) => dlg.locator('.listPanel__item').filter({has: page.locator('.listPanel__itemSubtitle', {hasText: name})}).first();
    async function readTemplateWindow() {
        const d = tplDlg();
        return d.evaluate((el) => {
            const vis = (e) => !!e.getClientRects().length;
            return {
                inputs: [...el.querySelectorAll('input, textarea')].filter((e) => e.type !== 'submit' && e.type !== 'hidden').map((e) => ({name: e.name, value: (e.value || '').slice(0, 300), visible: vis(e)})),
                bodies: (window.tinymce ? window.tinymce.get() : []).filter((e) => /editEmailTemplate-body/.test(e.id)).map((e) => ({id: e.id, content: e.getContent().slice(0, 3000), visible: vis(e.getContainer())})),
                buttons: [...el.querySelectorAll('button, a')].filter(vis).map((b) => (b.innerText.trim() || b.getAttribute('aria-label') || '').replace(/\s+/g, ' ')).filter(Boolean),
                errors: [...el.querySelectorAll('.pkpFieldError, .pkpFormErrors, [class*=FormErrors]')].filter(vis).map((e) => e.innerText.trim()).filter(Boolean),
                localeCounts: [...el.querySelectorAll('.pkpFormField__localeCount, [class*=localeCount], [class*=LocaleCount]')].filter(vis).map((e) => e.innerText.trim()),
                labels: [...el.querySelectorAll('label, .pkpFormFieldLabel')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()),
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
    async function saveTemplate(label) {
        const d = tplDlg();
        const respP = page.waitForResponse((r) => /api\/v1\/emailTemplates/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000})
            .then(async (r) => {
                const t = await r.text().catch(() => '');
                let saved = null;
                try { const j = JSON.parse(t); saved = j && j.subject ? {name: j.name, subject: j.subject} : null; } catch (e) { /* not JSON */ }
                return {status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), override: r.request().headers()['x-http-method-override'] || null, body: t.slice(0, 600), saved};
            }).catch(() => null);
        await d.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await respP;
        const closed = await d.waitFor({state: 'hidden', timeout: 8000}).then(() => true).catch(() => false);
        await sleep(700);
        await idle(page);
        let w = null;
        if (!closed) w = await readTemplateWindow().catch(() => null);
        await snap(label, {resp, closed});
        return {resp, closed, errors: w && w.errors, text: w && flat(w.text, 900)};
    }
    // a confirmation dialog: title, text, buttons with their colours, whether the subject markup rendered
    async function readConfirm(title) {
        const c = page.getByRole('dialog', {name: title}).last();
        await c.waitFor({timeout: 10000});
        await sleep(300);
        return c.evaluate((d) => ({
            text: d.innerText,
            html: (d.querySelector('p, .pkpDialog__message, [class*=message]') || d).innerHTML.slice(0, 600),
            buttons: [...d.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.innerText || b.getAttribute('aria-label') || '').trim(), color: getComputedStyle(b).color, bg: getComputedStyle(b).backgroundColor})),
        }));
    }
    const confirmDlg = (title) => page.getByRole('dialog', {name: title}).last();

    async function phase(name, fn) {
        if (!on(name)) return;
        try { await fn(); } catch (e) {
            log('ERROR ' + name, String(e.stack || e).split('\n').slice(0, 6).join(' | '));
            await snap('zz-error-' + name).catch(() => {});
            await signOut(page).catch(() => {});
        }
    }
    try {
        // ======================================================= reset: Rule 16 (note q) on R as its manager
        await phase('reset', async () => {
            await signIn(page, `${R}mg`, {contextPath: R});
            const out = {};
            await openManage(R);
            let o = await openEmail(W);
            out.untouched = await windowRows(o.dlg);
            await snap('r-01-window-untouched');
            await loc(page, 'email window: the default row', row(o.dlg, W));
            // the installed default
            await row(o.dlg, W).getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const inst = await readTemplateWindow();
            out.installed = {name: inst.inputs.find((i) => i.name === 'name-en')?.value, subject: inst.inputs.find((i) => i.name === 'subject-en')?.value, body: (await editorContent()).slice(0, 400)};
            // change name, subject and body; Save
            await tplDlg().locator('input[name="name-en"]').fill(`K4 renamed ${R}`.slice(0, 60));
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 edited subject ${R}`);
            await typeRich(BODY, 'K4 edited body.');
            out.save = await saveTemplate('r-02-default-saved');
            out.rowsAtOnce = await windowRows(o.dlg);
            await snap('r-03-window-after-save');
            await closeDlg(o.dlg);
            // reload read
            await openManage(R);
            o = await openEmail(W);
            out.rowsAfterReload = await windowRows(o.dlg);
            const newName = `K4 renamed ${R}`.slice(0, 60);
            await loc(page, 'email window: the default row\'s "Reset"', row(o.dlg, newName).getByRole('button', {name: 'Reset', exact: true}));
            // Reset → Cancel
            await row(o.dlg, newName).getByRole('button', {name: 'Reset', exact: true}).click();
            out.confirm = await readConfirm('Reset Template');
            await snap('r-04-reset-confirmation');
            await loc(page, 'Reset Template confirmation', confirmDlg('Reset Template'));
            await confirmDlg('Reset Template').getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(900); await idle(page);
            out.afterCancelAtOnce = {confirmOpen: await confirmDlg('Reset Template').isVisible().catch(() => false), rows: await windowRows(o.dlg)};
            await snap('r-05-after-cancel');
            await closeDlg(o.dlg);
            await openManage(R);
            o = await openEmail(W);
            out.afterCancelReload = await windowRows(o.dlg);
            // Escape on the confirmation (sweep)
            await row(o.dlg, newName).getByRole('button', {name: 'Reset', exact: true}).click();
            await confirmDlg('Reset Template').waitFor({timeout: 10000});
            await page.keyboard.press('Escape');
            await sleep(900); await idle(page);
            out.afterEscape = {confirmOpen: await confirmDlg('Reset Template').isVisible().catch(() => false), windowOpen: await o.dlg.isVisible().catch(() => false), rows: await windowRows(o.dlg).catch(() => null)};
            await snap('r-06-after-escape');
            if (!out.afterEscape.windowOpen) { await openManage(R); o = await openEmail(W); } else await sleep(700);
            // Reset → confirm
            const delP = page.waitForResponse((r) => /api\/v1\/emailTemplates\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).then((r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), override: r.request().headers()['x-http-method-override'] || null})).catch(() => null);
            const getP = page.waitForResponse((r) => /api\/v1\/emailTemplates\//.test(r.url()) && r.request().method() === 'GET', {timeout: 15000}).then((r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, '')})).catch(() => null);
            await row(o.dlg, newName).getByRole('button', {name: 'Reset', exact: true}).click();
            await confirmDlg('Reset Template').getByRole('button', {name: 'Reset Template', exact: true}).click();
            out.resetTraffic = {del: await delP, get: await getP};
            await sleep(900); await idle(page);
            out.afterResetAtOnce = {confirmOpen: await confirmDlg('Reset Template').isVisible().catch(() => false), rows: await windowRows(o.dlg)};
            await snap('r-07-after-reset');
            // reopen the default on the same page
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const re1 = await readTemplateWindow();
            out.reopenedAtOnce = {name: re1.inputs.find((i) => i.name === 'name-en')?.value, subject: re1.inputs.find((i) => i.name === 'subject-en')?.value, body: (await editorContent()).slice(0, 400)};
            await snap('r-08-reopened-after-reset');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            // after reload
            await openManage(R);
            o = await openEmail(W);
            out.afterResetReload = await windowRows(o.dlg);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const re2 = await readTemplateWindow();
            out.reopenedAfterReload = {name: re2.inputs.find((i) => i.name === 'name-en')?.value, subject: re2.inputs.find((i) => i.name === 'subject-en')?.value, body: (await editorContent()).slice(0, 400), buttons: re2.buttons};
            await snap('r-09-reopened-after-reload');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            F('reset', out);
            await signOut(page);
        });

        // ======================================================= remove: Rule 17, A5 (note r) on R, with the sending window
        await phase('remove', async () => {
            if (!S.S1) {
                S.S1 = await app.api.createSubmission({tag: `${R}s1`, context: R, submitter: `${R}au`, title: `K4 submission ${R}`, participants: [{username: `${R}mg`, role: 'manager'}]});
                saveSeed();
            }
            await signIn(page, `${R}mg`, {contextPath: R});
            const out = {};
            const alpha = `Alpha ${R}`.slice(0, 40);
            const beta = `Beta ${R}`;
            const gamma = `Gamma ${R}`.slice(0, 40);
            const gammaSubject = 'Delta {$contextName} <u>k4</u>';
            await openManage(R);
            let o = await openEmail(DEC);
            out.untouched = await windowRows(o.dlg);
            for (const [n, s, b] of [[alpha, beta, 'K4 alpha body.'], [gamma, gammaSubject, 'K4 gamma body.']]) {
                await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
                await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                await tplDlg().locator('input[name="name-en"]').fill(n);
                await tplDlg().locator('input[name="subject-en"]').fill(s);
                await typeRich(BODY, b);
                out[`add-${n === alpha ? 'alpha' : 'gamma'}`] = await saveTemplate(`m-01-added-${n === alpha ? 'alpha' : 'gamma'}`);
            }
            out.rowsAfterAdd = await windowRows(o.dlg);
            await snap('m-02-window-with-added');
            await closeDlg(o.dlg);
            // the sending window lists them (positive control)
            const openDecline = async (label) => {
                await page.goto(ctx(R, `/dashboard/editorial?workflowSubmissionId=${S.S1.submissionId}`));
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
                await page.locator('.composer__templates').first().waitFor({timeout: 20000}).catch(() => {});
                await sleep(800);
                await snap(label);
                const read = await page.evaluate(() => ({
                    url: location.href,
                    heading: (document.querySelector('.composer__templates__heading') || {}).innerText?.trim() || null,
                    searchLabel: [...document.querySelectorAll('.composer__templates__search input, .composer__templates__search label')].map((e) => e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.innerText).filter(Boolean),
                    templates: [...document.querySelectorAll('.composer__template__name')].map((e) => e.innerText.trim()),
                }));
                return read;
            };
            const findTemplate = async (phrase, label) => {
                const box = page.locator('.composer__templates__search input').first();
                if (!(await box.count())) return {noBox: true};
                const respP = page.waitForResponse((r) => /api\/v1\/emailTemplates\?/.test(r.url()) || (/api\/v1\/emailTemplates/.test(r.url()) && /searchPhrase/.test(r.url())), {timeout: 15000}).then((r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, '')})).catch(() => null);
                await box.fill(phrase);
                await box.press('Enter');
                const resp = await respP;
                await page.locator('.composer__templates__searching').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await sleep(600);
                await snap(label);
                const res = await page.evaluate(() => [...document.querySelectorAll('.composer__template__name')].map((e) => e.innerText.trim()));
                return {resp, results: res};
            };
            out.decisionBefore = await openDecline('m-03-decision-before-remove');
            out.findBefore = await findTemplate('Alpha', 'm-04-find-alpha-before');
            await loc(page, 'decision page: the templates list', page.locator('.composer__templates__list'));
            await loc(page, 'decision page: Find Template box', page.locator('.composer__templates__search input'));
            // Remove → Cancel
            await openManage(R);
            o = await openEmail(DEC);
            await loc(page, 'email window: an added row\'s "Remove"', row(o.dlg, alpha).getByRole('button', {name: 'Remove', exact: true}));
            await row(o.dlg, alpha).getByRole('button', {name: 'Remove', exact: true}).click();
            out.confirm = await readConfirm('Remove Template');
            await snap('m-05-remove-confirmation');
            await confirmDlg('Remove Template').getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(900); await idle(page);
            out.afterCancel = {confirmOpen: await confirmDlg('Remove Template').isVisible().catch(() => false), rows: await windowRows(o.dlg)};
            // the markup subject's confirmation
            await sleep(300);
            await row(o.dlg, gamma).getByRole('button', {name: 'Remove', exact: true}).click();
            out.confirmGamma = await readConfirm('Remove Template');
            await snap('m-06-remove-confirmation-markup-subject');
            await confirmDlg('Remove Template').getByRole('button', {name: 'Cancel', exact: true}).click();
            await sleep(900);
            await closeDlg(o.dlg);
            await openManage(R);
            o = await openEmail(DEC);
            out.afterCancelReload = await windowRows(o.dlg);
            // Remove → confirm
            const delP = page.waitForResponse((r) => /api\/v1\/emailTemplates\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).then((r) => ({status: r.status(), url: r.url().replace(/^.*api\/v1\//, ''), override: r.request().headers()['x-http-method-override'] || null})).catch(() => null);
            await row(o.dlg, alpha).getByRole('button', {name: 'Remove', exact: true}).click();
            await confirmDlg('Remove Template').getByRole('button', {name: 'Remove Template', exact: true}).click();
            out.removeTraffic = await delP;
            await sleep(900); await idle(page);
            out.afterRemoveAtOnce = {confirmOpen: await confirmDlg('Remove Template').isVisible().catch(() => false), rows: await windowRows(o.dlg)};
            await snap('m-07-after-remove');
            await closeDlg(o.dlg);
            await openManage(R);
            o = await openEmail(DEC);
            out.afterRemoveReload = await windowRows(o.dlg);
            await snap('m-08-after-remove-reload');
            // the default row: never "Remove", untouched or edited
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 DEC edited ${R}`);
            out.defaultSave = await saveTemplate('m-09-default-edited');
            out.defaultRowEdited = await windowRows(o.dlg);
            await closeDlg(o.dlg);
            out.decisionAfter = await openDecline('m-10-decision-after-remove');
            out.findAfter = await findTemplate('Alpha', 'm-11-find-alpha-after');
            out.findGamma = await findTemplate('Gamma', 'm-12-find-gamma-after');
            F('remove', out);
            await signOut(page);
        });

        // ======================================================= cross: Cross-feature interactions (409–442)
        await phase('cross', async () => {
            await signIn(page, `${R}mg`, {contextPath: R});
            const out = {};
            // the "Emails" tab: "Notify Primary Contact" names the principal contact
            await page.goto(ctx(R, '/management/settings/workflow'));
            await idle(page);
            out.workflowTabs = await page.locator('main').getByRole('tab').allInnerTexts();
            await page.locator('#emails-button').click();
            await idle(page);
            await page.locator('#emails').waitFor({timeout: 15000});
            await sleep(500);
            await snap('x-01-emails-tab');
            out.primaryContact = await page.locator('#emails').evaluate((p) => [...p.querySelectorAll('fieldset, .pkpFormField')].map((f) => f.innerText.replace(/\s+/g, ' ').trim()).filter((t) => /Primary Contact/.test(t)).slice(0, 2));
            // Settings › Workflow › "Tasks and Discussions"
            const td = page.locator('main').getByRole('tab', {name: 'Tasks and Discussions', exact: true});
            out.tasksTab = await td.count();
            if (out.tasksTab) {
                await td.click(); await idle(page); await sleep(800);
                await snap('x-02-tasks-and-discussions');
                out.tasksText = flat(await page.locator('main [role=tabpanel]:visible').first().innerText().catch(() => ''), 1500);
            }
            // the list: the emails the named features send, and what it lacks
            await openManage(R);
            const names = await rowNames();
            out.count = names.length;
            out.names = names;
            await snap('x-03-list');
            const want = ['Request Author Review Response', 'Submission Moved to Copyediting', 'Sent to Production', 'New Announcement', 'Validate Email (Journal Registration)', 'Validate Email (Press Registration)', 'Validate Email (Server Registration)', 'User Created', 'Statistics Report Notification', 'Submission Confirmation', 'Submission Confirmation (Other Authors)', 'Change Email Address Invitation', 'User Invited to Role Notification', 'orcidCollectAuthorId', 'Subscription Notify', 'Payment Request', 'Request Copyedit', 'Ready for Production', 'Manual Payment Notify', 'Review Cancel', 'Reviewer Unassign'];
            out.present = Object.fromEntries(want.map((w) => [w, names.includes(w)]));
            // search the list for a discussion template's name and the manual payment email
            const box = page.locator('main input[type=search]').first();
            for (const q of ['Request Copyedit', 'Manual', 'footer']) {
                await box.fill(q); await box.press('Enter'); await idle(page); await sleep(700);
                out[`search:${q}`] = await rowNames();
            }
            await box.fill(''); await box.press('Enter'); await idle(page); await sleep(500);
            // the "{$journalName}" texts (U34 OMP1, U27 OMP3): "Review Cancel" and "Reviewer Unassign"
            for (const n of ['Review Cancel', 'Reviewer Unassign']) {
                await openManage(R);
                const o = await openEmail(n);
                if (o.absent) { out[n] = {absent: true}; continue; }
                const k = n.replace(/\W+/g, '');
                let body; let subject;
                if (o.kind === 'multi') {
                    await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
                    await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                }
                body = await editorContent();
                subject = await tplDlg().locator('input[name="subject-en"]').inputValue().catch(() => null);
                // Insert Content: is {$journalName} offered?
                await tplDlg().getByRole('button', {name: 'Insert Content'}).first().click();
                const ic = page.getByRole('dialog', {name: 'Insert Content'}).last();
                await ic.waitFor({timeout: 15000}).catch(() => {});
                await idle(page);
                const vars = await ic.locator('li').evaluateAll((lis) => lis.map((li) => (li.querySelector('.insertContent__item__value') || li).innerText.trim().split('\n')[0]));
                await snap(`x-04-${k}-insert-content`);
                await closeDlg(ic);
                out[n] = {kind: o.kind, subject, journalNameInBody: /\{\$journalName\}/.test(body || ''), contextNameInBody: /\{\$contextName\}/.test(body || ''), body: (body || '').slice(0, 700), journalNameOffered: vars.includes('{$journalName}'), contextNameOffered: vars.includes('{$contextName}')};
                await closeDlg(tplDlg());
                if (o.kind === 'multi') await closeDlg(o.dlg);
            }
            // the user's own "Signature" (U03): the profile
            await page.goto(ctx(R, '/user/profile'));
            await idle(page);
            await snap('x-05-profile');
            out.profileTabs = await page.locator('main').getByRole('tab').allInnerTexts().catch(() => []);
            const contact = page.locator('main').getByRole('tab', {name: 'Contact', exact: true});
            if (await contact.count()) { await contact.click(); await idle(page); await sleep(800); }
            await snap('x-06-profile-contact');
            out.profileSignature = await page.locator('main').evaluate((m) => [...m.querySelectorAll('label, .pkpFormFieldLabel, legend')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim()).filter((t) => /Signature/i.test(t)));
            F('cross', out);
            await signOut(page);
        });

        // ======================================================= one: Rule 18, A6, note f-a6 on R (ends with Reset All)
        await phase('one', async () => {
            await signIn(page, `${R}mg`, {contextPath: R});
            const out = {};
            // the one-template window, untouched
            for (const [n, lab] of [[SGL, 'sgl'], [PRC, 'prc']]) {
                await openManage(R);
                const o = await openEmail(n);
                if (o.absent || o.failed) { out[`${lab}Untouched`] = o; continue; }
                const w = await readTemplateWindow();
                out[`${lab}Untouched`] = {kind: o.kind, url: o.url, key: o.data && o.data.key, id: o.data && o.data.id, buttons: w.buttons, subject: w.inputs.find((i) => i.name === 'subject-en')?.value};
                await snap(`o-01-${lab}-untouched`);
                await closeDlg(tplDlg());
            }
            await loc(page, 'one-template Edit Template: the Close button', tplDlg().getByRole('button', {name: 'Close', exact: true}));
            // edit SGL's subject, Save, reopen: every button
            await openManage(R);
            let o = await openEmail(SGL);
            const key = o.data && o.data.key;
            out.sglKey = key;
            const installed = await tplDlg().locator('input[name="subject-en"]').inputValue();
            out.sglInstalledSubject = installed;
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 one edited ${R}`);
            out.sglSave = await saveTemplate('o-02-sgl-saved');
            await openManage(R);
            o = await openEmail(SGL);
            const w2 = await readTemplateWindow();
            out.sglEdited = {url: o.url, id: o.data && o.data.id, buttons: w2.buttons, subject: w2.inputs.find((i) => i.name === 'subject-en')?.value};
            await snap('o-03-sgl-reopened-edited');
            await closeDlg(tplDlg());
            // the multi-template email's own "Edit Template" window: same buttons?
            await openManage(R);
            o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.multiTemplateWindowButtons = (await readTemplateWindow()).buttons;
            await snap('o-04-multi-edit-template');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            // "automatic emails": every row under Sent From › System, and its kind
            await openManage(R);
            const sys = page.locator('.pkpFilter__label, button.pkpFilter').filter({hasText: /^\s*System\s*$/}).first();
            out.systemFilter = await sys.count();
            if (out.systemFilter) {
                await sys.click(); await idle(page); await sleep(700);
                const sysNames = await rowNames();
                await snap('o-05-system-filter');
                out.system = {};
                for (const n of sysNames) {
                    if (omp && n === MASTHEAD) { out.system[n] = 'skipped (OMP 404 row, screen-notes)'; continue; }
                    await openManage(R);
                    const e = await openEmail(n);
                    out.system[n] = e.absent ? 'absent' : e.failed ? `failed ${e.status}` : e.kind;
                    if (e.dlg) await closeDlg(e.dlg);
                }
            }
            // note f-a6: the API behind the missing reset, as the manager, on the edited SGL
            await openManage(R);
            const api = async (method, k) => page.evaluate(async ([m, url]) => {
                const r = await fetch(url, {method: 'POST', headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'X-Http-Method-Override': m, 'Content-Type': 'application/json'}});
                return {status: r.status, body: (await r.text()).slice(0, 400)};
            }, [method, ctx(R, `/api/v1/emailTemplates/${k}`)]);
            out.apiDeleteEdited = key ? await api('DELETE', key) : 'no key';
            o = await openEmail(SGL);
            out.afterApiDeleteAtOnce = {id: o.data && o.data.id, subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            await closeDlg(tplDlg());
            await openManage(R);
            o = await openEmail(SGL);
            out.afterApiDeleteReload = {id: o.data && o.data.id, subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            await snap('o-06-sgl-after-api-delete');
            await closeDlg(tplDlg());
            out.apiDeleteUntouched = key ? await api('DELETE', key) : 'no key';
            // Rule 18: edit SGL again, edit W's default and add a template to it, then Reset All
            await openManage(R);
            o = await openEmail(SGL);
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 one edited again ${R}`);
            out.sglSave2 = await saveTemplate('o-07-sgl-saved-again');
            await openManage(R);
            o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.wInstalledSubject = await tplDlg().locator('input[name="subject-en"]').inputValue();
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 W edited ${R}`);
            out.wSave = await saveTemplate('o-08-w-saved');
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            await tplDlg().locator('input[name="name-en"]').fill('K4 extra');
            await tplDlg().locator('input[name="subject-en"]').fill('K4 extra subject');
            await typeRich(BODY, 'K4 extra body.');
            out.wAdd = await saveTemplate('o-09-w-added');
            out.wRowsBefore = await windowRows(o.dlg);
            await closeDlg(o.dlg);
            // Reset All → confirm
            await openManage(R);
            const countBefore = (await rowNames()).length;
            await page.getByRole('button', {name: 'Reset All', exact: true}).click();
            await confirmDlg('Reset All').waitFor({timeout: 10000});
            await snap('o-10-reset-all-confirmation');
            const nav = page.waitForNavigation({timeout: 20000}).then(() => true).catch(() => false);
            await confirmDlg('Reset All').getByRole('button', {name: 'Reset All', exact: true}).click();
            out.resetAllReloaded = await nav;
            await idle(page);
            await page.locator('main').getByRole('button', {name: /^Edit /}).first().waitFor({timeout: 30000});
            out.countAfter = [countBefore, (await rowNames()).length];
            await snap('o-11-after-reset-all');
            o = await openEmail(SGL);
            out.sglAfterResetAll = {id: o.data && o.data.id, subject: await tplDlg().locator('input[name="subject-en"]').inputValue()};
            await closeDlg(tplDlg());
            o = await openEmail(W);
            out.wRowsAfterResetAll = await windowRows(o.dlg);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.wSubjectAfterResetAll = await tplDlg().locator('input[name="subject-en"]').inputValue();
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            o = await openEmail(DEC);
            out.decRowsAfterResetAll = await windowRows(o.dlg);
            await closeDlg(o.dlg);
            F('one', out);
            await signOut(page);
        });

        // ======================================================= lang: Rule 20 (note u) on L
        await phase('lang', async () => {
            await signIn(page, `${L}mg`, {contextPath: L});
            const out = {};
            const pick = (w) => ({inputs: w.inputs.map((i) => `${i.name}${i.visible ? '' : '(hidden)'}=${i.value.slice(0, 60)}`), bodies: w.bodies.map((b) => `${b.id}${b.visible ? '' : '(hidden)'}:${b.content.replace(/<[^>]+>/g, '').slice(0, 60)}`), counts: w.localeCounts, labels: w.labels, errors: w.errors});
            await openManage(L);
            let o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            let w = await readTemplateWindow();
            out.defaultWindow = {...pick(w), buttons: w.buttons.filter((b) => !/^(Bold|Italic|Superscript|Subscript|Insert\/edit link|Blockquote|Bullet list|Numbered list)$/.test(b))};
            await snap('l-01-default-two-languages');
            const switchBtn = tplDlg().locator('.pkpFormLocales button, [class*=formLocales] button');
            out.switchButtons = await switchBtn.allInnerTexts().catch(() => []);
            await loc(page, 'Edit Template: the language switch buttons', switchBtn);
            // press "French": which fields show
            const fr = tplDlg().getByRole('button', {name: 'French', exact: true});
            if (await fr.count()) {
                await fr.click(); await sleep(600);
                w = await readTemplateWindow();
                out.afterFrench = pick(w);
                out.switchAfterFrench = await switchBtn.allInnerTexts().catch(() => []);
                await snap('l-02-french-shown');
                // sweep: type into the French subject, switch back, close without saving; reopen
                await tplDlg().locator('input[name="subject-fr_CA"]').fill('K4 sujet non enregistré');
                const en = tplDlg().getByRole('button', {name: /English|Hide/}).first();
                out.hideButton = await tplDlg().locator('.pkpFormLocales button').allInnerTexts().catch(() => []);
                if (await en.count()) { await en.click(); await sleep(500); }
                out.afterSwitchBack = pick(await readTemplateWindow());
                await closeDlg(tplDlg());
                await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
                await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                out.reopenedAfterUnsaved = pick(await readTemplateWindow());
                await snap('l-03-reopened-after-unsaved');
            }
            await closeDlg(tplDlg());
            // a new template with the English fields only
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.addWindow = pick(await readTemplateWindow());
            await tplDlg().locator('input[name="name-en"]').fill('K4 English only');
            await tplDlg().locator('input[name="subject-en"]').fill('K4 English subject');
            await typeRich(BODY, 'K4 English body.');
            out.addEnglishOnly = await saveTemplate('l-04-add-english-only');
            out.rowsAfterAdd = await windowRows(o.dlg);
            // a new template with the French fields only
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            if (await tplDlg().getByRole('button', {name: 'French', exact: true}).count()) { await tplDlg().getByRole('button', {name: 'French', exact: true}).click(); await sleep(500); }
            await tplDlg().locator('input[name="name-fr_CA"]').fill('K4 nom');
            await tplDlg().locator('input[name="subject-fr_CA"]').fill('K4 sujet');
            await waitBody('editEmailTemplate-body-control-fr_CA');
            await typeRich('editEmailTemplate-body-control-fr_CA', 'K4 corps.');
            out.addFrenchOnly = await saveTemplate('l-05-add-french-only');
            if (!out.addFrenchOnly.closed) { out.addFrenchOnlyWindow = pick(await readTemplateWindow()); await closeDlg(tplDlg()); }
            // a new template with nothing (the other end: the empty form's messages)
            await o.dlg.getByRole('button', {name: 'Add Template', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.addEmpty = await saveTemplate('l-06-add-empty');
            if (!out.addEmpty.closed) { out.addEmptyWindow = pick(await readTemplateWindow()); await closeDlg(tplDlg()); }
            // an existing template: empty the English subject
            await row(o.dlg, 'K4 English only').getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            await tplDlg().locator('input[name="subject-en"]').fill('');
            out.emptyEnglishSubject = await saveTemplate('l-07-empty-english-subject');
            if (!out.emptyEnglishSubject.closed) { out.emptyEnglishWindow = pick(await readTemplateWindow()); await closeDlg(tplDlg()); }
            // the default: empty the French subject (other language may stay empty)
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            if (await tplDlg().getByRole('button', {name: 'French', exact: true}).count()) { await tplDlg().getByRole('button', {name: 'French', exact: true}).click(); await sleep(500); }
            out.frenchSubjectBefore = await tplDlg().locator('input[name="subject-fr_CA"]').inputValue().catch(() => null);
            await tplDlg().locator('input[name="subject-fr_CA"]').fill('');
            out.emptyFrenchSubject = await saveTemplate('l-08-empty-french-subject');
            if (!out.emptyFrenchSubject.closed) { out.emptyFrenchWindow = pick(await readTemplateWindow()); await closeDlg(tplDlg()); }
            out.rowsNow = await windowRows(o.dlg);
            await closeDlg(o.dlg);
            // after reload: rows and the default's French subject
            await openManage(L);
            o = await openEmail(W);
            out.dataAfterReload = (o.data && o.data.emailTemplates || []).map((x) => ({key: x.key, id: x.id, name: x.name, subject: x.subject}));
            out.rowsAfterReload = await windowRows(o.dlg);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            out.defaultAfterReload = pick(await readTemplateWindow());
            await snap('l-09-default-after-reload');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            // a one-template email on L: the switch there too
            o = await openEmail(SGL);
            out.sglWindow = pick(await readTemplateWindow());
            out.sglSwitch = await tplDlg().locator('.pkpFormLocales button').allInnerTexts().catch(() => []);
            await snap('l-10-one-template-two-languages');
            await closeDlg(tplDlg());
            F('lang', out);
            await signOut(page);
            // the one-language end on R: no switch, one text, "This field is required."
            await signIn(page, `${R}mg`, {contextPath: R});
            await openManage(R);
            o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const one = {window: pick(await readTemplateWindow()), switch: await tplDlg().locator('.pkpFormLocales button').allInnerTexts().catch(() => [])};
            await tplDlg().locator('input[name="subject-en"]').fill('');
            one.emptySubject = await saveTemplate('l-11-one-language-empty-subject');
            if (!one.emptySubject.closed) { one.emptyWindow = pick(await readTemplateWindow()); await closeDlg(tplDlg()); }
            await closeDlg(o.dlg);
            F('lang-one', one);
            await signOut(page);
        });

        // ======================================================= langfr: an emptied second-language field (Rule 20), default vs added, on L
        await phase('langfr', async () => {
            await signIn(page, `${L}mg`, {contextPath: L});
            const out = {};
            const frSubject = () => tplDlg().locator('input[name="subject-fr_CA"]');
            const showFrench = async () => { const b = tplDlg().getByRole('button', {name: 'French', exact: true}); if (await b.count() && !(await frSubject().isVisible().catch(() => false))) { await b.click(); await sleep(500); } };
            const savePayload = async (label) => {
                const reqP = page.waitForRequest((r) => /api\/v1\/emailTemplates/.test(r.url()) && r.method() !== 'GET', {timeout: 15000}).then((r) => { try { const j = JSON.parse(r.postData() || '{}'); return {subject: j.subject, name: j.name}; } catch (e) { return (r.postData() || '').slice(0, 400); } }).catch(() => null);
                const res = await saveTemplate(label);
                return {sent: await reqP, answered: res.resp && res.resp.saved, status: res.resp && res.resp.status, closed: res.closed};
            };
            const openRow = async (o, name) => {
                await (name ? row(o.dlg, name) : o.dlg.locator('.listPanel__item').first()).getByRole('button', {name: 'Edit', exact: true}).click();
                await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
                await showFrench();
            };
            for (const [lab, name, fill] of [['default', null, null], ['added', 'K4 English only', 'K4 sujet ajouté']]) {
                await openManage(L);
                let o = await openEmail(W);
                await openRow(o, name);
                if (fill) { await frSubject().fill(fill); out[`${lab}-filled`] = await savePayload(`f-01-${lab}-french-filled`); await openRow(o, name); }
                out[`${lab}-before`] = await frSubject().inputValue();
                await frSubject().fill('');
                out[`${lab}-emptied`] = await savePayload(`f-02-${lab}-french-emptied`);
                await openRow(o, name);
                out[`${lab}-reopenedAtOnce`] = await frSubject().inputValue();
                await snap(`f-03-${lab}-reopened`);
                await closeDlg(tplDlg());
                await closeDlg(o.dlg);
                await openManage(L);
                o = await openEmail(W);
                await openRow(o, name);
                out[`${lab}-afterReload`] = await frSubject().inputValue();
                await snap(`f-04-${lab}-after-reload`);
                await closeDlg(tplDlg());
                await closeDlg(o.dlg);
            }
            F('langfr', out);
            await signOut(page);
        });

        // ======================================================= composer: the decision page opens with an edited default (Cross-feature, U34 bullet); the language button pressed twice (Rule 20)
        await phase('composer', async () => {
            await signIn(page, `${R}mg`, {contextPath: R});
            const out = {};
            await openManage(R);
            let o = await openEmail(DEC);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            await tplDlg().locator('input[name="subject-en"]').fill(`K4 composer subject ${R}`);
            out.save = (await saveTemplate('c-01-dec-edited')).resp?.status;
            await closeDlg(o.dlg);
            await page.goto(ctx(R, `/dashboard/editorial?workflowSubmissionId=${S.S1.submissionId}`));
            await idle(page);
            const wf = page.locator('[role="dialog"]:visible').first();
            await wf.waitFor({timeout: 30000});
            await wf.getByRole('button', {name: 'Decline Submission', exact: true}).first().click();
            await page.waitForURL(/decision\/record/, {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => { const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id)); return i && i.value.length > 0; }, null, {timeout: 20000}).catch(() => {});
            await sleep(500);
            await snap('c-02-decision-edited-default');
            out.composer = await page.evaluate(() => { const i = [...document.querySelectorAll('main input')].find((x) => /subject/i.test(x.name || x.id)); return {subject: i ? i.value : null, templates: [...document.querySelectorAll('.composer__template__name')].map((e) => e.innerText.trim())}; });
            // put the default back through its row's "Reset"
            await openManage(R);
            o = await openEmail(DEC);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Reset', exact: true}).click();
            await confirmDlg('Reset Template').getByRole('button', {name: 'Reset Template', exact: true}).click();
            await sleep(1200); await idle(page);
            out.rowsAfterReset = await windowRows(o.dlg);
            await closeDlg(o.dlg);
            F('composer', out);
            await signOut(page);
            // the language button pressed twice
            await signIn(page, `${L}mg`, {contextPath: L});
            await openManage(L);
            o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const frBtn = tplDlg().getByRole('button', {name: 'French', exact: true});
            const frVisible = () => tplDlg().locator('input[name="subject-fr_CA"]').isVisible().catch(() => false);
            const t = {before: await frVisible(), pressed: await frBtn.getAttribute('aria-pressed').catch(() => null)};
            await frBtn.click(); await sleep(500);
            t.once = await frVisible(); t.pressedOnce = await frBtn.getAttribute('aria-pressed').catch(() => null);
            await frBtn.click(); await sleep(500);
            t.twice = await frVisible(); t.pressedTwice = await frBtn.getAttribute('aria-pressed').catch(() => null);
            await snap('c-03-french-pressed-twice');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            F('frenchToggle', t);
            await signOut(page);
        });

        // ======================================================= seeded: publicknowledge read only (Rule 20's last sentence)
        await phase('seeded', async () => {
            await signIn(page, 'manager.maya', {contextPath: app.contextPath});
            await openManage(app.contextPath);
            const o = await openEmail(W);
            await o.dlg.locator('.listPanel__item').first().getByRole('button', {name: 'Edit', exact: true}).click();
            await tplDlg().waitFor({timeout: 15000}); await idle(page); await waitBody();
            const w = await readTemplateWindow();
            const out = {inputs: w.inputs.map((i) => i.name), bodies: w.bodies.map((b) => b.id), switch: await tplDlg().locator('.pkpFormLocales button').allInnerTexts().catch(() => []), counts: w.localeCounts};
            await snap('p-01-seeded-edit-template');
            await closeDlg(tplDlg());
            await closeDlg(o.dlg);
            F('seeded', out);
            await signOut(page);
        });

        // ======================================================= notify: the notification footer (U05 bullet) on N
        await phase('notify', async () => {
            await signIn(page, `${N}mg`, {contextPath: N});
            const out = {};
            await openManage(N);
            let o = await openEmail('New Announcement');
            out.kind = o.kind;
            if (o.absent || o.failed) { F('notify', {o}); return; }
            out.installedBody = (await editorContent()).slice(0, 1500);
            out.footerInTemplate = /unsubscribe|receiving this email/i.test(out.installedBody);
            await typeRich(BODY, `K4 marker ${N} {$announcementTitle}`, {keep: false});
            out.save = await saveTemplate('n-01-new-announcement-edited');
            // add an announcement that emails every registered user
            await page.goto(ctx(N, '/management/settings/announcements'));
            await idle(page);
            await page.getByRole('button', {name: 'Add Announcement', exact: true}).first().click();
            const ad = page.getByRole('dialog', {name: 'Add Announcement'});
            await ad.waitFor({timeout: 15000}); await idle(page);
            await ad.getByRole('button', {name: 'Save', exact: true}).waitFor({timeout: 15000});
            await ad.locator('input[name="title-en"]').fill(`K4 news ${N}`);
            const cb = ad.getByRole('checkbox', {name: 'Send an email about this to all registered users.', exact: true});
            out.sendBox = await cb.count();
            if (out.sendBox) await cb.check();
            await snap('n-02-add-announcement');
            const saved = page.waitForResponse((r) => /\/api\/v1\/announcements/.test(r.url()) && r.request().method() === 'POST', {timeout: 30000}).then((r) => r.status()).catch(() => null);
            await ad.getByRole('button', {name: 'Save', exact: true}).click();
            out.saveStatus = await saved;
            await sleep(1500);
            let m = await app.mail.find({to: `${N}rd@mail.test`, contains: `K4 marker ${N}`, timeoutMs: 10000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            if (m && m.error) {
                // the fleets run with the job runner off: run the app's own worker once, in a child
                // environment (support/jobs.js runJobs() polls worker 0's server, which a probe run
                // does not have, and its env changes leak into the next app of the same process)
                try {
                    execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: path.resolve(process.cwd(), app.root), env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 120000});
                    out.jobsRun = true;
                } catch (e) { out.jobsRun = String(e.message).slice(0, 200); }
                m = await app.mail.find({to: `${N}rd@mail.test`, contains: `K4 marker ${N}`, timeoutMs: 30000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            }
            if (m && !m.error) {
                const full = await app.mail.fullMessage(m.ID);
                out.mail = {subject: full.Subject, text: (full.Text || '').replace(/\r/g, '').slice(0, 1500)};
            } else out.mail = m;
            F('notify', out);
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
