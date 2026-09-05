// U29 claim check, chunk K3: Settings › Workflow › Review › "Reviewer
// Guidance" (the three/four boxes, the anonymity box and its dialog, the
// forms-language behaviour), Rule 7 (the anonymity link on the upload
// windows of the Submission stage and the review stages, both ends), and
// the reviewer's steps 1–2 (guidelines, competing-interests policy; OMP's
// internal vs external guidelines, OMP2, scenario 11), on OJS and OMP.
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Fields "Reviewer
// Guidance" table (82–93), Rule 7 (170–178), OMP2, scenarios 5 and 11.
//
// Seeds its own scratch context (en + fr_CA; throwaway manager, author,
// external reviewer, {OMP} internal reviewer; one submission on the
// Submission stage, one in external review with the reviewer accepted, {OMP}
// one in internal review with the internal reviewer accepted). Records every
// screen. Nothing on the seeded context is touched.
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U29/K3/k3.js
//   PHASES=seed,tab,on,drop,rev,lang   (default: all; later phases reuse k3-scratch-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'tab', 'on', 'drop', 'rev', 'lang'];
const on = (p) => PHASES.includes(p);
const scratchFile = (app) => path.join(outDir(), `k3-scratch-${app.name}.json`);
const log = (...a) => console.log(...a);
const flat = (s, n = 500) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const SEL_ALL = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

async function full(page, name, extra = {}) {
    const data = await screen(page);
    Object.assign(data, extra);
    record(name, data);
    await shot(page, name);
    return data;
}

/** Wait for a dialog with real content; snapshot it. `which` narrows (the workflow panel is also a dialog). */
async function dialogSnap(page, name, which) {
    const dlg = which || page.getByRole('dialog').last();
    await dlg.waitFor({timeout: 20000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.trim().length > 20; }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
    const d = {aria: await dlg.ariaSnapshot(), text: await dlg.innerText(), buttons: await dlg.getByRole('button').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => e.textContent.trim()))};
    record(name, d);
    await shot(page, name);
    return {dlg, d};
}

async function closeDialog(page, dlg, name) {
    const btn = dlg.getByRole('button', {name: name ? new RegExp(`^${name}$`) : /^(Cancel|Close|OK)$/}).first();
    if (await btn.count()) await btn.click(); else await page.keyboard.press('Escape');
    await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
    await idle(page);
}

const uploadDlg = (page) => page.locator('[role=dialog]').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();

async function guidanceTab(page, app, ctx, locale = 'en') {
    await page.goto(app.url(`/index.php/${ctx}/${locale}/management/settings/workflow#review/reviewerGuidance`));
    await idle(page);
    const review = page.getByRole('tab', {name: /^(Review|Évaluation)$/});
    if ((await review.getAttribute('aria-selected').catch(() => null)) !== 'true') await review.click();
    const side = page.getByRole('tab', {name: /^(Reviewer Guidance|Directives)/});
    if ((await side.getAttribute('aria-selected').catch(() => null)) !== 'true') await side.click();
    await page.locator('#reviewerGuidance').waitFor({timeout: 20000});
    await page.waitForFunction(() => { const fs = [...document.querySelectorAll('#reviewerGuidance iframe')]; return fs.length > 0 && fs.every((f) => f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable); }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
    return page.locator('#reviewerGuidance');
}

/** Everything a person sees on the guidance form, in order, plus the editors' content and toolbars. */
async function readGuidance(page) {
    return page.locator('#reviewerGuidance').evaluate((form) => {
        const vis = (e) => e.getClientRects().length > 0;
        const t = (e) => e.innerText.trim().replace(/\s+/g, ' ');
        return {
            headings: [...form.querySelectorAll('.pkpFormField__heading, .pkpFormFieldLabel, legend, label')].filter(vis).map(t),
            editors: [...form.querySelectorAll('.pkpFormField--richTextarea, .pkpFormField')].filter((f) => f.querySelector('iframe')).map((f) => ({
                heading: t(f.querySelector('.pkpFormField__heading, .pkpFormFieldLabel, label') || f).slice(0, 80),
                iframes: [...f.querySelectorAll('iframe')].map((i) => ({id: i.id, visible: vis(i), text: i.contentDocument && i.contentDocument.body ? i.contentDocument.body.innerText.trim().slice(0, 200) : null})),
                toolbar: [...f.querySelectorAll('.tox-toolbar__primary button, .tox-toolbar__overflow button')].map((b) => b.getAttribute('aria-label') || b.title || b.textContent.trim()),
            })),
            localeControls: [...form.querySelectorAll('[class*="ocale"]')].filter(vis).map((e) => `${e.tagName}.${e.className}: ${t(e).slice(0, 120)}`),
            localeButtons: [...form.querySelectorAll('.pkpFormLocales button, .pkpFormLocales a, button[class*="ocale"]')].filter(vis).map((b) => `${t(b)}${b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true' || /current|active/.test(b.className) ? '*' : ''}`),
            boxes: [...form.querySelectorAll('input[type=checkbox]')].map((c) => ({name: c.name, checked: c.checked, label: t(c.closest('label') || c.parentElement), buttonsInLabel: [...(c.closest('label') || c.parentElement).querySelectorAll('button, a')].map((b) => `${b.tagName}: ${t(b)}`)})),
            saveButtons: [...form.querySelectorAll('button')].filter((b) => /^save$/i.test(b.innerText.trim())).length,
            status: t(form.querySelector('.pkpFormPage__status') || {innerText: ''}),
        };
    });
}

async function setRich(page, iframeId, text) {
    const body = page.frameLocator(`#${iframeId}`).locator('body');
    await body.click();
    await page.keyboard.press(SEL_ALL);
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
}

/** Press Save; wait for the contexts POST and the "Saved" status; return both. */
async function saveGuidance(page, form) {
    const waited = page.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => null);
    const seen = new Set();
    const poll = (async () => { for (let i = 0; i < 60; i++) { const v = await page.locator('#reviewerGuidance .pkpFormPage__status').innerText().catch(() => ''); if (v.trim()) seen.add(v.trim()); if (/Saved|Enregistré/.test(v)) break; await new Promise((r) => setTimeout(r, 100)); } })();
    await form.getByRole('button', {name: /^(Save|Enregistrer)$/}).click();
    const resp = await waited;
    await poll;
    await idle(page);
    return {method: resp && resp.request().method(), status: resp && resp.status(), notices: [...seen]};
}

async function workflow(page, app, ctx, id) {
    await page.goto(app.url(`/index.php/${ctx}/en/dashboard/editorial?workflowSubmissionId=${id}`));
    await idle(page);
    await page.waitForFunction(() => /Submission Files|Files for Review|Review Files|Upload\/Select Files/.test(document.body.innerText), null, {timeout: 30000}).catch(() => {});
    await idle(page);
}

/** Inside an open upload wizard: the anonymity link, and where it sits relative to the drop zone and the step tabs. */
async function readUpload(dlg) {
    const d = await dlg.evaluate((root) => {
        const vis = (e) => e.getClientRects().length > 0;
        const links = [...root.querySelectorAll('a')].filter(vis).map((a) => ({id: a.id, text: a.textContent.trim().replace(/\s+/g, ' '), href: a.getAttribute('href')}));
        const ens = [...root.querySelectorAll('a')].find((a) => /anonymi/i.test(a.textContent));
        const drop = root.querySelector('.pkp_uploader_drop_zone, .plupload, [id*="plupload"], .pkpUploader, .moxie-shim') || [...root.querySelectorAll('*')].find((e) => /Drop files here|drag and drop|Add files/i.test(e.textContent) && e.children.length < 6);
        const tabs = [...root.querySelectorAll('[role=tab], .ui-tabs-nav a')].filter(vis).map((t) => t.textContent.trim());
        const y = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
        return {links, tabs, ensuring: ens ? {text: ens.textContent.trim(), id: ens.id, href: ens.getAttribute('href'), top: y(ens)} : null, dropZone: drop ? {tag: drop.tagName, cls: drop.className, top: y(drop), bottom: drop ? Math.round(drop.getBoundingClientRect().bottom) : null, text: drop.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)} : null, linkBelowDrop: ens && drop ? (drop.compareDocumentPosition(ens) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 : null, text: root.innerText.trim().replace(/\s+/g, ' ').slice(0, 600)};
    });
    return d;
}

async function submissionUpload(page, name) {
    const btn = page.getByRole('button', {name: 'Upload', exact: true}).first();
    await btn.waitFor({timeout: 30000});
    await btn.click();
    const dlg = uploadDlg(page);
    const {d} = await dialogSnap(page, name, dlg);
    const u = await readUpload(dlg);
    record(`${name}-links`, u);
    log(`[${name}] title=${flat(d.text, 60)} ensuring=${JSON.stringify(u.ensuring)} drop=${JSON.stringify(u.dropZone)} below=${u.linkBelowDrop} tabs=${JSON.stringify(u.tabs)}`);
    return {dlg, u};
}

async function reviewUpload(page, name) {
    const sel = page.getByRole('button', {name: 'Upload/Select Files'}).first();
    await sel.waitFor({timeout: 30000});
    await sel.click();
    const {dlg: win, d: wd} = await dialogSnap(page, `${name}-select-window`);
    log(`[${name} select window] ${flat(wd.text, 120)}`);
    await win.getByRole('link', {name: 'Upload Review File'}).click();
    const dlg = uploadDlg(page);
    const {d} = await dialogSnap(page, name, dlg);
    const u = await readUpload(dlg);
    record(`${name}-links`, u);
    log(`[${name}] title=${flat(d.text, 60)} ensuring=${JSON.stringify(u.ensuring)} drop=${JSON.stringify(u.dropZone)} below=${u.linkBelowDrop}`);
    return {dlg, win, u};
}

async function ensuringDialog(page, dlg, name) {
    const link = dlg.getByRole('link', {name: 'How to ensure all files are anonymized'});
    if (!(await link.count())) return null;
    await loc(page, 'upload window anonymity link', link.first());
    await link.first().click();
    const {dlg: ad, d} = await dialogSnap(page, name);
    const title = await ad.locator('h2, h3, .modal__title, [class*="title"]').first().innerText().catch(() => '');
    log(`[${name}] title="${flat(title, 80)}" buttons=${JSON.stringify(d.buttons)} first=${flat(d.text, 120)}`);
    await closeDialog(page, ad, 'Cancel');
    return {title: flat(title, 80), buttons: d.buttons, text: flat(d.text, 300)};
}

async function reviewerStep(page, app, ctx, id, step, name, locale = 'en') {
    await page.goto(app.url(`/index.php/${ctx}/${locale}/reviewer/submission/${id}?step=${step}`));
    await idle(page);
    await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
    if (step === 2) {
        // a typed ?step=2 lands on step 1 until "Save and continue" has been pressed once (screen notes pC1, pD)
        const sc = page.getByRole('button', {name: /Save and continue|Sauvegarder et continuer/});
        if (await sc.count()) {
            const noCI = page.locator('input[name="competingInterestOption"]').first();
            if (await noCI.count()) await noCI.check();
            await sc.click();
            await page.locator('[role=tab][aria-selected=true]').filter({hasText: /^2\./}).waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
        }
    }
    const s = await full(page, name, {selectedTab: await page.locator('[role=tab][aria-selected=true]').allInnerTexts().catch(() => [])});
    return s;
}

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[k3] OPS has no Review tab and no reviewer role; nothing in this chunk names it.'); return; }
    let sc = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;
    const out = {};

    if (on('seed') && !sc) {
        const t = tag('u29k3');
        sc = {tag: t, mgr: `${t}mgr`, au: `${t}au`, rev: `${t}rev`, subs: {}};
        const users = [
            {username: sc.mgr, roles: ['manager'], givenName: 'Greta', familyName: 'Guidance'},
            {username: sc.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: sc.rev, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'External'},
        ];
        if (app.name === 'omp') { sc.irev = `${t}irev`; users.push({username: sc.irev, roles: ['internalReviewer'], givenName: 'Ivo', familyName: 'Internal'}); }
        const ctx = await app.api.createContext({tag: t, context: {name: `U29 K3 ${t}`, acronym: 'U29K3', supportedLocales: ['en', 'fr_CA'], supportedSubmissionLocales: ['en', 'fr_CA'], contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.path = ctx.path || t; sc.contextId = ctx.contextId;
        const mk = async (k, extra) => { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.path, submitter: sc.au, title: `U29K3 ${k} ${t}`, ...extra}); sc.subs[k] = r.submissionId || r.id; };
        await mk('s1', {});
        await mk('s3', {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: sc.rev, status: 'accepted'}]}]});
        if (app.name === 'omp') await mk('s2', {decisions: ['sendInternalReview'], reviewRounds: [{stage: 'internal', reviewers: [{username: sc.irev, status: 'accepted'}]}]});
        fs.writeFileSync(scratchFile(app), JSON.stringify(sc, null, 2));
        log('[seed]', JSON.stringify(sc));
    }

    const {page, close} = await launch(app);
    const browserDialogs = [];
    page.on('dialog', (d) => { browserDialogs.push({type: d.type(), message: d.message()}); log('[browser dialog]', d.type(), d.message()); d.accept().catch(() => {}); });
    try {
        // ---------- tab: the fresh form, the words button and its dialog, the off end of Rule 7
        if (on('tab')) {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            const form = await guidanceTab(page, app, sc.path);
            out.tab = await readGuidance(page);
            out.tab.url = page.url();
            out.tab.sideTabs = await page.getByRole('tab').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).map((e) => `${e.textContent.trim()}${e.getAttribute('aria-selected') === 'true' ? '*' : ''}`));
            await full(page, 'tab-fresh', {read: out.tab});
            log('[tab] url=', out.tab.url, 'tabs=', JSON.stringify(out.tab.sideTabs));
            log('[tab] editors=', JSON.stringify(out.tab.editors.map((e) => ({h: e.heading, ids: e.iframes.map((i) => i.id), text: e.iframes.map((i) => i.text), toolbar: e.toolbar}))));
            log('[tab] locale controls=', JSON.stringify(out.tab.localeControls), 'buttons=', JSON.stringify(out.tab.localeButtons));
            log('[tab] boxes=', JSON.stringify(out.tab.boxes), 'save buttons=', out.tab.saveButtons);
            const words = form.locator('label button').first();
            await loc(page, 'anonymity box words button', words);
            await words.click();
            const {dlg, d} = await dialogSnap(page, 'tab-anonymity-dialog');
            out.tabDialog = {title: flat(await dlg.locator('h2, h3, .modal__title, [class*="title"]').first().innerText().catch(() => ''), 80), buttons: d.buttons, first: flat(d.text, 200)};
            log('[tab dialog]', JSON.stringify(out.tabDialog));
            await closeDialog(page, dlg, 'Close');
            out.tabAfterClose = {checked: await form.locator('input[type=checkbox]').first().isChecked(), dialogsOpen: await page.locator('[role=dialog]').evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0 && /anonymized/.test(e.innerText)).length)};
            log('[tab after Close]', JSON.stringify(out.tabAfterClose));
            // Rule 7, off end: no link on either stage's upload window
            await workflow(page, app, sc.path, sc.subs.s1);
            let r = await submissionUpload(page, 'off-upload-submission');
            out.offSubmission = r.u.ensuring;
            await closeDialog(page, r.dlg, 'Cancel');
            await workflow(page, app, sc.path, sc.subs.s3);
            r = await reviewUpload(page, 'off-upload-review');
            out.offReview = r.u.ensuring;
            await closeDialog(page, r.dlg, 'Cancel');
            await closeDialog(page, r.win, 'Close');
            if (app.name === 'omp') {
                await workflow(page, app, sc.path, sc.subs.s2);
                r = await reviewUpload(page, 'off-upload-internal');
                out.offInternal = r.u.ensuring;
                await closeDialog(page, r.dlg, 'Cancel');
                await closeDialog(page, r.win, 'Close');
            }
            await signOut(page);
        }

        // ---------- on: sentences typed, box ticked, Save → "Saved"; the link on both stages; its dialog
        if (on('on')) {
            const t = sc.tag;
            await signIn(page, sc.mgr, {contextPath: sc.path});
            const form = await guidanceTab(page, app, sc.path);
            if (app.name === 'omp') {
                await setRich(page, 'reviewerGuidance-internalReviewGuidelines-control-en_ifr', `INTERNAL-${t} internal guidelines sentence.`);
                await setRich(page, 'reviewerGuidance-reviewGuidelines-control-en_ifr', `EXTERNAL-${t} external guidelines sentence.`);
            } else {
                await setRich(page, 'reviewerGuidance-reviewGuidelines-control-en_ifr', `GUIDE-${t} review guidelines sentence.`);
            }
            await setRich(page, 'reviewerGuidance-competingInterests-control-en_ifr', `POLICY-${t} competing interests sentence.`);
            await form.locator('input[type=checkbox]').first().check();
            out.onSave = await saveGuidance(page, form);
            log('[on save]', JSON.stringify(out.onSave));
            await full(page, 'on-after-save');
            await guidanceTab(page, app, sc.path);
            const back = await readGuidance(page);
            out.onBack = {boxes: back.boxes.map((b) => b.checked), texts: back.editors.map((e) => e.iframes.map((i) => `${i.id}: ${i.text}`))};
            log('[on after reopen]', JSON.stringify(out.onBack));
            await workflow(page, app, sc.path, sc.subs.s1);
            let r = await submissionUpload(page, 'on-upload-submission');
            out.onSubmission = r.u;
            out.onSubmissionDialog = await ensuringDialog(page, r.dlg, 'on-upload-submission-dialog');
            await closeDialog(page, r.dlg, 'Cancel');
            await workflow(page, app, sc.path, sc.subs.s3);
            r = await reviewUpload(page, 'on-upload-review');
            out.onReview = r.u;
            out.onReviewDialog = await ensuringDialog(page, r.dlg, 'on-upload-review-dialog');
            await closeDialog(page, r.dlg, 'Cancel');
            await closeDialog(page, r.win, 'Close');
            if (app.name === 'omp') {
                await workflow(page, app, sc.path, sc.subs.s2);
                r = await reviewUpload(page, 'on-upload-internal');
                out.onInternal = r.u;
                out.onInternalDialog = await ensuringDialog(page, r.dlg, 'on-upload-internal-dialog');
                await closeDialog(page, r.dlg, 'Cancel');
                await closeDialog(page, r.win, 'Close');
            }
            await signOut(page);
        }

        // ---------- drop: with the box ticked, where the link sits once a component is chosen and the drop zone shows
        if (on('drop')) {
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await workflow(page, app, sc.path, sc.subs.s1);
            const r = await submissionUpload(page, 'drop-upload-before-component');
            const sel = r.dlg.locator('select[id^="genreId"], select[name="genreId"]').first();
            const opts = await sel.locator('option').allInnerTexts().catch(() => []);
            await sel.selectOption({index: 1});
            await page.waitForFunction(() => { const z = document.querySelector('[role=dialog] .pkp_controller_fileUpload'); return z && !z.classList.contains('pkp_screen_reader'); }, null, {timeout: 8000}).catch(() => {});
            await idle(page);
            const {d} = await dialogSnap(page, 'drop-upload-after-component', r.dlg);
            out.drop = {options: opts.slice(0, 6), after: await readUpload(r.dlg), zoneVisible: await r.dlg.locator('.pkp_controller_fileUpload').evaluate((z) => ({cls: z.className, visible: z.getClientRects().length > 0 && getComputedStyle(z).position !== 'absolute', top: Math.round(z.getBoundingClientRect().top), height: Math.round(z.getBoundingClientRect().height), text: z.innerText.trim().replace(/\s+/g, ' ').slice(0, 100)})).catch((e) => String(e))};
            log('[drop]', JSON.stringify(out.drop).slice(0, 1200));
            await closeDialog(page, r.dlg, 'Cancel');
            await signOut(page);
        }

        // ---------- rev: the reviewer's steps 1–2 with the sentences saved (OMP: internal and external)
        if (on('rev')) {
            await signIn(page, sc.rev, {contextPath: sc.path});
            const s1 = await reviewerStep(page, app, sc.path, sc.subs.s3, 1, 'rev-external-step1');
            const ci = page.getByRole('link', {name: /review this policy|Competing Interests/}).first();
            out.revStep1 = {ciLinks: await ci.count(), radios: await page.locator('input[name="competingInterestOption"]').evaluateAll((els) => els.map((e) => (e.closest('label') || e.parentElement).innerText.trim())), text: flat(s1.text.main, 900)};
            if (await ci.count()) {
                await ci.click();
                const {dlg, d} = await dialogSnap(page, 'rev-external-step1-policy');
                out.revStep1.dialog = {buttons: d.buttons, text: flat(d.text, 300)};
                await closeDialog(page, dlg, 'OK');
            }
            log('[rev step1]', JSON.stringify(out.revStep1).slice(0, 1200));
            const s2 = await reviewerStep(page, app, sc.path, sc.subs.s3, 2, 'rev-external-step2');
            out.revStep2 = {tab: s2.selectedTab, text: flat(s2.text.main, 700)};
            log('[rev step2]', JSON.stringify(out.revStep2));
            await signOut(page);
            if (app.name === 'omp') {
                await signIn(page, sc.irev, {contextPath: sc.path});
                const i1 = await reviewerStep(page, app, sc.path, sc.subs.s2, 1, 'rev-internal-step1');
                out.irevStep1 = {ciLinks: await page.getByRole('link', {name: /review this policy|Competing Interests/}).count(), text: flat(i1.text.main, 600)};
                const i2 = await reviewerStep(page, app, sc.path, sc.subs.s2, 2, 'rev-internal-step2');
                out.irevStep2 = {tab: i2.selectedTab, text: flat(i2.text.main, 700)};
                log('[irev]', JSON.stringify({s1: out.irevStep1, s2: out.irevStep2}));
                await signOut(page);
            }
        }

        // ---------- lang: French ticked under "Forms" → does the guidance form gain a language control; does the reviewer read French
        if (on('lang')) {
            const t = sc.tag;
            await signIn(page, sc.mgr, {contextPath: sc.path});
            await page.goto(app.url(`/index.php/${sc.path}/en/management/settings/website#setup/languages`));
            await idle(page);
            const setupTab = page.getByRole('tab', {name: 'Setup', exact: true});
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            const langTab = page.getByRole('tab', {name: 'Languages', exact: true});
            if ((await langTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await langTab.click();
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
            await idle(page);
            const frRow = page.locator('#languageGridContainer tbody tr.gridRow').filter({hasText: /Fran|French/});
            const formsBox = frRow.locator('input[type=checkbox][id*="formLocale"]').first();
            out.langGridBefore = await page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
            await full(page, 'lang-grid-before', {grid: out.langGridBefore});
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && !/fetchNotification/.test(r.url()), {timeout: 10000}).catch(() => null);
                await formsBox.click();
                await w;
                await idle(page);
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
            }
            out.langGridAfter = await page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
            await full(page, 'lang-grid-after', {grid: out.langGridAfter});
            log('[lang grid after]', JSON.stringify(out.langGridAfter));
            const form = await guidanceTab(page, app, sc.path);
            out.langTab = await readGuidance(page);
            await full(page, 'lang-guidance-two-locales', {read: out.langTab});
            log('[lang guidance] locale controls=', JSON.stringify(out.langTab.localeControls), 'buttons=', JSON.stringify(out.langTab.localeButtons), 'iframes=', JSON.stringify(out.langTab.editors.map((e) => e.iframes.map((i) => `${i.id}${i.visible ? '' : '(hidden)'}`))));
            // find a way to the French box: a locale button/tab in the form, or a fr_CA iframe already present
            const frFrame = page.locator('#reviewerGuidance iframe[id*="reviewGuidelines"][id*="fr_CA"]');
            if (!(await frFrame.count()) || !(await frFrame.first().isVisible())) {
                const frBtn = form.getByRole('button', {name: /Fran|French/}).or(form.getByRole('tab', {name: /Fran|French/})).first();
                log('[lang] French switch candidates=', await frBtn.count());
                if (await frBtn.count()) { await frBtn.click(); await idle(page); }
            }
            await page.waitForFunction(() => { const f = [...document.querySelectorAll('#reviewerGuidance iframe')].find((i) => /reviewGuidelines/.test(i.id) && /fr_CA/.test(i.id)); return f && f.getClientRects().length > 0 && f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable; }, null, {timeout: 8000}).catch(() => {});
            const frVisible = (await frFrame.count()) ? await frFrame.first().isVisible() : false;
            out.langFrenchBox = {count: await frFrame.count(), visible: frVisible, ids: await page.locator('#reviewerGuidance iframe').evaluateAll((els) => els.map((e) => `${e.id}${e.getClientRects().length ? '' : '(hidden)'}`))};
            await full(page, 'lang-guidance-french-box', {read: await readGuidance(page), fr: out.langFrenchBox});
            log('[lang] French box=', JSON.stringify(out.langFrenchBox));
            if (frVisible) {
                await setRich(page, 'reviewerGuidance-reviewGuidelines-control-fr_CA_ifr', `FRANCAIS-${t} phrase des directives.`);
                out.langSave = await saveGuidance(page, form);
                log('[lang save]', JSON.stringify(out.langSave));
                await signOut(page);
                await signIn(page, sc.rev, {contextPath: sc.path});
                const fr2 = await reviewerStep(page, app, sc.path, sc.subs.s3, 2, 'lang-rev-step2-fr', 'fr_CA');
                out.langRevFr = {url: page.url(), text: flat(fr2.text.main, 600)};
                const en2 = await reviewerStep(page, app, sc.path, sc.subs.s3, 2, 'lang-rev-step2-en', 'en');
                out.langRevEn = {url: page.url(), text: flat(en2.text.main, 600)};
                log('[lang reviewer fr]', JSON.stringify(out.langRevFr), '\n[lang reviewer en]', JSON.stringify(out.langRevEn));
            } else {
                // no French box: the reviewer reading in French sees what?
                await signOut(page);
                await signIn(page, sc.rev, {contextPath: sc.path});
                const fr2 = await reviewerStep(page, app, sc.path, sc.subs.s3, 2, 'lang-rev-step2-fr', 'fr_CA');
                out.langRevFr = {url: page.url(), text: flat(fr2.text.main, 600)};
                log('[lang reviewer fr, no French box]', JSON.stringify(out.langRevFr));
            }
            await signOut(page);
        }
    } finally {
        record('k3-summary', {browserDialogs, ...out});
        await close();
    }
});
