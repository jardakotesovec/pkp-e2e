// U29 claim check, chunk K2 — the "Setup" values in effect (Rules 5–8, register A3)
// on OJS and OMP. OPS has no Review tab and no reviewer role (pF P34–35), so it
// is skipped. docs/process/briefs/claim-check.md.
//
// Per app, one scratch context: manager "Mira Manager", section editor "Sid
// Editor" (stage participant), author "Ava Author", external reviewers "Rowan
// Reviewer" (seeded accepted on s1), "Sparrow Spare" (never sent; used to open
// Add Reviewer) and "Dora Reviewer" (added on screen on s2 so a request email
// exists — seed-facts: API-seeded assignments send none). Submissions: s1 in
// review with Rowan accepted, s2 in review with no reviewer, d1 a wizard draft.
//
// Phases (PHASES=a,b,… re-runs named ones on the saved context; the scratch
// state is scratch.json in the agent's output folder):
//   seed      the context and submissions
//   defaults  manager and section editor: round status at min 0, Add Reviewer
//             dates at 4 / 4 (Rule 7, Rule 8 "at 0")
//   setup1    manager: 2 / 5 weeks, min 1, Restrict + One-click + Suggestion on
//   wizardOn  author: the draft's wizard steps with the box on (Rule 6)
//   effects1  manager: round status at min 1 (Rule 8); Add Reviewer 2 / 5,
//             Rowan's row unchanged; "Reviewers Suggested by Author" hunt; s2:
//             upload+grant a file, Add Reviewer for Dora with the review due
//             date changed before sending (Rule 7), the request email (Rule 5)
//   reviewer  Dora on s2: step 1 without files, accept, step 3 with files
//             (Rule 5); Rowan on s1: submit the review (Rule 8 "until")
//   effects2  manager: round status with one review in at min 1; s2 dates into
//             the past, "Send Reminder", the reminder email's link, the link
//             opened in a signed-out browser (Rule 5)
//   zero      manager: 0 / 0 then empty / empty → Add Reviewer 3 / 4 (A3);
//             min 0 and the boxes off → round status; author wizard off (Rule 6)
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U29/K2/k2.js
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const scratchAll = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const ONLY = process.env.PHASES ? process.env.PHASES.split(',') : null;
const phase = (name) => !ONLY || ONLY.includes(name);
const saveScratch = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(scratchAll, null, 2));
const log = (...a) => console.log(...a);
const flat = (s, n = 1500) => (s || '').replace(/\n+/g, ' | ').slice(0, n);
const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const dayDiff = (s) => { const t = Date.parse(s); if (Number.isNaN(t)) return null; return Math.round((t - Date.parse(today())) / 86400000); };
const hrefs = (html) => { const out = []; const re = /href=(["'])([^"']+)\1/gi; let m; while ((m = re.exec(html))) out.push(m[2].replace(/&amp;/g, '&')); return out; };
const visibleNotes = (page) => page.locator('[role=status], [role=alert], .pkpNotification, .pkpToast, .pkp_notification, .pkpFormPage__status').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\n+/g, ' / ')).filter(Boolean)).catch(() => []);
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:selected=${e.getAttribute('aria-selected')}`)).catch(() => []);

async function sect(name, fn) { try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name) { let s; try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; } record(name, s); await shot(page, name).catch(() => {}); return s; }
async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: 30000}).catch(() => {});
    await idle(page);
}
async function noLoading(page) { await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {}); }
async function hops(page, url) {
    const list = [];
    const h = (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) list.push({status: r.status(), url: r.url()}); };
    page.on('response', h);
    await page.goto(url, {waitUntil: 'commit'}).catch((e) => list.push({error: String(e).slice(0, 200)}));
    await idle(page).catch(() => {});
    page.off('response', h);
    return list;
}
async function pickDate(page, scope, fieldPrefix, date) {
    await scope.locator(`input.datepicker[id^="${fieldPrefix}"]`).click();
    const picker = page.locator('#ui-datepicker-div'); await picker.waitFor({timeout: 15000});
    await picker.locator('select.ui-datepicker-year').selectOption(String(date.getFullYear()));
    await picker.locator('select.ui-datepicker-month').selectOption(String(date.getMonth()));
    await picker.locator('td:not(.ui-datepicker-other-month) a').filter({hasText: new RegExp(`^${date.getDate()}$`)}).first().click();
    await picker.waitFor({state: 'hidden', timeout: 15000});
}
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[skip] OPS has no Review tab and no reviewer role'); return; }
    const sc = scratchAll[app.name] = scratchAll[app.name] || {};
    const ctxUrl = (p) => app.url(`/index.php/${sc.contextPath}${p}`);
    const wizard = (id) => ctxUrl(`/reviewer/submission/${id}`);
    const workflow = (id) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}`);
    const settings = () => ctxUrl('/management/settings/workflow');
    const mailOf = (u) => `${u}@mail.test`;
    const signInAs = async (page, u) => { await signIn(page, u, {contextPath: sc.contextPath}); await idle(page); };

    // ---- seed ---------------------------------------------------------------
    if (phase('seed') && !sc.contextPath) {
        const t = tag('u29k2');
        const users = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Sid', familyName: 'Editor'},
            {username: `${t}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${t}rev1`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            {username: `${t}rev2`, roles: ['externalReviewer'], givenName: 'Sparrow', familyName: 'Spare'},
            {username: `${t}rev3`, roles: ['externalReviewer'], givenName: 'Dora', familyName: 'Reviewer'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U29 K2 ${t}`, acronym: 'U29K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        const cp = ctx.path || t;
        const s1 = await app.api.createSubmission({tag: `${t}s1`, context: cp, submitter: `${t}au`, title: `K2 s1 ${t}`, decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: `${t}rev1`, status: 'accepted'}]}], participants: [{username: `${t}ed`, role: 'sectionEditor'}]});
        const s2 = await app.api.createSubmission({tag: `${t}s2`, context: cp, submitter: `${t}au`, title: `K2 s2 ${t}`, decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: []}], participants: [{username: `${t}ed`, role: 'sectionEditor'}]});
        const d1 = await app.api.createSubmission({tag: `${t}d1`, context: cp, submitter: `${t}au`, title: `K2 draft ${t}`, submitted: false});
        Object.assign(sc, {tag: t, contextPath: cp, contextId: ctx.contextId, users: {mgr: `${t}mgr`, ed: `${t}ed`, au: `${t}au`, rev1: `${t}rev1`, rev2: `${t}rev2`, rev3: `${t}rev3`},
            s1: s1.submissionId, s2: s2.submissionId, d1: d1.submissionId, s2tag: `${t}s2`});
        saveScratch();
        log('[seed]', app.name, JSON.stringify({ctx: sc.contextPath, s1: sc.s1, s2: sc.s2, d1: sc.d1}));
    }

    // ---- helpers: Setup tab ----------------------------------------------------
    const setupPanel = (page) => page.locator('#reviewSetup');
    async function gotoSetup(page) {
        await page.goto(settings()); await idle(page);
        await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
        const side = page.getByRole('tab', {name: 'Setup', exact: true});
        if (await side.count()) await side.first().click();
        await setupPanel(page).locator('input[name="numWeeksPerResponse"]').waitFor({timeout: 30000});
        await idle(page);
    }
    const readSetup = (page) => setupPanel(page).evaluate((root) => {
        const lab = (el) => { const l = el.id ? root.querySelector(`label[for="${el.id}"]`) : null; return (l ? l.innerText : (el.closest('label') || {}).innerText || '').trim(); };
        const text = (n) => { const i = root.querySelector(`input[name="${n}"]`); return i ? i.value : null; };
        const box = (n) => { const i = root.querySelector(`input[name="${n}"]`); return i ? {checked: i.checked, label: lab(i)} : null; };
        return {numWeeksPerResponse: text('numWeeksPerResponse'), numWeeksPerReview: text('numWeeksPerReview'), numReviewsPerSubmission: text('numReviewsPerSubmission'),
            restrictReviewerFileAccess: box('restrictReviewerFileAccess'), reviewerAccessKeysEnabled: box('reviewerAccessKeysEnabled'), reviewerSuggestionEnabled: box('reviewerSuggestionEnabled'),
            errors: [...root.querySelectorAll('.pkpFormField__errors, .pkpFormField__error, [role=alert]')].map((e) => e.innerText.trim()).filter(Boolean)};
    });
    async function saveSetup(page, label) {
        const st = []; const onR = (r) => { if (/\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET') st.push({m: r.request().method(), s: r.status()}); }; page.on('response', onR);
        await setupPanel(page).getByRole('button', {name: 'Save', exact: true}).click();
        await page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 30000}).catch(() => {});
        const notes = await visibleNotes(page);
        await idle(page); page.off('response', onR);
        const after = await readSetup(page);
        record(`${label}-after-save-${app.name}`, {responses: st, notes, form: after});
        await shot(page, `${label}-after-save-${app.name}`).catch(() => {});
        log(`[${label} save]`, app.name, JSON.stringify(st), 'notes=', JSON.stringify(notes), 'errors=', JSON.stringify(after.errors));
        await page.reload(); await idle(page); await gotoSetup(page);
        const re = await readSetup(page);
        record(`${label}-after-reload-${app.name}`, re); await snap(page, `${label}-setup-screen-${app.name}`);
        log(`[${label} after reload]`, app.name, JSON.stringify(re));
        return re;
    }
    const setText = async (page, name, v) => { const i = setupPanel(page).locator(`input[name="${name}"]`); await i.fill(''); await i.fill(String(v)); };
    const setBox = async (page, name, v) => { const i = setupPanel(page).locator(`input[name="${name}"]`); if ((await i.isChecked()) !== v) await i.click(); };

    // ---- helpers: review stage / Add Reviewer ----------------------------------
    const revTable = (page) => page.getByRole('table', {name: 'Reviewers', exact: true});
    const rowOf = (page, who) => revTable(page).getByRole('row').filter({hasText: who}).first();
    async function openRound(page, id, label) {
        await page.goto(workflow(id)); await idle(page);
        await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
        await revTable(page).waitFor({timeout: 30000}); await noLoading(page); await idle(page);
        await snap(page, `${label}-review-stage-${app.name}`);
        const dlgText = (await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])).join('\n');
        record(`${label}-review-stage-dialog-text-${app.name}`, {url: page.url(), text: dlgText});
        const lines = dlgText.split('\n').map((s) => s.trim()).filter((s) => /Minimum|Awaiting|review|Suggest|due/i.test(s) && s.length < 200);
        log(`[${label} round]`, app.name, JSON.stringify(lines.slice(0, 20)), '| "Suggest" in dialog:', /Suggest/i.test(dlgText));
        return {lines, dlgText};
    }
    async function readReviewerForm(dlg) {
        return dlg.locator('#regularReviewerForm').evaluate((f) => {
            const v = (n) => { const i = f.querySelector(`input[name="${n}"]`); return i ? i.value : null; };
            const boxes = [...f.querySelectorAll('input[type="checkbox"]')].map((b) => ({name: b.name, value: b.value, checked: b.checked}));
            return {responseDueDate: v('responseDueDate'), reviewDueDate: v('reviewDueDate'), boxes, hasSuggest: /Suggest/i.test(f.innerText)};
        });
    }
    // Opens Add Reviewer for `who`; returns {dlg, form}. Caller closes or sends.
    async function openAddReviewer(page, who, label) {
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await dlg.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 100; }, null, {timeout: 15000}).catch(() => {});
        const listText = await dlg.innerText();
        record(`${label}-select-reviewer-${app.name}`, {aria: await dlg.ariaSnapshot(), text: listText});
        log(`[${label} select reviewer]`, app.name, '"Suggest" in list dialog:', /Suggest/i.test(listText), '| headings:', JSON.stringify(await dlg.locator('h1,h2,h3,h4').allInnerTexts().catch(() => [])));
        const entry = dlg.locator('.listPanel__item').filter({hasText: who}).first(); await entry.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
        await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
        await dlg.locator('#regularReviewerForm').waitFor({state: 'visible', timeout: 30000});
        await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe[id^="personalMessage"]')].pop(); return !!(f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.trim().length > 20); }, null, {timeout: 30000}).catch(() => {});
        const form = await readReviewerForm(dlg);
        form.today = today(); form.responseDays = dayDiff(form.responseDueDate); form.reviewDays = dayDiff(form.reviewDueDate);
        record(`${label}-add-reviewer-${app.name}`, {form, aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
        await shot(page, `${label}-add-reviewer-${app.name}`).catch(() => {});
        log(`[${label} add reviewer]`, app.name, JSON.stringify({responseDueDate: form.responseDueDate, responseDays: form.responseDays, reviewDueDate: form.reviewDueDate, reviewDays: form.reviewDays, hasSuggest: form.hasSuggest, boxes: form.boxes.map((b) => `${b.name}=${b.checked}`)}));
        return {dlg, form};
    }
    async function closeAddReviewer(page, dlg) {
        await dlg.getByRole('button', {name: 'Close'}).first().click();
        await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await idle(page);
    }
    async function addReviewerDates(page, label, who) {
        const {dlg, form} = await openAddReviewer(page, who, label);
        await loc(page, 'Add Reviewer window: Response Due Date', dlg.locator('#regularReviewerForm input[name="responseDueDate"]'));
        await closeAddReviewer(page, dlg);
        return form;
    }
    const rowText = async (page, who) => flat(await rowOf(page, who).innerText().catch(() => 'ROW ABSENT'), 300);

    // ---- helpers: mail -----------------------------------------------------------
    const mailsFor = async (to, contains) => {
        const list = (await app.mail._search({to, contains})).messages || [];
        const full = await Promise.all(list.map((m) => app.mail.fullMessage(m.ID)));
        return full.map((f) => ({subject: f.Subject, date: f.Date, from: f.From && f.From.Address, links: hrefs(f.HTML || '').filter((h) => !/mail\.test|mailto:/.test(h)), text: (f.Text || '').slice(0, 1500)}));
    };
    const waitMails = async (to, contains, n) => { let m = []; for (let i = 0; i < 30 && m.length < n; i++) { m = await mailsFor(to, contains); if (m.length < n) await new Promise((r) => setTimeout(r, 500)); } return m; };
    const linkOf = (m) => m && (m.links.find((l) => /key=/.test(l)) || m.links.find((l) => /reviewer|invitation/.test(l)));
    const openFresh = async (name, url) => {
        const {page, close} = await launch(app);
        try {
            const hs = await hops(page, url); await noLoading(page);
            const s = await snap(page, name);
            const body = await page.locator('body').innerText().catch(() => '');
            record(`${name}-hops-${app.name}`, {hops: hs, bodyLength: body.length});
            log(`[${name}]`, app.name, 'hops=', JSON.stringify(hs.map((h) => `${h.status} ${(h.url || '').slice((h.url || '').indexOf('/index.php'))}`)), '| final=', page.url().slice(page.url().indexOf('/index.php')), '| title=', s.title, '| tabs=', JSON.stringify(await tabsOf(page)), '| text=', flat(body, 300));
        } finally { await close(); }
    };

    // ---- defaults ---------------------------------------------------------------
    if (phase('defaults')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await openRound(page, sc.s1, 'defaults-mgr');
            log('[defaults Rowan row]', await rowText(page, /Rowan/));
            await addReviewerDates(page, 'defaults-mgr', 'Sparrow');
            await signInAs(page, sc.users.ed);
            await openRound(page, sc.s1, 'defaults-ed');
            await addReviewerDates(page, 'defaults-ed', 'Sparrow');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- setup1 -------------------------------------------------------------------
    if (phase('setup1')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await gotoSetup(page);
            log('[setup1 before]', app.name, JSON.stringify(await readSetup(page)));
            await setText(page, 'numWeeksPerResponse', 2);
            await setText(page, 'numWeeksPerReview', 5);
            await setText(page, 'numReviewsPerSubmission', 1);
            await setBox(page, 'restrictReviewerFileAccess', true);
            await setBox(page, 'reviewerAccessKeysEnabled', true);
            await setBox(page, 'reviewerSuggestionEnabled', true);
            await loc(page, 'Setup: Restrict File Access box', setupPanel(page).locator('input[name="restrictReviewerFileAccess"]'));
            await loc(page, 'Setup: One-click Reviewer Access box', setupPanel(page).locator('input[name="reviewerAccessKeysEnabled"]'));
            await saveSetup(page, 'setup1');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- author wizard ---------------------------------------------------------------
    const wizardSteps = (page) => page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const stepLines = main.innerText.split('\n').map((s) => s.trim()).filter((s) => /^\d+ /.test(s)).slice(0, 12);
        return {h1: (main.querySelector('h1') || {}).innerText, stepLines};
    });
    async function authorWizard(page, label) {
        await page.goto(ctxUrl(`/submission/wizard?submissionId=${sc.d1}`)); await idle(page);
        await page.locator('.pkpSteps, main').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const s = await wizardSteps(page);
        const data = await snap(page, `${label}-wizard-${app.name}`); s.url = data.url;
        record(`${label}-wizard-steps-${app.name}`, s);
        log(`[${label} wizard]`, app.name, JSON.stringify(s));
        return s;
    }
    if (phase('wizardOn')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.au);
            await authorWizard(page, 'on');
            await sect('on step', async () => {
                await page.locator('main').getByText('Reviewer Suggestions', {exact: true}).first().click(); await idle(page);
                const s = await snap(page, `on-wizard-suggestions-step-${app.name}`);
                log('[on suggestions step]', app.name, flat(s.text.main, 700));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- effects1 ---------------------------------------------------------------------
    if (phase('effects1')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await openRound(page, sc.s1, 'min1');
            log('[min1 Rowan row]', await rowText(page, /Rowan/));
            await addReviewerDates(page, 'weeks25', 'Sparrow');
            // s2: upload and grant one file, then Add Reviewer for Dora with the review due date changed
            await sect('grant s2', async () => {
                if (sc.s2granted) return;
                await openRound(page, sc.s2, 'pre-grant');
                await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
                const manage = page.getByRole('dialog').filter({has: page.locator('form[id^="manageReviewFiles"], [id^="manageReviewFiles"], form[id^="selectFiles"]')}).first();
                await manage.waitFor({timeout: 30000});
                await manage.getByRole('link', {name: 'Upload Review File'}).click();
                const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
                const fileInput = wiz.locator('input[type="file"]');
                await fileInput.waitFor({state: 'attached', timeout: 30000});
                const genre = wiz.locator('select[id^="genreId"]');
                if (await genre.count()) { const opts = await genre.locator('option').allTextContents(); await genre.selectOption({index: opts.findIndex((o, i) => i > 0 && o.trim())}); }
                await fileInput.setInputFiles(PDF);
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
                await wiz.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
                await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
                await wiz.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
                await wiz.getByRole('button', {name: 'Complete', exact: true}).click();
                await wiz.waitFor({state: 'detached', timeout: 30000}); await idle(page);
                const boxes = manage.locator('table input[type="checkbox"]');
                for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check().catch(() => {});
                const okBtn = manage.getByRole('button', {name: /^(Save|OK)$/});
                if (await okBtn.count()) { await okBtn.first().click(); await manage.waitFor({state: 'detached', timeout: 30000}).catch(() => {}); }
                await idle(page);
                sc.s2granted = true; saveScratch();
            });
            await sect('add Dora', async () => {
                if (sc.doraAdded) return;
                await openRound(page, sc.s2, 'pre-dora');
                const {dlg, form} = await openAddReviewer(page, 'Dora', 'dora');
                // tick the file boxes so Dora has files for review
                const fboxes = dlg.locator('#regularReviewerForm input[name="selectedFiles[]"]');
                log('[dora file boxes]', await fboxes.count());
                for (let i = 0; i < await fboxes.count(); i++) await fboxes.nth(i).check().catch(() => {});
                // the editor changes the review due date before sending (Rule 7)
                const target = plusDays(42);
                await pickDate(page, dlg.locator('#regularReviewerForm'), 'reviewDueDate', target);
                const after = await readReviewerForm(dlg);
                log('[dora dates after change]', JSON.stringify({response: after.responseDueDate, review: after.reviewDueDate, target: iso(target)}));
                const st = []; const onR = (r) => { if (/update-reviewer/.test(r.url())) st.push(r.status()); }; page.on('response', onR);
                await dlg.locator('#regularReviewerForm').getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                let stuck = false;
                await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 30000}).catch(async () => { stuck = true; await dlg.getByRole('button', {name: 'Close'}).first().click().catch(() => {}); });
                page.off('response', onR); await idle(page); await noLoading(page);
                log('[add Dora] update-reviewer=', JSON.stringify(st), stuck ? 'WINDOW STAYED OPEN' : '');
                await page.reload(); await idle(page); await revTable(page).waitFor({timeout: 30000}); await noLoading(page);
                await snap(page, `dora-added-review-stage-${app.name}`);
                log('[Dora row]', await rowText(page, /Dora/));
                sc.doraAdded = true; sc.doraReviewDue = after.reviewDueDate; sc.doraResponseDue = after.responseDueDate; sc.doraPresetReviewDue = form.reviewDueDate; saveScratch();
                const m = await waitMails(mailOf(sc.users.rev3), sc.tag, 1); record(`mail-dora-request-${app.name}`, m);
                const L1 = linkOf(m[0]); sc.doraLink1 = L1; saveScratch();
                log('[Dora request mail]', JSON.stringify(m.map((x) => ({subject: x.subject, links: x.links}))), '| keyed link:', !!(L1 && /key=/.test(L1)));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- request: Sparrow on s2, both dates changed before sending, the request email's link (Rule 5, Rule 7)
    if (phase('request')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await sect('add Sparrow', async () => {
                if (sc.sparrowAdded) return;
                await openRound(page, sc.s2, 'pre-sparrow');
                const {dlg, form} = await openAddReviewer(page, 'Sparrow', 'sparrow');
                const f = dlg.locator('#regularReviewerForm');
                await pickDate(page, f, 'responseDueDate', plusDays(10));
                await pickDate(page, f, 'reviewDueDate', plusDays(45));
                const after = await readReviewerForm(dlg);
                log('[Sparrow dates preset → changed]', JSON.stringify({preset: [form.responseDueDate, form.reviewDueDate], changed: [after.responseDueDate, after.reviewDueDate], boxes: after.boxes}));
                const st = []; const onR = (r) => { if (/update-reviewer/.test(r.url())) st.push(r.status()); }; page.on('response', onR);
                await f.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 30000}).catch(() => log('[add Sparrow] WINDOW STAYED OPEN'));
                page.off('response', onR); await idle(page); await noLoading(page);
                await page.reload(); await idle(page); await revTable(page).waitFor({timeout: 30000}); await noLoading(page);
                await snap(page, `sparrow-added-review-stage-${app.name}`);
                log('[add Sparrow] update-reviewer=', JSON.stringify(st), '| row:', await rowText(page, /Sparrow/));
                await rowOf(page, /Sparrow/).getByRole('button', {name: 'More Actions'}).click();
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
                const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
                await edit.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000}); await idle(page);
                const ed = await edit.evaluate((d) => ({response: (d.querySelector('input[name="responseDueDate"]') || {}).value, review: (d.querySelector('input[name="reviewDueDate"]') || {}).value}));
                record(`sparrow-edit-window-${app.name}`, {dates: ed, text: await edit.innerText()});
                log('[Sparrow Edit window dates]', JSON.stringify(ed));
                const cancel = edit.getByRole('button', {name: 'Cancel', exact: true});
                if (await cancel.count()) await cancel.first().click(); else await page.getByRole('dialog').last().getByRole('button', {name: 'Close'}).first().click();
                await idle(page);
                sc.sparrowAdded = true; sc.sparrowDates = {preset: [form.responseDueDate, form.reviewDueDate], changed: [after.responseDueDate, after.reviewDueDate], edit: ed}; saveScratch();
            });
            await signOut(page);
        } finally { await close(); }
        await sect('Sparrow request mail', async () => {
            const m = await waitMails(mailOf(sc.users.rev2), sc.tag, 1); record(`mail-sparrow-request-${app.name}`, m);
            const L = linkOf(m[0]); sc.sparrowLink = L; saveScratch();
            log('[Sparrow request mail]', JSON.stringify(m.map((x) => ({subject: x.subject, date: x.date, links: x.links}))), '| keyed link:', !!(L && /key=/.test(L)), '| text=', flat(m[0] && m[0].text, 900));
            if (L) await openFresh('sparrow-request-link-fresh', L);
        });
    }

    // ---- reviewer ------------------------------------------------------------------------
    const acceptStep1 = async (page) => {
        const box = page.getByRole('checkbox', {name: /privacy statement/});
        if (await box.count()) await box.check();
        await page.getByRole('button', {name: 'Accept Review, Continue to Step #2'}).click();
        await waitTab(page, 2);
    };
    if (phase('reviewer')) {
        const {page, close} = await launch(app);
        try {
            await sect('Dora restricted', async () => {
                await signInAs(page, sc.users.rev3);
                await page.goto(wizard(sc.s2)); await idle(page); await noLoading(page);
                const s1 = await snap(page, `dora-step1-${app.name}`);
                log('[Dora step1]', app.name, 'Review Files heading:', await page.getByRole('heading', {name: 'Review Files'}).count(), '| "Review Files" in text:', /Review Files/.test(s1.text.main), '| file links:', await page.locator('a[href*="download-file"]').count(), '| tabs=', JSON.stringify(await tabsOf(page)));
                log('[Dora step1 text]', flat(s1.text.main, 700));
                await acceptStep1(page);
                const s2 = await snap(page, `dora-step2-${app.name}`);
                log('[Dora step2] file links:', await page.locator('a[href*="download-file"]').count());
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                const s3 = await snap(page, `dora-step3-${app.name}`);
                const links = page.locator('main a[href*="download-file"]');
                await loc(page, 'reviewer step 3 › Review Files › file link', links.first());
                log('[Dora step3] file links:', await links.count(), JSON.stringify(await links.evaluateAll((els) => els.map((e) => e.textContent.trim()))), '| "Review Files" in text:', /Review Files/.test(s3.text.main));
            });
            await sect('Rowan submits', async () => {
                await signInAs(page, sc.users.rev1);
                await page.goto(wizard(sc.s1)); await idle(page); await noLoading(page);
                await snap(page, `rowan-step1-${app.name}`);
                const cont = page.getByRole('button', {name: /Save and continue|Continue to Step #2/}).first();
                await cont.click(); await waitTab(page, 2);
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                const body = page.frameLocator('form#reviewStep3Form iframe').first().locator('body');
                if (await page.locator('form#reviewStep3Form iframe').count()) { await body.click(); await body.fill('K2 review text'); }
                if (app.name === 'ojs') await page.locator('select#reviewerRecommendationId').selectOption({index: 1}).catch(() => {});
                await page.getByRole('button', {name: 'Submit Review'}).click();
                const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
                await conf.waitFor({timeout: 15000});
                await conf.getByRole('button', {name: 'OK', exact: true}).click();
                await conf.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await waitTab(page, 4);
                const s4 = await snap(page, `rowan-step4-${app.name}`);
                log('[Rowan submitted] tabs=', JSON.stringify(await tabsOf(page)), '| text=', flat(s4.text.main, 200));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- effects2 -----------------------------------------------------------------------
    if (phase('effects2')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await openRound(page, sc.s1, 'min1-one-in');
            log('[min1-one-in Rowan row]', await rowText(page, /Rowan/));
            await sect('request mail', async () => {
                const m = await waitMails(mailOf(sc.users.rev3), sc.tag, 1); record(`mail-dora-request-${app.name}`, m);
                const L1 = linkOf(m[0]); sc.doraLink1 = L1; saveScratch();
                log('[Dora request mail]', JSON.stringify(m.map((x) => ({subject: x.subject, date: x.date, links: x.links}))), '| keyed link:', !!(L1 && /key=/.test(L1)), '| text=', flat(m[0] && m[0].text, 700));
            });
            await signOut(page);
            if (sc.doraLink1) await sect('open request link', async () => { await openFresh('request-link-fresh', sc.doraLink1); });
            await signInAs(page, sc.users.mgr);
            await sect('reminder', async () => {
                await openRound(page, sc.s2, 'dora-accepted');
                log('[Dora row accepted]', await rowText(page, /Dora/));
                await rowOf(page, /Dora/).getByRole('button', {name: 'More Actions'}).click();
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
                const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
                await edit.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000}); await idle(page);
                await pickDate(page, edit, 'responseDueDate', plusDays(-12)); await pickDate(page, edit, 'reviewDueDate', plusDays(-5));
                await edit.getByRole('button', {name: 'OK', exact: true}).click();
                await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000}); await idle(page);
                await page.reload(); await idle(page); await revTable(page).waitFor({timeout: 30000}); await noLoading(page);
                log('[Dora row overdue]', await rowText(page, /Dora/));
                const remBtn = rowOf(page, /Dora/).getByRole('button', {name: 'Send Reminder'});
                await remBtn.first().click();
                const rd = page.getByRole('dialog').filter({hasText: /Reminder/}).last(); await rd.waitFor({timeout: 15000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15000}).catch(() => {}); await idle(page);
                record(`reminder-dialog-${app.name}`, {aria: await rd.ariaSnapshot(), text: await rd.innerText()});
                await rd.getByRole('button', {name: /Send Reminder|Send/}).last().click();
                await page.locator('form[id*="eminder"]').waitFor({state: 'hidden', timeout: 30000}).catch(() => log('[reminder window stayed open]'));
                await idle(page);
                const m = await waitMails(mailOf(sc.users.rev3), sc.tag, 2); record(`mail-dora-all-${app.name}`, m);
                log('[Dora mails]', JSON.stringify(m.map((x) => ({subject: x.subject, date: x.date, links: x.links}))));
                const rem = m.find((x) => /remind/i.test(x.subject)) || m[0];
                const L2 = linkOf(rem); sc.doraLink2 = L2; saveScratch();
                log('[reminder keyed link]', !!(L2 && /key=/.test(L2)), '| text=', flat(rem && rem.text, 500));
            });
            await signOut(page);
        } finally { await close(); }
        if (sc.doraLink2) await sect('open reminder link', async () => { await openFresh('reminder-link-fresh', sc.doraLink2); });
    }

    // ---- suggestStep: the author's "Reviewer Suggestions" step panel (Rule 6); "confirmed" hunt (Rule 8):
    //      min 1 with a submitted review, then after the editor reads it
    if (phase('suggestStep')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await gotoSetup(page);
            await setText(page, 'numReviewsPerSubmission', 1); await setBox(page, 'reviewerSuggestionEnabled', true);
            await saveSetup(page, 'sugg-on');
            await sect('read review', async () => {
                await openRound(page, sc.s1, 'min1-submitted');
                await rowOf(page, /Rowan/).getByRole('button', {name: 'Read Review'}).click();
                const rd = page.getByRole('dialog').last(); await rd.waitFor({timeout: 15000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15000}).catch(() => {}); await idle(page);
                record(`read-review-window-${app.name}`, {aria: await rd.ariaSnapshot(), text: await rd.innerText()});
                log('[Read Review window buttons]', JSON.stringify(await rd.getByRole('button').allInnerTexts().catch(() => [])));
                const confirm = rd.getByRole('button', {name: /^Confirm$/});
                if (await confirm.count()) { await confirm.first().click(); await idle(page); log('[Read Review] pressed Confirm'); }
                else { const cl = rd.getByRole('button', {name: /^(Close|Cancel)$/}); await cl.last().click(); await idle(page); }
                await page.reload(); await idle(page);
                await openRound(page, sc.s1, 'min1-read');
                log('[min1-read Rowan row]', await rowText(page, /Rowan/));
            });
            await sect('author suggestion step', async () => {
                await signInAs(page, sc.users.au);
                await page.goto(ctxUrl(`/submission/wizard?submissionId=${sc.d1}`)); await idle(page);
                for (let i = 0; i < 5; i++) {
                    const h1 = await page.locator('main h1').first().innerText().catch(() => '');
                    if (/Reviewer Suggestions/.test(h1)) break;
                    const cont = page.getByRole('button', {name: 'Continue', exact: true});
                    if (!(await cont.count())) { log('[wizard] no Continue at', h1); break; }
                    await cont.first().click(); await idle(page);
                }
                const s = await snap(page, `on-wizard-suggestions-step-${app.name}`);
                log('[suggestions step]', app.name, 'url=', s.url, '| h1=', flat(await page.locator('main h1').first().innerText().catch(() => ''), 100), '| text=', flat(s.text.main, 900));
                const add = page.getByRole('button', {name: /Add Reviewer Suggestion|Add Suggestion/}).first();
                if (await add.count()) {
                    await add.click(); await idle(page);
                    const d = page.getByRole('dialog').last(); await d.waitFor({timeout: 15000}).catch(() => {});
                    const fs2 = await snap(page, `on-wizard-suggestion-form-${app.name}`);
                    log('[suggestion form]', JSON.stringify((fs2.aria.dialogs || []).map((x) => x.split('\n').filter((l) => /textbox|button|combobox|checkbox/.test(l)).join(' | ').slice(0, 900))));
                }
            });
            await signInAs(page, sc.users.mgr);
            await gotoSetup(page);
            await setText(page, 'numReviewsPerSubmission', 0); await setBox(page, 'reviewerSuggestionEnabled', false);
            await saveSetup(page, 'sugg-off');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- markComplete: min 1, the editor marks Rowan's review complete (Rule 8 "confirmed")
    if (phase('markComplete')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await gotoSetup(page);
            await setText(page, 'numReviewsPerSubmission', 1);
            await saveSetup(page, 'min1-again');
            await sect('mark complete', async () => {
                await openRound(page, sc.s1, 'min1-before-complete');
                await rowOf(page, /Rowan/).getByRole('button', {name: 'Read Review'}).click();
                const rd = page.getByRole('dialog').last(); await rd.waitFor({timeout: 15000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15000}).catch(() => {}); await idle(page);
                await rd.getByRole('button', {name: 'Mark as Complete'}).click(); await idle(page);
                const c = page.getByRole('dialog').last();
                const ctext = await c.innerText().catch(() => '');
                log('[Mark as Complete → next dialog]', flat(ctext, 400), '| buttons:', JSON.stringify(await c.getByRole('button').allInnerTexts().catch(() => [])));
                record(`mark-complete-dialog-${app.name}`, {text: ctext, aria: await c.ariaSnapshot().catch(() => '')});
                const ok = c.getByRole('button', {name: /^(OK|Confirm|Mark as Complete|Yes)$/});
                if (await ok.count()) { await ok.last().click(); await idle(page); }
                await page.reload(); await idle(page);
                await openRound(page, sc.s1, 'min1-after-complete');
                log('[min1-after-complete Rowan row]', await rowText(page, /Rowan/));
            });
            await gotoSetup(page);
            await setText(page, 'numReviewsPerSubmission', 0);
            await saveSetup(page, 'min0-again');
            await signOut(page);
        } finally { await close(); }
    }

    // ---- zero -----------------------------------------------------------------------------
    if (phase('zero')) {
        const {page, close} = await launch(app);
        try {
            await signInAs(page, sc.users.mgr);
            await gotoSetup(page);
            await setText(page, 'numWeeksPerResponse', 0); await setText(page, 'numWeeksPerReview', 0);
            await saveSetup(page, 'zero');
            await openRound(page, sc.s1, 'zero');
            await addReviewerDates(page, 'zero', 'Sparrow');
            await gotoSetup(page);
            await setText(page, 'numWeeksPerResponse', ''); await setText(page, 'numWeeksPerReview', '');
            await saveSetup(page, 'empty');
            await openRound(page, sc.s1, 'empty');
            await addReviewerDates(page, 'empty', 'Sparrow');
            log('[empty Rowan row]', await rowText(page, /Rowan/));
            await gotoSetup(page);
            await setText(page, 'numReviewsPerSubmission', 0);
            await setBox(page, 'restrictReviewerFileAccess', false); await setBox(page, 'reviewerAccessKeysEnabled', false); await setBox(page, 'reviewerSuggestionEnabled', false);
            await saveSetup(page, 'off');
            await openRound(page, sc.s1, 'min0-off');
            const {dlg} = await openAddReviewer(page, 'Sparrow', 'off');
            await closeAddReviewer(page, dlg);
            await signInAs(page, sc.users.au);
            await authorWizard(page, 'off');
            await signOut(page);
        } finally { await close(); }
    }
});
