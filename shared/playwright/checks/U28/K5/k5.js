// U28 claim check, chunk K5 — "Previous Reviews" and the round history
// window, archived and cancelled assignments, OMP's two review stages, the
// OJS recommendation reaching the editor (RUNBOOK step 7 "Checks are kept").
//
// Drives, per app, on its own scratch context (a manager, a section editor
// as stage participant, an author, two external reviewers "Rita Reviewer"
// and "Rex Reviewer"; OMP also an internal reviewer "Ines Internal" and an
// external "Erik External"; principal contact a throwaway address). Every
// submission is seeded submitted with the section editor as participant.
//   S1  Rita accepted; she submits round 1 on screen ({OJS} "Revisions
//       Required"); the editor reads it, opens round 2 and re-adds her:
//       the box, "Read Round 1 Review" for a submitted review (Rule 14,
//       scenarios 11, 16)
//   S2  Rita invited; she declines on screen with a typed reason; round 2,
//       re-added: the declined window (Rule 14, scenario 11 control)
//   S3  as S2 with an EMPTY decline message ("No reason given…" clause)
//   S4  seeded: round 1 accepted never finished, round 2 invited (A2)
//   S5  Rita accepted; decision `accept` seeded (Copyediting): "Archived",
//       the writable wizard driven through "Submit Review" (Rule 17, A11,
//       scenario 14)
//   S6  Rita accepted; she submits; the editor records "Accept Submission"
//       on screen: the "Completed" control of scenario 14, Rule 17's last
//       sentence
//   S7  Rita accepted; the editor cancels her: no view, the refused wizard
//       (Rule 15's cancelled half, footnote b)
//   S8  seeded: round 1 Rita accepted, round 2 with Rex only: does a journal
//       list a reviewer's own only round as "previous" once a later round
//       opens without them (footnote f-omp4's open question)
//   S9  seeded with Rex invited; the editor uploads a review file, adds Rita
//       with it ticked; she uploads a reviewer file and submits; round 2,
//       re-added: "Files For Review" and "Attachments" in the window
//   OMP M1 Internal Review, Ines invited: step 2 text, step 3 without a
//       recommendation, submit; the box before and after the External
//       Review round exists; the "Review complete" mail; Erik on External
//       Review, step 2 text (scenario 15, OMP1, OMP2, OMP4)
//   OMP M2 seeded with both stages' rounds, Ines accepted on the internal
//       one: the box on her wizard before she submits, in-page step 4 after
//       the submit, and after a reload (OMP4's dateless line)
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U28/K5/k5.js
//   PHASES=seed,rev1,editor,accept6,rev2,files,files2,omp … re-runs named phases on the saved
//   scratch context (scratch.json in the agent's output folder), in that
//   dependency order. ONLY=ojs,omp: OPS has no reviewer role.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot: kitShot, record: kitRecord, loc, note, idle, tag, outDir} =
    require('../../../probe');

// Every snapshot name carries the app, so the second app never overwrites the first.
let APP = '';
const record = (name, data) => kitRecord(`${name}-${APP}`, data);
const shot = (page, name) => kitShot(page, `${name}-${APP}`);
const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');

const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const scratchAll = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const ONLYP = process.env.PHASES ? process.env.PHASES.split(',') : null;
const phase = (name) => !ONLYP || ONLYP.includes(name);
const saveScratch = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(scratchAll, null, 2));
const log = (...a) => console.log(...a);
const flat = (s, n = 1500) => (s || '').replace(/\n+/g, ' | ').slice(0, n);
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:disabled=${e.getAttribute('aria-disabled')}:selected=${e.getAttribute('aria-selected')}`));
const AE = (page) => page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
const EO = (page) => page.frameLocator('iframe[id^="commentsPrivate"]').locator('body');
const VIEWS = ['reviewer-action-required', 'reviewer-assignments-all', 'reviewer-assignments-completed',
    'reviewer-assignments-declined', 'reviewer-assignments-published', 'reviewer-assignments-archived'];

async function sect(name, fn) { try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name) { const s = await screen(page); record(name, s); await shot(page, name); return s; }
async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: 30000}).catch(() => {});
    await idle(page);
}
async function boxText(page) {
    const b = page.locator('main').locator('div').filter({hasText: /^Previous Reviews/}).first();
    if (!(await b.count())) return '(no box)';
    const btns = await b.getByRole('button').allTextContents();
    return `${flat(await b.innerText(), 300)} · buttons=${JSON.stringify(btns)} · links=${await b.getByRole('link').count()}`;
}
async function submitOnScreen(page, url, name, {ae, eo, rec}) {
    await page.goto(url); await idle(page);
    const sc = page.getByRole('button', {name: 'Save and continue'});
    if (await sc.count()) { await sc.click(); await waitTab(page, 2); }
    const consent = page.getByRole('checkbox', {name: /privacy statement/i});
    if (await consent.count()) await consent.check();
    const acc = page.getByRole('button', {name: /Accept Review, Continue to Step #2/});
    if (await acc.count()) { await acc.click(); await waitTab(page, 2); }
    const s2 = await snap(page, `${name}-step2`);
    log(`[${name} step2]`, flat(s2.text.main, 400));
    await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
    await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000});
    const s3 = await snap(page, `${name}-step3`);
    log(`[${name} step3] rec-select=`, await page.locator('select#reviewerRecommendationId').count(), 'box=', await boxText(page), 'text=', flat(s3.text.main, 900));
    await AE(page).fill(ae); await EO(page).fill(eo);
    const sel = page.locator('select#reviewerRecommendationId');
    if (rec && await sel.count()) await sel.selectOption({label: rec});
    await page.getByRole('button', {name: 'Submit Review'}).click();
    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to submit this review?'}).last();
    await confirm.waitFor({timeout: 15000});
    await confirm.getByRole('button', {name: 'OK', exact: true}).click();
    await waitTab(page, 4);
    const s4 = await snap(page, `${name}-step4`);
    log(`[${name} step4] url=`, page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'box=', await boxText(page), 'text=', flat(s4.text.main, 400));
}
async function declineOnScreen(page, url, name, message) {
    await page.goto(url); await idle(page);
    await page.getByRole('link', {name: 'Decline Review Request'}).click();
    const dlg = page.getByRole('dialog', {name: 'Decline Review Request'});
    await dlg.waitFor({timeout: 30000});
    const body = dlg.frameLocator('iframe').locator('body'); await body.waitFor({timeout: 30000});
    await body.click();
    await page.keyboard.press('Control+A'); await page.keyboard.press('Meta+A');
    await body.fill(message);
    log(`[${name} decline body before send] "${flat(await body.innerText(), 200)}"`);
    record(`${name}-decline-dialog`, {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
    await dlg.getByRole('button', {name: /Decline Review Request/}).click();
    await page.waitForURL((u) => !/reviewer\/submission/.test(u.href), {timeout: 20000}).catch(() => {});
    await idle(page).catch(() => {});
    const still = await dlg.isVisible().catch(() => false);
    log(`[${name} after decline] url=`, page.url(), 'dialog still open=', still, still ? flat(await dlg.innerText(), 400) : '');
    if (still) { await snap(page, `${name}-decline-refused`); await page.keyboard.press('Escape').catch(() => {}); }
}
async function openWorkflow(page, app, ctxPath, subId) {
    await page.goto(app.url(`/index.php/${ctxPath}/dashboard/editorial?workflowSubmissionId=${subId}`)); await idle(page);
    await page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 30000});
    return page.getByRole('heading', {name: /^Workflow:/}).first().innerText();
}
async function decisionLoop(page, buttonName, name = '') {
    await page.getByRole('button', {name: buttonName, exact: true}).click();
    await page.getByRole('heading', {name: new RegExp(buttonName.replace('Create ', ''))}).first().waitFor({timeout: 30000}).catch(() => {});
    for (let i = 0; i < 8; i++) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: 30000}).catch(() => {});
        if (name) { const s = await snap(page, `${name}-decision-${i}`); log(`[${name} decision step ${i}]`, flat(s.text.main, 500)); }
        const rec = page.getByRole('button', {name: /^Record (Editorial )?Decision$/});
        if (await rec.isVisible().catch(() => false)) { await rec.click(); break; }
        await page.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
    }
    const ok = await page.getByRole('link', {name: 'View Submission'}).waitFor({timeout: 60000}).then(() => true).catch(() => false);
    if (!ok) { const s = await snap(page, `${name || 'decision'}-stuck`); log(`[${name} decision stuck]`, flat(s.text.main, 800), 'dialogs=', JSON.stringify(s.aria.dialogs).slice(0, 500)); throw new Error('no View Submission link'); }
    await page.getByRole('link', {name: 'View Submission'}).click(); await idle(page);
    await page.getByRole('heading', {name: /^Workflow:/}).first().waitFor({timeout: 30000});
    return page.getByRole('heading', {name: /^Workflow:/}).first().innerText();
}
async function addReviewer(page, given, name) {
    await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
    const modal = page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')});
    const search = modal.locator('.listPanel--selectReviewer input.pkpSearch__input'); await search.waitFor({timeout: 30000});
    await search.fill(given); await search.press('Enter');
    const item = modal.locator('.listPanel--selectReviewer .listPanel__item').filter({hasText: given}); await item.first().waitFor({timeout: 30000});
    await page.waitForFunction(() => { const t = document.querySelector('#reviewerFormFooter textarea[name="personalMessage"]'); const m = window.tinyMCE || window.tinymce; return !!(t && m?.get(t.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
    log(`[${name} entry]`, flat(await item.first().innerText(), 300), 'buttons=', JSON.stringify(await item.first().getByRole('button').allTextContents()));
    await item.first().getByRole('button').first().click();
    await modal.locator('#regularReviewerForm').waitFor({timeout: 30000}); await idle(page);
    await page.waitForFunction(() => { const f = document.querySelector('iframe[id^="personalMessage"]'); return f && f.contentDocument?.body?.innerText.trim().length > 20; }, null, {timeout: 30000}).catch(() => {});
    await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
    await modal.waitFor({state: 'hidden', timeout: 30000}); await idle(page);
    await page.reload(); await idle(page);
    const s = await snap(page, name);
    log(`[${name} reviewers]`, flat(await page.getByRole('table', {name: 'Reviewers', exact: true}).innerText().catch(() => 'n/a'), 400));
    return s;
}
async function reviewerRow(page, given) {
    const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: given}).first();
    await row.waitFor({timeout: 30000});
    return row;
}
async function readReview(page, given, name) {
    const row = await reviewerRow(page, given);
    log(`[${name} row]`, flat(await row.innerText(), 300));
    await row.getByRole('button', {name: /Read Review/}).click();
    const dlg = page.getByRole('dialog').last(); await dlg.waitFor({timeout: 20000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const b = [...d.querySelectorAll('button')].find((x) => /Mark as Complete/.test(x.textContent)); return b && !b.disabled; }, null, {timeout: 30000}).catch(() => {});
    await idle(page);
    const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()}; record(name, d); await shot(page, name);
    log(`[${name} window]`, flat(d.text, 1200));
    const cancel = dlg.getByRole('button', {name: /^(Cancel|Close)$/}).first();
    if (await cancel.count()) await cancel.click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
}
async function roundWindow(page, url, name) {
    await page.goto(url); await idle(page);
    const s = await snap(page, `${name}-wizard`);
    log(`[${name} wizard] tabs=`, JSON.stringify(await tabsOf(page)), 'box=', await boxText(page));
    const btn = page.getByRole('button', {name: /Read Round \d+ Review/}).first();
    await loc(page, `${name} › Previous Reviews › Read Round N Review`, btn);
    if (!(await btn.count())) { log(`[${name}] no Read Round button`); return null; }
    await btn.click();
    const dlg = page.getByRole('dialog').last(); await dlg.waitFor({timeout: 30000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 150 && !d.innerText.includes('Loading'); }, null, {timeout: 30000}).catch(() => {});
    await idle(page);
    const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()}; record(`${name}-window`, d); await shot(page, `${name}-window`);
    log(`[${name} window] headings=`, JSON.stringify(await dlg.getByRole('heading').allTextContents()), 'buttons=', JSON.stringify(await dlg.getByRole('button').allTextContents()), 'links=', await dlg.getByRole('link').count());
    log(`[${name} window text]`, flat(d.text, 1500));
    const close = dlg.getByRole('button', {name: 'Close'}).first();
    if (await close.count()) await close.click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
    return d;
}
async function legacyUpload(page, dlg, name) {
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.querySelector('input[type="file"]'); }, null, {timeout: 30000}).catch(() => {});
    const genre = dlg.locator('select[id^="genreId"]');
    if (await genre.count()) {
        const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => `${o.value}:${o.textContent.trim()}`));
        log(`[${name} genres]`, JSON.stringify(opts).slice(0, 300));
        const first = opts.find((o) => !o.startsWith(':'));
        if (first) await genre.selectOption(first.split(':')[0]);
    }
    await dlg.locator('input[type="file"]').setInputFiles(PDF);
    await dlg.getByRole('button', {name: 'Continue', exact: true}).click();
    await dlg.getByRole('tab', {name: /2\. Review Details/}).waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    await dlg.getByRole('button', {name: 'Continue', exact: true}).click();
    await dlg.getByRole('tab', {name: /3\. Confirm/}).waitFor({timeout: 30000}).catch(() => {}); await idle(page);
    await dlg.getByRole('button', {name: 'Complete', exact: true}).click();
    await dlg.waitFor({state: 'detached', timeout: 30000}).catch(() => {}); await idle(page);
}
async function editorReviewFile(page, name) {
    await page.getByRole('button', {name: 'Upload/Select Files'}).click();
    const win = page.getByRole('dialog').last(); await win.waitFor({timeout: 30000});
    await win.getByRole('link', {name: 'Upload Review File'}).waitFor({timeout: 30000}); await idle(page);
    record(`${name}-select-window`, {aria: await win.ariaSnapshot(), text: await win.innerText()});
    await win.getByRole('link', {name: 'Upload Review File'}).click();
    const up = page.getByRole('dialog').last(); await up.waitFor({timeout: 30000});
    await legacyUpload(page, up, name);
    const sel = page.getByRole('dialog').last();
    const boxes = sel.locator('input[type="checkbox"]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) { const b = boxes.nth(i); if (!(await b.isChecked())) await b.check().catch(() => {}); }
    const d = {aria: await sel.ariaSnapshot(), text: await sel.innerText()}; record(`${name}-select-window-after`, d); await shot(page, `${name}-select-window-after`);
    log(`[${name} select window after upload] boxes=${n}`, flat(d.text, 400));
    await sel.getByRole('button', {name: 'OK', exact: true}).click();
    await sel.waitFor({state: 'hidden', timeout: 30000}).catch(() => {}); await idle(page);
    await page.reload(); await idle(page);
    const s = await snap(page, `${name}-round-with-file`);
    log(`[${name} files for review]`, flat(await page.locator('[id*="reviewfiles"], [id*="ReviewFiles"], [id*="review-files"]').first().innerText().catch(() => 'n/a'), 300));
}
async function reviewerUpload(page, name) {
    await page.getByRole('link', {name: 'Upload File'}).click();
    const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
    await wiz.waitFor({timeout: 30000});
    await legacyUpload(page, wiz, name);
    await page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"] tbody tr').first().waitFor({timeout: 20000}).catch(() => {});
    const s = await snap(page, `${name}-after-upload`);
    log(`[${name} reviewer files grid]`, flat(await page.locator('[id^="component-grid-files-attachment-reviewerreviewattachmentsgrid"]').first().innerText().catch(() => 'n/a'), 300));
}
async function views(page, app, ctxPath, tags, name) {
    const out = {};
    for (const v of VIEWS) {
        await page.goto(app.url(`/index.php/${ctxPath}/dashboard/reviewAssignments?currentViewId=${v}`)); await idle(page);
        await page.waitForFunction(() => { const tb = document.querySelector('main table'); return tb && !/Loading/.test(tb.innerText) && (tb.querySelector('tbody tr td') || /No items/i.test(tb.innerText)); }, null, {timeout: 30000}).catch(() => {});
        const heading = await page.locator('main h1, main h2').first().innerText().catch(() => '');
        out[v] = {heading: flat(heading, 60)};
        for (const [k, t] of Object.entries(tags)) {
            const row = page.getByRole('row').filter({hasText: t}).first();
            if (await row.count()) out[v][k] = `${flat(await row.innerText(), 200)} · actions=${await row.locator('td:last-child a, td:last-child button').count()}`;
        }
        record(`${name}-${v}`, await screen(page));
    }
    log(`[${name} views]`, JSON.stringify(out, null, 1));
    return out;
}

forEachApp(async (app) => {
    if (app.name === 'ops') return;
    APP = app.name;
    const sc = scratchAll[app.name] = scratchAll[app.name] || {};
    const wizard = (ctxPath, id) => app.url(`/index.php/${ctxPath}/reviewer/submission/${id}`);

    // ---------- seed
    if (phase('seed')) {
        if (!sc.tag) {
            const t = tag('u28k5');
            const users = {mgr: `${t}mgr`, ed: `${t}ed`, au: `${t}au`, rev: `${t}rev`, rev2: `${t}rev2`};
            const list = [
                {username: users.mgr, roles: ['manager'], givenName: 'Mia', familyName: 'Manager'},
                {username: users.ed, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
                {username: users.au, roles: ['author'], givenName: 'Ana', familyName: 'Author'},
                {username: users.rev, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'},
                {username: users.rev2, roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'},
            ];
            if (app.name === 'omp') {
                users.irev = `${t}irev`; users.erev = `${t}erev`;
                list.push({username: users.irev, roles: ['internalReviewer'], givenName: 'Ines', familyName: 'Internal'});
                list.push({username: users.erev, roles: ['externalReviewer'], givenName: 'Erik', familyName: 'External'});
            }
            const ctx = await app.api.createContext({tag: t, context: {name: `U28 K5 ${t}`, acronym: 'U28K5', contactName: 'K5 Contact', contactEmail: `${t}contact@mail.test`}, users: list});
            sc.tag = t; sc.path = ctx.path || t; sc.users = users; sc.subs = {}; saveScratch();
            log(`[seed ${app.name}] context`, sc.path, JSON.stringify(users));
        }
        const u = sc.users;
        const ext = (status) => ({reviewRounds: [{reviewers: [{username: u.rev, status}]}]});
        const specs = {
            s1: ext('accepted'), s2: ext('invited'), s3: ext('invited'),
            s4: {reviewRounds: [{reviewers: [{username: u.rev, status: 'accepted'}]}, {reviewers: [{username: u.rev, status: 'invited'}]}]},
            s5: {...ext('accepted'), decisions: ['sendExternalReview', 'accept']},
            s6: ext('accepted'), s7: ext('accepted'),
            s8: {reviewRounds: [{reviewers: [{username: u.rev, status: 'accepted'}]}, {reviewers: [{username: u.rev2, status: 'invited'}]}]},
        };
        if (app.name === 'omp') {
            specs.m1 = {decisions: ['sendInternalReview'], reviewRounds: [{stage: 'internal', reviewers: [{username: u.irev, status: 'invited'}]}]};
            specs.m2 = {decisions: ['sendInternalReview', 'sendExternalReview'], reviewRounds: [{stage: 'internal', reviewers: [{username: u.irev, status: 'accepted'}]}, {stage: 'external', reviewers: [{username: u.erev, status: 'invited'}]}]};
        }
        for (const [k, extra] of Object.entries(specs)) {
            if (sc.subs[k]) continue;
            const t = `${sc.tag}${k}`;
            try {
                const r = await app.api.createSubmission({
                    tag: t, context: sc.path, submitter: u.au, submitted: true, title: `U28K5 ${k.toUpperCase()} ${t}`,
                    decisions: ['sendExternalReview'], participants: [{username: u.ed, role: 'sectionEditor'}], ...extra,
                });
                sc.subs[k] = {tag: t, id: r.submissionId, rounds: r.reviewRounds}; saveScratch();
                log(`[seed ${app.name} ${k}]`, r.submissionId, JSON.stringify(r.reviewRounds));
            } catch (e) { log(`[seed ${app.name} ${k} FAILED]`, String(e).slice(0, 500)); }
        }
        if (app.name === 'omp' && !sc.guidelines) {
            const {page, close} = await launch(app);
            try {
                await signIn(page, u.mgr);
                await page.goto(app.url(`/index.php/${sc.path}/management/settings/workflow`)); await idle(page);
                await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
                await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click(); await idle(page);
                for (const [id, text] of [['reviewerGuidance-internalReviewGuidelines-control', 'K5 INTERNAL guidelines text'], ['reviewerGuidance-reviewGuidelines-control', 'K5 EXTERNAL guidelines text']]) {
                    const body = page.frameLocator(`iframe[id^="${id}"]`).first().locator('body');
                    await body.waitFor({timeout: 30000}); await body.click(); await body.fill(text);
                }
                await page.locator('#reviewerGuidance').getByRole('button', {name: 'Save', exact: true}).click();
                await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
                await idle(page);
                await snap(page, 'seed-guidelines-omp');
                sc.guidelines = true; saveScratch();
                await signOut(page);
            } finally { await close(); }
        }
    }
    const u = sc.users, S = sc.subs, P = sc.path;
    const W = (k) => wizard(P, S[k].id);

    // ---------- rev1: Rita submits S1 and S6, declines S2 (typed) and S3 (empty)
    if (phase('rev1')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.rev);
            await sect('s1 submit', () => submitOnScreen(page, W('s1'), 's1', {ae: 'K5 S1 round-1 text for author and editor', eo: 'K5 S1 round-1 text for editor only', rec: 'Revisions Required'}));
            await sect('s6 submit', () => submitOnScreen(page, W('s6'), 's6', {ae: 'K5 S6 text for author and editor', eo: 'K5 S6 text for editor only', rec: 'Accept Submission'}));
            await sect('s2 decline typed', () => declineOnScreen(page, W('s2'), 's2', 'K5 S2 typed decline reason: no time this month.'));
            await sect('s3 decline empty', () => declineOnScreen(page, W('s3'), 's3', ''));
            await signOut(page);
        } finally { await close(); }
    }

    // ---------- editor: Edna reads S1, opens round 2 on S1/S2/S3 and re-adds Rita; accepts S6; cancels Rita on S7
    if (phase('editor')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.ed);
            await sect('s1 editor', async () => {
                log('[s1 round1 heading]', await openWorkflow(page, app, P, S.s1.id));
                await snap(page, 'ed-s1-round1');
                await readReview(page, 'Rita', 'ed-s1-read-review');
                await page.reload(); await idle(page);
                log('[s1 row after read]', flat(await (await reviewerRow(page, 'Rita')).innerText(), 300));
                log('[s1 round2 heading]', await decisionLoop(page, 'Create New Review Round'));
                await addReviewer(page, 'Rita', 'ed-s1-round2-added');
            });
            for (const k of ['s2', 's3']) {
                await sect(`${k} editor`, async () => {
                    log(`[${k} round1 heading]`, await openWorkflow(page, app, P, S[k].id));
                    log(`[${k} row]`, flat(await (await reviewerRow(page, 'Rita')).innerText(), 300));
                    log(`[${k} round2 heading]`, await decisionLoop(page, 'Create New Review Round'));
                    await addReviewer(page, 'Rita', `ed-${k}-round2-added`);
                });
            }
            await sect('s7 cancel', async () => {
                log('[s7 heading]', await openWorkflow(page, app, P, S.s7.id));
                const row = await reviewerRow(page, 'Rita');
                await row.getByRole('button', {name: 'More Actions'}).click();
                log('[s7 menu]', JSON.stringify(await page.getByRole('menuitem').allTextContents()));
                await page.getByRole('menuitem', {name: 'Cancel Reviewer', exact: true}).click();
                const form = page.locator('form#cancelReviewForm'); await form.waitFor({timeout: 30000}); await idle(page);
                const dlg = page.getByRole('dialog').filter({has: form});
                record('ed-s7-cancel-window', {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()});
                await form.getByRole('button', {name: 'Cancel Reviewer', exact: true}).click();
                await form.waitFor({state: 'hidden', timeout: 30000}); await idle(page);
                await page.reload(); await idle(page);
                await snap(page, 'ed-s7-cancelled');
                log('[s7 row after cancel]', flat(await (await reviewerRow(page, 'Rita')).innerText().catch(() => 'NO ROW'), 300));
            });
            await signOut(page);
        } finally { await close(); }
    }
    // ---------- accept6: Edna records "Accept Submission" on S6 (its review already submitted)
    if (phase('accept6')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.ed);
            await sect('s6 accept', async () => {
                log('[s6 heading before]', await openWorkflow(page, app, P, S.s6.id));
                log('[s6 row]', flat(await (await reviewerRow(page, 'Rita')).innerText(), 300));
                log('[s6 heading after accept]', await decisionLoop(page, 'Accept Submission', 'ed-s6'));
                await snap(page, 'ed-s6-accepted');
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---------- rev2: the boxes and windows; the views; the archived wizard driven through; the cancelled wizard
    if (phase('rev2')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.rev);
            for (const k of ['s1', 's2', 's3', 's4', 's8']) await sect(`${k} window`, () => roundWindow(page, W(k), `rev-${k}`));
            const tags = {s5: S.s5.tag, s6: S.s6.tag, s7: S.s7.tag, s1: S.s1.tag};
            await sect('views before', () => views(page, app, P, tags, 'rev-views-before'));
            await sect('s7 typed', async () => {
                await page.goto(W('s7')); await idle(page);
                const s = await snap(page, 'rev-s7-typed');
                log('[s7 typed] url=', page.url(), 'title=', s.title, 'text=', flat(s.text.main, 300));
            });
            await sect('s5 archived wizard', async () => {
                await page.goto(W('s5')); await idle(page);
                const s1 = await snap(page, 'rev-s5-step1');
                log('[s5 step1] tabs=', JSON.stringify(await tabsOf(page)), 'save-and-continue enabled=', await page.getByRole('button', {name: 'Save and continue'}).isEnabled().catch(() => 'absent'), 'text=', flat(s1.text.main, 700));
                await submitOnScreen(page, W('s5'), 's5', {ae: 'K5 S5 archived text for author and editor', eo: 'K5 S5 archived text for editor only', rec: 'Accept Submission'});
            });
            await sect('views after', () => views(page, app, P, {s5: S.s5.tag}, 'rev-views-after'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---------- files: S9 — a round-1 review file granted to Rita and a reviewer file she uploads; round 2; the window's file lists
    if (phase('files')) {
        if (!S.s9) {
            const t = `${sc.tag}s9`;
            const r = await app.api.createSubmission({
                tag: t, context: P, submitter: u.au, submitted: true, title: `U28K5 S9 ${t}`,
                decisions: ['sendExternalReview'], participants: [{username: u.ed, role: 'sectionEditor'}],
                reviewRounds: [{reviewers: [{username: u.rev2, status: 'invited'}]}],
            });
            S.s9 = {tag: t, id: r.submissionId, rounds: r.reviewRounds}; saveScratch();
            log(`[seed ${app.name} s9]`, r.submissionId);
        }
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.ed);
            await sect('s9 editor file + add Rita', async () => {
                log('[s9 heading]', await openWorkflow(page, app, P, S.s9.id));
                await editorReviewFile(page, 'ed-s9');
                await page.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                const modal = page.getByRole('dialog').filter({has: page.locator('.listPanel--selectReviewer')});
                const search = modal.locator('.listPanel--selectReviewer input.pkpSearch__input'); await search.waitFor({timeout: 30000});
                await search.fill('Rita'); await search.press('Enter');
                const item = modal.locator('.listPanel--selectReviewer .listPanel__item').filter({hasText: 'Rita'}); await item.first().waitFor({timeout: 30000});
                await page.waitForFunction(() => { const t = document.querySelector('#reviewerFormFooter textarea[name="personalMessage"]'); const m = window.tinyMCE || window.tinymce; return !!(t && m?.get(t.id)?.initialized); }, null, {timeout: 30000}).catch(() => {});
                await item.first().getByRole('button').first().click();
                await modal.locator('#regularReviewerForm').waitFor({timeout: 30000}); await idle(page);
                await page.waitForFunction(() => { const f = document.querySelector('iframe[id^="personalMessage"]'); return f && f.contentDocument?.body?.innerText.trim().length > 20; }, null, {timeout: 30000}).catch(() => {});
                const fileBoxes = modal.locator('#regularReviewerForm input[type="checkbox"][name*="selectedFiles"], #regularReviewerForm input[type="checkbox"][id*="selectedFiles"]');
                const nb = await fileBoxes.count();
                const states = []; for (let i = 0; i < nb; i++) { const b = fileBoxes.nth(i); states.push(await b.isChecked()); if (!(await b.isChecked())) await b.check().catch(() => {}); }
                log('[s9 add reviewer form file boxes]', nb, JSON.stringify(states));
                record('ed-s9-add-form', {aria: await modal.ariaSnapshot(), text: await modal.innerText()});
                await modal.getByRole('button', {name: 'Add Reviewer', exact: true}).click();
                await modal.waitFor({state: 'hidden', timeout: 30000}); await idle(page);
                await page.reload(); await idle(page);
                await snap(page, 'ed-s9-rita-added');
                log('[s9 reviewers]', flat(await page.getByRole('table', {name: 'Reviewers', exact: true}).innerText().catch(() => 'n/a'), 400));
            });
            await signOut(page);
            await signIn(page, u.rev);
            await sect('s9 Rita accepts, uploads, submits', async () => {
                await page.goto(W('s9')); await idle(page);
                await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 30000}).catch(() => {});
                const s1 = await snap(page, 'rev-s9-step1');
                log('[s9 step1 files]', flat(s1.text.main, 900));
                const consent = page.getByRole('checkbox', {name: /privacy statement/i});
                if (await consent.count()) await consent.check();
                await page.getByRole('button', {name: /Accept Review, Continue to Step #2/}).click(); await waitTab(page, 2);
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000});
                await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 30000}).catch(() => {});
                const s3 = await snap(page, 'rev-s9-step3');
                log('[s9 step3]', flat(s3.text.main, 700));
                await reviewerUpload(page, 'rev-s9');
                await AE(page).fill('K5 S9 text for author and editor'); await EO(page).fill('K5 S9 text for editor only');
                const sel = page.locator('select#reviewerRecommendationId');
                if (await sel.count()) await sel.selectOption({label: 'Accept Submission'});
                await page.getByRole('button', {name: 'Submit Review'}).click();
                const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to submit this review?'}).last();
                await confirm.waitFor({timeout: 15000});
                await confirm.getByRole('button', {name: 'OK', exact: true}).click();
                await waitTab(page, 4);
                await snap(page, 'rev-s9-step4');
            });
            await signOut(page);
            await signIn(page, u.ed);
            await sect('s9 round 2', async () => {
                await openWorkflow(page, app, P, S.s9.id);
                log('[s9 round2 heading]', await decisionLoop(page, 'Create New Review Round'));
                await addReviewer(page, 'Rita', 'ed-s9-round2-added');
            });
            await signOut(page);
            await signIn(page, u.rev);
            await sect('s9 window', () => roundWindow(page, W('s9'), 'rev-s9'));
            await signOut(page);
        } finally { await close(); }
    }

    // ---------- files2: S9 round 2 gets the round-1 review file too; does Rita's round-1 window then show "Files For Review"?
    if (phase('files2')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.ed);
            await sect('s9 round2 file', async () => {
                await openWorkflow(page, app, P, S.s9.id);
                await page.getByRole('link', {name: /Review Round 2|Round 2/}).first().click().catch(() => {}); await idle(page);
                log('[s9 round2 heading]', await page.getByRole('heading', {name: /^Workflow:/}).first().innerText());
                await page.getByRole('button', {name: 'Upload/Select Files'}).click();
                const win = page.getByRole('dialog').last(); await win.waitFor({timeout: 30000});
                await win.getByRole('link', {name: 'Upload Review File'}).waitFor({timeout: 30000}); await idle(page);
                let d = {aria: await win.ariaSnapshot(), text: await win.innerText()}; record('ed-s9-round2-select-window', d);
                log('[s9 round2 select window]', flat(d.text, 400));
                if (!/article\.pdf/.test(d.text)) {
                    const all = win.getByRole('checkbox', {name: /Show files from all accessible/});
                    if (await all.count()) { await all.check().catch(() => {}); await idle(page); }
                    await page.waitForFunction(() => { const w = [...document.querySelectorAll('[role=dialog]')].pop(); return w && /article\.pdf/.test(w.innerText); }, null, {timeout: 15000}).catch(() => {});
                }
                if (!/article\.pdf/.test(await win.innerText())) {
                    await win.getByRole('link', {name: 'Upload Review File'}).click();
                    const up = page.getByRole('dialog').last(); await up.waitFor({timeout: 30000});
                    await legacyUpload(page, up, 'ed-s9-round2');
                }
                const sel = page.getByRole('dialog').last();
                const boxes = sel.locator('input[type="checkbox"]'); const n = await boxes.count();
                for (let i = 0; i < n; i++) { const b = boxes.nth(i); if (!(await b.isChecked())) await b.check().catch(() => {}); }
                d = {aria: await sel.ariaSnapshot(), text: await sel.innerText()}; record('ed-s9-round2-select-window-after', d); await shot(page, 'ed-s9-round2-select-window-after');
                log('[s9 round2 select window after]', flat(d.text, 400));
                await sel.getByRole('button', {name: 'OK', exact: true}).click();
                await sel.waitFor({state: 'hidden', timeout: 30000}).catch(() => {}); await idle(page);
                await page.reload(); await idle(page);
                await snap(page, 'ed-s9-round2-with-file');
                // grant it to Rita through her row's Edit window (pB: "Files To Be Reviewed" boxes)
                const row = await reviewerRow(page, 'Rita');
                await row.getByRole('button', {name: 'More Actions'}).click();
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
                const form = page.locator('form#editReviewForm'); await form.waitFor({timeout: 30000}); await idle(page);
                const fb = form.locator('input[type="checkbox"][name*="selectedFiles"], input[type="checkbox"][id*="selectedFiles"]');
                const fn = await fb.count(); const st = [];
                for (let i = 0; i < fn; i++) { const b = fb.nth(i); st.push(await b.isChecked()); if (!(await b.isChecked())) await b.check().catch(() => {}); }
                log('[s9 round2 edit window file boxes]', fn, JSON.stringify(st));
                record('ed-s9-round2-edit-window', {text: await page.getByRole('dialog').last().innerText()});
                await form.getByRole('button', {name: 'OK', exact: true}).click();
                await form.waitFor({state: 'hidden', timeout: 30000}).catch(() => {}); await idle(page);
            });
            await signOut(page);
            await signIn(page, u.rev);
            await sect('s9 window after round-2 file', () => roundWindow(page, W('s9'), 'rev-s9-after-r2-file'));
            await sect('s9 step1 round 2 files', async () => {
                await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 30000}).catch(() => {});
                const s = await snap(page, 'rev-s9-round2-step1'); log('[s9 round2 step1]', flat(s.text.main, 700));
            });
            await signOut(page);
        } finally { await close(); }
    }

    // ---------- omp: the two stages
    if (phase('omp') && app.name === 'omp') {
        const {page, close} = await launch(app);
        try {
            await signIn(page, u.irev);
            await sect('m1 internal submit', async () => {
                await page.goto(W('m1')); await idle(page);
                const s1 = await snap(page, 'irev-m1-step1');
                log('[m1 step1] box=', await boxText(page), 'text=', flat(s1.text.main, 300));
                await submitOnScreen(page, W('m1'), 'irev-m1', {ae: 'K5 M1 internal text for author and editor', eo: 'K5 M1 internal text for editor only'});
                await page.goto(W('m1')); await idle(page);
                await snap(page, 'irev-m1-reloaded-before-external');
                log('[m1 reloaded before external] box=', await boxText(page), 'tabs=', JSON.stringify(await tabsOf(page)));
            });
            await sect('m2 internal, box before submit', async () => {
                await page.goto(W('m2')); await idle(page);
                const s = await snap(page, 'irev-m2-step1');
                log('[m2 step1] box=', await boxText(page), 'tabs=', JSON.stringify(await tabsOf(page)));
                await submitOnScreen(page, W('m2'), 'irev-m2', {ae: 'K5 M2 internal text for author and editor', eo: 'K5 M2 internal text for editor only'});
                await roundWindow(page, W('m2'), 'irev-m2-reloaded');
            });
            await signOut(page);
            await sect('m1 mail', async () => {
                const m = await app.mail.find({to: `${u.ed}@mail.test`, subject: 'Review complete', contains: S.m1.tag, timeoutMs: 20000});
                const full = await app.mail.fullMessage(m.ID).catch(() => null);
                log('[m1 mail]', JSON.stringify({Subject: full?.Subject || m.Subject, To: full?.To || m.To, From: full?.From || m.From, Text: (full?.Text || '').replace(/\s+/g, ' ').slice(0, 700)}));
                const mgr = await app.mail.count({to: `${u.mgr}@mail.test`, subject: 'Review complete'}).catch((e) => String(e).slice(0, 100));
                log('[m1 mail to manager count]', mgr);
            });
            await signIn(page, u.ed);
            await sect('m1 send external', async () => {
                log('[m1 heading before]', await openWorkflow(page, app, P, S.m1.id));
                await snap(page, 'ed-m1-internal');
                log('[m1 heading after]', await decisionLoop(page, 'Send to External Review'));
                await addReviewer(page, 'Erik', 'ed-m1-external-added');
            });
            await signOut(page);
            await signIn(page, u.erev);
            await sect('m1 external step 2', async () => {
                await page.goto(W('m1')); await idle(page);
                log('[erev m1 step1] box=', await boxText(page));
                const consent = page.getByRole('checkbox', {name: /privacy statement/i});
                if (await consent.count()) await consent.check();
                await page.getByRole('button', {name: /Accept Review, Continue to Step #2/}).click(); await waitTab(page, 2);
                const s2 = await snap(page, 'erev-m1-step2');
                log('[erev m1 step2]', flat(s2.text.main, 400));
                await page.getByRole('button', {name: 'Continue to Step #3'}).click(); await waitTab(page, 3);
                await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000});
                const s3 = await snap(page, 'erev-m1-step3');
                log('[erev m1 step3] rec-select=', await page.locator('select#reviewerRecommendationId').count(), 'Recommendation word=', /Recommendation/.test(s3.text.main), 'box=', await boxText(page));
            });
            await signOut(page);
            await signIn(page, u.irev);
            await sect('m1 internal after external', () => roundWindow(page, W('m1'), 'irev-m1-after-external'));
            await signOut(page);
        } finally { await close(); }
    }
});
