// U29 claim check, chunk K2: the Setup values downstream — the Add Reviewer window, the
// reviewer's files step, the one-click link, the author's suggestion step, the round status
// box; Side effects; "Settings that modify behavior"; Cross-feature interactions; A4;
// scenario 2.  Rules 2, 5, 6 (spec lines 137–144, 158–169), 324–411, 431–441.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U29/K2/k2.js
//   PHASES=seed,off,settings,down,oneclick,a4,side,xf   (default all; later phases reuse scratch.json)
//   SECTS=<name,...>                                    (narrow the sect() blocks inside a phase)
//
// OPS is skipped: it has no Review tab and no reviewer role (U29 pD, seed-facts).
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const all = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const save = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(all, null, 2));
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : null;
const phase = (p) => !PHASES || PHASES.includes(p);
const SECTS = process.env.SECTS ? process.env.SECTS.split(',') : null;
const log = (...a) => console.log(...a);
const flat = (s, n = 800) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const today = () => new Date().toISOString().slice(0, 10);
const plus = (d) => { const x = new Date(); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const hrefs = (html) => { const out = []; const re = /href=(["'])([^"']+)\1/gi; let m; while ((m = re.exec(html))) out.push(m[2].replace(/&amp;/g, '&')); return out; };

async function sect(name, fn) { if (SECTS && !SECTS.includes(name)) return; try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name) { const s = await screen(page); record(name, s); await shot(page, name); return s; }
const visibleNotes = (page) => page.locator('[role=status], [role=alert], .pkpNotification, .pkp_notification, .pkpToast').evaluateAll((els) =>
    els.filter((e) => e.getClientRects().length > 0).map((e) => e.innerText.trim().replace(/\n+/g, ' / ')).filter(Boolean)).catch(() => []);

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[skip] OPS: no Review tab, no reviewer role'); return; }
    const sc = all[app.name] = all[app.name] || {};
    const RESULTS = path.join(outDir(), `k2-results-${app.name}.json`);
    const out = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {};
    const results = () => record(`k2-results`, out);
    const P = (p) => `/index.php/${sc.path}/en/${p}`;
    const setupUrl = () => app.url(P('management/settings/workflow#review/reviewSetup'));
    const workflow = (id) => app.url(P(`dashboard/editorial?workflowSubmissionId=${id}`));
    const wizard = (id) => app.url(P(`reviewer/submission/${id}`));
    const mailOf = (u) => `${u}@mail.test`;
    const omp = app.name === 'omp';

    // ---------------- seed
    if (phase('seed') && !sc.path) {
        const t = tag('u29k2');
        const ctx = await app.api.createContext({
            tag: t,
            users: [
                {username: `${t}mgr`, roles: ['manager'], givenName: 'Kay', familyName: 'Manager'},
                {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Kim', familyName: 'Editor'},
                {username: `${t}au`, roles: ['author'], givenName: 'Kai', familyName: 'Author'},
                {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Kira', familyName: 'Seeded'},
                {username: `${t}rev2`, roles: ['externalReviewer'], givenName: 'Kolya', familyName: 'Later'},
            ],
            // Guidance texts and the anonymity box come from the passthrough (K3 owns their tab);
            // Setup stays at the install defaults so the seeded request carries them.
            review: {reviewGuidelines: `U29K2 guidelines ${t}`, competingInterests: `U29K2 policy ${t}`, showEnsuringLink: true},
        });
        Object.assign(sc, {tag: t, path: ctx.path, contextId: ctx.contextId,
            mgr: `${t}mgr`, ed: `${t}ed`, au: `${t}au`, rev: `${t}rev`, rev2: `${t}rev2`});
        const s1 = await app.api.createSubmission({
            tag: `${t}s1`, context: sc.path, submitter: sc.au, submitted: true, title: `U29K2 in review ${t}`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{...(omp ? {stage: 'external'} : {}), reviewers: [{username: sc.rev, status: 'invited'}]}],
            participants: [{username: sc.ed, role: 'sectionEditor'}],
        });
        sc.s1 = s1.submissionId;
        const d1 = await app.api.createSubmission({tag: `${t}d1`, context: sc.path, submitter: sc.au, submitted: false, title: `U29K2 draft ${t}`});
        sc.d1 = d1.submissionId;
        sc.seededAt = new Date().toISOString();
        save();
        log('[seed]', app.name, sc.path, 's1', sc.s1, 'd1', sc.d1);
    }
    out.scratch = sc;

    // helpers on the workflow page
    const openReviewStage = async (page) => {
        await page.goto(workflow(sc.s1)); await idle(page);
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().waitFor({timeout: 30000});
    };
    const readAddReviewer = async (page, name, {select = /Kolya|Later/} = {}) => {
        await openReviewStage(page);
        await page.getByRole('button', {name: 'Add Reviewer', exact: true}).first().click();
        const dlg = page.getByRole('dialog').last();
        const entry = dlg.locator('.listPanel__item').filter({hasText: select}).first();
        await entry.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const ta = document.querySelector('textarea[name="personalMessage"]'); const mce = window.tinyMCE || window.tinymce; return !!(ta && mce?.get(ta.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
        const entries = await dlg.locator('.listPanel__item').allInnerTexts().catch(() => []);
        await entry.getByRole('button', {name: /^Select /}).first().click();
        await dlg.locator('input.datepicker').first().waitFor({timeout: 30000});
        const form = await dlg.evaluate((d) => {
            const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
            return {
                radios: [...d.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: t(r.closest('label') || r.parentElement)})),
                checkboxes: [...d.querySelectorAll('input[type=checkbox]')].map((c) => ({name: c.name, checked: c.checked, label: t(c.closest('label') || c.parentElement)})),
                dates: [...d.querySelectorAll('input[name*="DueDate"]')].map((i) => ({name: i.name, value: i.value})),
                selects: [...d.querySelectorAll('select')].map((s) => ({name: s.name, id: s.id, value: s.value, options: [...s.options].map((o) => o.text), visible: s.getClientRects().length > 0})),
                text: d.innerText,
            };
        });
        await snap(page, name);
        return {dlg, form, entries: entries.map((e) => flat(e, 80))};
    };
    const readEditWindow = async (page, name, who = /Kira|Seeded/) => {
        await openReviewStage(page);
        const row = page.getByRole('row', {name: who}).first();
        await row.getByRole('button', {name: 'More Actions'}).click();
        await page.getByRole('menuitem', {name: /^Edit/}).first().click();
        await page.locator('form#editReviewForm').waitFor({timeout: 30000});
        const dlg = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
        const form = await dlg.evaluate((d) => {
            const t = (el) => (el ? el.innerText.trim().replace(/\s+/g, ' ') : null);
            return {
                radios: [...d.querySelectorAll('input[type=radio]')].map((r) => ({name: r.name, value: r.value, checked: r.checked, label: t(r.closest('label') || r.parentElement)})),
                checkboxes: [...d.querySelectorAll('input[type=checkbox]')].map((c) => ({name: c.name, checked: c.checked, label: t(c.closest('label') || c.parentElement)})),
                dates: [...d.querySelectorAll('input[name*="DueDate"]')].map((i) => ({name: i.name, value: i.value})),
                selects: [...d.querySelectorAll('select')].map((s) => ({name: s.name, id: s.id, value: s.value, options: [...s.options].map((o) => o.text)})),
                text: d.innerText,
            };
        });
        await snap(page, name);
        await dlg.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
        return form;
    };
    const openSetup = async (page) => {
        await page.goto(setupUrl()); await idle(page);
        const review = page.getByRole('tab', {name: 'Review', exact: true});
        if ((await review.getAttribute('aria-selected')) !== 'true') await review.click();
        const setup = page.getByRole('tab', {name: 'Setup', exact: true});
        if ((await setup.getAttribute('aria-selected')) !== 'true') await setup.click();
        await page.getByRole('textbox', {name: 'Default Response Deadline'}).waitFor({timeout: 30000});
    };
    const saveSetup = async (page) => {
        const panel = page.locator('[role="tabpanel"]:visible').last();
        const waited = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && ['PUT', 'POST'].includes(r.request().method()), {timeout: 20000}).catch(() => null);
        await panel.getByRole('button', {name: 'Save', exact: true}).click();
        const resp = await waited;
        await page.waitForFunction(() => /Saved/.test(document.querySelector('.pkpFormPage__status')?.innerText || ''), null, {timeout: 10000}).catch(() => {});
        const status = await page.locator('.pkpFormPage__status').last().innerText().catch(() => null);
        return {http: resp ? resp.status() : null, status: flat(status, 60)};
    };
    const wizardSteps = async (page, name) => {
        await page.goto(app.url(P(`submission?id=${sc.d1}`))); await idle(page);
        await page.locator('[role=tab], .submissionWizard__steps, nav').first().waitFor({timeout: 30000}).catch(() => {});
        const s = await snap(page, name);
        const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
        const steps = await page.locator('.submissionWizard__steps li, ol li, [class*="steps"] li').allInnerTexts().catch(() => []);
        return {url: page.url(), tabs: tabs.map((t) => flat(t, 60)), steps: steps.map((t) => flat(t, 60)), hasSuggest: /suggest/i.test(s.text.main || '')};
    };
    const reviewStageText = async (page, name) => {
        await openReviewStage(page);
        await snap(page, name);
        const panel = await page.locator('[role=dialog]').last().innerText().catch(() => '');
        const m = panel.match(/Minimum number of confirmed reviews required[^\n]*/);
        const sub = await (async () => {
            await page.locator('[role=dialog]').last().getByRole('link', {name: 'Submission', exact: true}).click().catch(() => {});
            await idle(page);
            return page.locator('[role=dialog]').last().innerText().catch(() => '');
        })();
        return {minimumLine: m ? m[0] : null, reviewSuggestLines: (panel.match(/[^\n]*suggest[^\n]*/gi) || []).slice(0, 4), submissionSuggestLines: (sub.match(/[^\n]*suggest[^\n]*/gi) || []).slice(0, 4)};
    };

    // ---------------- off: the default end (before any Setup change)
    if (phase('off')) {
        out.off = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.au, {contextPath: sc.path});
            await sect('author wizard off', async () => { out.off.wizard = await wizardSteps(page, 'off-author-wizard'); log('[off wizard]', JSON.stringify(out.off.wizard)); });
            await signOut(page);
            await signIn(page, sc.ed, {contextPath: sc.path});
            await sect('review stage off', async () => { out.off.stage = await reviewStageText(page, 'off-review-stage'); log('[off stage]', JSON.stringify(out.off.stage)); });
            await sect('add reviewer off', async () => {
                const r = await readAddReviewer(page, 'off-add-reviewer');
                out.off.addReviewer = {entries: r.entries, radios: r.form.radios, checkboxes: r.form.checkboxes, dates: r.form.dates, selects: r.form.selects.map((s) => ({name: s.name, visible: s.visible, options: s.options.slice(0, 6)}))};
                out.off.today = today();
                log('[off add reviewer]', JSON.stringify(out.off.addReviewer));
                await r.dlg.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
            });
            await signOut(page);
        } finally { await close(); }
        results();
    }

    // ---------------- settings: scenario 2's values through the screen; nothing emailed
    if (phase('settings')) {
        out.settings = {};
        const mailBefore = {rev: (await app.mail._search({to: mailOf(sc.rev)})).messages?.length ?? null, mgr: (await app.mail._search({to: mailOf(sc.mgr)})).messages?.length ?? null};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await openSetup(page);
            await snap(page, 'settings-setup-before');
            await page.getByRole('radio', {name: 'Open', exact: true}).check();
            for (const n of ['defaultReviewPublicVisibility', 'restrictReviewerFileAccess', 'reviewerAccessKeysEnabled', 'reviewerSuggestionEnabled']) {
                await page.locator(`input[name="${n}"]`).check();
            }
            await page.getByRole('textbox', {name: 'Default Response Deadline', exact: true}).fill('2');
            await page.getByRole('textbox', {name: 'Default Completion Deadline', exact: true}).fill('6');
            await page.getByRole('textbox', {name: 'Minimum Confirmed Reviews Required', exact: true}).fill('2');
            out.settings.save = await saveSetup(page);
            await snap(page, 'settings-setup-saved');
            await page.goto(setupUrl()); await idle(page); await openSetup(page);
            out.settings.afterReload = await page.evaluate(() => ({
                mode: document.querySelector('input[name=defaultReviewMode]:checked')?.value,
                boxes: [...document.querySelectorAll('input[type=checkbox][name]')].filter((c) => c.getClientRects().length).map((c) => `${c.name}=${c.checked}`),
                texts: [...document.querySelectorAll('input[id^="reviewSetup-num"]')].map((i) => `${i.name}=${i.value}`),
            }));
            await snap(page, 'settings-setup-reloaded');
            log('[settings]', JSON.stringify(out.settings));
            await signOut(page);
        } finally { await close(); }
        const mailAfter = {rev: (await app.mail._search({to: mailOf(sc.rev)})).messages?.length ?? null, mgr: (await app.mail._search({to: mailOf(sc.mgr)})).messages?.length ?? null};
        out.settings.mail = {before: mailBefore, after: mailAfter};
        sc.settingsDone = true; save();
        results();
    }

    // ---------------- down: the values downstream (editor), the author's step, the round box
    if (phase('down')) {
        out.down = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.ed, {contextPath: sc.path});
            await sect('add reviewer on', async () => {
                const r = await readAddReviewer(page, 'down-add-reviewer-on');
                out.down.today = today(); out.down.expect = {response: plus(14), review: plus(42)};
                out.down.addReviewer = {entries: r.entries, radios: r.form.radios, checkboxes: r.form.checkboxes, dates: r.form.dates, selects: r.form.selects.map((s) => ({name: s.name, visible: s.visible, options: s.options.slice(0, 6)}))};
                log('[down add reviewer]', JSON.stringify(out.down.addReviewer), 'expect', JSON.stringify(out.down.expect));
                await loc(page, 'Add Reviewer › request form', r.dlg.locator('#regularReviewerForm'));
                // send the request (one-click on): the email carries the link Rule 5 names
                const st = []; const onR = (r2) => { if (/update-reviewer/.test(r2.url())) st.push(r2.status()); }; page.on('response', onR);
                await r.dlg.locator('#regularReviewerForm').getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                await page.locator('#regularReviewerForm').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                page.off('response', onR); await idle(page);
                out.down.added = st; sc.rev2Added = true; save();
                await snap(page, 'down-after-add');
                log('[down add]', JSON.stringify(st));
            });
            await sect('edit seeded row', async () => {
                out.down.editSeeded = await readEditWindow(page, 'down-edit-seeded-row');
                out.down.seededExpect = {response: sc.seededAt.slice(0, 10), plus28: plus(28)};
                log('[down edit seeded]', JSON.stringify({radios: out.down.editSeeded.radios, boxes: out.down.editSeeded.checkboxes, dates: out.down.editSeeded.dates, selects: out.down.editSeeded.selects.map((s) => s.name)}));
            });
            await sect('rows and history', async () => {
                await openReviewStage(page);
                out.down.rows = await page.getByRole('table', {name: 'Reviewers'}).getByRole('row').allInnerTexts().then((r) => r.map((x) => flat(x, 160))).catch(() => []);
                const row = page.getByRole('row', {name: /Kira|Seeded/}).first();
                await row.getByRole('button', {name: 'More Actions'}).click();
                out.down.seededMenu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
                await page.getByRole('menuitem', {name: /^History/}).first().click();
                const hist = page.locator('[role=dialog]').filter({hasText: /History/}).last();
                await hist.waitFor({timeout: 15000});
                await hist.locator('.pkp_controllers_grid tr, table tr, .listPanel__item').first().waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                out.down.seededHistory = flat(await hist.innerText(), 1500);
                await snap(page, 'down-seeded-history');
                log('[down history]', out.down.seededHistory);
                await hist.getByRole('button', {name: /Close|Cancel|OK/}).last().click().catch(() => page.keyboard.press('Escape'));
            });
            await sect('review stage on', async () => { out.down.stage = await reviewStageText(page, 'down-review-stage-on'); log('[down stage]', JSON.stringify(out.down.stage)); });
            await sect('anonymity link', async () => {
                await openReviewStage(page);
                await page.getByRole('button', {name: 'Upload/Select Files'}).first().click();
                const w = page.getByRole('dialog').filter({hasText: /Current Review Files/}).last();
                await w.waitFor({timeout: 20000});
                await w.getByRole('link', {name: 'Upload Review File'}).click();
                const up = page.locator('[role=dialog]').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
                await up.waitFor({timeout: 20000});
                await up.locator('a[id^="uploadForm-addUser-button-"], a:has-text("anonymized")').first().waitFor({timeout: 15000}).catch(() => {});
                out.down.anonLink = await up.getByRole('link', {name: /anonymized/}).count();
                await snap(page, 'down-upload-window');
                log('[down anonymity link]', out.down.anonLink);
                await up.getByRole('button', {name: 'Close'}).last().click().catch(() => page.keyboard.press('Escape'));
                await w.getByRole('button', {name: 'Close'}).last().click().catch(() => {});
            });
            await signOut(page);
            await signIn(page, sc.au, {contextPath: sc.path});
            await sect('author wizard on', async () => { out.down.wizard = await wizardSteps(page, 'down-author-wizard-on'); log('[down wizard]', JSON.stringify(out.down.wizard)); });
            await signOut(page);
        } finally { await close(); }
        results();
    }

    // ---------------- oneclick: the request email's link, the reviewer's files step
    if (phase('oneclick')) {
        out.oneclick = {};
        const list = async () => {
            const r = (await app.mail._search({to: mailOf(sc.rev2)})).messages || [];
            const full = await Promise.all(r.map((m) => app.mail.fullMessage(m.ID)));
            return full.map((f) => ({subject: f.Subject, links: hrefs(f.HTML || '').filter((h) => !/mail\.test|mailto:/.test(h)), text: flat(f.Text, 700)}));
        };
        let mails = []; for (let i = 0; i < 30 && !mails.length; i++) { mails = await list(); if (!mails.length) await new Promise((r) => setTimeout(r, 500)); }
        out.oneclick.mails = mails; record('oneclick-mails', mails);
        const link = mails[0] && (mails[0].links.find((l) => /key=/.test(l)) || mails[0].links.find((l) => /reviewer|invitation/.test(l)));
        out.oneclick.link = link;
        log('[oneclick mail]', JSON.stringify(mails.map((m) => ({subject: m.subject, links: m.links}))));
        // control: the seeded reviewer got no email (seed-facts) and the manager none after the save
        out.oneclick.seededRevMails = (await app.mail._search({to: mailOf(sc.rev)})).messages?.length ?? null;
        if (link) {
            const {page, close} = await launch(app);
            try {
                const hops = []; const h = (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) hops.push(`${r.status()} ${r.url().slice(r.url().indexOf('/index.php'))}`); };
                page.on('response', h);
                await page.goto(link, {waitUntil: 'commit'}).catch((e) => hops.push(String(e).slice(0, 120)));
                await idle(page).catch(() => {});
                page.off('response', h);
                const s = await snap(page, 'oneclick-landing-signedout');
                out.oneclick.hops = hops; out.oneclick.landing = {url: page.url(), title: s.title, tabs: await page.getByRole('tab').allInnerTexts().catch(() => [])};
                out.oneclick.step1 = {
                    reviewFilesHeading: await page.getByRole('heading', {name: 'Review Files'}).count(),
                    reviewFilesText: /Review Files/.test(s.text.main || ''),
                    fileLinks: await page.locator('a[href*="download-file"]').count(),
                    ciRadios: await page.locator('input[name="competingInterestOption"]').count(),
                    signedInAs: await page.locator('header button, .app__header button').allInnerTexts().then((a) => a.map((x) => x.trim()).filter((x) => /\w/.test(x) && !/Tasks|help|Skip/i.test(x))).catch(() => []),
                };
                log('[oneclick landing]', JSON.stringify(out.oneclick.landing), JSON.stringify(out.oneclick.step1), 'hops', JSON.stringify(hops));
                await loc(page, 'reviewer wizard step 1 (one-click landing)', page.locator('form#reviewStep1Form, [role=tab][aria-selected=true]').first());
                // step 2: the guidelines seeded through the passthrough
                await sect('step 2 guidelines', async () => {
                    const box = page.getByRole('checkbox', {name: /privacy statement/}); if (await box.count()) await box.check();
                    await page.getByRole('button', {name: 'Accept Review, Continue to Step #2'}).click();
                    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('2.'), null, {timeout: 30000}).catch(() => {});
                    await idle(page);
                    const s2 = await snap(page, 'oneclick-step2');
                    out.oneclick.step2 = {guidelinesShown: (s2.text.main || '').includes(`U29K2 guidelines ${sc.tag}`), text: flat((s2.text.main || '').slice((s2.text.main || '').indexOf('Reviewer Guidelines')), 300)};
                    await page.getByRole('button', {name: 'Continue to Step #3'}).click();
                    await page.locator('form#reviewStep3Form').waitFor({timeout: 30000}); await idle(page);
                    const s3 = await snap(page, 'oneclick-step3');
                    out.oneclick.step3 = {reviewFilesText: /Review Files/.test(s3.text.main || ''), fileLinks: await page.locator('a[href*="download-file"]').count(), noFiles: /No Files/i.test(s3.text.main || '')};
                    log('[oneclick step2/3]', JSON.stringify(out.oneclick.step2), JSON.stringify(out.oneclick.step3));
                });
            } finally { await close(); }
        }
        results();
    }

    // ---------------- a4: both deadlines 0 → the Add Reviewer window (the completion end was never driven)
    if (phase('a4')) {
        out.a4 = {};
        const {page, close} = await launch(app);
        try {
            const mails = async () => ({rev: (await app.mail._search({to: mailOf(sc.rev)})).messages?.length ?? null, rev2: (await app.mail._search({to: mailOf(sc.rev2)})).messages?.length ?? null, mgr: (await app.mail._search({to: mailOf(sc.mgr)})).messages?.length ?? null, ed: (await app.mail._search({to: mailOf(sc.ed)})).messages?.length ?? null});
            out.a4.mailBefore = await mails();
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await openSetup(page);
            await page.getByRole('textbox', {name: 'Default Response Deadline', exact: true}).fill('0');
            await page.getByRole('textbox', {name: 'Default Completion Deadline', exact: true}).fill('0');
            out.a4.save = await saveSetup(page);
            await snap(page, 'a4-setup-zero-saved');
            out.a4.mailAfter = await mails();
            await signOut(page);
            await signIn(page, sc.ed, {contextPath: sc.path});
            // the seeded reviewer is unassigned (her row was read under 'down') so a "Select" entry exists again
            await openReviewStage(page);
            const row = page.getByRole('row', {name: /Kira|Seeded/}).first();
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menuitem', {name: /Unassign/}).first().click();
            const conf = page.locator('[role=dialog]').last(); await conf.waitFor({timeout: 15000});
            out.a4.unassignDialog = flat(await conf.innerText(), 300);
            await conf.getByRole('button', {name: /^(OK|Yes|Unassign)/}).first().click(); await idle(page);
            const r = await readAddReviewer(page, 'a4-add-reviewer-zero-zero', {select: /Kira|Seeded/});
            out.a4.today = today(); out.a4.plus21 = plus(21); out.a4.plus28 = plus(28);
            out.a4.dates = r.form.dates; out.a4.entries = r.entries;
            log('[a4]', JSON.stringify(out.a4));
            await r.dlg.getByRole('button', {name: 'Cancel', exact: true}).last().click().catch(() => {});
            await signOut(page);
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await openSetup(page);
            await page.getByRole('textbox', {name: 'Default Response Deadline', exact: true}).fill('2');
            await page.getByRole('textbox', {name: 'Default Completion Deadline', exact: true}).fill('6');
            out.a4.restore = await saveSetup(page);
            await signOut(page);
        } finally { await close(); }
        results();
    }

    // ---------------- suggest: the author's step 5 with one suggestion, submitted; the editor's panel
    if (phase('suggest')) {
        out.suggest = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.au, {contextPath: sc.path});
            await sect('step5', async () => {
                // the step rail is not clickable: walk with "Continue"; step 1 gets the fixture PDF
                await page.goto(app.url(P(`submission?id=${sc.d1}`))); await idle(page);
                await page.getByRole('button', {name: 'Continue'}).first().waitFor({timeout: 30000});
                const fileInput = page.locator('input[type=file]').first();
                if (await fileInput.count() && !(await page.locator('body').innerText()).includes('article.pdf')) {
                    await fileInput.setInputFiles(path.join(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/article.pdf'));
                    await page.waitForFunction(() => document.body.innerText.includes('article.pdf'), null, {timeout: 30000}).catch(() => {});
                    await idle(page);
                }
                // every file without a type shows "What kind of file is this?" with one link-button per primary genre: take the first
                for (let i = 0; i < 6; i++) {
                    const prompt = page.locator('.listPanel--submissionFiles__setGenre').first();
                    if (!(await prompt.count())) break;
                    out.suggest.genreButtons = await prompt.locator('button').allInnerTexts().catch(() => []);
                    await prompt.locator('button').first().click();
                    await page.waitForFunction((n) => document.querySelectorAll('.listPanel--submissionFiles__setGenre').length < n, i === 0 ? await page.locator('.listPanel--submissionFiles__setGenre').count() : 99, {timeout: 20000}).catch(() => {});
                    await idle(page);
                }
                let heading = '';
                for (let i = 0; i < 6; i++) {
                    heading = await page.locator('main h1, h1').first().innerText().catch(() => '');
                    if (/Reviewer Suggestions/.test(heading)) break;
                    await page.getByRole('button', {name: 'Continue'}).first().click(); await idle(page);
                    await page.waitForFunction((h) => (document.querySelector('h1')?.innerText || '') !== h, heading, {timeout: 15000}).catch(() => {});
                }
                const s = await snap(page, 'suggest-step5');
                out.suggest.step5 = {heading, text: flat((s.text.main || '').slice(Math.max(0, (s.text.main || '').indexOf('Reviewer Suggestions'))), 700), buttons: await page.getByRole('button').allInnerTexts().then((a) => a.map((x) => x.trim()).filter(Boolean)).catch(() => [])};
                log('[suggest step5]', JSON.stringify(out.suggest.step5));
                const already = /Sunny Suggested/.test(s.text.main || '');
                out.suggest.alreadyAdded = already;
                if (!already) {
                const add = page.getByRole('button', {name: 'Add Reviewer Suggestion', exact: true}).first(); await add.scrollIntoViewIfNeeded();
                await add.click();
                await page.locator('[role=dialog] input[id*="givenName"], [role=dialog] input[name*="givenName"]').first().waitFor({timeout: 30000});
                const dlg = page.locator('[role=dialog]').filter({has: page.locator('input[id*="givenName"], input[name*="givenName"]')}).last();
                await snap(page, 'suggest-add-dialog');
                out.suggest.dialogTitle = flat(await dlg.locator('h1, h2').first().innerText().catch(() => ''), 80);
                out.suggest.dialogFields = await dlg.locator('input:not([type=hidden]), textarea, iframe').evaluateAll((els) => els.map((e) => `${e.tagName.toLowerCase()}:${e.name || e.id}`));
                const fill = async (sel, v) => { const l = dlg.locator(sel).first(); if (await l.count()) await l.fill(v); };
                await fill('input[id*="givenName"], input[name*="givenName"]', 'Sunny'); await fill('input[id*="familyName"], input[name*="familyName"]', 'Suggested'); await fill('input[id*="email"], input[name*="email"]', `${sc.tag}sugg@mail.test`); await fill('input[id*="affiliation"], input[name*="affiliation"]', 'Scratch University');
                const ifr = dlg.locator('iframe[id*="suggestionReason"]').first();
                if (await ifr.count()) { const b = dlg.frameLocator('iframe[id*="suggestionReason"]').first().locator('body'); await b.click(); await b.fill('U29K2 reason'); } else await fill('textarea[id*="suggestionReason"], textarea[name*="suggestionReason"]', 'U29K2 reason');
                await dlg.getByRole('button', {name: 'Save', exact: true}).click();
                await dlg.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                await idle(page);
                }
                const s2 = await snap(page, 'suggest-step5-added');
                out.suggest.step5After = flat((s2.text.main || '').slice(Math.max(0, (s2.text.main || '').indexOf('Reviewer Suggestions'))), 500);
                await page.getByRole('button', {name: 'Continue'}).first().click(); await idle(page);
                const s3 = await snap(page, 'suggest-review-step');
                out.suggest.reviewStep = flat((s3.text.main || '').slice(Math.max(0, (s3.text.main || '').indexOf('Reviewer Suggestions'))), 400);
                await page.getByRole('button', {name: /^Submit$/}).first().click();
                const conf = page.getByRole('dialog').last();
                await conf.waitFor({timeout: 15000}).catch(() => {});
                out.suggest.submitDialog = flat(await conf.innerText().catch(() => ''), 300);
                await conf.getByRole('button', {name: /^Submit$/}).first().click().catch(() => {});
                await idle(page);
                await page.waitForFunction(() => /submission complete|has been submitted|Submission complete/i.test(document.body.innerText), null, {timeout: 20000}).catch(() => {});
                const s4 = await snap(page, 'suggest-submitted');
                out.suggest.afterSubmit = {url: page.url(), text: flat(s4.text.main, 300)};
                log('[suggest]', JSON.stringify({after: out.suggest.step5After, review: out.suggest.reviewStep, submit: out.suggest.submitDialog, done: out.suggest.afterSubmit}));
            });
            await signOut(page);
            await sect('panel', async () => {
                // the section editor is not assigned to the new submission (its workflow answers "Error"); the manager is
                await signIn(page, sc.mgr, {contextPath: sc.path});
                await page.goto(workflow(sc.d1)); await idle(page);
                await page.locator('[role=dialog]').last().waitFor({timeout: 30000});
                await idle(page);
                const panel = page.locator('[role=dialog]').last();
                const txt = await panel.innerText();
                out.suggest.panelSubmission = (txt.match(/[^\n]*suggest[^\n]*/gi) || []).slice(0, 6);
                await snap(page, 'suggest-editor-submission-stage');
                const sugg = panel.getByText(/Reviewers Suggested by Author/).first();
                out.suggest.panelHeading = await sugg.count();
                if (out.suggest.panelHeading) {
                    const block = await sugg.locator('xpath=ancestor::*[self::section or self::div][2]').innerText().catch(() => '');
                    out.suggest.panelText = flat(block, 500);
                    await loc(page, 'workflow › "Reviewers Suggested by Author" panel', sugg);
                }
                // the review stage of s1 (a round exists, no suggestion on it)
                await openReviewStage(page);
                out.suggest.s1ReviewStageSuggest = ((await page.locator('[role=dialog]').last().innerText().catch(() => '')).match(/[^\n]*suggest[^\n]*/gi) || []).slice(0, 3);
                log('[suggest panel]', JSON.stringify({heading: out.suggest.panelHeading, lines: out.suggest.panelSubmission, text: out.suggest.panelText}));
                await signOut(page);
            });
        } finally { await close(); }
        results();
    }

    // ---------------- suggestoff: the box unticked again → the stored suggestion's panel disappears (control for "Off, neither exists")
    if (phase('suggestoff')) {
        out.suggestoff = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await openSetup(page);
            await page.locator('input[name="reviewerSuggestionEnabled"]').uncheck();
            out.suggestoff.save = await saveSetup(page);
            await page.goto(workflow(sc.d1)); await idle(page);
            await page.locator('[role=dialog]').last().waitFor({timeout: 30000}); await idle(page);
            const panel = page.locator('[role=dialog]').last();
            out.suggestoff.panelHeading = await panel.getByText(/Reviewers Suggested by Author/).count();
            out.suggestoff.lines = ((await panel.innerText()).match(/[^\n]*suggest[^\n]*/gi) || []).slice(0, 3);
            await snap(page, 'suggestoff-editor-submission-stage');
            log('[suggestoff]', JSON.stringify(out.suggestoff));
            await signOut(page);
        } finally { await close(); }
        results();
    }

    // ---------------- side: the review-form toast and "Order" › "Done"; {OJS} a recommendation toggle
    if (phase('side')) {
        out.side = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await sect('form toast', async () => {
                await page.goto(app.url(P('management/settings/workflow#review/reviewForms'))); await idle(page);
                const review = page.getByRole('tab', {name: 'Review', exact: true});
                if ((await review.getAttribute('aria-selected')) !== 'true') await review.click();
                const rf = page.getByRole('tab', {name: 'Review Forms', exact: true});
                if ((await rf.getAttribute('aria-selected')) !== 'true') await rf.click();
                const grid = page.locator('#reviewFormGridContainer');
                await grid.locator('table').waitFor({timeout: 30000});
                const toasts = []; page.on('response', async (r) => { if (/fetchNotification/.test(r.url())) { try { toasts.push(flat(JSON.stringify(await r.json()), 300)); } catch (e) { toasts.push(`status ${r.status()}`); } } });
                await grid.getByRole('link', {name: 'Create Review Form'}).click();
                const dlg = page.locator('[role=dialog]').filter({has: page.locator('form#reviewFormForm')}).last();
                await dlg.locator('input[id^="title-"]').first().waitFor({timeout: 30000});
                await dlg.locator('input[id^="title-"]').first().fill(`U29K2 form ${sc.tag}`);
                await dlg.getByRole('button', {name: 'Save', exact: true}).click();
                await page.waitForFunction((t) => document.querySelector('#reviewFormGridContainer')?.innerText.includes(t), `U29K2 form ${sc.tag}`, {timeout: 30000});
                const notes = await visibleNotes(page);
                const toastRect = await page.locator('.pkpNotification, .pkp_notification').first().boundingBox().catch(() => null);
                out.side.createToast = {fetched: toasts.slice(), visible: notes, rect: toastRect, viewport: page.viewportSize()};
                await snap(page, 'side-form-created');
                log('[side create]', JSON.stringify(out.side.createToast));
                // Order › Done
                toasts.length = 0;
                await grid.locator('a.pkp_linkaction_orderItems').click(); await idle(page);
                const done = grid.locator('a.saveButton');
                await done.waitFor({timeout: 15000});
                const seq = page.waitForResponse((r) => /save-sequence/.test(r.url()), {timeout: 15000}).catch(() => null);
                await done.click();
                const seqR = await seq; await idle(page);
                out.side.orderDone = {saveSequence: seqR ? seqR.status() : null, fetched: toasts.slice(), visible: await visibleNotes(page)};
                await snap(page, 'side-order-done');
                log('[side order]', JSON.stringify(out.side.orderDone));
            });
            if (app.name === 'ojs') await sect('recommendation toggle', async () => {
                const mailB = (await app.mail._search({to: mailOf(sc.mgr)})).messages?.length ?? null;
                await page.goto(app.url(P('management/settings/workflow#review/reviewerRecommendations'))); await idle(page);
                const review = page.getByRole('tab', {name: 'Review', exact: true});
                if ((await review.getAttribute('aria-selected')) !== 'true') await review.click();
                const rr = page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true});
                if ((await rr.getAttribute('aria-selected')) !== 'true') await rr.click();
                const mgrEl = page.locator('[data-cy="reviewer-recommendation-manager"]');
                await mgrEl.locator('tbody tr').first().waitFor({timeout: 30000});
                const box = mgrEl.locator('input[name="recommendation_status[]"]').last();
                const before = await box.isChecked();
                await box.click();
                const conf = page.locator('[role=dialog]').last(); await conf.waitFor({timeout: 15000});
                const statusResp = page.waitForResponse((r) => /recommendations\/\d+\/status/.test(r.url()), {timeout: 15000}).catch(() => null);
                await conf.getByRole('button', {name: 'Yes'}).click();
                const sr = await statusResp; await idle(page);
                out.side.recommendation = {before, after: await mgrEl.locator('input[name="recommendation_status[]"]').last().isChecked(), http: sr ? `${sr.request().method()} ${sr.status()}` : null, notes: await visibleNotes(page)};
                await snap(page, 'side-recommendation-toggled');
                // restore
                await mgrEl.locator('input[name="recommendation_status[]"]').last().click();
                await page.locator('[role=dialog]').last().getByRole('button', {name: 'Yes'}).click().catch(() => {}); await idle(page);
                out.side.recommendation.mail = {before: mailB, after: (await app.mail._search({to: mailOf(sc.mgr)})).messages?.length ?? null};
                log('[side recommendation]', JSON.stringify(out.side.recommendation));
            });
            await signOut(page);
        } finally { await close(); }
        results();
    }

    // ---------------- xf: the two automatic reminder templates; a section's default review form
    if (phase('xf')) {
        out.xf = {};
        const {page, close} = await launch(app);
        try {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await sect('email templates', async () => {
                await page.goto(app.url(P('management/settings/workflow'))); await idle(page);
                await page.getByRole('tab', {name: 'Emails', exact: true}).click(); await idle(page);
                await snap(page, 'xf-emails-tab');
                // "Email Templates" › link "Add and edit templates" → Manage Emails (the mailables list)
                await page.getByRole('link', {name: 'Add and edit templates'}).click(); await idle(page);
                await snap(page, 'xf-manage-emails');
                out.xf.manageEmailsUrl = page.url();
                await page.waitForFunction(() => document.body.innerText.includes('(Automated)'), null, {timeout: 20000}).catch(() => {});
                const s = await snap(page, 'xf-emails-automated');
                const lines = (s.text.main || '').split('\n');
                out.xf.emails = lines.map((x, i) => (/\(Automated\)/.test(x) && !/^Edit /.test(x) ? `${x} :: ${lines[i + 1] || ''}` : null)).filter(Boolean);
                log('[xf emails]', JSON.stringify(out.xf.emails));
            });
            await sect('section review form', async () => {
                if (omp) { out.xf.sectionForm = 'OMP: the series form carries no review-form field (SeriesForm.php has no reviewFormId); not driven'; return; }
                // the section form lists ACTIVE forms only: activate the chunk's form first (Review Forms grid, "Active" box › Confirm › OK)
                await page.goto(app.url(P('management/settings/workflow#review/reviewForms'))); await idle(page);
                const review = page.getByRole('tab', {name: 'Review', exact: true});
                if ((await review.getAttribute('aria-selected')) !== 'true') await review.click();
                const rf = page.getByRole('tab', {name: 'Review Forms', exact: true});
                if ((await rf.getAttribute('aria-selected')) !== 'true') await rf.click();
                const grid = page.locator('#reviewFormGridContainer');
                await grid.locator('table').waitFor({timeout: 30000});
                const active = grid.locator('tr.gridRow').filter({hasText: 'U29K2 form'}).locator('input[type=checkbox]').first();
                if (await active.count() && !(await active.isChecked())) {
                    await active.click();
                    const conf = page.locator('[role=dialog]').filter({hasText: 'Confirm'}).last(); await conf.waitFor({timeout: 15000});
                    await conf.getByRole('button', {name: 'OK', exact: true}).click(); await idle(page);
                }
                out.xf.formActive = await active.isChecked().catch(() => null);
                const url = P('management/settings/context#sections');
                await page.goto(app.url(url)); await idle(page);
                await page.getByRole('tab', {name: omp ? 'Series' : 'Sections', exact: true}).click().catch(() => {}); await idle(page);
                const sgrid = page.locator('[role="tabpanel"]:visible .pkp_controllers_grid').last();
                await sgrid.locator('table').waitFor({timeout: 30000});
                await snap(page, 'xf-sections-grid');
                const first = sgrid.locator('tr.gridRow').first();
                await first.locator('a.show_extras').first().click();
                await first.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                const dlg = page.locator('[role=dialog]').filter({has: page.locator('form[id*="ection"], form[id*="eries"]')}).last();
                await dlg.locator('select').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                out.xf.sectionForm = await dlg.evaluate((d) => ({
                    labels: [...d.querySelectorAll('label')].map((l) => l.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40),
                    selects: [...d.querySelectorAll('select')].map((s) => ({name: s.name, options: [...s.options].map((o) => o.text).slice(0, 6)})),
                })).catch(() => null);
                await snap(page, 'xf-section-edit');
                log('[xf section]', JSON.stringify(out.xf.sectionForm));
            });
            await signOut(page);
        } finally { await close(); }
        results();
    }
    results();
});
