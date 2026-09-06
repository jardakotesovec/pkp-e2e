// U29 claim check, chunk K8 (step 9 span check behind test finding T-ojs-1):
// the ORDER of the "Reviewer Recommendations" table (Settings › Workflow ›
// "Review" › side tab "Reviewer Recommendations", OJS) and of the reviewer's
// step 3 "Recommendation" list after entries are added, edited and toggled.
// Spec: docs/specs/U29-review-setup-and-review-forms.md — Rule 17 lines 375
// ("the new entry lands at the bottom") and 380–382 ("The table's order is the
// order of last change: an edited or toggled entry drops to the bottom, and
// the reviewer's list follows that order"); scenario 9 line 579 ("drops to
// the bottom, unticked").
//
// Seeds two scratch journals (each: manager, author, one external reviewer
// accepted on one submission) and drives a different add/edit/toggle sequence
// on each. After every change the table is read three times: at once (the
// redraw), after a reload (the settings page opened afresh and the tab chain
// walked again) and, for most steps, as the reviewer on step 3. Every screen
// is recorded with screen().
//
//   PROBE_FEATURE=U29 PROBE_AGENT=ccK8 node bin/probe.js ojs shared/playwright/checks/U29/K8/k8.js
//   PHASES=seed,j1,j2   (default: all; j1/j2 reuse k8-scratch-ojs.json)
//
// Facts land in k8-facts-<phases>-ojs.json: per step the three orders and the
// API calls the browser made, plus a per-journal summary of where each changed
// row went (bottom / stayed / elsewhere).

const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'j1', 'j2'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const scratchFile = (app) => path.join(outDir(), `k8-scratch-${app.name}.json`);
const texts = async (l) => (await l.allInnerTexts()).map((s) => s.trim()).filter(Boolean);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DEFAULTS = ['Accept Submission', 'Revisions Required', 'Resubmit for Review', 'Resubmit Elsewhere', 'Decline Submission', 'See Comments'];

// The two sequences. `rev: true` reads the reviewer's step 3 after the step.
const SEQUENCES = {
    j1: [ // scenario 9's order first, then more of the same
        {kind: 'add', title: 'Accept with minor changes', type: 'Approved', rev: true},
        {kind: 'toggle', title: 'See Comments', rev: true},                       // deactivate (the scenario's step)
        {kind: 'edit', title: 'Revisions Required', newTitle: 'Revisions Required (edited)', rev: true},
        {kind: 'toggle', title: 'See Comments', rev: true},                       // reactivate
        {kind: 'toggle', title: 'See Comments'},                                  // deactivate again
        {kind: 'toggle', title: 'Accept Submission', rev: true},                  // deactivate a default that was never touched
        {kind: 'add', title: 'Park it', type: 'With Comments', status: 'Deactivate', rev: true},
    ],
    j2: [ // toggle before any add, then edits and a double toggle
        {kind: 'toggle', title: 'See Comments', rev: true},                       // deactivate first
        {kind: 'add', title: 'Accept with minor changes', type: 'Approved', rev: true},
        {kind: 'toggle', title: 'Decline Submission'},                            // deactivate
        {kind: 'toggle', title: 'Decline Submission', rev: true},                 // reactivate at once
        {kind: 'edit', title: 'Accept with minor changes', newTitle: 'Accept with minor changes (edited)', rev: true},
        {kind: 'add', title: 'Park it', type: 'With Comments', status: 'Deactivate'},
        {kind: 'toggle', title: 'See Comments', rev: true},                       // reactivate the first-toggled row
        {kind: 'edit', title: 'Accept Submission', newTitle: 'Accept Submission (edited)', rev: true},
    ],
};

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the tab is journal-only (K6/K7)
    const facts = {app: app.name, browserDialogs: [], journals: {}};
    const scratch = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : {};
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(scratch, null, 2));
    const {page, close} = await launch(app);
    page.on('dialog', async (d) => { facts.browserDialogs.push({type: d.type(), message: d.message()}); await d.accept().catch(() => {}); });
    let apiBucket = null;
    page.on('response', (r) => { if (apiBucket && /\/api\/v1\//.test(r.url())) apiBucket.push({m: r.request().method(), u: r.url().replace(/^.*\/api\/v1\//, ''), s: r.status()}); });
    const full = async (name) => { let d; try { d = await screen(page); } catch (e) { d = {url: page.url(), error: String(e.message)}; } record(`${name}-${app.name}`, d); await shot(page, `${name}-${app.name}`).catch(() => {}); return d; };
    const dlg = () => page.locator('[role="dialog"]:visible').last();
    const waitModal = () => page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const noModal = () => page.waitForFunction(() => ![...document.querySelectorAll('[role="dialog"]')].some((e) => e.offsetParent !== null), null, {timeout: 8000}).catch(() => {});
    const modalInfo = async () => {
        const d = dlg();
        if (!(await d.isVisible().catch(() => false))) return null;
        return {title: await texts(d.locator('h1, h2, h3, [class*="title"]').first()).catch(() => []), text: (await d.innerText()).trim().slice(0, 600), buttons: await texts(d.locator('button:visible'))};
    };

    // ---- the manager's table (locators from K6 / screen-notes)
    const mgrRoot = () => page.locator('[data-cy="reviewer-recommendation-manager"]');
    const openTab = async (ctxPath) => {
        await page.goto(app.url(`/index.php/${ctxPath}/management/settings/workflow`)); await idle(page);
        await page.getByRole('tab', {name: 'Review', exact: true}).click(); await idle(page);
        await page.getByRole('tab', {name: 'Reviewer Recommendations', exact: true}).click(); await idle(page);
        await mgrRoot().locator('tbody tr').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
    };
    const tableRows = async () => mgrRoot().evaluate((root) => [...root.querySelectorAll('tbody tr')].map((tr) => ({
        title: (tr.querySelector('th, td') || {}).innerText?.trim(),
        checked: tr.querySelector('input[type=checkbox]')?.checked ?? null,
    })));
    const brief = (rows) => rows.map((r) => `${r.title}${r.checked ? ' ✓' : ' ☐'}`);
    const rowByTitle = (title) => mgrRoot().locator('tbody tr').filter({has: page.locator('th, td').filter({hasText: new RegExp(`^${esc(title)}$`)})}).first();
    const waitRow = (title, checked) => page.waitForFunction(({title, checked}) => [...document.querySelectorAll('[data-cy="reviewer-recommendation-manager"] tbody tr')].some((tr) => (tr.querySelector('th, td') || {}).innerText?.trim() === title && (checked === null || tr.querySelector('input[type=checkbox]')?.checked === checked)), {title, checked}, {timeout: 15000}).then(() => true).catch(() => false);
    const fillForm = async ({title, type, status}) => {
        const d = dlg();
        if (title !== undefined) { const i = d.locator('input[name="title-en"]').first(); await i.fill(''); await i.fill(title); }
        if (type) await d.locator('select[name="type"]').first().selectOption({label: type});
        if (status) await d.locator('select[name="status"]').first().selectOption({label: status});
    };
    const saveForm = async () => {
        await dlg().getByRole('button', {name: 'Save', exact: true}).last().click();
        await page.waitForResponse((r) => /\/api\/v1\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 8000}).catch(() => {});
        await idle(page); await noModal(); await idle(page);
    };
    const openMenu = async (title) => {
        const btn = rowByTitle(title).getByRole('button', {name: 'More Actions'});
        for (let i = 0; i < 2; i++) {
            if (await page.locator('[role="menuitem"]:visible').count()) break;
            await btn.click();
            const opened = await page.waitForFunction(() => document.querySelector('[role="menuitem"]'), null, {timeout: 4000}).then(() => true).catch(() => false);
            if (opened) break;
        }
        return texts(page.locator('[role="menuitem"]:visible'));
    };

    // ---- the reviewer's wizard (tojs: a seeded accepted assignment opens on step 1; walk to 3)
    const gotoStep3 = async (ctxPath, subId) => {
        await page.goto(app.url(`/index.php/${ctxPath}/reviewer/submission/${subId}?step=3`)); await idle(page);
        await page.waitForFunction(() => !/Loading/.test(document.querySelector('main')?.innerText || ''), null, {timeout: 20000}).catch(() => {});
        const onStep = async () => (await page.locator('[role=tab][aria-selected=true]').first().innerText().catch(() => '')).trim();
        if (!(await onStep()).startsWith('3')) {
            const sc = page.getByRole('button', {name: 'Save and continue'});
            if (await sc.count()) { await sc.first().click(); await idle(page); }
            const c3 = page.getByRole('button', {name: /Continue to Step #3/});
            if (await c3.count()) { await c3.first().click(); await idle(page); }
            await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith('3'), null, {timeout: 30000}).catch(() => {});
        }
        return onStep();
    };
    const recList = async () => {
        const rec = page.locator('main').locator('select[name="reviewerRecommendationId"]').first();
        if (!(await rec.count())) return {present: false};
        return {present: true, ...(await rec.evaluate((s) => ({options: [...s.options].map((o) => o.text.trim()), selected: s.options[s.selectedIndex]?.text.trim()})))};
    };

    // ---- one journal's sequence
    const runJournal = async (key) => {
        const J = scratch[key];
        const out = facts.journals[key] = {tag: J.tag, path: J.path, users: J.users, sub: J.sub, steps: []};
        await signIn(page, J.users.mgr, {contextPath: J.path}); await idle(page);
        await openTab(J.path);
        await full(`${key}-installed`);
        out.installed = await tableRows();
        log(`[${key}] installed: ${JSON.stringify(brief(out.installed))}`);
        let prevReload = out.installed;
        const seq = SEQUENCES[key];
        for (let i = 0; i < seq.length; i++) {
            const op = seq[i];
            const n = `${key}-s${i + 1}`;
            const step = {n: i + 1, op, api: [], before: prevReload.map((r) => r.title)};
            out.steps.push(step);
            apiBucket = step.api;
            const bottomTitle = op.kind === 'edit' ? op.newTitle : op.title;
            if (op.kind === 'add') {
                await mgrRoot().getByRole('button', {name: 'Add Recommendation'}).click(); await waitModal(); await idle(page);
                await fillForm({title: op.title, type: op.type, status: op.status});
                await full(`${n}-add-window`);
                await saveForm();
                step.redrawn = await waitRow(op.title, null);
            } else if (op.kind === 'edit') {
                step.menu = await openMenu(op.title);
                await page.getByRole('menuitem', {name: 'Edit', exact: true}).click(); await waitModal(); await idle(page);
                await fillForm({title: op.newTitle});
                await full(`${n}-edit-window`);
                await saveForm();
                step.redrawn = await waitRow(op.newTitle, null);
            } else { // toggle
                const row = rowByTitle(op.title);
                const before = await row.locator('input[type=checkbox]').isChecked();
                step.checkedBefore = before;
                await row.locator('input[type=checkbox]').click();
                await waitModal();
                step.dialog = await modalInfo();
                await full(`${n}-dialog`);
                await dlg().getByRole('button', {name: 'Yes', exact: true}).last().click();
                await idle(page);
                step.redrawn = await waitRow(op.title, !before);
            }
            await idle(page);
            await full(`${n}-at-once`);
            step.atOnce = await tableRows();
            apiBucket = null;
            // reload: the settings page opened afresh, the tab chain walked again
            await openTab(J.path);
            await full(`${n}-reloaded`);
            step.reloaded = await tableRows();
            const pos = (rows) => { const i = rows.findIndex((r) => r.title === bottomTitle); return i < 0 ? 'missing' : i === rows.length - 1 ? 'bottom' : `${i + 1}/${rows.length}`; };
            step.where = {atOnce: pos(step.atOnce), reloaded: pos(step.reloaded), sameAsAtOnce: JSON.stringify(step.atOnce) === JSON.stringify(step.reloaded)};
            log(`[${n}] ${op.kind} "${bottomTitle}" → at once ${JSON.stringify(brief(step.atOnce))} [${step.where.atOnce}]; reloaded [${step.where.reloaded}]${step.where.sameAsAtOnce ? '' : ' DIFFERS: ' + JSON.stringify(brief(step.reloaded))}; api ${step.api.map((a) => `${a.m} ${a.u} ${a.s}`).join(', ')}`);
            prevReload = step.reloaded;
            // the reviewer's step 3
            if (op.rev) {
                await signIn(page, J.users.rev, {contextPath: J.path}); await idle(page);
                step.revStep = await gotoStep3(J.path, J.sub);
                await full(`${n}-reviewer-step3`);
                step.reviewer = await recList();
                const active = step.reloaded.filter((r) => r.checked).map((r) => r.title);
                const list = (step.reviewer.options || []).filter((t) => t !== 'Choose One');
                step.reviewerFollowsTable = JSON.stringify(list) === JSON.stringify(active);
                log(`[${n}] reviewer step ${step.revStep}: ${JSON.stringify(list)} follows table's active order: ${step.reviewerFollowsTable}`);
                await signIn(page, J.users.mgr, {contextPath: J.path}); await idle(page);
                await openTab(J.path);
            }
        }
        out.summary = out.steps.map((s) => `${s.n} ${s.op.kind} "${s.op.newTitle || s.op.title}": ${s.where.atOnce} / reload ${s.where.reloaded}${s.reviewer ? ` / reviewer follows ${s.reviewerFollowsTable}` : ''}`);
        log(`[${key}] summary:\n  ${out.summary.join('\n  ')}`);
    };

    try {
        if (on('seed')) {
            for (const key of ['j1', 'j2']) {
                if (scratch[key]) continue;
                const t = tag('u29k8');
                const U = {mgr: `${t}mgr`, au: `${t}au`, rev: `${t}rev`};
                const ctx = await app.api.createContext({tag: t, users: [
                    {username: U.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
                    {username: U.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
                    {username: U.rev, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'}]});
                const s1 = await app.api.createSubmission({tag: `${t}s1`, context: ctx.path || t, submitter: U.au, title: `K8 sub ${t}`, decisions: ['sendExternalReview'],
                    reviewRounds: [{reviewers: [{username: U.rev, status: 'accepted'}]}]});
                scratch[key] = {tag: t, path: ctx.path || t, users: U, sub: s1.submissionId}; saveScratch();
                log(`[seed ${key}] ctx=${scratch[key].path} sub=${scratch[key].sub}`);
            }
        }
        if (on('j1')) await runJournal('j1');
        if (on('j2')) await runJournal('j2');
        await loc(page, 'Reviewer Recommendations table rows', mgrRoot().locator('tbody tr'));
    } finally {
        record(`k8-facts-${PHASES.join('_')}-${app.name}`, facts);
        await close();
    }
});
