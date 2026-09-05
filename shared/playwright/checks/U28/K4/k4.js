// U28 claim check, chunk K4 — the settings-driven variants on OJS and OMP:
// competing interests, restricted file access, a review form, guidelines and
// one-click links (Rule 8, Rule 16, "Settings that modify behavior",
// scenarios 8, 9, 10, 13, register A8, A9, A10, OMP3). RUNBOOK step 7
// "Checks are kept".
//
// Drives, per app, on its own scratch context (a manager, a section editor as
// stage participant, an author, one external reviewer "Dora Reviewer").
// Phases (PHASES=a,b,… re-runs named ones on the saved context, scratch.json
// in the agent's output folder):
//   seed      context + submissions c0, s8, s9, s13, s13b (reviewer invited),
//             o1..o5 (no reviewer; the editor adds Dora on screen so a request
//             email exists — seed-facts: API-seeded assignments send none)
//   grant     editor uploads and grants one file on c0 and s9
//   control   reviewer's step 1 on c0 BEFORE the settings: "Review Files"
//             listed, no "Competing Interests" section (scenario 9 / 13 controls)
//   settings  manager: Review › Setup both boxes on, guidance texts, review
//             form "U28K4 form" with one required radio question, activated;
//             Website › Setup › Privacy Statement read
//   attach    editor attaches the form to s8 (Edit window)
//   rev       reviewer: s8 (form; refused submit; Save for Later; submit),
//             s9 (restricted files), s13 (CI accept), s13b (CI decline)
//   ed1       editor: Reviewers rows of s13 / s13b (badge), Review Details
//   rev2      reviewer: s13 step 1 › "I do not have …" › "Save and continue"
//   ed2       editor: s13 row again (badge gone?)
//   oneclick  request links in fresh signed-out browsers, accept+submit,
//             decline, a later request, a reminder, opened as the author
//   off       manager unticks One-click; plain link → Login → wizard
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK4 node bin/probe.js all shared/playwright/checks/U28/K4/k4.js
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
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:disabled=${e.getAttribute('aria-disabled')}:selected=${e.getAttribute('aria-selected')}`)).catch(() => []);
const headerUser = (page) => page.locator('header button, .app__header button, nav button').evaluateAll((els) =>
    els.map((e) => e.innerText.trim()).filter((t) => /\w/.test(t) && !/Tasks|help|Skip/i.test(t))).catch(() => []);
const hrefs = (html) => { const out = []; const re = /href=(["'])([^"']+)\1/gi; let m; while ((m = re.exec(html))) out.push(m[2].replace(/&amp;/g, '&')); return out; };
const visibleNotes = (page) => page.locator('[role=status], [role=alert], .pkpNotification, .pkpToast, .pkp_notification, #reviewStep3MessageBox').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\n+/g, ' / '))).catch(() => []);

const SECTS = process.env.SECTS ? process.env.SECTS.split(',') : null;
async function sect(name, fn) { if (SECTS && !SECTS.includes(name)) return; try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name) { const s = await screen(page); record(name, s); await shot(page, name); return s; }
async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: 30000}).catch(() => {});
    await idle(page);
}
async function noLoading(page) {
    await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
}
async function tiny(page, idPrefix, text) {
    const body = page.frameLocator(`iframe[id^="${idPrefix}"]`).first().locator('body');
    await body.waitFor({timeout: 30000}); await body.click(); await body.fill(text);
}
async function hops(page, url) {
    const list = [];
    const h = (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) list.push({status: r.status(), url: r.url(), location: r.headers()['location'] || null}); };
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

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[skip] OPS has no reviewer role'); return; }
    const sc = scratchAll[app.name] = scratchAll[app.name] || {};
    const wizard = (id) => app.url(`/index.php/${sc.contextPath}/reviewer/submission/${id}`);
    const workflow = (id) => app.url(`/index.php/${sc.contextPath}/dashboard/editorial?workflowSubmissionId=${id}`);
    const settings = () => app.url(`/index.php/${sc.contextPath}/management/settings/workflow`);
    const revMail = () => `${sc.users.rev}@mail.test`;

    // ---- seed ---------------------------------------------------------------
    if (phase('seed') && !sc.contextPath) {
        const t = tag('u28k4');
        const usersSpec = [
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Dora', familyName: 'Reviewer'},
            {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Dan', familyName: 'Editor'},
            {username: `${t}au`, roles: ['author'], givenName: 'Dina', familyName: 'Author'},
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Dave', familyName: 'Manager'},
        ];
        const ctx = await app.api.createContext({tag: t, context: {name: `U28 K4 ${t}`, acronym: 'U28K4', contactName: 'K4 Contact', contactEmail: `${t}contact@mail.test`}, users: usersSpec});
        Object.assign(sc, {tag: t, contextPath: ctx.path, contextId: ctx.contextId, users: {rev: `${t}rev`, ed: `${t}ed`, au: `${t}au`, mgr: `${t}mgr`}, subs: {}});
        saveScratch();
        log('[ctx]', app.name, sc.contextPath);
    }
    const seedOne = async (key, withReviewer) => {
        if (sc.subs[key]) return;
        const st = `${sc.tag}${key}`;
        const r = await app.api.createSubmission({
            tag: st, context: sc.contextPath, submitter: sc.users.au, submitted: true,
            title: `U28 K4 ${key.toUpperCase()} ${st}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: withReviewer ? [{username: sc.users.rev, status: 'invited'}] : []}],
            participants: [{username: sc.users.ed, role: 'sectionEditor'}],
        });
        sc.subs[key] = {tag: st, submissionId: r.submissionId, assignments: r.reviewAssignments};
        saveScratch(); log(`[sub ${app.name} ${key}]`, r.submissionId);
    };
    if (phase('seed')) {
        for (const k of ['c0', 's8', 's9', 's13', 's13b']) await seedOne(k, true);
        for (const k of ['o1', 'o2', 'o3', 'o4', 'o5']) await seedOne(k, false);
    }
    const revRow = (page) => page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: /Dora/}).first();
    const openRound = async (page, id) => {
        await page.goto(workflow(id)); await idle(page);
        await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
        await page.getByRole('table', {name: 'Reviewers', exact: true}).waitFor({timeout: 30000});
        await noLoading(page);
    };
    const openEdit = async (page) => {
        await revRow(page).getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
        const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
        await edit.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000}); await idle(page);
        return edit;
    };
    const okEdit = async (page, edit) => {
        await edit.getByRole('button', {name: 'OK', exact: true}).click();
        await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000}); await idle(page);
    };

    // ---- grant (editor uploads + grants one file on c0 and s9) ---------------
    if (phase('grant')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.ed);
            for (const k of ['c0', 's9']) {
                if (sc.subs[k].fileGranted) continue;
                await sect(`grant ${k}`, async () => {
                    await openRound(page, sc.subs[k].submissionId);
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
                    await idle(page); await page.reload(); await idle(page); await noLoading(page);
                    const edit = await openEdit(page);
                    const fboxes = edit.locator('input[type="checkbox"]:not([name="isReviewPubliclyVisible"])');
                    log(`[${k} file boxes]`, await fboxes.count());
                    for (let i = 0; i < await fboxes.count(); i++) await fboxes.nth(i).check();
                    await okEdit(page, edit);
                    sc.subs[k].fileGranted = true; saveScratch();
                });
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- control: reviewer's step 1 before the settings ----------------------
    if (phase('control')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.rev);
            await page.goto(wizard(sc.subs.c0.submissionId)); await idle(page); await noLoading(page);
            const s = await snap(page, `control-c0-step1-${app.name}`);
            log('[control c0 step1] Review Files heading:', await page.getByRole('heading', {name: 'Review Files'}).count(),
                '| CI radios:', await page.locator('input[name="competingInterestOption"]').count(),
                '| "Competing Interests" in text:', /Competing Interests/.test(s.text.main),
                '| privacy box:', await page.getByRole('checkbox', {name: /privacy statement/}).count(),
                '| file links:', await page.locator('a[href*="download-file"]').count());
            log('[control c0 text]', flat(s.text.main, 900));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- settings (manager) --------------------------------------------------
    if ((phase('settings') && !sc.settingsDone) || (ONLY && phase('privacy'))) {
        const onlyPrivacy = !!(ONLY && phase('privacy') && sc.settingsDone);
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.mgr);
            if (!onlyPrivacy) {
            await page.goto(settings()); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            log('[review sub-tabs]', JSON.stringify(await tabsOf(page)));
            await page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
            const setup = page.locator('#reviewSetup');
            const sSetup = await snap(page, `settings-review-setup-before-${app.name}`);
            log('[setup text]', flat(await setup.innerText(), 2500));
            const restrict = page.locator('input[name="restrictReviewerFileAccess"]');
            const oneclick = page.locator('input[name="reviewerAccessKeysEnabled"]');
            await loc(page, 'Review › Setup › Restrict File Access box', restrict);
            await loc(page, 'Review › Setup › One-click Reviewer Access box', oneclick);
            log('[setup before]', 'restrict', await restrict.isChecked(), 'oneclick', await oneclick.isChecked(),
                'mode', await page.locator('input[name="defaultReviewMode"]:checked').evaluate((e) => e.value).catch(() => '?'),
                'weeks', await page.locator('input[name="numWeeksPerResponse"], input[name="numWeeksPerReview"]').evaluateAll((els) => els.map((e) => `${e.name}=${e.value}`)));
            await restrict.check(); await oneclick.check();
            await setup.getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, `settings-review-setup-saved-${app.name}`);
            // guidance
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click(); await idle(page);
            log('[guidance text before]', flat(await page.locator('#reviewerGuidance').innerText(), 1200));
            if (app.name === 'omp') await tiny(page, 'reviewerGuidance-internalReviewGuidelines-control', 'U28K4 internal guidelines text');
            await tiny(page, 'reviewerGuidance-reviewGuidelines-control', 'U28K4 guidelines text');
            await tiny(page, 'reviewerGuidance-competingInterests-control', 'U28K4 CI policy text');
            await page.locator('#reviewerGuidance').getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, `settings-review-guidance-saved-${app.name}`);
            // review form
            await sect('review form', async () => {
                await page.getByRole('tab', {name: 'Review Forms', exact: true}).click(); await idle(page);
                const grid = page.locator('#reviewFormGridContainer');
                await grid.locator('table').waitFor({timeout: 30000});
                await grid.getByRole('link', {name: 'Create Review Form'}).click();
                const rfDlg = page.getByRole('dialog').filter({has: page.locator('form#reviewFormForm')});
                await rfDlg.locator('input[name="title[en]"], input[id^="title-en"], input[id^="title"]').first().waitFor({timeout: 30000});
                await rfDlg.locator('input[name="title[en]"], input[id^="title-en"], input[id^="title"]').first().fill('U28K4 form');
                await tiny(page, 'description', 'U28K4 form description');
                await rfDlg.getByRole('button', {name: 'Save', exact: true}).click();
                await rfDlg.waitFor({state: 'hidden', timeout: 30000}); await idle(page);
                await page.waitForFunction(() => document.querySelector('#reviewFormGridContainer')?.innerText.includes('U28K4 form'), null, {timeout: 30000});
                const row = grid.getByRole('row').filter({hasText: 'U28K4 form'}).first();
                if (await row.locator('a.show_extras, .show_extras').count()) await row.locator('a.show_extras, .show_extras').first().click();
                await idle(page);
                await grid.getByRole('link', {name: 'Edit', exact: true}).first().click();
                const editDlg = page.getByRole('dialog').filter({has: page.locator('#editReviewFormTabs')});
                await editDlg.waitFor({timeout: 30000}); await idle(page);
                await editDlg.getByRole('tab', {name: 'Form Items'}).click(); await idle(page);
                await editDlg.locator('#reviewFormElementsGridContainer table, [id^="reviewFormElementsGrid"] table').first().waitFor({timeout: 30000});
                await editDlg.getByRole('link', {name: 'Create New Item'}).click();
                const elDlg = page.getByRole('dialog').filter({has: page.locator('form#reviewFormElementForm')});
                await elDlg.locator('select#elementType').waitFor({timeout: 30000}); await idle(page);
                await tiny(page, 'question', 'U28K4 required question: is the method sound?');
                await elDlg.locator('input#required, input[name="required"]').check();
                await elDlg.locator('select#elementType').selectOption('5'); await idle(page);
                for (const r of ['Yes', 'No']) {
                    const lb = elDlg.locator('#elementOptionsListbuilderContainer');
                    await lb.getByRole('link', {name: 'Add Item'}).click();
                    const inputs = lb.locator('input[type=text]:visible, textarea:visible');
                    await inputs.last().waitFor({timeout: 15000}); await inputs.last().fill(r); await page.keyboard.press('Tab');
                }
                await elDlg.getByRole('button', {name: 'Save', exact: true}).click();
                await elDlg.waitFor({state: 'hidden', timeout: 30000}); await idle(page);
                record(`settings-reviewform-items-${app.name}`, {aria: await editDlg.ariaSnapshot(), text: await editDlg.innerText()});
                const closeBtn = editDlg.getByRole('button', {name: 'Close', exact: true});
                if (await closeBtn.count()) await closeBtn.first().click(); else await page.keyboard.press('Escape');
                await editDlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page);
                const active = grid.getByRole('row').filter({hasText: 'U28K4 form'}).locator('input[type=checkbox]').first();
                if (!(await active.isChecked())) {
                    await active.click();
                    const confirm = page.getByRole('dialog').filter({hasText: /activate/i}).last();
                    await confirm.waitFor({timeout: 15000});
                    log('[activate confirm]', flat(await confirm.innerText(), 400));
                    await confirm.getByRole('button', {name: /^(OK|Yes)$/}).click();
                    await confirm.waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page);
                }
                log('[rf active]', await active.isChecked());
                await snap(page, `settings-reviewforms-final-${app.name}`);
                sc.reviewForm = 'U28K4 form';
            });
            // reload check: both boxes persisted
            await page.goto(settings()); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            await page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
            log('[setup after reload]', 'restrict', await restrict.isChecked(), 'oneclick', await oneclick.isChecked());
            }
            // privacy statement on the website settings
            await sect('privacy statement', async () => { if (ONLY && !phase('privacy')) return;
                await page.goto(app.url(`/index.php/${sc.contextPath}/management/settings/website`)); await idle(page);
                // the page holds two "Setup" tabs (the section tab and a nested one): the first is the section
                await page.getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page);
                log('[website setup sub-tabs]', JSON.stringify(await tabsOf(page)));
                await page.getByRole('tab', {name: /Privacy Statement/}).click(); await idle(page);
                const body = page.frameLocator('iframe[id^="privacyStatement"], iframe[id*="rivacy"]').first().locator('body');
                await body.waitFor({timeout: 15000});
                log('[privacy statement text]', flat(await body.innerText(), 300));
                await snap(page, `settings-website-privacy-${app.name}`);
            });
            sc.settingsDone = true; saveScratch();
            await signOut(page);
        } finally { await close(); }
    }

    // ---- attach the form to s8 (editor) ---------------------------------------
    const attachKey = process.env.ATTACH || 's8';
    if (phase('attach') && !sc.subs[attachKey].formAttached) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.ed);
            await openRound(page, sc.subs[attachKey].submissionId);
            const edit = await openEdit(page);
            const sel = edit.locator('select#reviewFormId, select[name="reviewFormId"]');
            log('[reviewFormId options]', await sel.locator('option').allTextContents());
            await loc(page, 'Edit Review window › Review Form select', sel);
            await sel.selectOption({label: 'U28K4 form'});
            await okEdit(page, edit);
            sc.subs[attachKey].formAttached = true; saveScratch();
            await signOut(page);
        } finally { await close(); }
    }

    // ---- reviewer: s8, s9, s13, s13b -------------------------------------------
    const acceptStep1 = async (page) => {
        const box = page.getByRole('checkbox', {name: /privacy statement/});
        if (await box.count()) await box.check();
        await page.getByRole('button', {name: 'Accept Review, Continue to Step #2'}).click();
        await waitTab(page, 2);
    };
    const submitReview = async (page, name) => {
        const st = []; const onR = (r) => { if (/saveStep/.test(r.url())) st.push(`${r.status()} ${r.url().slice(-40)}`); }; page.on('response', onR);
        await page.getByRole('button', {name: 'Submit Review'}).click();
        const conf = page.getByRole('dialog').filter({hasText: /Are you sure/}).last();
        await conf.waitFor({timeout: 15000});
        log(`[${name} confirm]`, flat(await conf.innerText(), 300));
        await conf.getByRole('button', {name: 'OK', exact: true}).click();
        await conf.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        await page.locator('#reviewStep3MessageBox:visible, label.error:visible, [role=tab][aria-selected=true]:has-text("4.")').first().waitFor({timeout: 15000}).catch(() => {});
        await idle(page);
        page.off('response', onR);
        return st;
    };
    if (phase('rev')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.rev);
            // s8 — review form
            await sect('s8', async () => {
                const id = sc.subs.s8.submissionId;
                await page.goto(wizard(id)); await idle(page); await noLoading(page);
                await acceptStep1(page);
                const s2 = await snap(page, `s8-step2-${app.name}`);
                log('[s8 step2 text]', flat(s2.text.main, 500));
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                const s3 = await snap(page, `s8-step3-form-${app.name}`);
                log('[s8 step3 text]', flat(s3.text.main, 1800));
                log('[s8 step3] iframes in form:', await page.locator('form#reviewStep3Form iframe').count(),
                    '| fieldsets:', await page.locator('fieldset[id^="reviewFormResponses"]').evaluateAll((els) => els.map((e) => `${e.id} required=${e.getAttribute('aria-required')}`)),
                    '| radios:', await page.locator('input[type=radio][name^="reviewFormResponses"]').count(),
                    '| guidelines link:', await page.locator('#viewGuidelines a, [id^="viewGuidelines"] a').count());
                await loc(page, 'step 3 › review form question group', page.locator('fieldset[id^="reviewFormResponses"]').first());
                // guidelines dialog on step 3
                await sect('s8 guidelines dialog', async () => {
                    await page.locator('#viewGuidelines a, [id^="viewGuidelines"] a').first().click();
                    const g = page.getByRole('dialog').filter({hasText: /Guidelines/}).last(); await g.waitFor({timeout: 15000});
                    log('[s8 guidelines dialog]', flat(await g.innerText(), 300));
                    await g.getByRole('button', {name: 'OK', exact: true}).click(); await g.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                });
                // refused submit
                const st1 = await submitReview(page, 's8 unanswered');
                const sR = await snap(page, `s8-submit-unanswered-refused-${app.name}`);
                log('[s8 refused] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'saveStep=', JSON.stringify(st1));
                log('[s8 refused] message box:', flat(await page.locator('#reviewStep3MessageBox').innerText().catch(() => 'ABSENT'), 400),
                    '| visible notes:', JSON.stringify(await visibleNotes(page)),
                    '| error labels:', JSON.stringify(await page.locator('label.error:visible, .error:visible').allTextContents().catch(() => [])),
                    '| radio group marked:', await page.locator('fieldset[id^="reviewFormResponses"]').first().evaluate((e) => `${e.className}|${e.getAttribute('aria-invalid')}`));
                // Save for Later on a clean load, still unanswered
                await page.goto(`${wizard(id)}?step=3`); await idle(page); await noLoading(page);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000});
                const st2 = []; const onR2 = (r) => { if (/saveStep/.test(r.url())) st2.push(`${r.status()} ${r.url().slice(-40)}`); }; page.on('response', onR2);
                await page.getByRole('button', {name: 'Save for Later'}).click();
                await page.locator('[role=status]:visible, .pkpNotification:visible, #reviewStep3MessageBox:visible').first().waitFor({timeout: 5000}).catch(() => {});
                await idle(page); page.off('response', onR2);
                const sS = await snap(page, `s8-save-later-unanswered-${app.name}`);
                log('[s8 save later unanswered] url=', page.url(), 'saveStep=', JSON.stringify(st2), 'notes=', JSON.stringify(await visibleNotes(page)),
                    '| dialogs:', (sS.aria.dialogs || []).length, '| text has "saved":', /saved/i.test(sS.text.main));
                // answer and submit
                await page.locator('input[type=radio][name^="reviewFormResponses"]').first().check();
                if (app.name === 'ojs') await page.locator('select#reviewerRecommendationId').selectOption({index: 1});
                const st3 = await submitReview(page, 's8 answered');
                await waitTab(page, 4);
                const s4 = await snap(page, `s8-step4-${app.name}`);
                log('[s8 answered] tabs=', JSON.stringify(await tabsOf(page)), 'saveStep=', JSON.stringify(st3), 'text=', flat(s4.text.main, 300));
            });
            // s9 — restricted file access
            await sect('s9', async () => {
                const id = sc.subs.s9.submissionId;
                await page.goto(wizard(id)); await idle(page); await noLoading(page);
                const s1 = await snap(page, `s9-step1-${app.name}`);
                log('[s9 step1] Review Files heading:', await page.getByRole('heading', {name: 'Review Files'}).count(), '| "Review Files" in text:', /Review Files/.test(s1.text.main), '| file links:', await page.locator('a[href*="download-file"]').count());
                log('[s9 step1 text]', flat(s1.text.main, 900));
                await acceptStep1(page);
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                const s3 = await snap(page, `s9-step3-${app.name}`);
                const links = page.locator('#reviewFilesStep3 a, form#reviewStep3Form a[href*="download-file"]');
                await loc(page, 'step 3 › Review Files › file link', links.first());
                log('[s9 step3] file links:', await links.count(), JSON.stringify(await links.evaluateAll((els) => els.map((e) => `${e.textContent.trim()} → ${e.getAttribute('href')}`))));
                log('[s9 step3 text]', flat(s3.text.main, 600));
                const dl = page.waitForEvent('download', {timeout: 15000}).then((d) => `download: ${d.suggestedFilename()}`).catch((e) => `no download: ${String(e).slice(0, 80)}`);
                await page.locator('form#reviewStep3Form a[href*="download-file"], #reviewFilesStep3 a[href*="download-file"]').first().click();
                log('[s9 download]', await dl);
            });
            // s9dl — the step-3 file link downloads (re-runnable on the accepted assignment)
            await sect('s9dl', async () => {
                await page.goto(`${wizard(sc.subs.s9.submissionId)}?step=3`); await idle(page); await noLoading(page);
                const link = page.locator('form#reviewStep3Form a[href*="download-file"], #reviewFilesStep3 a[href*="download-file"], main a[href*="download-file"]').first();
                await loc(page, 'step 3 › Review Files › file link', link);
                const dl = page.waitForEvent('download', {timeout: 15000}).then((d) => `download: ${d.suggestedFilename()}`).catch((e) => `no download: ${String(e).slice(0, 80)}`);
                await link.click();
                log('[s9dl download]', await dl);
            });
            // s13 — competing interests, accept with a statement
            await sect('s13', async () => {
                const id = sc.subs.s13.submissionId;
                await page.goto(wizard(id)); await idle(page); await noLoading(page);
                const s1 = await snap(page, `s13-step1-${app.name}`);
                log('[s13 step1 text]', flat(s1.text.main, 1600));
                const radios = page.locator('input[name="competingInterestOption"]');
                log('[s13 radios]', JSON.stringify(await radios.evaluateAll((els) => els.map((e) => `${e.value}:checked=${e.checked}`))),
                    '| labels:', JSON.stringify(await page.locator('label[for="noCompetingInterests"], label[for="hasCompetingInterests"]').allTextContents()),
                    '| statement iframe:', await page.locator('iframe[id^="reviewerCompetingInterests"]').count());
                const ciLink = page.getByRole('link', {name: /Competing Interests/}).first();
                await loc(page, 'step 1 › Competing Interests policy link', ciLink);
                await ciLink.click();
                const d = page.getByRole('dialog').filter({hasText: /Competing Interests/}).last(); await d.waitFor({timeout: 15000});
                log('[s13 CI dialog]', flat(await d.innerText(), 300), '| buttons:', JSON.stringify(await d.getByRole('button').allTextContents()));
                record(`s13-ci-dialog-${app.name}`, {aria: await d.ariaSnapshot(), text: await d.innerText()});
                await d.getByRole('button', {name: 'OK', exact: true}).click(); await d.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await page.locator('#hasCompetingInterests').check();
                await tiny(page, 'reviewerCompetingInterests', 'U28K4 CI statement by the reviewer');
                await snap(page, `s13-step1-has-ci-${app.name}`);
                await acceptStep1(page);
                log('[s13 accepted] tabs=', JSON.stringify(await tabsOf(page)));
                if (sc.subs.s13.formAttached) {
                    await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                    await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                    log('[s13 step3] fieldsets:', await page.locator('fieldset[id^="reviewFormResponses"]').count(), '| answered radios:', await page.locator('input[type=radio][name^="reviewFormResponses"]:checked').count());
                    const st = []; const onR = (r) => { if (/saveStep/.test(r.url())) st.push(`${r.status()} ${r.url().slice(-40)}`); }; page.on('response', onR);
                    await page.getByRole('button', {name: 'Save for Later'}).click();
                    await page.locator('[role=status]:visible, .pkpNotification:visible, #reviewStep3MessageBox:visible').first().waitFor({timeout: 5000}).catch(() => {});
                    await idle(page); page.off('response', onR);
                    await snap(page, `s13-save-later-unanswered-natural-${app.name}`);
                    log('[s13 save later unanswered, natural landing] url=', page.url(), 'saveStep=', JSON.stringify(st), 'notes=', JSON.stringify(await visibleNotes(page)), 'tabs=', JSON.stringify(await tabsOf(page)));
                    await page.reload(); await idle(page); await noLoading(page);
                    log('[s13 after reload] tabs=', JSON.stringify(await tabsOf(page)), '| answered radios:', await page.locator('input[type=radio][name^="reviewFormResponses"]:checked').count());
                }
            });
            // s13b — competing interests, decline with a statement
            await sect('s13b', async () => {
                const id = sc.subs.s13b.submissionId;
                await page.goto(wizard(id)); await idle(page); await noLoading(page);
                await page.locator('#hasCompetingInterests').check();
                await tiny(page, 'reviewerCompetingInterests', 'U28K4 CI statement before declining');
                await page.getByRole('link', {name: 'Decline Review Request'}).click();
                const dlg = page.getByRole('dialog').filter({hasText: /Decline Review Request/}).last(); await dlg.waitFor({timeout: 15000});
                await dlg.locator('iframe').first().waitFor({timeout: 15000}).catch(() => {});
                await idle(page);
                record(`s13b-decline-window-${app.name}`, {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
                await dlg.getByRole('button', {name: 'Decline Review Request'}).click();
                await page.waitForURL((u) => !/reviewer\/submission/.test(u.pathname), {timeout: 30000}).catch(() => {}); await idle(page);
                log('[s13b declined] landed', page.url());
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---- editor: badges ---------------------------------------------------------
    const editorRows = async (page, label, keys, details) => {
        for (const k of keys) {
            await sect(`${label} ${k}`, async () => {
                await openRound(page, sc.subs[k].submissionId);
                const row = revRow(page); await row.waitFor({timeout: 30000});
                const s = await snap(page, `${label}-${k}-reviewers-${app.name}`);
                log(`[${label} ${k} row]`, flat(await row.innerText(), 300), '| badge cells:', JSON.stringify(await row.locator('.pkpBadge, [class*="badge"]').allTextContents().catch(() => [])));
                if (details) {
                    await row.getByRole('button', {name: 'More Actions'}).click();
                    log(`[${label} ${k} menu]`, JSON.stringify((await page.getByRole('menuitem').allTextContents()).map((t) => t.trim())));
                    const item = page.getByRole('menuitem', {name: /Review Details|Read Review/}).first();
                    if (await item.count()) {
                        await item.click();
                        const d = page.getByRole('dialog').last(); await d.waitFor({timeout: 15000});
                        await page.waitForFunction(() => { const x = [...document.querySelectorAll('[role=dialog]')].pop(); return x && x.innerText.length > 150; }, null, {timeout: 15000}).catch(() => {});
                        await idle(page);
                        record(`${label}-${k}-details-${app.name}`, {aria: await d.ariaSnapshot(), text: await d.innerText()});
                        log(`[${label} ${k} details]`, flat(await d.innerText(), 700));
                        await d.getByRole('button', {name: /^(Cancel|Close)$/}).first().click().catch(() => page.keyboard.press('Escape'));
                    } else await page.keyboard.press('Escape');
                }
            });
        }
    };
    if (phase('ed1')) {
        const {page, close} = await launch(app);
        try { await signIn(page, sc.users.ed); await editorRows(page, 'ed1', process.env.ED_KEYS ? process.env.ED_KEYS.split(',') : ['s13', 's13b'], true); await signOut(page); } finally { await close(); }
    }
    if (phase('rev2')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.users.rev);
            await sect('rev2 s13 discard', async () => {
                await page.goto(`${wizard(sc.subs.s13.submissionId)}?step=1`); await idle(page); await noLoading(page);
                await page.getByRole('tab', {name: '1. Request'}).click().catch(() => {}); await idle(page);
                log('[rev2 s13 step1 radios]', JSON.stringify(await page.locator('input[name="competingInterestOption"]').evaluateAll((els) => els.map((e) => `${e.value}:checked=${e.checked}:disabled=${e.disabled}`))),
                    '| statement:', flat(await page.frameLocator('iframe[id^="reviewerCompetingInterests"]').first().locator('body').innerText().catch(() => 'no iframe'), 120));
                await page.locator('#noCompetingInterests').check();
                await snap(page, `rev2-s13-step1-no-ci-${app.name}`);
                const btn = page.getByRole('button', {name: /Save and continue|Continue to Step #2/}).first();
                log('[rev2 s13 step1 button]', await btn.textContent().catch(() => 'NONE'));
                await btn.click(); await waitTab(page, 2);
                log('[rev2 s13 after save] tabs=', JSON.stringify(await tabsOf(page)));
            });
            await signOut(page);
        } finally { await close(); }
    }
    if (phase('ed2')) {
        const {page, close} = await launch(app);
        try { await signIn(page, sc.users.ed); await editorRows(page, 'ed2', ['s13'], true); await signOut(page); } finally { await close(); }
    }

    // ---- one-click ----------------------------------------------------------------
    const mailsFor = async (to, t) => {
        const list = (await app.mail._search({to, contains: t})).messages || [];
        const full = await Promise.all(list.map((m) => app.mail.fullMessage(m.ID)));
        return full.map((f) => ({subject: f.Subject, date: f.Date, from: f.From && f.From.Address, to: (f.To || []).map((x) => x.Address), links: hrefs(f.HTML || '').filter((h) => !/mail\.test|mailto:/.test(h)), text: (f.Text || '').slice(0, 1200)}));
    };
    const waitMails = async (to, t, n) => { let m = []; for (let i = 0; i < 30 && m.length < n; i++) { m = await mailsFor(to, t); if (m.length < n) await new Promise((r) => setTimeout(r, 500)); } return m; };
    const linkOf = (m) => m && (m.links.find((l) => /key=/.test(l)) || m.links.find((l) => /reviewer|invitation/.test(l)));
    const addReviewer = async (page, k) => {
        const id = sc.subs[k].submissionId;
        await openRound(page, id);
        if (await revRow(page).count()) { log(`[add ${k}] already assigned`); return 'existing'; }
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        const dlg = page.getByRole('dialog').filter({hasText: 'Add Reviewer'}).last(); await dlg.waitFor({timeout: 30000});
        const entry = dlg.locator('.listPanel__item').filter({hasText: 'Dora'}).first(); await entry.waitFor({timeout: 30000});
        // app-changes row 4: wait for the hidden request-letter editor to be initialised before selecting
        await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000});
        await entry.getByRole('button', {name: /Select/}).first().click(); await idle(page);
        await dlg.locator('#regularReviewerForm').waitFor({state: 'visible', timeout: 30000});
        await page.waitForFunction(() => { const f = [...document.querySelectorAll('iframe[id^="personalMessage"]')].pop(); return !!(f && f.contentDocument && f.contentDocument.body && f.contentDocument.body.innerText.trim().length > 20); }, null, {timeout: 30000}).catch(() => {});
        if (k === 'o1') record(`oneclick-add-reviewer-window-${app.name}`, {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
        const st = []; const onR = (r) => { if (/update-reviewer/.test(r.url())) st.push(r.status()); }; page.on('response', onR);
        await dlg.locator('#regularReviewerForm').getByRole('button', {name: 'Add Reviewer', exact: true}).click();
        let stuck = false;
        await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 30000}).catch(async () => { stuck = true; await dlg.getByRole('button', {name: 'Close'}).first().click().catch(() => {}); });
        page.off('response', onR); await idle(page);
        log(`[add ${k}] update-reviewer=`, JSON.stringify(st), stuck ? 'WINDOW STAYED OPEN' : '');
        return stuck ? 'stuck' : 'added';
    };
    const openFresh = async (name, url, {as} = {}) => {
        const {page, close} = await launch(app);
        try {
            if (as) await signIn(page, as);
            const hs = await hops(page, url);
            const s = await screen(page);
            const body = (await page.locator('body').innerText().catch(() => ''));
            record(`${name}-${app.name}`, {hops: hs, screen: s, headerUser: await headerUser(page), bodyLength: body.length});
            await shot(page, `${name}-${app.name}`);
            log(`[${name}] hops=`, JSON.stringify(hs.map((h) => `${h.status} ${h.url.slice(h.url.indexOf('/index.php'))}`)), '\n   final=', page.url().slice(page.url().indexOf('/index.php')), '| title=', s.title, '| header=', JSON.stringify(await headerUser(page)), '| tabs=', JSON.stringify(await tabsOf(page)), '| bodyLength=', body.length, '\n   text=', flat(body, 350));
            return {page, close, hs};
        } catch (e) { await close(); throw e; }
    };
    if (phase('oneclick')) {
        const ed = await launch(app);
        try {
            await signIn(ed.page, sc.users.ed);
            // o1: request link → wizard; again → wizard; accept + submit; again → Unavailable
            await sect('o1', async () => {
                if (!sc.subs.o1.added) { sc.subs.o1.added = await addReviewer(ed.page, 'o1'); saveScratch(); }
                const m = await waitMails(revMail(), sc.subs.o1.tag, 1); record(`oneclick-mail-o1-request-${app.name}`, m);
                log('[o1 mail]', JSON.stringify(m.map((x) => ({subject: x.subject, from: x.from, links: x.links}))), '\n   text=', flat(m[0] && m[0].text, 600));
                const L1 = linkOf(m[0]); sc.subs.o1.link = L1; saveScratch();
                const a = await openFresh('oneclick-o1-first-open', L1); await a.close();
                const b = await openFresh('oneclick-o1-second-open', L1);
                try {
                    await acceptStep1(b.page);
                    await b.page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(b.page, 3);
                    await b.page.locator('form#reviewStep3Form').waitFor({timeout: 30000});
                    const c = b.page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').first().locator('body'); await c.click(); await c.fill('U28K4 one-click review text');
                    if (app.name === 'ojs') await b.page.locator('select#reviewerRecommendationId').selectOption({index: 1});
                    await submitReview(b.page, 'o1'); await waitTab(b.page, 4);
                    log('[o1 submitted] tabs=', JSON.stringify(await tabsOf(b.page)));
                    await snap(b.page, `oneclick-o1-step4-${app.name}`);
                } finally { await b.close(); }
                const c2 = await openFresh('oneclick-o1-after-submit', L1); await c2.close();
            });
            // o2: request link → wizard → decline; again → ?
            await sect('o2', async () => {
                if (!sc.subs.o2.added) { sc.subs.o2.added = await addReviewer(ed.page, 'o2'); saveScratch(); }
                const m = await waitMails(revMail(), sc.subs.o2.tag, 1);
                const L2 = linkOf(m[0]); sc.subs.o2.link = L2; saveScratch();
                const a = await openFresh('oneclick-o2-open', L2);
                try {
                    await a.page.getByRole('link', {name: 'Decline Review Request'}).click();
                    const dlg = a.page.getByRole('dialog').filter({hasText: /Decline Review Request/}).last(); await dlg.waitFor({timeout: 15000});
                    await dlg.locator('iframe').first().waitFor({timeout: 15000}).catch(() => {}); await idle(a.page);
                    await dlg.getByRole('button', {name: 'Decline Review Request'}).click();
                    await a.page.waitForURL((u) => !/reviewer\/submission/.test(u.pathname), {timeout: 30000}).catch(() => {}); await idle(a.page);
                    log('[o2 declined] landed', a.page.url());
                } finally { await a.close(); }
                const b = await openFresh('oneclick-o2-after-decline', L2); await b.close();
            });
            // o3 then o4: the earlier pending request link after a later request (A9)
            await sect('o3-o4', async () => {
                if (!sc.subs.o3.added) { sc.subs.o3.added = await addReviewer(ed.page, 'o3'); saveScratch(); }
                const m3 = await waitMails(revMail(), sc.subs.o3.tag, 1); const L3 = linkOf(m3[0]); sc.subs.o3.link = L3;
                if (!sc.subs.o4.added) { sc.subs.o4.added = await addReviewer(ed.page, 'o4'); saveScratch(); }
                const m4 = await waitMails(revMail(), sc.subs.o4.tag, 1); const L4 = linkOf(m4[0]); sc.subs.o4.link = L4; saveScratch();
                log('[o3 link]', L3, '\n[o4 link]', L4);
                const a = await openFresh('oneclick-o3-after-o4-request', L3); await a.close();
                const b = await openFresh('oneclick-o4-fresh', L4); await b.close();
                // reminder on o4: dates into the past, "Send Reminder"
                await openRound(ed.page, sc.subs.o4.submissionId);
                const edit = await openEdit(ed.page);
                await pickDate(ed.page, edit, 'responseDueDate', new Date(2026, 7, 25)); await pickDate(ed.page, edit, 'reviewDueDate', new Date(2026, 8, 1));
                await okEdit(ed.page, edit);
                await ed.page.reload(); await idle(ed.page); await noLoading(ed.page);
                await revRow(ed.page).waitFor({timeout: 30000});
                log('[o4 row after dates]', flat(await revRow(ed.page).innerText(), 200));
                const remBtn = revRow(ed.page).getByRole('button', {name: 'Send Reminder'});
                await loc(ed.page, 'Reviewers row (overdue) › Send Reminder', remBtn);
                await remBtn.first().click();
                const rd = ed.page.getByRole('dialog').filter({hasText: /Reminder/}).last(); await rd.waitFor({timeout: 15000});
                await ed.page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 200; }, null, {timeout: 15000}).catch(() => {}); await idle(ed.page);
                record(`oneclick-o4-reminder-dialog-${app.name}`, {aria: await rd.ariaSnapshot(), text: await rd.innerText()});
                await rd.getByRole('button', {name: /Send Reminder|Send/}).last().click();
                await ed.page.locator('form[id*="eminder"]').waitFor({state: 'hidden', timeout: 30000}).catch(() => log('[o4 reminder window stayed open]'));
                await idle(ed.page);
                const m4b = await waitMails(revMail(), sc.subs.o4.tag, 2); record(`oneclick-mail-o4-all-${app.name}`, m4b);
                log('[o4 mails]', JSON.stringify(m4b.map((x) => ({subject: x.subject, date: x.date, links: x.links}))));
                const rem = m4b.find((x) => /remind/i.test(x.subject)) || m4b[0];
                const L4r = linkOf(rem); sc.subs.o4.reminderLink = L4r; saveScratch();
                log('[o4 reminder text]', flat(rem && rem.text, 500));
                const c = await openFresh('oneclick-o4-request-after-reminder', L4); await c.close();
                const d = await openFresh('oneclick-o4-reminder-fresh', L4r); await d.close();
                const e = await openFresh('oneclick-o4-reminder-as-author', L4r, {as: sc.users.au}); await e.close();
            });
            await signOut(ed.page);
        } finally { await ed.close(); }
    }

    // ---- off: One-click off, the plain link ------------------------------------------
    if (phase('off')) {
        await sect('off', async () => {
            const m = await launch(app);
            try {
                await signIn(m.page, sc.users.mgr);
                await m.page.goto(settings()); await idle(m.page);
                await m.page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(m.page);
                await m.page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(m.page);
                await m.page.locator('input[name="reviewerAccessKeysEnabled"]').uncheck();
                await m.page.locator('#reviewSetup').getByRole('button', {name: 'Save', exact: true}).click();
                await m.page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
                await idle(m.page);
                await signOut(m.page);
            } finally { await m.close(); }
            const ed = await launch(app);
            try { await signIn(ed.page, sc.users.ed); if (!sc.subs.o5.added) { sc.subs.o5.added = await addReviewer(ed.page, 'o5'); saveScratch(); } await signOut(ed.page); } finally { await ed.close(); }
            const mm = await waitMails(revMail(), sc.subs.o5.tag, 1); record(`off-mail-o5-request-${app.name}`, mm);
            const L5 = linkOf(mm[0]); log('[o5 mail]', JSON.stringify(mm.map((x) => ({subject: x.subject, links: x.links}))));
            const a = await openFresh('off-o5-link-signedout', L5);
            try {
                const u = a.page.locator('input#username');
                if (await u.count()) {
                    await u.fill(sc.users.rev);
                    const p = a.page.locator('input#password'); await p.evaluate((e) => e.removeAttribute('maxlength')); await p.fill(`${sc.users.rev}${sc.users.rev}`);
                    await a.page.locator('form#login button[type=submit], form#login input[type=submit]').first().click();
                    await a.page.waitForURL((x) => !/\/login/.test(x.pathname), {timeout: 30000}).catch(() => {}); await idle(a.page);
                    const s = await snap(a.page, `off-o5-after-login-${app.name}`);
                    log('[o5 after login]', a.page.url().slice(a.page.url().indexOf('/index.php')), JSON.stringify(await tabsOf(a.page)), flat(s.text.main, 200));
                }
            } finally { await a.close(); }
        });
    }
    // ---- mode: Default Review Mode → "Open"; {OJS} a custom reviewer recommendation; a fresh assignment ----
    if (phase('mode')) {
        await sect('mode settings', async () => {
            const {page, close} = await launch(app);
            try {
                await signIn(page, sc.users.mgr);
                await page.goto(settings()); await idle(page);
                await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
                await page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
                const open = page.locator('input[name="defaultReviewMode"][value="3"]');
                await loc(page, 'Review › Setup › Default Review Mode "Open" radio', open);
                await open.check();
                await page.locator('#reviewSetup').getByRole('button', {name: 'Save', exact: true}).click();
                await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                log('[mode] defaultReviewMode checked =', await page.locator('input[name="defaultReviewMode"]:checked').evaluate((e) => e.value));
                if (app.name === 'ojs') {
                    await page.getByRole('tab', {name: /Reviewer Recommendations/}).click(); await idle(page);
                    await noLoading(page);
                    const s = await snap(page, `mode-reviewer-recommendations-${app.name}`);
                    log('[recommendations tab text]', flat(s.text.main.slice(s.text.main.indexOf('Reviewer Recommendations')), 900));
                    const add = page.locator('main').getByRole('button', {name: /Add|New/}).first();
                    log('[recommendations add control]', await add.count(), await add.textContent().catch(() => ''));
                    await add.click();
                    const d = page.getByRole('dialog').last(); await d.waitFor({timeout: 15000}); await idle(page);
                    log('[recommendation dialog]', flat(await d.innerText(), 400));
                    const tb = d.getByRole('textbox').first(); await tb.fill('U28K4 custom recommendation');
                    await d.getByRole('button', {name: /^(Save|Add|Create)/}).first().click();
                    await d.waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page); await noLoading(page);
                    const s2 = await snap(page, `mode-reviewer-recommendations-added-${app.name}`);
                    log('[recommendations after add]', flat(s2.text.main.slice(s2.text.main.indexOf('Reviewer Recommendations')), 900));
                }
                await signOut(page);
            } finally { await close(); }
        });
        await seedOne('o6', true);
        await sect('mode reviewer', async () => {
            const {page, close} = await launch(app);
            try {
                await signIn(page, sc.users.rev);
                await page.goto(wizard(sc.subs.o6.submissionId)); await idle(page); await noLoading(page);
                const s1 = await snap(page, `mode-o6-step1-${app.name}`);
                const t = s1.text.main; log('[o6 step1 review type]', flat(t.slice(t.indexOf('Review Type'), t.indexOf('Review Type') + 60)));
                await acceptStep1(page);
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await noLoading(page);
                await snap(page, `mode-o6-step3-${app.name}`);
                if (app.name === 'ojs') log('[o6 step3 recommendation options]', JSON.stringify(await page.locator('select#reviewerRecommendationId option').allTextContents()));
                await signOut(page);
            } finally { await close(); }
        });
    }
    // ---- reco ({OJS}): a custom reviewer recommendation reaches the step-3 list ----
    if (phase('reco') && app.name === 'ojs') {
        await sect('reco', async () => {
            const {page, close} = await launch(app);
            try {
                await signIn(page, sc.users.mgr);
                await page.goto(settings()); await idle(page);
                await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
                await page.getByRole('tab', {name: /Reviewer Recommendations/}).click(); await idle(page); await noLoading(page);
                await page.locator('main').getByRole('button', {name: /Add Recommendation/}).first().click();
                const d = page.getByRole('dialog').last(); await d.waitFor({timeout: 15000}); await idle(page);
                await d.getByRole('textbox').first().fill('U28K4 custom recommendation');
                const sel = d.locator('select').first();
                if (await sel.count()) await sel.selectOption({index: 1});
                else await d.getByRole('radio').first().check().catch(() => {});
                log('[reco dialog controls]', flat(await d.ariaSnapshot(), 900));
                await d.getByRole('button', {name: 'Save', exact: true}).click();
                await d.waitFor({state: 'hidden', timeout: 15000}).catch(async () => log('[reco dialog stayed open]', flat(await d.innerText(), 400)));
                await idle(page); await noLoading(page);
                const s2 = await snap(page, `reco-recommendations-added-${app.name}`);
                log('[reco after add]', flat(s2.text.main.slice(s2.text.main.indexOf('RECOMMENDATIONS')), 600));
                await signOut(page);
                await signIn(page, sc.users.rev);
                await page.goto(`${wizard(sc.subs.o6.submissionId)}?step=3`); await idle(page); await noLoading(page);
                await snap(page, `reco-o6-step3-${app.name}`);
                log('[reco o6 step3 options]', JSON.stringify(await page.locator('select#reviewerRecommendationId option').allTextContents()));
                await signOut(page);
            } finally { await close(); }
        });
    }
    saveScratch();
});
