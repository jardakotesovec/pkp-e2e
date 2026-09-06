// U29 claim check, chunk K3: the "Reviewer Guidance" side tab of Settings ›
// Workflow › "Review" and its effects (the reviewer wizard's steps 1–3, the
// anonymity link in the upload windows), on OJS and OMP (OPS has no "Review"
// tab and no reviewer role; no line of this chunk names it).
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Fields "Reviewer
// Guidance" (lines 78–88), Rules 10–11 (227–252), scenarios 4–5 (487–505),
// register OMP2 (656–667); footnotes e, s4, s5, f-omp2.
//
// Seeds its own scratch journal/press: context A (en + fr_CA as UI locales;
// throwaway manager, author, external reviewer, {OMP} internal reviewer;
// s0 on the Submission stage, s1 in external review with the reviewer
// invited, {OMP} s2 in internal review with the internal reviewer invited)
// and context B (the control: nothing typed on "Reviewer Guidance").
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U29/K3/k3.js
//   PHASES=seed,setup,tab,s5,guidance,uploadOn,uploadOff,rev,internal,lang
//   (default: all; later phases reuse k3-scratch-<app>.json in the output folder)
//
// Order matters: s5 leaves the anonymity box ON, uploadOn reads the windows
// with it on, uploadOff turns it off and reads them again; rev accepts the
// external request on s1, and lang reads that accepted request's step 2.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',')
    : ['seed', 'setup', 'tab', 's5', 'guidance', 'uploadOn', 'uploadOff', 'rev', 'internal', 'lang'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n = 400) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const scratchFile = (app) => path.join(outDir(), `k3-scratch-${app.name}.json`);

const GUIDE = 'Judge the method first.';
const CI = 'Declare any funding link.';
const INTERNAL = 'Internal reviewers weigh the sample size.';
const FRENCH = 'Jugez la méthode en premier.';
const NO_GUIDE = 'This publisher has not set any reviewer guidelines.';
const CI_SENTENCE = 'This publisher has a policy for disclosure of potential competing interests from its reviewers. Please take a moment to review this policy.';
const BOX_SENTENCE = 'Present a link to how to ensure all files are anonymized during upload';
const WORDS = 'how to ensure all files are anonymized';
const WINDOW_TITLE = 'How to ensure all files are anonymized';

// ---------- helpers
async function snap(page, name, extra) {
    const s = await screen(page);
    record(name, extra ? {...extra, ...s} : s);
    await shot(page, name);
    return s;
}
async function dialogSnap(page, name, which) {
    const dlg = which || page.locator('[role=dialog]:visible').last();
    await dlg.waitFor({timeout: 20000});
    await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.offsetParent !== null).pop(); return d && d.innerText.trim().length > 20; }, null, {timeout: 20000}).catch(() => {});
    await idle(page);
    const buttons = await dlg.getByRole('button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim() || e.getAttribute('aria-label')));
    const title = await dlg.locator('h1, h2, h3, .modal__header, .pkp_modal_title, [class*="title"]').first().innerText().catch(() => '');
    const d = {title: flat(title, 120), buttons, aria: await dlg.ariaSnapshot(), text: await dlg.innerText()};
    record(name, d);
    await shot(page, name);
    return {dlg, d};
}
async function closeDialog(page, dlg, prefer) {
    const names = prefer ? [prefer, 'Cancel', 'Close', 'OK'] : ['Cancel', 'Close', 'OK'];
    for (const n of names) {
        const b = dlg.getByRole('button', {name: n, exact: true}).first();
        if (await b.count() && await b.isVisible().catch(() => false)) { await b.click(); break; }
    }
    await dlg.waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
    await idle(page);
}
async function reviewTop(page, app, ctxPath) {
    await page.goto(app.url(`/index.php/${ctxPath}/management/settings/workflow`)); await idle(page);
    const top = await page.locator('main').getByRole('tablist').first().getByRole('tab').allInnerTexts();
    await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
    return top.map((t) => t.trim());
}
async function guidanceTab(page, app, ctxPath) {
    await reviewTop(page, app, ctxPath);
    await page.getByRole('tab', {name: 'Reviewer Guidance'}).click(); await idle(page);
    await page.locator('#reviewerGuidance').waitFor({timeout: 20000});
    await page.waitForFunction(() => { const fs = [...document.querySelectorAll('#reviewerGuidance iframe')]; return fs.length > 0 && fs.every((f) => f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable); }, null, {timeout: 20000}).catch(() => {});
    return page.locator('#reviewerGuidance');
}
async function setRich(page, idPrefix, text) {
    const body = page.frameLocator(`iframe[id^="${idPrefix}"]`).first().locator('body');
    await body.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.press('Delete');
    if (text) await page.keyboard.type(text);
}
async function richTexts(page) {
    await page.waitForFunction(() => [...document.querySelectorAll('#reviewerGuidance iframe')].every((f) => f.contentDocument && f.contentDocument.body), null, {timeout: 20000}).catch(() => {});
    return page.locator('#reviewerGuidance iframe').evaluateAll((els) => els.map((f) => ({id: f.id, visible: f.getClientRects().length > 0, text: f.contentDocument.body.innerText.trim().slice(0, 160)})));
}
// The tab as data: box headings in order, help texts, language controls, toolbars, the box and its sentence.
async function readGuidance(page) {
    return page.locator('#reviewerGuidance').evaluate((form) => {
        const vis = (e) => e.getClientRects().length > 0;
        const t = (e) => e.innerText.trim().replace(/\s+/g, ' ');
        const fields = [...form.querySelectorAll('.pkpFormField')].filter(vis).map((f) => ({
            heading: t(f.querySelector('.pkpFormField__heading, legend, label') || f).slice(0, 160),
            description: [...f.querySelectorAll('.pkpFormField__description')].filter(vis).map(t).join(' | '),
            localeLabels: [...f.querySelectorAll('.pkpFormField__localeLabel, .pkpFormGroup__locale')].filter(vis).map(t),
            toolbar: [...f.querySelectorAll('.tox-toolbar__primary button')].map((b) => b.getAttribute('aria-label') || b.title || b.textContent.trim()),
            iframes: [...f.querySelectorAll('iframe')].map((i) => `${i.id}${vis(i) ? '' : '(hidden)'}`),
            checkbox: [...f.querySelectorAll('input[type=checkbox]')].map((b) => ({name: b.name, checked: b.checked, sentence: t(b.closest('label') || b.parentElement), inner: [...(b.closest('label') || b.parentElement).querySelectorAll('button, a')].map((x) => `${x.tagName}:"${x.textContent.trim()}"`)})),
        }));
        const localeControls = [...form.querySelectorAll('.pkpFormLocales, .pkpFormLocales button, [class*="ocale"]')].filter(vis).map((e) => `${e.tagName}.${e.className}: ${t(e).slice(0, 80)}`);
        const saveButtons = [...form.querySelectorAll('button')].filter((b) => vis(b) && b.textContent.trim() === 'Save').length;
        return {fields, localeControls, saveButtons, status: t(form.querySelector('.pkpFormPage__status') || {innerText: ''})};
    });
}
async function saveGuidance(page, form, name) {
    const seen = [];
    const onResp = (r) => { if (r.request().method() !== 'GET') seen.push(`${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, '')} -> ${r.status()}`); };
    page.on('response', onResp);
    const statuses = new Set();
    const poll = (async () => { for (let i = 0; i < 60; i++) { const v = await page.locator('.pkpFormPage__status, [role=status], .pkpNotification, .app__notifications, .pkpForm__errorSummary').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).join(' || ')).catch(() => ''); if (v) statuses.add(v); await new Promise((r) => setTimeout(r, 100)); } })();
    await form.getByRole('button', {name: 'Save', exact: true}).click();
    await poll;
    page.off('response', onResp);
    await idle(page);
    const out = {requests: seen, statuses: [...statuses]};
    log(`[${name} save]`, JSON.stringify(out));
    record(`${name}-after-save`, {...out, ...(await screen(page))});
    return out;
}
async function workflow(page, app, ctxPath, id) {
    await page.goto(app.url(`/index.php/${ctxPath}/dashboard/editorial?workflowSubmissionId=${id}`)); await idle(page);
    await page.waitForFunction(() => /Submission Files|Files for Review|Review Files/.test(document.body.innerText), null, {timeout: 30000}).catch(() => {});
    await idle(page);
}
const uploadWizard = (page) => page.locator('[role=dialog]').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
async function describeUpload(page, dlg, name) {
    const {d} = await dialogSnap(page, name, dlg);
    const links = await dlg.locator('a, button').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => `${e.tagName}|${e.textContent.trim().replace(/\s+/g, ' ')}`));
    const ens = dlg.getByRole('link', {name: WINDOW_TITLE, exact: true});
    const anyAnon = await dlg.locator('a, button').filter({hasText: /anonymi/i}).count();
    const facts = {title: d.title, buttons: d.buttons, links, anonymityLinks: await ens.count(), anyAnonymityControls: anyAnon};
    record(`${name}-facts`, facts);
    log(`[${name}]`, JSON.stringify(facts).slice(0, 900));
    return ens;
}
async function openSubmissionUpload(page, name) {
    const vue = page.getByRole('button', {name: 'Upload', exact: true}).first();
    await vue.waitFor({timeout: 30000});
    await vue.click();
    const dlg = uploadWizard(page);
    return {dlg, ens: await describeUpload(page, dlg, name)};
}
async function openReviewUpload(page, name) {
    const sel = page.getByRole('button', {name: 'Upload/Select Files'}).first();
    await sel.waitFor({timeout: 30000});
    await sel.click();
    const {dlg: win, d: wd} = await dialogSnap(page, `${name}-select-window`);
    log(`[${name} select window] title="${wd.title}" buttons=${JSON.stringify(wd.buttons)}`);
    const up = win.getByRole('link', {name: 'Upload Review File'});
    await up.click();
    const dlg = uploadWizard(page);
    return {win, dlg, ens: await describeUpload(page, dlg, name)};
}
async function pressAnonymityLink(page, ens, name) {
    await loc(page, 'upload window › "How to ensure all files are anonymized" link', ens.first());
    await ens.first().click();
    const {dlg, d} = await dialogSnap(page, `${name}-dialog`);
    log(`[${name} dialog] title="${d.title}" buttons=${JSON.stringify(d.buttons)} text=`, flat(d.text, 200));
    await closeDialog(page, dlg, 'Cancel');
    return {title: d.title, buttons: d.buttons, text: flat(d.text, 300)};
}
async function wizardOpen(page, app, ctxPath, id, name, locale) {
    await page.goto(app.url(`/index.php/${ctxPath}${locale ? `/${locale}` : ''}/reviewer/submission/${id}`)); await idle(page);
    await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
    const s1 = await snap(page, `${name}-step1`);
    const main = s1.text.main || '';
    const radios = await page.locator('input[name="competingInterestOption"]').evaluateAll((els) => els.map((e) => `${e.value}${e.checked ? ' (checked)' : ''}: ${(e.closest('label') || e.parentElement).innerText.trim().replace(/\s+/g, ' ')}`));
    const ciLink = page.getByRole('link', {name: 'Competing Interests', exact: true}).first();
    const facts = {url: page.url(), ciLabel: (main.match(/Competing Interests/g) || []).length, ciSentence: main.includes(CI_SENTENCE), ciTextInline: main.includes(CI), radios, ciLink: await ciLink.count(), privacyBoxes: await page.getByRole('checkbox', {name: /privacy statement/}).count()};
    if (await ciLink.count()) {
        await ciLink.click();
        const {dlg, d} = await dialogSnap(page, `${name}-step1-ci-dialog`);
        facts.ciDialog = {title: d.title, buttons: d.buttons, text: flat(d.text, 300)};
        await closeDialog(page, dlg, 'OK');
    }
    record(`${name}-step1-facts`, facts);
    log(`[${name} step1]`, JSON.stringify(facts));
    return facts;
}
async function wizardAccept(page, name) {
    const radios = page.locator('input[name="competingInterestOption"]');
    if (await radios.count()) await radios.first().check();
    const priv = page.getByRole('checkbox', {name: /privacy statement/});
    if (await priv.count()) await priv.first().check();
    const acc = page.getByRole('button', {name: /Accept Review, Continue to Step #2/});
    const sc = page.getByRole('button', {name: 'Save and continue'});
    await (await acc.count() ? acc : sc).first().click();
    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('2.'), null, {timeout: 30000}).catch(() => {});
    await idle(page);
    const s2 = await snap(page, `${name}-step2`);
    const facts = {url: page.url(), heading: (s2.text.main || '').includes('Reviewer Guidelines'), text: flat(s2.text.main, 700)};
    record(`${name}-step2-facts`, facts);
    log(`[${name} step2]`, JSON.stringify(facts).slice(0, 900));
    return facts;
}
async function wizardStep3(page, name) {
    const c3 = page.getByRole('button', {name: /Continue to Step #3/});
    if (await c3.count()) await c3.first().click();
    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3.'), null, {timeout: 30000}).catch(() => {});
    await idle(page);
    const s3 = await snap(page, `${name}-step3`);
    const link = page.getByRole('link', {name: 'Review Guidelines', exact: true});
    const facts = {url: page.url(), blockLabel: (s3.text.main || '').includes('Reviewer Guidelines'), links: await link.count()};
    if (await link.count()) {
        await link.first().click();
        const {dlg, d} = await dialogSnap(page, `${name}-step3-guidelines-dialog`);
        facts.dialog = {title: d.title, buttons: d.buttons, text: flat(d.text, 300)};
        await closeDialog(page, dlg, 'OK');
    }
    record(`${name}-step3-facts`, facts);
    log(`[${name} step3]`, JSON.stringify(facts));
    return facts;
}

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[k3 ops] skipped: no "Review" tab and no reviewer role (chunk K7 drives OPS)'); return; }
    const file = scratchFile(app);
    let sc = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    const {page, close} = await launch(app);
    const browserDialogs = [];
    // a partial rerun (PHASES=…) merges into the facts already recorded for this app instead of replacing them
    const factsFile = path.join(outDir(), `k3-facts-${app.name}.json`);
    let facts = fs.existsSync(factsFile) ? (() => { const o = JSON.parse(fs.readFileSync(factsFile, "utf8")); delete o.browserDialogs; return o; })() : {};
    page.on('dialog', (d) => { browserDialogs.push(`${d.type()}: ${d.message()}`); d.accept().catch(() => {}); });
    try {
        // ---------- seed
        if (on('seed') || !sc) {
            const mk = async (label, opts) => {
                const t = tag('u29k3');
                const users = {mgr: `${t}mgr`, au: `${t}au`, rev: `${t}rev`};
                const list = [
                    {username: users.mgr, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                    {username: users.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                    {username: users.rev, roles: ['externalReviewer'], givenName: 'Rhea', familyName: 'External'},
                ];
                if (opts.internal) { users.irev = `${t}irev`; list.push({username: users.irev, roles: ['internalReviewer'], givenName: 'Ivo', familyName: 'Internal'}); }
                const context = {name: `U29 K3 ${label} ${t}`, acronym: 'U29K3', ...(opts.fr ? {supportedLocales: ['en', 'fr_CA']} : {})};
                const ctx = await app.api.createContext({tag: t, context, users: list});
                const out = {tag: t, path: ctx.path || t, users, subs: {}};
                const sub = async (k, extra) => { const r = await app.api.createSubmission({tag: `${t}${k}`, context: out.path, submitter: users.au, title: `U29K3 ${label} ${k}`, ...extra}); out.subs[k] = r.submissionId; };
                await sub('s0', {});
                await sub('s1', {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: users.rev, status: 'invited'}]}]});
                if (opts.internal) await sub('s2', {decisions: ['sendInternalReview'], reviewRounds: [{stage: 'internal', reviewers: [{username: users.irev, status: 'invited'}]}]});
                return out;
            };
            sc = {a: await mk('A', {internal: app.name === 'omp', fr: true}), b: await mk('B', {})};
            fs.writeFileSync(file, JSON.stringify(sc, null, 1));
            log(`[seed ${app.name}]`, JSON.stringify(sc));
        }
        const A = sc.a, B = sc.b;
        const keep = (k, v) => { facts[k] = v; record('k3-facts', {browserDialogs, ...facts}); };

        // ---------- setup: OMP2's Setup-tab strings (Press/Publisher Library, Restrict File Access text, completion deadline help)
        if (on('setup')) {
            await signIn(page, A.users.mgr, {contextPath: A.path});
            const top = await reviewTop(page, app, A.path);
            await page.getByRole('tabpanel', {name: 'Review'}).getByRole('tab', {name: 'Setup', exact: true}).click(); await idle(page);
            await page.locator('#reviewSetup').waitFor({timeout: 20000});
            const s = await snap(page, 'setup-tab');
            const setupText = await page.locator('#reviewSetup').innerText();
            const fieldTexts = await page.locator('#reviewSetup .pkpFormField').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 260)));
            keep('setup', {
                topTabs: top,
                sideTabs: await page.getByRole('tabpanel', {name: 'Review'}).getByRole('tab').allInnerTexts(),
                restrictText: fieldTexts.find((t) => /Restrict File Access/.test(t)) || null,
                completionText: fieldTexts.find((t) => /Completion Deadline/.test(t)) || null,
                hasOmp2Restrict: setupText.includes('Reviewers will have access to the submission file only after agreeing to review it.'),
                hasOmp2Weeks: setupText.includes('Weeks allowed for review completion'),
            });
            log('[setup]', JSON.stringify(facts.setup), flat(s.title, 60));
        }

        // ---------- tab: "Reviewer Guidance" as installed; the words in the sentence; the window; the box stays unticked
        if (on('tab')) {
            if (!on('setup')) await signIn(page, A.users.mgr, {contextPath: A.path});
            const form = await guidanceTab(page, app, A.path);
            const read = await readGuidance(page);
            await snap(page, 'tab-fresh', {read});
            const box = form.locator('input[name="showEnsuringLink"]').first();
            await loc(page, 'Reviewer Guidance › anonymity box', box);
            const words = form.locator('label button, label a').filter({hasText: WORDS});
            await loc(page, 'Reviewer Guidance › the words in the sentence (a button)', words.first());
            await words.first().click();
            const {dlg, d} = await dialogSnap(page, 'tab-anonymity-window');
            const beforeClose = {title: d.title, buttons: d.buttons, text: flat(d.text, 200), boxWhileOpen: await box.isChecked()};
            await closeDialog(page, dlg, 'Close');
            keep('tab', {
                url: page.url(),
                sideTabs: await page.getByRole('tabpanel', {name: 'Review'}).getByRole('tab').allInnerTexts(),
                headings: read.fields.map((f) => f.heading),
                descriptions: read.fields.map((f) => f.description),
                localeLabels: read.fields.map((f) => f.localeLabels),
                localeControls: read.localeControls,
                toolbars: read.fields.map((f) => f.toolbar),
                saveButtons: read.saveButtons,
                box: read.fields.map((f) => f.checkbox).flat(),
                boxSentenceExact: (await box.evaluate((b) => (b.closest('label') || b.parentElement).innerText.trim().replace(/\s+/g, ' '))) === BOX_SENTENCE,
                wordsTag: await words.first().evaluate((e) => `${e.tagName}:${e.getAttribute('type') || ''}`),
                window: beforeClose,
                afterClose: {boxChecked: await box.isChecked(), dialogsOpen: await page.locator('[role=dialog]:visible').count()},
                richTexts: await richTexts(page),
            });
            log('[tab]', JSON.stringify(facts.tab).slice(0, 1500));
        }

        // ---------- s5: tick, Save, fresh navigation, still ticked; press the words; "Close"
        if (on('s5')) {
            if (!on('setup') && !on('tab')) await signIn(page, A.users.mgr, {contextPath: A.path});
            const form = await guidanceTab(page, app, A.path);
            const box = form.locator('input[name="showEnsuringLink"]').first();
            const before = await box.isChecked();
            await box.check();
            const save = await saveGuidance(page, form, 's5-guidance');
            await page.goto(app.url(`/index.php/${A.path}/index`)); await idle(page);   // leave, then come back fresh
            const form2 = await guidanceTab(page, app, A.path);
            const box2 = form2.locator('input[name="showEnsuringLink"]').first();
            const after = await box2.isChecked();
            await snap(page, 's5-after-reload', {boxChecked: after});
            await form2.locator('label button, label a').filter({hasText: WORDS}).first().click();
            const {dlg, d} = await dialogSnap(page, 's5-window');
            const closeBtn = dlg.getByRole('button', {name: 'Close', exact: true});
            const closeCount = await closeBtn.count();
            await closeDialog(page, dlg, 'Close');
            keep('s5', {boxBefore: before, save, boxAfterReload: after, window: {title: d.title, buttons: d.buttons}, closeButtons: closeCount, dialogsAfterClose: await page.locator('[role=dialog]:visible').count(), boxAfterWindow: await box2.isChecked()});
            log('[s5]', JSON.stringify(facts.s5));
        }

        // ---------- guidance: type the sentences, Save, fresh navigation
        if (on('guidance')) {
            if (!on('setup') && !on('tab') && !on('s5')) await signIn(page, A.users.mgr, {contextPath: A.path});
            const form = await guidanceTab(page, app, A.path);
            await setRich(page, 'reviewerGuidance-reviewGuidelines-control', GUIDE);
            await setRich(page, 'reviewerGuidance-competingInterests-control', CI);
            if (app.name === 'omp') await setRich(page, 'reviewerGuidance-internalReviewGuidelines-control', INTERNAL);
            const save = await saveGuidance(page, form, 'guidance');
            await page.goto(app.url(`/index.php/${A.path}/index`)); await idle(page);
            await guidanceTab(page, app, A.path);
            const texts = await richTexts(page);
            await snap(page, 'guidance-after-reload', {texts});
            keep('guidance', {save, texts});
            log('[guidance]', JSON.stringify(facts.guidance));
        }

        // ---------- uploadOn: with the box on (s5), the Submission and Review stage upload windows
        if (on('uploadOn')) {
            if (!on('setup') && !on('tab') && !on('s5') && !on('guidance')) await signIn(page, A.users.mgr, {contextPath: A.path});
            const out = {};
            await workflow(page, app, A.path, A.subs.s0);
            await snap(page, 'on-submission-stage');
            let u = await openSubmissionUpload(page, 'on-submission-upload');
            out.submission = {links: await u.ens.count(), label: await u.ens.first().innerText().catch(() => null)};
            if (out.submission.links) out.submission.window = await pressAnonymityLink(page, u.ens, 'on-submission-upload');
            await closeDialog(page, u.dlg, 'Cancel');
            await workflow(page, app, A.path, A.subs.s1);
            await snap(page, 'on-review-stage');
            let r = await openReviewUpload(page, 'on-review-upload');
            out.review = {links: await r.ens.count(), label: await r.ens.first().innerText().catch(() => null)};
            if (out.review.links) out.review.window = await pressAnonymityLink(page, r.ens, 'on-review-upload');
            await closeDialog(page, r.dlg, 'Cancel'); await closeDialog(page, r.win, 'Cancel');
            if (A.subs.s2) {
                await workflow(page, app, A.path, A.subs.s2);
                await snap(page, 'on-internal-stage');
                r = await openReviewUpload(page, 'on-internal-upload');
                out.internal = {links: await r.ens.count(), label: await r.ens.first().innerText().catch(() => null)};
                if (out.internal.links) out.internal.window = await pressAnonymityLink(page, r.ens, 'on-internal-upload');
                await closeDialog(page, r.dlg, 'Cancel'); await closeDialog(page, r.win, 'Cancel');
            }
            keep('uploadOn', out);
            log('[uploadOn]', JSON.stringify(out));
        }

        // ---------- uploadOff: untick, Save, the same windows without the link
        if (on('uploadOff')) {
            if (!on('setup') && !on('tab') && !on('s5') && !on('guidance') && !on('uploadOn')) await signIn(page, A.users.mgr, {contextPath: A.path});
            const form = await guidanceTab(page, app, A.path);
            const box = form.locator('input[name="showEnsuringLink"]').first();
            if (await box.isChecked()) await box.uncheck();
            const save = await saveGuidance(page, form, 'off-guidance');
            await page.goto(app.url(`/index.php/${A.path}/index`)); await idle(page);
            const form2 = await guidanceTab(page, app, A.path);
            const out = {save, boxAfterReload: await form2.locator('input[name="showEnsuringLink"]').first().isChecked(), texts: await richTexts(page)};
            await workflow(page, app, A.path, A.subs.s0);
            let u = await openSubmissionUpload(page, 'off-submission-upload');
            out.submission = {links: await u.ens.count()};
            await closeDialog(page, u.dlg, 'Cancel');
            await workflow(page, app, A.path, A.subs.s1);
            let r = await openReviewUpload(page, 'off-review-upload');
            out.review = {links: await r.ens.count()};
            await closeDialog(page, r.dlg, 'Cancel'); await closeDialog(page, r.win, 'Cancel');
            keep('uploadOff', out);
            log('[uploadOff]', JSON.stringify(out));
            await signOut(page);
        }

        // ---------- rev: the external reviewer on A (texts set) and on B (control, nothing typed)
        if (on('rev')) {
            await signIn(page, A.users.rev, {contextPath: A.path});
            const a1 = await wizardOpen(page, app, A.path, A.subs.s1, 'rev-a-external');
            const a2 = await wizardAccept(page, 'rev-a-external');
            const a3 = await wizardStep3(page, 'rev-a-external');
            await signOut(page);
            await signIn(page, B.users.rev, {contextPath: B.path});
            const b1 = await wizardOpen(page, app, B.path, B.subs.s1, 'rev-b-control');
            const b2 = await wizardAccept(page, 'rev-b-control');
            const b3 = await wizardStep3(page, 'rev-b-control');
            await signOut(page);
            keep('rev', {
                a: {step1: a1, step2: {heading: a2.heading, hasGuide: a2.text.includes(GUIDE), hasNoGuide: a2.text.includes(NO_GUIDE)}, step3: a3},
                b: {step1: b1, step2: {heading: b2.heading, hasGuide: b2.text.includes(GUIDE), hasNoGuide: b2.text.includes(NO_GUIDE)}, step3: b3},
            });
            log('[rev]', JSON.stringify(facts.rev).slice(0, 2000));
        }

        // ---------- internal {OMP}: the internal reviewer on s2 reads the internal box; the external one still the external box
        if (on('internal') && A.users.irev) {
            await signIn(page, A.users.irev, {contextPath: A.path});
            const i1 = await wizardOpen(page, app, A.path, A.subs.s2, 'rev-internal');
            const i2 = await wizardAccept(page, 'rev-internal');
            const i3 = await wizardStep3(page, 'rev-internal');
            await signOut(page);
            await signIn(page, A.users.rev, {contextPath: A.path});
            await page.goto(app.url(`/index.php/${A.path}/reviewer/submission/${A.subs.s1}?step=2`)); await idle(page);
            const e2 = await snap(page, 'rev-external-step2-again');
            await signOut(page);
            keep('internal', {
                step1: i1,
                step2: {heading: i2.heading, hasInternal: i2.text.includes(INTERNAL), hasGuide: i2.text.includes(GUIDE)},
                step3: i3,
                externalAgain: {url: page.url(), hasGuide: (e2.text.main || '').includes(GUIDE), hasInternal: (e2.text.main || '').includes(INTERNAL)},
            });
            log('[internal]', JSON.stringify(facts.internal).slice(0, 1500));
        }

        // ---------- lang: French ticked under "Forms" (Website › Setup › Languages): does each box grow a language tab
        if (on('lang')) {
            await signIn(page, A.users.mgr, {contextPath: A.path});
            await page.goto(app.url(`/index.php/${A.path}/management/settings/website`)); await idle(page);
            const setupTab = page.locator('#setup-button');   // the Website page has two "Setup" tabs (Appearance has its own)
            if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
            await page.getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
            await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
            const gridRows = () => page.locator('#languageGridContainer').evaluate((c) => [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked}))})));
            const gridBefore = await gridRows();
            await snap(page, 'lang-grid-before', {grid: gridBefore});
            const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
            if (await formsBox.count() && !(await formsBox.isChecked())) {
                const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: 10000}).catch(() => null);
                await formsBox.click();
                const resp = await w;
                await idle(page);
                await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
                log('[lang] forms box POST', resp ? `${resp.status()} ${resp.url().replace(/^https?:\/\/[^/]+/, '')}` : 'none');
            }
            const gridAfter = await gridRows();
            await snap(page, 'lang-grid-after', {grid: gridAfter});
            const form = await guidanceTab(page, app, A.path);
            const read = await readGuidance(page);
            await snap(page, 'lang-guidance', {read});
            const frBtn = form.getByRole('button', {name: 'French', exact: true}).or(form.getByRole('tab', {name: 'French', exact: true})).first();
            const out = {gridBefore, gridAfter, headings: read.fields.map((f) => f.heading), localeLabels: read.fields.map((f) => f.localeLabels), localeControls: read.localeControls, iframes: read.fields.map((f) => f.iframes), tabsInForm: await form.getByRole('tab').count(), frenchSwitch: await frBtn.count()};
            if (await frBtn.count()) {
                await loc(page, 'Reviewer Guidance › language switch "French"', frBtn);
                await frBtn.click(); await idle(page);
                await page.waitForFunction(() => { const f = [...document.querySelectorAll('#reviewerGuidance iframe')].find((i) => /reviewGuidelines/.test(i.id) && /fr_CA/.test(i.id)); return f && f.getClientRects().length > 0 && f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable; }, null, {timeout: 8000}).catch(() => {});
                const readFr = await readGuidance(page);
                await snap(page, 'lang-guidance-french', {read: readFr});
                out.afterFrench = {localeControls: readFr.localeControls, iframes: readFr.fields.map((f) => f.iframes), localeLabels: readFr.fields.map((f) => f.localeLabels)};
                const frFrame = page.locator('#reviewerGuidance iframe[id*="reviewGuidelines"][id*="fr_CA"]').first();
                if (await frFrame.count() && await frFrame.isVisible()) {
                    await setRich(page, 'reviewerGuidance-reviewGuidelines-control-fr_CA', FRENCH);
                    out.save = await saveGuidance(page, form, 'lang-guidance');
                    await signOut(page);
                    await signIn(page, A.users.rev, {contextPath: A.path});
                    await page.goto(app.url(`/index.php/${A.path}/fr_CA/reviewer/submission/${A.subs.s1}?step=2`)); await idle(page);
                    const fr2 = await snap(page, 'lang-rev-step2-fr');
                    await page.goto(app.url(`/index.php/${A.path}/en/reviewer/submission/${A.subs.s1}?step=2`)); await idle(page);
                    const en2 = await snap(page, 'lang-rev-step2-en');
                    out.reviewer = {fr: {hasFrench: (fr2.text.main || '').includes(FRENCH), hasGuide: (fr2.text.main || '').includes(GUIDE)}, en: {hasFrench: (en2.text.main || '').includes(FRENCH), hasGuide: (en2.text.main || '').includes(GUIDE)}};
                }
            }
            keep('lang', out);
            log('[lang]', JSON.stringify(out).slice(0, 2500));
            await signOut(page);
        }
    } finally {
        record("k3-facts", {browserDialogs, ...facts});
        await close();
    }
});
