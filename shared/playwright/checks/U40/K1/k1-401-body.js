// U40 K1 follow-up for finding K1-1: record the refused save's response body
// and the browser console when the Author saves a new version of a published
// submission, plus the manager's view of the header status and the Author's
// "Edit Assignment" window. Re-drives the state on the K1 scratch context
// (k1-state-<app>.json from k1.js): manager re-ticks the Author's permission
// and re-publishes version 1.0, then the Author presses Save on the new version.
//
//   PROBE_FEATURE=U40 PROBE_AGENT=ccK1 node bin/probe.js ojs shared/playwright/checks/U40/K1/k1-401-body.js
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, idle, outDir} = require('../../../probe');

const T = 30_000;
const log = (...a) => console.log('[k1-401]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wf = (page) => page.locator('[role="dialog"]:visible').first();

async function gotoWorkflow(page, app, ctx, id, {author = false} = {}) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/${author ? 'mySubmissions' : 'editorial'}?workflowSubmissionId=${id}`));
    await idle(page);
    await wf(page).getByRole('link', {name: /^(Title & Abstract|Publication|Preprint|Submission|Production)$/}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
}

async function formReady(page) {
    const start = Date.now();
    while (Date.now() - start < 20_000) {
        if (await wf(page).getByRole('button', {name: 'Save', exact: true}).count()) break;
        await sleep(250);
    }
    await idle(page);
    const iframe = page.locator('iframe[id^="titleAbstract-title-control"]');
    const id = (await iframe.count()) ? (await iframe.first().getAttribute('id', {timeout: 5_000}).catch(() => null)) : null;
    if (id) await page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id.replace(/_ifr$/, ''), {timeout: T}).catch(() => {});
}

async function openEntry(page, name, versionLabel) {
    const dialog = wf(page);
    let entry = dialog.getByRole('link', {name, exact: true});
    if (versionLabel) {
        // The side menu shows the SELECTED version's entries only; the version's own link selects it
        // (clicking it while selected collapses the group), so click it only when its entry is not there.
        const item = dialog.getByRole('treeitem', {name: versionLabel, exact: true});
        let scoped = item.getByRole('link', {name, exact: true});
        if (!(await scoped.count()) || !(await scoped.first().isVisible().catch(() => false))) {
            await dialog.getByRole('link', {name: versionLabel, exact: true}).first().click();
            await idle(page);
        }
        scoped = item.getByRole('link', {name, exact: true});
        if (await scoped.count()) entry = scoped;
    }
    await entry.first().waitFor({state: 'visible', timeout: T});
    await entry.first().click();
    await dialog.getByRole('heading', {name: new RegExp(`^(Publication|Preprint): ${name}$`, 'i')}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
    await idle(page);
    await formReady(page);
}

async function openStage(page) {
    for (const name of ['Submission', 'Production']) {
        const link = wf(page).getByRole('link', {name, exact: true}).first();
        if (await link.count()) { await link.click(); await idle(page); break; }
    }
}

async function editAssignment(page, displayName, want) {
    const dialog = wf(page);
    await dialog.getByRole('button', {name: `${displayName} More Actions`}).first().click();
    await page.getByRole('menuitem', {name: 'Edit', exact: true}).first().click();
    const window = page.getByRole('dialog').filter({hasText: 'Edit Assignment'}).last();
    const checkbox = window.locator('input[name="canChangeMetadata"]');
    await checkbox.waitFor({state: 'visible', timeout: T});
    const out = {
        checkedBefore: await checkbox.isChecked(),
        text: await window.innerText().catch(() => null),
        fields: await window.locator('input, select').evaluateAll((els) => els.map((e) => ({name: e.name, type: e.type, value: e.value, checked: e.checked}))),
        aria: await window.ariaSnapshot().catch(() => null),
    };
    if (typeof want === 'boolean' && want !== out.checkedBefore) {
        if (want) await checkbox.check(); else await checkbox.uncheck();
        await window.getByRole('button', {name: 'OK', exact: true}).click();
        out.set = want;
    } else {
        await window.getByRole('link', {name: 'Cancel', exact: true}).or(window.getByRole('button', {name: 'Cancel', exact: true})).first().click().catch(() => {});
    }
    await checkbox.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    return out;
}

forEachApp(async (app) => {
    const state = JSON.parse(fs.readFileSync(path.join(outDir(), `k1-state-${app.name}.json`), 'utf8'));
    const {ctx, s1, versions} = state;
    const v1 = versions.v1;
    const v2 = versions.v2;
    const AU = `${ctx}au`;
    const MGR = `${ctx}mgr`;
    const mgr = await launch(app);
    const au = await launch(app);
    const out = {app: app.name, ctx, submissionId: s1.submissionId, versions, steps: {}};
    try {
        await signIn(mgr.page, MGR);
        await signIn(au.page, AU);

        // 1. Manager: tick the permission again, re-publish version 1.0 (the K1 drive left it unpublished and unticked).
        await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
        await openStage(mgr.page);
        out.steps.tick = await editAssignment(mgr.page, 'Ada Author', true);
        // An earlier pass of this script published the NEW version by mistake (entry scoping): put it back first.
        await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
        await openEntry(mgr.page, 'Title & Abstract', v2);
        const v2Published = (await mgr.page.getByRole('button', {name: /^(Unpublish|Unpost)$/}).count()) > 0;
        out.steps.v2WasPublished = v2Published;
        if (v2Published) {
            const isOps = app.name === 'ops';
            await mgr.page.getByRole('button', {name: isOps ? 'Unpost' : 'Unpublish', exact: true}).first().click();
            const dialog = mgr.page.getByRole('dialog').filter({hasText: isOps ? "Are you sure you don't want this to be posted?" : "Are you sure you don't want this to be published?"}).last();
            await dialog.waitFor({state: 'visible', timeout: T});
            const done = mgr.page.waitForResponse((r) => r.url().includes('/unpublish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await dialog.getByRole('button', {name: isOps ? 'Unpost' : 'Unpublish', exact: true}).last().click();
            await done;
            await dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
            await idle(mgr.page);
        }
        await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
        await openEntry(mgr.page, 'Title & Abstract', v1);
        out.steps.v1Banner = (await wf(mgr.page).innerText()).split('\n').filter((l) => /Warning:|can not be edited/.test(l));
        const published = (await mgr.page.getByRole('button', {name: /^(Unpublish|Unpost)$/}).count()) > 0;
        if (!published) {
            if (app.name === 'ojs') {
                // The journal now holds a future issue (K1's scheduled leg), so the panel carries the Issue
                // Assignment group with nothing preselected: bound on the status fetch, then pick "Don't Assign".
                const {PublishScreen} = require(path.join(app.suiteDir, 'pages', 'PublishSchedulePages.js'));
                const pub = new PublishScreen(mgr.page, ctx);
                const panel = await pub.openPublishPanelExpectingIssueFields();
                await pub.fillVersionDetails(panel);
                const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                await dontAssign.waitFor({state: 'visible', timeout: T});
                await dontAssign.check();
                await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                const confirm = pub.confirmationDialog('Are you sure you want to publish this?');
                await confirm.waitFor({state: 'visible', timeout: T});
                await pub.confirmPublish(confirm, 'Publish');
                await mgr.page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T});
            } else if (app.name === 'omp') {
                await mgr.page.getByRole('button', {name: 'Publish', exact: true}).first().click();
                const modal = mgr.page.getByRole('dialog', {name: /Schedule For Publication/});
                await modal.waitFor({state: 'visible', timeout: T});
                await modal.getByRole('button', {name: 'Publish', exact: true}).click();
                await mgr.page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T});
            } else {
                const {postPreprint} = require(path.join(app.suiteDir, 'pages', 'PublicationPages.js'));
                await postPreprint(mgr.page);
            }
        }
        await idle(mgr.page);
        out.steps.republished = {alreadyPublished: published};

        // 2. Manager: the workflow header (stage / status) after the publish.
        await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
        const header = await screen(mgr.page);
        const dialogText = (header.text.dialog || '');
        header.statusLines = dialogText.split('\n').map((l) => l.trim()).filter((l) => /^Status:|^Published|^Posted|^Scheduled|^Unpublished|^Done|stage/i.test(l)).slice(0, 12);
        header.headerBlock = dialogText.slice(0, 600);
        record('k1-1-mgr-header', header);
        await shot(mgr.page, 'k1-1-mgr-header').catch(() => {});
        out.steps.header = {statusLines: header.statusLines};
        // Also the dashboard list row's stage/status for this submission.
        await mgr.page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?currentViewId=active`));
        await idle(mgr.page);
        const list = await screen(mgr.page);
        const row = (list.text.main || '').split('\n').map((l) => l.trim());
        const idx = row.findIndex((l) => l.includes(`${s1.submissionId}`) && /K1 main/.test(l)) ;
        list.rowContext = idx >= 0 ? row.slice(Math.max(0, idx - 3), idx + 8) : row.filter((l) => /K1 main|Done|Published|Production|Submission/.test(l)).slice(0, 20);
        record('k1-1-mgr-list', list);
        out.steps.listRow = list.rowContext;

        // 3. Manager: the Author's "Edit Assignment" window (assigned stages, if any listed).
        await gotoWorkflow(mgr.page, app, ctx, s1.submissionId);
        await openStage(mgr.page);
        out.steps.editAssignmentWindow = await editAssignment(mgr.page, 'Ada Author', null);
        record('k1-1-mgr-edit-assignment', out.steps.editAssignmentWindow);

        // 4. Author: the new version's Title & Abstract, one Save, the response body and the console.
        const consoleLines = [];
        au.page.on('console', (m) => consoleLines.push({type: m.type(), text: m.text().slice(0, 500)}));
        au.page.on('pageerror', (e) => consoleLines.push({type: 'pageerror', text: String(e.message || e).slice(0, 500)}));
        await gotoWorkflow(au.page, app, ctx, s1.submissionId, {author: true});
        await openEntry(au.page, 'Title & Abstract', v2);
        const before = await screen(au.page);
        const saveButton = wf(au.page).getByRole('button', {name: 'Save', exact: true});
        out.steps.saveState = {count: await saveButton.count(), enabled: await saveButton.first().isEnabled().catch(() => null)};
        out.steps.banner = (before.text.dialog || '').split('\n').filter((l) => /can not be edited|Warning:/.test(l));
        out.steps.statusLine = (before.text.dialog || '').split('\n').map((l) => l.trim()).filter((l) => /^Status:|^Published|^Unpublished|^Posted/.test(l)).slice(0, 3);
        record('k1-1-au-before-save', {saveState: out.steps.saveState, banner: out.steps.banner, statusLine: out.steps.statusLine, screen: before});
        await shot(au.page, 'k1-1-au-before-save').catch(() => {});
        let response = null;
        if (out.steps.saveState.enabled) {
            const responsePromise = au.page.waitForResponse((r) => /\/publications\/\d+$/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await saveButton.first().click();
            response = await responsePromise;
        } else {
            out.steps.savePressed = false;
        }
        if (response) {
            const bodyText = await response.text().catch(() => null);
            let json = null;
            try { json = JSON.parse(bodyText); } catch {}
            out.response = {
                url: response.url(),
                status: response.status(),
                statusText: response.statusText(),
                headers: response.headers(),
                bodyText,
                json,
                requestMethodOverride: response.request().headers()['x-http-method-override'] || null,
            };
        } else {
            out.response = null;
        }
        await sleep(1500);
        await idle(au.page);
        const after = await screen(au.page);
        out.afterSave = {
            status: await wf(au.page).locator('[role="status"]').allInnerTexts().catch(() => []),
            alerts: await au.page.locator('[role="alert"], .pkpNotification').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.trim())).catch(() => []),
            dialogTail: (after.text.dialog || '').split('\n').slice(-8),
        };
        out.console = consoleLines;
        record('k1-1-401-body', out);
        await shot(au.page, 'k1-1-401-body').catch(() => {});
        log('response', out.response && out.response.status, out.response && out.response.bodyText);
        log('console', JSON.stringify(consoleLines).slice(0, 800));
        log('header', JSON.stringify(out.steps.header), 'list', JSON.stringify(out.steps.listRow));
    } finally {
        await mgr.close();
        await au.close();
    }
});
