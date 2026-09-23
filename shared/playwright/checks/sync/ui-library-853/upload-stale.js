// Pre-merge check for pkp/pkp-lib#13359 (ui-library#853, companion `optimize-table-reloads`): the issue keeps
// "File upload modals still reload the table when closed, since a file can already be uploaded even if the upload
// is closed before the final step completes". The workflow's own upload (workflowStore.fileUpload, the author's
// "Upload revisions") now closes through triggerDataChange(finishedData); the legacy wizard's step-1 upload never
// flags the modal, so a wizard closed after step 1 leaves the "Revisions Uploaded" panel without the file.
//   U  author › workflow › "Upload revisions": attach a file on step 1, close the window with its "Close";
//      the panel's rows and the GETs sent after the close, against the same panel after a page reload (the truth)
//   Fixed when result-ojs.json .U.stale is false (before at ui-library 2034439a: false).
//   PROBE_FEATURE=sync PROBE_AGENT=<agent> node bin/probe.js ojs shared/playwright/checks/sync/ui-library-853/upload-stale.js
const {forEachApp, launch, signIn, record, idle, tag} = require('../../../probe');
const {WorkflowPage, uploadFirstStepOnly, inMemoryFile} =
    require('../../../../../apps/ojs/playwright/pages/ReviewStagePages.js');
const log = (...a) => console.log(...a);

function watchGets(page) {
    const urls = [];
    const on = (req) => {
        if (req.method() === 'GET' && /\/api\/v1\//.test(req.url())) {
            urls.push(new URL(req.url()).pathname.replace(/^.*\/api\/v1/, ''));
        }
    };
    page.on('request', on);
    return () => { page.off('request', on); return urls; };
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('u853u');
    await app.api.createContext({tag: T, users: [
        {username: `${T}aut`, roles: ['author'], givenName: 'Au', familyName: `Thor${T}`},
    ]});
    const seed = await app.api.createSubmission({tag: T, context: T, submitter: `${T}aut`, title: `U853 upload ${T}`,
        decisions: ['sendExternalReview', 'requestRevisions'], reviewRounds: [{reviewers: []}]});
    record('seed', {T, seed});
    const file = inMemoryFile(`${T}-rev1.txt`);
    const out = {T};

    const {page, close} = await launch(app);
    try {
        await signIn(page, `${T}aut`, {contextPath: T});
        const wf = new WorkflowPage(page, T);
        await wf.gotoAuthor(seed.submissionId);
        await idle(page);
        const panelRow = () => wf.panelRow('Revisions Uploaded', file.name);
        out.U = {before: await panelRow().count()};
        await page.getByRole('button', {name: 'Upload revisions', exact: true}).click();
        const stopGets = watchGets(page);
        await uploadFirstStepOnly(page, {file});
        await idle(page);
        await page.waitForTimeout(3000);
        out.U.getsAfterClose = stopGets();
        out.U.afterClose = await panelRow().count();
        await page.reload();
        await wf.expectOpen();
        await idle(page);
        await panelRow().first().waitFor({timeout: 30_000}).catch(() => {});
        out.U.afterReload = await panelRow().count();
        out.U.stale = out.U.afterClose !== out.U.afterReload;
        log('U', JSON.stringify(out.U, null, 1));
    } finally {
        await close();
    }
    record('result', out);
    return out;
});
