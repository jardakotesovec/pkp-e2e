// U35 claim check, chunk K5: the automatic assignment and its email, the templates and automatic editors
// settings, the cross-feature pointers (all three apps).
// Spec: docs/specs/U35-stage-participants.md — Rule 12 (280–296), Side effects "On an automatic assignment"
// (342–344), Settings bullets (368–385), Cross-feature interactions (386–422), OJS1 (567–576).
//
// The automatic assignment itself happens only on the install's first context (U21 A8), which is read-only
// here, so the email of Rule 12 is driven on a scratch context through the wizard's submit with the
// editors ALREADY on the submission when it is submitted (the email goes to every editor-level stage
// assignment present at submit, whoever made it):
//   X1 draft into the section (OJS, OPS) / series (OMP, created and ticked on screen) that has "sea" ticked
//      under "Editorial Assignments": the automatic assignment and its email on a scratch context.
//   X2 draft seeded with participants: ed (manager-level editor, works on Submission), dual (editor AND
//      sectionEditor), opt (sectionEditor who ticked "Do not send me an email" on the "…has been submitted."
//      row), se2 (sectionEditor), pe (productionEditor: manager-level, no Submission stage), fc (funding
//      coordinator: assistant with the Submission stage). OPS: mg2 (manager), dual (manager AND moderator),
//      opt, se2.
//   XA a new submission from the start page by edau (editor + author; OPS manager + author) choosing the
//      editorial role in "Submit as".
// Seeded submitted: S (Submission; OPS Production) with se2, sa (sectionEditor+author), ser (recommend-only);
//   R review / C copyediting / P production (OJS, OMP; OPS P only) with se2 and ser (recommend-only).
//
//   PROBE_FEATURE=U35 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U35/K5/k5.js
//   PHASES=seed,prefs,forms,x1,x2,xa,mail,emails,gate,dash,tpl,tplstage,ojs1,pointers,logoutas (default all; state in
//   .reports/U35/ccK5/k5-state-<app>.json, so a phase re-run reuses the seed)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const ALL = ['seed', 'prefs', 'forms', 'x1', 'x2', 'xa', 'x1series', 'mail', 'emails', 'gate', 'dash', 'tpl', 'tplstage', 'ojs1', 'pointers', 'logoutas'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // sampling only, never a wait for state
const stateFile = (app) => path.join(outDir(), `k5-state-${app.name}.json`);
const REPO = path.resolve(__dirname, '../../../../..');
const FIXTURES = {
    ojs: path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf'),
    ops: path.join(REPO, 'apps/ops/playwright/fixtures/files/preprint.pdf'),
};

async function sect(name, fn) {
    try { return await fn(); } catch (e) {
        log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
        record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 1200)});
        return null;
    }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
const panelRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const h = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).find((x) => /^participants$/i.test(x.textContent.trim()));
    if (!h) return {present: false};
    let box = h.parentElement;
    for (let i = 0; i < 4 && box && !box.querySelector('ul, [role=list]'); i++) box = box.parentElement;
    const items = box ? [...box.querySelectorAll('li')].filter(vis).map((li) => li.innerText.split('\n').map((s) => s.trim()).filter(Boolean).join('/')) : [];
    const assign = box ? [...box.querySelectorAll('button')].filter(vis).some((b) => b.innerText.trim() === 'Assign') : false;
    return {present: true, items, assign};
});
const actionsRead = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const dlg = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body;
    const region = dlg.querySelector('[data-cy="workflow-action-items"]');
    const buttons = region ? [...region.querySelectorAll('button, a')].filter(vis).map((b) => b.innerText.trim()).filter(Boolean) : null;
    const hs = [...dlg.querySelectorAll('h1,h2,h3,h4')].filter(vis).map((h) => ({h: h.textContent.trim(), next: h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 300) : null}))
        .filter((x) => /Recommendation|Notification|Status|Workflow|access|Awaiting|Assign a/i.test(x.h));
    const text = dlg.innerText;
    const noAccess = /You don't currently have access to that stage of the workflow\./.test(text);
    return {actionButtons: buttons, boxes: hs.slice(0, 12), noAccess};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);

// ---- wizard -------------------------------------------------------------------------------------------
function currentStep(page) { return page.locator('.pkpSteps__step__label--current'); }
async function continueTo(page, label) {
    const button = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Continue', exact: true});
    for (let attempt = 0; ; attempt++) {
        await button.click();
        try { await currentStep(page).filter({hasText: label}).waitFor({timeout: 6000}); return; } catch (e) { if (attempt >= 2) throw e; }
    }
}
async function uploadWizardFile(page, app, marker) {
    if (app.name === 'ojs') {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', {name: 'Add File', exact: true}).click()]);
        await chooser.setFiles(FIXTURES.ojs);
        await page.getByRole('button', {name: 'Article Text', exact: true}).click();
        await page.locator('.listPanel__item--submissionFile').filter({hasText: 'article.pdf'}).getByText('Article Text').waitFor({timeout: 30000});
    } else if (app.name === 'omp') {
        await page.locator('.submissionFilesListPanel input[type="file"]').setInputFiles({name: `ms-${marker}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Manuscript ${marker}`)});
        const genreButton = page.locator('.listPanel--submissionFiles__setGenre').getByRole('button', {name: 'Book Manuscript', exact: true});
        await genreButton.waitFor({timeout: 30000});
        const saved = page.waitForResponse((r) => r.url().includes('/files/') && r.ok());
        await genreButton.click();
        await saved;
        await page.locator('.listPanel--submissionFiles__itemGenre').filter({hasText: 'Book Manuscript'}).first().waitFor({timeout: 20000});
    } else {
        const labelDialog = page.getByRole('dialog').filter({has: page.locator('#preprintGalleyForm')});
        await idle(page);
        for (let attempt = 0; ; attempt++) {
            await page.getByRole('link', {name: 'Add File', exact: true}).click();
            try { await labelDialog.first().waitFor({timeout: 5000}); break; } catch (e) { if (attempt >= 2) throw e; }
        }
        await labelDialog.locator('input[name="label"]').fill('PDF');
        await labelDialog.getByRole('button', {name: 'Save', exact: true}).click();
        const upload = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')});
        const genreSelect = upload.locator('select[name="genreId"]').first();
        await genreSelect.waitFor({timeout: 30000});
        await genreSelect.selectOption({label: 'Preprint Text'});
        await upload.locator('input[type="file"]').setInputFiles(FIXTURES.ops);
        const cont = upload.getByRole('button', {name: 'Continue', exact: true});
        await cont.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.innerText.trim() === 'Continue'); return b && !b.disabled; }, null, {timeout: 30000});
        await cont.click();
        await upload.getByRole('tab', {name: '2. Review Details'}).waitFor({timeout: 30000});
        await upload.getByRole('button', {name: 'Continue', exact: true}).click();
        await upload.getByRole('tab', {name: '3. Confirm'}).waitFor({timeout: 30000});
        await upload.getByRole('button', {name: 'Complete', exact: true}).click();
        await upload.waitFor({state: 'hidden', timeout: 30000});
        await idle(page);
        await page.locator('.submissionWizard').getByRole('link', {name: 'PDF'}).first().waitFor({timeout: 20000});
    }
}
/**
 * The wizard to its final "Submit": from the start page (opts.start: {title, role}) or a seeded draft
 * (opts.draftId). opts.series (OMP) picks a series on "For the Editors".
 */
async function walkWizard(page, app, ctx, name, opts) {
    const out = {steps: []};
    if (opts.start) {
        await page.goto(app.url(`/index.php/${ctx}/submission`));
        await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: 30000});
        await idle(page);
        const radios = await page.getByRole('radio').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})));
        const legends = await page.locator('legend').allInnerTexts().catch(() => []);
        const desc = await page.locator('.pkpFormField--options').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 500))).catch(() => []);
        out.start = {radios, legends, optionGroups: desc};
        await snap(page, `${name}-start`, {start: out.start});
        const body = page.frameLocator('iframe.tox-edit-area__iframe').first().locator('body');
        await body.click();
        await body.fill(opts.start.title);
        for (const box of [page.getByRole('checkbox', {name: /meets all of these requirements/}), page.getByRole('checkbox', {name: /agree to have my data collected/})]) {
            if (await box.count()) await box.check();
        }
        if (opts.start.role) {
            const r = radios.find((x) => x.name === 'userGroupId' && opts.start.role.test(x.label));
            out.pickedRole = r ? r.label : null;
            if (r) await page.locator(`input[type=radio][name="userGroupId"][value="${r.value}"]`).check();
        }
        const groups = {};
        for (const r of radios) { (groups[r.name] ||= []).push(r); }
        for (const [g, list] of Object.entries(groups)) {
            if (g !== 'userGroupId' && !list.some((r) => r.checked)) await page.locator(`input[type=radio][name="${g}"]`).first().check();
        }
        await snap(page, `${name}-start-filled`);
        await page.getByRole('button', {name: 'Begin Submission'}).click();
        await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 45000});
        out.submissionId = Number(new URL(page.url()).searchParams.get('id'));
    } else {
        await page.goto(app.url(`/index.php/${ctx}/submission?id=${opts.draftId}`));
        out.submissionId = opts.draftId;
    }
    await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: 30000});
    await currentStep(page).filter({hasText: 'Upload Files'}).waitFor({timeout: 30000});
    await idle(page);
    await snap(page, `${name}-files`);
    await uploadWizardFile(page, app, `${ctx}${name}`);
    await continueTo(page, 'Details');
    const abstractFrame = page.locator('iframe[id*="-abstract-"]');
    if (await abstractFrame.count()) {
        const b = page.frameLocator('iframe[id*="-abstract-"]').first().locator('body');
        const cur = (await b.innerText().catch(() => '')).trim();
        if (!cur) { await b.click(); await b.fill(`Abstract of ${name} ${ctx}.`); }
    }
    await continueTo(page, 'Contributors');
    if (app.name === 'ops') {
        await continueTo(page, 'For Readers');
        await page.getByRole('radio', {name: 'This preprint has not been published elsewhere.'}).check();
    } else {
        await continueTo(page, 'For the Editors');
        if (opts.series) {
            out.seriesOptions = await page.getByRole('radio').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})));
            await page.getByRole('radio', {name: opts.series, exact: true}).check();
            await idle(page);
        }
    }
    await snap(page, `${name}-last-step`);
    const validated = page.waitForResponse((r) => r.url().includes('/submit') && r.request().method() === 'POST' && r.status() < 500, {timeout: 45000});
    await continueTo(page, 'Review');
    await validated;
    await page.locator('.submissionWizard__loadingReview').waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
    await snap(page, `${name}-review`);
    out.reviewText = flat(await page.locator('.submissionWizard').innerText().catch(() => ''), 1500);
    const submit = page.locator('.submissionWizard__footer').getByRole('button', {name: 'Submit', exact: true});
    if (await submit.isDisabled()) throw new Error(`Submit disabled at Review: ${out.reviewText.slice(0, 600)}`);
    await submit.click();
    const d = page.getByRole('dialog').filter({hasText: /will be submitted to|Are you sure you want to (complete|submit)/});
    await d.waitFor({timeout: 30000});
    out.dialogText = flat(await d.innerText(), 400);
    await d.getByRole('button', {name: 'Submit', exact: true}).click();
    await page.getByRole('heading', {name: 'Submission complete'}).waitFor({timeout: 45000});
    out.completeAt = new Date().toISOString();
    await snap(page, `${name}-complete`);
    return out;
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const L = {
        se: isOMP ? 'Series editor' : isOPS ? 'Moderator' : 'Section editor',
        stageS: isOPS ? 'workflow_5' : 'workflow_1',
        stageName: isOPS ? 'Production' : 'Submission',
        mailable: isOPS ? 'Moderator Assigned (Auto)' : 'Editor Assigned (Auto)',
        row: isOJS ? /^A new article, / : isOMP ? /^A new monograph, / : /^A new preprint/,
    };

    // ---- seed ---------------------------------------------------------------------------------------
    if (on('seed') && !sc.ctx) {
        const t = tag('u35k5');
        const U = (k, roles, g, f, extra) => ({username: `${t}${k}`, roles, givenName: g, familyName: f, ...(extra || {})});
        const sec = isOJS ? {sections: ['ART']} : isOPS ? {sections: ['PRE']} : {};
        const users = [U('mgr', ['manager'], 'Mira', 'Manager'), U('au', ['author'], 'Ava', 'Author'),
            U('sea', ['sectionEditor'], 'Auto', 'Assigned', sec), U('opt', ['sectionEditor'], 'Otto', 'Optout'),
            U('se2', ['sectionEditor'], 'Sue', 'Second'), U('ser', ['sectionEditor'], 'Rex', 'Recommender'),
            U('sa', ['sectionEditor', 'author'], 'Sal', 'Editorauthor'), U('nw', ['sectionEditor'], 'Nell', 'Fresh')];
        if (isOPS) {
            users.push(U('mg2', ['manager'], 'Mona', 'Othermanager'), U('dual', ['manager', 'sectionEditor'], 'Dana', 'Dual'),
                U('edau', ['manager', 'author'], 'Edna', 'Submitseditor'));
        } else {
            users.push(U('ed', ['editor'], 'Eddie', 'Editor'), U('dual', ['editor', 'sectionEditor'], 'Dana', 'Dual'),
                U('pe', ['productionEditor'], 'Pat', 'Production'), U('fc', ['funding'], 'Fay', 'Funding'),
                U('edau', ['editor', 'author'], 'Edna', 'Submitseditor'));
        }
        const body = {tag: t, context: {name: `U35 K5 ${t}`, contactName: 'K5 Contact', contactEmail: `${t}contact@mail.test`}, users};
        if (isOJS) body.sections = [{abbrev: 'ART', title: 'Articles'}];
        if (isOPS) body.sections = [{abbrev: 'PRE', title: 'Preprints'}];
        const ctx = await app.api.createContext(body);
        sc.ctx = ctx.path || t; sc.t = t;
        sc.u = Object.fromEntries(users.map((x) => [x.username.slice(t.length), {username: x.username, name: `${x.givenName} ${x.familyName}`}]));
        save();
        const P = (k, role, extra) => ({username: `${t}${k}`, role, ...(extra || {})});
        const mk = async (key, title, decisionsList, participants, extra) => {
            let lastErr = null;
            for (const decisions of decisionsList) {
                try {
                    const b = {tag: `${t}${key.toLowerCase()}`, context: sc.ctx, submitter: `${t}au`, title: `${title} ${t}`, abstract: `Abstract of ${title} ${t}.`, participants, ...(extra || {})};
                    if (decisions.length) b.decisions = decisions;
                    const s = await app.api.createSubmission(b);
                    sc[key] = {id: s.submissionId, stage: s.stageId, rounds: s.reviewRounds, title: b.title};
                    save();
                    log(`[seed] ${key} #${s.submissionId} stage ${s.stageId}`);
                    return;
                } catch (e) { lastErr = e; log(`[seed ${key} try ${JSON.stringify(decisions)}]`, String(e.message).slice(0, 300)); }
            }
            sc[`${key}err`] = String(lastErr && lastErr.message).slice(0, 600); save();
        };
        await mk('X1', 'K5 auto', [[]], [], {submitted: false});
        const x2 = isOPS
            ? [P('mg2', 'manager'), P('dual', 'manager'), P('dual', 'sectionEditor'), P('opt', 'sectionEditor'), P('se2', 'sectionEditor')]
            : [P('ed', 'editor'), P('dual', 'editor'), P('dual', 'sectionEditor'), P('opt', 'sectionEditor'), P('se2', 'sectionEditor'), P('pe', 'productionEditor'), P('fc', 'funding')];
        await mk('X2', 'K5 editors present', [[]], x2, {submitted: false});
        const withSer = [P('se2', 'sectionEditor'), P('ser', 'sectionEditor', {recommendOnly: true})];
        await mk('S', 'K5 templates', [[]], [...withSer, P('sa', 'sectionEditor')]);
        if (isOPS) {
            await mk('P', 'K5 production', [[]], withSer);
        } else {
            await mk('R', 'K5 review', [['sendExternalReview']], withSer);
            await mk('C', 'K5 copyediting', [['sendExternalReview', 'accept'], ['skipExternalReview']], withSer);
            await mk('P', 'K5 production', [['skipExternalReview', 'sendToProduction']], withSer);
        }
        record('seed', sc);
    }
    if (!sc.ctx) { log('[k5] no context; run the seed phase'); return; }
    const t = sc.t;
    const u = sc.u;
    const ctxUrl = (p, ctx = sc.ctx) => app.url(`/index.php/${ctx}${p}`);
    const wfUrl = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const roundKey = (s) => (s.rounds && s.rounds[0] ? `workflow_${s.rounds[0].stageId}_${s.rounds[0].id}` : 'workflow_3');
    const mailOf = (k) => `${u[k].username}@mail.test`;

    const dialogsSeen = [];
    let dialogAnswer = 'accept';
    async function session() {
        const {page, context, close} = await launch(app);
        page.on('dialog', async (d) => {
            dialogsSeen.push({at: new Date().toISOString(), type: d.type(), message: d.message(), answer: dialogAnswer});
            if (dialogAnswer === 'accept') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
        });
        return {page, context, close};
    }
    const as = async (page, k, ctx = sc.ctx) => { await signIn(page, u[k] ? u[k].username : k, {contextPath: ctx}); await idle(page); };
    async function openWf(page, id, key, label) {
        await page.goto(wfUrl(id, key)); await idle(page);
        await wf(page).waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const panel = await panelRead(page).catch((e) => ({error: String(e.message)}));
        const actions = await actionsRead(page).catch(() => null);
        await snap(page, label, {panel, actions});
        log(`[${label}]`, JSON.stringify(panel.items || panel), '| actions', JSON.stringify(actions && actions.actionButtons), actions && actions.noAccess ? '| NO ACCESS' : '', '| boxes', JSON.stringify(actions && actions.boxes && actions.boxes.map((b) => b.h)));
        return {panel, actions};
    }
    const moreBtn = (page, k) => wf(page).getByRole('button', {name: `${u[k].name} More Actions`, exact: true});
    async function mailsTo(k, subjectPart) {
        const res = await app.mail._search({to: mailOf(k)}).catch(() => ({messages: []}));
        return (res.messages || []).filter((m) => !subjectPart || (m.Subject || '').includes(subjectPart)).map((m) => ({id: m.ID, subject: m.Subject, from: m.From && `${m.From.Name} <${m.From.Address}>`, created: m.Created}));
    }
    async function activityLog(page, label) {
        const btn = wf(page).getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = page.locator('[role="dialog"]:visible').last();
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.split('$(function')[0].trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 12)).slice(0, 1500));
        await page.goto(page.url()); await idle(page);
        return rows;
    }

    // ---- prefs: the Notifications tab's "…has been submitted." row (opt ticks "Do not send me an email") ---
    async function readRow(page) {
        const form = page.locator('form#notificationSettingsForm');
        await form.waitFor({timeout: 20000});
        return form.evaluate((f) => {
            const out = [];
            let group = null;
            for (const node of f.querySelectorAll('#notificationSettings > h4, #notificationSettings > .section')) {
                if (node.tagName === 'H4') { group = node.textContent.trim(); continue; }
                const label = node.querySelector('ul.checkbox_and_radiobutton > label');
                const boxes = [...node.querySelectorAll('input[type=checkbox]')].map((i) => ({id: i.id, checked: i.checked, label: ((f.querySelector(`label[for="${i.id}"]`) || {}).innerText || '').trim()}));
                out.push({group, row: label ? label.textContent.trim() : null, boxes});
            }
            return out;
        });
    }
    if (on('prefs')) await sect('prefs', async () => {
        const {ProfilePage} = require(path.join(REPO, 'shared/playwright/pages/ProfilePage.js'));
        const {page, close} = await session();
        try {
            // a fresh scratch Section Editor (never touched): the row and its boxes as installed
            await as(page, 'nw');
            const pp = new ProfilePage(page, sc.ctx);
            await pp.goto('notifications'); await idle(page);
            const rowsNw = await readRow(page);
            await snap(page, 'p-nw-notifications', {rows: rowsNw});
            // leave the tab with a change unsaved: tick the row's email box, press "Identity"
            const tgtNw = rowsNw.find((r) => L.row.test(r.row || ''));
            if (tgtNw) {
                await page.locator(`#${tgtNw.boxes[1].id}`).check();
                const n0 = dialogsSeen.length;
                dialogAnswer = 'dismiss';
                await pp.tabLink('identity').click();
                await sleep(1500);
                const stayed = await page.locator('form#notificationSettingsForm').isVisible().catch(() => false);
                dialogAnswer = 'accept';
                await pp.tabLink('identity').click();
                await idle(page);
                await sleep(800);
                const left = !(await page.locator('form#notificationSettingsForm').isVisible().catch(() => false));
                await pp.goto('notifications'); await idle(page);
                const back = (await readRow(page)).find((r) => L.row.test(r.row || ''));
                record('p-nw-leave', {dialogs: dialogsSeen.slice(n0), stayedOnDismiss: stayed, leftOnAccept: left, rowAfterReturn: back});
                log('[prefs leave]', JSON.stringify({dialogs: dialogsSeen.slice(n0).map((d) => d.message), stayed, left, back: back && back.boxes}));
            }
            await signOut(page);
            // opt ticks "Do not send me an email…" on the row and saves
            await as(page, 'opt');
            const pp2 = new ProfilePage(page, sc.ctx);
            await pp2.goto('notifications'); await idle(page);
            const rows = await readRow(page);
            const tgt = rows.find((r) => L.row.test(r.row || ''));
            await snap(page, 'p-opt-before', {row: tgt});
            if (tgt) {
                await page.locator(`#${tgt.boxes[1].id}`).check();
                await pp2.save();
                await sleep(800);
                await snap(page, 'p-opt-saved');
                await pp2.goto('notifications'); await idle(page);
                const after = (await readRow(page)).find((r) => L.row.test(r.row || ''));
                await snap(page, 'p-opt-after', {row: after});
                sc.optSet = after && after.boxes[1] && after.boxes[1].checked; save();
                log('[prefs opt]', JSON.stringify(tgt.boxes), '→', JSON.stringify(after && after.boxes));
            } else log('[prefs opt] row not found', JSON.stringify(rows.map((r) => r.row)));
            await signOut(page);
            // read-only control on the seeded journal: a seeded Section Editor's row as installed (no save)
            await signIn(page, 'sectioneditor.ana', {contextPath: 'publicknowledge'}); await idle(page);
            const pp3 = new ProfilePage(page, 'publicknowledge');
            await pp3.goto('notifications'); await idle(page);
            const rowsPk = await readRow(page);
            await snap(page, 'p-pk-ana-notifications', {row: rowsPk.find((r) => L.row.test(r.row || ''))});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- forms: "Editorial Assignments" on the section / series / category forms (OMP: a series made here) ---
    if (on('forms')) await sect('forms', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await page.goto(ctxUrl('/management/settings/context')); await idle(page);
            await page.getByRole('tab', {name: /^(Sections|Series)$/}).first().click(); await idle(page);
            const grid = page.locator('#sectionsGridContainer, #seriesGridContainer').first();
            await grid.waitFor({timeout: 20000});
            await snap(page, 'f-sections-grid');
            let form;
            if (isOMP) {
                if (!sc.series) {
                    await grid.getByRole('link', {name: /Add Series/}).first().click();
                    form = page.locator('form#seriesForm');
                    await form.locator('input[name^="subEditors"]').first().waitFor({state: 'attached', timeout: 20000});
                    await idle(page);
                    const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({name: e.name, value: e.value, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})));
                    const sectionText = flat(await form.innerText(), 2500);
                    await snap(page, 'f-series-add', {boxes, sectionText});
                    await form.locator('input[name="title[en]"]').fill(`K5 Series ${t}`);
                    await form.locator('input[name="path"]').fill(`k5s${t.slice(-6)}`);
                    const target = boxes.find((b) => b.label.includes(u.sea.name));
                    if (target) await form.locator(`input[name="${target.name}"][value="${target.value}"]`).check();
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    await form.waitFor({state: 'hidden', timeout: 20000}).catch(() => {});
                    await idle(page);
                    sc.series = `K5 Series ${t}`; save();
                    await snap(page, 'f-series-saved');
                }
                // re-open the series: the tick is kept
                await page.goto(ctxUrl('/management/settings/context')); await idle(page);
                await page.getByRole('tab', {name: 'Series'}).first().click(); await idle(page);
            }
            const g2 = page.locator('#sectionsGridContainer, #seriesGridContainer').first();
            await g2.waitFor({timeout: 20000});
            const rowSel = g2.locator('tr.gridRow').filter({hasText: isOMP ? `K5 Series ${t}` : isOJS ? 'Articles' : 'Preprints'}).first();
            await rowSel.locator('a.show_extras').click(); await idle(page);
            await g2.getByRole('link', {name: 'Edit', exact: true}).first().click();
            form = page.locator('form#sectionForm, form#seriesForm').first();
            await form.locator('input[name^="subEditors"]').first().waitFor({state: 'attached', timeout: 20000});
            await idle(page);
            const boxes = await form.locator('input[name^="subEditors"]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})));
            const groupText = await form.evaluate((f) => { const b = [...f.querySelectorAll('input[name^="subEditors"]')][0]; let s = b && b.closest('.section, fieldset'); for (let i = 0; i < 3 && s && !/Editorial Assignments/.test(s.innerText); i++) s = s.parentElement ? s.parentElement.closest('.section, fieldset, div') : null; return s ? s.innerText.replace(/\s+/g, ' ').slice(0, 1200) : null; });
            await snap(page, 'f-section-edit', {boxes, groupText});
            await loc(page, 'section/series form Editorial Assignments boxes', form.locator('input[name^="subEditors"]'));
            log('[forms section]', JSON.stringify(boxes), flat(groupText, 300));
            const cancel = form.getByRole('link', {name: /^\s*Cancel\s*$/}).first();
            if (await cancel.count()) await cancel.click().catch(() => {});
            await idle(page);
            // the category form's "Editorial Assignments" (Settings › Journal/Press/Server › Categories › Add Category)
            await page.goto(ctxUrl('/management/settings/context')); await idle(page);
            const catTab = page.getByRole('tab', {name: 'Categories', exact: true}).first();
            if (await catTab.count()) {
                await catTab.click(); await idle(page);
                const add = page.getByRole('button', {name: /Add Category/}).or(page.getByRole('link', {name: /Add Category/})).first();
                if (await add.count()) {
                    await add.click(); await idle(page); await sleep(1000);
                    const win = topWin(page);
                    const txt = flat(await win.innerText().catch(() => ''), 2500);
                    const catBoxes = await win.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({name: e.name, label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked}))).catch(() => []);
                    await snap(page, 'f-category-add', {text: txt, boxes: catBoxes});
                    log('[forms category]', JSON.stringify(catBoxes).slice(0, 600));
                    await win.getByRole('button', {name: /^Close/}).first().click().catch(() => {});
                    await idle(page);
                } else await snap(page, 'f-category-tab-noadd');
            } else record('f-category-tab', {absent: true});
            await signOut(page);
        } finally { await close(); }
    });

    // ---- x1: the automatic assignment on a scratch context (section/series editor ticked) ---------------
    if (on('x1')) await sect('x1', async () => {
        const {page, close} = await session();
        try {
            if (!sc.X1.submitted) {
                await as(page, 'au');
                sc.X1.walk = await walkWizard(page, app, sc.ctx, 'x1-wizard', {draftId: sc.X1.id, series: isOMP ? sc.series : null});
                sc.X1.submitted = true; save();
                await signOut(page);
            }
            await sleep(3000);
            sc.X1.mail = {sea: await mailsTo('sea'), mgr: await mailsTo('mgr')};
            save();
            record('x1-mail', sc.X1.mail);
            log('[x1 mail]', JSON.stringify(sc.X1.mail));
            await as(page, 'mgr');
            await openWf(page, sc.X1.id, L.stageS, 'x1-mgr-wf');
            await activityLog(page, 'x1-mgr-log');
            await signOut(page);
            await as(page, 'sea');
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            await snap(page, 'x1-sea-dashboard');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- x1series (OMP): the series the wizard's "For the Editors" step saved, read on "Catalog Entry" -----------
    if (on('x1series') && isOMP) await sect('x1series', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.X1.id, L.stageS, 'x1s-mgr-wf');
            await page.getByRole('treeitem', {name: 'Catalog Entry', exact: true}).click();
            await idle(page);
            await page.locator('select[name="seriesId"]').first().waitFor({state: 'attached', timeout: 30000}).catch(() => {});
            await idle(page); await sleep(1000);
            const series = await page.locator('select[name="seriesId"]').first().evaluate((el) => el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : null).catch((e) => `no select: ${e.message}`);
            await snap(page, 'x1s-catalog-entry', {series});
            log('[x1series]', series);
            await signOut(page);
        } finally { await close(); }
    });

    // ---- x2: editors present when the Author submits ------------------------------------------------------
    if (on('x2')) await sect('x2', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await snap(page, 'x2-mgr-landing');
            await signOut(page);
            if (!sc.X2.submitted) {
                await as(page, 'au');
                sc.X2.walk = await walkWizard(page, app, sc.ctx, 'x2-wizard', {draftId: sc.X2.id});
                sc.X2.submitted = true; save();
                await signOut(page);
            }
            await sleep(3000);
            const keys = isOPS ? ['mg2', 'dual', 'opt', 'se2', 'au', 'mgr'] : ['ed', 'dual', 'opt', 'se2', 'pe', 'fc', 'au', 'mgr'];
            sc.X2.mail = {};
            for (const k of keys) sc.X2.mail[k] = await mailsTo(k);
            save();
            record('x2-mail', sc.X2.mail);
            log('[x2 mail]', JSON.stringify(Object.fromEntries(Object.entries(sc.X2.mail).map(([k, v]) => [k, v.map((m) => m.subject)]))));
            await as(page, 'mgr');
            await openWf(page, sc.X2.id, L.stageS, 'x2-mgr-wf');
            await activityLog(page, 'x2-mgr-log');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- xa: "Submit as" the editorial role from the start page ---------------------------------------------
    if (on('xa')) await sect('xa', async () => {
        const {page, close} = await session();
        try {
            if (!sc.XA) {
                await as(page, 'edau');
                const w = await walkWizard(page, app, sc.ctx, 'xa-wizard', {start: {title: `K5 submit as editor ${t}`, role: /editor|manager/i}});
                sc.XA = {id: w.submissionId, walk: w, title: `K5 submit as editor ${t}`}; save();
                await signOut(page);
            }
            await sleep(3000);
            sc.XA.mail = await mailsTo('edau'); save();
            record('xa-mail', {mail: sc.XA.mail, picked: sc.XA.walk && sc.XA.walk.pickedRole, start: sc.XA.walk && sc.XA.walk.start});
            log('[xa]', JSON.stringify({picked: sc.XA.walk && sc.XA.walk.pickedRole, mail: sc.XA.mail.map((m) => m.subject)}));
            await as(page, 'mgr');
            await openWf(page, sc.XA.id, L.stageS, 'xa-mgr-wf');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- mail: the email as received (subject, sender, body, link) and its link opened by the recipient -------
    if (on('mail')) await sect('mail', async () => {
        const pick = [];
        for (const src of [sc.X2 && sc.X2.mail, sc.X1 && sc.X1.mail]) {
            if (!src) continue;
            for (const [k, list] of Object.entries(src)) for (const m of list) if (/assigned as/.test(m.subject)) pick.push({k, m});
        }
        if (sc.XA && sc.XA.mail) for (const m of sc.XA.mail) if (/assigned as/.test(m.subject)) pick.push({k: 'edau', m});
        const out = {count: pick.length, messages: []};
        for (const {k, m} of pick.slice(0, 3)) {
            const full = await app.mail.fullMessage(m.id);
            const links = [...String(full.HTML || '').matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((x) => ({href: x[1].replace(/&amp;/g, '&'), text: flat(x[2].replace(/<[^>]+>/g, ''), 120)}));
            out.messages.push({to: k, subject: full.Subject, from: full.From, replyTo: full.ReplyTo, text: flat(full.Text, 3000), links, listUnsubscribe: (full.ListUnsubscribe || {}).Header || null});
        }
        record('mail-full', out);
        log('[mail]', JSON.stringify(out.messages.map((x) => ({to: x.to, subject: x.subject, from: x.from, links: x.links}))).slice(0, 2000));
        const first = out.messages[0];
        if (first && first.links.length) {
            const {page, close} = await session();
            try {
                await as(page, first.to);
                const href = first.links[0].href.replace(/^https?:\/\/[^/]+/, '');
                await page.goto(href); await idle(page);
                await wf(page).waitFor({timeout: 20000}).catch(() => {});
                await idle(page);
                await snap(page, 'mail-link-opened', {href, panel: await panelRead(page).catch(() => null)});
                await signOut(page);
            } finally { await close(); }
        }
    });

    // ---- emails: Settings › Workflow › Emails, the "Editor Assigned (Auto)" mailable and its template ---------
    if (on('emails')) await sect('emails', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
            await page.locator('#emails-button').click().catch(() => {}); await idle(page);
            await snap(page, 'e-emails-tab');
            await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
            await page.locator('.manageEmails__listPanel .listPanel__item').first().waitFor({timeout: 30000});
            const search = page.locator('.manageEmails__listPanel input[type="search"]');
            await search.fill('Assigned'); await search.press('Enter'); await idle(page); await sleep(800);
            const titles = await page.locator('.manageEmails__listPanel .listPanel__itemTitle').allInnerTexts();
            await snap(page, 'e-manage-search', {titles});
            const row = page.locator('.manageEmails__listPanel .listPanel__item').filter({has: page.locator('.listPanel__itemTitle', {hasText: L.mailable})}).first();
            const rowText = flat(await row.innerText().catch(() => ''), 600);
            await row.getByRole('button', {name: `Edit ${L.mailable}`, exact: true}).click();
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((d) => d.getClientRects().length && /Edit|Template/.test(d.innerText)), null, {timeout: 30000}).catch(() => {});
            await idle(page); await sleep(800);
            const win = topWin(page);
            const winName = await win.evaluate((d) => d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null).catch(() => null);
            log('[emails] window name', winName);
            await win.getByRole('button', {name: 'Edit', exact: true}).first().waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            const winText = flat(await win.innerText(), 3000);
            await snap(page, 'e-mailable-window', {rowText, winText, winName});
            log('[emails mailable]', rowText, '|', winText.slice(0, 600));
            // the default template's "Edit": subject and body
            if (!(await win.locator('input[name^="subject"]').count())) await win.getByRole('button', {name: 'Edit', exact: true}).first().click();
            const form = page.getByRole('dialog', {name: /Template$/}).last();
            await form.locator('input[name^="subject"]').first().waitFor({timeout: 30000});
            await page.waitForFunction(() => (window.tinymce && window.tinymce.get() || []).some((e) => e.initialized && e.getContainer() && e.getContainer().getClientRects().length), null, {timeout: 30000}).catch(() => {});
            const tpl = {
                name: await form.locator('input[name^="name"]').first().inputValue().catch(() => null),
                subject: await form.locator('input[name^="subject"]').first().inputValue().catch(() => null),
                body: await page.evaluate(() => { const e = (window.tinymce.get() || []).find((x) => x.initialized && x.getContainer() && x.getContainer().getClientRects().length); return e ? e.getContent({format: 'text'}) : null; }).catch(() => null),
            };
            await snap(page, 'e-template-edit', {tpl});
            log('[emails template]', JSON.stringify(tpl).slice(0, 1500));
            // leave with a change unsaved: type into the subject, press the window's "Close"
            await form.locator('input[name^="subject"]').first().fill(`${tpl.subject} CHANGED`);
            const n0 = dialogsSeen.length;
            dialogAnswer = 'dismiss';
            await form.getByRole('button', {name: 'Close', exact: true}).first().click();
            await sleep(1500);
            const stillOpen = await form.isVisible().catch(() => false);
            const confirmVisible = await page.getByRole('dialog').filter({hasText: /unsaved|discard|changes/i}).count();
            await snap(page, 'e-template-leave', {stillOpen, confirmVisible, browserDialogs: dialogsSeen.slice(n0)});
            dialogAnswer = 'accept';
            if (stillOpen) { await form.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(1000); }
            // the subject after the leave: re-open the default template
            await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
            await search.fill(L.mailable); await search.press('Enter'); await idle(page); await sleep(800);
            await page.locator('.manageEmails__listPanel .listPanel__item').filter({has: page.locator('.listPanel__itemTitle', {hasText: L.mailable})}).first().getByRole('button', {name: `Edit ${L.mailable}`, exact: true}).click();
            await sleep(1500); await idle(page);
            if (!(await topWin(page).locator('input[name^="subject"]').count())) await topWin(page).getByRole('button', {name: 'Edit', exact: true}).first().click();
            const form2 = page.getByRole('dialog', {name: /Template$/}).last();
            await form2.locator('input[name^="subject"]').first().waitFor({timeout: 30000});
            const subjAfter = await form2.locator('input[name^="subject"]').first().inputValue().catch(() => null);
            record('e-template-after-leave', {subjAfter, browserDialogs: dialogsSeen.slice(n0)});
            log('[emails leave]', JSON.stringify({stillOpen, confirmVisible, dialogs: dialogsSeen.slice(n0).map((d) => d.message), subjAfter}));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- gate: who reaches Settings › Workflow › Emails (typed address), one account per level ---------------
    if (on('gate')) await sect('gate', async () => {
        const {page, close} = await session();
        try {
            const who = isOPS ? ['mg2', 'se2', 'au'] : ['ed', 'pe', 'se2', 'fc', 'au'];
            const out = {};
            for (const k of who) {
                await as(page, k);
                await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
                await sleep(800);
                const s = await snap(page, `g-${k}-manageEmails`);
                const items = await page.locator('.manageEmails__listPanel .listPanel__item').count();
                out[k] = {url: page.url(), items, head: flat((s.text && s.text.main) || '', 200)};
                await signOut(page);
            }
            record('g-summary', out);
            log('[gate]', JSON.stringify(out));
        } finally { await close(); }
    });

    // ---- dash: "Needs editor" and its "Assign Editor" (X1 arrived with no editor) --------------------------------
    if (on('dash')) await sect('dash', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
            const link = page.locator('a[href*="dashboard/editorial"]').filter({has: page.getByText('Needs editor', {exact: true})}).first();
            const has = await link.count();
            const linkText = has ? flat(await link.innerText(), 80) : null;
            if (has) { await link.click(); await idle(page); }
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const s = await snap(page, 'd-mgr-needs-before', {viewLink: has, linkText});
            const row = page.getByRole('row').filter({hasText: sc.X1.title}).first();
            const rowText = (await row.count()) ? flat(await row.innerText(), 300) : null;
            const btn = row.getByRole('button', {name: /Assign Editor/});
            const mainB = (s.text && s.text.main) || '';
            const out = {viewLink: has, linkText, listed: mainB.includes(sc.X1.title), x2Listed: mainB.includes(sc.X2.title), xaListed: sc.XA ? mainB.includes(sc.XA.title) : null, rowText, assignEditor: await btn.count()};
            if (out.assignEditor) {
                await btn.first().click();
                const win = page.getByRole('dialog').filter({has: page.locator('select[name="filterUserGroupId"]')}).last();
                await win.locator('select[name="filterUserGroupId"]').waitFor({timeout: 30000});
                await idle(page);
                const roles = await win.locator('select[name="filterUserGroupId"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
                out.window = {title: flat(await win.locator('h1,h2').first().innerText().catch(() => ''), 80), roles, text: flat(await win.innerText(), 800)};
                await snap(page, 'd-assign-editor-window', {window: out.window});
                await win.locator('select[name="filterUserGroupId"]').selectOption({label: L.se});
                await idle(page);
                await win.getByRole('textbox', {name: 'Search User By Name'}).fill(u.sea.username);
                await win.getByRole('button', {name: 'Search', exact: true}).click();
                await idle(page);
                await win.getByRole('row').filter({hasText: u.sea.name}).locator('input[name="userId"]').check();
                await idle(page);
                const resp = page.waitForResponse((r) => /saveParticipant|save-participant/i.test(r.url()), {timeout: 20000}).catch(() => null);
                await win.getByRole('button', {name: 'OK', exact: true}).click();
                const r = await resp;
                out.saveStatus = r ? r.status() : null;
                await win.waitFor({state: 'detached', timeout: 15000}).catch(() => {});
                await idle(page); await sleep(1000);
                await snap(page, 'd-after-assign');
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                const link2 = page.locator('a[href*="dashboard/editorial"]').filter({has: page.getByText('Needs editor', {exact: true})}).first();
                out.linkTextAfter = (await link2.count()) ? flat(await link2.innerText(), 80) : null;
                if (await link2.count()) { await link2.click(); await idle(page); }
                await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                const s2 = await snap(page, 'd-mgr-needs-after');
                out.listedAfter = ((s2.text && s2.text.main) || '').includes(sc.X1.title);
                await sleep(2000);
                out.seaMailAfter = await mailsTo('sea');
            } else {
                // OPS (no "Needs editor"): the row on the default view
                await page.goto(ctxUrl('/dashboard/editorial')); await idle(page);
                const r2 = page.getByRole('row').filter({hasText: sc.X1.title}).first();
                out.defaultViewRow = (await r2.count()) ? flat(await r2.innerText(), 300) : null;
                out.defaultViewButtons = (await r2.count()) ? await r2.getByRole('button').allInnerTexts() : null;
                await snap(page, 'd-mgr-default-view', {row: out.defaultViewRow});
            }
            record('d-summary', out);
            log('[dash]', JSON.stringify(out).slice(0, 1500));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- tpl: Settings › Workflow › "Tasks and Discussions": a template limited to the Author role ------------
    async function addTemplate(page, label, {stage, name, body, restrictTo}) {
        await page.goto(ctxUrl('/management/settings/workflow')); await idle(page);
        const tab = page.getByRole('tab', {name: /Tasks and Discussions/}).first();
        await tab.click(); await idle(page);
        await page.waitForFunction((s) => document.body.innerText.includes(s), stage, {timeout: 15000}).catch(() => {});
        const tabRead = await snap(page, `${label}-tab`);
        if (((tabRead.text && tabRead.text.main) || '').includes(name)) return {exists: true};
        await page.getByRole('row', {name: new RegExp(`^${stage} Stage`)}).getByRole('button', {name: 'Add template'}).click();
        const win = topWin(page);
        await win.getByRole('textbox', {name: /^Name/}).first().waitFor({timeout: 20000});
        await idle(page); await sleep(500);
        await win.getByRole('textbox', {name: /^Name/}).first().fill(name);
        const roleBoxes = [];
        if (restrictTo) {
            await win.getByRole('radio', {name: 'Limit access to specific roles'}).check();
            await sleep(300);
            roleBoxes.push(...await win.locator('input[type=checkbox]:visible').evaluateAll((els) => els.map((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim())));
            await win.getByRole('checkbox', {name: restrictTo, exact: true}).check();
        }
        const fr = win.frameLocator('iframe').first();
        await fr.locator('body').click();
        await page.keyboard.type(body);
        await sleep(300);
        await snap(page, `${label}-form`, {roleBoxes});
        const resp = page.waitForResponse((r) => /editTaskTemplates/.test(r.url()) && r.request().method() === 'POST', {timeout: 20000}).catch(() => null);
        await win.getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        await sleep(1000); await idle(page);
        const out = {status: r && r.status(), stillOpen: await win.isVisible().catch(() => false), roleBoxes};
        await snap(page, `${label}-saved`, {out});
        log(`[${label} template]`, JSON.stringify(out));
        return out;
    }
    const notifyWin = (page) => page.getByRole('dialog').filter({has: page.locator('form select[name="template"]')}).filter({hasNotText: 'Locate a User'}).last();
    async function notifyList(page, k, label) {
        await moreBtn(page, k).first().click();
        await page.locator('[role="menuitem"]').first().waitFor({timeout: 10000}).catch(() => {});
        const items = await menuItems(page);
        const it = page.getByRole('menuitem', {name: 'Notify', exact: true});
        if (!(await it.count())) { await moreBtn(page, k).first().click().catch(() => {}); record(label, {menu: items, notify: false}); return {menu: items, notify: false}; }
        await it.click();
        const win = notifyWin(page);
        await win.waitFor({timeout: 30000});
        await win.locator('textarea[name="message"]').waitFor({state: 'attached', timeout: 20000}).catch(() => {});
        await idle(page);
        const options = await win.locator('select[name="template"] option').evaluateAll((els) => els.map((o) => o.text.trim()));
        await snap(page, label, {menu: items, options});
        return {menu: items, options, win};
    }
    async function notifySend(page, k, label, tplName) {
        const r0 = await notifyList(page, k, `${label}-open`);
        if (!r0.win) return r0;
        const win = r0.win;
        const val = await win.locator('select[name="template"] option').evaluateAll((els, n) => (els.find((o) => o.text.trim() === n) || {}).value, tplName);
        await win.locator('select[name="template"]').selectOption(val);
        await idle(page); await sleep(1500);
        const msgId = await win.locator('textarea[name="message"]').getAttribute('id').catch(() => null);
        const readMsg = () => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : null), msgId).catch(() => null);
        const messageAfterTemplate = await readMsg();
        let typed = null;
        if (!messageAfterTemplate || !messageAfterTemplate.trim()) {
            const body = page.frameLocator(`#${msgId}_ifr`).locator('body');
            await body.click(); await page.keyboard.type(`K5 typed ${label} ${t}`); await sleep(300);
            typed = await readMsg();
        }
        await snap(page, `${label}-filled`, {messageAfterTemplate, typed});
        const resp = page.waitForResponse((r) => /sendNotification|send-notification/i.test(r.url()), {timeout: 15000}).catch(() => null);
        await win.locator('form').getByRole('button', {name: 'Notify', exact: true}).click();
        const r = await resp;
        const answer = r ? flat(await r.text().catch(() => ''), 300) : null;
        await win.waitFor({state: 'detached', timeout: 10000}).catch(() => {});
        await idle(page); await sleep(1500);
        const out = {options: r0.options, status: r && r.status(), answer, messageAfterTemplate, typed, stillOpen: await win.isVisible().catch(() => false)};
        await page.goto(page.url()); await idle(page);
        await snap(page, `${label}-after`, {out});
        return out;
    }
    if (on('tpl')) await sect('tpl', async () => {
        const {page, close} = await session();
        try {
            const name = `K5 AuthorsOnly ${t}`;
            await as(page, 'mgr');
            sc.tplAdd = await addTemplate(page, 't-add', {stage: L.stageName, name, body: `K5 authors-only body ${t}`, restrictTo: 'Author'});
            save();
            const lists = {};
            const readers0 = isOPS ? ['mgr', 'mg2', 'se2', 'sa'] : ['mgr', 'ed', 'pe', 'se2', 'sa'];
            const readers = process.env.K5_TPL_SENDONLY ? [] : readers0;
            if (!readers.length) await signOut(page).catch(() => {});
            for (const k of readers) {
                if (k !== 'mgr') { await signOut(page); await as(page, k); }
                await openWf(page, sc.S.id, L.stageS, `t-${k}-S`);
                const r = await notifyList(page, 'au', `t-${k}-notify-au`);
                lists[k] = r.options || r;
                if (r.win) { await r.win.getByRole('button', {name: /^Close/}).first().click().catch(() => {}); await page.goto(page.url()); await idle(page); }
            }
            record('t-lists', lists);
            log('[tpl lists]', JSON.stringify(lists));
            await signOut(page);
            // sending: the limited template to a Section Editor (no Author role) and to the Author (holds it)
            await as(page, 'mgr');
            await openWf(page, sc.S.id, L.stageS, 't-mgr-S-send');
            const toSe = await notifySend(page, 'se2', 't-mgr-se2-send', name);
            const toAu = await notifySend(page, 'au', 't-mgr-au-send', name);
            const toSa = await notifySend(page, 'sa', 't-mgr-sa-send', name);
            const toAuD = await notifySend(page, 'au', 't-mgr-au-send-default', isOPS ? 'Discussion (Production)' : 'Discussion (Submission)');
            await sleep(2500);
            const mail = {se2: await mailsTo('se2', name), au: await mailsTo('au', name), sa: await mailsTo('sa', name), auDefault: await mailsTo('au', 'Discussion')};
            await openWf(page, sc.S.id, L.stageS, 't-mgr-S-after');
            const disc = await page.evaluate(() => { const vis = (e) => e.getClientRects().length > 0; const d = [...document.querySelectorAll('[role=dialog]')].filter(vis)[0] || document.body; return [...d.querySelectorAll('tbody tr')].filter(vis).map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12); }).catch(() => null);
            record('t-send', {toSe, toAu, toSa, toAuD, mail, disc});
            log('[tpl send]', JSON.stringify({toSe, toAu, toSa, toAuD, mail: Object.fromEntries(Object.entries(mail).map(([k, v]) => [k, v.map((m) => m.subject)])), disc}).slice(0, 3000));
            if (mail.au[0]) {
                const full = await app.mail.fullMessage(mail.au[0].id);
                record('t-au-mail-full', {subject: full.Subject, from: full.From, text: flat(full.Text, 1500), listUnsubscribe: (full.ListUnsubscribe || {}).Header || null});
            }
            await signOut(page);
        } finally { await close(); }
    });

    // ---- logoutas: Login As a Section Editor from the panel; the panel's own "Logout as …" entry while worn --------
    if (on('logoutas')) await sect('logoutas', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.S.id, L.stageS, 'l-mgr-S');
            await moreBtn(page, 'se2').first().click();
            await page.getByRole('menuitem', {name: 'Login As', exact: true}).click();
            const confirm = page.getByRole('dialog').filter({hasText: 'Log in as this user?'}).last();
            await confirm.waitFor({timeout: 15000});
            await confirm.getByRole('button', {name: 'OK', exact: true}).click();
            await page.waitForLoadState('load').catch(() => {});
            await idle(page); await sleep(1000);
            await snap(page, 'l-worn-landed');
            const r = await openWf(page, sc.S.id, L.stageS, 'l-worn-se2-S');
            const entry = wf(page).getByRole('link', {name: /^Logout as/}).or(wf(page).getByRole('button', {name: /^Logout as/})).first();
            const out = {panel: r.panel, entry: (await entry.count()) ? flat(await entry.innerText(), 120) : null};
            if (await entry.count()) {
                await loc(page, 'Participants panel "Logout as" entry (while impersonating)', entry);
                await entry.click();
                await page.waitForLoadState('load').catch(() => {});
                await idle(page); await sleep(1000);
                const s2 = await snap(page, 'l-after-panel-logoutas');
                out.after = {url: page.url(), header: flat((s2.text && s2.text.header) || '', 200)};
            }
            record('l-summary', out);
            log('[logoutas]', JSON.stringify(out));
            await signOut(page).catch(() => {});
        } finally { await close(); }
    });

    // ---- tplstage: the Submission-stage template is not offered on another stage (OJS, OMP: the review round) ----
    if (on('tplstage') && !isOPS) await sect('tplstage', async () => {
        const {page, close} = await session();
        try {
            await as(page, 'mgr');
            await openWf(page, sc.R.id, roundKey(sc.R), 't-mgr-R');
            const r = await notifyList(page, 'au', 't-mgr-R-notify-au');
            record('t-stage-control', {options: r.options || r});
            log('[tplstage]', JSON.stringify(r.options || r));
            await signOut(page);
        } finally { await close(); }
    });

    // ---- ojs1: the Submission stage's forward button as named in the email ------------------------------------
    if (on('ojs1')) await sect('ojs1', async () => {
        const {page, close} = await session();
        try {
            await as(page, isOPS ? 'mg2' : 'ed');
            await openWf(page, sc.X2.id, L.stageS, 'o-ed-X2-submission');
            await signOut(page);
            await as(page, 'se2');
            await openWf(page, sc.X2.id, L.stageS, 'o-se2-X2-submission');
            await signOut(page);
        } finally { await close(); }
    });

    // ---- pointers: the cross-feature interactions, one light drive each ----------------------------------------
    if (on('pointers')) await sect('pointers', async () => {
        const {page, close} = await session();
        try {
            const out = {};
            // author's view: no Participants panel
            await as(page, 'au');
            await page.goto(ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${sc.S.id}`)); await idle(page);
            await wf(page).waitFor({timeout: 30000}).catch(() => {});
            await idle(page);
            out.authorPanel = await panelRead(page).catch(() => null);
            await snap(page, 'x-au-S', {panel: out.authorPanel});
            await signOut(page);
            // the recommending editor on each stage
            await as(page, 'ser');
            const stages = isOPS ? [['P', 'workflow_5']] : [['S', 'workflow_1'], ['R', roundKey(sc.R || {})], ['C', 'workflow_4'], ['P', 'workflow_5']];
            out.ser = {};
            for (const [k, key] of stages) { if (sc[k]) out.ser[k] = await openWf(page, sc[k].id, key, `x-ser-${k}`); }
            await signOut(page);
            await as(page, 'se2');
            out.se2 = {};
            for (const [k, key] of stages) { if (sc[k]) out.se2[k] = await openWf(page, sc[k].id, key, `x-se2-${k}`); }
            await signOut(page);
            // the notice boxes at Copyediting / Production with nobody assigned there; a stage not yet reached
            await as(page, 'mgr');
            if (sc.C) out.C = await openWf(page, sc.C.id, 'workflow_4', 'x-mgr-C');
            out.P = await openWf(page, sc.P.id, 'workflow_5', 'x-mgr-P');
            if (!isOPS) out.notReached = await openWf(page, sc.S.id, 'workflow_4', 'x-mgr-S-copyediting-unreached');
            // "Login As" on the Author's row, then "Logout as …"
            await openWf(page, sc.S.id, L.stageS, 'x-mgr-S');
            await moreBtn(page, 'au').first().click();
            await page.locator('[role="menuitem"]').first().waitFor({timeout: 10000}).catch(() => {});
            out.auMenu = await menuItems(page);
            const la = page.getByRole('menuitem', {name: 'Login As', exact: true});
            if (await la.count()) {
                const n0 = dialogsSeen.length;
                await la.click();
                await sleep(1500);
                const confirm = page.getByRole('dialog').filter({hasText: /Login As|log in as|sign in as/i}).last();
                out.loginAsConfirm = (await confirm.count()) ? flat(await confirm.innerText(), 400) : null;
                await snap(page, 'x-loginas-confirm', {confirm: out.loginAsConfirm, browserDialogs: dialogsSeen.slice(n0)});
                const ok = confirm.getByRole('button', {name: /^(OK|Yes|Login As)$/}).first();
                if (await ok.count()) await ok.click();
                await page.waitForLoadState('load').catch(() => {});
                await idle(page); await sleep(1500);
                const s = await snap(page, 'x-loginas-landed');
                out.loginAsLanded = {url: page.url(), header: flat((s.text && s.text.header) || '', 300)};
                const nav = page.locator('[data-cy="app-user-nav"]');
                if (await nav.count()) {
                    await nav.getByRole('button').first().click().catch(() => {});
                    await sleep(500);
                    out.userMenu = flat(await nav.innerText().catch(() => ''), 400);
                    await snap(page, 'x-loginas-usermenu', {menu: out.userMenu});
                    const lo = page.getByRole('link', {name: /Logout as/}).or(page.getByRole('button', {name: /Logout as/})).first();
                    out.logoutAs = (await lo.count()) ? flat(await lo.innerText(), 120) : null;
                    if (await lo.count()) { await lo.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page); const s2 = await snap(page, 'x-logoutas-landed'); out.afterLogoutAs = {url: page.url(), header: flat((s2.text && s2.text.header) || '', 200)}; }
                }
            }
            record('x-loginas', {auMenu: out.auMenu, confirm: out.loginAsConfirm, landed: out.loginAsLanded, userMenu: out.userMenu, logoutAs: out.logoutAs, after: out.afterLogoutAs});
            log('[pointers loginas]', JSON.stringify({auMenu: out.auMenu, confirm: out.loginAsConfirm, landed: out.loginAsLanded, logoutAs: out.logoutAs, after: out.afterLogoutAs}));
            await signOut(page).catch(() => {});
            // the Notifications tab's rows (the "Discussion added." and "needs an editor" rows)
            await as(page, 'mgr');
            await page.goto(ctxUrl('/user/profile/notificationSettings')); await idle(page);
            await page.locator('form#notificationSettingsForm').waitFor({timeout: 20000}).catch(() => {});
            const rows = await readRow(page).catch(() => []);
            await snap(page, 'x-mgr-notifications', {rows: rows.map((r) => `${r.group} | ${r.row}`)});
            log('[pointers notif rows]', JSON.stringify(rows.map((r) => r.row)));
            // the Roles grid: the Section Editor role's stage boxes and options
            await page.goto(ctxUrl('/management/settings/access')); await idle(page);
            await page.getByRole('tab', {name: 'Roles'}).click(); await idle(page);
            await page.locator('tr.gridRow').first().waitFor({timeout: 20000}).catch(() => {});
            await snap(page, 'x-mgr-roles-grid');
            await signOut(page);
            record('x-summary', {authorPanel: out.authorPanel, ser: Object.fromEntries(Object.entries(out.ser).map(([k, v]) => [k, v.actions])), se2: Object.fromEntries(Object.entries(out.se2).map(([k, v]) => [k, v.actions])), C: out.C && out.C.actions, P: out.P && out.P.actions, notReached: out.notReached && out.notReached.panel});
        } finally { await close(); }
    });
    save();
});
