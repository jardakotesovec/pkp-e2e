// U31 claim check, chunk K2 — the submission wizard as the author: the
// "Reviewer Suggestions" step and panel, the "Add Reviewer Suggestion" /
// "Edit" window and its fields, "Delete", the Review step, "Save for Later",
// what the author sees after submitting (spec lines 50–103, register A2 and
// A4). OJS and OMP; OPS has no such step. docs/process/briefs/claim-check.md.
//
// Per app, two scratch contexts:
//   A  the setting on, ORCID off, English only: author "au", manager "mgr",
//      reviewer "rev"; D1 a wizard draft, S3 submitted and in review with one
//      seeded suggestion (the author's view of a review stage).
//   B  the setting on, ORCID on, en + fr_CA (French ticked as a form
//      language on screen by the manager): D2 a wizard draft.
//
// Phases (PHASES=a,b,… re-runs named ones on the saved contexts; the scratch
// state is scratch.json in the agent's output folder):
//   seed       the contexts and submissions
//   wizard1    author on D1: the step empty, the window's validation, add,
//              duplicate address (exact and upper-case), edit, delete
//              (cancel), the window closed with unsaved text
//   guidance   manager on A: Settings › Workflow › Submission "Author
//              Guidance" › "For Reviewer Suggestion": default text, then a
//              custom text saved (read back by wizard1b's reopen)
//   wizard1b   author on D1: Review step, Save for Later, reopen from My
//              Submissions, Review › Edit, delete all (confirm), Submit
//   wizard1c   author on D4 (a fresh draft): Review with no suggestion, the
//              warning, Submit still completes
//   after1     author: the workflow view of D1, D4 (no suggestion) and S3
//              (in review, one seeded suggestion); manager control on S3
//   lang       manager on B: French ticked under "Forms"
//   wizard2    author on D2: the multilingual boxes, ORCID box and its
//              refusal, a valid iD saved, the panel and Review step, Submit
//   after2     author: the workflow view of D2; manager: the Submission
//              stage panel, "Send for Review", the review stage panel row's
//              "Add Reviewer", the suggestion list and "Create New Reviewer"
//              (where a saved ORCID iD shows: A2 / t16)
//
//   PROBE_FEATURE=U31 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U31/K2/k2.js
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
const flat = (s, n = 1200) => (s || '').replace(/\n+/g, ' | ').slice(0, n);
const VALID_ORCID = '0000-0002-1825-0097';

async function sect(name, fn) { try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e).split('\n')[0]); } }
async function snap(page, name, extra) {
    let s; try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s); await shot(page, name).catch(() => {}); return s;
}
const dlg = (page) => page.getByRole('dialog').last();
const footer = (page) => page.locator('.submissionWizard__footer');
const current = (page) => page.locator('.pkpSteps__step__label--current');
const railLabels = (page) => page.locator('.pkpSteps__step__label').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' '))).catch(() => []);
const panelItems = (page) => page.locator('.listPanel__item').evaluateAll((els) => els.map((e) => ({
    text: e.innerText.trim().replace(/\s+/g, ' '),
    badges: [...e.querySelectorAll('.pkpBadge')].map((b) => b.innerText.trim()),
    buttons: [...e.querySelectorAll('button')].map((b) => b.innerText.trim()),
}))).catch(() => []);
const fieldErrors = (scope) => scope.locator('.pkpFieldError, .pkpFormField__error, [class*="Error"]').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
const labelsOf = (scope) => scope.locator('label, .pkpFormFieldLabel, .pkpFormField__heading').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
const textboxNames = (scope) => scope.getByRole('textbox').evaluateAll((els) => els.map((e) => {
    const l = e.labels && e.labels[0] ? e.labels[0].innerText.trim().replace(/\s+/g, ' ') : (e.getAttribute('aria-label') || e.name || e.id);
    return {label: l, id: e.id, value: e.value, visible: e.offsetParent !== null};
})).catch(() => []);
const iframeIds = (scope) => scope.locator('iframe').evaluateAll((els) => els.map((e) => ({id: e.id, visible: e.getClientRects().length > 0}))).catch(() => []);
const visibleNotes = (page) => page.locator('[role=status], [role=alert], .pkpNotification, .pkpToast, .pkp_notification, .pkpFormPage__status, .pkpForm__errors').evaluateAll((els) =>
    els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\n+/g, ' / ')).filter(Boolean)).catch(() => []);
const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.textContent.trim().replace(/\s+/g, ' ')}:selected=${e.getAttribute('aria-selected')}`)).catch(() => []);
const buttonsOf = (scope) => scope.getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.innerText.trim().replace(/\s+/g, ' ')}${e.disabled ? ' [disabled]' : ''}`).filter(Boolean)).catch(() => []);
const linksOf = (scope) => scope.getByRole('link').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);

/** The wizard for a draft; press Continue until the named step is current. */
async function openWizard(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/submission?id=${id}`));
    await idle(page);
    await current(page).first().waitFor({timeout: 30_000});
}
async function continueTo(page, label) {
    for (let i = 0; i < 7; i++) {
        await current(page).first().waitFor({timeout: 30_000});
        const cur = (await current(page).first().innerText()).trim();
        if (new RegExp(`${label}\\s*$`).test(cur)) return;
        await footer(page).getByRole('button', {name: 'Continue', exact: true}).click();
        await idle(page);
    }
    await current(page).filter({hasText: new RegExp(`${label}\\s*$`)}).first().waitFor({timeout: 30_000});
}
/** Open a started step from the rail (collapse-aware). */
async function railTo(page, label) {
    const cur0 = (await current(page).first().innerText().catch(() => '')).trim();
    log('[railTo]', label, 'from', cur0, 'rail', JSON.stringify(await railLabels(page)));
    if (!(await page.locator('button.pkpSteps__step__label').filter({hasText: new RegExp(`${label}\\s*$`)}).count())) {
        log('[railTo] no rail button for', label, '- pressing Continue instead');
        return continueTo(page, label);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
        if (await page.locator('.pkpSteps--collapsed').count()) {
            const controls = page.locator('.pkpSteps__controls button');
            if (await controls.count()) await controls.click();
        }
        await page.locator('button.pkpSteps__step__label').filter({hasText: new RegExp(`${label}\\s*$`)}).first().click();
        await idle(page);
        const cur = (await current(page).first().innerText().catch(() => '')).trim();
        if (new RegExp(`${label}\\s*$`).test(cur)) return;
    }
}
/** Upload the fixture PDF on "Upload Files" and answer the file-type prompt. */
async function uploadFile(page, app) {
    if (await page.locator('.listPanel__item--submissionFile').count()) { log('[upload] a file is already listed; skipped'); return; }
    const genre = app.name === 'omp' ? 'Book Manuscript' : 'Article Text';
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', {name: 'Add File', exact: true}).click(),
    ]);
    await chooser.setFiles(PDF);
    const gb = page.getByRole('button', {name: genre, exact: true});
    await gb.waitFor({timeout: 30_000});
    await gb.click();
    await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText(genre).first().waitFor({timeout: 30_000});
    await idle(page);
}
/** The Add / Edit window's boxes. Values not given are left as they are. */
async function fillWindow(page, d, v = {}) {
    if (v.givenName !== undefined) await d.getByRole('textbox', {name: /^Given Name/}).first().fill(v.givenName);
    if (v.familyName !== undefined) await d.getByRole('textbox', {name: /^Family Name/}).first().fill(v.familyName);
    if (v.email !== undefined) await d.getByRole('textbox', {name: /^Email/}).first().fill(v.email);
    if (v.orcid !== undefined) await d.getByRole('textbox', {name: /ORCID/}).first().fill(v.orcid);
    if (v.affiliation !== undefined) await d.getByRole('textbox', {name: /^Affiliation/}).first().fill(v.affiliation);
    if (v.reason !== undefined) {
        const body = d.frameLocator('iframe[id*="suggestionReason"]').first().locator('body');
        await body.click(); await body.fill(v.reason);
    }
}
async function windowState(page, d) {
    return {
        title: await d.locator('h1, h2, .modal__title, [class*="title"]').first().innerText().catch(() => null),
        textboxes: await textboxNames(d),
        labels: await labelsOf(d),
        iframes: await iframeIds(d),
        buttons: await buttonsOf(d),
        errors: await fieldErrors(d),
        saveDisabled: await d.getByRole('button', {name: 'Save', exact: true}).isDisabled().catch(() => null),
        text: flat(await d.innerText().catch(() => ''), 3000),
    };
}
async function openAdd(page) {
    await page.getByRole('button', {name: 'Add Reviewer Suggestion'}).click();
    const d = dlg(page);
    await d.getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30_000});
    await page.locator('iframe[id*="suggestionReason"]').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    return d;
}
async function pressSave(page, d) {
    await d.getByRole('button', {name: 'Save', exact: true}).click();
    await idle(page);
    await page.waitForTimeout(400);
    await idle(page);
}
async function closeWindow(page, d) {
    // the side window's own close control
    const x = d.getByRole('button', {name: /^Close$|^Cancel$/}).first();
    if (await x.count()) { await x.click(); } else { await page.keyboard.press('Escape'); }
    await idle(page);
}
async function workflowView(page, app, ctx, id, name, extra = {}) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/mySubmissions?workflowSubmissionId=${id}`));
    await idle(page);
    await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    const s = await snap(page, name, Object.assign({tabs: await tabsOf(page), buttons: await buttonsOf(page.getByRole('dialog').first()), links: await linksOf(page.getByRole('dialog').first())}, extra));
    s.hasSuggestionsText = hasSugg(s);
    record(name, s);
    return s;
}
/** Every stage entry of the workflow dialog's side menu, each recorded. */
const SUGG = /Reviewers Suggested by Author|Reviewer Suggestions/;
const hasSugg = (s) => SUGG.test(JSON.stringify(s.aria || '')) || SUGG.test(s.text.dialog || '') || SUGG.test(s.text.main || '');
async function everyStage(page, app, ctx, id, prefix) {
    const dialog = page.getByRole('dialog').first();
    const entries = await dialog.getByRole('treeitem').evaluateAll((els) => els.map((e) => (e.querySelector('a') || e).innerText.trim().replace(/\s+/g, ' ')).filter(Boolean)).catch(() => []);
    log(`[${prefix}] side menu entries:`, JSON.stringify(entries));
    const out = [];
    for (const label of entries) {
        if (!/^(Submission|Review|Review Round \d+|Internal Review|External Review|Copyediting|Production)$/.test(label)) continue;
        const item = dialog.getByRole('treeitem', {name: label, exact: true}).getByRole('link', {name: label, exact: true}).first();
        try { await item.click({timeout: 5000}); await idle(page); } catch (e) { out.push({label, clicked: false, why: String(e.message).slice(0, 80)}); continue; }
        const s = await snap(page, `${prefix}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
        out.push({label, suggestions: hasSugg(s), heading: ((s.text.dialog || '').match(/WORKFLOW: [^\n]+/) || [])[0] || null});
    }
    return out;
}

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[ops] skipped: no Reviewer Suggestions step'); return; }
    const sc = (scratchAll[app.name] = scratchAll[app.name] || {});
    const url = (p) => app.url(p);

    // ---- seed ---------------------------------------------------------------------------
    if (phase('seed')) {
        const A = tag('u31k2a'), B = tag('u31k2b');
        await app.api.createContext({tag: A, users: [
            {username: `${A}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${A}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${A}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
        ], review: {reviewerSuggestionEnabled: true}});
        await app.api.createContext({tag: B, supportedLocales: ['en', 'fr_CA'], context: {supportedLocales: ['en', 'fr_CA']}, users: [
            {username: `${B}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: `${B}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: `${B}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
        ], review: {reviewerSuggestionEnabled: true}, orcid: {enabled: true}}).catch(async (e) => {
            log('[seed B] first shape refused:', String(e.message).slice(0, 300));
            await app.api.createContext({tag: B, context: {supportedLocales: ['en', 'fr_CA']}, users: [
                {username: `${B}au`, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                {username: `${B}mgr`, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                {username: `${B}rev`, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'},
            ], review: {reviewerSuggestionEnabled: true}, orcid: {enabled: true}});
        });
        const d1 = await app.api.createSubmission({tag: `${A}d1`, context: A, submitter: `${A}au`, title: `U31 K2 D1 ${A}`, submitted: false});
        const s3 = await app.api.createSubmission({tag: `${A}s3`, context: A, submitter: `${A}au`, title: `U31 K2 S3 ${A}`, decisions: ['sendExternalReview'],
            reviewerSuggestions: [{givenName: 'Seeded', familyName: 'Suggestion', email: `seeded.${A}@mail.test`, affiliation: 'Seed University'}]});
        const d2 = await app.api.createSubmission({tag: `${B}d2`, context: B, submitter: `${B}au`, title: `U31 K2 D2 ${B}`, submitted: false});
        Object.assign(sc, {A, B, d1: d1.submissionId, s3: s3.submissionId, d2: d2.submissionId});
        saveScratch();
        log('[seed]', app.name, JSON.stringify(sc));
    }
    const {A, B} = sc;
    const E1 = {givenName: 'Kay', familyName: '', email: `kay.${A}@mail.test`, affiliation: 'Kay College', reason: 'Kay knows the field and has no conflict of interest.'};
    const E2 = {givenName: 'Lee', familyName: 'Second', email: `lee.${A}@mail.test`, affiliation: 'Lee Institute', reason: 'Lee wrote the standard reference.'};

    // ---- wizard1 -------------------------------------------------------------------------
    if (phase('wizard1')) {
        const {page, close} = await launch(app);
        page.on('dialog', (d) => { log('[native dialog]', d.type(), d.message()); d.dismiss().catch(() => {}); });
        try {
            await signIn(page, `${A}au`, {contextPath: A});
            await openWizard(page, app, A, sc.d1);
            await sect('upload', async () => { await uploadFile(page, app); });
            await continueTo(page, 'Reviewer Suggestions');
            const rail = await railLabels(page);
            log('[rail]', app.name, JSON.stringify(rail));
            let s = await snap(page, 'w1-step-empty', {rail, items: await panelItems(page), buttons: await buttonsOf(page.locator('main'))});
            log('[step empty]', app.name, flat(s.text.main, 900));
            await loc(page, 'wizard step: Add Reviewer Suggestion button', page.getByRole('button', {name: 'Add Reviewer Suggestion'}));

            // the window, saved empty
            let d = await openAdd(page);
            let w = await windowState(page, d);
            await snap(page, 'w1-add-window-empty', {window: w});
            log('[add window]', app.name, 'title', w.title, 'textboxes', JSON.stringify(w.textboxes.map((t) => t.label)), 'iframes', JSON.stringify(w.iframes));
            await loc(page, 'Add Reviewer Suggestion window: Given Name', d.getByRole('textbox', {name: /^Given Name/}).first());
            await loc(page, 'Add Reviewer Suggestion window: Email box', d.getByRole('textbox', {name: /^Email/}).first());
            await loc(page, 'Add Reviewer Suggestion window: Save', d.getByRole('button', {name: 'Save', exact: true}));
            await pressSave(page, d);
            w = await windowState(page, d);
            await snap(page, 'w1-add-window-saved-empty', {window: w});
            log('[saved empty]', app.name, 'errors', JSON.stringify(w.errors), 'saveDisabled', w.saveDisabled, 'notes', JSON.stringify(await visibleNotes(page)));

            // invalid address, the rest filled; family name left empty
            await fillWindow(page, d, {givenName: E1.givenName, email: 'not-an-email', affiliation: E1.affiliation, reason: E1.reason});
            await pressSave(page, d);
            w = await windowState(page, d);
            await snap(page, 'w1-add-window-bad-email', {window: w});
            log('[bad email]', app.name, 'errors', JSON.stringify(w.errors), 'saveDisabled', w.saveDisabled);

            // fixed: saved, no family name
            await fillWindow(page, d, {email: E1.email});
            await pressSave(page, d);
            await page.getByText(E1.email).first().waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1-step-one-entry', {items: await panelItems(page), windowOpen: await dlg(page).isVisible().catch(() => false)});
            log('[one entry]', app.name, JSON.stringify(s.items), 'windowOpen', s.windowOpen);

            // the duplicate address, then a second entry
            d = await openAdd(page);
            await fillWindow(page, d, {givenName: E2.givenName, familyName: E2.familyName, email: E1.email, affiliation: E2.affiliation, reason: E2.reason});
            await pressSave(page, d);
            w = await windowState(page, d);
            await snap(page, 'w1-add-window-duplicate', {window: w, items: await panelItems(page)});
            log('[duplicate]', app.name, 'errors', JSON.stringify(w.errors), 'notes', JSON.stringify(await visibleNotes(page)), 'saveDisabled', w.saveDisabled);
            // the other end of the uniqueness axis: the same address in another case
            await fillWindow(page, d, {email: E1.email.toUpperCase()});
            await pressSave(page, d);
            w = await windowState(page, d);
            const upperOpen = await dlg(page).getByRole('textbox', {name: /^Given Name/}).first().isVisible().catch(() => false);
            await snap(page, 'w1-add-window-duplicate-uppercase', {window: w, items: await panelItems(page), windowOpen: upperOpen});
            log('[duplicate uppercase]', app.name, 'windowOpen', upperOpen, 'errors', JSON.stringify(w.errors), 'items', JSON.stringify(await panelItems(page)));
            if (upperOpen) {
                await fillWindow(page, d, {email: E2.email});
                await pressSave(page, d);
            } else {
                // the uppercase twin was accepted: E2 becomes a fresh entry
                d = await openAdd(page);
                await fillWindow(page, d, {givenName: E2.givenName, familyName: E2.familyName, email: E2.email, affiliation: E2.affiliation, reason: E2.reason});
                await pressSave(page, d);
            }
            await page.getByText(E2.email).first().waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1-step-two-entries', {items: await panelItems(page)});
            log('[two entries]', app.name, JSON.stringify(s.items));

            // Edit E1: prefilled, family name added, same address kept
            const row1 = page.locator('.listPanel__item').filter({hasText: E1.email}).first();
            await loc(page, 'wizard step: an entry\'s Edit', row1.getByRole('button', {name: /Edit/}));
            await row1.getByRole('button', {name: /Edit/}).click();
            d = dlg(page);
            await d.getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30_000});
            await page.waitForFunction(() => { const i = [...document.querySelectorAll('[role=dialog] input')].find((e) => /given/i.test(e.id || e.name || '')); return i && i.value; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            w = await windowState(page, d);
            await snap(page, 'w1-edit-window', {window: w});
            log('[edit window]', app.name, 'title', w.title, 'values', JSON.stringify(w.textboxes.map((t) => [t.label, t.value])), 'reason', flat(await d.frameLocator('iframe[id*="suggestionReason"]').first().locator('body').innerText().catch(() => null), 200));
            await fillWindow(page, d, {familyName: 'Family'});
            await pressSave(page, d);
            await idle(page);
            s = await snap(page, 'w1-step-after-edit', {items: await panelItems(page), windowOpen: await dlg(page).getByRole('textbox', {name: /^Given Name/}).first().isVisible().catch(() => false)});
            log('[after edit]', app.name, JSON.stringify(s.items), 'windowOpen', s.windowOpen);

            // Edit E1 to E2's address: refused on edit too? then close with the unsaved change
            await row1.getByRole('button', {name: /Edit/}).click();
            d = dlg(page);
            await d.getByRole('textbox', {name: /^Given Name/}).first().waitFor({timeout: 30_000});
            await idle(page);
            await fillWindow(page, d, {email: E2.email});
            await pressSave(page, d);
            w = await windowState(page, d);
            await snap(page, 'w1-edit-window-duplicate', {window: w});
            log('[edit duplicate]', app.name, 'errors', JSON.stringify(w.errors), 'saveDisabled', w.saveDisabled);
            await fillWindow(page, d, {givenName: 'Kay unsaved'});
            await snap(page, 'w1-edit-window-before-close', {buttons: await buttonsOf(d)});
            await closeWindow(page, d);
            await page.waitForTimeout(500);
            s = await snap(page, 'w1-after-close-unsaved', {items: await panelItems(page), dialogs: await page.locator('[role="dialog"]:visible').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)))});
            log('[close unsaved]', app.name, 'dialogs', JSON.stringify(s.dialogs), 'items', JSON.stringify(s.items));
            // if a confirm dialog is up, take its first non-cancel path and record
            for (const dd of await page.locator('[role="dialog"]:visible').all()) {
                const t = await dd.innerText().catch(() => '');
                if (/sure|unsaved|discard|close/i.test(t) && !(await dd.getByRole('textbox').count())) {
                    log('[close unsaved] dialog buttons', JSON.stringify(await buttonsOf(dd)));
                    const b = dd.getByRole('button').filter({hasText: /Cancel|No|Keep/}).first();
                    if (await b.count()) { await b.click(); await idle(page); await snap(page, 'w1-after-close-unsaved-kept'); }
                    const still = dlg(page);
                    if (await still.getByRole('textbox', {name: /^Given Name/}).first().isVisible().catch(() => false)) {
                        await closeWindow(page, still);
                        const dd2 = page.locator('[role="dialog"]:visible').filter({hasText: /sure|unsaved|discard|close/i}).first();
                        const yes = dd2.getByRole('button').filter({hasText: /OK|Yes|Close|Discard|Leave/}).first();
                        if (await yes.count()) { await yes.click(); await idle(page); }
                    }
                }
            }
            s = await snap(page, 'w1-after-close-unsaved-final', {items: await panelItems(page)});
            log('[after close]', app.name, JSON.stringify(s.items));

            // Delete: Cancel, then confirm
            const row2 = page.locator('.listPanel__item').filter({hasText: E2.email}).first();
            await loc(page, 'wizard step: an entry\'s Delete', row2.getByRole('button', {name: /Delete/}));
            await row2.getByRole('button', {name: /Delete/}).click();
            await idle(page);
            const confirm = page.locator('[role="dialog"]:visible').filter({hasText: /remove this suggestion|Delete Reviewer Suggestion/}).first();
            await confirm.waitFor({timeout: 15_000}).catch(() => {});
            s = await snap(page, 'w1-delete-dialog', {dialogButtons: await buttonsOf(confirm), dialogText: flat(await confirm.innerText().catch(() => null), 500), dialogTitle: await confirm.locator('h1, h2, h3, [class*="title"]').first().innerText().catch(() => null)});
            log('[delete dialog]', app.name, 'title', s.dialogTitle, 'text', s.dialogText, 'buttons', JSON.stringify(s.dialogButtons));
            await confirm.getByRole('button', {name: 'Cancel', exact: true}).click();
            await idle(page);
            s = await snap(page, 'w1-delete-cancelled', {items: await panelItems(page)});
            log('[delete cancelled]', app.name, JSON.stringify(s.items));

            await signOut(page);
        } finally { await close(); }
    }

    // ---- guidance ------------------------------------------------------------------------
    if (phase('guidance')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${A}mgr`, {contextPath: A});
            await page.goto(url(`/index.php/${A}/management/settings/workflow`));
            await idle(page);
            let s = await snap(page, 'g-workflow-settings', {tabs: await tabsOf(page)});
            log('[workflow tabs]', app.name, JSON.stringify(s.tabs));
            await page.getByRole('tab', {name: 'Submission', exact: true}).click();
            await idle(page);
            s = await snap(page, 'g-submission-tab', {tabs: await tabsOf(page)});
            log('[submission tabs]', app.name, JSON.stringify(s.tabs));
            const guidanceTab = page.getByRole('tab', {name: /Author Guidance/}).first();
            if (await guidanceTab.count()) { await guidanceTab.click(); await idle(page); }
            const form = page.locator('form, .pkpForm').filter({hasText: 'For Reviewer Suggestion'}).first();
            await form.waitFor({timeout: 20_000}).catch(() => {});
            const fields = await page.locator('.pkpFormField').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({label: (e.querySelector('.pkpFormFieldLabel, label') || {}).innerText, description: (e.querySelector('.pkpFormField__description') || {}).innerText, iframe: (e.querySelector('iframe') || {}).id}))).catch(() => []);
            const heading = await page.locator('h1,h2,h3,h4').filter({hasText: /Author Guidance/}).first().innerText().catch(() => null);
            const iframeId = (fields.find((f) => /For Reviewer Suggestion/.test(f.label || '')) || {}).iframe;
            const defaultText = iframeId ? await page.evaluate((id) => window.tinymce?.get(id)?.getContent({format: 'text'}), iframeId.replace(/_ifr$/, '')).catch(() => null) : null;
            s = await snap(page, 'g-author-guidance', {fields, heading, iframeId, defaultText});
            log('[author guidance]', app.name, 'heading', heading, 'fields', JSON.stringify(fields.map((f) => f.label)), 'default', flat(defaultText, 600));
            note(`Settings › Workflow › Submission on ${app.name}: the "For Reviewer Suggestion" box is TinyMCE id ${iframeId || '(not found)'}; read it with tinymce.get(id).getContent()`);
            if (iframeId) {
                const body = page.frameLocator(`iframe#${iframeId}`).locator('body');
                await body.click(); await body.fill(`Custom reviewer guidance ${A}.`);
                const saveBtn = form.getByRole('button', {name: 'Save', exact: true}).first();
                await saveBtn.click();
                await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15_000}).catch(() => {});
                await idle(page);
                s = await snap(page, 'g-author-guidance-saved', {notes: await visibleNotes(page)});
                log('[guidance saved]', app.name, JSON.stringify(s.notes));
            }
            await signOut(page);
        } finally { await close(); }
    }

    // ---- wizard1b: the Review step, Save for Later, reopen, delete all, Submit ------------
    if (phase('wizard1b')) {
        const {page, close} = await launch(app);
        page.on('dialog', (d) => { log('[native dialog]', d.type(), d.message()); d.dismiss().catch(() => {}); });
        try {
            await signIn(page, `${A}au`, {contextPath: A});
            await openWizard(page, app, A, sc.d1);
            await snap(page, 'w1b-reopened-raw', {rail: await railLabels(page)});
            await railTo(page, 'Reviewer Suggestions');
            let s = await snap(page, 'w1b-step', {items: await panelItems(page)});
            log('[w1b step]', app.name, JSON.stringify(s.items.filter((i) => /@/.test(i.text))));
            // Continue to Review with two entries
            await continueTo(page, 'Review');
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const block = page.locator('.submissionWizard__reviewPanel').filter({has: page.getByRole('heading', {name: 'Reviewer Suggestions'})}).first();
            s = await snap(page, 'w1-review-two', {block: flat(await block.innerText().catch(() => null), 800), blockButtons: await buttonsOf(block), blockHeadings: await block.locator('h1,h2,h3,h4').evaluateAll((els) => els.map((e) => `${e.tagName}:${e.innerText.trim()}`)).catch(() => []), footerButtons: await buttonsOf(footer(page)), headerButtons: await buttonsOf(page.locator('header')), banner: await page.getByText('There are one or more problems').count()});
            log('[review two]', app.name, 'block', s.block, 'buttons', JSON.stringify(s.blockButtons), 'headings', JSON.stringify(s.blockHeadings), 'footer', JSON.stringify(s.footerButtons), 'banner', s.banner);
            await loc(page, 'Review step: Reviewer Suggestions block Edit', block.getByRole('button', {name: 'Edit'}));

            // Save for Later, reopen from My Submissions
            await footer(page).getByRole('button', {name: 'Save for Later', exact: true}).click();
            await page.getByRole('heading', {name: 'Saved for Later'}).waitFor({timeout: 45_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1-saved-for-later', {links: await linksOf(page.locator('main')), buttons: await buttonsOf(page.locator('main'))});
            log('[saved for later]', app.name, flat(s.text.main, 500));
            await page.goto(url(`/index.php/${A}/dashboard/mySubmissions`));
            await idle(page);
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
            s = await snap(page, 'w1-my-submissions', {views: await page.locator('nav, aside, [class*="views"]').getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' '))).catch(() => [])});
            log('[my submissions]', app.name, JSON.stringify(s.views), flat(s.text.main, 500));
            const incompleteView = page.getByRole('button', {name: /^Incomplete/}).first();
            if (await incompleteView.count()) { await incompleteView.click(); await idle(page); await snap(page, 'w1-my-submissions-incomplete'); }
            const row = page.locator('[class*="listItem"], tr, li').filter({hasText: `U31 K2 D1`}).first();
            const cont = row.getByRole('button', {name: /Continue|Resume|View/}).or(row.getByRole('link', {name: /Continue|Resume|View/})).first();
            log('[row controls]', app.name, JSON.stringify(await buttonsOf(row)), JSON.stringify(await linksOf(row)));
            if (await cont.count()) { await cont.click(); await idle(page); } else { await openWizard(page, app, A, sc.d1); }
            await current(page).first().waitFor({timeout: 30_000});
            log('[reopened on]', app.name, (await current(page).first().innerText()).trim(), page.url());
            await snap(page, 'w1-reopened');
            await railTo(page, 'Reviewer Suggestions');
            s = await snap(page, 'w1-step-reopened', {items: await panelItems(page)});
            log('[reopened step]', app.name, JSON.stringify(s.items), 'guidance', flat(s.text.main, 700));

            // Review › Edit returns to the step; then delete both, Review with none, Submit
            await continueTo(page, 'Review');
            await idle(page);
            await block.getByRole('button', {name: 'Edit'}).click();
            await idle(page);
            log('[review edit lands on]', app.name, (await current(page).first().innerText()).trim());
            await snap(page, 'w1-step-from-review-edit', {items: await panelItems(page)});
            for (let n = 0; n < 6; n++) {
                const r = page.locator('.listPanel__item').filter({hasText: /@/}).filter({has: page.getByRole('button', {name: 'Delete'})}).first();
                if (!(await r.count())) break;
                await r.getByRole('button', {name: /Delete/}).click();
                const c = page.locator('[role="dialog"]:visible').filter({hasText: /remove this suggestion|Delete Reviewer Suggestion/}).first();
                await c.waitFor({timeout: 15_000});
                await c.getByRole('button', {name: 'Delete Reviewer Suggestion', exact: true}).click();
                await idle(page);
                await r.waitFor({state: 'hidden', timeout: 15_000}).catch(() => {});
            }
            s = await snap(page, 'w1-step-deleted-all', {items: await panelItems(page)});
            log('[deleted all]', app.name, JSON.stringify(s.items), flat(s.text.main, 400));
            await continueTo(page, 'Review');
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1-review-none', {block: flat(await block.innerText().catch(() => null), 800), blockButtons: await buttonsOf(block), footerButtons: await buttonsOf(footer(page)), banner: await page.getByText('There are one or more problems').count(), warnings: await page.locator('.pkpNotification, [class*="notification"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' ')))});
            log('[review none]', app.name, 'block', s.block, 'footer', JSON.stringify(s.footerButtons), 'banner', s.banner, 'warnings', JSON.stringify(s.warnings));
            await footer(page).getByRole('button', {name: 'Submit', exact: true}).click();
            const sd = page.getByRole('dialog').filter({hasText: /will be submitted to|submit/i}).last();
            await sd.waitFor({timeout: 30_000}).catch(() => {});
            await snap(page, 'w1-submit-dialog', {dialogText: flat(await sd.innerText().catch(() => null), 500), buttons: await buttonsOf(sd)});
            await sd.getByRole('button', {name: 'Submit', exact: true}).click();
            await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1-submission-complete');
            log('[submitted]', app.name, flat(s.text.main, 300));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- wizard1c: a second draft submitted with no suggestion (the warning never blocks Submit) ----
    if (phase('wizard1c')) {
        if (!sc.d4) {
            const d4 = await app.api.createSubmission({tag: `${A}d4`, context: A, submitter: `${A}au`, title: `U31 K2 D4 ${A}`, submitted: false});
            sc.d4 = d4.submissionId; saveScratch();
        }
        const {page, close} = await launch(app);
        page.on('dialog', (d) => { log('[native dialog]', d.type(), d.message()); d.dismiss().catch(() => {}); });
        try {
            await signIn(page, `${A}au`, {contextPath: A});
            await openWizard(page, app, A, sc.d4);
            await sect('upload', async () => { await uploadFile(page, app); });
            await continueTo(page, 'Reviewer Suggestions');
            let s = await snap(page, 'w1c-step-empty', {items: await panelItems(page)});
            log('[w1c step guidance]', app.name, flat(s.text.main, 700));
            await continueTo(page, 'Review');
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const block = page.locator('.submissionWizard__reviewPanel').filter({has: page.getByRole('heading', {name: 'Reviewer Suggestions'})}).first();
            s = await snap(page, 'w1c-review-none', {block: flat(await block.innerText().catch(() => null), 800), blockButtons: await buttonsOf(block), footerButtons: await buttonsOf(footer(page)), banner: await page.getByText('There are one or more problems').count(), warnings: await page.locator('.pkpNotification, [class*="notification"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim().replace(/\s+/g, ' ')))});
            log('[w1c review none]', app.name, 'block', s.block, 'buttons', JSON.stringify(s.blockButtons), 'footer', JSON.stringify(s.footerButtons), 'banner', s.banner, 'warnings', JSON.stringify(s.warnings));
            await footer(page).getByRole('button', {name: 'Submit', exact: true}).click();
            const sd = page.getByRole('dialog').filter({hasText: /will be submitted to|submit/i}).last();
            await sd.waitFor({timeout: 30_000}).catch(() => {});
            await snap(page, 'w1c-submit-dialog', {dialogText: flat(await sd.innerText().catch(() => null), 500), buttons: await buttonsOf(sd)});
            await sd.getByRole('button', {name: 'Submit', exact: true}).click();
            await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w1c-submission-complete');
            log('[w1c submitted]', app.name, flat(s.text.main, 200));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- after1 --------------------------------------------------------------------------
    if (phase('after1')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${A}au`, {contextPath: A});
            let s = await workflowView(page, app, A, sc.d1, 'a1-author-d1');
            log('[author d1]', app.name, 'tabs', JSON.stringify(s.tabs), 'suggestions text', s.hasSuggestionsText, flat(s.text.dialog, 600));
            const stages1 = await everyStage(page, app, A, sc.d1, 'a1-author-d1');
            log('[author d1 stages]', app.name, JSON.stringify(stages1));
            if (sc.d4) {
                s = await workflowView(page, app, A, sc.d4, 'a1-author-d4');
                log('[author d4]', app.name, 'tabs', JSON.stringify(s.tabs), 'suggestions text', s.hasSuggestionsText, flat(s.text.dialog, 400));
            }
            s = await workflowView(page, app, A, sc.s3, 'a1-author-s3');
            log('[author s3]', app.name, 'tabs', JSON.stringify(s.tabs), 'suggestions text', s.hasSuggestionsText, flat(s.text.dialog, 600));
            const stages3 = await everyStage(page, app, A, sc.s3, 'a1-author-s3');
            log('[author s3 stages]', app.name, JSON.stringify(stages3));
            await signOut(page);
            // control: the manager on S3 sees the panel
            await signIn(page, `${A}mgr`, {contextPath: A});
            await page.goto(url(`/index.php/${A}/dashboard/editorial?workflowSubmissionId=${sc.s3}`));
            await idle(page);
            await page.getByText('Reviewers Suggested by Author').first().waitFor({timeout: 30_000}).catch(() => {});
            s = await snap(page, 'a1-manager-s3');
            log('[manager s3]', app.name, 'suggestions text', hasSugg(s));
            await signOut(page);
        } finally { await close(); }
    }

    // ---- lang ----------------------------------------------------------------------------
    if (phase('lang')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${B}mgr`, {contextPath: B});
            await page.goto(url(`/index.php/${B}/management/settings/website`)); await idle(page);
            const setupTab = page.locator('#setup-button');
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            await page.getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
            const gridRows = () => page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
            await snap(page, 'l-grid-before', {grid: await gridRows()});
            const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: 10000}).catch(() => null);
                await formsBox.click();
                const resp = await w; await idle(page);
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
                log('[lang] forms box POST', resp ? resp.status() : 'none');
            }
            const after = await gridRows();
            await snap(page, 'l-grid-after', {grid: after});
            log('[lang grid]', app.name, JSON.stringify(after));
            sc.frenchForms = true; saveScratch();
            await signOut(page);
        } finally { await close(); }
    }

    // ---- wizard2 -------------------------------------------------------------------------
    if (phase('wizard2')) {
        const {page, close} = await launch(app);
        page.on('dialog', (d) => { log('[native dialog]', d.type(), d.message()); d.dismiss().catch(() => {}); });
        try {
            await signIn(page, `${B}au`, {contextPath: B});
            await openWizard(page, app, B, sc.d2);
            await sect('upload', async () => { await uploadFile(page, app); });
            await continueTo(page, 'Reviewer Suggestions');
            let s = await snap(page, 'w2-step-empty', {rail: await railLabels(page), items: await panelItems(page)});
            log('[w2 step]', app.name, flat(s.text.main, 600));
            let d = await openAdd(page);
            let w = await windowState(page, d);
            const localeButtons = await d.getByRole('button').filter({hasText: /^(English|French|Français)$/}).evaluateAll((els) => els.map((e) => `${e.innerText.trim()}${e.getAttribute('aria-pressed') ? ` pressed=${e.getAttribute('aria-pressed')}` : ''}`)).catch(() => []);
            await snap(page, 'w2-add-window', {window: w, localeButtons});
            log('[w2 add window]', app.name, 'textboxes', JSON.stringify(w.textboxes.map((t) => [t.label, t.visible])), 'iframes', JSON.stringify(w.iframes), 'localeButtons', JSON.stringify(localeButtons), 'labels', JSON.stringify(w.labels));
            const fr = d.getByRole('button').filter({hasText: /^(French|Français)$/}).first();
            if (await fr.count()) {
                await fr.click(); await idle(page);
                w = await windowState(page, d);
                await snap(page, 'w2-add-window-french', {window: w});
                log('[w2 french]', app.name, 'textboxes', JSON.stringify(w.textboxes.map((t) => [t.label, t.visible])), 'iframes', JSON.stringify(w.iframes));
            }
            // ORCID: malformed, then valid
            const orcidBox = d.getByRole('textbox', {name: /ORCID/}).first();
            log('[w2 orcid box]', app.name, 'count', await orcidBox.count());
            await loc(page, 'Add Reviewer Suggestion window: ORCID iD box', orcidBox);
            const E3 = {givenName: 'Orla', familyName: 'Orcid', email: `orla.${B}@mail.test`, affiliation: 'Orcid University', reason: 'Orla maintains the corpus this work builds on.'};
            await fillWindow(page, d, {givenName: E3.givenName, familyName: E3.familyName, email: E3.email, affiliation: E3.affiliation, reason: E3.reason, orcid: '1234'});
            await pressSave(page, d);
            w = await windowState(page, d);
            await snap(page, 'w2-add-window-bad-orcid', {window: w});
            log('[w2 bad orcid]', app.name, 'errors', JSON.stringify(w.errors), 'saveDisabled', w.saveDisabled);
            // the bare iD, then the full URI
            await fillWindow(page, d, {orcid: VALID_ORCID});
            await pressSave(page, d);
            w = await windowState(page, d);
            const bareOpen = await d.getByRole('textbox', {name: /ORCID/}).first().isVisible().catch(() => false);
            await snap(page, 'w2-add-window-bare-orcid', {window: w, windowOpen: bareOpen});
            log('[w2 bare orcid]', app.name, 'windowOpen', bareOpen, 'errors', JSON.stringify(w.errors));
            if (bareOpen) {
                await fillWindow(page, d, {orcid: `https://orcid.org/${VALID_ORCID}`});
                await pressSave(page, d);
                w = await windowState(page, d);
                log('[w2 uri orcid]', app.name, 'windowOpen', await d.getByRole('textbox', {name: /ORCID/}).first().isVisible().catch(() => false), 'errors', JSON.stringify(w.errors));
            }
            await page.getByText(E3.email).first().waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w2-step-one-entry', {items: await panelItems(page)});
            log('[w2 one entry]', app.name, JSON.stringify(s.items), 'orcid in main', (s.text.main || '').includes(VALID_ORCID));
            // Edit: is the iD stored?
            const row = page.locator('.listPanel__item').filter({hasText: E3.email}).first();
            await row.getByRole('button', {name: /Edit/}).click();
            d = dlg(page);
            await d.getByRole('textbox', {name: /ORCID/}).first().waitFor({timeout: 30_000}).catch(() => {});
            await page.waitForFunction(() => { const i = [...document.querySelectorAll('[role=dialog] input')].find((e) => /orcid/i.test(e.id || e.name || '')); return i && i.value; }, null, {timeout: 15_000}).catch(() => {});
            await idle(page);
            w = await windowState(page, d);
            await snap(page, 'w2-edit-window', {window: w});
            log('[w2 edit]', app.name, 'values', JSON.stringify(w.textboxes.map((t) => [t.label, t.value])));
            await closeWindow(page, d);
            await idle(page);
            await continueTo(page, 'Review');
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const block = page.locator('.submissionWizard__reviewPanel').filter({has: page.getByRole('heading', {name: 'Reviewer Suggestions'})}).first();
            s = await snap(page, 'w2-review', {block: flat(await block.innerText().catch(() => null), 800), banner: await page.getByText('There are one or more problems').count()});
            log('[w2 review]', app.name, 'block', s.block, 'orcid in block', (s.block || '').includes(VALID_ORCID), 'banner', s.banner);
            await footer(page).getByRole('button', {name: 'Submit', exact: true}).click();
            const sd = page.getByRole('dialog').filter({hasText: /will be submitted to|submit/i}).last();
            await sd.waitFor({timeout: 30_000}).catch(() => {});
            await sd.getByRole('button', {name: 'Submit', exact: true}).click();
            await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45_000}).catch(() => {});
            await idle(page);
            s = await snap(page, 'w2-submission-complete');
            log('[w2 submitted]', app.name, flat(s.text.main, 200));
            sc.E3 = E3; saveScratch();
            await signOut(page);
        } finally { await close(); }
    }

    // ---- after2 --------------------------------------------------------------------------
    if (phase('after2')) {
        const {page, close} = await launch(app);
        try {
            await signIn(page, `${B}au`, {contextPath: B});
            let s = await workflowView(page, app, B, sc.d2, 'a2-author-d2');
            log('[author d2]', app.name, 'tabs', JSON.stringify(s.tabs), 'suggestions text', s.hasSuggestionsText, 'orcid', (s.text.dialog || '').includes(VALID_ORCID));
            const stages = await everyStage(page, app, B, sc.d2, 'a2-author-d2');
            log('[author d2 stages]', app.name, JSON.stringify(stages));
            await signOut(page);

            await signIn(page, `${B}mgr`, {contextPath: B});
            await page.goto(url(`/index.php/${B}/dashboard/editorial?workflowSubmissionId=${sc.d2}`));
            await idle(page);
            await page.getByText('Reviewers Suggested by Author').first().waitFor({timeout: 30_000}).catch(() => {});
            s = await snap(page, 'a2-manager-d2-submission');
            const panelText = JSON.stringify(s.aria);
            log('[manager d2 submission stage]', app.name, 'orcid anywhere', panelText.includes(VALID_ORCID), 'panel', flat(panelText.slice(panelText.indexOf('Reviewers Suggested by Author')), 500));
            // Send for Review through the screen (once)
            if (!sc.d2InReview) {
                const dialog = page.getByRole('dialog').first();
                const send = dialog.getByRole('button', {name: /Send for Review|Send to External Review|Send to Review/}).first();
                log('[send button]', app.name, await send.count() ? await send.innerText() : 'none', JSON.stringify(await buttonsOf(dialog)));
                await send.click();
                await page.waitForURL(/decision/, {timeout: 30_000}).catch(() => {});
                await idle(page);
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
                await snap(page, 'a2-decision-page');
                const cont = page.getByRole('button', {name: 'Continue', exact: true});
                const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
                for (let i = 0; i < 5 && !(await rec.isVisible().catch(() => false)); i++) { await cont.first().click(); await idle(page); }
                await rec.click();
                await idle(page);
                await page.waitForTimeout(1000);
                await idle(page);
                s = await snap(page, 'a2-decision-recorded');
                log('[decision recorded]', app.name, page.url(), flat(s.text.dialog || s.text.main, 300));
                sc.d2InReview = true; saveScratch();
            }
            // the review stage
            await page.goto(url(`/index.php/${B}/dashboard/editorial?workflowSubmissionId=${sc.d2}`));
            await idle(page);
            await page.getByText('Reviewers Suggested by Author').first().waitFor({timeout: 30_000}).catch(() => {});
            s = await snap(page, 'a2-manager-d2-review');
            const t2 = JSON.stringify(s.aria);
            log('[manager d2 review stage]', app.name, 'orcid anywhere', t2.includes(VALID_ORCID), flat(t2.slice(t2.indexOf('Reviewers Suggested by Author')), 500));
            const more = page.getByRole('dialog').first().getByRole('button', {name: new RegExp(`${sc.E3.givenName} ${sc.E3.familyName} More Actions`, 'i')}).first();
            log('[more actions]', app.name, await more.count(), await more.count() ? await more.getAttribute('aria-label') : '');
            await loc(page, 'review stage: the suggestion row\'s More Actions', more);
            await more.click(); await idle(page);
            const items = await page.getByRole('menuitem').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim())).catch(() => []);
            log('[row menu]', app.name, JSON.stringify(items));
            await snap(page, 'a2-row-menu', {items});
            await page.getByRole('menuitem', {name: /Add Reviewer/}).first().click();
            await idle(page);
            const addR = page.getByRole('dialog', {name: /Add Reviewer/i}).first();
            await addR.waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            await page.waitForTimeout(800);
            await idle(page);
            s = await snap(page, 'a2-add-reviewer-window', {buttons: await buttonsOf(addR), dialogText: flat(await addR.innerText().catch(() => null), 2500)});
            log('[add reviewer window]', app.name, 'orcid', (s.dialogText || '').includes(VALID_ORCID), 'buttons', JSON.stringify(s.buttons), 'text', s.dialogText);
            const createNew = addR.getByRole('button', {name: /Create New Reviewer/}).first();
            if (await createNew.count()) {
                await createNew.click(); await idle(page);
                await page.waitForTimeout(800); await idle(page);
                const form = page.locator('[role="dialog"]:visible').last();
                const inputs = await form.locator('input, textarea, select').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({name: e.name, id: e.id, value: e.value, label: (e.labels && e.labels[0] && e.labels[0].innerText.trim()) || ''}))).catch(() => []);
                s = await snap(page, 'a2-create-new-reviewer', {inputs, dialogText: flat(await form.innerText().catch(() => null), 2500)});
                log('[create new reviewer]', app.name, 'orcid input', JSON.stringify(inputs.filter((i) => /orcid/i.test(`${i.name} ${i.id} ${i.label}`))), 'orcid text', (s.dialogText || '').includes(VALID_ORCID), 'inputs', JSON.stringify(inputs.map((i) => [i.label || i.name, i.value])));
            } else {
                // a suggestion without an account opens the window on the "Create New Reviewer" form itself
                const inputs = await addR.locator('input, textarea, select').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => ({name: e.name, id: e.id, value: e.value, type: e.type, label: (e.labels && e.labels[0] && e.labels[0].innerText.trim()) || ''}))).catch(() => []);
                const allInputs = await addR.locator('input, textarea, select').evaluateAll((els) => els.map((e) => `${e.name || e.id}=${e.value}`)).catch(() => []);
                s = await snap(page, 'a2-create-new-reviewer', {inputs, allInputs, dialogText: flat(await addR.innerText().catch(() => null), 2500)});
                log('[create new reviewer form]', app.name, 'orcid input', JSON.stringify(allInputs.filter((i) => /orcid/i.test(i))), 'visible inputs', JSON.stringify(inputs.map((i) => [i.label || i.name, i.type, i.value])));
                const back = addR.getByRole('button', {name: /Back to Search/}).first();
                if (await back.count()) {
                    await back.click(); await idle(page); await page.waitForTimeout(500); await idle(page);
                    s = await snap(page, 'a2-add-reviewer-search', {buttons: await buttonsOf(addR), dialogText: flat(await addR.innerText().catch(() => null), 2500)});
                    log('[back to search]', app.name, 'orcid', (s.dialogText || '').includes(VALID_ORCID), 'text', s.dialogText);
                }
            }
            await signOut(page);
        } finally { await close(); }
    }
    saveScratch();
});
