// Issue report docs/issues/U13-OJS14-older-version-galley-id-link-opens-current.md
// (U13 OJS14): on a journal, a version's galley typed by its ID under the
// version's address ("…/version/{version ID}/{galley ID}") is forwarded
// without the version part once the galley has a URL Path, so the reader
// lands on the current version's galley (or the article's page) with no
// "This is an outdated version…" notice, and an editor previewing an
// unpublished version gets "404 Not Found". Takes the report's Steps on PKP's
// default test dataset (OJS), submission 1:
//   1-2   dbarnes: 1.1's "Preview"; then …/version/2/2 typed (1.1's galley, URL
//         Path "pdf" as loaded, by its ID);
//   3     dbarnes publishes 1.1;
//   4-5   signed out: the article › "Versions" › the older entry › "PDF"
//         (…/version/1/1, the galley's ID; the reader under the notice);
//   6-7   dbarnes: "Create New Version" (kept as offered), publishes 1.2;
//   8     signed out: …/view|download/mwandenga/version/2/2;
//   9     dbarnes: 1.0's "Galleys" › "PDF" › "Edit" › URL Path "pdf";
//   10-11 signed out: …/view|download/mwandenga/version/1/1 (and the file-ID twins);
//   12    dbarnes: 1.2's "PDF Version 2", URL Path cleared;
//   13    signed out: …/view|download/mwandenga/version/1/1 (and …/version/2/2).
//   Controls: …/version/1/pdf, …/version/2/pdf; the older page's galley links; after
//   step 5 the current version by its version ID (…/version/2/2).
// WALK=neighbour (alone, on a freshly loaded dataset, nothing created): the
// addresses a fix must leave as they are.
// OMP has no ID-to-URL-Path forwarding and OPS no galley-ID forwarding
// (U13 OPS3, its own report), so both are skipped.
// Every state change goes through the screens; sql() only reads IDs for the record.
// Reset the dataset fleet first; the steps change submission 1:
//   npm run fleet-prep -- --feature <feature> --dataset <n> --reset
// Run: PROBE_FEATURE=<feature> PROBE_AGENT=<id> node bin/probe.js ojs shared/playwright/checks/issues/older-version-galley-id-link-opens-current/walk.js
const {forEachApp, launch, signIn, signOut, screen, record, idle, sql} = require('../../../probe');
const {visit, readLanding, pressPreview, publishLatestVersion, createNewVersion, setVersionGalleyUrlPath} = require('./lib');

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
    const db = () => ({
        publications: sql(app, 'select publication_id, status, url_path from publications where submission_id=1 order by 1').split('\n'),
        galleys: sql(app, 'select g.galley_id, g.publication_id, coalesce(g.url_path, \'\'), g.label, g.submission_file_id from publication_galleys g join publications p using (publication_id) where p.submission_id=1 order by 1').split('\n'),
        current: sql(app, 'select current_publication_id from submissions where submission_id=1'),
    });
    const step = async (k, fn) => {
        try {
            facts[k] = await fn();
        } catch (e) {
            facts[k] = {error: String(e.message).slice(0, 300)};
            console.log(`[fact] ojs ${k} FAILED: ${facts[k].error}`);
        }
        return facts[k];
    };

    if (MODE === 'neighbour') {
        facts.db = db();
        const reader = await launch(app);
        const r = reader.page;
        try {
            await step('nNoUrlPath', () => visit(r, app, 'n1-no-url-path-by-id', () => r.goto(at('view/17/3'))));
            await step('nNoUrlPathVersion', () => visit(r, app, 'n2-no-url-path-by-id-version', () => r.goto(at('view/17/version/18/3'))));
            await step('nOtherArticlesGalley', () => visit(r, app, 'n3-other-articles-galley', () => r.goto(at('view/17/version/18/1'))));
            await step('nUnpublishedVersion', () => visit(r, app, 'n4-unpublished-version-galley', () => r.goto(at('view/1/version/2/2'))));
            await step('nUnpublishedGalleyNoVersion', () => visit(r, app, 'n5-unpublished-galley-no-version', () => r.goto(at('view/1/2'))));
            await step('nOlderNoUrlPath', () => visit(r, app, 'n6-older-galley-no-url-path', () => r.goto(at('view/1/version/1/1'))));
        } finally {
            await reader.close();
        }
        const editor = await launch(app);
        try {
            await signIn(editor.page, 'dbarnes', {contextPath: ctx});
            await step('nEditorPreviewPath', () => visit(editor.page, app, 'n7-editor-preview-galley-by-path', () => editor.page.goto(at('view/1/version/2/pdf'))));
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
    const asEditor = async () => {
        await signIn(e, 'dbarnes', {contextPath: ctx});
        await frame.gotoEditorial(1);
        await frame.expectVersionLoaded().catch(() => {});
        await idle(e);
    };
    try {
        facts.dbStart = db();

        // 1. The editor previews version 1.1.
        await signIn(e, 'dbarnes', {contextPath: ctx});
        await step('s1', async () => {
            const pv = await pressPreview(e, app, frame, 1);
            record('step1-preview', await screen(pv.page));
            const out = {newTab: pv.newTab, ...(await readLanding(pv.page))};
            facts.previewPage = pv.page;
            return out;
        });
        console.log(`[fact] ojs step 1: ${JSON.stringify(facts.s1)}`);
        // 2. The same galley typed by its ID after the preview's address.
        const pv = facts.previewPage || e;
        delete facts.previewPage;
        const previewBase = (facts.s1 && facts.s1.url && facts.s1.url.match(/\/article\/view\/([^/]+)\/version\/2/)) ? facts.s1.url.match(/\/article\/view\/([^/]+)\/version\/2/)[1] : 'mwandenga-signalling-theory';
        await step('s2', () => visit(pv, app, 'step2-preview-galley-by-id', () => pv.goto(at(`view/${previewBase}/version/2/2`))));
        await step('c2Path', () => visit(pv, app, 'control2-preview-galley-by-path', () => pv.goto(at(`view/${previewBase}/version/2/pdf`))));
        if (pv !== e) await pv.close().catch(() => {});

        // 3. The editor publishes version 1.1.
        await step('s3', () => publishLatestVersion(e, app, frame, 1, 'step3'));
        console.log(`[fact] ojs step 3: ${JSON.stringify(facts.s3)}`);
        await signOut(e);

        // 4. Signed out: the article, "Versions", the older entry.
        await step('s4', async () => {
            await r.goto(at('view/mwandenga'));
            await idle(r);
            record('step4-current-page', await screen(r));
            const current = await readLanding(r);
            const older = current.versions[0];
            if (!older) throw new Error('no older version link on the current page');
            await r.locator(`a[href$="${older.href}"]`).first().click();
            await idle(r);
            record('step4-older-page', await screen(r));
            return {current, older: await readLanding(r)};
        });
        console.log(`[fact] ojs step 4: ${JSON.stringify(facts.s4)}`);
        // 5. Its "PDF": the galley's ID address while the galley has no URL Path.
        await step('s5', () => visit(r, app, 'step5-older-pdf', () => r.locator('a.obj_galley_link').filter({hasText: /PDF/}).first().click()));
        // Control: the current version (1.1) named by its version ID, its galley by its ID.
        await step('c5CurrentVersionId', () => visit(r, app, 'control5-current-version-galley-id', () => r.goto(at('view/mwandenga/version/2/2'))));

        // 6-7. The editor creates version 1.2 as offered and publishes it.
        await asEditor();
        await step('s6', () => createNewVersion(e, app, frame, 1, 'step6'));
        console.log(`[fact] ojs step 6: ${JSON.stringify(facts.s6)}`);
        await step('s7', () => publishLatestVersion(e, app, frame, 1, 'step7'));
        console.log(`[fact] ojs step 7: ${JSON.stringify(facts.s7)}`);
        await signOut(e);
        facts.dbAfter7 = db();

        // 8. Signed out: 1.1's galley (URL Path "pdf" from the start) by its ID.
        await step('s8View', () => visit(r, app, 'step8-v2-galley-id', () => r.goto(at('view/mwandenga/version/2/2'))));
        await step('s8Download', () => visit(r, app, 'step8-v2-galley-id-download', () => r.goto(at('download/mwandenga/version/2/2')), {download: true}));
        await step('c8Path', () => visit(r, app, 'control8-v2-galley-path', () => r.goto(at('view/mwandenga/version/2/pdf'))));
        await step('c8PathDownload', () => visit(r, app, 'control8-v2-galley-path-download', () => r.goto(at('download/mwandenga/version/2/pdf')), {download: true}));

        // 9. The editor: version 1.0's "PDF" galley, URL Path "pdf".
        await asEditor();
        await step('s9', () => setVersionGalleyUrlPath(e, app, frame, 'first', 'PDF', 'pdf', 'step9'));
        console.log(`[fact] ojs step 9: ${JSON.stringify(facts.s9)}`);
        await signOut(e);

        // 10-11. Signed out: the kept address, and its download twin.
        await step('s10', () => visit(r, app, 'step10-v1-galley-id', () => r.goto(at('view/mwandenga/version/1/1'))));
        await step('s11', () => visit(r, app, 'step11-v1-galley-id-download', () => r.goto(at('download/mwandenga/version/1/1')), {download: true}));
        const file1 = (facts.dbAfter7.galleys.find((g) => g.startsWith('1|')) || '').split('|')[4] || '';
        if (file1) {
            await step('s10File', () => visit(r, app, 'step10-v1-galley-id-file', () => r.goto(at(`view/mwandenga/version/1/1/${file1}`))));
            await step('s11File', () => visit(r, app, 'step11-v1-galley-id-file-download', () => r.goto(at(`download/mwandenga/version/1/1/${file1}`)), {download: true}));
        }
        await step('c10Path', () => visit(r, app, 'control10-v1-galley-path', () => r.goto(at('view/mwandenga/version/1/pdf'))));
        await step('c10OlderPage', async () => {
            await r.goto(at('view/mwandenga/version/1'));
            await idle(r);
            return readLanding(r);
        });

        // 12. The editor: the current version's galley loses its URL Path.
        await asEditor();
        await step('s12', () => setVersionGalleyUrlPath(e, app, frame, 'latest', 'PDF Version 2', '', 'step12'));
        console.log(`[fact] ojs step 12: ${JSON.stringify(facts.s12)}`);
        await signOut(e);
        facts.dbAfter12 = db();

        // 13. Signed out: the kept address once more, both operations; and 1.1's galley.
        await step('s13View', () => visit(r, app, 'step13-v1-galley-id', () => r.goto(at('view/mwandenga/version/1/1'))));
        await step('s13Download', () => visit(r, app, 'step13-v1-galley-id-download', () => r.goto(at('download/mwandenga/version/1/1')), {download: true}));
        await step('s13V2', () => visit(r, app, 'step13-v2-galley-id', () => r.goto(at('view/mwandenga/version/2/2'))));
        await step('s13V2Download', () => visit(r, app, 'step13-v2-galley-id-download', () => r.goto(at('download/mwandenga/version/2/2')), {download: true}));
    } finally {
        record('facts', facts);
        await reader.close();
        await editor.close();
    }
});
