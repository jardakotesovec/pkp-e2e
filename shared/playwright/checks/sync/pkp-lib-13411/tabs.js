// Regression check for pkp/pkp-lib#13411 (issue #13286, second round), kept from the PR review
// of 2026-09-29 (companion i13286_2_main; U36 A26, docs/reports/2026-09-29-pkp-lib-13411.md).
// A second pick plus "Cancel" in window A while another window has revised the same file:
//   MODE=s1  window B (same person) uploads rev-b.pdf and stays on step 1; A re-picks rev-c.pdf,
//            cancels; then B cancels
//   MODE=s2  B uploads rev-b.pdf and presses "Complete"; A re-picks rev-c.pdf, cancels (twice if
//            it stays open)
//   MODE=s3  as s2, but B is another Editor in another browser
//   PROBE_FEATURE=sync PROBE_AGENT=<short agent> MODE=s1|s2|s3 node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13411/tabs.js
//   (keep PROBE_AGENT short: it goes into the usernames, 32 characters at most)
// Verdict from result-<MODE>-ojs.json:
//   fixed  → s2/s3: cancelA answers status:true and afterAll reads "rev-b.pdf" (B's revision);
//            s1: afterCancelA reads "rev-b.pdf" and B's cancel then restores "article.pdf"
//   broken → s2/s3: cancelA status:false, wizardStillOpen, afterAll "rev-c.pdf";
//            s1: afterCancelA "article.pdf", cancelB status:false (lib/pkp 7263f86190);
//            at main fab29cfeca cancelA restored "rev-b.pdf" in all three
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, shot, record, idle, tag, outDir} = require('../../../probe');

const MODE = process.env.MODE || 's1';
const wizardDialog = (page) => page.getByRole('dialog').filter({has: page.locator('input[type="file"]')});
const anyWizard = (page) => page.getByRole('dialog').filter({hasText: /1\.\s*Upload File/});

async function openUploadWizard(page) {
    const btn = page.getByRole('button', {name: /^Upload/}).first();
    await btn.waitFor({state: 'visible', timeout: 30_000});
    await btn.click();
    await wizardDialog(page).locator('input[type="file"]').waitFor({state: 'attached', timeout: 30_000});
}
async function pickRevision(page, match) {
    const revise = wizardDialog(page).locator('select[id^="revisedFileId"]');
    const options = await revise.locator('option').allTextContents();
    const idx = options.findIndex((t) => t.includes(match));
    if (idx >= 0) await revise.selectOption({index: idx});
    return {options, idx};
}
async function uploadPick(page, file) {
    const resp = page.waitForResponse((r) => /upload-file|uploadFile/.test(r.url()) && r.request().method() === 'POST', {timeout: 60_000});
    await wizardDialog(page).locator('input[type="file"]').setInputFiles(file);
    const r = await resp;
    let body = null;
    try { body = JSON.parse(await r.text()); } catch (e) { body = 'unparsed'; }
    await page.waitForTimeout(800);
    return {status: r.status(), uploadedFile: body && body.uploadedFile ? body.uploadedFile : body};
}
async function cancelWizard(page) {
    const dialog = anyWizard(page);
    const resp = page.waitForResponse((r) => /cancel-file-upload|cancelFileUpload/.test(r.url()), {timeout: 15_000}).catch(() => null);
    await dialog.getByRole('link', {name: 'Cancel', exact: true}).or(dialog.getByRole('button', {name: 'Cancel', exact: true})).first().click();
    const r = await resp;
    const out = r ? {status: r.status(), body: (await r.text()).slice(0, 300)} : {none: true};
    await page.waitForTimeout(1500);
    out.wizardStillOpen = await dialog.isVisible().catch(() => false);
    return out;
}
async function completeWizard(page) {
    const dialog = anyWizard(page);
    const cont = () => dialog.getByRole('button', {name: 'Continue', exact: true}).or(dialog.getByRole('link', {name: 'Continue', exact: true})).first();
    const meta = page.waitForResponse((r) => /edit-metadata|editMetadata/.test(r.url()), {timeout: 30_000});
    await cont().click();
    await meta; await idle(page);
    const fin = page.waitForResponse((r) => /finish-file-submission|finishFileSubmission/.test(r.url()), {timeout: 30_000});
    await cont().click();
    const f = await fin; await idle(page);
    await page.waitForTimeout(800);
    await dialog.getByRole('button', {name: 'Complete', exact: true}).or(dialog.getByRole('link', {name: 'Complete', exact: true})).first().click();
    await page.waitForTimeout(1500);
    return {finishStatus: f.status(), wizardStillOpen: await dialog.isVisible().catch(() => false)};
}
async function files(app, T, sid, page) {
    const r = await page.request.get(app.url(`/index.php/${T}/api/v1/submissions/${sid}/files`), {failOnStatusCode: false});
    const j = await r.json().catch(() => ({}));
    return {status: r.status(), items: (j.items || []).map((f) => ({id: f.id, fileId: f.fileId, name: f.name && (f.name.en || f.name.en_US || f.name), uploaderUserId: f.uploaderUserId, revisions: (f.revisions || []).map((x) => x.fileId)}))};
}

forEachApp(async (app) => {
    const T = tag('rr13411' + MODE);
    const edA = `${T}eda`, edB = `${T}edb`, au = `${T}au`;
    const fixtures = path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files`);
    const base = fs.existsSync(path.join(fixtures, 'article.pdf')) ? 'article.pdf' : 'preprint.pdf';
    const mk = (n) => { const p = path.join(outDir(), n); fs.copyFileSync(path.join(fixtures, base), p); return p; };
    const [ra, rb, rc] = [mk('rev-a.pdf'), mk('rev-b.pdf'), mk('rev-c.pdf')];
    const role = app.name === 'ops' ? 'manager' : 'editor';
    await app.api.createContext({tag: T, users: [
        {username: edA, roles: [role], givenName: 'Ed', familyName: 'Alpha'},
        {username: edB, roles: [role], givenName: 'Ed', familyName: 'Beta'},
        {username: au, roles: ['author'], givenName: 'Au', familyName: 'Thor'},
    ]});
    const sub = await app.api.createSubmission({tag: T, context: T, submitter: au, title: `RR13411 ${T}`, files: [{file: base}]});
    const sid = sub.submissionId;
    const wf = app.url(`/index.php/${T}/dashboard/editorial?workflowSubmissionId=${sid}`);
    const result = {T, sid, MODE, base};
    const A = await launch(app);
    const B = MODE === 's3' ? await launch(app) : null;
    const reqs = [];
    const watch = (p, label) => p.on('request', (r) => { if (/manage-file-api|file-upload-wizard/.test(r.url())) reqs.push({tab: label, m: r.method(), url: r.url().replace(/^.*index.php/, '').slice(0, 160), post: /cancel/.test(r.url()) ? (r.postData() || '').slice(0, 500) : undefined}); });
    const page = A.page;
    watch(page, 'A');
    try {
        await signIn(page, edA, {contextPath: T});
        await page.goto(wf); await idle(page);
        result.before = await files(app, T, sid, page);
        await openUploadWizard(page);
        result.pickA = await pickRevision(page, base);
        result.uploadA = await uploadPick(page, ra);
        let pageB;
        if (B) { pageB = B.page; await signIn(pageB, edB, {contextPath: T}); } else { pageB = await page.context().newPage(); }
        watch(pageB, 'B');
        await pageB.goto(wf); await idle(pageB);
        await openUploadWizard(pageB);
        result.pickB = await pickRevision(pageB, 'rev-a');
        result.uploadB = await uploadPick(pageB, rb);
        if (MODE !== 's1') result.completeB = await completeWizard(pageB);
        result.afterB = await files(app, T, sid, page);
        result.repickA = await uploadPick(page, rc);
        result.afterRepickA = await files(app, T, sid, page);
        await shot(page, 'tabA-before-cancel');
        result.cancelA = await cancelWizard(page);
        result.afterCancelA = await files(app, T, sid, page);
        await shot(page, 'tabA-after-cancel');
        if (result.cancelA.wizardStillOpen) {
            result.cancelA2 = await cancelWizard(page);
        }
        if (MODE === 's1') {
            result.cancelB = await cancelWizard(pageB);
            await shot(pageB, 'tabB-after-cancel');
        }
        await page.goto(wf); await idle(page);
        result.afterAll = await files(app, T, sid, page);
        await shot(page, 'after-all-workflow');
    } catch (e) {
        result.error = String(e.stack || e).split('\n').slice(0, 4).join(' | ');
        await shot(page, 'zz-failure').catch(() => {});
    } finally {
        result.reqs = reqs;
        record(`result-${MODE}`, result);
        console.log(JSON.stringify(result, null, 1));
        await A.close();
        if (B) await B.close();
    }
});
