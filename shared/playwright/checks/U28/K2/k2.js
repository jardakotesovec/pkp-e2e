// U28 claim check, chunk K2 — wizard step 1 on OJS and OMP: the request,
// the details window, accepting, declining, file links and who is refused
// (RUNBOOK step 7 "Checks are kept").
//
// Drives, per app, on its own scratch context (a manager, a section editor
// as participant, an author, two external reviewers and on OMP an internal
// reviewer; the context's principal contact is a throwaway address):
//   S1  invited → the editor grants one of two round files and sets the
//       review type "Open"; the reviewer refuses consent, accepts, reloads,
//       reads step 1 again, downloads the file, reads the list row
//       (Rules 7, 9; Fields step 1; scenarios 2, 4; Side effects "Accepting")
//   S2  invited → declined through the window with an added line; landing
//       page, list views, typed wizard address; the editor's row, "Resend
//       Review Request", the reviewer's row afterwards (Rule 10; scenario 3;
//       Side effects "Declining"; A3)
//   S3  invited, left unanswered → step 1 as first shown, "About Due Dates",
//       the details window for an anonymous type; then every other account
//       and a signed-out visitor at its address (Rules 7, 15; Actors)
//   S4  invited, nobody assigned to the stage → accepted; the acceptance
//       email's recipient is the principal contact (Side effects "Accepting")
//   S5  OMP only, Internal Review stage, an Internal Reviewer invited →
//       the list row and the wizard open (Actors "Terms")
//   The S1 file link opened by the unassigned reviewer, the section editor
//   and the manager (Rule 15; A6).
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U28/K2/k2.js
//   PHASES=seed,grant,reviewer,refused,editor,mail,variants,internal … re-runs
//   named phases on the saved scratch context (scratch.json in the agent's
//   output folder); the order above is the order they depend on each other
//   (variants needs the resend from editor). ONLY=ojs,omp: OPS has no reviewer role.
//
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');
const users = require('../../../data/users.js');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const PNG = path.join(REPO, 'apps/ojs/playwright/fixtures/files/profile-image-400.png');
const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const scratchAll = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const ONLY = process.env.PHASES ? process.env.PHASES.split(',') : null;
const phase = (name) => !ONLY || ONLY.includes(name);
const saveScratch = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(scratchAll, null, 2));
const txt = (s) => (s.text.main || '').replace(/\n+/g, ' | ').slice(0, 700);
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:${e.getAttribute('aria-disabled')}:${e.getAttribute('aria-selected')}`));
const log = (...a) => console.log(...a);

async function snap(page, name) {
    const s = await screen(page);
    record(name, s);
    await shot(page, name);
    return s;
}

async function waitList(page) {
    await page.waitForFunction(() => {
        const t = document.querySelector('main table');
        return t && !/Loading/.test(t.innerText) && (t.querySelector('tbody tr td') || /No items|No submissions/i.test(t.innerText));
    }, null, {timeout: 30000}).catch(() => {});
}

async function lastDialogFilled(page, min = 100) {
    await page.waitForFunction((n) => {
        const d = [...document.querySelectorAll('[role=dialog]')].pop();
        return d && d.innerText.length > n;
    }, min, {timeout: 30000}).catch(() => {});
}

async function openRound(page, app, submissionId, cp = app.contextPath) {
    await page.goto(app.url(`/index.php/${cp}/dashboard/editorial?workflowSubmissionId=${submissionId}`));
    await idle(page);
    await page.getByRole('link', {name: /Review Round 1|Round 1/}).first().click().catch(() => {});
    await idle(page);
}

async function reviewerRow(page, given) {
    const row = page.getByRole('table', {name: 'Reviewers', exact: true}).getByRole('row').filter({hasText: given});
    await row.first().waitFor({timeout: 30000});
    return row.first();
}

async function uploadRoundFile(page, manage, file) {
    await manage.getByRole('link', {name: 'Upload Review File'}).click();
    const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
    const fileInput = wiz.locator('input[type="file"]');
    await fileInput.waitFor({state: 'attached', timeout: 30000});
    const genre = wiz.locator('select[id^="genreId"]');
    if (await genre.count()) {
        const opts = await genre.locator('option').allTextContents();
        await genre.selectOption({index: opts.findIndex((o, i) => i > 0 && o.trim())});
    }
    await fileInput.setInputFiles(file);
    await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
    await wiz.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
    await wiz.getByRole('button', {name: 'Continue', exact: true}).click();
    await wiz.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
    await wiz.getByRole('button', {name: 'Complete', exact: true}).click();
    await wiz.waitFor({state: 'detached', timeout: 30000});
    await idle(page);
}

async function openDetails(page, name) {
    await page.getByRole('link', {name: 'View All Submission Details'}).first().click();
    const dlg = page.getByRole('dialog').filter({hasText: 'View All Submission Details'}).last();
    await dlg.waitFor({timeout: 30000});
    await lastDialogFilled(page, 120);
    const data = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText()};
    record(name, data);
    await shot(page, name);
    log(`[${name}]`, data.text.replace(/\n+/g, ' | ').slice(0, 800));
    const closeBtn = dlg.getByRole('button', {name: 'Close'});
    if (await closeBtn.count()) await closeBtn.first().click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
}

async function tryDownload(page, href, label) {
    const dl = page.waitForEvent('download', {timeout: 8000}).catch(() => null);
    let resp = null, err = null;
    try { resp = await page.goto(href); } catch (e) { err = String(e.message).slice(0, 120); }
    const d = await dl;
    const out = {
        label, status: resp && resp.status(), contentType: resp && resp.headers()['content-type'],
        body: resp ? (await resp.text().catch(() => '')).slice(0, 300) : null,
        download: d ? {name: d.suggestedFilename(), bytes: (await d.path().then((p) => p && fs.statSync(p).size).catch(() => null))} : null,
        gotoError: err, url: page.url(),
    };
    log(`[file link as ${label}]`, JSON.stringify(out));
    return out;
}

forEachApp(async (app) => {
    const sc = scratchAll[app.name] || {};
    scratchAll[app.name] = sc;
    const wizard = (id) => app.url(`/index.php/${app.contextPath}/reviewer/submission/${id}`);
    const listURL = app.url(`/index.php/${app.contextPath}/dashboard/reviewAssignments`);

    // ---------------------------------------------------------------- seed
    if (phase('seed')) {
        const t = tag('u28k2');
        const usersSpec = [
            {username: `${t}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
            {username: `${t}auth`, roles: ['author'], givenName: 'Arno', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Rita', familyName: 'Reviewer'},
            {username: `${t}rev2`, roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Other'},
        ];
        if (app.name === 'omp') usersSpec.push({username: `${t}irev`, roles: ['internalReviewer'], givenName: 'Ines', familyName: 'Internal'});
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `K2 journal ${t}`, contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`},
            users: usersSpec,
        });
        Object.assign(sc, {tag: t, contextPath: ctx.path, contextId: ctx.contextId, users: Object.fromEntries(usersSpec.map((u) => [u.username.slice(t.length), u.username]))});
        const seedOne = async (key, extra = {}) => {
            const st = `${t}${key}`;
            const r = await app.api.createSubmission({
                tag: st, context: ctx.path, submitter: `${t}auth`, submitted: true,
                title: `U28 K2 ${key.toUpperCase()} ${st}`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: `${t}rev`, status: 'invited'}]}],
                participants: [{username: `${t}ed`, role: 'sectionEditor'}],
                ...extra,
            });
            sc[key] = {tag: st, submissionId: r.submissionId, assignments: r.reviewAssignments};
        };
        await seedOne('s1');
        await seedOne('s2');
        await seedOne('s3');
        await seedOne('s4', {participants: []});
        if (app.name === 'omp') {
            try {
                const st = `${t}s5`;
                const r = await app.api.createSubmission({
                    tag: st, context: ctx.path, submitter: `${t}auth`, submitted: true,
                    title: `U28 K2 S5 ${st}`,
                    decisions: ['sendInternalReview'],
                    reviewRounds: [{stage: 'internal', reviewers: [{username: `${t}irev`, status: 'invited'}]}],
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
    const list = app.url(`/index.php/${cp}/dashboard/reviewAssignments`);

    // --------------------------------------------------------------- grant
    // The section editor uploads two files to S1's round, ticks one for the
    // reviewer in the row's "Edit" window and sets the review type "Open".
    if (phase('grant')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('ed'));
            await openRound(page, app, sc.s1.submissionId, cp);
            await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
            const manage = page.getByRole('dialog').filter({has: page.locator('form[id^="manageReviewFiles"], [id^="manageReviewFiles"], form[id^="selectFiles"]')}).first();
            await manage.waitFor({timeout: 30000});
            await uploadRoundFile(page, manage, PDF);
            await uploadRoundFile(page, manage, PNG);
            const boxes = manage.locator('table input[type="checkbox"]');
            for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check().catch(() => {});
            await manage.getByRole('button', {name: /^(Save|OK)$/}).first().click();
            await manage.waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await idle(page);
            await page.reload(); await idle(page);
            await snap(page, `grant-round-files-${app.name}`);
            const row = await reviewerRow(page, 'Rita');
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
            await edit.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000});
            await idle(page);
            const fileRows = edit.getByRole('row').filter({hasText: 'article.pdf'});
            log('[edit window rows with article.pdf]', await fileRows.count(), 'all file boxes', await edit.locator('input[type="checkbox"]:not([name="isReviewPubliclyVisible"])').count());
            await fileRows.first().locator('input[type="checkbox"]').first().check();
            await edit.locator('input[name="reviewMethod"][value="3"]').check();
            record(`grant-edit-window-${app.name}`, {aria: await edit.ariaSnapshot()});
            await edit.getByRole('button', {name: 'OK', exact: true}).click();
            await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            await page.reload(); await idle(page);
            const r2 = await reviewerRow(page, 'Rita');
            log('[ed row S1 after grant]', (await r2.innerText()).replace(/\n/g, ' | '));
            await snap(page, `grant-after-${app.name}`);
            await signOut(page);
        } finally { await close(); }
    }

    // ------------------------------------------------------------ reviewer
    if (phase('reviewer')) {
        const {page, close} = await launch(app);
        const jsDialogs = [];
        page.on('dialog', async (d) => { jsDialogs.push({type: d.type(), message: d.message()}); await d.dismiss().catch(() => {}); });
        try {
            await signIn(page, U('rev'));
            // S3: from the list row to step 1 as first shown.
            await page.goto(list); await waitList(page);
            const row3 = page.getByRole('row').filter({hasText: sc.s3.tag}).first();
            log('[list row S3]', (await row3.innerText()).replace(/\n/g, ' | '));
            await row3.getByRole('button', {name: 'Respond to request'}).click();
            await page.waitForURL(/reviewer\/submission/, {timeout: 30000});
            await idle(page);
            const s3 = await snap(page, `s3-step1-${app.name}`);
            log('[S3 step1] url=', page.url(), 'title=', s3.title, 'tabs=', JSON.stringify(await tabsOf(page)));
            log('[S3 step1 text]', txt(s3));
            log('[S3 step1 controls]', JSON.stringify(await page.locator('main a, main button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 50)}`))));
            const fileRows3 = await page.locator('main table tbody tr').allInnerTexts().catch(() => []);
            log('[S3 review files grid rows]', JSON.stringify(fileRows3.map((r) => r.replace(/\s+/g, ' ').trim())));
            const consentLabel = await page.locator('label:has(input[name="privacyConsent"])').evaluateAll((els) => els.map((e) => ({text: e.innerText, links: [...e.querySelectorAll('a')].map((a) => `${a.textContent}→${a.getAttribute('href')}|${a.target}`)})));
            log('[S3 consent label]', JSON.stringify(consentLabel));
            await page.getByRole('link', {name: 'About Due Dates'}).click();
            const about = page.getByRole('dialog').last();
            await about.waitFor({timeout: 30000});
            record(`s3-about-due-dates-${app.name}`, {aria: await about.ariaSnapshot(), text: await about.innerText()});
            log('[About Due Dates]', (await about.innerText()).replace(/\n+/g, ' | '));
            await about.getByRole('button', {name: 'OK'}).click().catch(() => page.keyboard.press('Escape'));
            await about.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            await openDetails(page, `s3-details-anonymous-${app.name}`);
            // S1: details for "Open", consent refused, accepted, reload, tab 1, file, list row.
            await page.goto(wiz(sc.s1.submissionId)); await idle(page);
            const s1a = await snap(page, `s1-step1-${app.name}`);
            log('[S1 step1 text]', txt(s1a));
            log('[S1 review files grid rows]', JSON.stringify((await page.locator('main table tbody tr').allInnerTexts().catch(() => [])).map((r) => r.replace(/\s+/g, ' ').trim())));
            await openDetails(page, `s1-details-open-${app.name}`);
            const accept = page.getByRole('button', {name: 'Accept Review, Continue to Step #2'});
            const consent = page.getByRole('checkbox', {name: /privacy statement/});
            await loc(page, 'step 1 › consent box', consent);
            await loc(page, 'step 1 › Accept Review, Continue to Step #2', accept);
            await accept.click();
            await page.locator('label.error').first().waitFor({timeout: 8000}).catch(() => {});
            const refused = await snap(page, `s1-consent-refused-${app.name}`);
            log('[consent refused] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'jsDialogs=', JSON.stringify(jsDialogs));
            log('[consent refused errors]', JSON.stringify(await page.locator('label.error, .pkp_form_error, .pkp_notification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName}.${e.className}[for=${e.getAttribute('for')}]: ${e.innerText.trim().slice(0, 200)}`))));
            await consent.check();
            await accept.click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('2.'), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            const s2p = await snap(page, `s1-after-accept-step2-${app.name}`);
            log('[after accept] url=', page.url(), 'tabs=', JSON.stringify(await tabsOf(page)), 'text=', txt(s2p));
            await page.goto(wiz(sc.s1.submissionId)); await idle(page);
            log('[reload tabs]', JSON.stringify(await tabsOf(page)));
            await page.getByRole('tab', {name: '1. Request'}).click(); await idle(page);
            await page.waitForFunction(() => document.querySelector('form[id*="Step1"], form[id*="step1"]'), null, {timeout: 30000}).catch(() => {});
            const s1b = await snap(page, `s1-step1-after-accept-${app.name}`);
            log('[S1 step1 after accept controls]', JSON.stringify(await page.locator('main a, main button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 50)}`))));
            log('[S1 step1 after accept text]', txt(s1b));
            const fileLink = page.getByRole('link', {name: 'article.pdf'});
            await loc(page, 'step 1 › Review Files › file link', fileLink);
            sc.fileHref = await fileLink.first().getAttribute('href');
            const pngLink = page.getByRole('link', {name: /profile-image/});
            log('[S1 file links] article.pdf=', await fileLink.count(), 'png=', await pngLink.count(), 'href=', sc.fileHref);
            const [dl] = await Promise.all([page.waitForEvent('download', {timeout: 30000}), fileLink.first().click()]);
            const dp = await dl.path();
            log('[S1 download as rev]', dl.suggestedFilename(), dp ? fs.statSync(dp).size : null, 'url after=', page.url());
            // step 3's list: scenario 4's second half.
            await page.getByRole('tab', {name: '2. Guidelines'}).click(); await idle(page);
            await page.getByRole('button', {name: 'Continue to Step #3'}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('3.'), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.waitForFunction(() => { const m = document.querySelector('main'); return m && !/Loading/.test(m.innerText); }, null, {timeout: 30000}).catch(() => {});
            const s3p = await snap(page, `s1-step3-${app.name}`);
            log('[S1 step3 file links] article.pdf=', await page.getByRole('link', {name: 'article.pdf'}).count(), 'png=', await page.getByRole('link', {name: /profile-image/}).count());
            log('[S1 step3 text]', txt(s3p).slice(0, 400));
            await page.goto(list); await waitList(page);
            log('[list row S1 after accept]', (await page.getByRole('row').filter({hasText: sc.s1.tag}).first().innerText()).replace(/\n/g, ' | '));
            // S4: accept with nobody assigned to the stage.
            await page.goto(wiz(sc.s4.submissionId)); await idle(page);
            await page.getByRole('checkbox', {name: /privacy statement/}).check();
            await page.getByRole('button', {name: 'Accept Review, Continue to Step #2'}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('2.'), null, {timeout: 30000}).catch(() => {});
            log('[S4 after accept tabs]', JSON.stringify(await tabsOf(page)));
            // S2: decline.
            await page.goto(wiz(sc.s2.submissionId)); await idle(page);
            await page.getByRole('link', {name: 'Decline Review Request'}).click();
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: 30000});
            await lastDialogFilled(page, 100);
            const body = dlg.frameLocator('iframe').first().locator('body');
            await body.waitFor({timeout: 30000});
            const prefilled = await body.innerText();
            const sD = await snap(page, `s2-decline-window-${app.name}`);
            log('[decline window aria]', JSON.stringify(sD.aria.dialogs).slice(0, 1500));
            log('[decline prefilled]', JSON.stringify(prefilled));
            await body.click(); await page.keyboard.press('Control+End'); await page.keyboard.press('End');
            await page.keyboard.type(`\nK2 line ${sc.s2.tag} added by the reviewer.`);
            await dlg.getByRole('button', {name: 'Decline Review Request'}).click();
            await page.waitForURL((u) => !u.pathname.includes('reviewer/submission'), {timeout: 30000}).catch(() => {});
            await idle(page).catch(() => {});
            const sL = await snap(page, `s2-after-decline-landing-${app.name}`);
            log('[after decline] url=', page.url(), 'title=', sL.title, 'h1=', JSON.stringify(await page.locator('h1').allTextContents()));
            log('[after decline text]', txt(sL).slice(0, 400), '| mentions decline:', /declin/i.test(sL.text.main || ''));
            for (const v of ['reviewer-action-required', 'reviewer-assignments-declined', 'reviewer-assignments-all']) {
                await page.goto(`${list}?currentViewId=${v}`); await waitList(page);
                const rows = page.getByRole('row').filter({hasText: sc.s2.tag});
                const c = await rows.count();
                log(`[view ${v}] heading=`, JSON.stringify(await page.locator('main h1, main h2').first().innerText().catch(() => '')), 'S2 rows=', c, c ? (await rows.first().innerText()).replace(/\n/g, ' | ') : '', 'buttons in row=', c ? await rows.first().getByRole('button').count() : null);
                if (c) await snap(page, `s2-list-${v}-${app.name}`);
            }
            const rW = await page.goto(wiz(sc.s2.submissionId)); await idle(page).catch(() => {});
            const sW = await snap(page, `s2-wizard-after-decline-${app.name}`);
            log('[S2 wizard after decline]', rW && rW.status(), page.url(), txt(sW).slice(0, 300));
            await signOut(page);
            saveScratch();
        } finally { await close(); }
    }

    // ------------------------------------------------------------- refused
    if (phase('refused')) {
        const listAddr = list;
        for (const who of ['ed', 'mgr', 'auth', 'rev2', 'admin']) {
            const {page, close} = await launch(app);
            try {
                await signIn(page, who === 'admin' ? 'admin' : U(who));
                const r = await page.goto(wiz(sc.s3.submissionId)); await idle(page).catch(() => {});
                const s = await snap(page, `refused-${who}-wizard-${app.name}`);
                log(`[refused ${who} wizard]`, r && r.status(), page.url(), '|', txt(s).slice(0, 250));
                if (who !== 'rev2') {
                    const r2 = await page.goto(listAddr); await idle(page).catch(() => {});
                    const s2 = await snap(page, `refused-${who}-list-${app.name}`);
                    log(`[refused ${who} list]`, r2 && r2.status(), page.url(), '|', txt(s2).slice(0, 250));
                    log(`[${who} sidebar has "My Assignments as Reviewer"]`, await page.getByText('My Assignments as Reviewer').count());
                }
                if (['rev2', 'ed', 'mgr'].includes(who) && sc.fileHref) {
                    const out = await tryDownload(page, sc.fileHref, who);
                    record(`file-link-${who}-${app.name}`, out);
                    if (!out.download) await shot(page, `file-link-${who}-${app.name}`);
                }
                await signOut(page);
            } finally { await close(); }
        }
        const {page, close} = await launch(app);
        try {
            const r = await page.goto(wiz(sc.s3.submissionId)); await idle(page).catch(() => {});
            const s = await snap(page, `refused-signed-out-wizard-${app.name}`);
            log('[signed out wizard]', r && r.status(), page.url(), s.title, '|', txt(s).slice(0, 200));
            const u = page.locator('input#username'); const pw = page.locator('input#password');
            if (await u.count()) {
                await pw.evaluate((e) => e.removeAttribute('maxlength'));
                await u.fill(U('rev')); await pw.fill(users.getPassword(U('rev')));
                await page.getByRole('button', {name: /^Login$/}).first().click();
                await page.waitForLoadState('load'); await idle(page).catch(() => {});
                const s2 = await snap(page, `refused-signed-in-from-wizard-${app.name}`);
                log('[after sign-in from wizard]', page.url(), s2.title, JSON.stringify(await tabsOf(page)));
                await signOut(page);
            }
        } finally { await close(); }
    }

    // -------------------------------------------------------------- editor
    if (phase('editor')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('ed'));
            await openRound(page, app, sc.s1.submissionId, cp);
            const row1 = await reviewerRow(page, 'Rita');
            log('[ed row S1]', (await row1.innerText()).replace(/\n/g, ' | '));
            await row1.getByRole('button', {name: 'More Actions'}).click();
            log('[ed row S1 menu]', JSON.stringify(await page.getByRole('menuitem').allTextContents()));
            await page.getByRole('menuitem', {name: /History/}).click();
            const hd = page.getByRole('dialog').last();
            await hd.waitFor({timeout: 30000}); await lastDialogFilled(page, 80);
            record(`editor-s1-history-${app.name}`, {aria: await hd.ariaSnapshot(), text: await hd.innerText()});
            log('[S1 history]', (await hd.innerText()).replace(/\n+/g, ' | ').slice(0, 600));
            await shot(page, `editor-s1-history-${app.name}`);
            await hd.getByRole('button', {name: 'Close'}).first().click().catch(() => page.keyboard.press('Escape'));
            await hd.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            // Activity log, if the workflow page offers one.
            const actLog = page.getByRole('button', {name: /Activity Log/}).or(page.getByRole('link', {name: /Activity Log/})).or(page.getByRole('tab', {name: /Activity Log/}));
            log('[activity log control count]', await actLog.count());
            if (await actLog.count()) {
                await actLog.first().click(); await idle(page);
                await lastDialogFilled(page, 80);
                const s = await snap(page, `editor-s1-activity-log-${app.name}`);
                const dtext = s.aria.dialogs.length ? await page.getByRole('dialog').last().innerText() : s.text.main;
                log('[S1 activity log]', dtext.replace(/\n+/g, ' | ').slice(0, 900));
                await page.keyboard.press('Escape');
            }
            // S2: declined row, Resend Review Request.
            await openRound(page, app, sc.s2.submissionId, cp);
            const row2 = await reviewerRow(page, 'Rita');
            log('[ed row S2]', (await row2.innerText()).replace(/\n/g, ' | '));
            await snap(page, `editor-s2-row-${app.name}`);
            await row2.getByRole('button', {name: 'More Actions'}).click();
            log('[ed row S2 menu]', JSON.stringify(await page.getByRole('menuitem').allTextContents()));
            const resend = page.getByRole('menuitem', {name: /Resend Review Request/});
            if (await resend.count()) {
                await resend.click();
                const rd = page.getByRole('dialog').last();
                await rd.waitFor({timeout: 30000}); await lastDialogFilled(page, 80);
                const sR = await snap(page, `editor-s2-resend-window-${app.name}`);
                log('[resend window]', JSON.stringify(sR.aria.dialogs).slice(0, 1200));
                const btn = rd.getByRole('button', {name: /Resend Review Request|Send|OK/}).last();
                log('[resend buttons]', JSON.stringify(await rd.getByRole('button').allTextContents()));
                await btn.click();
                await rd.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page);
                await page.reload(); await idle(page);
                const row2b = await reviewerRow(page, 'Rita');
                log('[ed row S2 after resend]', (await row2b.innerText()).replace(/\n/g, ' | '));
                await snap(page, `editor-s2-after-resend-${app.name}`);
            } else { await page.keyboard.press('Escape'); }
            await signOut(page);
            // The reviewer after the resend.
            await signIn(page, U('rev'));
            await page.goto(list); await waitList(page);
            const rr = page.getByRole('row').filter({hasText: sc.s2.tag});
            log('[rev list row S2 after resend] rows=', await rr.count(), await rr.count() ? (await rr.first().innerText()).replace(/\n/g, ' | ') : '');
            const rW = await page.goto(wiz(sc.s2.submissionId)); await idle(page).catch(() => {});
            const sW = await snap(page, `s2-wizard-after-resend-${app.name}`);
            log('[rev wizard S2 after resend]', rW && rW.status(), page.url(), JSON.stringify(await page.locator('main a, main button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null && /Decline|Accept|Save/.test(e.textContent)).map((e) => `${e.tagName}:${e.textContent.trim()}`))));
            await signOut(page);
        } finally { await close(); }
    }

    // ---------------------------------------------------------------- mail
    if (phase('mail')) {
        const read = async (name, to, contains) => {
            const found = await app.mail.find({to, contains, timeoutMs: 15000}).catch((e) => ({error: String(e.message).slice(0, 200)}));
            if (found.error) { log(`[mail ${name}]`, found.error); record(`mail-${name}-${app.name}`, found); return; }
            const res = await app.mail._search({to, contains});
            const mails = [];
            for (const m of res.messages || []) {
                const full = await app.mail.fullMessage(m.ID);
                mails.push({subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, replyTo: full.ReplyTo, date: full.Date, text: (full.Text || '').slice(0, 1200)});
            }
            record(`mail-${name}-${app.name}`, mails);
            log(`[mail ${name}] count=${mails.length}`, JSON.stringify(mails.map((m) => ({subject: m.subject, from: m.from, to: m.to, replyTo: m.replyTo, text: m.text.slice(0, 700)})), null, 1));
        };
        await read('s1-accept', `${U('ed')}@mail.test`, sc.s1.tag);
        await read('s2-decline', `${U('ed')}@mail.test`, sc.s2.tag);
        await read('s4-accept-contact', `${sc.tag}contact@mail.test`, sc.s4.tag);
        await read('s1-accept-mgr', `${U('mgr')}@mail.test`, sc.s1.tag);
    }

    // ------------------------------------------------------------ variants
    // The editor grants a file on S2 (reopened by the resend, unanswered) and
    // switches S3 to "Anonymous Reviewer/Disclosed Author"; the activity log
    // of S1 and S2 is read with a wait for its rows; the manager turns
    // "Restrict File Access" on and writes a competing-interests policy; the
    // reviewer then reads S3's details window and S2's step 1 before and after
    // accepting, and step 3 (Rule 7's "absent until acceptance", Fields step 1
    // CI rows, Actors "Download the files for review").
    if (phase('variants')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('ed'));
            await openRound(page, app, sc.s2.submissionId, cp);
            await page.getByRole('button', {name: 'Upload/Select Files', exact: true}).click();
            const manage = page.getByRole('dialog').filter({has: page.locator('form[id^="manageReviewFiles"], [id^="manageReviewFiles"], form[id^="selectFiles"]')}).first();
            await manage.waitFor({timeout: 30000});
            await uploadRoundFile(page, manage, PDF);
            const boxes = manage.locator('table input[type="checkbox"]');
            for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check().catch(() => {});
            await manage.getByRole('button', {name: /^(Save|OK)$/}).first().click();
            await manage.waitFor({state: 'detached', timeout: 30000}).catch(() => {});
            await idle(page); await page.reload(); await idle(page);
            const row = await reviewerRow(page, 'Rita');
            await row.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const edit = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
            await edit.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000});
            await idle(page);
            await edit.getByRole('row').filter({hasText: 'article.pdf'}).first().locator('input[type="checkbox"]').first().check();
            await edit.getByRole('button', {name: 'OK', exact: true}).click();
            await edit.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            for (const key of ['s1', 's2']) {
                await openRound(page, app, sc[key].submissionId, cp);
                await page.getByRole('button', {name: /Activity Log/}).first().click();
                const ad = page.getByRole('dialog').last();
                await ad.waitFor({timeout: 30000});
                await ad.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
                const t = await ad.innerText();
                record(`editor-${key}-activity-log-${app.name}`, {aria: await ad.ariaSnapshot(), text: t});
                log(`[${key} activity log]`, t.replace(/\n+/g, ' | ').slice(0, 1200));
                await shot(page, `editor-${key}-activity-log-${app.name}`);
                await ad.getByRole('button', {name: 'Close'}).first().click().catch(() => page.keyboard.press('Escape'));
                await ad.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
            }
            // S3 → Disclosed Author.
            await openRound(page, app, sc.s3.submissionId, cp);
            const row3 = await reviewerRow(page, 'Rita');
            await row3.getByRole('button', {name: 'More Actions'}).click();
            await page.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            const edit3 = page.getByRole('dialog').filter({has: page.locator('form#editReviewForm')});
            await edit3.locator('input[name="isReviewPubliclyVisible"]').waitFor({timeout: 30000});
            await idle(page);
            log('[S3 edit reviewMethod radios]', JSON.stringify(await edit3.locator('input[name="reviewMethod"]').evaluateAll((els) => els.map((e) => `${e.value}:${e.checked}:${e.labels?.[0]?.textContent.trim()}`))));
            await edit3.locator('input[name="reviewMethod"][value="1"]').check();
            await edit3.getByRole('button', {name: 'OK', exact: true}).click();
            await edit3.locator('form#editReviewForm').waitFor({state: 'hidden', timeout: 30000});
            await idle(page);
            await signOut(page);
            // The manager: Restrict File Access on, a competing-interests policy.
            await signIn(page, U('mgr'));
            await page.goto(app.url(`/index.php/${cp}/management/settings/workflow`)); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            await page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
            const restrict = page.locator('input[name="restrictReviewerFileAccess"]');
            log('[restrict before]', await restrict.isChecked());
            await restrict.check();
            await page.locator('#reviewSetup').getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await page.getByRole('tab', {name: 'Reviewer Guidance', exact: true}).click(); await idle(page);
            const ci = page.frameLocator('iframe[id^="reviewerGuidance-competingInterests-control"]').first().locator('body');
            await ci.waitFor({timeout: 30000}); await ci.click(); await ci.fill('K2 competing-interests policy text.');
            await page.locator('#reviewerGuidance').getByRole('button', {name: 'Save', exact: true}).click();
            await page.waitForFunction(() => document.body.innerText.includes('Saved'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            await page.reload(); await idle(page);
            await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
            await page.getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
            log('[restrict after reload]', await page.locator('input[name="restrictReviewerFileAccess"]').isChecked());
            await snap(page, `mgr-review-setup-${app.name}`);
            await signOut(page);
            // The reviewer under both settings.
            await signIn(page, U('rev'));
            await page.goto(wiz(sc.s3.submissionId)); await idle(page);
            log('[S3 review type now]', (await page.locator('main').innerText()).match(/Review Type\s*\n\s*([^\n]+)/)?.[1]);
            await openDetails(page, `s3-details-disclosed-${app.name}`);
            await page.goto(wiz(sc.s2.submissionId)); await idle(page);
            await page.waitForFunction(() => { const m = document.querySelector('main'); return m && !/Loading/.test(m.innerText); }, null, {timeout: 30000}).catch(() => {});
            const sV = await snap(page, `s2-step1-restricted-ci-${app.name}`);
            log('[S2 step1 restricted, unanswered] text=', txt(sV));
            log('[S2 step1 "Review Files" heading]', await page.getByText('Review Files', {exact: true}).count(), 'file links', await page.getByRole('link', {name: 'article.pdf'}).count());
            const radios = page.locator('input[name="competingInterestsOption"], input[type=radio]');
            log('[CI radios]', JSON.stringify(await radios.evaluateAll((els) => els.map((e) => `${e.name}=${e.value}:${e.checked}:${e.labels?.[0]?.textContent.trim()}`))));
            const ciBox = page.locator('iframe[id^="competingInterestsText"], textarea[name="competingInterestsText"], [id^="competingInterestsText"]').first();
            const visible = async () => page.locator('textarea[name="competingInterestsText"]').evaluate((e) => { const w = e.closest('.tox, div'); return !!(w && w.offsetParent); }).catch(() => 'n/a');
            log('[CI box before]', await ciBox.count(), await ciBox.isVisible().catch(() => 'n/a'), await visible());
            const second = page.getByRole('radio', {name: /I may have competing interests/});
            if (await second.count()) {
                await second.check();
                await page.locator('iframe[id^="competingInterestsText"]').first().waitFor({state: 'visible', timeout: 10000}).catch(() => {});
                log('[CI box after choosing second]', await ciBox.isVisible().catch(() => 'n/a'), await visible());
                await snap(page, `s2-step1-ci-second-${app.name}`);
                await page.getByRole('radio', {name: /I do not have any competing interests/}).check();
                await page.locator('iframe[id^="competingInterestsText"]').first().waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
                log('[CI box after choosing first again]', await ciBox.isVisible().catch(() => 'n/a'), await visible());
            }
            const ciSection = await page.locator('main').innerText().then((t) => (t.match(/Competing Interests[\s\S]{0,400}/) || [''])[0].replace(/\n+/g, ' | '));
            log('[CI section text]', ciSection);
            await page.getByRole('checkbox', {name: /privacy statement/}).check();
            await page.getByRole('button', {name: 'Accept Review, Continue to Step #2'}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('2.'), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.getByRole('tab', {name: '1. Request'}).click(); await idle(page);
            await page.waitForFunction(() => { const m = document.querySelector('main'); return m && !/Loading/.test(m.innerText) && document.querySelector('form[id*="Step1"], form[id*="step1"]'); }, null, {timeout: 30000}).catch(() => {});
            const sA = await snap(page, `s2-step1-restricted-accepted-${app.name}`);
            log('[S2 step1 restricted, accepted] "Review Files"', await page.getByText('Review Files', {exact: true}).count(), 'file links', await page.getByRole('link', {name: 'article.pdf'}).count(), '| text=', txt(sA).slice(0, 500));
            await page.getByRole('tab', {name: '2. Guidelines'}).click(); await idle(page);
            await page.getByRole('button', {name: 'Continue to Step #3'}).click();
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.includes('3.'), null, {timeout: 30000}).catch(() => {});
            await idle(page);
            await page.waitForFunction(() => { const m = document.querySelector('main'); return m && !/Loading/.test(m.innerText); }, null, {timeout: 30000}).catch(() => {});
            await snap(page, `s2-step3-restricted-${app.name}`);
            log('[S2 step3 restricted] file links', await page.getByRole('link', {name: 'article.pdf'}).count());
            await signOut(page);
        } finally { await close(); }
    }

    // ------------------------------------------------------------ internal
    if (phase('internal') && app.name === 'omp' && sc.s5) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, U('irev'));
            await page.goto(list); await waitList(page);
            const rr = page.getByRole('row').filter({hasText: sc.s5.tag});
            log('[irev list row S5] rows=', await rr.count(), await rr.count() ? (await rr.first().innerText()).replace(/\n/g, ' | ') : '');
            await snap(page, `s5-internal-list-${app.name}`);
            log('[irev sidebar group]', await page.getByText('My Assignments as Reviewer').count());
            const r = await page.goto(wiz(sc.s5.submissionId)); await idle(page).catch(() => {});
            const s = await snap(page, `s5-internal-wizard-${app.name}`);
            log('[irev wizard S5]', r && r.status(), page.url(), s.title, JSON.stringify(await tabsOf(page)), '|', txt(s).slice(0, 200));
            await signOut(page);
        } finally { await close(); }
    }
});
