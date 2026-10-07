// Issue report docs/issues/U13-OJS14-older-version-galley-id-link-opens-current.md
// (U13 OJS14): on a journal, an older version's galley opened by its ID under
// the version's address ("…/version/{version}/{galley ID}") is forwarded
// without the version part once the galley has a URL Path, so the reader
// lands on the current version's galley (or the article's page) with no
// "This is an outdated version…" notice. Takes the report's Steps on PKP's
// default test dataset (OJS):
//   1-2  dbarnes publishes submission 1's version 1.1;
//   3-4  signed out: the article › "Versions" › the older entry › "PDF"
//        (…/version/1/1, the galley's ID; the reader under the notice);
//   5-6  dbarnes: version 1.0 › "Galleys" › "PDF" › "Edit" › URL Path "pdf";
//   7-8  signed out: …/view/mwandenga/version/1/1, …/download/mwandenga/version/1/1
//        (each also with the file ID, …/1/12);
//   9-10 dbarnes: the same galley's URL Path "pdf-v1"; signed out: …/version/1/1;
//   11-12 dbarnes: version 1.1's "PDF Version 2" galley, URL Path cleared;
//        signed out: …/version/1/1.
//   Controls: the URL Path addresses …/version/1/pdf and …/version/1/pdf-v1,
//   and the current version's galley by its ID, without and with the version
//   part (…/view/mwandenga/2, …/view/mwandenga/version/2/2).
// WALK=neighbour (alone, on a freshly loaded dataset, nothing created): the
// addresses a fix must leave as they are, and the editor's preview address.
// OMP has no ID-to-URL-Path forwarding and OPS no galley-ID forwarding
// (U13 OPS3, its own report), so both are skipped.
// Reset the dataset fleet first; the steps change submission 1.
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js
const {forEachApp, launch, signIn, signOut, screen, record, idle} = require('../../../probe');
const {publishLatestVersion, readLanding} = require('../older-version-pdf-reader-empty/lib');
const {visit, setVersionGalleyUrlPath} = require('./lib');

const MODE = process.env.WALK || 'steps';

forEachApp(async (app) => {
    if (!app.dataset) throw new Error('walk.js runs on a dataset fleet (fleet-prep --dataset n --reset)');
    if (app.name !== 'ojs') {
        console.log(`[fact] ${app.name}: no galley-ID forwarding under a version address; skipped`);
        return;
    }
    const ctx = app.contextPath;
    const at = (p) => app.url(`/index.php/${ctx}/en/article/${p}`);
    const facts = {app: app.name, line: app.line || 'main', mode: MODE};

    if (MODE === 'neighbour') {
        const reader = await launch(app);
        const r = reader.page;
        try {
            facts.nNoUrlPath = await visit(r, app, 'n1-no-url-path-by-id', () => r.goto(at('view/17/3')));
            facts.nNoUrlPathVersion = await visit(r, app, 'n2-no-url-path-by-id-version', () => r.goto(at('view/17/version/18/3')));
            facts.nOtherArticlesGalley = await visit(r, app, 'n3-other-articles-galley', () => r.goto(at('view/17/version/18/1')));
            facts.nUnpublishedVersion = await visit(r, app, 'n4-unpublished-version-galley', () => r.goto(at('view/1/version/2/2')));
            facts.nUnpublishedGalleyNoVersion = await visit(r, app, 'n5-unpublished-galley-no-version', () => r.goto(at('view/1/2')));
        } finally {
            await reader.close();
        }
        const editor = await launch(app);
        try {
            await signIn(editor.page, 'dbarnes', {contextPath: ctx});
            facts.nEditorPreview = await visit(editor.page, app, 'n6-editor-preview-galley-by-id', () => editor.page.goto(at('view/1/version/2/2')));
            facts.nEditorPreviewPath = await visit(editor.page, app, 'n7-editor-preview-galley-by-path', () => editor.page.goto(at('view/1/version/2/pdf')));
            await signOut(editor.page);
        } finally {
            await editor.close();
        }
        record('facts-neighbour', facts);
        return;
    }

    const {WorkflowPage} = require('../../../pages/WorkflowPage.js');
    const editor = await launch(app);
    const e = editor.page;
    const reader = await launch(app);
    const r = reader.page;
    const frame = new WorkflowPage(e, ctx, {labels: {publicationGroup: 'Publication'}});
    const openWorkflow = async () => {
        await signIn(e, 'dbarnes', {contextPath: ctx});
        await frame.gotoEditorial(1);
        await frame.expectVersionLoaded().catch(() => {});
        await idle(e);
    };
    try {
        // 1-2. The editor publishes version 1.1.
        await signIn(e, 'dbarnes', {contextPath: ctx});
        facts.publish = await publishLatestVersion(e, app, 1);
        console.log(`[fact] ojs publish: ${JSON.stringify(facts.publish)}`);
        await signOut(e);

        // 3. Signed out: the article, "Versions", the older entry.
        await r.goto(at('view/mwandenga'));
        await idle(r);
        record('step3-current-page', await screen(r));
        facts.current = await readLanding(r);
        console.log(`[fact] ojs current: ${JSON.stringify(facts.current)}`);
        const older = facts.current.versions[0];
        if (!older) throw new Error('no older version link on the current page');
        await r.locator(`a[href$="${older.href}"]`).first().click();
        await idle(r);
        record('step3-older-page', await screen(r));
        facts.older = await readLanding(r);
        console.log(`[fact] ojs older: ${JSON.stringify(facts.older)}`);

        // 4. Its "PDF": the galley's ID address, before the galley has a URL Path.
        facts.s4Before = await visit(r, app, 'step4-older-pdf-before', () => r.locator('a.obj_galley_link').filter({hasText: /PDF/}).first().click());

        // 5-6. The editor: version 1.0's "PDF" galley, URL Path "pdf".
        await openWorkflow();
        facts.s6 = await setVersionGalleyUrlPath(e, app, frame, 'first', 'PDF', 'pdf', 'step6');
        console.log(`[fact] ojs step 6: ${JSON.stringify(facts.s6)}`);
        await signOut(e);

        // 7-8. Signed out: the kept address, and its download twin.
        facts.s7 = await visit(r, app, 'step7-version-galley-id', () => r.goto(at('view/mwandenga/version/1/1')));
        facts.s8 = await visit(r, app, 'step8-version-galley-id-download', () => r.goto(at('download/mwandenga/version/1/1')), {download: true});
        // The same two addresses with the file ID the PDF reader's "Download" address ends with.
        facts.s7File = await visit(r, app, 'step7-version-galley-id-file', () => r.goto(at('view/mwandenga/version/1/1/12')));
        facts.s8File = await visit(r, app, 'step8-version-galley-id-file-download', () => r.goto(at('download/mwandenga/version/1/1/12')), {download: true});
        // Controls: the URL Path address, and the current version's galley by its ID.
        facts.cPath = await visit(r, app, 'control-version-galley-path', () => r.goto(at('view/mwandenga/version/1/pdf')));
        facts.cCurrentId = await visit(r, app, 'control-current-galley-id', () => r.goto(at('view/mwandenga/2')));
        facts.cCurrentIdVersion = await visit(r, app, 'control-current-galley-id-version', () => r.goto(at('view/mwandenga/version/2/2')));
        // The older version's page now links the galley by its URL Path.
        await r.goto(at('view/mwandenga/version/1'));
        await idle(r);
        facts.olderAfter = await readLanding(r);
        console.log(`[fact] ojs older page after step 6: ${JSON.stringify(facts.olderAfter)}`);

        // 9. The editor: another URL Path than the current version's galley has.
        await openWorkflow();
        facts.s9 = await setVersionGalleyUrlPath(e, app, frame, 'first', 'PDF', 'pdf-v1', 'step9');
        console.log(`[fact] ojs step 9: ${JSON.stringify(facts.s9)}`);
        await signOut(e);

        // 10. Signed out: the kept address again.
        facts.s10 = await visit(r, app, 'step10-version-galley-id', () => r.goto(at('view/mwandenga/version/1/1')));
        facts.cPath2 = await visit(r, app, 'control-version-galley-path-2', () => r.goto(at('view/mwandenga/version/1/pdf-v1')));

        // 11. The editor: the current version's galley loses its URL Path.
        await openWorkflow();
        facts.s11 = await setVersionGalleyUrlPath(e, app, frame, 'latest', 'PDF Version 2', '', 'step11');
        console.log(`[fact] ojs step 11: ${JSON.stringify(facts.s11)}`);
        await signOut(e);

        // 12. Signed out: the kept address once more.
        facts.s12 = await visit(r, app, 'step12-version-galley-id', () => r.goto(at('view/mwandenga/version/1/1')));
        facts.cCurrentId2 = await visit(r, app, 'control-current-galley-id-2', () => r.goto(at('view/mwandenga/2')));
    } finally {
        record('facts', facts);
        await reader.close();
        await editor.close();
    }
});
