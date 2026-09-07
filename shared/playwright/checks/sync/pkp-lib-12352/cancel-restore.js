// Regression re-check for pkp/pkp-lib#12352 (issue #12347), kept from the
// 2026-09-07 sync (docs/tracking/ci-triage.md "Open regressions"). One OJS
// run on a scratch journal:
//   A. editor 1 uploads article.pdf through the wizard (Submission stage)
//   B. editor 2 renames the file through its "Update File Details" window
//      (MODE=control: editor 1 renames it instead)
//   C. editor 1 uploads article-rev.pdf as a revision of it and presses
//      "Cancel" on the wizard's step 1 once the upload completed; the file
//      list is read back through GET api/v1/submissions/<id>/files
//   D. the Activity Log & Notes history is read, and its Download fetched
//   E. the file's "More Information" history is read
//
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-12352/cancel-restore.js
//
// Verdict from `result-main-ojs.json` in the agent's output folder:
//   fixed  → afterCancel.items[0] carries the ORIGINAL fileId and the name
//            "Renamed by B.pdf", and the cancel-file-upload response in
//            cancelBodies reads {"status":true,…}
//   broken → afterCancel keeps the new fileId and "article-rev.pdf", and the
//            response reads {"status":false,…}  (lib/pkp 74a8d58571; the
//            pre-change 4ddab4b9cf restored it)
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, note, idle, tag, outDir} =
    require('../../../probe');

const FIXTURE = path.resolve(__dirname, '../../../../../apps/ojs/playwright/fixtures/files/article.pdf');
const log = (...a) => console.log(...a);

async function snap(page, name) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const visibleButtons = (page) => page.evaluate(() =>
    [...document.querySelectorAll('button, a[role=button]')].filter((b) => b.offsetParent !== null)
        .map((b) => (b.getAttribute('aria-label') || b.innerText).trim()).filter(Boolean).slice(0, 80));

const wizardDialog = (page) => page.getByRole('dialog').filter({has: page.locator('input[type="file"]')});

async function openUploadWizard(page) {
    const btn = page.getByRole('button', {name: /^Upload/}).first();
    await btn.waitFor({state: 'visible', timeout: 30_000});
    await btn.click();
    await wizardDialog(page).locator('input[type="file"]').waitFor({state: 'attached', timeout: 30_000});
}

// Step 1 of the legacy wizard, then either complete it or cancel on step 2.
async function driveWizard(page, {file, reviseMatch = null, cancel = false, label}) {
    const dialog = wizardDialog(page);
    const revise = dialog.locator('select[id^="revisedFileId"]');
    const reviseInfo = {present: await revise.count(), options: []};
    if (reviseInfo.present) {
        reviseInfo.options = await revise.locator('option').allTextContents();
        if (reviseMatch) {
            const idx = reviseInfo.options.findIndex((t) => t.includes(reviseMatch));
            reviseInfo.pickedIndex = idx;
            if (idx >= 0) await revise.selectOption({index: idx});
        }
    }
    const genre = dialog.locator('select[id^="genreId"]');
    if (await genre.count() && await genre.isEnabled()) await genre.selectOption({label: 'Article Text'}).catch(async () => {
        const opts = await genre.locator('option').allTextContents();
        reviseInfo.genreOptions = opts;
        await genre.selectOption({index: 1});
    });
    await dialog.locator('input[type="file"]').setInputFiles(file);
    const cont = dialog.getByRole('button', {name: 'Continue', exact: true});
    await cont.waitFor({state: 'visible', timeout: 30_000});
    await page.waitForFunction((sel) => {
        const b = [...document.querySelectorAll(sel)].find((x) => x.offsetParent !== null);
        return b && !b.disabled;
    }, 'button', {timeout: 30_000}).catch(() => {});
    if (cancel) {
        // The restore path: cancel on step 1 once the upload has completed
        // (the wizard forgets the uploaded file when it advances).
        await page.waitForFunction(() => {
            const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent !== null && x.textContent.trim() === 'Continue');
            return b && !b.disabled;
        }, {timeout: 30_000}).catch(() => {});
        const step1 = {text: (await dialog.innerText()).slice(0, 1500)};
        record(`${label}-wizard-step1-uploaded`, {reviseInfo, step1});
        await shot(page, `${label}-wizard-step1-uploaded`);
        await dialog.getByRole('link', {name: 'Cancel', exact: true}).or(dialog.getByRole('button', {name: 'Cancel', exact: true})).first().click();
        await page.waitForTimeout(1500);
        await dialog.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
        await idle(page);
        return reviseInfo;
    }
    await cont.click();
    await dialog.getByRole('tab', {name: /^2\./}).waitFor({state: 'visible', timeout: 30_000});
    const step2 = {tabs: await dialog.getByRole('tab').allTextContents(), text: (await dialog.innerText()).slice(0, 2000)};
    record(`${label}-wizard-step2`, {reviseInfo, step2});
    if (cancel) {
        await dialog.getByRole('link', {name: 'Cancel', exact: true}).or(dialog.getByRole('button', {name: 'Cancel', exact: true})).first().click();
        // A confirm may stack (jQuery UI or reka): answer it.
        const confirm = page.locator('[role="dialog"]:visible').filter({hasText: /cancel|Cancel|unsaved|delete/}).last();
        try {
            await confirm.waitFor({state: 'visible', timeout: 3000});
            const txt = (await confirm.innerText()).slice(0, 500);
            const ok = confirm.getByRole('button', {name: /^(OK|Yes|Confirm)$/}).first();
            if (await ok.count()) await ok.click();
            record(`${label}-cancel-confirm`, {txt});
        } catch (e) { /* no confirm */ }
        await dialog.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    } else {
        await dialog.getByRole('button', {name: 'Continue', exact: true}).click();
        await dialog.getByRole('tab', {name: /^3\./}).waitFor({state: 'visible', timeout: 30_000});
        await dialog.getByRole('button', {name: 'Complete', exact: true}).click();
        await dialog.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    }
    await idle(page);
    return reviseInfo;
}

async function filesViaApi(app, T, sid, label, page) {
    const url = app.url(`/index.php/${T}/api/v1/submissions/${sid}/files`);
    try {
        const r = await page.request.get(url, {failOnStatusCode: false});
        const status = r.status();
        let items = null;
        try {
            const j = await r.json();
            items = (j.items || []).map((f) => ({id: f.id, fileId: f.fileId, name: f.name, fileStage: f.fileStage, uploaderUserId: f.uploaderUserId, revisions: f.revisions}));
        } catch (e) { items = (await r.text()).slice(0, 300); }
        record(`${label}-files-api`, {url, status, items});
        return {status, items};
    } catch (e) {
        record(`${label}-files-api`, {url, error: String(e.message).slice(0, 300)});
        return {error: e.message};
    }
}

async function fileRowMoreActions(page, nameMatch, item) {
    const row = page.getByRole('row').filter({hasText: nameMatch}).first();
    await row.waitFor({state: 'visible', timeout: 30_000});
    await row.getByRole('button', {name: /More Actions/}).click();
    const items = await page.getByRole('menuitem').allTextContents();
    await page.getByRole('menuitem', {name: item}).first().click();
    return items;
}

async function downloadLinks(page, scope) {
    return scope.evaluate((root) => [...root.querySelectorAll('a')]
        .filter((a) => /download/i.test(a.textContent) || /download-file|downloadFile/.test(a.getAttribute('href') || ''))
        .map((a) => ({text: a.textContent.trim(), href: a.getAttribute('href'), visible: a.offsetParent !== null})));
}

async function fetchHead(page, href) {
    try {
        const r = await page.request.get(href, {maxRedirects: 2});
        const h = r.headers();
        return {status: r.status(), contentType: h['content-type'], disposition: h['content-disposition'], length: h['content-length']};
    } catch (e) { return {error: String(e.message).slice(0, 200)}; }
}

forEachApp(async (app) => {
    const T = tag('rr1log');
    const ed1 = `${T}ed1`, ed2 = `${T}ed2`, au = `${T}au`;
    const revFile = path.join(outDir(), 'article-rev.pdf');
    fs.copyFileSync(FIXTURE, revFile);
    const MODE = process.env.MODE || 'main';   // control: the uploader renames the file
    const RENAMED = 'Renamed by B.pdf';

    const ctx = await app.api.createContext({tag: T, users: [
        {username: ed1, roles: ['editor'], givenName: 'Ed', familyName: 'One'},
        {username: ed2, roles: ['editor'], givenName: 'Ed', familyName: 'Two'},
        {username: au, roles: ['author'], givenName: 'Au', familyName: 'Thor'},
    ]});
    const sub = await app.api.createSubmission({tag: T, context: T, submitter: au, title: `RR1 ${T}`});
    const sid = sub.submissionId;
    record('seed', {ctx, sub});
    log('seeded', T, sid);
    const wf = app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`);

    const {page, close} = await launch(app);
    const cancelBodies = [];
    page.on('response', async (r) => {
        if (/cancel-file-upload|cancelFileUpload/.test(r.url())) {
            try { cancelBodies.push({url: r.url().slice(0, 200), status: r.status(), body: (await r.text()).slice(0, 400)}); } catch (e) { /* body gone */ }
        }
    });
    page.on('dialog', (d) => { cancelBodies.push({jsDialog: d.type(), message: d.message().slice(0, 200)}); d.accept(); });
    page.on('request', (r) => { if (/manage-file-api|file-upload-wizard/.test(r.url())) cancelBodies.push({req: r.method(), url: r.url().slice(0, 220), post: (r.postData() || '').slice(0, 300)}); });
    const result = {T, sid, MODE};
    try {
        // A. editor 1 uploads
        await signIn(page, ed1, {contextPath: T});
        await page.goto(wf); await idle(page);
        record('a0-buttons', await visibleButtons(page));
        await snap(page, 'a0-workflow');
        await openUploadWizard(page);
        await driveWizard(page, {file: FIXTURE, label: 'a1'});
        await page.goto(wf); await idle(page);
        await snap(page, 'a2-after-upload');
        result.afterUpload = await filesViaApi(app, T, sid, 'a2', page);

        // B. editor 2 renames (control: editor 1)
        await signIn(page, MODE === 'control' ? ed1 : ed2, {contextPath: T});
        await page.goto(wf); await idle(page);
        const menuB = await fileRowMoreActions(page, 'article.pdf', /Update File Details|^Edit/);
        record('b1-menu', menuB);
        const form = page.getByRole('dialog').filter({hasText: 'Edit a file'}).last();
        const nameInput = form.getByRole('textbox').first();
        await nameInput.waitFor({state: 'visible', timeout: 30_000});
        await snap(page, 'b1-edit-window');
        await nameInput.fill(RENAMED);
        await form.getByRole('button', {name: 'Save', exact: true}).click();
        await nameInput.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
        await idle(page);
        await page.goto(wf); await idle(page);
        await snap(page, 'b2-after-rename');
        result.afterRename = await filesViaApi(app, T, sid, 'b2', page);

        // C. editor 1 revises and cancels
        await signIn(page, ed1, {contextPath: T});
        await page.goto(wf); await idle(page);
        await openUploadWizard(page);
        result.reviseInfo = await driveWizard(page, {file: revFile, reviseMatch: 'Renamed', cancel: true, label: 'c1'});
        await snap(page, 'c1-after-cancel');
        await page.goto(wf); await idle(page);
        await snap(page, 'c2-after-cancel-reload');
        result.afterCancel = await filesViaApi(app, T, sid, 'c2', page);
        result.cancelBodies = cancelBodies;

        // D. Activity Log & Notes
        await page.getByRole('button', {name: 'Activity Log', exact: true}).click();
        const logDialog = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
        await logDialog.getByText('Event', {exact: true}).first().waitFor({state: 'visible', timeout: 30_000});
        await idle(page);
        const logText = await logDialog.innerText();
        const links = await downloadLinks(page, logDialog);
        const fetched = [];
        for (const l of links.filter((x) => x.href && /download-file|downloadFile/.test(x.href)).slice(0, 4)) fetched.push({href: l.href, ...(await fetchHead(page, l.href))});
        record('d1-activity-log', {text: logText, unfilledPlaceholders: /\{\$/.test(logText), links, fetched});
        await shot(page, 'd1-activity-log');
        result.activityLog = {rows: logText.split('\n').filter((s) => /file|File/.test(s)), fetched};
        await logDialog.getByRole('button', {name: /^(Close|Cancel)$/}).first().click().catch(() => {});
        await page.goto(wf); await idle(page);

        // E. the file's More Information history
        const menuE = await fileRowMoreActions(page, /Renamed by B|article-rev/, /Information/);
        record('e0-menu', menuE);
        const info = page.getByRole('dialog').filter({hasText: /Information Center/}).last();
        await info.waitFor({state: 'visible', timeout: 30_000});
        const histTab = info.getByRole('tab', {name: /History/});
        if (await histTab.count()) await histTab.first().click();
        await info.getByText('Event', {exact: true}).first().waitFor({state: 'visible', timeout: 30_000}).catch(() => {});
        await idle(page);
        const infoText = await info.innerText();
        const infoLinks = await downloadLinks(page, info);
        const infoFetched = [];
        for (const l of infoLinks.filter((x) => x.href && /download-file|downloadFile/.test(x.href)).slice(0, 4)) infoFetched.push({href: l.href, ...(await fetchHead(page, l.href))});
        record('e1-file-history', {text: infoText, unfilledPlaceholders: /\{\$/.test(infoText), links: infoLinks, fetched: infoFetched});
        await shot(page, 'e1-file-history');
        result.fileHistory = {rows: infoText.split('\n').filter((s) => /file|File/.test(s)), fetched: infoFetched};
    } catch (e) {
        result.error = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
        log('FAILED', result.error);
        await snap(page, 'zz-failure');
        record('zz-buttons', await visibleButtons(page).catch(() => []));
    } finally {
        record(`result-${MODE}`, result);
        log(JSON.stringify(result, null, 2));
        await close();
    }
});
