// U28 claim check, chunk K3 — wizard steps 2 to 4 on OJS and OMP: the
// guidelines step, the review boxes, "Reviewer Files", "Save for Later",
// "Submit Review" and its confirmation, the submitted wizard, and what the
// editor gets (RUNBOOK step 7 "Checks are kept").
//
// Drives, per app, on its own scratch context (a manager, a section editor
// as stage participant, an author, one external reviewer "Rita Reviewer";
// OMP also an internal reviewer "Ines Internal"; principal contact a
// throwaway address). Every reviewer assignment is seeded `accepted`, so the
// wizard opens on step 1 with "Save and continue" (pA's premise correction).
//   S1  step 2 without guidelines, "Go Back", step 3 as first shown; texts
//       typed, "Save for Later", sign out and in, the restored step; both
//       boxes cleared and saved (A4); one box retyped and the review
//       submitted; step 4; the list row; "View" (Rules 11–13; Fields step 3;
//       scenarios 5, 6, 16; A4; Side effects "Submitting", "Saving for later")
//   S2  after the manager set guidelines: step 2 with the text, step 3's
//       "Review Guidelines" dialog; the empty submit: Confirm, Cancel,
//       OK, {OJS} "This field is required.", then through (scenario 7; A7)
//   S3  a reviewer file uploaded, submitted with empty boxes; the submitted
//       wizard on every step (scenarios 7 control, 12; Actors rows 6–7;
//       Side effects "Uploading a reviewer file")
//   S4  left open: the control for scenario 12 (later submitted by `optout`'s
//       first version; harmless)
//   S5  OMP only, Internal Review, the internal reviewer's step 2 and step 3
//       dialog (OMP1)
//   S6  seeded by `optout`: the section editor ticks "Do not send me an
//       email…" for "A reviewer has commented on…" (Profile › Notifications),
//       the reviewer submits, the mailbox stays empty (Side effects
//       "Submitting", the opt-out clause)
//   editor: the section editor's rows, "Read Review" windows, Activity Log,
//   Tasks panel; the mailbox (Side effects "Submitting").
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U28/K3/k3.js
//   PHASES=seed,rev1,guidelines,rev2,s2rec,editor,optout … re-runs named phases
//   on the saved scratch context (scratch.json in the agent's output folder);
//   that is the order they depend on each other (s2rec is OJS only: it finishes
//   S2 after "This field is required."). ONLY=ojs,omp: OPS has no reviewer role.
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
    els.map((e) => `${e.textContent.trim()}:disabled=${e.getAttribute('aria-disabled')}:selected=${e.getAttribute('aria-selected')}`));
const controls = (page) => page.locator('main a, main button, main select, main iframe').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null || e.tagName === 'IFRAME').map((e) =>
        `${e.tagName}#${(e.id || '').replace(/-[0-9a-f]{12,}/, '-*')}:${(e.textContent || e.value || '').trim().replace(/\s+/g, ' ').slice(0, 40)}:disabled=${e.disabled}:ceditable=${e.contentDocument?.body?.contentEditable ?? ''}`));
const AE = (page) => page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
const EO = (page) => page.frameLocator('iframe[id^="commentsPrivate"]').locator('body');

async function sect(name, fn) { try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name) { const s = await screen(page); record(name, s); await shot(page, name); return s; }
async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: 30000}).catch(() => {});
    await idle(page);
}
async function editorsMounted(page) { await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000}).catch(() => {}); }
async function boxes(page, name) {
    const ae = await AE(page).innerText().catch(() => 'n/a'); const eo = await EO(page).innerText().catch(() => 'n/a');
    const rec = page.locator('select#reviewerRecommendationId');
    const recVal = await rec.count() ? await rec.locator('option:checked').textContent() : 'n/a';
    log(`[${name} boxes] AE="${ae.trim()}" EO="${eo.trim()}" rec="${recVal.trim()}"`);
}
async function toastWatch(page) {
    return page.evaluate(() => { window.__toasts = []; const o = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) { const t = (n.innerText || '').trim(); if (t && (n.matches('.ui-pnotify, .pkp_notification, .pkpNotification, [role=status], [role=alert]') || n.querySelector('.ui-pnotify, .pkp_notification, .pkpNotification, [role=status], [role=alert]'))) window.__toasts.push(`${n.className}: ${t.slice(0, 200)}`); } }); o.observe(document.body, {childList: true, subtree: true}); });
}
const toasts = (page) => page.evaluate(() => window.__toasts || []);
async function saveForLater(page, name) {
    await toastWatch(page);
    await page.getByRole('button', {name: 'Save for Later'}).click();
    await page.waitForFunction(() => (window.__toasts || []).length > 0, null, {timeout: 8000}).catch(() => {});
    await idle(page);
    const s = await snap(page, name);
    log(`[${name}] url=`, page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'toasts=', JSON.stringify(await toasts(page)), 'dialogs=', JSON.stringify(s.aria.dialogs).slice(0, 200));
}
async function pressSubmit(page, name) {
    await page.getByRole('button', {name: 'Submit Review'}).click();
    const confirm = page.getByRole('dialog', {name: 'Confirm'});
    const appeared = await confirm.waitFor({timeout: 10000}).then(() => true).catch(() => false);
    const marked = await page.locator('main label.error, main .error:visible, main [aria-invalid="true"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().slice(0, 80)));
    const s = await snap(page, name);
    log(`[${name}] confirm=`, appeared, appeared ? flat(await confirm.innerText(), 300) : '', 'marked=', JSON.stringify(marked), 'dialogs=', JSON.stringify(s.aria.dialogs).slice(0, 300));
    return confirm;
}
async function confirmOK(page, name) {
    const confirm = page.getByRole('dialog', {name: 'Confirm'});
    await toastWatch(page);
    await confirm.getByRole('button', {name: 'OK', exact: true}).click();
    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('4.') || document.querySelector('main label.error, #reviewStep3MessageBox:not([style*="none"])'), null, {timeout: 30000}).catch(() => {});
    await idle(page);
    const s = await snap(page, name);
    const errs = await page.locator('main label.error, main .pkp_notification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName}#${e.id}: ${e.innerText.trim().slice(0, 120)}`));
    log(`[${name}] url=`, page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'errors=', JSON.stringify(errs), 'toasts=', JSON.stringify(await toasts(page)));
    log(`[${name} text]`, flat(s.text.main, 900));
    return s;
}
async function tasksPanel(page, name) {
    const btn = page.getByRole('button', {name: /^Tasks/}).first();
    log(`[${name} tasks button]`, await btn.textContent().catch(() => 'none'));
    await btn.click();
    const dlg = page.getByRole('dialog').last();
    await dlg.waitFor({timeout: 20000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && (d.querySelector('table tbody tr') || d.innerText.length > 220); }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
    const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()};
    record(name, d); await shot(page, name);
    log(`[${name}]`, flat(d.text, 1200));
    const close = dlg.getByRole('button', {name: 'Close'});
    if (await close.count()) await close.first().click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
    return d.text;
}
async function listRow(page, url, t, name) {
    await page.goto(url); await idle(page);
    await page.waitForFunction(() => { const tb = document.querySelector('main table'); return tb && !/Loading/.test(tb.innerText) && (tb.querySelector('tbody tr td') || /No items/i.test(tb.innerText)); }, null, {timeout: 30000}).catch(() => {});
    const row = page.getByRole('row').filter({hasText: t}).first();
    const text = await row.count() ? (await row.innerText()).replace(/\n/g, ' | ') : '(no row)';
    const heading = await page.locator('main h1, main h2').first().innerText().catch(() => '');
    log(`[${name}] heading="${flat(heading, 80)}" row=`, text);
    record(name, await screen(page));
    return row;
}
async function uploadReviewerFile(page, name) {
    await page.getByRole('link', {name: 'Upload File'}).click();
    const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    await wiz.waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 40; }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
    const s1 = {aria: await wiz.ariaSnapshot(), text: await wiz.innerText()}; record(`${name}-step1`, s1); await shot(page, `${name}-step1`);
    log(`[${name} step1]`, flat(s1.text, 500), 'genre selects=', await wiz.locator('select[id^="genreId"]').count());
    await wiz.locator('input[type="file"]').setInputFiles(PDF);
    await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
    await wiz.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000}); await idle(page);
    const s2 = {aria: await wiz.ariaSnapshot(), text: await wiz.innerText()}; record(`${name}-step2`, s2);
    log(`[${name} step2]`, flat(s2.text, 400));
    await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
    await wiz.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000}); await idle(page);
    const s3 = {aria: await wiz.ariaSnapshot(), text: await wiz.innerText()}; record(`${name}-step3`, s3);
    log(`[${name} step3]`, flat(s3.text, 400));
    await wiz.getByRole('button', {name: 'Complete', exact: true}).click();
    await wiz.waitFor({state: 'detached', timeout: 30000});
    await idle(page);
    await page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"] tbody tr').first().waitFor({timeout: 20000}).catch(() => {});
}
async function reviewerFilesRow(page, name) {
    const grid = page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]').first();
    const rows = grid.locator('tbody tr:not(.row_controls)');
    const upload = await page.getByRole('link', {name: 'Upload File'}).count();
    const n = await rows.count();
    let extras = [];
    if (n) {
        const row = rows.first();
        const more = row.locator('a.show_extras');
        if (await more.count()) { await more.first().click(); await idle(page); extras = await grid.locator('tr.row_controls').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' '))); }
        log(`[${name}] "Upload File" links=`, upload, 'rows=', n, 'row=', (await row.innerText()).replace(/\n/g, ' | '), 'row actions=', JSON.stringify(extras));
    } else log(`[${name}] "Upload File" links=`, upload, 'rows=', n, 'grid text=', flat(await grid.innerText().catch(() => 'n/a'), 200));
    await snap(page, name);
}
async function toStep3(page, url) {
    await page.goto(url); await idle(page);
    const sc = page.getByRole('button', {name: 'Save and continue'});
    if (await sc.count()) { await sc.click(); await waitTab(page, 2); }
    const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
    if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await waitTab(page, 3); }
    await editorsMounted(page);
}
async function step2Record(page, name) {
    const s = await snap(page, name);
    log(`[${name}] url=`, page.url(), 'tabs=', JSON.stringify(await tabsOf(page)));
    log(`[${name} text]`, flat(s.text.main, 600));
    log(`[${name} controls]`, JSON.stringify(await controls(page)));
    return s;
}
async function readReview(page, given, name) {
    const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: given}).first();
    await row.waitFor({timeout: 30000});
    log(`[${name} row]`, (await row.innerText()).replace(/\n/g, ' | '));
    const btn = row.getByRole('button', {name: /Read Review/});
    if (!(await btn.count())) { log(`[${name}] no Read Review button`); return; }
    await btn.click();
    const dlg = page.getByRole('dialog').last();
    await dlg.waitFor({timeout: 20000});
    await dlg.getByRole('button', {name: 'Mark as Complete'}).waitFor({timeout: 30000}).catch(() => {});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const b = [...d.querySelectorAll('button')].find((x) => /Mark as Complete/.test(x.textContent)); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
    // the files grid fills late on some openings (pC): give it up to 10 s
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && /article\.pdf/.test(d.innerText); }, null, {timeout: 10000}).catch(() => {});
    await idle(page);
    const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()};
    record(name, d); await shot(page, name);
    log(`[${name}]`, flat(d.text, 1600));
    await dlg.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
}

forEachApp(async (app) => {
    const sc = scratchAll[app.name] || {};
    scratchAll[app.name] = sc;

    // ---------------------------------------------------------------- seed
    if (phase('seed')) {
        const t = tag('u28k3');
        const usersSpec = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
            {username: `${t}auth`, roles: ['author'], givenName: 'Arno', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'},
        ];
        if (app.name === 'omp') usersSpec.push({username: `${t}irev`, roles: ['internalReviewer'], givenName: 'Ines', familyName: 'Internal'});
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `K3 journal ${t}`, contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`},
            users: usersSpec,
        });
        Object.assign(sc, {tag: t, contextPath: ctx.path, contextId: ctx.contextId, users: Object.fromEntries(usersSpec.map((u) => [u.username.slice(t.length), u.username]))});
        const seedOne = async (key, extra = {}) => {
            const st = `${t}${key}`;
            const r = await app.api.createSubmission({
                tag: st, context: ctx.path, submitter: `${t}auth`, submitted: true,
                title: `U28 K3 ${key.toUpperCase()} ${st}`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: `${t}rev`, status: 'accepted'}]}],
                participants: [{username: `${t}ed`, role: 'sectionEditor'}],
                ...extra,
            });
            sc[key] = {tag: st, submissionId: r.submissionId, assignments: r.reviewAssignments, rounds: r.reviewRounds};
        };
        // S1 also carries the manager as a stage participant (Side effects "Submitting": every Journal Manager and Section Editor assigned).
        try { await seedOne('s1', {participants: [{username: `${t}ed`, role: 'sectionEditor'}, {username: `${t}mgr`, role: 'manager'}]}); sc.s1.managerParticipant = true; }
        catch (e) { log('[seed s1 with manager participant failed]', String(e.message).slice(0, 300)); await seedOne('s1'); sc.s1.managerParticipant = false; }
        await seedOne('s2');
        await seedOne('s3');
        await seedOne('s4');
        if (app.name === 'omp') {
            try {
                const st = `${t}s5`;
                const r = await app.api.createSubmission({
                    tag: st, context: ctx.path, submitter: `${t}auth`, submitted: true,
                    title: `U28 K3 S5 ${st}`,
                    decisions: ['sendInternalReview'],
                    reviewRounds: [{stage: 'internal', reviewers: [{username: `${t}irev`, status: 'accepted'}]}],
                    participants: [{username: `${t}ed`, role: 'sectionEditor'}],
                });
                sc.s5 = {tag: st, submissionId: r.submissionId, assignments: r.reviewAssignments};
            } catch (e) { sc.s5Error = String(e.message).slice(0, 400); log('[seed s5 failed]', sc.s5Error); }
        }
        saveScratch();
        log(`[seed ${app.name}]`, JSON.stringify(sc));
    }
    const U = (k) => sc.users[k];
    const cp = sc.contextPath;
    const wiz = (id) => app.url(`/index.php/${cp}/reviewer/submission/${id}`);
    const list = (view) => app.url(`/index.php/${cp}/dashboard/reviewAssignments${view ? `?currentViewId=${view}` : ''}`);
    const workflow = (id) => app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${id}`);
    const postLog = (page) => page.on('response', async (r) => { const u = r.url(); if (/reviewer\/saveStep/.test(u) && r.request().method() === 'POST') { let j = null; try { j = await r.json(); } catch (e) {} log('[POST]', u.replace(app.baseURL, ''), r.status(), j ? JSON.stringify({status: j.status, content: typeof j.content === 'string' ? j.content.slice(0, 200) : '', events: j.events}) : ''); } });

    // ---------------------------------------------------------------- rev1
    // S1: step 2 without guidelines, Go Back, step 3 as first shown, save,
    // sign out/in, A4, submit, step 4, list, View. Rita's Tasks before/after.
    if (phase('rev1')) {
        const {page, close} = await launch(app);
        postLog(page);
        try {
            await signIn(page, U('rev'));
            await sect('tasks before', async () => { await page.goto(wiz(sc.s1.submissionId)); await idle(page); await tasksPanel(page, `s1-rita-tasks-before-${app.name}`); });
            await page.goto(wiz(sc.s1.submissionId)); await idle(page);
            log('[S1 open] tabs=', JSON.stringify(await tabsOf(page)));
            await page.getByRole('button', {name: 'Save and continue'}).click(); await waitTab(page, 2);
            await step2Record(page, `s1-step2-noguidelines-${app.name}`);
            await loc(page, 'step 2 › Go Back', page.getByRole('link', {name: 'Go Back'}));
            await page.getByRole('link', {name: 'Go Back'}).click(); await idle(page);
            const back = await snap(page, `s1-goback-step1-${app.name}`);
            log('[S1 after Go Back] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'text=', flat(back.text.main, 200));
            await page.getByRole('tab', {name: /^2\./}).click(); await waitTab(page, 2);
            await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
            await editorsMounted(page);
            const s3 = await snap(page, `s1-step3-first-${app.name}`);
            log('[S1 step3] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)));
            log('[S1 step3 text]', flat(s3.text.main, 2500));
            log('[S1 step3 controls]', JSON.stringify(await controls(page)));
            log('[S1 step3 guidelines link count]', await page.getByRole('link', {name: 'Review Guidelines'}).count(), 'Add button=', await page.locator('main').getByRole('button', {name: 'Add', exact: true}).count());
            const rec = page.locator('select#reviewerRecommendationId');
            if (await rec.count()) log('[S1 recommendation options]', JSON.stringify(await rec.locator('option').evaluateAll((os) => os.map((o) => `${o.value}=${o.textContent.trim()}${o.selected ? ' (selected)' : ''}`))));
            else log('[S1 recommendation select] none; "Recommendation" in text:', /Recommendation/.test(s3.text.main));
            // scenario 5: save for later
            await AE(page).fill('K3 first text for author and editor');
            await EO(page).fill('K3 first private text for the editor');
            if (await rec.count()) await rec.selectOption({label: 'Revisions Required'});
            await saveForLater(page, `s1-save1-${app.name}`);
            await signOut(page);
            await signIn(page, U('rev'));
            const row = await listRow(page, list('reviewer-assignments-all'), sc.s1.tag, `s1-list-after-save-${app.name}`);
            await row.locator('td').last().locator('a, button').first().click();
            await page.waitForURL(/reviewer\/submission/, {timeout: 30000}); await idle(page); await editorsMounted(page);
            log('[S1 reopened] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)));
            record(`s1-reopened-${app.name}`, await screen(page));
            await boxes(page, 'S1 reopened');
            // A4: clear both, save, reload
            await AE(page).fill(''); await EO(page).fill('');
            await saveForLater(page, `s1-save2-cleared-${app.name}`);
            await page.goto(wiz(sc.s1.submissionId)); await idle(page); await editorsMounted(page);
            record(`s1-reload-after-clear-${app.name}`, await screen(page));
            await boxes(page, 'S1 reload after clear');
            // one box retyped, the other left blank, then submit (A4's submit clause; scenario 6)
            await AE(page).fill('K3 FINAL text for author and editor');
            await EO(page).fill('');
            await boxes(page, 'S1 before submit');
            await pressSubmit(page, `s1-submit-confirm-${app.name}`);
            await confirmOK(page, `s1-step4-${app.name}`);
            log('[S1 step4 controls]', JSON.stringify(await controls(page)));
            await sect('tasks after', async () => { await tasksPanel(page, `s1-rita-tasks-after-${app.name}`); });
            // list: All, Completed; View
            await listRow(page, list('reviewer-assignments-all'), sc.s1.tag, `s1-list-all-after-submit-${app.name}`);
            await sect('completed view', async () => {
                const link = page.getByRole('link', {name: /Completed$/}).first();
                if (await link.count()) { await link.click(); await idle(page); } else await page.goto(list('reviewer-assignments-completed'));
                const r = await listRow(page, page.url(), sc.s1.tag, `s1-list-completed-${app.name}`);
                await r.locator('td').last().locator('a, button').first().click();
                await page.waitForURL(/reviewer\/submission/, {timeout: 30000}); await idle(page);
                const v = await snap(page, `s1-view-${app.name}`);
                log('[S1 View] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'text=', flat(v.text.main, 300));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---------------------------------------------------------- guidelines
    // The manager writes the review guidelines (OMP: internal and external).
    if (phase('guidelines')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('mgr'));
            await page.goto(app.url(`/index.php/${cp}/management/settings/workflow`)); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click(); await idle(page);
            const tiny = async (idPrefix, text) => { const body = page.frameLocator(`iframe[id^="${idPrefix}"]`).first().locator('body'); await body.waitFor({timeout: 30000}); await body.click(); await body.fill(text); };
            if (app.name === 'omp') await tiny('reviewerGuidance-internalReviewGuidelines-control', `K3 INTERNAL guidelines ${sc.tag}`);
            await tiny('reviewerGuidance-reviewGuidelines-control', `K3 ${app.name === 'omp' ? 'EXTERNAL' : 'journal'} guidelines ${sc.tag}`);
            await page.locator('#reviewerGuidance').getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await snap(page, `guidelines-saved-${app.name}`);
            log('[guidelines saved]', app.name);
            await signOut(page);
        } finally { await close(); }
    }

    // {OJS} scenario 7's second half: "This field is required." under the list,
    // choose one, "Submit Review" and "OK" again. A no-op once step 4 is selected.
    async function s2Recommend(page) {
        const rec = page.locator('select#reviewerRecommendationId');
        const on4 = (await tabsOf(page)).some((t) => /^4\..*selected=true/.test(t));
        if (!(await rec.count()) || on4) return;
        const errLabel = page.locator('label.error');
        log('[S2 OJS error label]', await errLabel.count() ? flat(await errLabel.first().innerText(), 100) : 'none', 'for=', await errLabel.first().getAttribute('for').catch(() => ''));
        await rec.selectOption({label: 'Decline Submission'});
        await pressSubmit(page, `s2-rec-submit-confirm-${app.name}`);
        await confirmOK(page, `s2-rec-after-ok-${app.name}`);
    }
    if (phase('s2rec') && app.name === 'ojs') {
        const {page, close} = await launch(app);
        postLog(page);
        try {
            await signIn(page, U('rev'));
            await page.goto(wiz(sc.s2.submissionId) + '?step=3'); await idle(page); await editorsMounted(page);
            log('[S2 reopened] tabs=', JSON.stringify(await tabsOf(page)));
            await s2Recommend(page);
            await signOut(page);
        } finally { await close(); }
    }

    // ---------------------------------------------------------------- rev2
    // S2: guidelines on steps 2 and 3; the empty submit. S3: a reviewer file,
    // submit with empty boxes, the submitted wizard on every step. S4: the
    // open control. OMP S5: the internal reviewer's guidelines.
    if (phase('rev2')) {
        const {page, close} = await launch(app);
        postLog(page);
        try {
            await signIn(page, U('rev'));
            // S2
            await page.goto(wiz(sc.s2.submissionId)); await idle(page);
            await page.getByRole('button', {name: 'Save and continue'}).click(); await waitTab(page, 2);
            await step2Record(page, `s2-step2-guidelines-${app.name}`);
            await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3); await editorsMounted(page);
            const s2s3 = await snap(page, `s2-step3-${app.name}`);
            log('[S2 step3 text head]', flat(s2s3.text.main, 700));
            await sect('guidelines dialog', async () => {
                const link = page.getByRole('link', {name: 'Review Guidelines'});
                await loc(page, 'step 3 › Review Guidelines link', link);
                await link.first().click();
                const dlg = page.getByRole('dialog').filter({hasText: 'Review Guidelines'}).last();
                await dlg.waitFor({timeout: 15000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 40; }, null, {timeout: 10000}).catch(() => {});
                const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()}; record(`s2-guidelines-dialog-${app.name}`, d); await shot(page, `s2-guidelines-dialog-${app.name}`);
                log('[S2 guidelines dialog]', flat(d.text, 400));
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            });
            // scenario 7: empty submit → Confirm → Cancel → unchanged → reload → Submit → OK
            await boxes(page, 'S2 empty');
            const c1 = await pressSubmit(page, `s2-empty-submit-confirm-${app.name}`);
            await c1.getByRole('button', {name: 'Cancel', exact: true}).click();
            await c1.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await idle(page);
            const afterCancel = await snap(page, `s2-after-cancel-${app.name}`);
            log('[S2 after Cancel] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'dialogs=', JSON.stringify(afterCancel.aria.dialogs).slice(0, 100));
            await boxes(page, 'S2 after Cancel');
            await page.goto(wiz(sc.s2.submissionId)); await idle(page); await editorsMounted(page);
            await pressSubmit(page, `s2-empty-submit-confirm2-${app.name}`);
            const afterOK = await confirmOK(page, `s2-empty-after-ok-${app.name}`);
            await s2Recommend(page);
            // S3: upload, submit with empty boxes
            await toStep3(page, wiz(sc.s3.submissionId));
            await uploadReviewerFile(page, `s3-upload-${app.name}`);
            await reviewerFilesRow(page, `s3-after-upload-${app.name}`);
            const rec3 = page.locator('select#reviewerRecommendationId');
            if (await rec3.count()) await rec3.selectOption({label: 'Accept Submission'});
            await boxes(page, 'S3 before submit');
            await pressSubmit(page, `s3-submit-confirm-${app.name}`);
            await confirmOK(page, `s3-step4-${app.name}`);
            // scenario 12: the submitted wizard, typed steps
            await page.goto(wiz(sc.s3.submissionId) + '?step=3'); await idle(page); await editorsMounted(page);
            const t3 = await snap(page, `s3-submitted-step3-${app.name}`);
            log('[S3 submitted step3] tabs=', JSON.stringify(await tabsOf(page)), 'controls=', JSON.stringify(await controls(page)));
            await boxes(page, 'S3 submitted step3');
            await reviewerFilesRow(page, `s3-submitted-files-${app.name}`);
            await sect('typing after submission', async () => {
                await AE(page).fill('typed after submission');
                log('[S3 typed after submission] AE now=', flat(await AE(page).innerText(), 60), 'Save disabled=', await page.getByRole('button', {name: 'Save for Later'}).isDisabled(), 'Submit disabled=', await page.getByRole('button', {name: 'Submit Review'}).isDisabled());
                await page.goto(wiz(sc.s3.submissionId) + '?step=3'); await idle(page); await editorsMounted(page);
                log('[S3 after reload] AE=', flat(await AE(page).innerText(), 60));
            });
            await page.goto(wiz(sc.s3.submissionId) + '?step=1'); await idle(page);
            const t1 = await snap(page, `s3-submitted-step1-${app.name}`);
            log('[S3 submitted step1] tabs=', JSON.stringify(await tabsOf(page)), 'controls=', JSON.stringify(await controls(page)));
            await page.goto(wiz(sc.s3.submissionId) + '?step=2'); await idle(page);
            const t2 = await snap(page, `s3-submitted-step2-${app.name}`);
            log('[S3 submitted step2] tabs=', JSON.stringify(await tabsOf(page)), 'controls=', JSON.stringify(await controls(page)));
            await listRow(page, list('reviewer-assignments-all'), sc.s3.tag, `s3-list-${app.name}`);
            // S4: the open control
            await toStep3(page, wiz(sc.s4.submissionId));
            const s4 = await snap(page, `s4-open-step3-${app.name}`);
            log('[S4 open step3] tabs=', JSON.stringify(await tabsOf(page)), 'controls=', JSON.stringify(await controls(page)));
            await reviewerFilesRow(page, `s4-open-files-${app.name}`);
            await signOut(page);
            // OMP S5: the internal reviewer
            if (app.name === 'omp' && sc.s5) await sect('S5 internal', async () => {
                await signIn(page, U('irev'));
                await page.goto(wiz(sc.s5.submissionId)); await idle(page);
                await page.getByRole('button', {name: 'Save and continue'}).click(); await waitTab(page, 2);
                await step2Record(page, `s5-internal-step2-${app.name}`);
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3); await editorsMounted(page);
                const s = await snap(page, `s5-internal-step3-${app.name}`);
                log('[S5 step3 head]', flat(s.text.main, 500), 'rec select=', await page.locator('select#reviewerRecommendationId').count(), 'Recommendation in text=', /Recommendation/.test(s.text.main));
                await page.getByRole('link', {name: 'Review Guidelines'}).first().click();
                const dlg = page.getByRole('dialog').filter({hasText: 'Review Guidelines'}).last();
                await dlg.waitFor({timeout: 15000});
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 40; }, null, {timeout: 10000}).catch(() => {});
                const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()}; record(`s5-internal-guidelines-dialog-${app.name}`, d);
                log('[S5 guidelines dialog]', flat(d.text, 300));
                await dlg.getByRole('button', {name: 'OK', exact: true}).click();
                await signOut(page);
            });
        } finally { await close(); }
    }

    // -------------------------------------------------------------- optout
    // Side effects "Submitting": the section editor ticks "Do not send me an
    // email…" for "A reviewer has commented on…" on Profile › Notifications
    // (U05's screen), then the reviewer submits S4; the mailbox is read after.
    if (phase('optout')) {
        const {page, close} = await launch(app);
        postLog(page);
        try {
            await signIn(page, U('ed'));
            await page.goto(app.url(`/index.php/${cp}/user/profile/notificationSettings`)); await idle(page);
            const form = page.locator('form#notificationSettingsForm');
            await form.waitFor({timeout: 30000});
            const box = form.locator('input[name="emailNotificationReviewerComment"]');
            log('[optout box]', await box.count(), 'checked before=', await box.first().isChecked().catch(() => 'n/a'), 'row text=', flat(await box.first().locator('xpath=ancestor::*[self::li or self::div][1]').innerText().catch(() => ''), 200));
            if (await box.count()) {
                await box.first().check();
                await form.getByRole('button', {name: 'Save', exact: true}).click();
                await page.waitForFunction(() => document.body.innerText.includes('Saved') || document.body.innerText.includes('saved'), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                await page.goto(app.url(`/index.php/${cp}/user/profile/notificationSettings`)); await idle(page);
                await form.waitFor({timeout: 30000});
                log('[optout after reload] checked=', await box.first().isChecked());
                await snap(page, `ed-optout-saved-${app.name}`);
            }
            await signOut(page);
            // the reviewer submits an open assignment (S6, seeded here so the phase can run again)
            if (!sc.s6) {
                const st = `${sc.tag}s6`;
                const r = await app.api.createSubmission({tag: st, context: cp, submitter: U('auth'), submitted: true, title: `U28 K3 S6 ${st}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: U('rev'), status: 'accepted'}]}], participants: [{username: U('ed'), role: 'sectionEditor'}]});
                sc.s6 = {tag: st, submissionId: r.submissionId, assignments: r.reviewAssignments};
                saveScratch();
            }
            await signIn(page, U('rev'));
            await toStep3(page, wiz(sc.s6.submissionId));
            await AE(page).fill('K3 S6 text for author and editor');
            await EO(page).fill('K3 S6 private text');
            const rec = page.locator('select#reviewerRecommendationId');
            if (await rec.count()) await rec.selectOption({label: 'See Comments'});
            await pressSubmit(page, `s6-submit-confirm-${app.name}`);
            await confirmOK(page, `s6-step4-${app.name}`);
            await signOut(page);
        } finally { await close(); }
        await sect('mail s6', async () => {
            const search = await app.mail._get('/api/v1/search', {query: `"${sc.s6.tag}"`});
            log(`[mail s6 after optout] ${(search.messages || []).length} messages`, JSON.stringify((search.messages || []).map((m) => ({subject: m.Subject, to: m.To?.map((t) => t.Address)}))));
            record(`mail-s6-after-optout-${app.name}`, search.messages || []);
        });
    }

    // -------------------------------------------------------------- editor
    // The section editor: rows, Read Review windows, Activity Log, Tasks; mail.
    if (phase('editor')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('ed'));
            await page.goto(workflow(sc.s1.submissionId)); await idle(page);
            await sect('ed tasks', async () => { await tasksPanel(page, `ed-tasks-${app.name}`); });
            await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
            const wf = await snap(page, `ed-s1-workflow-${app.name}`);
            log('[ed S1 workflow text]', flat(wf.text.main, 900));
            await readReview(page, 'Rita', `ed-s1-read-review-${app.name}`);
            await sect('activity log', async () => {
                await page.getByRole('button', {name: 'Activity Log'}).first().click();
                const dlg = page.getByRole('dialog').filter({hasText: 'Activity Log'}).last();
                await dlg.waitFor({timeout: 20000});
                await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
                await idle(page);
                const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()}; record(`ed-s1-activity-log-${app.name}`, d); await shot(page, `ed-s1-activity-log-${app.name}`);
                log('[ed S1 activity log]', flat(d.text, 1200));
                await dlg.getByRole('button', {name: 'Close'}).first().click().catch(() => page.keyboard.press('Escape'));
                await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            });
            for (const k of ['s2', 's3', 's4']) await sect(`ed ${k}`, async () => {
                await page.goto(workflow(sc[k].submissionId)); await idle(page);
                await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {}); await idle(page);
                await readReview(page, 'Rita', `ed-${k}-read-review-${app.name}`);
            });
            await signOut(page);
        } finally { await close(); }
        await sect('mail', async () => {
            for (const k of ['s1', 's2', 's3', 's4']) {
                const search = await app.mail._get('/api/v1/search', {query: `"${sc[k].tag}"`});
                const out = [];
                for (const m of search.messages || []) { const full = await app.mail.fullMessage(m.ID); out.push({subject: full.Subject, from: full.From, to: full.To, replyTo: full.ReplyTo, text: full.Text || ''}); }
                record(`mail-${k}-${app.name}`, out);
                log(`[mail ${k}] ${out.length} messages`, JSON.stringify(out.map((m) => ({subject: m.subject, from: m.from, to: m.to?.map((t) => `${t.Name} <${t.Address}>`)}))));
                for (const m of out.filter((m) => /Review complete/.test(m.subject))) log(`[mail ${k} body]`, flat(m.text, 900));
            }
        });
    }
});
